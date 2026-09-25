import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        vault: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          800: '#1b1d22',
          850: '#16181d',
          900: '#101216',
          950: '#0a0b0d',
        },
        acid: {
          DEFAULT: '#c6ff00',
          hover: '#b5ea00',
          dark: '#8fa800',
          glow: 'rgba(198, 255, 0, 0.25)',
        },
        glass: {
          surface: 'rgba(255, 255, 255, 0.03)',
          border: 'rgba(255, 255, 255, 0.08)',
          'surface-light': 'rgba(255, 255, 255, 0.65)',
          'border-light': 'rgba(0, 0, 0, 0.08)',
          highlight: 'rgba(255, 255, 255, 0.15)',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
        glass: '16px',
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glass-light': '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
        glow: '0 0 35px -5px rgba(198, 255, 0, 0.3)',
      },
    },
  },
  plugins: [],
};

export default config;
