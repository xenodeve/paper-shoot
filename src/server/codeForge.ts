import { checkProgram, POWER_CAP } from '../skills/balance.ts';
import type { Program, Vote } from '../skills/program.ts';
import { buildTable } from './codeReferee.ts';
import { DESIGNER, REVIEWER, type Lens } from './codePrompts.ts';
import { chat, type Provider } from './opencode.ts';

/**
 * The code-skill forge (issue #18, ADR 0003): designer → referee → panel.
 * Only the referee (our code) guarantees anything; the panel can only veto.
 */

export const DESIGNERS = ['deepseek-v4.1-flash', 'glm-5.3-flash'];

/** Five reviewers from different vendors, each digging deepest on one question. */
export const PANEL: { model: string; lens: Lens; params: Record<string, unknown> }[] = [
  { model: 'glm-5.3-flash', lens: 'safety', params: { temperature: 0, max_tokens: 800 } },
  { model: 'deepseek-v4.1-flash', lens: 'redteam', params: { temperature: 0, max_tokens: 2000 } },
  { model: 'gpt-5.6-luna', lens: 'counterplay', params: { temperature: 0, max_tokens: 800 } },
  { model: 'mimo-v2.6-flash', lens: 'spikes', params: { temperature: 0, max_tokens: 1200 } },
  // without a low effort it spends every token thinking and answers nothing (measured)
  { model: 'muse-spark-1.3-contributor', lens: 'fidelity', params: { temperature: 0, max_tokens: 4000, reasoning_effort: 'low' } }
];

export const QUORUM = 3;
const DESIGN_MS = 25000;
const PANEL_MS = 15000;

export interface CodeForgeRequest {
  prompt: string;
  slot: 'tactical' | 'ultimate';
  lang: 'th' | 'en';
}

export type CodeForgeResult =
  | { ok: true; designer: string; power: number; input: { name: string; description: string; effects: never[]; program: Program } }
  | { ok: false; reason: string };

function parseDesign(text: string) {
  const code = text.match(/```(?:js|javascript)?\s*([\s\S]*?)```/)?.[1]?.trim();
  if (!code) return null;
  return { name: text.match(/NAME:\s*(.+)/)?.[1]?.trim() ?? '', description: text.match(/DESC:\s*(.+)/)?.[1]?.trim() ?? '', code };
}

function parseVote(text: string): { pass: boolean; reason: string } | null {
  const t = text.replace(/```(?:json)?/gi, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    const v = JSON.parse(t.slice(a, b + 1)) as Record<string, unknown>;
    if (typeof v.safe !== 'boolean' || typeof v.fair !== 'boolean' || typeof v.matchesIdea !== 'boolean') return null;
    return { pass: v.safe && v.fair && v.matchesIdea, reason: typeof v.reason === 'string' ? v.reason : '' };
  } catch {
    return null;
  }
}

const within = (ms: number) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
};

/** What the player sees while a skill is forged: real stages, emitted as they happen. */
export type ForgeStage = 'plan' | 'code' | 'logic' | 'review' | 'draft';
export type ForgeEvent = { type: 'stage'; stage: ForgeStage } | { type: 'vote'; model: string; vote: Vote['vote'] };

export interface CodeForgeOptions {
  retryDelayMs?: number;
  onEvent?: (e: ForgeEvent) => void;
}

export async function codeForge(req: CodeForgeRequest, provider: Provider, opts: CodeForgeOptions = {}): Promise<CodeForgeResult> {
  const emit = opts.onEvent ?? (() => {});
  const cap = POWER_CAP[req.slot];
  emit({ type: 'stage', stage: 'plan' });
  const lang = req.lang === 'th' ? 'Thai' : 'English';

  // 1. Designer — the first model that answers with a script.
  let design: ReturnType<typeof parseDesign> = null;
  let designer = '';
  let why = 'designer-failed';
  const d = within(DESIGN_MS);
  let coding = false;
  try {
    for (const model of DESIGNERS) {
      try {
        const text = await chat(provider, {
          model,
          system: DESIGNER,
          user: `Slot: ${req.slot} (budget ${cap}). Player language: ${lang}.\nIdea: ${req.prompt}`,
          params: { temperature: 0.9, max_tokens: 3000 },
          signal: d.signal,
          retryDelayMs: opts.retryDelayMs,
          // planning is the NAME/DESC part; the moment the code block opens, it is coding
          onText: soFar => {
            if (!coding && soFar.includes('```')) {
              coding = true;
              emit({ type: 'stage', stage: 'code' });
            }
          }
        });
        design = parseDesign(text);
        if (design) {
          designer = model;
          break;
        }
        why = 'designer-no-code';
      } catch (e) {
        why = d.signal.aborted ? 'designer-timeout' : `designer:${e instanceof Error ? e.message : 'error'}`;
        if (d.signal.aborted) break;
      }
    }
  } finally {
    d.done();
  }
  if (!design) return { ok: false, reason: why };

  // 2. Referee — our code, the only guarantee. A refusal never reaches the panel.
  emit({ type: 'stage', stage: 'logic' });
  const built = await buildTable(design.code);
  if (!built.ok) return { ok: false, reason: `referee:${built.error}` };
  const judged = checkProgram({ source: design.code, table: built.table, votes: [] }, req.slot);
  if (!judged.ok) return { ok: false, reason: `referee:${judged.error}` };
  const power = Math.round(judged.power * 10) / 10;

  // 3. Panel — in parallel; ≥ QUORUM usable votes, and any reject rejects.
  const review = `Idea: ${req.prompt}\nSlot: ${req.slot}\nNAME: ${design.name}\nDESC: ${design.description}\nMeasured worst-case power: ${power}/${cap}\nCode:\n${design.code}`;
  emit({ type: 'stage', stage: 'review' });
  const p = within(PANEL_MS);
  const votes: (Vote | null)[] = await Promise.all(
    PANEL.map(async r => {
      try {
        const v = parseVote(await chat(provider, { model: r.model, system: REVIEWER(r.lens), user: review, params: r.params, signal: p.signal, retryDelayMs: opts.retryDelayMs }));
        if (!v) return null;
        const vote = v.pass ? ('pass' as const) : ('reject' as const);
        emit({ type: 'vote', model: r.model, vote });
        return { model: r.model, vote, reason: v.reason };
      } catch {
        return null;
      }
    })
  ).finally(p.done);
  const usable = votes.filter((v): v is Vote => v !== null);
  if (usable.length < QUORUM) return { ok: false, reason: 'panel-quorum' };
  if (usable.some(v => v.vote === 'reject')) return { ok: false, reason: 'panel-reject' };

  return {
    ok: true,
    designer,
    power,
    input: { name: design.name, description: design.description, effects: [], program: { ...judged.program, votes: usable } }
  };
}
