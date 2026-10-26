import { defineConfig } from 'vite';

// Project Pages lives below /<repository>/; local development and account Pages
// use /. CLI --base remains available for other static hosts.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  build: {
    outDir: process.env.BUILD_OUT_DIR || 'dist',
  },
});
