import { defineConfig } from '/home/kevin/devsync/frontend/node_modules/vite/dist/node/index.js';
export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@dnd-kit/core',
        replacement: '/home/kevin/devsync/frontend/node_modules/@dnd-kit/core/dist/core.esm.js',
      },
      { find: /^react$/, replacement: '/home/kevin/devsync/frontend/node_modules/react/index.js' },
      {
        find: /^react-dom$/,
        replacement: '/home/kevin/devsync/frontend/node_modules/react-dom/index.js',
      },
    ],
  },
});
