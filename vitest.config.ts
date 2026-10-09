import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { aliases } from './vitest.aliases';

export default defineConfig({
  resolve: { alias: aliases },
  plugins: [
    swc.vite({
      tsconfigFile: false, // options are explicit below, so tsconfig `paths` never reach SWC
      module: { type: 'es6' },
      jsc: {
        target: 'es2023',
        parser: { syntax: 'typescript', decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
          useDefineForClassFields: false,
        },
        keepClassNames: true, // GraphQL type names and Nest provider tokens come from class names
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/database/migrations/**',
        'src/database/seeds/**',
        'src/**/*.spec.ts',
      ],
    },
  },
});
