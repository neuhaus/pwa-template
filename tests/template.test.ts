import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { Eta } from 'eta';
import { appConfig } from '../src/templates/app-config.ts';

const rootDir = resolve(import.meta.dirname, '..');
const templatesDir = resolve(rootDir, 'src', 'templates');

describe('Eta HTML templating', () => {
  it('renders index.html with Mobile Safari meta tags and manifest', () => {
    const eta = new Eta({ views: templatesDir });
    const rawHtml = readFileSync(resolve(rootDir, 'index.html'), 'utf8');
    const rendered = eta.renderString(rawHtml, appConfig);

    assert.match(rendered, /viewport-fit=cover/);
    assert.match(rendered, /apple-mobile-web-app-capable/);
    assert.match(rendered, /apple-touch-icon/);
    assert.match(rendered, /manifest\.webmanifest/);
    assert.match(rendered, /id="ios-install-banner"/);
    assert.match(rendered, new RegExp(`<title>${appConfig.appName}</title>`));
  });

  it('escapes HTML special characters in template variables', () => {
    const eta = new Eta({ views: templatesDir });
    const rawHtml = readFileSync(resolve(rootDir, 'index.html'), 'utf8');
    const rendered = eta.renderString(rawHtml, {
      ...appConfig,
      appName: '<script>alert(1)</script>',
    });

    assert.doesNotMatch(rendered, /<script>alert\(1\)<\/script>/);
    assert.match(rendered, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });
});
