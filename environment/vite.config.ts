import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The V3Artboard runtime imports its dev-mode helpers as '@/…', the way it does in the
  // project it came from. Keeping the alias means the runtime can be re-copied verbatim.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
