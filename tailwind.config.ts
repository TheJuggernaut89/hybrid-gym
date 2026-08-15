import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tactical Telemetry substrate. Never pure #000 — a deactivated CRT.
        canvas: '#0A0A0A',
        surface: '#121212',
        raised: '#171717',
        edge: '#262626',
        edgeBright: '#3F3F3F',
        // White phosphor. This is the PRIMARY text colour, not gold.
        //
        // The ramp is measured against the LIGHTEST substrate it lands on
        // (#171717 raised), not the darkest. Measuring against canvas alone was
        // the earlier mistake: faint at #7A7A7A cleared 4.6:1 on #0A0A0A but
        // fell to 4.36:1 inside a Panel, which is `bg-surface` — and that is
        // where most faint text in this app actually lives.
        //
        // Measured in-browser on #171717: phosphor 14.9:1, dim 7.1:1, faint 4.7:1.
        phosphor: '#EAEAEA',
        dim: '#A3A3A3',
        faint: '#828282',
        // Brand accent. Vital data only — never chrome, never decoration.
        gold: '#FFC107',
        // Hazard. Danger and strain only.
        fight: '#FF2A2A',
        // Single-purpose: optimal muscle engagement + cleared objectives.
        engage: '#22C55E',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Arial Black', 'Impact', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // ── DATA & LABELS ──────────────────────────────────────────────
        // The industrial voice: uppercase, tracked, tabular. Never a sentence.
        // Tracking is legible here precisely because these are short, capital
        // fragments the eye scans rather than reads.
        micro: ['10px', { lineHeight: '1.4', letterSpacing: '0.16em' }],
        meta: ['11px', { lineHeight: '1.45', letterSpacing: '0.12em' }],
        data: ['13px', { lineHeight: '1.5', letterSpacing: '0.04em' }],

        // ── PROSE ──────────────────────────────────────────────────────
        // Sentences only, and the reason the app felt hard to read: running
        // text was set at 13px with tracking, in a monospace face whose
        // advance is already uniform. Extra tracking on top turns words into
        // character streams. Zero tracking, generous leading for a dark theme.
        read: ['15px', { lineHeight: '1.65', letterSpacing: '0' }],
        // 16px specifically: iOS Safari auto-zooms any focused input below it.
        lede: ['16px', { lineHeight: '1.6', letterSpacing: '0' }],
        // Macro-typography: fluid, massive, tight.
        h3: ['clamp(1.25rem, 5vw, 1.6rem)', { lineHeight: '0.95', letterSpacing: '-0.02em' }],
        h2: ['clamp(1.75rem, 8vw, 2.5rem)', { lineHeight: '0.9', letterSpacing: '-0.03em' }],
        h1: ['clamp(2.5rem, 12vw, 4rem)', { lineHeight: '0.85', letterSpacing: '-0.04em' }],
        hero: ['clamp(4.5rem, 26vw, 8rem)', { lineHeight: '0.78', letterSpacing: '-0.05em' }],
      },
      borderRadius: {
        DEFAULT: '0px',
        none: '0px',
        sm: '0px',
        md: '0px',
        lg: '0px',
        full: '0px',
      },
      keyframes: {
        'strain-pulse': {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '1' },
        },
        'engage-breathe': {
          '0%, 100%': { opacity: '0.45' },
          '50%': { opacity: '0.8' },
        },
        sweep: {
          '0%': { transform: 'translateY(-110%)' },
          '100%': { transform: 'translateY(1100%)' },
        },
        blink: {
          '0%, 45%': { opacity: '1' },
          '50%, 95%': { opacity: '0.15' },
        },
      },
      animation: {
        'strain-pulse': 'strain-pulse 0.85s steps(2, end) infinite',
        'engage-breathe': 'engage-breathe 2.4s ease-in-out infinite',
        sweep: 'sweep 3.2s linear infinite',
        blink: 'blink 1.6s steps(1, end) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
