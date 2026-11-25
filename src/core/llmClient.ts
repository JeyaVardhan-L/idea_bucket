import { JSON_REMINDER, SYSTEM_PROMPT } from './prompt';
import { parseLlmOutput, type LlmResult } from './llmParse';

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * kind:
 * - transient: network down, timeout, 5xx, 429 → keep queued and retry with backoff
 * - config: missing/invalid key, unknown model, bad URL → fail visibly until settings are fixed
 * - output: model answered but not with valid JSON (after one retry) → fail visibly
 */
export type LlmErrorKind = 'transient' | 'config' | 'output';

export class LlmError extends Error {
  constructor(
    message: string,
    public kind: LlmErrorKind,
    public retryAfterMs: number | null = null,
    public status: number | null = null,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export function chatUrl(baseUrl: string): string {
  const b = baseUrl.trim().replace(/\/+$/, '');
  return b.endsWith('/chat/completions') ? b : `${b}/chat/completions`;
}

/** Retry-After may be seconds or an HTTP date. */
export function parseRetryAfter(h: string | null, now = Date.now()): number | null {
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const t = Date.parse(h);
  return Number.isNaN(t) ? null : Math.max(0, t - now);
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function chat(cfg: LlmConfig, messages: ChatMessage[], fetchImpl: FetchLike, maxTokens = 2048): Promise<string> {
  if (!cfg.apiKey.trim()) throw new LlmError('No API key set. Add it in Settings.', 'config');
  if (!/^https?:\/\//i.test(cfg.baseUrl.trim())) throw new LlmError('API base URL must start with https://', 'config');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 90_000);
  let res: Response;
  try {
    res = await fetchImpl(chatUrl(cfg.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${cfg.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: cfg.model.trim(),
        messages,
        temperature: 0.1,
        top_p: 0.9,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    throw new LlmError(aborted ? 'AI request timed out' : `Network error: ${(e as Error)?.message ?? e}`, 'transient');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      /* ignore */
    }
    const msg = `AI API HTTP ${res.status}${detail ? `: ${detail}` : ''}`;
    if (res.status === 429) throw new LlmError(msg, 'transient', parseRetryAfter(res.headers.get('retry-after')), 429);
    if (res.status === 408 || res.status >= 500) throw new LlmError(msg, 'transient', null, res.status);
    if (res.status === 401 || res.status === 403) throw new LlmError(`API key rejected (HTTP ${res.status}). Check Settings.`, 'config', null, res.status);
    if (res.status === 404) throw new LlmError(`Model or URL not found (HTTP 404). Check Settings.`, 'config', null, 404);
    throw new LlmError(msg, 'config', null, res.status);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new LlmError('AI API returned a non-JSON response', 'transient');
  }
  const content = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new LlmError('AI API response had no message content', 'output');
  return content;
}

export interface ExtractOutcome {
  result: LlmResult;
  calls: number;
  raw: string;
}

/** Sends the transcript, parses robustly, retries once with a JSON-only reminder. */
export async function extractItems(cfg: LlmConfig, userMessage: string, fetchImpl: FetchLike = fetch): Promise<ExtractOutcome> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];
  const first = await chat(cfg, messages, fetchImpl);
  const p1 = parseLlmOutput(first);
  if (p1.ok) return { result: p1.value, calls: 1, raw: first };

  const second = await chat(
    cfg,
    [...messages, { role: 'assistant', content: first.slice(0, 4000) }, { role: 'user', content: JSON_REMINDER }],
    fetchImpl,
  );
  const p2 = parseLlmOutput(second);
  if (p2.ok) return { result: p2.value, calls: 2, raw: second };
  throw new LlmError(`AI output could not be parsed: ${p2.error}`, 'output');
}

/** Minimal request used by Settings → "Test connection". */
export async function testConnection(cfg: LlmConfig, fetchImpl: FetchLike = fetch): Promise<string> {
  const reply = await chat(
    { ...cfg, timeoutMs: 45_000 },
    [{ role: 'user', content: 'Reply with the single word: OK' }],
    fetchImpl,
    16,
  );
  return reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim().slice(0, 40);
}
