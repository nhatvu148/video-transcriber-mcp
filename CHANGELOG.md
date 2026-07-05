# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions follow [semver](https://semver.org/).

## 2.0.0 — 2026-07-05

### ⚠️ Breaking changes

This is a major release. The transcription engine changed and there are **new
required dependencies** — existing v1.x setups will not work until these are
installed. Run the `check_dependencies` tool to verify your setup.

- **Engine: Python `openai-whisper` → whisper.cpp.** Transcription now runs
  through the `whisper-cli` binary — 4–10× faster, with no Python/PyTorch.
- **New prerequisites** (see README → Prerequisites):
  - `whisper-cpp` (provides `whisper-cli`) — e.g. `brew install whisper-cpp`
  - **Deno ≥ 2.3.0** — required by yt-dlp to download from YouTube
    (`brew install deno`). Without it, YouTube fails with errors that look like
    bot-detection.
  - whisper.cpp **model files** — `bash scripts/download-models.sh base`
- **`checkDependencies()` now returns a status string** instead of throwing when
  a tool is missing. Update any programmatic callers to read the return value.
- **JSON output shape** changed: the `.json` transcript now contains
  `{ metadata, transcript, model }` (previously the raw Whisper JSON).

### Added

- **4 new MCP tools** — `get_latest_transcript`, `delete_transcript`,
  `cleanup_old_transcripts`, `delete_all_transcripts` (8 tools total).
- `list_transcripts` now sorts newest-first and accepts an optional `limit`.
- **Remote transcription** via `REMOTE_WHISPER_URL` — offload to a GPU/HTTP
  worker instead of running whisper.cpp locally.
- **yt-dlp cookies** via `YT_DLP_COOKIES` / `YT_DLP_COOKIES_FROM_BROWSER` for
  age-restricted, members-only, or bot-checked videos.
- **YouTube throttling resilience** — yt-dlp
  `player_client=android,web_safari,web` (override with `YT_DLP_PLAYER_CLIENT`)
  plus download/fragment retries.
- **whisper-cli auto-detection** — resolves via `WHISPER_CPP_BINARY`, then common
  install dirs (`/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`), then
  PATH; so no env var is needed in the standard case.
- `check_dependencies` now reports yt-dlp, ffmpeg, **Deno (with a ≥ 2.3.0 version
  gate)**, whisper-cli (and the resolved path), and installed models.
- `scripts/download-models.sh` to fetch ggml models, and `.env.example`
  documenting every supported environment variable.

### Fixed

- **`check_dependencies` false negatives** — the tool used `require()`, which is
  undefined in this ESM package, so it silently reported *every* tool as "not
  installed." Now uses a proper `import`.
- Apple-Silicon P-core thread detection (same `require` issue) now works.
- UTF-8-safe transcript preview and word counting.

### Notes

- Requires **Node.js ≥ 18** (uses global `fetch` / `FormData` / `Blob`).
- Verified end-to-end on macOS. Linux and Windows are supported but less tested
  — on Windows, run `download-models.sh` via Git Bash/WSL or download the ggml
  model files manually (see README → Whisper Models).

## 1.1.1

- Multi-platform transcription (1000+ sites via yt-dlp) using Python
  OpenAI Whisper, local video file support, and the initial MCP tool set
  (`transcribe_video`, `list_transcripts`, `check_dependencies`,
  `list_supported_sites`).
