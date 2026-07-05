# Video Transcriber MCP Server

[![npm version](https://img.shields.io/npm/v/video-transcriber-mcp.svg)](https://www.npmjs.com/package/video-transcriber-mcp)
[![npm downloads](https://img.shields.io/npm/dm/video-transcriber-mcp.svg)](https://www.npmjs.com/package/video-transcriber-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server that transcribes videos from **1000+ platforms** using **whisper.cpp** — 4-10x faster than Python Whisper. Built with TypeScript for type safety and available via npx for easy installation.

> 🦀 **Prefer a standalone binary?** Check out the [**Rust version**](https://github.com/nhatvu148/video-transcriber-mcp-rs), which embeds whisper.cpp directly (no external CLI needed) and adds an optional HTTP/REST API. Available on [crates.io](https://crates.io/crates/video-transcriber-mcp) with `cargo install video-transcriber-mcp`.

## ✨ What's New

### v2.0.0

- ⚡ **whisper.cpp engine**: switched from Python `openai-whisper` to **whisper.cpp** (via the `whisper-cli` binary) for 4-10x faster transcription with lower memory usage. ⚠️ **Breaking**: install `whisper-cpp` and download models (see [Prerequisites](#prerequisites)).
- 🛰️ **Remote whisper worker**: offload transcription to a GPU service with `REMOTE_WHISPER_URL`.
- 🍪 **yt-dlp cookies**: authenticate for age-restricted / members-only videos and bypass YouTube's bot check via `YT_DLP_COOKIES` or `YT_DLP_COOKIES_FROM_BROWSER`.
- 🧹 **Transcript management tools**: `get_latest_transcript`, `delete_transcript`, `cleanup_old_transcripts`, `delete_all_transcripts`.
- 📚 **Smarter listing**: `list_transcripts` now sorts newest-first and supports a `limit`.

### Earlier

- 🌍 **Multi-Platform Support**: 1000+ video platforms (YouTube, Vimeo, TikTok, Twitter/X, Facebook, Instagram, Twitch, educational sites, and more) via yt-dlp
- 💻 **Cross-Platform**: Works on macOS, Linux, and Windows
- 🎛️ **Configurable Whisper Models**: Choose from tiny, base, small, medium, or large models
- 🌐 **Language Support**: Transcribe in 90+ languages or use auto-detection
- 🔄 **Automatic Retries**: Network failures are handled automatically with exponential backoff
- 🎯 **Platform Detection**: Automatically detects the video platform

## ⚠️ Legal Notice

**This tool is intended for educational, accessibility, and research purposes only.**

Before using this tool, please understand:
- Most platforms' Terms of Service generally prohibit downloading content
- **You are responsible** for ensuring your use complies with applicable laws
- This tool should primarily be used for:
  - ✅ Your own content
  - ✅ Creating accessibility features (captions for deaf/hard of hearing)
  - ✅ Educational and research purposes (where permitted)
  - ✅ Content you have explicit permission to download

**Please read [LEGAL.md](LEGAL.md) for detailed legal information before using this tool.**

We do not encourage or endorse violation of any platform's Terms of Service or copyright infringement. Use responsibly and ethically.

## Features

- 🎥 Download audio from 1000+ video platforms (powered by yt-dlp)
- 📂 Transcribe local video files (mp4, avi, mov, mkv, and more)
- ⚡ Transcribe using **whisper.cpp** locally (no API key needed) — 4-10x faster than Python Whisper
- 🛰️ Optional remote whisper worker for GPU offload (`REMOTE_WHISPER_URL`)
- 🍪 yt-dlp cookie support for age-restricted / bot-checked videos
- 🎛️ Configurable Whisper models (tiny, base, small, medium, large)
- 🌐 Support for 90+ languages with auto-detection
- 📝 Generate transcripts in multiple formats (TXT, JSON, Markdown)
- 📚 List, read, and manage previous transcripts (list/latest/delete/cleanup)
- 🔌 Integrate seamlessly with Claude Code or any MCP client
- 🔒 Full type safety with TypeScript
- 🔍 Automatic dependency checking
- 🔄 Automatic retry logic for network failures
- 🎯 Platform detection (shows which platform you're transcribing from)

## Supported Platforms

Thanks to yt-dlp, this tool supports **1000+ video platforms** including:

- **Social Media**: YouTube, TikTok, Twitter/X, Facebook, Instagram, Reddit, LinkedIn
- **Video Hosting**: Vimeo, Dailymotion, Twitch
- **Educational**: Coursera, Udemy, Khan Academy, LinkedIn Learning, edX
- **News**: BBC, CNN, NBC, PBS
- **Conference/Tech**: YouTube (tech talks), Vimeo (conferences)
- **And many, many more!**

Run the `list_supported_sites` tool to see the complete list of 1000+ supported platforms.

## Prerequisites

You need these tools installed: **yt-dlp** (video downloader), **whisper.cpp** (the `whisper-cli` binary), and **ffmpeg** (audio processing), plus at least one whisper.cpp model (see [Whisper Models](#whisper-models)). **Deno** is optional but recommended for rock-solid YouTube downloads — see the note below.

> **💡 YouTube reliability — Deno (recommended, not required).** This tool passes yt-dlp the `android` extractor client, which serves **most** YouTube videos *without* a JavaScript runtime. For the occasional video the android client can't serve, yt-dlp needs a JS runtime to solve YouTube's signature / "n" challenge — otherwise that *specific* video fails with errors that look like bot-detection (`No supported JavaScript runtime could be found`, `Signature solving failed`, HTTP 403). Installing **Deno ≥ 2.3.0** (yt-dlp auto-detects it) makes YouTube downloads robust across all videos. If you already have Deno, make sure it's ≥ 2.3.0 (`deno --version`, then `deno upgrade`) — an older one is detected but can't solve the challenge. Non-YouTube sites don't need it. Also keep yt-dlp current (`yt-dlp -U`) — an outdated yt-dlp is the more common cause of YouTube failures.

> If you set `REMOTE_WHISPER_URL` to offload transcription to a remote worker, you can skip installing `whisper-cpp` and downloading models locally.

### macOS

```bash
brew install yt-dlp       # Video downloader (supports 1000+ sites)
brew install whisper-cpp  # whisper.cpp transcription (installs `whisper-cli`)
brew install ffmpeg       # Audio processing
brew install deno         # JS runtime — optional, recommended for YouTube reliability
```

### Linux

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg
pip install yt-dlp
curl -fsSL https://deno.land/install.sh | sh   # JS runtime — optional, recommended for YouTube reliability
# whisper.cpp: build from source, then put `whisper-cli` on your PATH
git clone https://github.com/ggerganov/whisper.cpp && cd whisper.cpp && make
# copy build/bin/whisper-cli to /usr/local/bin, or set WHISPER_CPP_BINARY to its path
```

### Windows

```powershell
# Install Python from python.org first
pip install yt-dlp

# Install ffmpeg (required) + deno (optional, recommended for YouTube) via Chocolatey
choco install ffmpeg
choco install deno   # JS runtime — optional, recommended for YouTube reliability

# whisper.cpp: download a prebuilt release from
# https://github.com/ggerganov/whisper.cpp/releases and put whisper-cli.exe on PATH,
# or set WHISPER_CPP_BINARY to its full path.
```

> **Deno not on PATH?** If you installed Deno but yt-dlp still reports "No supported JavaScript runtime" (common when the installer drops it in `~/.deno/bin`), symlink it somewhere already on PATH — e.g. `ln -sf ~/.deno/bin/deno ~/.local/bin/deno` — or add `~/.deno/bin` to your PATH.

### Verify installations (all platforms)

```bash
yt-dlp --version
whisper-cli --help
ffmpeg -version
deno --version
```

## Whisper Models

whisper.cpp uses `ggml` model files stored in `~/.cache/video-transcriber-mcp/models/`. Download them with the bundled script:

```bash
# Download a single model (recommended: start with base)
bash scripts/download-models.sh base

# Or download everything
bash scripts/download-models.sh all
```

> **Windows:** `download-models.sh` is a Bash script — run it from **Git Bash** or **WSL**. Or download the model manually: grab `ggml-base.bin` (or another size) from <https://huggingface.co/ggerganov/whisper.cpp/tree/main> and drop it into `%USERPROFILE%\.cache\video-transcriber-mcp\models\`.

| Model  | Size    | Notes                         |
|--------|---------|-------------------------------|
| tiny   | ~75 MB  | fastest, lowest accuracy      |
| base   | ~142 MB | recommended default           |
| small  | ~466 MB | good balance                  |
| medium | ~1.5 GB | high accuracy                 |
| large  | ~2.9 GB | best accuracy, slowest        |

Run the `check_dependencies` tool at any time to see which models are installed.

## Quick Start

### For End Users (Using npx)

Add to your Claude Code config (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "video-transcriber": {
      "command": "npx",
      "args": ["-y", "video-transcriber-mcp"]
    }
  }
}
```

**Or use directly from GitHub:**

```json
{
  "mcpServers": {
    "video-transcriber": {
      "command": "npx",
      "args": [
        "-y",
        "github:nhatvu148/video-transcriber-mcp"
      ]
    }
  }
}
```

That's it! No installation needed. npx will automatically download and run the package.

### For Local Development

```bash
# Clone the repository
git clone https://github.com/nhatvu148/video-transcriber-mcp.git
cd video-transcriber-mcp

# Install dependencies
npm install
# or
bun install

# Build the project
npm run build

# Use in Claude Code with local path
{
  "mcpServers": {
    "video-transcriber": {
      "command": "npx",
      "args": ["-y", "/path/to/video-transcriber-mcp"]
    }
  }
}
```

## Usage

### From Claude Code

Once configured, you can use these tools in Claude Code:

#### Transcribe a video from any platform

```
Please transcribe this YouTube video: https://www.youtube.com/watch?v=VIDEO_ID
```

```
Transcribe this TikTok video: https://www.tiktok.com/@user/video/123456789
```

```
Get the transcript from this Vimeo video with high accuracy: https://vimeo.com/123456789
(use model: large)
```

```
Transcribe this Spanish tutorial video: https://youtube.com/watch?v=VIDEO_ID
(language: es)
```

#### Transcribe a local video file

```
Transcribe this local video file: /Users/myname/Videos/meeting.mp4
```

```
Transcribe ~/Downloads/lecture.mov with high accuracy
(use model: medium)
```

Claude will use the `transcribe_video` tool automatically with optional parameters for model and language.

#### List all supported platforms

```
What platforms can you transcribe videos from?
```

#### List available transcripts

```
List all my video transcripts
```

#### Check dependencies

```
Check if my video transcriber dependencies are installed
```

#### Read a transcript

```
Show me the transcript for [video name]
```

### Programmatic Usage

If you install the package:

```bash
npm install video-transcriber-mcp
```

You can import and use it programmatically:

```typescript
import { transcribeVideo, checkDependencies, WhisperModel } from 'video-transcriber-mcp';

// Check dependencies — returns a human-readable status string
console.log(checkDependencies());

// Transcribe a video from URL with custom options
const result = await transcribeVideo({
  url: 'https://www.youtube.com/watch?v=VIDEO_ID',
  outputDir: '/path/to/output',
  model: 'medium', // tiny, base, small, medium, large
  language: 'en', // or 'auto' for auto-detection
  onProgress: (progress) => console.log(progress)
});

// Or transcribe a local video file
const localResult = await transcribeVideo({
  url: '/path/to/video.mp4',  // Local file path instead of URL
  outputDir: '/path/to/output',
  model: 'base',
  language: 'auto',
  onProgress: (progress) => console.log(progress)
});

console.log('Title:', result.metadata.title);
console.log('Platform:', result.metadata.platform);
console.log('Words:', result.wordCount);
console.log('Model:', result.modelUsed);
console.log('Files:', result.files);
```

## Output

Transcripts are saved to `~/Downloads/video-transcripts/` by default.

For each video, three files are generated:

1. **`.txt`** - Plain text transcript
2. **`.json`** - JSON with video metadata, the transcript, and the model used
3. **`.md`** - Markdown with video metadata and formatted transcript

### Example

```
~/Downloads/video-transcripts/
├── 7JBuA1GHAjQ-From-AI-skeptic-to-UNFAIR-advantage.txt
├── 7JBuA1GHAjQ-From-AI-skeptic-to-UNFAIR-advantage.json
└── 7JBuA1GHAjQ-From-AI-skeptic-to-UNFAIR-advantage.md
```

## MCP Tools

### `transcribe_video`

Transcribe videos from 1000+ platforms or local video files to text.

**Parameters:**
- `url` (required): Video URL from any supported platform OR path to a local video file (mp4, avi, mov, mkv, etc.)
- `output_dir` (optional): Output directory path
- `model` (optional): Whisper model - "tiny", "base" (default), "small", "medium", "large"
- `language` (optional): Language code (ISO 639-1: "en", "es", "fr", etc.) or "auto" (default)

**Model Comparison:**
| Model | Speed | Accuracy | Use Case |
|-------|-------|----------|----------|
| tiny | ⚡⚡⚡⚡⚡ | ⭐⭐ | Quick drafts, testing |
| base | ⚡⚡⚡⚡ | ⭐⭐⭐ | General use (default) |
| small | ⚡⚡⚡ | ⭐⭐⭐⭐ | Better accuracy |
| medium | ⚡⚡ | ⭐⭐⭐⭐⭐ | High accuracy |
| large | ⚡ | ⭐⭐⭐⭐⭐⭐ | Best accuracy, slow |

### `list_transcripts`

List all available transcripts with metadata, sorted by modification time (newest first).

**Parameters:**
- `output_dir` (optional): Directory to list
- `limit` (optional): Return only the N most recent transcripts

### `get_latest_transcript`

Get the path and details of the most recently created/modified transcript. Useful to avoid accidentally reading an old transcript.

**Parameters:**
- `output_dir` (optional): Directory to search

### `delete_transcript`

Delete a specific transcript by video ID (removes all associated `.txt`, `.json`, `.md` files).

**Parameters:**
- `video_id` (required): The video ID to delete (e.g. `dQw4w9WgXcQ`)
- `output_dir` (optional): Directory to delete from

### `cleanup_old_transcripts`

Delete transcripts older than a given number of days.

**Parameters:**
- `days` (required): Delete files older than this many days
- `output_dir` (optional): Directory to clean

### `delete_all_transcripts`

Delete ALL transcripts in the output directory. **Cannot be undone.**

**Parameters:**
- `confirm` (required): Must be `true` to actually delete
- `output_dir` (optional): Directory to clear

### `check_dependencies`

Verify that all required dependencies (yt-dlp, ffmpeg, whisper.cpp) and models are installed.

### `list_supported_sites`

List all 1000+ supported video platforms.

## Environment Variables

All are optional. See [`.env.example`](.env.example) for details. When using the MCP server, set these in your client's `env` block.

| Variable | Description |
|----------|-------------|
| `YT_DLP_COOKIES` | Path to a Netscape-format cookies file (`--cookies`). Preferred on headless/Linux. |
| `YT_DLP_COOKIES_FROM_BROWSER` | Browser to read cookies from (`chrome`, `brave`, `edge`, `firefox`, `safari`, …). Ignored if `YT_DLP_COOKIES` is set. |
| `REMOTE_WHISPER_URL` | Offload transcription to a remote HTTP worker instead of running whisper.cpp locally. |
| `WHISPER_CPP_BINARY` | Override the whisper.cpp CLI name/path (default `whisper-cli`). |

Example Claude Code config with cookies:

```json
{
  "mcpServers": {
    "video-transcriber": {
      "command": "npx",
      "args": ["-y", "video-transcriber-mcp"],
      "env": {
        "YT_DLP_COOKIES_FROM_BROWSER": "chrome"
      }
    }
  }
}
```

## Configuration Examples

### Claude Code (Recommended)

```json
{
  "mcpServers": {
    "video-transcriber": {
      "command": "npx",
      "args": ["-y", "video-transcriber-mcp"]
    }
  }
}
```

### From GitHub (Latest)

```json
{
  "mcpServers": {
    "video-transcriber": {
      "command": "npx",
      "args": ["-y", "github:nhatvu148/video-transcriber-mcp"]
    }
  }
}
```

### Local Development

```json
{
  "mcpServers": {
    "video-transcriber": {
      "command": "npx",
      "args": ["-y", "/absolute/path/to/video-transcriber-mcp"]
    }
  }
}
```

## Development

### Setup

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Type check
npm run check

# Development mode (requires Bun)
bun run dev

# Clean build artifacts
npm run clean
```

### Project Structure

```
video-transcriber-mcp/
├── src/
│   ├── index.ts          # MCP server implementation (8 tools)
│   └── transcriber.ts    # Core transcription logic (whisper.cpp)
├── scripts/
│   └── download-models.sh # Download whisper.cpp ggml models
├── dist/                 # Built JavaScript (generated)
├── package.json          # Package configuration
├── tsconfig.json         # TypeScript configuration
├── .env.example          # Documented environment variables
├── LICENSE               # MIT License
└── README.md             # This file
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run dev` | Development mode with hot reload (Bun) |
| `npm run check` | TypeScript type checking |
| `npm run clean` | Remove dist/ directory |
| `npm run prepublishOnly` | Pre-publish build (automatic) |

### Publishing

```bash
# Build the project
npm run build

# Test locally first
npx . --help

# Publish to npm (bump version first)
npm version patch  # or minor, major
npm publish

# Or publish from GitHub
# Push to GitHub and users can use:
# npx github:username/video-transcriber-mcp
```

## Troubleshooting

### Dependencies not installed

See the [Prerequisites](#prerequisites) section above for platform-specific installation instructions.

### npx can't find the package

Make sure the package is:
- Published to npm, OR
- Available on GitHub with proper package.json

### TypeScript errors

```bash
npm run check
```

### Permission denied

The build process automatically makes `dist/index.js` executable via the `fix-shebang` script.

### "Unsupported URL" error

The platform might not be supported by yt-dlp. Run `list_supported_sites` to see all supported platforms.

### "Whisper model not found"

Download the model you're requesting: `bash scripts/download-models.sh base` (or `all`). Models live in `~/.cache/video-transcriber-mcp/models/`. Run `check_dependencies` to see what's installed.

### "whisper.cpp CLI ('whisper-cli') not found"

Install whisper.cpp (`brew install whisper-cpp` on macOS) or set `WHISPER_CPP_BINARY` to the full path of your `whisper-cli` (or legacy `main`) binary.

### YouTube fails: "No supported JavaScript runtime" / "Signature solving failed" / HTTP 403

yt-dlp needs a JavaScript runtime to download from YouTube. **Install Deno ≥ 2.3.0** (`brew install deno`, `choco install deno`, or `curl -fsSL https://deno.land/install.sh | sh`) — yt-dlp auto-detects it. Two common gotchas:
- **Deno not found** even though it's installed → it landed in `~/.deno/bin`, which isn't on PATH. Symlink it: `ln -sf ~/.deno/bin/deno ~/.local/bin/deno`.
- **`n challenge solving failed` persists** with Deno installed → your Deno is **older than 2.3.0**. Run `deno --version`, then `deno upgrade`. (This is the sneaky one — an old Deno is detected but silently can't solve the challenge.)

Verify with `deno --version`. See [Prerequisites](#prerequisites).

> These errors often masquerade as bot-detection, but the fix is a JS runtime, **not** cookies. Also keep yt-dlp current (`yt-dlp -U` or `brew upgrade yt-dlp`) — an outdated yt-dlp makes YouTube failures worse.

### YouTube "Sign in to confirm you're not a bot"

First confirm you have Deno installed (see above) and yt-dlp is up to date — that resolves most cases. For genuinely gated content (age-restricted / members-only), set `YT_DLP_COOKIES` (path to a cookies file) or `YT_DLP_COOKIES_FROM_BROWSER` (e.g. `chrome`). See [Environment Variables](#environment-variables).

## Performance

whisper.cpp is roughly **4-10x faster** than Python `openai-whisper` on the same hardware, using less memory. Actual processing time depends on your CPU (P-core count on Apple Silicon), the selected model, and the video length.

*Tip: start with the `base` model and move up to `medium`/`large` only when you need more accuracy.*

## Advanced Configuration

### Custom Whisper Model

Specify in the tool call parameters:

```json
{
  "url": "https://youtube.com/watch?v=...",
  "model": "large"
}
```

### Custom Language

Specify the language code:

```json
{
  "url": "https://youtube.com/watch?v=...",
  "language": "es"
}
```

### Custom Output Directory

Specify in the tool call:

```json
{
  "url": "https://youtube.com/watch?v=...",
  "output_dir": "/custom/path"
}
```

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details

## TypeScript vs Rust Version

> **Project scope:** The **[Rust version](https://github.com/nhatvu148/video-transcriber-mcp-rs) is the source of truth.** This TypeScript package is intentionally kept **small and stable** — a lean local **stdio** MCP server for the npm/`npx` audience. Advanced/SaaS features (HTTP transport, auth, credits/billing, LLM summaries) live **only** in the Rust version and are *not* ported here. New capabilities land in Rust first; this package only tracks the shared MCP tool contract.

Both versions use **whisper.cpp** for transcription and expose the same MCP tools.

Pick the **TypeScript version** (this one) for:
- ✅ Quick setup with npx (no compilation)
- ✅ Node.js ecosystem familiarity
- ℹ️ Calls the `whisper-cli` binary (install `whisper-cpp` separately)

Pick the **[Rust version](https://github.com/nhatvu148/video-transcriber-mcp-rs)** for:
- 📦 **Standalone binary** — whisper.cpp is embedded, no external CLI to install
- 💾 **Lower memory usage** and native startup
- 🌐 **HTTP/REST API** transport, auth, credits, and other SaaS features

Both support the same MCP protocol and work identically with Claude Code!

## Links

- [GitHub Repository](https://github.com/nhatvu148/video-transcriber-mcp)
- [npm Package](https://www.npmjs.com/package/video-transcriber-mcp)
- [🦀 Rust Version](https://github.com/nhatvu148/video-transcriber-mcp-rs) ← **For better performance**
- [Issues](https://github.com/nhatvu148/video-transcriber-mcp/issues)
- [Model Context Protocol](https://modelcontextprotocol.io)

## Acknowledgments

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) for fast local transcription
- OpenAI Whisper for the underlying models
- yt-dlp for multi-platform video downloading (1000+ sites)
- Model Context Protocol SDK
- Claude by Anthropic

---

**Made with ❤️ for the MCP community**
