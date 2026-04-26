import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_HB_PROXY_TARGET;
  const proxyPath = env.VITE_HB_DEV_PROXY_PATH || '/hb-api';
  const basePath = env.VITE_APP_BASE_PATH || '/';

  return {
    base: basePath,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          name: env.VITE_APP_TITLE || 'homebox-scanner',
          short_name: 'HB Scanner',
          description: 'Scanner-first PWA for HomeBox item and location workflows',
          theme_color: '#111827',
          background_color: '#0f172a',
          display: 'standalone',
          start_url: basePath,
          scope: basePath,
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      }),
      viteSingleFile()
    ],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: proxyTarget
        ? {
            [proxyPath]: {
              target: proxyTarget,
              changeOrigin: true,
              secure: false,
              rewrite: (path) => path.replace(new RegExp(`^${proxyPath}`), '/api')
            }
          }
        : undefined
    },
    preview: {
      host: '0.0.0.0',
      port: 4173
    }
  };
});
