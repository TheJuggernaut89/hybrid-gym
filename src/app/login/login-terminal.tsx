'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { siteUrl } from '@/lib/supabase/config';
import { Button } from '@/components/ui/button';

type Phase = 'idle' | 'sending' | 'sent' | 'error';

export function LoginTerminal({
  next,
  initialError,
}: {
  next?: string;
  initialError?: string;
}) {
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<Phase>(initialError ? 'error' : 'idle');
  const [message, setMessage] = useState(initialError ?? '');

  async function sendLink(event: React.FormEvent) {
    event.preventDefault();
    if (!email.includes('@')) {
      setPhase('error');
      setMessage('That is not an email address.');
      return;
    }

    setPhase('sending');
    setMessage('');

    try {
      const supabase = createClient();
      const redirectTo = `${siteUrl()}/auth/callback${
        next ? `?next=${encodeURIComponent(next)}` : ''
      }`;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setPhase('sent');
    } catch (error) {
      setPhase('error');
      setMessage(error instanceof Error ? error.message : 'Link dispatch failed.');
    }
  }

  if (phase === 'sent') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        className="border border-engage bg-surface p-5"
      >
        <h2 className="text-h2 text-engage">LINK DISPATCHED</h2>
        <p className="mt-2 font-mono text-read text-dim">
          Check <span className="text-phosphor">{email}</span>. Tap the magic link on this
          device to drop into the HUD.
        </p>
        <button
          type="button"
          onClick={() => setPhase('idle')}
          className="mt-4 font-mono text-meta tracking-[0.2em] text-dim underline underline-offset-4 hover:text-gold"
        >
          USE A DIFFERENT EMAIL
        </button>
      </motion.div>
    );
  }

  return (
    <form onSubmit={sendLink} className="border border-edge bg-surface">
      <div className="border-b border-edge px-3 py-2">
        <span className="font-mono text-meta tracking-[0.2em] text-dim">
          AUTH // MAGIC LINK
        </span>
      </div>

      <div className="p-4">
        <label
          htmlFor="email"
          className="block font-mono text-meta tracking-[0.2em] text-dim"
        >
          &gt; FIGHTER EMAIL
        </label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-2 w-full border border-edge bg-canvas px-3 py-3 font-mono text-read text-phosphor outline-none placeholder:text-faint focus:border-gold"
        />

        {phase === 'error' && message ? (
          <p className="mt-3 border-l-2 border-fight pl-2 font-mono text-read text-fight">
            {message}
          </p>
        ) : null}

        <Button type="submit" block className="mt-4" disabled={phase === 'sending'}>
          {phase === 'sending' ? 'DISPATCHING…' : 'REQUEST ACCESS'}
        </Button>

        <p className="mt-3 font-mono text-read text-dim">
          No password. One link, one session. It expires — don&rsquo;t sit on it.
        </p>
      </div>
    </form>
  );
}
