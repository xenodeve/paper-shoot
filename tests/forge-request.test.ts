import { describe, expect, test } from 'bun:test';
import { buildModelRequest, providerError } from '../src/server/forge';

const env = { apiKey: 'test-key', baseUrl: 'https://example.test/v1', model: 'deepseek-v4.1-flash' };
const req = { prompt: 'dash forward', slot: 'tactical' as const, lang: 'en' as const };

describe('buildModelRequest (OpenCode Go)', () => {
  test('sends the given x-opencode-session and its own user agent', () => {
    // one id per forge call; that retries share it is tested in forge-retry.test.ts
    const a = buildModelRequest(req, env, 'paper-shoot-abc123');
    expect(a.headers['x-opencode-session']).toBe('paper-shoot-abc123');
    expect(a.headers['user-agent']).toMatch(/^paper-shoot\/\d/);
    expect(a.headers.authorization).toBe('Bearer test-key');
  });

  test('targets the chat completions route with the configured model', () => {
    const r = buildModelRequest(req, env, 'paper-shoot-s');
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
