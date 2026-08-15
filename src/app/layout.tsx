import type { Metadata, Viewport } from 'next';
import { Archivo_Black, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { RegisterSW } from '@/components/pwa/register-sw';

// Heavy neo-grotesque. At scale with negative tracking it forms solid
// architectural blocks — Teko was too light and too "sporty" to carry the
// macro-typography this design leans on.
const display = Archivo_Black({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'HYBRID COMBATIVE // PLAYER HUD',
  description:
    'Brutalist combat-fitness HUD for Hybrid Combative Damansara. Gym OCR, shadow-dojo form tracking, and localized RPG progression.',
  manifest: '/manifest.webmanifest',
  applicationName: 'HYBRID HUD',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'HYBRID HUD',
  },
  icons: {
    icon: [{ url: '/icons/bull.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/bull.svg' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0B0B0B',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="min-h-[100dvh] bg-canvas text-phosphor antialiased">
        <div className="min-h-[100dvh]">{children}</div>
        {/* Simulated hardware limits — see globals.css. Both are removed under
            prefers-reduced-motion. */}
        <div className="grain-overlay" aria-hidden />
        <div className="crt-overlay" aria-hidden />
        <RegisterSW />
      </body>
    </html>
  );
}
