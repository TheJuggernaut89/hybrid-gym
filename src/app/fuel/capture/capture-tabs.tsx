'use client';

import { useState } from 'react';
import { Camera, Mic } from 'lucide-react';
import { ScannerClient } from '@/app/scanner/scanner-client';
import { VoiceMeal } from './voice-meal';
import { cn } from '@/lib/utils';

/**
 * Two ways in, chosen up front.
 *
 * Voice used to be reachable only *after* photographing a plate, which meant
 * the one case it is most needed for — a meal you already ate and never
 * photographed — had no path at all. The choice belongs at the entry point.
 */
export function CaptureTabs({ conditions }: { conditions: string[] }) {
  const [mode, setMode] = useState<'photo' | 'voice'>('photo');

  const TABS = [
    { id: 'photo' as const, label: 'Photo', Icon: Camera, hint: 'Best at naming the dish' },
    { id: 'voice' as const, label: 'Voice', Icon: Mic, hint: 'Best at the portion' },
  ];

  return (
    <div className="space-y-3">
      <div className="rule-grid grid-cols-2 border border-edge" role="tablist">
        {TABS.map(({ id, label, Icon, hint }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={cn(
              'flex min-h-[52px] flex-col items-center justify-center gap-0.5 [touch-action:manipulation]',
              mode === id ? 'bg-gold text-canvas' : 'bg-canvas text-dim hover:text-phosphor',
            )}
          >
            <span className="flex items-center gap-1.5 font-mono text-data font-bold uppercase tracking-[0.14em]">
              <Icon size={14} />
              {label}
            </span>
            <span
              className={cn(
                'font-mono text-micro',
                mode === id ? 'text-canvas/80' : 'text-dim',
              )}
            >
              {hint}
            </span>
          </button>
        ))}
      </div>

      {mode === 'photo' ? (
        <ScannerClient lockedMode="nutrition_vision" conditions={conditions} />
      ) : (
        <VoiceMeal conditions={conditions} />
      )}
    </div>
  );
}
