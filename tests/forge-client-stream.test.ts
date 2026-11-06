import { describe, expect, test } from 'bun:test';
import { readForgeStream } from '../src/ui/forgeProgress';

const ndjson = (parts: string[]) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const p of parts) c.enqueue(new TextEncoder().encode(p));
        c.close();
      }
    }),
    { headers: { 'content-type': 'application/x-ndjson' } }
  );

describe('readForgeStream', () => {
  test('events arrive in order even when lines are split across chunks; the result is returned', async () => {
    const seen: unknown[] = [];
    const res = await readForgeStream(
      ndjson(['{"type":"stage","stage":"plan"}\n{"type":"sta', 'ge","stage":"code"}\n', '{"type":"vote","model":"glm-5.3-flash","vote":"pass"}\n{"type":"result","response":{"ok":false,"error":"x"}}\n']),
      e => seen.push(e)
    );
    expect(seen).toEqual([
      { type: 'stage', stage: 'plan' },
      { type: 'stage', stage: 'code' },
      { type: 'vote', model: 'glm-5.3-flash', vote: 'pass' }
    ]);
    expect(res).toEqual({ ok: false, error: 'x' });
  });

  test('an old server that answers plain JSON still works', async () => {
    const res = await readForgeStream(new Response('{"ok":false,"error":"y"}', { headers: { 'content-type': 'application/json' } }), () => {});
    expect(res).toEqual({ ok: false, error: 'y' });
  });

  test('a stream that ends without a result is an error, not a hang', async () => {
    expect(readForgeStream(ndjson(['{"type":"stage","stage":"plan"}\n']), () => {})).rejects.toThrow('no-result');
  });

  test('unknown or malformed lines are ignored', async () => {
    const seen: unknown[] = [];
    await readForgeStream(ndjson(['garbage\n{"type":"stage","stage":"hack"}\n{"type":"result","response":{"ok":false,"error":"z"}}\n']), e => seen.push(e));
    expect(seen).toEqual([]);
  });
});
