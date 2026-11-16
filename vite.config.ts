import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { Eta } from 'eta';
import { defineConfig, type Plugin } from 'vite';
import { appConfig } from './src/templates/app-config.ts';

const rootDir = import.meta.dirname;
const templatesDir = resolve(rootDir, 'src', 'templates');

function etaAndSwPlugin(): Plugin {
  const eta = new Eta({ views: templatesDir });

  return {
    name: 'eta-html-and-sw',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return eta.renderString(html, appConfig);
      },
    },
    handleHotUpdate({ file, server }) {
      if (file.startsWith(templatesDir) && file.endsWith('.eta')) {
        server.ws.send({ type: 'full-reload' });
      }
    },
    configureServer(server) {
      server.middlewares.use('/sw.js', (_req, res) => {
        const swSource = readFileSync(resolve(rootDir, 'src', 'sw.ts'), 'utf8');
        const outputText = stripTypeScriptTypes(swSource, { mode: 'strip' });
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(outputText);
      });
    },
  };
}

export default defineConfig({
  plugins: [etaAndSwPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        sw: resolve(rootDir, 'src', 'sw.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});
