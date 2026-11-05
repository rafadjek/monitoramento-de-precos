/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#14222B',
        paper: '#F2F4F1',
        tag: '#FFD21F',
        signal: '#C8102E',
        line: '#D5DBD3',
        muted: '#566660',
      },
      fontFamily: {
        display: ['"Barlow Condensed"', 'Arial Narrow', 'sans-serif'],
        sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
