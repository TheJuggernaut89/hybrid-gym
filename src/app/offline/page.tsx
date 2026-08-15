export const metadata = { title: 'OFFLINE // HYBRID HUD' };

export default function OfflinePage() {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-6 text-center">
      <div className="max-w-sm border border-edge bg-surface p-6">
        <h1 className="text-h1 text-fight">SIGNAL LOST</h1>
        <p className="mt-3 font-sans text-read text-dim">
          Gym Mode needs a connection — OCR and nutrition vision run server-side.
          <br />
          <br />
          Form Check runs entirely on-device once loaded, so if the page is already
          cached you can keep drilling. Everything syncs when you&rsquo;re back.
        </p>
        <div className="mt-5 border-t border-edge pt-3 font-mono text-micro tracking-[0.2em] text-faint">
          HYBRID COMBATIVE // DAMANSARA
        </div>
      </div>
    </main>
  );
}
