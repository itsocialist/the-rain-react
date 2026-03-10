import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5202,
        strictPort: true, // Fail if port is in use
        open: true,
    },
    build: {
        target: 'es2020',
    },
    optimizeDeps: {
        // Pre-bundle heavy WASM deps
        exclude: ['@react-three/rapier'],
    },
});
