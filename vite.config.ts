import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
// @ts-ignore
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [solidPlugin(), tailwindcss()],
  server: {
    port: 3010,
  },
  build: {
    target: 'esnext',
  },
});
