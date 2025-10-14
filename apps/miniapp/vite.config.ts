import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@zone/shared': path.resolve(__dirname, '../../libs/shared/src')
    }
  },
  server: {
    port: 3003,
    host: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});