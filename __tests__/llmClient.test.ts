import { chatUrl, extractItems, LlmError, parseRetryAfter, testConnection } from '../src/core/llmClient';

const cfg = { baseUrl: 'https://api.example.com/v1/', apiKey: 'k', model: 'm' };

function resp(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => headers[h.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}
const content = (s: string) => ({ choices: [{ message: { content: s } }] });
const valid = JSON.stringify({ items: [{ type: 'task', text: 'Do it', person: null, due_date: null, match: { kind: 'new', id: null } }] });

describe('llmClient', () => {
  it('builds the chat URL', () => {
    expect(chatUrl('https://x/v1/')).toBe('https://x/v1/chat/completions');
    expect(chatUrl('https://x/v1/chat/completions')).toBe('https://x/v1/chat/completions');
  });
  it('parses Retry-After seconds and dates', () => {
    expect(parseRetryAfter('5')).toBe(5000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 0)).toBe(10_000);
    expect(parseRetryAfter(null)).toBeNull();
  });
  it('sends auth header and returns parsed items', async () => {
    const f = jest.fn(async (_u: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe('m');
      expect(body.messages[0].role).toBe('system');
      return resp(200, content(valid));
    });
    const out = await extractItems(cfg, 'hi', f);
    expect(out.calls).toBe(1);
    expect(out.result.items).toHaveLength(1);
    expect(f.mock.calls[0]![0]).toBe('https://api.example.com/v1/chat/completions');
  });
  it('retries once with a JSON reminder', async () => {
    const f = jest.fn().mockResolvedValueOnce(resp(200, content('sorry, here you go: items are...'))).mockResolvedValueOnce(resp(200, content('```json\n' + valid + '\n```')));
    const out = await extractItems(cfg, 'hi', f);
    expect(out.calls).toBe(2);
    const second = JSON.parse(f.mock.calls[1]![1].body);
    expect(second.messages.at(-1).content).toMatch(/valid JSON only/);
  });
  it('fails with output error after two bad replies', async () => {
    const f = jest.fn().mockResolvedValue(resp(200, content('nope')));
    await expect(extractItems(cfg, 'hi', f)).rejects.toMatchObject({ kind: 'output' });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('classifies 429 as transient with retry-after', async () => {
    const f = jest.fn().mockResolvedValue(resp(429, 'slow down', { 'retry-after': '12' }));
    await expect(extractItems(cfg, 'hi', f)).rejects.toMatchObject({ kind: 'transient', retryAfterMs: 12000, status: 429 });
  });
  it('classifies 5xx and network errors as transient', async () => {
    await expect(extractItems(cfg, 'hi', jest.fn().mockResolvedValue(resp(503, 'x')))).rejects.toMatchObject({ kind: 'transient' });
    await expect(extractItems(cfg, 'hi', jest.fn().mockRejectedValue(new TypeError('Network request failed')))).rejects.toMatchObject({ kind: 'transient' });
  });
  it('classifies 401/404 as config errors', async () => {
    await expect(extractItems(cfg, 'hi', jest.fn().mockResolvedValue(resp(401, 'x')))).rejects.toMatchObject({ kind: 'config' });
    await expect(extractItems(cfg, 'hi', jest.fn().mockResolvedValue(resp(404, 'x')))).rejects.toMatchObject({ kind: 'config' });
  });
  it('refuses to call without a key', async () => {
    const f = jest.fn();
    await expect(extractItems({ ...cfg, apiKey: ' ' }, 'hi', f)).rejects.toBeInstanceOf(LlmError);
    expect(f).not.toHaveBeenCalled();
  });
  it('testConnection strips think blocks', async () => {
    const f = jest.fn().mockResolvedValue(resp(200, content('<think>x</think> OK')));
    await expect(testConnection(cfg, f)).resolves.toBe('OK');
  });
});
