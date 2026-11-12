import { defineConfig } from '/home/kevin/devsync/frontend/node_modules/vite/dist/node/index.js';

const frontend = '/home/kevin/devsync/frontend';
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^react\/jsx-runtime$/,
        replacement: `${frontend}/node_modules/react/jsx-runtime.js`,
      },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: `${frontend}/node_modules/react/jsx-dev-runtime.js`,
      },
      { find: /^react$/, replacement: `${frontend}/node_modules/react/index.js` },
      { find: /^react-dom\/client$/, replacement: `${frontend}/node_modules/react-dom/client.js` },
      { find: /^react-dom$/, replacement: `${frontend}/node_modules/react-dom/index.js` },
      { find: '@', replacement: `${frontend}/src` },
    ],
  },
  server: { fs: { allow: ['/home/kevin/devsync'] } },
});
