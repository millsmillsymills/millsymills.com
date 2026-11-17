import { describe, expect, it } from 'vitest';
import { lookup, type Context } from '../registry';
import './mcp';

function output(args: string[]) {
 const lines: string[] = [];
 const context: Context = { args, out: line => { lines.push(line); }, cwd: '/', setCwd: () => {}, fs: {}, prompt: async () => null, clear: () => {}, exit: () => {}, history: () => [], sleep: async () => {} };
 lookup('mcp')!.handler(context);
 return lines.join('\n');
}

describe('MCP setup output', () => {
 it.each(['unraid-mcp', 'unifi-mcp', 'protonmail-mcp'])('links %s to upstream verification instead of inventing an HTTP health check', id => {
  const text = output(['install', id]);
  expect(text).toContain('#readme');
  expect(text).toContain('environment settings, TLS, and verification');
  expect(text).not.toMatch(/curl|8765|8766|transport http/);
 });
 it.each([['unraid-mcp', 'UNRAID_HOST', 'UNRAID_API_KEY'], ['unifi-mcp', 'UNIFI_NETWORK_HOST', 'UNIFI_NETWORK_API']])('shows a stdio launch with quoted credential placeholders for %s', (id, host, key) => {
  const text = output(['install', id]);
  expect(text).toContain('--transport stdio');
  expect(text).toContain(`-e ${host}="<`);
  expect(text).toContain(`-e ${key}="<`);
  expect(text).toContain(`-- uvx --from git+https://github.com/millsymills-com/${id}.git ${id}`);
 });
 it('describes the demo as scripted, not a live AI integration', () => {
  expect(output(['describe', 'unifi-mcp'])).toContain('scripted browser simulation');
  expect(output(['describe', 'unifi-mcp'])).not.toContain('calling the real tools');
 });
});
