import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'cli/tests/**/*.test.js',
      'services/model-proxy/tests/**/*.test.js',
      'services/watchdog/tests/**/*.test.js',
    ],
    // 解决 ESM 模块问题
    alias: {
      'node:fs': 'fs',
      'node:path': 'path',
      'node:os': 'os',
      'node:url': 'url',
      'node:util': 'util',
      'node:stream': 'stream',
      'node:events': 'events',
      'node:crypto': 'crypto',
    },
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
        'services/config-migrator/**',
        '**/*.test.js',
        '**/*.config.js',
      ],
      reportsDirectory: './coverage',
    },
  },
});
