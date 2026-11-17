import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GET } from '../src/pages/llms-full.txt';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('portfolio simulation disclosure', () => {
 it('discloses simulated tools and local-only writes visibly in the standalone demo', () => {
  const doc = new DOMParser().parseFromString(read('public/apps/unifi-demo/index.html').replace(/<link[^>]*>/g, ''), 'text/html');
  const notice = doc.querySelector('.simulation-notice');
  expect(notice?.textContent).toContain('Scripted browser simulation');
  expect(notice?.textContent).toContain('tool-call displays are simulated');
  expect(notice?.textContent).toContain('Write toggles affect local simulation state only');
  expect(notice?.hasAttribute('hidden')).toBe(false);
 });
 it('carries the same truthful description into generated LLM content', async () => {
  const response = await GET({ site: new URL('https://millsymills.com/') } as Parameters<typeof GET>[0]);
  const text = await response.text();
  expect(text).toContain('Scripted browser simulation (no live AI or controller) at /unifi/.');
  expect(text).not.toMatch(/AI assistant calling|calling the real tools/);
 });
 it('keeps project cards and app metadata free of the old claims', () => {
  expect(read('src/components/desktop/apps/Projects.astro')).toContain('{p.install}');
  expect(read('src/data/apps.ts')).toContain('scripted browser simulation');
  expect(read('src/data/apps.ts')).not.toContain('calling real MCP tools');
 });
});
