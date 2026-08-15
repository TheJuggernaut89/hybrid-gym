import { HazardBar } from '@/components/ui/industrial';
import { DISCLAIMER, type Flag, type Severity } from '@/lib/contraindications';
import { cn } from '@/lib/utils';

const TONE: Record<Severity, { label: string; text: string; border: string; hazard: 'fight' | 'gold' | null }> = {
  avoid:   { label: 'Do not proceed on this app’s word', text: 'text-fight',    border: 'border-fight',    hazard: 'fight' },
  caution: { label: 'Known trigger for a declared condition', text: 'text-gold', border: 'border-gold',    hazard: 'gold' },
  monitor: { label: 'Worth knowing',                          text: 'text-dim',  border: 'border-edgeBright', hazard: null },
};

/**
 * Renders contraindication flags.
 *
 * Deliberately not a dismissible toast: this appears inline, above the number
 * it qualifies, and stays there. A warning you can swipe away before reading is
 * decoration.
 */
export function ScreenNotice({ flags, className }: { flags: Flag[]; className?: string }) {
  if (flags.length === 0) return null;

  const worst = flags[0].interaction.severity;
  const tone = TONE[worst];

  return (
    <section
      className={cn('border border-edge bg-surface', className)}
      // Not role="alert" — this renders on load, and a page-load alert is
      // announced over whatever the user was already reading.
      aria-labelledby="screen-notice-title"
    >
      {tone.hazard ? <HazardBar tone={tone.hazard} /> : null}

      <div className="flex items-baseline justify-between border-b border-edge px-3 py-2">
        <h2
          id="screen-notice-title"
          className={cn('font-mono text-micro uppercase tracking-[0.18em]', tone.text)}
        >
          {'>>'} Interaction screen
        </h2>
        {/* text-dim, not text-faint: faint (#7A7A7A) clears AA on the page
            canvas but only reaches 4.36:1 on this raised surface. Hierarchy
            here comes from size and tracking instead. */}
        <span className="telemetry shrink-0 font-mono text-micro text-dim">
          {String(flags.length).padStart(2, '0')} FLAGGED
        </span>
      </div>

      <ul className="divide-y divide-edge">
        {flags.map((f) => {
          const t = TONE[f.interaction.severity];
          return (
            <li key={f.interaction.id} className="px-3 py-2.5">
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    'shrink-0 border px-1.5 py-0.5 font-mono text-micro uppercase tracking-[0.14em]',
                    t.text,
                    t.border,
                  )}
                >
                  {f.interaction.severity}
                </span>
                <h3 className="display min-w-0 flex-1 text-h3 leading-[1.05] text-phosphor">
                  {f.interaction.triggerLabel}
                </h3>
              </div>

              <p className="mt-1.5 font-mono text-meta uppercase text-dim">
                {f.interaction.conditionLabel} — you declared &ldquo;{f.matchedCondition}&rdquo;
              </p>

              <p className="mt-1.5 border-l-2 border-edgeBright pl-2 font-mono text-read text-dim">
                {f.interaction.note}
              </p>
            </li>
          );
        })}
      </ul>

      {/* A safety disclaimer that fails contrast is not a disclaimer. */}
      <p className="border-t border-edge px-3 py-2.5 font-mono text-read text-dim">
        {DISCLAIMER}
      </p>
    </section>
  );
}
