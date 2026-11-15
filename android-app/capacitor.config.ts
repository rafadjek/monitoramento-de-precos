import type { CapacitorConfig } from '@capacitor/cli';

// webDir: o site e gerado por scripts/build-site.mjs (VITE_BASE=./) direto em www/
const config: CapacitorConfig = {
  appId: 'br.com.bateofertas',
  appName: 'Bate Ofertas',
  webDir: 'www',
  android: {
    backgroundColor: '#060B1A',
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true, // reserva: o JS esconde antes, quando o site esta pronto
      backgroundColor: '#060B1A',
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: false,
    },
    // Android 15/16 desenha de borda a borda: margem nativa para o site e icones claros sobre o fundo escuro
    SystemBars: {
      insetsHandling: 'native',
      style: 'DARK',
      hidden: false,
    },
    StatusBar: {
      backgroundColor: '#060B1A',
      style: 'DARK',
      overlaysWebView: false,
    },
  },
};

export default config;
