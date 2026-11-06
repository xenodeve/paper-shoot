import { balanceSkill, EFFECT_TYPES, ICONS, POWER_CAP, type BalanceNote, type Skill, type Slot } from '../skills/balance.ts';
import { offlineSkill } from '../skills/offline.ts';
import { isBusy } from '../forgeReason.ts';
import { codeForge, type CodeForgeOptions, type ForgeEvent } from './codeForge.ts';
import { headers, newSession, pause, providerError } from './opencode.ts';

export { providerError, type ForgeEvent };

/**
 * The forge endpoint, shared by the Vite dev middleware and the Bun server.
 * The API key is read here, on the server, and never reaches the browser.
 */
export interface ForgeEnv {
  apiKey?: string;
  baseUrl: string;
  model: string;
  /** try an AI-written, sandboxed, panel-reviewed skill first (issue #18) */
  codeSkills?: boolean;
}

export interface ForgeRequest {
  prompt: string;
  slot: Slot;
  lang: 'th' | 'en';
}

export type ForgeResponse =
  | { ok: true; skill: Skill; power: number; cap: number; notes: BalanceNote[]; via: 'ai' | 'offline'; model?: string; fallbackReason?: string }
  | { ok: false; error: string };

export const DEFAULT_BASE_URL = 'https://opencode.ai/inference/go/openai/v1';
export const DEFAULT_MODEL = 'glm-5.3-flash';

export function envFrom(source: Record<string, string | undefined>): ForgeEnv {
  return {
    apiKey: source.OPENCODE_GO_API_KEY || undefined,
    baseUrl: (source.OPENCODE_GO_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    model: source.OPENCODE_GO_MODEL || DEFAULT_MODEL,
    codeSkills: source.PAPER_SHOOT_CODE_SKILLS !== '0'
  };
}

const SYSTEM = `You design ONE ability for a paper-craft first-person arena shooter.
Reply with a single JSON object and nothing else. No markdown, no prose.

Schema:
{
  "name": string (max 28 chars, in the player's language),
  "description": string (max 140 chars, in the player's language, playful paper/stationery flavour),
  "icon": one of ${JSON.stringify(ICONS)},
  "color": "#rrggbb",
  "cooldown": number (seconds),
  "effects": 1 to 3 items, each one of:
    {"type":"dash","distance":3-14}
    {"type":"heal","amount":10-60}
    {"type":"shield","amount":10-75}
    {"type":"projectile","damage":10-120,"count":1-5,"radius":0-6 (explosion radius, 0 = direct hit),"speed":20-80}
    {"type":"area","radius":2-10,"damage":0-80 (per second),"slow":0-0.6,"duration":1-6}
    {"type":"buff","stat":"speed"|"damage"|"fireRate"|"reload","multiplier":1.1-1.6,"duration":2-8}
    {"type":"decoy","duration":2-8}
    {"type":"wall","width":2-8,"duration":2-10}
    {"type":"reveal","radius":10-60,"duration":2-6}
    {"type":"pull","radius":3-10,"strength":0.2-1}
}

Rules: the skill must be FAIR. A referee trims anything over budget, so design something interesting rather than maximal.
Tactical skills are small and frequent; ultimate skills are big with long cooldowns.
Only these effect types exist: ${EFFECT_TYPES.join(', ')}.`;

function extractJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no-json');
  return JSON.parse(t.slice(start, end + 1));
}

/**
 * The HTTP request for one data-forge call (headers: `opencode.ts`). One forge call is one
 * conversation, so its retries share the session id `forge()` passes in.
 */
export function buildModelRequest(req: ForgeRequest, env: ForgeEnv, session: string) {
  return {
    url: `${env.baseUrl}/chat/completions`,
    headers: headers(env, session),
    body: JSON.stringify({
      model: env.model,
      temperature: 0.9,
      max_tokens: 700,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Slot: ${req.slot} (power budget ${POWER_CAP[req.slot]}). Player language: ${req.lang === 'th' ? 'Thai' : 'English'}.\nIdea: ${req.prompt}`
        }
      ]
    })
  };
}

async function callModel(req: ForgeRequest, env: ForgeEnv, signal: AbortSignal, session: string): Promise<unknown> {
  const call = buildModelRequest(req, env, session);
  const res = await fetch(call.url, { method: 'POST', signal, headers: call.headers, body: call.body });
  if (!res.ok) throw new Error(providerError(res.status, await res.text().catch(() => '')));
  const data = (await res.json()) as { choices?: { message?: { content?: string; reasoning_content?: string } }[] };
  const msg = data.choices?.[0]?.message;
  const content = msg?.content || msg?.reasoning_content || '';
  return extractJson(content);
}

export function parseRequest(body: unknown): ForgeRequest | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const prompt = typeof b.prompt === 'string' ? b.prompt.trim().slice(0, 300) : '';
  if (prompt.length < 2) return null;
  const slot: Slot = b.slot === 'ultimate' ? 'ultimate' : 'tactical';
  const lang = b.lang === 'en' ? 'en' : 'th';
  return { prompt, slot, lang };
}

/** Only a busy provider (`isBusy`: 429, 5xx) is worth another try; anything else is a wrong request. */
const ATTEMPTS = 3;
/** The whole forge, code path and data fallback together, stays inside this. */
const TOTAL_MS = 60000;
const DATA_MS = 30000;
/** The code path failed because the provider did (not the script): the data path would only wait again. */
const providerDown = (reason: string) => /^designer(-timeout$|:http-)/.test(reason);

export async function forge(req: ForgeRequest, env: ForgeEnv, opts: CodeForgeOptions = {}): Promise<ForgeResponse> {
  // one budget for everything, also ended by the caller (a client that hung up)
  const total = opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(TOTAL_MS)]) : AbortSignal.timeout(TOTAL_MS);
  let fallbackReason: string | undefined;
  let tryData = Boolean(env.apiKey);
  if (env.apiKey && env.codeSkills) {
    const c = await codeForge(req, env, { ...opts, signal: total });
    if (c.ok) {
      const r = balanceSkill(c.input, req.slot, 'ai');
      if (r.ok && r.skill.program) return { ok: true, skill: r.skill, power: r.power, cap: POWER_CAP[req.slot], notes: r.notes, via: 'ai', model: c.designer };
    }
    // not approved: no script is used anywhere; the data forge below takes over
    console.info(`[forge] code skill not used: ${c.ok ? 'failed re-referee' : c.reason}`);
    if (!c.ok && (providerDown(c.reason) || c.reason === 'cancelled')) {
      tryData = false;
      fallbackReason = c.reason === 'designer-timeout' ? 'timeout' : c.reason.replace(/^designer:/, '');
    }
  }
  opts.onEvent?.({ type: 'stage', stage: 'draft' });
  if (tryData && !total.aborted) {
    const signal = AbortSignal.any([total, AbortSignal.timeout(DATA_MS)]);
    const delay = opts.retryDelayMs ?? 900;
    const session = newSession();
    {
      // OpenCode Go answers an intermittent 429 server_error (issue #14): back off and retry
      // inside the same 30 s budget before falling back to the offline forge.
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
          const raw = await callModel(req, env, signal, session);
          const r = balanceSkill(raw, req.slot, 'ai');
          if (r.ok) return { ok: true, skill: r.skill, power: r.power, cap: POWER_CAP[req.slot], notes: r.notes, via: 'ai', model: env.model };
          fallbackReason = r.error;
          break;
        } catch (err) {
          fallbackReason = signal.aborted ? 'timeout' : err instanceof Error ? err.message : 'error';
          if (!isBusy(fallbackReason) || attempt === ATTEMPTS) break;
          await pause(delay * attempt, signal);
        }
      }
    }
  } else if (!env.apiKey) {
    fallbackReason = 'no-key';
  } else if (!fallbackReason) {
    fallbackReason = 'timeout';
  }
  const r = balanceSkill(offlineSkill(req.prompt, req.slot, req.lang), req.slot, 'offline');
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, skill: r.skill, power: r.power, cap: POWER_CAP[req.slot], notes: r.notes, via: 'offline', fallbackReason };
}

/** A client that sends `accept: application/x-ndjson` gets progress as it happens. */
export const wantsStream = (accept: string | null | undefined) => !!accept && accept.includes('application/x-ndjson');

/**
 * The forge as NDJSON: one `ForgeEvent` per line while it works, then
 * `{type:'result', response}`. The steady trickle of lines also keeps a slow
 * forge's connection alive through proxies and idle timeouts.
 */
export function forgeStream(req: ForgeRequest, env: ForgeEnv, opts: CodeForgeOptions = {}): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const hangUp = new AbortController();
  const signal = opts.signal ? AbortSignal.any([opts.signal, hangUp.signal]) : hangUp.signal;
  return new ReadableStream({
    async start(ctrl) {
      const line = (o: unknown) => {
        if (hangUp.signal.aborted) return;
        try {
          ctrl.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
        } catch {
          hangUp.abort(); // the stream closed under us
        }
      };
      try {
        const response = await forge(req, env, { ...opts, signal, onEvent: e => line(e) });
        line({ type: 'result', response });
      } catch {
        line({ type: 'result', response: { ok: false, error: 'server-error' } });
      }
      if (!hangUp.signal.aborted) ctrl.close();
    },
    // the client went away: stop calling the provider for a page nobody is watching
    cancel() {
      hangUp.abort();
    }
  });
}

/** A tiny rate limit so a stuck client can't burn the subscription. It counts forges,
 *  not provider calls: with retries one forge is up to ATTEMPTS calls. */
const hits = new Map<string, number[]>();
export function allow(ip: string, perMinute = 12): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter(t => now - t < 60000);
  if (list.length >= perMinute) return false;
  list.push(now);
  hits.set(ip, list);
  return true;
}
