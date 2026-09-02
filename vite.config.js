import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    // Keep CRA's output directory: the Dockerfile and README copy `build/` into
    // backend/public, where Express serves it.
    build: { outDir: 'build' },
    test: {
        // Only the frontend suite; backend/tests/ is a separate Jest project.
        include: ['src/**/*.{test,spec}.{js,jsx}'],
        environment: 'jsdom',
        globals: true,
        setupFiles: './src/setupTests.js',
    },
});
