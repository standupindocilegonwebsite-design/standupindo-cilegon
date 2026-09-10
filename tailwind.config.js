/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#bcd2ff',
          300: '#8eb3ff',
          400: '#5a87ff',
          500: '#3a63f5',
          600: '#2548db',
          700: '#1e3bb8',
          800: '#1c3491',
          900: '#0a1a3b',
          950: '#070f24',
        },
      },
      boxShadow: {
        soft: '0 2px 12px -2px rgba(15, 23, 42, 0.08), 0 1px 3px -1px rgba(15, 23, 42, 0.06)',
        glow: '0 8px 32px -8px rgba(37, 72, 219, 0.35)',
      },
    },
  },
  plugins: [],
};
