import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initNative, isNative } from './native';
import './index.css';

initNative(); // so faz algo dentro do app Android

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
// instalável e abrindo sem internet (só no site publicado; no "npm run dev" atrapalharia; dentro do app não se usa)
if (import.meta.env.PROD && !isNative() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}); });
}
