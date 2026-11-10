import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: { port: 5480, strictPort: true },
  preview: { port: 5481, strictPort: true },
});
