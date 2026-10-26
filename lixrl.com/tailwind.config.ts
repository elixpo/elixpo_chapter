import type { Config } from 'tailwindcss';
import { palette } from './theme.js';

// Design tokens follow research.elixpo: warm paper surfaces, deep green-black
// ink, a single blue accent for eyebrows/links/focus, and pill-shaped actions.
// The raw values live in theme.js so non-Tailwind code (charts, canvas, QR
// rendering) can import the same palette.
const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: palette.paper, deep: palette.paperDeep, soft: palette.paperSoft },
        ink: { DEFAULT: palette.ink, soft: palette.inkSoft },
        line: palette.line,
        bg: {
          deep: palette.paper,
          card: '#ffffff',
          glass: palette.paperSoft,
          'glass-hover': palette.paperDeep,
          overlay: 'rgba(251,251,248,0.96)',
        },
        accent: {
          main: palette.blue,
          deep: palette.blueDeep,
          light: '#5b82d8',
          wash: palette.blueWash,
          dim: 'rgba(58, 101, 199, 0.1)',
          border: 'rgba(58, 101, 199, 0.25)',
          glow: 'rgba(58, 101, 199, 0.25)',
        },
        green: { DEFAULT: palette.green },
        orange: { DEFAULT: palette.orange },
        pastel: palette.pastel,
        text: {
          primary: palette.ink,
          secondary: palette.muted,
          muted: palette.muted,
          subtle: '#68716b',
          disabled: '#8a928c',
        },
        border: {
          light: palette.line,
          medium: palette.line,
          strong: '#c3c9c3',
          hover: 'rgba(20, 32, 24, 0.35)',
        },
      },
      fontFamily: {
        sans: ['Arial', 'Helvetica', 'sans-serif'],
        serif: ['Georgia', '"Times New Roman"', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        display: '-0.065em',
        heading: '-0.05em',
        eyebrow: '0.19em',
      },
      borderRadius: {
        card: '1.4rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(20, 32, 24, 0.04)',
        'card-hover': '0 20px 50px rgba(24, 38, 28, 0.09)',
        header: '0 18px 48px rgba(20, 32, 24, 0.09)',
        object: '0 28px 80px rgba(24, 38, 28, 0.16)',
        'glow-accent': '0 0 0 3px rgba(58, 101, 199, 0.18)',
        button: '0 12px 30px rgba(20, 32, 24, 0.14)',
      },
      backgroundImage: {
        'gradient-card': 'linear-gradient(135deg, #ffffff 0%, #fbfbf8 100%)',
        'gradient-accent': `linear-gradient(135deg, ${palette.ink} 0%, ${palette.ink} 100%)`,
        'gradient-accent-hover': 'linear-gradient(135deg, #24372b 0%, #24372b 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
