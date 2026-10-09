import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { aliases } from './vitest.aliases';

export default defineConfig({
  resolve: { alias: aliases },
  plugins: [
    swc.vite({
      tsconfigFile: false,
      module: { type: 'es6' },
      jsc: {
        target: 'es2023',
        parser: { syntax: 'typescript', decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
          useDefineForClassFields: false,
        },
        keepClassNames: true,
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup-e2e.ts'],
    pool: 'forks',
    fileParallelism: false, // tests share one database
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
