import { afterEach, describe, expect, test } from 'bun:test';
import { forge } from '../src/server/forge';

const env = { apiKey: 'k', baseUrl: 'https://example.test/v1', model: 'm' };
const req = { prompt: 'a paper wall', slot: 'tactical' as const, lang: 'en' as const };
const real = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = real;
});

const ok = () =>
  new Response(JSON.stringify({ choices: [{ message: { content: '{"name":"Wall","effects":[{"type":"wall","width":4,"duration":4}]}' } }] }), { status: 200 });
const busy = () => new Response('{"type":"error","error":{"type":"server_error"}}', { status: 429 });

describe('forge retries a busy provider', () => {
  test('a 429 followed by a success is an AI skill, not an offline one', async () => {
    let calls = 0;
    globalThis.fetch = (async () => (++calls === 1 ? busy() : ok())) as unknown as typeof fetch;
    const r = await forge(req, env, { retryDelayMs: 1 });
    expect(r.ok && r.via).toBe('ai');
    expect(calls).toBe(2);
  });

  test('gives up after the retries and falls back offline, saying why', async () => {
    let calls = 0;
    globalThis.fetch = (async () => (calls++, busy())) as unknown as typeof fetch;
    const r = await forge(req, env, { retryDelayMs: 1 });
    expect(r.ok && r.via).toBe('offline');
    expect(r.ok && r.fallbackReason).toBe('http-429:server_error');
    expect(calls).toBe(3);
  });

  test('every retry of one forge call keeps the same x-opencode-session', async () => {
    const ids: string[] = [];
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      ids.push((init.headers as Record<string, string>)['x-opencode-session']);
      return ids.length < 3 ? busy() : ok();
    }) as unknown as typeof fetch;
    await forge(req, env, { retryDelayMs: 1 });
    expect(ids.length).toBe(3);
    expect(new Set(ids).size).toBe(1);
    const next: string[] = [];
    globalThis.fetch = (async (_url: string, init: RequestInit) => (next.push((init.headers as Record<string, string>)['x-opencode-session']), ok())) as unknown as typeof fetch;
    await forge(req, env, { retryDelayMs: 1 });
    expect(next[0]).not.toBe(ids[0]);
  });

  test('a 400 is not retried: the request itself is wrong', async () => {
    let calls = 0;
    globalThis.fetch = (async () => (calls++, new Response('{"error":{"type":"MissingSessionID"}}', { status: 400 }))) as unknown as typeof fetch;
    await forge(req, env, { retryDelayMs: 1 });
    expect(calls).toBe(1);
  });
});
