import { afterEach, describe, expect, test } from 'bun:test';
import { chat } from '../src/server/opencode';
import { codeForge } from '../src/server/codeForge';
import { forge, forgeStream, type ForgeEvent } from '../src/server/forge';

const real = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = real;
});

const provider = { apiKey: 'k', baseUrl: 'https://example.test/v1' };
const env = { ...provider, model: 'deepseek-v4.1-flash', codeSkills: true };
const req = { prompt: 'โล่', slot: 'tactical' as const, lang: 'th' as const };

const sse = (chunks: string[]) =>
  new Response(chunks.map(c => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join('') + 'data: [DONE]\n\n', {
    status: 200,
    headers: { 'content-type': 'text/event-stream' }
  });
const json = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
const DESIGN = ['NAME: โล่พับ\nDESC: โล่กระดาษ\n', '```js\nfunction onCast(api, ctx) {\n', '  api.shield({ amount: 30 });\n}\n```'];
const VOTE = '{"safe":true,"fair":true,"matchesIdea":true,"reason":"ok"}';

function mock(review: () => Response = () => json(VOTE)) {
  globalThis.fetch = (async (_u: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (String(body.messages[0].content).startsWith('You design ONE ability for a paper-craft first-person shooter, as a tiny'))
      return body.stream ? sse(DESIGN) : json(DESIGN.join(''));
    if (String(body.messages[0].content).startsWith('You design')) return json('{"name":"Wall","effects":[{"type":"wall","width":4,"duration":4}]}');
    return review();
  }) as unknown as typeof fetch;
}

describe('chat streams when asked', () => {
  test('SSE deltas arrive in order and add up to the full reply', async () => {
    mock();
    const seen: string[] = [];
    const text = await chat(provider, {
      model: 'deepseek-v4.1-flash',
      system: 'You design ONE ability for a paper-craft first-person shooter, as a tiny JavaScript function.',
      user: 'x',
      params: {},
      signal: new AbortController().signal,
      onText: t => seen.push(t)
    });
    expect(text).toBe(DESIGN.join(''));
    expect(seen).toEqual([DESIGN[0], DESIGN[0] + DESIGN[1], DESIGN.join('')]);
  });
});

describe('progress events are real stages, in order', () => {
  test('code path: plan → code (when the code block starts) → logic → review → five votes', async () => {
    mock();
    const events: ForgeEvent[] = [];
    const r = await codeForge(req, provider, { retryDelayMs: 1, onEvent: e => events.push(e) });
    expect(r.ok).toBe(true);
    expect(events.filter(e => e.type === 'stage').map(e => (e as { stage: string }).stage)).toEqual(['plan', 'code', 'logic', 'review']);
    expect(events.filter(e => e.type === 'vote').length).toBe(5);
  });

  test('a rejected script ends in the data forge, which says so', async () => {
    mock(() => json('{"safe":true,"fair":false,"matchesIdea":true,"reason":"too strong"}'));
    const events: ForgeEvent[] = [];
    const r = await forge(req, env, { retryDelayMs: 1, onEvent: e => events.push(e) });
    expect(r.ok && r.skill.name).toBe('Wall');
    expect(events.map(e => (e.type === 'stage' ? e.stage : e.type))).toContain('draft');
  });
});

describe('forgeStream: NDJSON for the browser', () => {
  test('one JSON object per line, the result last', async () => {
    mock();
    const text = await new Response(forgeStream(req, env, { retryDelayMs: 1 })).text();
    const lines = text.trim().split('\n').map(l => JSON.parse(l));
    expect(lines[0]).toEqual({ type: 'stage', stage: 'plan' });
    const last = lines.at(-1);
    expect(last.type).toBe('result');
    expect(last.response.ok && last.response.skill.program.table.length).toBe(24);
  });
});

describe('cancellation and budgets', () => {
  test('a client that disconnects stops the forge: no more provider calls after cancel', async () => {
    let calls = 0;
    globalThis.fetch = (async (_u: string, init: RequestInit) => {
      calls++;
      await new Promise((ok, no) => {
        const t = setTimeout(ok, 200);
        init.signal?.addEventListener('abort', () => (clearTimeout(t), no(new DOMException('aborted', 'AbortError'))));
      });
      return json('no code here');
    }) as unknown as typeof fetch;
    const stream = forgeStream(req, env, { retryDelayMs: 1 });
    const reader = stream.getReader();
    await reader.read(); // the first stage line
    await reader.cancel();
    const at = calls;
    await new Promise(r => setTimeout(r, 600));
    expect(calls).toBe(at);
  });

  test('when the provider itself failed on the code path, the data path is skipped (no second wait)', async () => {
    let calls = 0;
    globalThis.fetch = (async () => (calls++, new Response('{"error":{"type":"unauthorized"}}', { status: 401 }))) as unknown as typeof fetch;
    const r = await forge(req, env, { retryDelayMs: 1 });
    expect(r.ok && r.via).toBe('offline');
    expect(r.ok && r.fallbackReason).toBe('http-401:unauthorized');
    expect(calls).toBe(2); // one per designer, none for the data forge
  });
});
