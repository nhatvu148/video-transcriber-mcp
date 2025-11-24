# Video Transcriber MCP Server

[![npm version](https://badge.fury.io/js/video-transcriber-mcp.svg)](https://www.npmjs.com/package/video-transcriber-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server that transcribes videos from **1000+ platforms** using OpenAI's Whisper model. Built with TypeScript for type safety and available via npx for easy installation.

## ✨ What's New in v1.0

- 🌍 **Multi-Platform Support**: Now supports 1000+ video platforms (YouTube, Vimeo, TikTok, Twitter/X, Facebook, Instagram, Twitch, educational sites, and more) via yt-dlp
- 💻 **Cross-Platform**: Works on macOS, Linux, and Windows
- 🎛️ **Configurable Whisper Models**: Choose from tiny, base, small, medium, or large models
- 🌐 **Language Support**: Transcribe in 90+ languages or use auto-detection
- 🔄 **Automatic Retries**: Network failures are handled automatically with exponential backoff
- 🎯 **Platform Detection**: Automatically detects the video platform
- 📋 **List Supported Sites**: New tool to see all 1000+ supported platforms
- ⚡ **Improved Error Handling**: More specific and helpful error messages
- 🔒 **Better Filename Handling**: Improved sanitization preserving more characters

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
- 🎤 Transcribe using OpenAI Whisper (local, no API key needed)
- 🎛️ Configurable Whisper models (tiny, base, small, medium, large)
- 🌐 Support for 90+ languages with auto-detection
- 📝 Generate transcripts in multiple formats (TXT, JSON, Markdown)
- 📚 List and read previous transcripts as MCP resources
- 🔌 Integrate seamlessly with Claude Desktop or any MCP client
- ⚡ TypeScript + npx for easy installation
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

### macOS

```bash
brew install yt-dlp         # Video downloader (supports 1000+ sites)
brew install openai-whisper # Whisper transcription
brew install ffmpeg         # Audio processing
```

### Linux

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg
pip install yt-dlp openai-whisper

# Fedora/RHEL
sudo dnf install ffmpeg
pip install yt-dlp openai-whisper

# Arch Linux
sudo pacman -S ffmpeg
pip install yt-dlp openai-whisper
```

### Windows

**Option 1: Using pip (recommended)**
```powershell
# Install Python from python.org first
pip install yt-dlp openai-whisper

# Install ffmpeg using Chocolatey
choco install ffmpeg

# Or download ffmpeg from: https://ffmpeg.org/download.html
```

**Option 2: Using winget**
```powershell
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
pip install openai-whisper
```

### Verify installations (all platforms)

```bash
yt-dlp --version
whisper --version
ffmpeg -version
```

## Quick Start

### For End Users (Using npx)

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

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

# Use in Claude Desktop with local path
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

### From Claude Desktop GUI

Once configured, you can use these tools in Claude Desktop:

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

// Check dependencies
checkDependencies();

// Transcribe a video with custom options
const result = await transcribeVideo({
  url: 'https://www.youtube.com/watch?v=VIDEO_ID',
  outputDir: '/path/to/output',
  model: 'medium', // tiny, base, small, medium, large
  language: 'en', // or 'auto' for auto-detection
  onProgress: (progress) => console.log(progress)
});

console.log('Title:', result.metadata.title);
console.log('Platform:', result.metadata.platform);
console.log('Files:', result.files);
```

## Output

Transcripts are saved to `~/Downloads/video-transcripts/` by default.

For each video, three files are generated:

1. **`.txt`** - Plain text transcript
2. **`.json`** - JSON with timestamps and metadata
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

Transcribe videos from 1000+ platforms to text.

**Parameters:**
- `url` (required): Video URL from any supported platform
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

List all available transcripts with metadata.

**Parameters:**
- `output_dir` (optional): Directory to list

### `check_dependencies`

Verify that all required dependencies are installed.

### `list_supported_sites`

List all 1000+ supported video platforms.

## Configuration Examples

### Claude Desktop (Recommended)

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
│   ├── index.ts          # MCP server implementation
│   └── transcriber.ts    # Core transcription logic
├── dist/                 # Built JavaScript (generated)
├── package.json          # Package configuration
├── tsconfig.json         # TypeScript configuration
├── LICENSE               # MIT License
└── README.md            # This file
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

## Performance

| Video Length | Processing Time (base model) | Output Size |
|--------------|------------------------------|-------------|
| 5 minutes    | ~1-2 minutes                 | ~5-10 KB    |
| 10 minutes   | ~2-4 minutes                 | ~10-20 KB   |
| 30 minutes   | ~5-10 minutes                | ~30-50 KB   |
| 1 hour       | ~10-20 minutes               | ~60-100 KB  |

*Times are approximate and depend on CPU speed and model choice*

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

## Migration from v1.0 to v2.0

⚠️ **Breaking Changes in v2.0:**

If you were using the programmatic API in v1.0, you'll need to update your code:

**v1.0 (deprecated):**
```typescript
await transcribeYouTube(url, outputDir, onProgress);
```

**v2.0 (new API):**
```typescript
await transcribeVideo({
  url,
  outputDir,
  model: 'base',      // optional, default: 'base'
  language: 'auto',   // optional, default: 'auto'
  onProgress
});
```

**Note:** If you're using the MCP server through Claude Desktop, no changes are needed. The tool name `transcribe_video` remains the same.

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details

## Links

- [GitHub Repository](https://github.com/nhatvu148/video-transcriber-mcp)
- [npm Package](https://www.npmjs.com/package/video-transcriber-mcp)
- [Issues](https://github.com/nhatvu148/video-transcriber-mcp/issues)
- [Model Context Protocol](https://modelcontextprotocol.io)

## Acknowledgments

- OpenAI Whisper for transcription
- yt-dlp for multi-platform video downloading (1000+ sites)
- Model Context Protocol SDK
- Claude by Anthropic

---

**Made with ❤️ for the MCP community**
