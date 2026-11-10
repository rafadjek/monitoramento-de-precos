/** @type {import('tailwindcss').Config} */
// Tema "Bate Ofertas": escuro com neon (modelo enviado pelo Rafael em 10/11/2026).
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        night: '#060B1A', // fundo
        panel: '#0C1530', // painéis
        panel2: '#101C3D', // linhas e cartões
        edge: '#1E2C55', // bordas
        ink: '#E8EEFF', // texto
        muted: '#8C9AC0',
        neon: '#22E36B', // menor preço
        sky: '#2F8BFF', // azul dos botões
        fire: '#FF8A1E', // laranja do título
        gold: '#FFC21A',
        signal: '#FF4D5E', // alerta
      },
      fontFamily: {
        display: ['"Barlow Condensed"', 'Arial Narrow', 'sans-serif'],
        sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        neon: '0 0 0 1px rgba(34,227,107,.65), 0 0 18px rgba(34,227,107,.35)',
        sky: '0 0 0 1px rgba(47,139,255,.6), 0 0 16px rgba(47,139,255,.3)',
      },
    },
  },
  plugins: [],
};
