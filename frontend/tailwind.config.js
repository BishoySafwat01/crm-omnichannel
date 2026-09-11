/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        theme: {
          primary: 'var(--theme-primary-color, var(--primary-color, #1A73E8))',
          'primary-hover': 'color-mix(in srgb, var(--theme-primary-color, var(--primary-color, #1A73E8)) 85%, black)',
          'primary-tint': 'color-mix(in srgb, var(--theme-primary-color, var(--primary-color, #1A73E8)) 12%, transparent)',
          'primary-subtle': 'color-mix(in srgb, var(--theme-primary-color, var(--primary-color, #1A73E8)) 6%, transparent)',
        },
        brand: {
          teal: '#18A484',
          'teal-hover': '#14896e',
          dark: '#0F172A',
          card: '#1E293B',
          accent: '#06B6D4',
        },
      },
      fontFamily: {
        sans: ['Cairo', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
