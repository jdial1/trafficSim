import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';
import {PWA_MANIFEST} from './src/branding';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const base = mode === 'production' ? '/trafficSim/' : '/';
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['pwa-icon.svg'],
        manifest: {
          name: PWA_MANIFEST.name,
          short_name: PWA_MANIFEST.short_name,
          description: PWA_MANIFEST.description,
          theme_color: '#000000',
          background_color: '#000000',
          display: 'fullscreen',
          icons: [
            {
              src: 'pwa-icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: 'pwa-icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff2}'],
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    base,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 8080,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
