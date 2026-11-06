import { isBusy } from '../forgeReason.ts';

/**
 * The OpenCode Go client every forge agent uses. OpenCode Go routes on a per-conversation
 * `x-opencode-session` and asks clients to name themselves in `user-agent`
 * (docs: /v2/docs/console/go/); without the session header it answers 400 MissingSessionID
 * (issue #14). The key is read from the server env only.
 */
export interface Provider {
  apiKey?: string;
  baseUrl: string;
}

export const USER_AGENT = 'paper-shoot/0.1';
export const newSession = () => `paper-shoot-${crypto.randomUUID()}`;

export const headers = (p: Provider, session: string) => ({
  'content-type': 'application/json',
  authorization: `Bearer ${p.apiKey}`,
  'user-agent': USER_AGENT,
  'x-opencode-session': session
});

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

/** A backoff that ends early when the caller's budget runs out. */
export const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>(done => {
    const t = setTimeout(done, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), done()), { once: true });
  });

export interface ChatCall {
  model: string;
  system: string;
  user: string;
  /** model-specific request fields: temperature, max_tokens, reasoning_effort */
  params: Record<string, unknown>;
  signal: AbortSignal;
  attempts?: number;
  retryDelayMs?: number;
  /** stream the reply; called with the text so far each time more arrives */
  onText?: (soFar: string) => void;
}

/** Reads an OpenAI-style SSE body, calling `onText` with the growing reply. */
async function readStream(res: Response, onText: (soFar: string) => void): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return text;
      try {
        const delta = (JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content;
        if (delta) onText((text += delta));
      } catch {
        /* a keep-alive or partial line */
      }
    }
  }
  return text;
}

/** One conversation: the reply text. A busy provider is retried with the same session. */
export async function chat(p: Provider, c: ChatCall): Promise<string> {
  const session = newSession();
  const attempts = c.attempts ?? 2;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: c.signal,
      headers: headers(p, session),
      body: JSON.stringify({ model: c.model, ...c.params, ...(c.onText ? { stream: true } : {}), messages: [{ role: 'system', content: c.system }, { role: 'user', content: c.user }] })
    });
    if (res.ok && c.onText && res.headers.get('content-type')?.includes('text/event-stream')) return readStream(res, c.onText);
    if (res.ok) {
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const out = String(data.choices?.[0]?.message?.content ?? '');
      c.onText?.(out); // a provider that ignored `stream`: one big chunk
      return out;
    }
    const reason = providerError(res.status, await res.text().catch(() => ''));
    if (!isBusy(reason) || attempt >= attempts) throw new Error(reason);
    await pause((c.retryDelayMs ?? 900) * attempt, c.signal);
  }
}
