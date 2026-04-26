import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { registerSW } from 'virtual:pwa-register';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { SessionProvider } from './state/session';
import { applyAppearance, getStoredAppearance } from './lib/appearance';
import './index.css';

applyAppearance(getStoredAppearance());
registerSW({ immediate: true });

const queryClient = new QueryClient();
const routerBaseName = import.meta.env.VITE_APP_BASE_PATH?.replace(/\/$/, '') || undefined;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <BrowserRouter basename={routerBaseName}>
          <App />
        </BrowserRouter>
      </SessionProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
