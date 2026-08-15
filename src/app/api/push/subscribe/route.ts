import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stores (or removes) a Web Push subscription for the signed-in member.
 *
 * The endpoint is the subscription's identity and is unique per browser
 * install, so a member with a phone and a laptop legitimately has two rows.
 * Upserting on endpoint means re-subscribing after a permission reset replaces
 * the old row rather than accumulating dead ones.
 */

interface PushSubscriptionBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured) {
    // Demo mode has no persistence; report honestly rather than pretending.
    return NextResponse.json({ status: 'demo', message: 'Not persisted in demo mode.' });
  }

  let body: PushSubscriptionBody;
  try {
    body = (await request.json()) as PushSubscriptionBody;
  } catch {
    return NextResponse.json({ status: 'error', message: 'Malformed body.' }, { status: 400 });
  }

  const endpoint = body.endpoint?.trim();
  const p256dh = body.keys?.p256dh?.trim();
  const auth = body.keys?.auth?.trim();

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { status: 'error', message: 'endpoint and keys are required.' },
      { status: 400 },
    );
  }

  const supabase = createClient();
  if (!supabase) {
    return NextResponse.json({ status: 'error', message: 'No database.' }, { status: 500 });
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return NextResponse.json({ status: 'error', message: 'Not signed in.' }, { status: 401 });
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      fighter_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
      failed_at: null,
    },
    { onConflict: 'endpoint' },
  );

  if (error) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
  return NextResponse.json({ status: 'success' });
}

/** Unsubscribing must actually delete, or the sender keeps pushing to a ghost. */
export async function DELETE(request: Request) {
  if (!isSupabaseConfigured) return NextResponse.json({ status: 'demo' });

  let body: PushSubscriptionBody;
  try {
    body = (await request.json()) as PushSubscriptionBody;
  } catch {
    return NextResponse.json({ status: 'error', message: 'Malformed body.' }, { status: 400 });
  }
  const endpoint = body.endpoint?.trim();
  if (!endpoint) {
    return NextResponse.json({ status: 'error', message: 'endpoint required.' }, { status: 400 });
  }

  const supabase = createClient();
  if (!supabase) return NextResponse.json({ status: 'error' }, { status: 500 });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ status: 'error', message: 'Not signed in.' }, { status: 401 });
  }

  // RLS scopes this to the caller's own rows.
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  return NextResponse.json({ status: 'success' });
}
