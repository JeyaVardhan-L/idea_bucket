/**
 * Live evaluation of the extraction prompt against a real OpenAI-compatible endpoint.
 *
 *   NVIDIA_API_KEY=... npm run eval:llm            # all cases
 *   NVIDIA_API_KEY=... npm run eval:llm -- 3 7     # only cases 3 and 7
 *
 * Env: NVIDIA_API_KEY (required, never printed), LLM_BASE_URL, LLM_MODEL.
 * Writes docs/llm-eval.md.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { extractItems, LlmError } from '../src/core/llmClient';
import { aliasCandidates, buildUserMessage } from '../src/core/prompt';
import { todayForPrompt } from '../src/core/dates';
import { DEFAULT_BASE_URL, DEFAULT_MODEL } from '../src/core/settings';
import type { CandidateItem, ItemType } from '../src/core/types';
import type { LlmItem } from '../src/core/llmParse';

interface Expect {
  /** every string must appear (case-insensitive) in the item's text */
  details: string[];
  type: ItemType | ItemType[];
  match?: 'new' | 'duplicate' | 'related';
  matchId?: string;
  person?: string | null;
  due?: string | null;
}

interface Case {
  name: string;
  transcript: string;
  existing: CandidateItem[];
  expect: Expect[];
}

// Fixed "today" so date expectations are stable: Wednesday 2026-11-25
const TODAY = new Date(2026, 10, 25, 9, 0);

const EXISTING: CandidateItem[] = [
  { id: 'it-mum', type: 'call', text: 'Call Mum about Sunday lunch plans' },
  { id: 'it-plants', type: 'idea', text: 'Build an app that reminds me to water the plants' },
  { id: 'it-tax', type: 'task', text: 'File the 2025 tax return before the January deadline' },
  { id: 'it-rust', type: 'learn', text: 'Learn Rust ownership and borrowing' },
  { id: 'it-gate', type: 'task', text: 'Fix the squeaky garden gate hinge' },
  { id: 'it-priya-deck', type: 'delegate', text: 'Ask Priya to finish the Q4 sales deck' },
];

const CASES: Case[] = [
  {
    name: 'multi-thought ramble',
    transcript:
      "okay so um a few things. first I really need to renew my passport because it expires in March, uh, and then I should probably call the dentist, Dr. Mehta, to move my appointment. oh and also an idea, what if the coffee shop app showed live queue length",
    existing: [],
    expect: [
      { details: ['passport', 'March'], type: 'task' },
      { details: ['dentist', 'Mehta', 'appointment'], type: 'call', person: 'Mehta' },
      { details: ['coffee', 'queue'], type: 'idea' },
    ],
  },
  {
    name: 'name + relative deadline',
    transcript: "remind me to send the signed contract to Daniel Okafor by friday, he needs it for the board meeting",
    existing: [],
    expect: [{ details: ['contract', 'Daniel', 'board meeting'], type: ['task', 'call'], due: '2026-11-27' }],
  },
  {
    name: 'pure remember fact',
    transcript: "just so I don't forget, the wifi password at the cabin is bluefin 4 4 7 1, all lowercase",
    existing: [],
    expect: [{ details: ['wifi', 'cabin', '4471'], type: 'remember' }],
  },
  {
    name: 'near-duplicate of existing call',
    transcript: 'uh I gotta ring mum about the lunch on sunday',
    existing: EXISTING,
    expect: [{ details: ['Mum', 'lunch', 'Sunday'], type: 'call', match: 'duplicate', matchId: 'it-mum' }],
  },
  {
    name: 'duplicate with added detail',
    transcript: "the plant watering app idea again, it could use a cheap soil moisture sensor with an ESP32",
    existing: EXISTING,
    expect: [{ details: ['plant', 'moisture', 'ESP32'], type: 'idea', match: 'duplicate', matchId: 'it-plants' }],
  },
  {
    name: 'delegate with person',
    transcript: "I should get Marco to handle the invoice reconciliation for the Lisbon office this week, I don't have time",
    existing: [],
    expect: [{ details: ['Marco', 'invoice', 'Lisbon'], type: 'delegate', person: 'Marco' }],
  },
  {
    name: 'learn topic',
    transcript: "hmm I keep seeing people talk about vector databases, I want to actually learn how pgvector indexing works, like HNSW versus IVF",
    existing: EXISTING,
    expect: [{ details: ['pgvector', 'HNSW', 'IVF'], type: 'learn', match: 'new' }],
  },
  {
    name: 'related to existing',
    transcript: "for the tax thing I need to find last year's donation receipts first, they're probably in the blue folder",
    existing: EXISTING,
    expect: [{ details: ['donation receipts', 'blue folder'], type: 'task', match: 'related', matchId: 'it-tax' }],
  },
  {
    name: 'two calls + numbers',
    transcript:
      "call the bank about the 250 euro charge from the 14th that I don't recognise. and text Sam that I'll be 20 minutes late tomorrow",
    existing: [],
    expect: [
      { details: ['bank', '250', '14'], type: 'call' },
      { details: ['Sam', '20 minutes', 'late'], type: 'call', person: 'Sam', due: '2026-11-26' },
    ],
  },
  {
    name: 'filler-heavy single task',
    transcript: "so like, you know, I mean basically, the the thing is I need to uh book the car in for its MOT, um, before the 10th of December at the Halfords on Mill Road",
    existing: [],
    expect: [{ details: ['MOT', 'Halfords', 'Mill Road'], type: 'task', due: '2026-12-10' }],
  },
  {
    name: 'repeat of existing learn',
    transcript: 'I really need to get my head around the borrow checker in rust',
    existing: EXISTING,
    expect: [{ details: ['Rust', 'borrow'], type: 'learn', match: 'duplicate', matchId: 'it-rust' }],
  },
  {
    name: 'insight + reason',
    transcript: "realisation: our churn spikes every time we change pricing without emailing customers first, so always announce price changes two weeks ahead",
    existing: [],
    expect: [{ details: ['churn', 'pricing', 'two weeks'], type: 'remember' }],
  },
  {
    name: 'mixed: duplicate + new',
    transcript:
      "that gate is still squeaking, need to fix the hinge, maybe WD-40. also new thing, order more printer ink, the HP 305 cartridges",
    existing: EXISTING,
    expect: [
      { details: ['gate', 'hinge'], type: 'task', match: 'duplicate', matchId: 'it-gate' },
      { details: ['ink', 'HP 305'], type: 'task', match: 'new' },
    ],
  },
  {
    name: 'end of month deadline + delegate follow-up',
    transcript: "Priya's sales deck for Q4, I need it from her by the end of the month, remind her it has to include the APAC numbers",
    existing: EXISTING,
    expect: [{ details: ['Priya', 'APAC'], type: ['delegate', 'call'], match: 'duplicate', matchId: 'it-priya-deck', due: '2026-11-30' }],
  },
  {
    name: 'noise only',
    transcript: 'test test one two',
    existing: [],
    expect: [],
  },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function itemMatches(e: Expect, it: LlmItem, aliasToId: Map<string, string>): string[] {
  const problems: string[] = [];
  const types = Array.isArray(e.type) ? e.type : [e.type];
  if (!types.includes(it.type)) problems.push(`type ${it.type} ≠ ${types.join('|')}`);
  const text = norm(it.text);
  for (const d of e.details) if (!text.includes(norm(d))) problems.push(`missing detail "${d}"`);
  if (e.match && it.match.kind !== e.match) problems.push(`match ${it.match.kind} ≠ ${e.match}`);
  if (e.matchId) {
    const real = it.match.id ? (aliasToId.get(it.match.id) ?? it.match.id) : null;
    if (real !== e.matchId) problems.push(`match id ${real} ≠ ${e.matchId}`);
  }
  if (e.person !== undefined && e.person !== null && !norm(it.person ?? '').includes(norm(e.person))) problems.push(`person ${it.person} ≠ ${e.person}`);
  if (e.due !== undefined && it.due_date !== e.due) problems.push(`due ${it.due_date} ≠ ${e.due}`);
  return problems;
}

/** Each expectation must be satisfied by a distinct returned item; no extra items allowed. */
function grade(c: Case, items: LlmItem[], aliasToId: Map<string, string>): string[] {
  const problems: string[] = [];
  if (items.length !== c.expect.length) problems.push(`expected ${c.expect.length} items, got ${items.length}`);
  const used = new Set<number>();
  c.expect.forEach((e, ei) => {
    let best: { idx: number; probs: string[] } | null = null;
    items.forEach((it, idx) => {
      if (used.has(idx)) return;
      const p = itemMatches(e, it, aliasToId);
      if (!best || p.length < best.probs.length) best = { idx, probs: p };
    });
    if (!best) problems.push(`expectation ${ei + 1}: no item`);
    else {
      const b = best as { idx: number; probs: string[] };
      used.add(b.idx);
      if (b.probs.length) problems.push(`item ${ei + 1}: ${b.probs.join('; ')}`);
    }
  });
  return problems;
}

async function main() {
  const apiKey = process.env.NVIDIA_API_KEY ?? process.env.LLM_API_KEY ?? '';
  if (!apiKey) {
    console.error('Set NVIDIA_API_KEY in the environment.');
    process.exit(2);
  }
  const cfg = { baseUrl: process.env.LLM_BASE_URL ?? DEFAULT_BASE_URL, apiKey, model: process.env.LLM_MODEL ?? DEFAULT_MODEL, timeoutMs: 120_000 };
  const only = process.argv.slice(2).map(Number).filter(Boolean);
  let calls = 0;
  let passed = 0;
  const rows: string[] = [];
  const details: string[] = [];
  for (const [i, c] of CASES.entries()) {
    const n = i + 1;
    if (only.length && !only.includes(n)) continue;
    const a = aliasCandidates(c.existing);
    const msg = buildUserMessage(todayForPrompt(TODAY), c.transcript, a);
    const t0 = Date.now();
    let problems: string[];
    let items: LlmItem[] = [];
    try {
      const out = await extractItems(cfg, msg);
      calls += out.calls;
      items = out.result.items;
      problems = grade(c, items, a.aliasToId);
      if (out.calls > 1) problems.push('(needed JSON retry)');
    } catch (e) {
      calls += e instanceof LlmError && e.kind === 'output' ? 2 : 1;
      problems = [`ERROR: ${(e as Error).message.replace(apiKey, '***')}`];
    }
    const ok = problems.filter((p) => !p.startsWith('(')).length === 0;
    if (ok) passed++;
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`${ok ? 'PASS' : 'FAIL'} #${n} ${c.name} (${secs}s)${problems.length ? ' — ' + problems.join(' | ') : ''}`);
    rows.push(`| ${n} | ${c.name} | ${ok ? '✅' : '❌'} | ${secs}s | ${problems.join('; ').replace(/\|/g, '/') || ''} |`);
    details.push(
      `### ${n}. ${c.name} ${ok ? '✅' : '❌'}\n\n> ${c.transcript}\n\n${
        c.existing.length ? `Existing items offered: ${c.existing.length}\n\n` : ''
      }\`\`\`json\n${JSON.stringify(items, null, 1)}\n\`\`\`\n`,
    );
  }
  const total = only.length ? only.length : CASES.length;
  console.log(`\nScore: ${passed}/${total}  (API calls: ${calls})`);
  if (!only.length) {
    mkdirSync('docs', { recursive: true });
    writeFileSync(
      'docs/llm-eval.md',
      `# LLM extraction eval\n\nModel: \`${cfg.model}\` · Endpoint: \`${cfg.baseUrl}\` · Fixed date: ${todayForPrompt(TODAY)} · Run: ${new Date().toISOString()}\n\n**Score: ${passed}/${total}** (API calls this run: ${calls})\n\nA case passes only when the item count is exact and every expected item has the right type, all listed concrete details, the expected match kind/id, person and due date.\n\n| # | Case | Result | Time | Problems |\n|---|------|--------|------|----------|\n${rows.join('\n')}\n\n## Raw outputs\n\n${details.join('\n')}`,
    );
    console.log('Wrote docs/llm-eval.md');
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
