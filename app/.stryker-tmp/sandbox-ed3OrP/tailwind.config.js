/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9f0',
          100: '#e6f3d5',
          200: '#d1e7ce',
          300: '#b8d8b4',
          400: '#9ecc8c',
          500: '#5c8c5a',
          600: '#5c8c5a',
          700: '#4a7348',
          800: '#3d5f3b',
          900: '#2f4a2d',
        },
        secondary: {
          50: '#f4f9f2',
          100: '#e6f3d5',
          200: '#d4ecc8',
          300: '#b8d8b4',
          400: '#9ecc8c',
          500: '#9ecc8c',
          600: '#8bb87a',
          700: '#739965',
          800: '#5e7d53',
          900: '#4d6544',
        },
        tertiary: {
          50: '#e6f3d5',
          100: '#e6f3d5',
          200: '#ddedc9',
          300: '#d1e7bd',
          400: '#c5e1b1',
          500: '#e6f3d5',
          600: '#d0d9c2',
          700: '#b8c2a8',
          800: '#9fa88e',
          900: '#868f75',
        }
      }
    },
  },
  plugins: [],
}