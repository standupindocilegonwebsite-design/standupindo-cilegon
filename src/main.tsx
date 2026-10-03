import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const path = window.location.pathname;
    const scope = path.startsWith('/admin') ? '/admin/' : path.startsWith('/member') || path.startsWith('/evaluator') ? '/member/' : '/';
    void navigator.serviceWorker.register('/sw.js', { scope });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
