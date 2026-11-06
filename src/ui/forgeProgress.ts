import type { ForgeEvent, ForgeResponse } from '../server/forge';
import { FORGE_STAGES } from '../skills/program';

const STAGES = new Set<string>(FORGE_STAGES);

function asEvent(o: unknown): ForgeEvent | null {
  if (!o || typeof o !== 'object') return null;
  const e = o as Record<string, unknown>;
  if (e.type === 'stage' && typeof e.stage === 'string' && STAGES.has(e.stage)) return { type: 'stage', stage: e.stage as Extract<ForgeEvent, { type: 'stage' }>['stage'] };
  if (e.type === 'vote' && typeof e.model === 'string' && (e.vote === 'pass' || e.vote === 'reject')) return { type: 'vote', model: e.model.slice(0, 40), vote: e.vote };
  return null;
}

/**
 * Reads the forge's NDJSON progress (`forgeStream` on the server), calling `onEvent` for each
 * stage and vote as it happens, and resolves with the final response. A server that answers
 * plain JSON (no streaming) is read as before.
 */
export async function readForgeStream(res: Response, onEvent: (e: ForgeEvent) => void): Promise<ForgeResponse> {
  if (!res.headers.get('content-type')?.includes('application/x-ndjson') || !res.body) return (await res.json()) as ForgeResponse;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: !done });
    if (done) buf += '\n'; // a last line without its newline still counts
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let o: unknown;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      if ((o as { type?: unknown })?.type === 'result') {
        const response = (o as { response?: unknown }).response;
        if (!response || typeof response !== 'object' || typeof (response as { ok?: unknown }).ok !== 'boolean') throw new Error('bad-result');
        return response as ForgeResponse;
      }
      const e = asEvent(o);
      if (e) onEvent(e);
    }
    if (done) throw new Error('no-result');
  }
}
