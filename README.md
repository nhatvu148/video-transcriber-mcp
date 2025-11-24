# YouTube Transcriber MCP Server

[![npm version](https://badge.fury.io/js/youtube-transcriber-mcp.svg)](https://www.npmjs.com/package/youtube-transcriber-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server that transcribes YouTube videos using OpenAI's Whisper model. Built with TypeScript for type safety and available via npx for easy installation.

## ⚠️ Legal Notice

**This tool is intended for educational, accessibility, and research purposes only.**

Before using this tool, please understand:
- YouTube's Terms of Service generally prohibit downloading content
- **You are responsible** for ensuring your use complies with applicable laws
- This tool should primarily be used for:
  - ✅ Your own content
  - ✅ Creating accessibility features (captions for deaf/hard of hearing)
  - ✅ Educational and research purposes (where permitted)
  - ✅ Content you have explicit permission to download

**Please read [LEGAL.md](LEGAL.md) for detailed legal information before using this tool.**

We do not encourage or endorse violation of YouTube's Terms of Service or copyright infringement. Use responsibly and ethically.

## Features

- 🎥 Download audio from any YouTube video
- 🎤 Transcribe using OpenAI Whisper (local, no API key needed)
- 📝 Generate transcripts in multiple formats (TXT, JSON, Markdown)
- 📚 List and read previous transcripts as MCP resources
- 🔌 Integrate seamlessly with Claude Desktop or any MCP client
- ⚡ TypeScript + npx for easy installation
- 🔒 Full type safety with TypeScript
- 🔍 Automatic dependency checking

## Prerequisites

```bash
# Required tools
brew install yt-dlp         # YouTube downloader
brew install openai-whisper # Whisper transcription
brew install ffmpeg         # Audio processing (usually installed with yt-dlp)

# Verify installations
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
    "youtube-transcriber": {
      "command": "npx",
      "args": ["-y", "youtube-transcriber-mcp"]
    }
  }
}
```

**Or use directly from GitHub:**

```json
{
  "mcpServers": {
    "youtube-transcriber": {
      "command": "npx",
      "args": [
        "-y",
        "github:nhatvu148/youtube-transcriber-mcp"
      ]
    }
  }
}
```

That's it! No installation needed. npx will automatically download and run the package.

### For Local Development

```bash
# Clone the repository
git clone https://github.com/nhatvu148/youtube-transcriber-mcp.git
cd youtube-transcriber-mcp

# Install dependencies
npm install
# or
bun install

# Build the project
npm run build

# Use in Claude Desktop with local path
{
  "mcpServers": {
    "youtube-transcriber": {
      "command": "npx",
      "args": ["-y", "/path/to/youtube-transcriber-mcp"]
    }
  }
}
```

## Usage

### From Claude Desktop GUI

Once configured, you can use these tools in Claude Desktop:

#### Transcribe a YouTube video

```
Please transcribe this YouTube video: https://www.youtube.com/watch?v=VIDEO_ID
```

Claude will use the `transcribe_youtube` tool automatically.

#### List available transcripts

```
List all my YouTube transcripts
```

#### Check dependencies

```
Check if my YouTube transcriber dependencies are installed
```

#### Read a transcript

```
Show me the transcript for [video name]
```

### Programmatic Usage

If you install the package:

```bash
npm install youtube-transcriber-mcp
```

You can import and use it programmatically:

```typescript
import { transcribeYouTube, checkDependencies } from 'youtube-transcriber-mcp';

// Check dependencies
checkDependencies();

// Transcribe a video
const result = await transcribeYouTube(
  'https://www.youtube.com/watch?v=VIDEO_ID',
  '/path/to/output',
  (progress) => console.log(progress)
);

console.log('Title:', result.metadata.title);
console.log('Files:', result.files);
```

## Output

Transcripts are saved to `~/Downloads/youtube-transcripts/` by default.

For each video, three files are generated:

1. **`.txt`** - Plain text transcript
2. **`.json`** - JSON with timestamps and metadata
3. **`.md`** - Markdown with video metadata and formatted transcript

### Example

```
~/Downloads/youtube-transcripts/
├── 7JBuA1GHAjQ-From-AI-skeptic-to-UNFAIR-advantage.txt
├── 7JBuA1GHAjQ-From-AI-skeptic-to-UNFAIR-advantage.json
└── 7JBuA1GHAjQ-From-AI-skeptic-to-UNFAIR-advantage.md
```

## MCP Tools

### `transcribe_youtube`

Transcribe a YouTube video to text.

**Parameters:**
- `url` (required): YouTube video URL
- `output_dir` (optional): Output directory path

### `list_transcripts`

List all available transcripts with metadata.

**Parameters:**
- `output_dir` (optional): Directory to list

### `check_dependencies`

Verify that all required dependencies are installed.

## Configuration Examples

### Claude Desktop (Recommended)

```json
{
  "mcpServers": {
    "youtube-transcriber": {
      "command": "npx",
      "args": ["-y", "youtube-transcriber-mcp"]
    }
  }
}
```

### From GitHub (Latest)

```json
{
  "mcpServers": {
    "youtube-transcriber": {
      "command": "npx",
      "args": ["-y", "github:nhatvu148/youtube-transcriber-mcp"]
    }
  }
}
```

### Local Development

```json
{
  "mcpServers": {
    "youtube-transcriber": {
      "command": "npx",
      "args": ["-y", "/absolute/path/to/youtube-transcriber-mcp"]
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
youtube-transcriber-mcp/
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
# npx github:username/youtube-transcriber-mcp
```

## Troubleshooting

### Dependencies not installed

```bash
brew install yt-dlp openai-whisper ffmpeg
```

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

## Performance

| Video Length | Processing Time (base model) | Output Size |
|--------------|------------------------------|-------------|
| 5 minutes    | ~1-2 minutes                 | ~5-10 KB    |
| 10 minutes   | ~2-4 minutes                 | ~10-20 KB   |
| 30 minutes   | ~5-10 minutes                | ~30-50 KB   |
| 1 hour       | ~10-20 minutes               | ~60-100 KB  |

*Times are approximate and depend on CPU speed*

## Advanced Configuration

### Custom Whisper Model

Edit `src/transcriber.ts` to change the model:

```typescript
--model base  // Options: tiny, base, small, medium, large
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

## Links

- [GitHub Repository](https://github.com/nhatvu148/youtube-transcriber-mcp)
- [npm Package](https://www.npmjs.com/package/youtube-transcriber-mcp)
- [Issues](https://github.com/nhatvu148/youtube-transcriber-mcp/issues)
- [Model Context Protocol](https://modelcontextprotocol.io)

## Acknowledgments

- OpenAI Whisper for transcription
- yt-dlp for YouTube downloading
- Model Context Protocol SDK
- Claude by Anthropic

---

**Made with ❤️ for the MCP community**
