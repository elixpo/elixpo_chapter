import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#fbfbf8', deep: '#eff1ed', soft: '#f5f6f2' },
        ink: { DEFAULT: '#142018', soft: '#24372b' },
        line: '#d7dbd6',
        bg: {
          deep: '#0a0c14',
          card: 'rgba(12, 16, 28, 0.8)',
          'card-glass': 'rgba(255,255,255,0.05)',
          'card-glass-hover': 'rgba(255,255,255,0.08)',
          overlay: 'rgba(10, 12, 20, 0.95)',
          surface: '#111',
          elevated: '#1a1a1a',
        },
        lime: {
          main: '#3a65c7',
          light: '#2f56b0',
          dim: 'rgba(58, 101, 199, 0.15)',
          border: 'rgba(58, 101, 199, 0.3)',
          glow: 'rgba(58, 101, 199, 0.6)',
        },
        sage: {
          main: '#5b82d8',
          dim: 'rgba(91, 130, 216, 0.15)',
          border: 'rgba(91, 130, 216, 0.3)',
        },
        honey: {
          main: '#2f56b0',
          dim: 'rgba(47, 86, 176, 0.15)',
          border: 'rgba(47, 86, 176, 0.3)',
        },
        lavender: {
          main: '#c4b5fd',
          light: '#d8b4fe',
          dim: 'rgba(196, 181, 253, 0.15)',
          border: 'rgba(168, 85, 247, 0.3)',
        },
        txt: {
          primary: '#f5f5f4',
          secondary: 'rgba(245, 245, 244, 0.8)',
          muted: 'rgba(245, 245, 244, 0.7)',
          subtle: 'rgba(255, 255, 255, 0.5)',
          disabled: 'rgba(255, 255, 255, 0.4)',
        },
        bdr: {
          light: 'rgba(255, 255, 255, 0.1)',
          medium: 'rgba(255, 255, 255, 0.15)',
          strong: 'rgba(255, 255, 255, 0.2)',
          hover: 'rgba(255, 255, 255, 0.3)',
        },
      },
      fontFamily: {
        body: ['Arial', 'Helvetica', 'sans-serif'],
        display: ['Arial', 'Helvetica', 'sans-serif'],
        sans: ['Arial', 'Helvetica', 'sans-serif'],
        serif: ['Georgia', '"Times New Roman"', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      letterSpacing: { display: '-0.065em', heading: '-0.05em', eyebrow: '0.19em' },
      borderRadius: { card: '1.4rem' },
      backgroundImage: {
        'gradient-card': 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
        'gradient-page': 'linear-gradient(135deg, #0a0c14 0%, #0c1018 50%, #0a0c14 100%)',
        'gradient-accent': 'linear-gradient(90deg, #444ce7, #6ea8fe, #818cf8)',
        'gradient-text-hero': 'linear-gradient(135deg, #f5f5f4 0%, #444ce7 30%, #6ea8fe 60%, #818cf8 100%)',
        'gradient-code': 'linear-gradient(135deg, #1a1b1c 0%, #212223 100%)',
      },
      boxShadow: {
        'card': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'card-hover': '0 20px 40px -10px rgba(0,0,0,0.4)',
        'card-lg': '0 25px 50px -10px rgba(0,0,0,0.5)',
        'glow-lime': '0 0 20px rgba(58, 101, 199, 0.6)',
        'button': '0 8px 25px rgba(0,0,0,0.3)',
      },
      animation: {
        'sparkle': 'rotate 1.5s linear infinite',
        'dots': 'dots 1.5s infinite',
      },
      keyframes: {
        rotate: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        dots: {
          '0%, 20%': { opacity: '0' },
          '50%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
