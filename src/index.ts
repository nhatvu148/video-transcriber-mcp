#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Tool,
  Resource,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, readdirSync, statSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { transcribeVideo, checkDependencies, listSupportedSites, WhisperModel } from "./transcriber.js";

const OUTPUT_DIR = join(homedir(), "Downloads", "video-transcripts");

// Ensure output directory exists
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

class VideoTranscriberServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "video-transcriber",
        version: "1.1.1",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "transcribe_video",
          description: "Transcribe videos from 1000+ platforms (YouTube, Vimeo, TikTok, Twitter, etc.) or local video files using OpenAI Whisper. Downloads/extracts audio and generates transcript in TXT, JSON, and Markdown formats. Requires yt-dlp, whisper, and ffmpeg to be installed.",
          inputSchema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "Video URL from any supported platform (YouTube, Vimeo, TikTok, Twitter, Facebook, Instagram, Twitch, conference sites, and 1000+ more) OR absolute/relative path to a local video file (mp4, avi, mov, mkv, etc.)",
              },
              output_dir: {
                type: "string",
                description: `Optional output directory path. Defaults to ${OUTPUT_DIR}`,
              },
              model: {
                type: "string",
                enum: ["tiny", "base", "small", "medium", "large"],
                description: "Whisper model to use. Larger models are more accurate but slower. Default: 'base'",
              },
              language: {
                type: "string",
                description: "Language code (ISO 639-1: en, es, fr, de, etc.) or 'auto' for automatic detection. Default: 'auto'",
              },
            },
            required: ["url"],
          },
        },
        {
          name: "list_transcripts",
          description: "List all available transcripts in the output directory",
          inputSchema: {
            type: "object",
            properties: {
              output_dir: {
                type: "string",
                description: `Optional directory path to list. Defaults to ${OUTPUT_DIR}`,
              },
            },
          },
        },
        {
          name: "check_dependencies",
          description: "Check if all required dependencies (yt-dlp, whisper, ffmpeg) are installed",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "list_supported_sites",
          description: "List all video platforms supported by yt-dlp (1000+ sites including YouTube, Vimeo, TikTok, Twitter, Facebook, Instagram, educational platforms, and more)",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ] as Tool[],
    }));

    // List available resources (transcripts)
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      try {
        if (!existsSync(OUTPUT_DIR)) {
          return { resources: [] };
        }

        const files = readdirSync(OUTPUT_DIR);
        const transcripts = files
          .filter(f => f.endsWith('.txt') || f.endsWith('.md') || f.endsWith('.json'))
          .map(f => {
            const fullPath = join(OUTPUT_DIR, f);
            const stats = statSync(fullPath);
            return {
              uri: `file://${fullPath}`,
              name: f,
              description: `Transcript file (${(stats.size / 1024).toFixed(2)} KB, modified ${stats.mtime.toLocaleDateString()})`,
              mimeType: f.endsWith('.json') ? 'application/json' :
                        f.endsWith('.md') ? 'text/markdown' : 'text/plain',
            } as Resource;
          });

        return { resources: transcripts };
      } catch (error) {
        console.error("[MCP] Error listing resources:", error);
        return { resources: [] };
      }
    });

    // Read a specific transcript resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const filePath = request.params.uri.replace('file://', '');
      try {
        const content = readFileSync(filePath, 'utf-8');
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: filePath.endsWith('.json') ? 'application/json' :
                       filePath.endsWith('.md') ? 'text/markdown' : 'text/plain',
              text: content,
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read file: ${errorMessage}`);
      }
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (name === "transcribe_video") {
          return await this.handleTranscribeVideo(
            args?.url as string,
            args?.output_dir as string | undefined,
            args?.model as WhisperModel | undefined,
            args?.language as string | undefined
          );
        } else if (name === "list_transcripts") {
          return await this.handleListTranscripts(args?.output_dir as string | undefined);
        } else if (name === "check_dependencies") {
          return await this.handleCheckDependencies();
        } else if (name === "list_supported_sites") {
          return await this.handleListSupportedSites();
        } else {
          throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`[MCP] Tool error (${name}):`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async handleCheckDependencies() {
    try {
      checkDependencies();
      return {
        content: [
          {
            type: "text",
            text: "✅ All dependencies are installed:\n  - yt-dlp\n  - whisper\n  - ffmpeg",
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `❌ ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleTranscribeVideo(
    url: string,
    outputDir?: string,
    model?: WhisperModel,
    language?: string
  ) {
    const dir = outputDir || OUTPUT_DIR;

    // Ensure output directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    console.error(`[MCP] Starting transcription for: ${url}`);

    const progressLog: string[] = [];
    const onProgress = (message: string) => {
      console.error(`[MCP] ${message}`);
      progressLog.push(message);
    };

    try {
      const result = await transcribeVideo({
        url,
        outputDir: dir,
        model: model || "base",
        language: language || "auto",
        onProgress,
      });

      console.error(`[MCP] Transcription complete!`);

      return {
        content: [
          {
            type: "text",
            text: `✅ Video transcribed successfully!

**Video Details:**
- Title: ${result.metadata.title}
- Platform: ${result.metadata.platform}
- Channel: ${result.metadata.channel}
- Video ID: ${result.metadata.videoId}
- Duration: ${Math.floor(result.metadata.duration / 60)}:${String(result.metadata.duration % 60).padStart(2, '0')}

**Transcription Settings:**
- Model: ${model || 'base'}
- Language: ${language || 'auto'}

**Output Files:**
- Text: ${result.files.txt}
- JSON: ${result.files.json}
- Markdown: ${result.files.md}

**Transcript Preview:**
${result.transcriptPreview}${result.transcript.length > 500 ? '...' : ''}

**Full transcript has ${result.transcript.split(/\s+/).length} words.**

You can now read the full transcript using the file paths above.`,
          },
        ],
      };
    } catch (error) {
      console.error(`[MCP] Transcription failed:`, error);
      throw error;
    }
  }

  private async handleListSupportedSites() {
    try {
      const sites = await listSupportedSites();
      const siteCount = sites.length;
      const preview = sites.slice(0, 50).join(', ');

      return {
        content: [
          {
            type: "text",
            text: `📺 Supported Video Platforms (${siteCount} total)

**Popular platforms include:**
- YouTube
- Vimeo
- TikTok
- Twitter/X
- Facebook
- Instagram
- Twitch
- Dailymotion
- Reddit
- LinkedIn
- Many educational and conference platforms

**First 50 extractors:**
${preview}${siteCount > 50 ? '...' : ''}

**Total: ${siteCount} supported extractors**

You can transcribe videos from any of these platforms by providing the video URL!`,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `❌ ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleListTranscripts(outputDir?: string) {
    const dir = outputDir || OUTPUT_DIR;

    try {
      if (!existsSync(dir)) {
        return {
          content: [
            {
              type: "text",
              text: `📂 No transcripts directory found at: ${dir}\n\nTranscribe your first video to create it!`,
            },
          ],
        };
      }

      const files = readdirSync(dir);
      const transcripts = files.filter(f => f.endsWith('.txt') || f.endsWith('.md'));

      if (transcripts.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `📂 No transcripts found in ${dir}\n\nTranscribe a video to get started!`,
            },
          ],
        };
      }

      // Group by video ID
      const videoGroups = new Map<string, string[]>();
      transcripts.forEach(f => {
        const videoId = f.split('-')[0];
        if (!videoGroups.has(videoId)) {
          videoGroups.set(videoId, []);
        }
        videoGroups.get(videoId)!.push(f);
      });

      const list = Array.from(videoGroups.entries()).map(([videoId, files], i) => {
        const mainFile = files.find(f => f.endsWith('.txt')) || files[0];
        const fullPath = join(dir, mainFile);
        const stats = statSync(fullPath);
        const title = mainFile.replace(`${videoId}-`, '').replace(/\.(txt|md|json)$/, '').replace(/-/g, ' ');

        return `${i + 1}. **${title}**
   Video ID: ${videoId}
   Files: ${files.length} (${files.map(f => f.split('.').pop()).join(', ')})
   Size: ${(stats.size / 1024).toFixed(2)} KB
   Modified: ${stats.mtime.toLocaleDateString()}
   Path: ${fullPath}`;
      }).join('\n\n');

      return {
        content: [
          {
            type: "text",
            text: `📚 Available transcripts (${videoGroups.size} videos):\n\n${list}\n\n💡 Tip: You can read any transcript by asking me to read the file path shown above.`,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to list transcripts: ${errorMessage}`);
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Video Transcriber MCP Server v1.1.1 running on stdio");
    console.error(`✨ Supports 1000+ video platforms via yt-dlp`);
    console.error(`📂 Output directory: ${OUTPUT_DIR}`);
  }
}

const server = new VideoTranscriberServer();
server.run().catch(console.error);
