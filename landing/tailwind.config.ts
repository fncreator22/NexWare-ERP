import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Nimbus Sans TW01"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        brand: {
          DEFAULT: '#f59e0b', // Industrial Safety Amber
          light:   '#fbbf24',
          dark:    '#d97706',
          orange:  '#f97316',
        },
        carbon: {
          950: '#060709',
          900: '#0a0c10',
          850: '#0f1217',
          800: '#141820',
          750: '#191e28',
          700: '#212734',
          600: '#2d3546',
        },
        safety: {
          amber:   '#f59e0b',
          orange:  '#f97316',
          cyan:    '#06b6d4',
          emerald: '#10b981',
          rose:    '#f43f5e',
        },
      },
      animation: {
        'fade-up':   'fade-up   0.9s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-down': 'fade-down 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
        'hero-rise': 'hero-rise 1.1s cubic-bezier(0.22, 1, 0.36, 1) both',
        'pulse-subtle': 'pulse-subtle 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(24px)', filter: 'blur(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)',    filter: 'blur(0)'   },
        },
        'fade-down': {
          from: { opacity: '0', transform: 'translateY(-16px)' },
          to:   { opacity: '1', transform: 'translateY(0)'     },
        },
        'hero-rise': {
          from: { opacity: '0', transform: 'translateY(64px) scale(0.97)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)'       },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
