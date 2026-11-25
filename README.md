# Idea Bucket

Record spoken thoughts in a couple of seconds. Idea Bucket transcribes them **on your phone** (Whisper), then an AI model turns each recording into short, clear items: tasks, calls, things to delegate, ideas, things to learn, things to remember. It keeps every concrete detail, and when the same thought comes back it merges it into the existing item (×2, ×3 …) instead of making a duplicate.

Open the app, tap, speak, leave. Recording stops by itself after about 4 seconds of silence.

## Features

- **Fast capture**: big record button, auto-stop on silence, manual stop, "saved ✓". The audio goes to a file on the phone straight away, so a thought is never lost, even with no network or if the app is killed.
- **Ways to start recording**: long-press the app icon and pick **Record thought**, add the **Record thought** home-screen widget, or open `ideabucket://record`.
- **On-device speech-to-text**: whisper.cpp through `whisper.rn`. `base.en` is the default; `tiny.en` is faster. The model downloads once.
- **AI step**: works with any OpenAI-compatible chat-completions API. The default is NVIDIA NIM. The AI only ever sees the text, never the audio.
- **Merging**: duplicates get a higher count and keep every original wording as "What you said". Related thoughts get linked to each other.
- **Offline queue**: captures wait in a queue and retry automatically with exponential backoff (HTTP 429 is handled). The queue runs again when the app opens, when the network comes back, in the background about every 15 minutes, and when you tap **Retry**.
- **Items**: grouped by type, with a ×N badge for recurring thoughts. Tap the circle to mark an item done. Tap an item to edit, delete, or see the original transcript excerpts.
- **Views and filters**: Today, This week, Recurring, By person. Filter by type, person, or open/done, and search.
- **Evening digest**: a notification at 21:00 by default (you can change the time) with today's counts and the top recurring item.
- **Export / import**: all your data as one JSON file through the share sheet.
- **Privacy**: audio is deleted after 7 days (you can change this; 0 keeps it forever). Transcripts are kept forever. Audio that hasn't been transcribed yet is never deleted.

## Install

1. Open the [latest release](https://github.com/JeyaVardhan-L/idea_bucket/releases/latest) on your Android phone and download `idea-bucket-<version>.apk`.
2. Open the file. If Android blocks it, allow your browser or file manager to **Install unknown apps** (Settings → Apps → *your browser* → Install unknown apps), then open the APK again.
3. Updates install over the old version and keep your data, because every release is signed with the same key.

Requires Android 7.0 or newer on an arm64 phone. The APK also includes x86_64 for emulators.

## First-run setup

1. **Speech model**: go to **Settings → Speech model** and tap the download icon next to `base.en` (~142 MB) or `tiny.en` (~75 MB). Use Wi-Fi. Anything you record before the download finishes stays in the queue and is transcribed once the model is there.
2. **AI key**: go to **Settings → AI provider**, paste your API key, tap **Save**, then **Test connection**.
   - Default endpoint: `https://integrate.api.nvidia.com/v1`, model `nvidia/nemotron-3-ultra-550b-a55b`. You can get a free key at build.nvidia.com.
   - The key is kept in Android's encrypted secure storage on the phone. It is never part of the app or the repository, and it is not included in exports.
3. Allow microphone access the first time you record, and notifications if you want the evening digest.

## Switching AI provider

Any OpenAI-compatible `/chat/completions` endpoint works. In Settings, tap a preset or type your own **Base URL** and **Model**, paste that provider's key, then **Save** and **Test connection**.

| Provider | Base URL | Example model |
|---|---|---|
| NVIDIA NIM (default) | `https://integrate.api.nvidia.com/v1` | `nvidia/nemotron-3-ultra-550b-a55b` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `meta-llama/llama-3.3-70b-instruct` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` |
| Local (Ollama, LM Studio…) | `http://<your-pc-ip>:11434/v1` | any instruct model |

Model names change over time, so check your provider's model list.

## ⚠️ Release keystore: keep the backup

Release APKs are signed with one keystore. A backup copy and its passwords are at **`~/idea_bucket-keystore-BACKUP/`** on the build machine, outside this repo; it is never committed. CI reads the same keystore from the GitHub Actions secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. **If you lose it, new versions will not install over the existing app** and you would have to uninstall, losing your data unless you exported it first. Copy that folder to a password manager or another safe place.

## Development

```bash
npm ci
npm run typecheck && npm run lint && npm test
NVIDIA_API_KEY=... npm run eval:llm      # live prompt evaluation → docs/llm-eval.md
npx expo prebuild --platform android      # generates ./android (not committed)
cd android && ./gradlew assembleRelease   # set IB_KEYSTORE_* env vars to sign with the release key
```

Stack: Expo SDK 58 (prebuild / development build, not Expo Go), React Native 0.88, TypeScript strict, expo-router, expo-audio (native 16 kHz PCM stream written to WAV), whisper.rn, expo-sqlite, expo-secure-store, zod, react-native-android-widget.

Code layout:

- `src/core/`: pure logic with unit tests (prompt, JSON parsing and repair, zod schemas, merge planner, queue state machine and backoff, retention, filters, digest, backup format)
- `src/db/`: SQLite schema, migrations and repository
- `src/services/`: recording, Whisper, the pipeline/queue runner, notifications, backup, background task
- `src/app/`: screens (expo-router)
- `plugins/`: config plugins for the app shortcut, release signing and ABI selection
- `.github/workflows/android.yml`: CI (typecheck → lint → tests → prebuild → signed APK → GitHub Release)

Every push to `main` builds a signed APK and publishes it as release `v0.<phase>.<run>`.
