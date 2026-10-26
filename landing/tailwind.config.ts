import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Nimbus Sans TW01"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#6366f1',
          light:   '#818cf8',
          dark:    '#4f46e5',
        },
      },
      animation: {
        'fade-up':   'fade-up   0.9s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-down': 'fade-down 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
        'hero-rise': 'hero-rise 1.1s cubic-bezier(0.22, 1, 0.36, 1) both',
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
      },
    },
  },
  plugins: [],
} satisfies Config
