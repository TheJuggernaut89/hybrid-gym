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
  /** Null for a floor or cardio declaration — there is no coach. */
  coach_name: string | null;
  scheduled_for: string;
  phase: 'approaching' | 'imminent';
}

/**
 * The reminder copy. This is the only copy of it.
 *
 * There used to be a second implementation, reminderCopy() in src/lib/push.ts,
 * with a comment on each asking the reader to keep them in sync. Nothing
 * imported it — the app never sends a push from the client — so it was a
 * maintenance obligation attached to dead code. Deleted rather than deduped.
 *
 * Written to solve the friction rather than to moralise — a notification that
 * says "don't skip!" is one the member turns off, and a turned-off channel
 * cannot be re-earned.
 */
function copyFor(row: DueRow, minutesOut: number): { title: string; body: string } {
  if (row.phase === 'imminent') {
    return {
      title: `${row.class_name} in ${minutesOut} min`,
      // The whole T-30 nudge was "a named person is expecting you", which is
      // the mechanism and not decoration. Nobody is expecting you at a squat
      // rack, so a floor session needs its own reason to leave the house
      // rather than "null is expecting you. Bag packed?".
      body: row.coach_name
        ? `${row.coach_name} is expecting you. Bag packed?`
        : 'You put this in the diary. Keys, water, go.',
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

  /*
   * THE NOD, for the push.
   *
   * Done as a second query rather than as extra columns on due_slot_reminders,
   * because changing that function's return type needs DROP FUNCTION — `create
   * or replace` cannot widen a returns-table — and dropping it discards every
   * grant, including the revoke/grant set migration 008 exists to establish.
   * Not worth it for a suffix on a notification body.
   *
   * Runs as service_role, so it reads across members directly; the gym_mates
   * RPC deliberately refuses a null auth.uid() and is for the app only.
   */
  const MIN_NOD = 3;
  const matesFor = new Map<string, string[]>();

  const instants = Array.from(new Set(rows.map((r) => r.scheduled_for)));
  if (instants.length > 0) {
    const { data: mateRows } = await supabase
      .from('slot_declarations')
      .select('scheduled_for, fighter_id, fighters!inner(nickname, visible_to_gym)')
      .eq('status', 'declared')
      .in('scheduled_for', instants);

    type MateRow = {
      scheduled_for: string;
      fighter_id: string;
      fighters: { nickname: string | null; visible_to_gym: boolean } | null;
    };

    const byInstant = new Map<string, Array<{ id: string; nick: string }>>();
    for (const m of (mateRows ?? []) as unknown as MateRow[]) {
      const nick = m.fighters?.nickname?.trim();
      if (!m.fighters?.visible_to_gym || !nick) continue;
      const key = new Date(m.scheduled_for).toISOString();
      const list = byInstant.get(key) ?? [];
      list.push({ id: m.fighter_id, nick });
      byInstant.set(key, list);
    }

    // Same cohort floor as gym_mates. Below it the absence of a name identifies
    // the person who did not come, so nothing is said at all.
    for (const [key, list] of byInstant) {
      if (list.length >= MIN_NOD) matesFor.set(key, list.map((l) => `${l.id}:${l.nick}`));
    }
  }

  let sent = 0;
  let pruned = 0;
  let released = 0;

  await Promise.all(
    rows.map(async (row) => {
      const minutesOut = Math.max(
        1,
        Math.round((new Date(row.scheduled_for).getTime() - now) / 60_000),
      );
      const { title, body: baseBody } = copyFor(row, minutesOut);

      // "and two others you train with are going" is the part with actual
      // evidence behind it. Own name stripped — being told you are going is not
      // social proof.
      const others = (matesFor.get(new Date(row.scheduled_for).toISOString()) ?? [])
        .filter((entry) => !entry.startsWith(`${row.fighter_id}:`))
        .map((entry) => entry.slice(entry.indexOf(':') + 1));

      const body =
        others.length > 0
          ? `${baseBody} ${others.slice(0, 2).join(', ')}${
              others.length > 2 ? ` +${others.length - 2}` : ''
            } booked it too.`
          : baseBody;

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
            // Safe now that due_slot_reminders() claims each (declaration,
            // phase, endpoint) before handing it over: this fires once, so it
            // alerts once. It used to fire on every tick inside the ten-minute
            // band, which is an explicit instruction to buzz the member three
            // times for one class.
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
          // Claim deliberately left in place: the subscription is gone, so
          // there is nothing to retry against.
          return;
        }

        // Anything else — a timeout, a 5xx from the push service — is worth
        // another go. Hand the claim back so the next tick can pick it up while
        // the declaration is still inside its band.
        await supabase.rpc('release_slot_notification', {
          p_declaration_id: row.declaration_id,
          p_phase: row.phase,
          p_endpoint: row.endpoint,
        });
        released++;
      }
    }),
  );

  // `due` counts what this run CLAIMED, not what matched the time bands. A run
  // that returns 0 mid-band is the dedup working, not the sender failing.
  return Response.json({ due: rows.length, sent, pruned, released });
});
