/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          700: '#1a3a6b',
          800: '#122d56',
          900: '#0a1e3d',
        }
      }
    }
  },
  plugins: []
}
