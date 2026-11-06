import { afterEach, describe, expect, test } from 'bun:test';
import { codeForge, PANEL } from '../src/server/codeForge';
import { forge } from '../src/server/forge';
import { PANEL_SIZE } from '../src/skills/program';

const env = { apiKey: 'k', baseUrl: 'https://example.test/v1', model: 'deepseek-v4.1-flash', codeSkills: true };
const req = { prompt: 'โล่', slot: 'tactical' as const, lang: 'th' as const };
const real = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = real;
});

const SCRIPT = 'function onCast(api, ctx) {\n  api.shield({ amount: 30 });\n  if (ctx.hitRecently) api.shield({ amount: 10 });\n}';
const design = `NAME: โล่พับ\nDESC: โล่กระดาษ หนาขึ้นถ้าเพิ่งโดนยิง\n\`\`\`js\n${SCRIPT}\n\`\`\``;
const reply = (content: string, status = 200) =>
  status === 200 ? new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }) : new Response('{"error":{"type":"server_error"}}', { status });
const vote = (pass: boolean) => JSON.stringify({ safe: true, fair: pass, matchesIdea: true, reason: pass ? 'fine' : 'api.shield too strong' });

/** Route each call by its role: the designer prompt vs a reviewer prompt, and by model. */
function mock(onReview: (model: string) => Response | Promise<Response>, onDesign: () => Response = () => reply(design)) {
  const seen: { role: string; model: string; session: string }[] = [];
  globalThis.fetch = (async (_u: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const role = String(body.messages[0].content).startsWith('You design') ? 'design' : 'review';
    seen.push({ role, model: body.model, session: (init.headers as Record<string, string>)['x-opencode-session'] });
    return role === 'design' ? onDesign() : onReview(body.model);
  }) as unknown as typeof fetch;
  return seen;
}

describe('codeForge: designer → referee → panel', () => {
  test('the client-side panel size matches the real panel', () => {
    expect(PANEL.length).toBe(PANEL_SIZE);
  });

  test('all five reviewers pass: the skill carries the program and the votes', async () => {
    const seen = mock(() => reply(vote(true)));
    const r = await codeForge(req, env, { retryDelayMs: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.name).toBe('โล่พับ');
    expect(r.input.program.table.length).toBe(24);
    expect(r.input.program.votes.map(v => v.vote)).toEqual(PANEL.map(() => 'pass'));
    expect(seen.filter(s => s.role === 'review').map(s => s.model).sort()).toEqual(PANEL.map(p => p.model).sort());
    // each reviewer is its own conversation
    expect(new Set(seen.map(s => s.session)).size).toBe(seen.length);
  });

  test('one reject among valid votes rejects the skill', async () => {
    mock(m => reply(vote(m !== 'gpt-5.6-luna')));
    const r = await codeForge(req, env, { retryDelayMs: 1 });
    expect(r).toMatchObject({ ok: false, reason: 'panel-reject' });
  });

  test('fewer than three usable votes is no decision, not an approval', async () => {
    mock(m => (m === 'glm-5.3-flash' || m === 'gpt-5.6-luna' ? reply(vote(true)) : reply('not json at all')));
    expect(await codeForge(req, env, { retryDelayMs: 1 })).toMatchObject({ ok: false, reason: 'panel-quorum' });
  });

  test('a script over budget never reaches the panel', async () => {
    const seen = mock(
      () => reply(vote(true)),
      () => reply('NAME: Nuke\nDESC: boom\n```js\nfunction onCast(api){ api.projectile({damage:120,count:5,radius:6}); }\n```')
    );
    expect(await codeForge(req, env, { retryDelayMs: 1 })).toMatchObject({ ok: false, reason: 'referee:over-budget' });
    expect(seen.some(s => s.role === 'review')).toBe(false);
  });

  test('the designer falls back to glm when deepseek is busy', async () => {
    let n = 0;
    const seen = mock(
      () => reply(vote(true)),
      () => (++n <= 2 ? reply('', 429) : reply(design))
    );
    const r = await codeForge(req, env, { retryDelayMs: 1 });
    expect(r.ok).toBe(true);
    expect(seen.filter(s => s.role === 'design').map(s => s.model)).toEqual(['deepseek-v4.1-flash', 'deepseek-v4.1-flash', 'glm-5.3-flash']);
  });

  test('reviewers see the idea as data and the measured power', async () => {
    const bodies: string[] = [];
    mock(() => reply(vote(true)));
    const inner = globalThis.fetch;
    globalThis.fetch = (async (u: string, init: RequestInit) => (bodies.push(String(init.body)), inner(u, init))) as unknown as typeof fetch;
    await codeForge(req, env, { retryDelayMs: 1 });
    const review = JSON.parse(bodies.find(b => !JSON.parse(b).messages[0].content.startsWith('You design'))!);
    expect(review.messages[1].content).toContain('Measured worst-case power: 14/40');
    expect(review.messages[1].content).toContain(SCRIPT);
  });
});

describe('forge() with code skills on', () => {
  test('an approved script comes back as an AI skill with its program, re-refereed', async () => {
    mock(() => reply(vote(true)));
    const r = await forge(req, env, { retryDelayMs: 1 });
    expect(r.ok && r.via).toBe('ai');
    expect(r.ok && r.skill.program?.table.length).toBe(24);
    expect(r.ok && r.skill.program?.votes.length).toBe(5);
  });

  test('a rejected script falls back to the data forge, not to running anything', async () => {
    const seen = mock(
      () => reply(vote(false)),
      () => reply(design)
    );
    globalThis.fetch = (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (String(body.messages[0].content).startsWith('You design ONE ability for a paper-craft first-person arena shooter.\nReply with a single JSON'))
        return reply('{"name":"Wall","effects":[{"type":"wall","width":4,"duration":4}]}');
      const role = String(body.messages[0].content).startsWith('You design') ? 'design' : 'review';
      seen.push({ role, model: body.model, session: '' });
      return role === 'design' ? reply(design) : reply(vote(false));
    }) as unknown as typeof fetch;
    const r = await forge(req, env, { retryDelayMs: 1 });
    expect(r.ok && r.skill.program).toBeUndefined();
    expect(r.ok && r.skill.name).toBe('Wall');
  });
});
