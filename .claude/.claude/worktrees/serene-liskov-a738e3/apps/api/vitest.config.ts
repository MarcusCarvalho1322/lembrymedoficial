import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@lembrymed/database': path.resolve(__dirname, '../../packages/database'),
      '@lembrymed/shared': path.resolve(__dirname, '../../packages/shared'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/__tests__/**/*.ts',
      '../../packages/shared/**/*.test.ts',
      '../../packages/shared/**/__tests__/**/*.ts',
    ],
    globals: false,
  },
});
