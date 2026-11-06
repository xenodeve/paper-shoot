import { balanceSkill, EFFECT_TYPES, ICONS, POWER_CAP, type BalanceNote, type Skill, type Slot } from '../skills/balance.ts';
import { offlineSkill } from '../skills/offline.ts';

/**
 * The forge endpoint, shared by the Vite dev middleware and the Bun server.
 * The API key is read here, on the server, and never reaches the browser.
 */
export interface ForgeEnv {
  apiKey?: string;
  baseUrl: string;
  model: string;
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
    model: source.OPENCODE_GO_MODEL || DEFAULT_MODEL
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

const USER_AGENT = 'paper-shoot/0.1';

/**
 * The HTTP request for one forge call. OpenCode Go routes on a per-conversation
 * `x-opencode-session` and asks clients to name themselves in `user-agent`
 * (docs: /v2/docs/console/go/); without the session header it answers
 * 400 MissingSessionID (issue #14). One forge call is one conversation.
 */
export function buildModelRequest(req: ForgeRequest, env: ForgeEnv) {
  return {
    url: `${env.baseUrl}/chat/completions`,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.apiKey}`,
      'user-agent': USER_AGENT,
      'x-opencode-session': `paper-shoot-${crypto.randomUUID()}`
    } as Record<string, string>,
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

/** `http-<status>` plus the provider's error type when it sent one, so a failure says why. */
export function providerError(status: number, body: string): string {
  try {
    const t = (JSON.parse(body) as { error?: { type?: unknown } }).error?.type;
    if (typeof t === 'string' && /^[\w.-]{1,60}$/.test(t)) return `http-${status}:${t}`;
  } catch {
    /* not JSON */
  }
  return `http-${status}`;
}

async function callModel(req: ForgeRequest, env: ForgeEnv, signal: AbortSignal): Promise<unknown> {
  const r = buildModelRequest(req, env);
  const res = await fetch(r.url, { method: 'POST', signal, headers: r.headers, body: r.body });
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

/** A busy provider (429, 5xx) is worth another try; anything else is a wrong request and is not. */
const RETRYABLE = /^http-(429|5\d\d)\b/;
const ATTEMPTS = 3;

export async function forge(req: ForgeRequest, env: ForgeEnv, opts: { retryDelayMs?: number } = {}): Promise<ForgeResponse> {
  let fallbackReason: string | undefined;
  if (env.apiKey) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    const delay = opts.retryDelayMs ?? 900;
    try {
      // OpenCode Go answers an intermittent 429 server_error (issue #14): back off and retry
      // inside the same 30 s budget before falling back to the offline forge.
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
          const raw = await callModel(req, env, ctrl.signal);
          const r = balanceSkill(raw, req.slot, 'ai');
          if (r.ok) return { ok: true, skill: r.skill, power: r.power, cap: POWER_CAP[req.slot], notes: r.notes, via: 'ai', model: env.model };
          fallbackReason = r.error;
          break;
        } catch (err) {
          fallbackReason = ctrl.signal.aborted ? 'timeout' : err instanceof Error ? err.message : 'error';
          if (ctrl.signal.aborted || !RETRYABLE.test(fallbackReason) || attempt === ATTEMPTS) break;
          await new Promise(res => setTimeout(res, delay * attempt));
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } else {
    fallbackReason = 'no-key';
  }
  const r = balanceSkill(offlineSkill(req.prompt, req.slot, req.lang), req.slot, 'offline');
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, skill: r.skill, power: r.power, cap: POWER_CAP[req.slot], notes: r.notes, via: 'offline', fallbackReason };
}

/** A tiny rate limit so a stuck client can't burn the subscription. */
const hits = new Map<string, number[]>();
export function allow(ip: string, perMinute = 12): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter(t => now - t < 60000);
  if (list.length >= perMinute) return false;
  list.push(now);
  hits.set(ip, list);
  return true;
}
