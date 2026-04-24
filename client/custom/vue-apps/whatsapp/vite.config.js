import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: '../../js',
    emptyOutDir: false,
    lib: {
      entry: './src/main.js',
      name: 'WhatsAppVueBundle',
      formats: ['iife'],
      fileName: () => 'whatsapp-vue.bundle.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: assetInfo => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'whatsapp-vue.css';
          }

          return '[name][extname]';
        },
      },
    },
  },
});
