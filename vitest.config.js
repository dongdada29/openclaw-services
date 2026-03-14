import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'cli/tests/**/*.test.js',
      'services/*/tests/**/*.test.js',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'cli/src/**/*.js',
        'services/*/src/**/*.js',
        'services/*/index.js',
        'services/*/server.js',
      ],
      exclude: [
        'node_modules/**',
        '**/tests/**',
        '**/*.test.js',
        '**/*.config.js',
      ],
      reportsDirectory: './coverage',
    },
  },
});
