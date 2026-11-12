import { defineConfig } from '/home/kevin/devsync/frontend/node_modules/vite/dist/node/index.js';

const frontendPath = '/home/kevin/devsync/frontend';
const probePath = '/tmp/devsync-phase14-virtuoso-integration/node_modules';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^react\/jsx-runtime$/,
        replacement: `${frontendPath}/node_modules/react/jsx-runtime.js`,
      },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: `${frontendPath}/node_modules/react/jsx-dev-runtime.js`,
      },
      { find: /^react$/, replacement: `${frontendPath}/node_modules/react/index.js` },
      {
        find: /^react-dom\/client$/,
        replacement: `${frontendPath}/node_modules/react-dom/client.js`,
      },
      { find: /^react-dom$/, replacement: `${frontendPath}/node_modules/react-dom/index.js` },
      { find: '@', replacement: `${frontendPath}/src` },
      {
        find: 'react-virtuoso',
        replacement: `${probePath}/react-virtuoso/dist/index.mjs`,
      },
      {
        find: '@dnd-kit/core',
        replacement: `${frontendPath}/node_modules/@dnd-kit/core/dist/core.esm.js`,
      },
    ],
  },
  server: { fs: { allow: [frontendPath, '/home/kevin/devsync', probePath] } },
});
