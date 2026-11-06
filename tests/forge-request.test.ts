import { describe, expect, test } from 'bun:test';
import { buildModelRequest, providerError } from '../src/server/forge';

const env = { apiKey: 'test-key', baseUrl: 'https://example.test/v1', model: 'deepseek-v4.1-flash' };
const req = { prompt: 'dash forward', slot: 'tactical' as const, lang: 'en' as const };

describe('buildModelRequest (OpenCode Go)', () => {
  test('sends a per-conversation x-opencode-session and its own user agent', () => {
    const a = buildModelRequest(req, env);
    const b = buildModelRequest(req, env);
    expect(a.headers['x-opencode-session']).toMatch(/^paper-shoot-[\w-]{8,}$/);
    // one forge call = one conversation: ids differ between calls
    expect(a.headers['x-opencode-session']).not.toBe(b.headers['x-opencode-session']);
    expect(a.headers['user-agent']).toMatch(/^paper-shoot\/\d/);
    expect(a.headers.authorization).toBe('Bearer test-key');
  });

  test('targets the chat completions route with the configured model', () => {
    const r = buildModelRequest(req, env);
    expect(r.url).toBe('https://example.test/v1/chat/completions');
    const body = JSON.parse(r.body);
    expect(body.model).toBe('deepseek-v4.1-flash');
    expect(body.messages[1].content).toContain('dash forward');
  });
});

describe('providerError', () => {
  test('keeps the provider error type so a failure is visible', () => {
    expect(providerError(400, '{"type":"error","error":{"type":"MissingSessionID","message":"x"}}')).toBe('http-400:MissingSessionID');
  });

  test('falls back to the status alone when the body is not the expected shape', () => {
    expect(providerError(502, '<html>bad gateway</html>')).toBe('http-502');
  });
});
