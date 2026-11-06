import { getQuickJS, shouldInterruptAfterDeadline, type QuickJSWASMModule } from 'quickjs-emscripten';
import { ALL_CTX, MAX_DELAY_S, MAX_ROW_EFFECTS, type Ctx } from '../skills/program.ts';
import { EFFECT_TYPES } from '../skills/balance.ts';

/**
 * Runs an AI-written skill script in QuickJS (WASM), once per context, and returns the
 * raw effect table. Server only (ADR 0003). The script gets no host functions at all: it
 * can only push into a list that lives in a closure, and the host reads back one JSON
 * string. `checkProgram` then clamps every effect and prices every row.
 */

const LIMITS = { ms: 50, memory: 4 * 1024 * 1024, stack: 256 * 1024, output: 8000, afters: 4 };

const HARDEN = `
  delete globalThis.Date;
  Math.random = undefined;
  for (const o of [Object, Object.prototype, Array, Array.prototype, Function.prototype, JSON, Math, String.prototype, Number.prototype, Boolean.prototype]) Object.freeze(o);
  const __stringify = JSON.stringify;
`;

const driver = (ctx: Ctx) => `(() => {
  const out = []; const queue = []; let t = 0; let afters = 0;
  const mk = type => o => {
    if (out.length >= ${MAX_ROW_EFFECTS}) throw new Error('too-many-effects');
    const e = {};
    if (o && typeof o === 'object') for (const k in o) { const v = o[k]; e[k] = typeof v === 'number' || typeof v === 'string' ? v : null; }
    e.type = type; e.at = t; out.push(e);
  };
  const api = Object.freeze({
    ${EFFECT_TYPES.map(x => `${x}: mk('${x}')`).join(',\n    ')},
    after(sec, fn) {
      if (++afters > ${LIMITS.afters}) throw new Error('too-many-after');
      sec = +sec;
      if (!(sec >= 0 && t + sec <= ${MAX_DELAY_S})) throw new Error('bad-delay');
      if (typeof fn !== 'function') throw new Error('bad-callback');
      queue.push([t + sec, fn]);
    }
  });
  if (typeof onCast !== 'function') throw new Error('no-onCast');
  onCast(api, Object.freeze(${JSON.stringify(ctx)}));
  while (queue.length) { queue.sort((a, b) => a[0] - b[0]); const next = queue.shift(); t = next[0]; next[1](); }
  return __stringify(out);
})()`;

let quickjs: Promise<QuickJSWASMModule> | null = null;

function runOnce(mod: QuickJSWASMModule, code: string, ctx: Ctx): { ok: true; row: unknown[] } | { ok: false; error: string } {
  const rt = mod.newRuntime();
  rt.setMemoryLimit(LIMITS.memory);
  rt.setMaxStackSize(LIMITS.stack);
  rt.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + LIMITS.ms));
  const vm = rt.newContext();
  try {
    const steps = [HARDEN, code, driver(ctx)];
    for (let i = 0; i < steps.length; i++) {
      const r = vm.evalCode(steps[i]);
      if (r.error) {
        const err = vm.dump(r.error) as { message?: unknown } | unknown;
        r.error.dispose();
        const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err);
        return { ok: false, error: msg.replace(/[^\w .:'-]/g, '').slice(0, 60) || 'script-error' };
      }
      const value = vm.dump(r.value);
      r.value.dispose();
      if (i < steps.length - 1) continue;
      if (typeof value !== 'string' || value.length > LIMITS.output) return { ok: false, error: 'bad-output' };
      const row = JSON.parse(value) as unknown;
      return Array.isArray(row) ? { ok: true, row } : { ok: false, error: 'bad-output' };
    }
    return { ok: false, error: 'no-output' };
  } catch {
    return { ok: false, error: 'sandbox-error' };
  } finally {
    vm.dispose();
    rt.dispose();
  }
}

/** The script's effects in every context, or why it was refused. */
export async function buildTable(code: string): Promise<{ ok: true; table: unknown[][] } | { ok: false; error: string }> {
  if (typeof code !== 'string' || !code.trim() || code.length > 4000) return { ok: false, error: 'bad-source' };
  quickjs ??= getQuickJS();
  const mod = await quickjs;
  const table: unknown[][] = [];
  for (const ctx of ALL_CTX) {
    const r = runOnce(mod, code, ctx);
    if (!r.ok) return r;
    table.push(r.row);
  }
  return { ok: true, table };
}
