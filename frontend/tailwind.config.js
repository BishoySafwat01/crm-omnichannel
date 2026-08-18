/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
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
