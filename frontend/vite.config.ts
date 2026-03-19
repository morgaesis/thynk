import { execSync } from 'child_process';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const gitHash = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
})();

const appVersion = (() => {
  try {
    const pkg = JSON.parse(execSync('cat package.json').toString());
    return pkg.version;
  } catch {
    return '0.0.0';
  }
})();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __GIT_HASH__: JSON.stringify(process.env.VITE_GIT_HASH ?? gitHash),
    __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION ?? appVersion),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
