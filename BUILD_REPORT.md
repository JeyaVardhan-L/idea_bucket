# Build report: Idea Bucket

_Built unattended on 2026-11-25._

**Latest APK:** https://github.com/JeyaVardhan-L/idea_bucket/releases/latest

## What was built

### Phase 1: core
- **Capture screen**: large record button. Recording starts as soon as you tap and stops on its own after about 4 s of silence (configurable 2–8 s); you can also stop it by hand. Shows a live level ring, a timer, "saved ✓", and today's items.
- **Recording that can't be lost**: a capture row is written to SQLite *before* the microphone starts. Audio is streamed natively (expo-audio `useAudioStream`, 16 kHz mono int16) into a WAV file in app documents, and the header is kept valid while recording. If the app is backgrounded mid-recording it saves what it has. At start-up, captures stuck in `recording` and orphan WAV files are recovered. Audio is never deleted unless a transcript exists.
- **On-device speech-to-text**: whisper.rn 0.7 (whisper.cpp). `base.en` is the default and `tiny.en` is optional. Models download from Hugging Face (`ggerganov/whisper.cpp`) with a progress bar; the download goes to a `.part` file first and is size-checked. The WAV is parsed in JS (it tolerates a header that was never finalised) and resampled to 16 kHz if the hardware chose another rate.
- **AI step**: an OpenAI-compatible client with configurable base URL, key and model. Output is validated with zod and normalised (type synonyms, null-ish strings, invalid dates become null). Code fences and `<think>` blocks are stripped and trailing commas and smart quotes repaired. If parsing fails it retries once with a "valid JSON only" reminder, then marks the capture failed with a visible error.
- **Merge logic**: up to 200 of the most relevant open items (by word overlap, then recurrence, then recency) are sent with short aliases (`e1`…) instead of UUIDs. `new` inserts an item. `duplicate` increments the count, updates last_seen, and adds a source; it only replaces the text if the new wording keeps every concrete detail of the old text *and* adds at least one more. `related` inserts and links. Every item keeps the verbatim excerpt(s) it came from. Each merge is applied in one SQLite transaction together with marking the capture processed.
- **Offline queue**: states `recording → recorded → transcribed → processed | failed`. Transient errors (offline, timeout, 5xx, 429) back off exponentially (30 s → 1 h, ±20 % jitter, Retry-After honoured). Config errors (no key, 401/403/404) and unparsable output become `failed` with the reason shown. The queue runs on app start, when the app comes to the foreground, when the network returns, on a timer for the next due retry, through expo-background-task (about every 15 min), and on manual Retry.
- **Items list**: grouped by type with icons, a ×N badge, and tap-to-complete. The detail screen lets you edit text, type, person and due date, delete the item, and see "What you said" (excerpts with capture times and the full transcript) plus related items.
- **Queue screen**: a pill on Capture shows "N processing · M failed". The queue screen shows each capture's state, error and next retry time, with Retry and Retry all.
- **Settings**: base URL, API key (secure store, masked, never exported), model, provider presets, Test connection, Whisper model choice with download/delete, silence length, audio retention.
- **Android app shortcut**: long-press the icon → **Record thought** (`ideabucket://record`), which opens straight into recording.
- Calm dark/light theme that follows the system.

### Phase 2
- Views: All, Today, This week, Recurring (sorted by count), By person (grouped).
- Filters: type (multi-select), person, open/done/all. Full-text search over text and person.

### Phase 3
- **Evening digest**: a local notification at 21:00 by default (time and on/off configurable) with today's counts by type and the top recurring open item. It is rescheduled whenever data changes and on app start.
- **Home-screen widget** (react-native-android-widget): a one-tap "Record thought" button that opens `ideabucket://record`.
- **Export/backup**: all captures, items, sources, links and settings go to one JSON file through the share sheet. **Import** validates the file with zod and merges it in without ever overwriting existing rows.
- **Quick Settings tile** (stretch): "Record thought" tile in the notification shade.

## Test results
_See the sections below; they are updated at the end of the run._

## Decisions
1. **LLM model**: `meta/llama-3.3-70b-instruct` was **not** in the NIM model list. I benchmarked the strongest general instruct models on a JSON task: `mistralai/mistral-large-4-1t-a52b` (45 s), `moonshotai/kimi-k3.1-pro` (>90 s timeout), `z-ai/glm-5.3-flash` (>90 s timeout), and `nvidia/nemotron-3-ultra-550b-a55b` (9 s, valid JSON, correct types). **Default: `nvidia/nemotron-3-ultra-550b-a55b`.**
2. **Recording format**: expo-audio's file recorder on Android only produces AAC/3GP/WebM, and whisper.rn only accepts WAV/PCM. I used expo-audio's newer native PCM stream with `startFileRecordingAsync({format:'wav'})`, which writes 16 kHz mono WAV directly. No transcoding is needed and it gives live levels for silence detection.
3. **whisper.rn import path**: the package's `exports` map has no `"."` entry, so the app imports `whisper.rn/index` (tsconfig maps its types). Metro needed the `buffer` npm package for whisper.rn's `safe-buffer` dependency.
4. **Extra capture columns**: `attempts`, `next_attempt_at`, `duration_ms`, and an extra `recording` status, so the queue/backoff and crash recovery are explicit. `item_sources` has a `created_at`.
5. **Prompt**: the given system prompt is used unchanged, with an "Additional rules" block appended (verbatim `excerpt` field, call vs delegate, duplicate vs related definitions, only use given ids, empty result for noise, resolve relative dates). The user message includes today's date *with weekday*.
6. **Empty AI result for real speech** (4+ words): kept as a `remember` item with the transcript, so a thought never silently disappears.
7. **Duplicate that the model links to an unknown id**: treated as a new item. Done items are not offered as duplicate candidates.
8. **Audio retention**: deletes audio only for captures that already have a transcript. `0` days = keep forever.
9. **Digest content**: Android local notifications have fixed text, so the digest is rescheduled on every data change and on app start/foreground, plus from the background task.
10. **ABIs**: `arm64-v8a,x86_64` only (phones + emulator). This keeps whisper.cpp build time and APK size down. 32-bit-only phones are not supported.
11. **Versioning**: `versionCode` = GitHub Actions run number (always increasing). `versionName`/tag = `0.<PHASE file>.<run number>`.
12. **Keystore**: PKCS12, RSA 4096, 100-year validity, random 32-char password. The backup is at `~/idea_bucket-keystore-BACKUP/` (outside the repo, mode 700).
13. **Secret hygiene**: `.env*`, keystores and backups are git-ignored. There is a local pre-commit hook (`scripts/precommit-check.sh`) and a CI step that fail if the NVIDIA key prefix appears anywhere. The pattern is written split in those scripts so the repo itself never contains it.

## Known issues / limitations

## What the owner must do
1. Install the APK from the latest release (allow "Install unknown apps").
2. In Settings, download the speech model (Wi-Fi), paste the NVIDIA API key, then Save and Test connection.
3. **Back up `~/idea_bucket-keystore-BACKUP/`** somewhere safe (password manager or offline drive).
4. Optionally add the "Record thought" widget and the Quick Settings tile.
