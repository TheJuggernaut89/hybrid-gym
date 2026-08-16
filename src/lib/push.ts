/**
 * Web Push client helpers.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ON ASKING FOR PERMISSION
 *
 * The prompt is fired exactly once, from a deliberate tap, and never on page
 * load. A denied Notification permission is effectively permanent — the
 * browser stops showing the prompt and the member has to dig through site
 * settings to undo it — so a badly-timed ask does not cost you one nudge, it
 * costs you the channel for that member forever.
 *
 * So the ask is attached to declaring a slot: the member has just said they
 * intend to be somewhere, which is the one moment a reminder is obviously for
 * them rather than for the gym.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type PushSupport = 'ready' | 'unsupported' | 'denied' | 'default' | 'granted';

/**
 * iOS is the sharp edge: Safari only exposes the Push API to a web app that
 * has been ADDED TO THE HOME SCREEN. In a normal Safari tab
 * `window.PushManager` is simply absent, so the correct response is to explain
 * the install step rather than to show a broken toggle.
 */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (!('Notification' in window)) return 'unsupported';

  const p = Notification.permission;
  if (p === 'denied') return 'denied';
  if (p === 'granted') return 'granted';
  return 'default';
}

/** True when the page is running as an installed PWA rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    // iOS Safari's non-standard flag.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * VAPID keys are base64url; PushManager wants raw bytes.
 *
 * The buffer is allocated explicitly so the result is a `Uint8Array<ArrayBuffer>`
 * rather than `Uint8Array<ArrayBufferLike>` — the latter could be backed by a
 * SharedArrayBuffer and so does not satisfy `BufferSource`.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalised);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export interface SubscribeResult {
  ok: boolean;
  message: string;
}

export async function subscribeToPush(vapidPublicKey: string): Promise<SubscribeResult> {
  const support = pushSupport();

  if (support === 'unsupported') {
    if (isIos() && !isStandalone()) {
      return {
        ok: false,
        message: 'On iPhone, add this to your Home Screen first — Share, then Add to Home Screen.',
      };
    }
    return { ok: false, message: 'This browser cannot do reminders.' };
  }
  if (support === 'denied') {
    return {
      ok: false,
      message: 'Notifications are blocked. Turn them back on in your browser settings for this site.',
    };
  }
  if (!vapidPublicKey) {
    return { ok: false, message: 'Reminders are not configured on this server yet.' };
  }

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();

  if (permission !== 'granted') {
    return { ok: false, message: 'No reminders then. You can turn them on later.' };
  }

  try {
    const reg = await navigator.serviceWorker.ready;

    // Reuse an existing subscription rather than minting a second one for the
    // same browser — resubscribing would orphan the old endpoint server-side.
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }));

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!res.ok) return { ok: false, message: 'Could not save the reminder setting.' };

    return { ok: true, message: 'Reminders on. You will get a nudge before your slot.' };
  } catch {
    return { ok: false, message: 'Could not set up reminders.' };
  }
}

export async function unsubscribeFromPush(): Promise<SubscribeResult> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return { ok: true, message: 'Reminders already off.' };

    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
    return { ok: true, message: 'Reminders off.' };
  } catch {
    return { ok: false, message: 'Could not turn reminders off.' };
  }
}

/*
 * reminderCopy() used to live here, duplicating the copy in the Edge Function
 * at supabase/functions/slot-reminders/index.ts, with a comment on each asking
 * whoever edited one to remember the other.
 *
 * Nothing imported it. Pushes are sent server-side by the scheduled function
 * and never from the browser, so this copy was unreachable — a standing
 * obligation to maintain two things in sync, one of which did nothing. The
 * sender owns the copy now.
 */
