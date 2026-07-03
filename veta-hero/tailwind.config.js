/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        roca: '#12141A',
        carbon: '#1C1F27',
        oro: '#C9A227',
        'oro-claro': '#E8C766',
        humo: '#EDEAE3',
        mineral: '#2E7D6B',
      },
    },
  },
  plugins: [],
}
