import Link from 'next/link';
import { HazardBar } from '@/components/ui/industrial';
import type { Offer } from '@/lib/offers';
import type { LoadState } from '@/lib/session';

/**
 * Class recommendations.
 *
 * Two rules are visible in the markup on purpose:
 *
 *  1. When `vetoAdvice` is present there are no offers at all — the load model
 *     said this member is ramping or grinding, and the commercial layer is
 *     silenced rather than merely down-ranked. They still get guidance; it is
 *     just the guidance that is true, which is to back off.
 *
 *  2. Anything that costs money is labelled. A recommendation that hides its
 *     price is an advert wearing a coaching hat, and members work that out
 *     faster than product teams expect.
 */
export function OfferPanel({
  offers,
  veto,
  load,
}: {
  offers: Offer[];
  veto: string | null;
  load: LoadState;
}) {
  if (veto) {
    return (
      <section className="border-b border-edge bg-surface">
        <HazardBar tone="gold" />
        <div className="px-3 py-2.5">
          <div className="font-mono text-micro uppercase tracking-[0.18em] text-gold">
            {'>>'} Hold here
          </div>
          <p className="mt-1.5 font-mono text-read text-phosphor">{veto}</p>
          <p className="mt-1.5 font-mono text-read text-dim">
            {load.acute} AU this week against a {load.chronic} AU baseline
            {load.monotony !== null ? ` · monotony ${load.monotony.toFixed(1)}` : ''}
          </p>
        </div>
      </section>
    );
  }

  if (offers.length === 0) return null;

  return (
    <section className="border-b border-edge">
      <div className="flex items-baseline justify-between px-3 py-2">
        <span className="font-mono text-micro uppercase tracking-[0.18em] text-gold">
          {'>>'} Worth adding
        </span>
        <span className="font-mono text-micro uppercase text-dim">
          From your last 28 days
        </span>
      </div>

      <ul className="rule-grid grid-cols-1 border-t border-edge">
        {offers.map((o) => (
          <li key={o.kind} className="bg-canvas px-3 py-2.5">
            <div className="flex items-baseline gap-2">
              <h3 className="display min-w-0 flex-1 text-h3 leading-[1.05] text-phosphor">
                {o.headline}
              </h3>
              <span
                className={
                  o.paid
                    ? 'shrink-0 border border-gold px-1.5 py-0.5 font-mono text-micro uppercase tracking-[0.14em] text-gold'
                    : 'shrink-0 border border-edgeBright px-1.5 py-0.5 font-mono text-micro uppercase tracking-[0.14em] text-dim'
                }
              >
                {o.paid ? 'Costs' : 'Free'}
              </span>
            </div>

            {/* The evidence, always. Never "you should" — the member can check
                this against their own memory of the last month. */}
            <p className="mt-1 font-mono text-read text-dim">{o.because}</p>

            <Link
              href="/now#declare"
              className="mt-2 inline-flex min-h-11 items-center font-mono text-micro font-bold uppercase tracking-[0.14em] text-gold [touch-action:manipulation]"
            >
              {o.action} →
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
