import {
  mergeConfig,
  defineConfig,
} from '/home/kevin/devsync/frontend/node_modules/vitest/dist/config.js';
import viteConfig from './vite.config.mjs';
export default mergeConfig(
  viteConfig,
  defineConfig({
    root: '/home/kevin/devsync/frontend',
    resolve: {
      alias: {
        '@testing-library/react':
          '/home/kevin/devsync/frontend/node_modules/@testing-library/react/dist/index.js',
      },
    },
    test: {
      environment: 'jsdom',
      server: { deps: { inline: [/react-virtuoso/] } },
      include: [
        '../docs/quality/phase14-virtualization-draft/combined-fixture/interruption.test.tsx',
      ],
    },
  }),
);
