import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { Eta } from 'eta';
import { defineConfig, type Plugin } from 'vite';
import { appConfig } from './src/templates/app-config.ts';

const rootDir = import.meta.dirname;
const templatesDir = resolve(rootDir, 'src', 'templates');

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

const PROD_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self';";

function etaAndPwaPlugin(isProd: boolean): Plugin {
  const eta = new Eta({ views: templatesDir });

  return {
    name: 'eta-html-and-pwa',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return eta.renderString(html, { ...appConfig, isProd });
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
    generateBundle(_options, bundle) {
      const swChunk = bundle['sw.js'];
      if (!swChunk || swChunk.type !== 'chunk') return;

      const assetUrls = Object.keys(bundle)
        .filter((fileName) => fileName !== 'sw.js' && fileName !== 'index.html')
        .sort()
        .map((fileName) => `/${fileName}`);

      const version = createHash('sha256')
        .update(assetUrls.join(','))
        .digest('hex')
        .slice(0, 8);

      swChunk.code = swChunk.code
        .replace(/\/\*__CACHE_VERSION__\*\/\s*["']dev["']/, JSON.stringify(version))
        .replace(/\/\*__PRECACHE_ASSETS__\*\/\s*\[\]/, JSON.stringify(assetUrls));
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [etaAndPwaPlugin(command === 'build')],
  server: {
    headers: SECURITY_HEADERS,
  },
  preview: {
    headers: {
      ...SECURITY_HEADERS,
      'Content-Security-Policy': PROD_CSP,
    },
  },
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
}));
