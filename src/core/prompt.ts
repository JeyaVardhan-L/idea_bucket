import type { CandidateItem } from './types';

export const SYSTEM_PROMPT = `You turn a person's rambling spoken thought into short, clear notes. Rules: 1) Split the transcript into separate items when it contains several thoughts. 2) Each item is ONE sentence, ideally under 20 words, that keeps every concrete detail: names, numbers, places, dates, tools, reasons. Remove filler words, never remove meaning. 3) type is one of: task (something to do), call (contact or ask someone), delegate (assign work to someone), idea (something to build or try), learn (a skill or topic to study), remember (a fact or insight to keep). 4) person: the person involved, or null. 5) due_date: YYYY-MM-DD if a deadline is stated or clearly implied relative to today's date, else null. 6) Compare against the existing items list: if the thought is the same as an existing item, set match.kind='duplicate' and match.id to its id; if it is clearly connected but different, use 'related'; otherwise 'new'. Output ONLY JSON: {"items":[{"type":...,"text":...,"person":...,"due_date":...,"excerpt":...,"match":{"kind":"new|duplicate|related","id":null|"..."}}]}

Additional rules:
- excerpt: copy the exact words from the transcript that this item came from (verbatim, including filler), so the original wording is never lost.
- Speech-to-text makes mistakes; fix obvious mis-hearings only when certain, otherwise keep the words as heard.
- Do not invent details that were not said. Do not merge two different actions into one item. Keep the speaker's reason ("because ...", "so that ...") in the same item.
- Messaging, emailing, texting, phoning or asking someone is "call". Telling/asking someone ELSE to do a piece of work for you is "delegate".
- "duplicate" means the same underlying thought even if worded differently (e.g. "ring mum about Sunday lunch" == "call Mum re lunch on Sunday"). If a new detail is added, still use duplicate and write the text with all details combined.
- "related" means same topic/person/project but a different action or fact; give the id of the closest existing item.
- Only use ids that appear in the existing items list. If the list is empty, every match is "new".
- If the transcript contains no meaningful thought (silence, noise, "test test"), return {"items":[]}.
- Resolve relative dates ("tomorrow", "by Friday", "end of the month") using today's date given below.`;

export const JSON_REMINDER =
  'Your previous reply was not valid JSON matching the schema. Return valid JSON only: a single object {"items":[...]} with no commentary, no markdown and no code fences.';

/**
 * Candidate items are sent with short aliases (e1, e2, ...) instead of UUIDs:
 * fewer tokens, and the model copies short ids far more reliably.
 */
export interface AliasedCandidates {
  lines: string;
  aliasToId: Map<string, string>;
}

export function aliasCandidates(items: CandidateItem[]): AliasedCandidates {
  const aliasToId = new Map<string, string>();
  const rows: string[] = [];
  items.forEach((it, i) => {
    const alias = `e${i + 1}`;
    aliasToId.set(alias, it.id);
    rows.push(JSON.stringify({ id: alias, type: it.type, text: it.text }));
  });
  return { lines: rows.join('\n'), aliasToId };
}

export function buildUserMessage(todayLabel: string, transcript: string, candidates: AliasedCandidates): string {
  return [
    `Today's date: ${todayLabel}`,
    '',
    'Existing open items (one JSON object per line):',
    candidates.lines.length ? candidates.lines : '(none)',
    '',
    'Transcript:',
    `"""${transcript.trim()}"""`,
  ].join('\n');
}
