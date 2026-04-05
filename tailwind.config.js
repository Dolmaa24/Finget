/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        navy: {
          900: '#0F172A', // Very dark slate
          800: '#1E293B',
          700: '#334155',
        },
        slate: {
          400: '#94A3B8',
          300: '#CBD5E1',
          100: '#F1F5F9',
        },
        primary: '#10B981', // Emerald 500
        'primary-hover': '#059669', // Emerald 600
        warning: '#F59E0B',
        danger: '#EF4444',
      }
    },
  },
  plugins: [],
}
