// tailwind.config.js
const defaultTheme = require('tailwindcss/defaultTheme')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Quicksand', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        // Renomeado de 'piquet' para 'petcare' para consistência total
        petcare: {
          light: '#9CBDBF', // Sage/Teal
          DEFAULT: '#5A8F91', // Mid-tone
          dark: '#15504E', // Deep Teal
          bg: '#F4F9F9', // Very light background
        }
      }
    }
  },
  plugins: [],
};
