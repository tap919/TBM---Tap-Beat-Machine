import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    // NOTE: API keys must NEVER be injected into the client bundle.
    // Gemini requests are proxied through the backend (/api/analyze)
    // which reads the key from process.env on the server side.
    define: {},
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // Vendor chunks — separated so they cache independently
            'vendor-react': ['react', 'react-dom'],
            'vendor-icons': ['lucide-react'],
            // Heavy app modules — lazy loaded via React.lazy
            'audio-engine': ['./src/lib/TBMAudioEngine.ts'],
          },
        },
      },
    },
    worker: {
      format: 'es' as const,
      // Do NOT apply React plugin to workers — they have no DOM
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: `http://localhost:${process.env.SERVER_PORT ?? 3001}`,
          changeOrigin: true,
        },
      },
    },
  };
});
