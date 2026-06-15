import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// When running inside Electron (packaged), assets are loaded from
// the filesystem with a relative base. In dev/browser mode, use '/'.
const isElectronBuild = process.env.BUILD_TARGET === 'electron' || process.env.npm_lifecycle_event === 'build:electron-renderer';

export default defineConfig({
  plugins: [react()],

  base: isElectronBuild ? './' : '/',

  build: {
    outDir: 'dist',
    sourcemap: !isElectronBuild,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor code for faster cold-start in Electron
          react: ['react', 'react-dom'],
        },
      },
    },
  },

  server: {
    port: 5173,
    strictPort: true,
  },

  define: {
    // Let the app know it was built for Electron (optional, use isElectron hook instead)
    __BUILD_TARGET__: JSON.stringify(isElectronBuild ? 'electron' : 'web'),
  },
});
