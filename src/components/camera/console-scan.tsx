'use client';

import { useRef, useState } from 'react';
import { ScanLine, X } from 'lucide-react';
import { useCamera, fileToBase64Jpeg } from '@/components/camera/use-camera';
import { HazardBar } from '@/components/ui/industrial';
import { cn } from '@/lib/utils';
import type { EquipmentOcrData, VisionEnvelope } from '@/lib/types';

/**
 * Reads a cardio console and hands back the minutes.
 *
 * This used to be a whole top-level tab. It stopped deserving one when XP moved
 * off calories onto duration x RPE: the only thing OCR uniquely produced was a
 * calorie figure, and once that stopped counting, all it contributes is a
 * number the member could type in one tap. Photographing a screen to avoid
 * typing "30" is worse UX than typing "30".
 *
 * So it survives as a shortcut where it is actually useful — inside the ENGINE
 * session type, saving you from squinting at a console and doing the mental
 * arithmetic on 34:17.
 */
export function ConsoleScan({
  onMinutes,
  onClose,
}: {
  onMinutes: (minutes: number, label: string) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const { videoRef, state, error, start, stop, capture } = useCamera({ autoStart: true });

  async function send(base64: string) {
    setBusy(true);
    setNote('');
    stop();
    try {
      const res = await fetch('/api/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'equipment_ocr',
          imageBase64: base64,
          mimeType: 'image/jpeg',
        }),
      });
      const payload = (await res.json()) as
        | VisionEnvelope<EquipmentOcrData>
        | { status: 'error'; message: string };

      if (!res.ok || payload.status === 'error') {
        setNote('message' in payload ? payload.message : 'Could not read that console.');
        void start();
        return;
      }

      const data = payload.data as EquipmentOcrData;
      const minutes = Math.round(Number(data.active_minutes) || 0);
      if (minutes <= 0) {
        setNote('Could not read the time. Type it in instead.');
        void start();
        return;
      }
      onMinutes(minutes, data.equipment_type.replace(/_/g, ' '));
    } catch {
      setNote('Network dropped.');
      void start();
    } finally {
      setBusy(false);
    }
  }

  function shutter() {
    const shot = capture();
    if (!shot) {
      setNote('Could not grab a frame. Use upload.');
      return;
    }
    void send(shot.base64);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const shot = await fileToBase64Jpeg(file);
      void send(shot.base64);
    } catch {
      setNote('Could not read that file.');
    }
  }

  return (
    <section className="border border-edge bg-surface">
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <span className="font-mono text-micro uppercase tracking-[0.18em] text-gold">
          {'>>'} Point at the console
        </span>
        <button
          type="button"
          onClick={() => {
            stop();
            onClose();
          }}
          aria-label="Close console scan"
          className="flex min-h-11 min-w-11 items-center justify-center text-dim [touch-action:manipulation] hover:text-phosphor"
        >
          <X size={16} />
        </button>
      </div>

      <div className="relative aspect-[4/3] w-full bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full object-cover"
          aria-label="Console camera"
        />
        {state !== 'live' ? (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center font-mono text-micro uppercase leading-relaxed text-dim">
            {state === 'denied'
              ? 'Camera blocked — use upload, or just type the minutes.'
              : state === 'unsupported'
                ? 'No camera here. Type the minutes instead.'
                : busy
                  ? 'Reading…'
                  : 'Starting camera…'}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-px bg-edge">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="min-h-11 bg-canvas font-mono text-micro uppercase tracking-[0.14em] text-dim [touch-action:manipulation] disabled:opacity-50"
        >
          Upload instead
        </button>
        <button
          type="button"
          onClick={shutter}
          disabled={busy || state !== 'live'}
          className={cn(
            'flex min-h-11 items-center justify-center gap-1.5 bg-gold font-mono text-micro font-bold uppercase tracking-[0.14em] text-canvas [touch-action:manipulation]',
            (busy || state !== 'live') && 'opacity-50',
          )}
        >
          <ScanLine size={14} />
          {busy ? 'Reading…' : 'Read it'}
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={onFile}
        className="hidden"
        aria-hidden
      />

      {note || error ? (
        <>
          <HazardBar tone="gold" />
          <p className="px-3 py-2 font-mono text-read text-dim">
            {note || error}
          </p>
        </>
      ) : null}
    </section>
  );
}
