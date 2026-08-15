import Link from 'next/link';
import { BullSkull } from '@/components/hud/crest';
import { Barcode } from '@/components/ui/industrial';

export function TopBar({
  title,
  subtitle,
  demo = false,
  right,
}: {
  title: string;
  subtitle?: string;
  demo?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-canvas/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-3 pb-2 pt-2.5">
        <Link
          href="/hud"
          className="-my-1 flex min-h-11 min-w-0 items-center gap-2.5 py-1 [touch-action:manipulation]"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center border border-gold">
            <BullSkull size={17} />
          </span>
          <span className="min-w-0">
            <span className="display block truncate text-h3 leading-none text-phosphor">
              {title}
            </span>
            {subtitle ? (
              <span className="mt-0.5 block truncate font-mono text-micro uppercase text-faint">
                {subtitle}
              </span>
            ) : null}
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          {demo ? (
            <span className="border border-fight px-1.5 py-0.5 font-mono text-micro uppercase text-fight">
              Demo
            </span>
          ) : null}
          {right}
        </div>
      </div>
      <Barcode seed={11} bars={60} className="h-1.5 px-3 pb-1 opacity-60" />
    </header>
  );
}
