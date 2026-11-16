import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { Eta } from 'eta';
import { build as viteBuild, defineConfig, type Plugin } from 'vite';
import { appConfig } from './src/templates/app-config.ts';

const rootDir = import.meta.dirname;
const templatesDir = resolve(rootDir, 'src', 'templates');
const apiPrefix = `/${(process.env.API_PREFIX ?? 'api').replace(/^\/+|\/+$/g, '')}`;

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

const PROD_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self';";

function etaAndPwaPlugin(isProd: boolean): Plugin {
  const eta = new Eta({ views: templatesDir });
  let emittedAssets: string[] = [];
  let buildingSw = false;

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
      if (buildingSw) return;
      const base = appConfig.basePath;
      emittedAssets = Object.keys(bundle)
        .filter((fileName) => fileName !== 'sw.js' && fileName !== 'index.html')
        .sort()
        .map((fileName) => `${base}${fileName}`);
    },
    async closeBundle() {
      if (!isProd || buildingSw) return;
      buildingSw = true;
      try {
        const base = appConfig.basePath;
        const version = createHash('sha256')
          .update(emittedAssets.join(','))
          .digest('hex')
          .slice(0, 8);

        // Bundle sw.ts as a standalone classic script (IIFE) with no import/export statements.
        await viteBuild({
          configFile: false,
          logLevel: 'silent',
          build: {
            outDir: resolve(rootDir, 'dist'),
            emptyOutDir: false,
            lib: {
              entry: resolve(rootDir, 'src', 'sw.ts'),
              formats: ['iife'],
              name: 'pwaSw',
              fileName: () => 'sw.js',
            },
            rollupOptions: {
              output: {
                entryFileNames: 'sw.js',
              },
            },
          },
        });

        const swPath = resolve(rootDir, 'dist', 'sw.js');
        const swCode = readFileSync(swPath, 'utf8').replace(
          /(['"`])__PWA_SW_CONFIG__\1/g,
          JSON.stringify(
            JSON.stringify({ basePath: base, cacheVersion: version, assets: emittedAssets }),
          ),
        );
        writeFileSync(swPath, swCode, 'utf8');

        if (base !== '/') {
          const manifestPath = resolve(rootDir, 'dist', 'manifest.webmanifest');
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
            start_url: string;
            scope: string;
            icons: Array<{ src: string }>;
          };
          manifest.start_url = base;
          manifest.scope = base;
          manifest.icons = manifest.icons.map((icon) => ({
            ...icon,
            src: icon.src.startsWith('/') ? `${base}${icon.src.slice(1)}` : icon.src,
          }));
          writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
        }
      } finally {
        buildingSw = false;
      }
    },
  };
}

export default defineConfig(({ command }) => ({
  base: appConfig.basePath,
  define: {
    __API_PREFIX__: JSON.stringify(apiPrefix),
  },
  plugins: [etaAndPwaPlugin(command === 'build')],
  server: {
    headers: SECURITY_HEADERS,
    proxy: {
      [apiPrefix]: 'http://127.0.0.1:3000',
    },
  },
  preview: {
    headers: {
      ...SECURITY_HEADERS,
      'Content-Security-Policy': PROD_CSP,
    },
    proxy: {
      [apiPrefix]: 'http://127.0.0.1:3000',
    },
  },
}));
