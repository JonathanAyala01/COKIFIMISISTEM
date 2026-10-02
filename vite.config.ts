import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  return {
    base: './',
    plugins: [react(), tailwindcss()],
    build: {
      outDir: 'Cokifimi-deploy-1.0.20/build/vite',
      manifest: 'manifest.json',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          assetFileNames: (assetInfo) => assetInfo.names?.includes('logo.png') ? 'assets/logo.png' : 'assets/[name]-[hash][extname]',
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
