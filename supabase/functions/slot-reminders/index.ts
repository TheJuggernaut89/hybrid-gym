/**
 * SLOT REMINDERS — the sender.
 *
 * Runs on a schedule (pg_cron, every 5 minutes) and pushes the two reminders
 * THE SLOT already knows how to compute but previously had no way to deliver.
 * Before this existed the app was pull-only: the T-90 and T-30 phases rendered
 * only for someone who had already opened it, which is never the person
 * deciding not to come.
 *
 * Deploy WITH JWT verification (the default). Deploying --no-verify-jwt would
 * leave the endpoint open to anyone on the internet: they could not read data,
 * but they could trigger sends at will.
 *
 *   supabase functions deploy slot-reminders
 *   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@gym.com
 *
 * The scheduled caller authenticates with the service-role key. See DEPLOY.md
 * step 6 for the cron definition — the key is read from Vault rather than
 * pasted into the job body, so it is not sitting in cron.job in plain text.
 *
 * Runs with the service-role key because due_slot_reminders() deliberately
 * reads across members and is revoked from `authenticated`.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

interface DueRow {
  fighter_id: string;
  declaration_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  class_name: string;
  coach_name: string;
  scheduled_for: string;
  phase: 'approaching' | 'imminent';
}

/**
 * Kept in sync with reminderCopy() in src/lib/push.ts.
 *
 * Written to solve the friction rather than to moralise — a notification that
 * says "don't skip!" is one the member turns off, and a turned-off channel
 * cannot be re-earned.
 */
function copyFor(row: DueRow, minutesOut: number): { title: string; body: string } {
  if (row.phase === 'imminent') {
    return {
      title: `${row.class_name} in ${minutesOut} min`,
      body: `${row.coach_name} is expecting you. Bag packed?`,
    };
  }
  const h = Math.floor(minutesOut / 60);
  const m = minutesOut % 60;
  return {
    title: `${row.class_name} in ${h}h${m ? ` ${m}m` : ''}`,
    body: 'You booked it. Leave when you planned and the traffic is somebody else\'s problem.',
  };
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:coach@example.com';

  if (!supabaseUrl || !serviceKey || !publicKey || !privateKey) {
    return Response.json({ error: 'missing configuration' }, { status: 500 });
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data, error } = await supabase.rpc('due_slot_reminders');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as DueRow[];
  const now = Date.now();

  let sent = 0;
  let pruned = 0;

  await Promise.all(
    rows.map(async (row) => {
      const minutesOut = Math.max(
        1,
        Math.round((new Date(row.scheduled_for).getTime() - now) / 60_000),
      );
      const { title, body } = copyFor(row, minutesOut);

      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          JSON.stringify({
            title,
            body,
            // Tagging by declaration + phase means the T-30 reminder REPLACES
            // the T-90 one rather than stacking a second notification for the
            // same class.
            tag: `slot-${row.declaration_id}`,
            renotify: row.phase === 'imminent',
            url: '/now',
          }),
        );
        sent++;
      } catch (err) {
        // 404/410 mean the browser threw the subscription away. Retrying
        // forever is how a sender quietly turns into a cron job that does
        // nothing but log failures.
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', row.endpoint);
          pruned++;
        }
      }
    }),
  );

  return Response.json({ due: rows.length, sent, pruned });
});
