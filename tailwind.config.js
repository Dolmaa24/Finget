/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
        display: ['Syne', '"Plus Jakarta Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        amber: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        orange: {
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
        },
        stone: {
          50: '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
          950: '#0c0a09',
        },
        cream: {
          50: '#fefdfb',
          100: '#fcfaf7',
          200: '#f7f4ed',
          300: '#eee9dd',
          400: '#dfd7c4',
        },
        primary: {
          DEFAULT: '#d97706',
          hover: '#b45309',
          dark: '#92400e',
          light: '#fef3c7',
        },
        secondary: {
          DEFAULT: '#ea580c',
          hover: '#c2410c',
        },
      },
      boxShadow: {
        'glass-sm': '0 4px 20px -2px rgba(28, 25, 23, 0.05), 0 2px 6px -1px rgba(28, 25, 23, 0.02)',
        'glass': '0 20px 40px -15px rgba(28, 25, 23, 0.07), 0 0 1px 1px rgba(255, 255, 255, 0.9) inset',
        'glass-lg': '0 30px 60px -12px rgba(28, 25, 23, 0.12), 0 0 2px 1px rgba(255, 255, 255, 1) inset',
        'amber-glow': '0 12px 30px -5px rgba(234, 88, 12, 0.35)',
        'dark-pill': '0 10px 25px -5px rgba(28, 25, 23, 0.25)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        }
      }
    },
  },
  plugins: [],
}

