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
import { transcribeYouTube, checkDependencies } from "./transcriber.js";

const OUTPUT_DIR = join(homedir(), "Downloads", "youtube-transcripts");

// Ensure output directory exists
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

class YouTubeTranscriberServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "youtube-transcriber",
        version: "1.0.0",
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
          name: "transcribe_youtube",
          description: "Transcribe a YouTube video to text using OpenAI Whisper. Downloads audio and generates transcript in TXT, JSON, and Markdown formats. Requires yt-dlp and whisper to be installed.",
          inputSchema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "The YouTube video URL (e.g., https://www.youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID)",
              },
              output_dir: {
                type: "string",
                description: `Optional output directory path. Defaults to ${OUTPUT_DIR}`,
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
        if (name === "transcribe_youtube") {
          return await this.handleTranscribeYouTube(args?.url as string, args?.output_dir as string | undefined);
        } else if (name === "list_transcripts") {
          return await this.handleListTranscripts(args?.output_dir as string | undefined);
        } else if (name === "check_dependencies") {
          return await this.handleCheckDependencies();
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

  private async handleTranscribeYouTube(url: string, outputDir?: string) {
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
      const result = await transcribeYouTube(url, dir, onProgress);

      console.error(`[MCP] Transcription complete!`);

      return {
        content: [
          {
            type: "text",
            text: `✅ YouTube video transcribed successfully!

**Video Details:**
- Title: ${result.metadata.title}
- Channel: ${result.metadata.channel}
- Video ID: ${result.metadata.videoId}
- Duration: ${Math.floor(result.metadata.duration / 60)}:${String(result.metadata.duration % 60).padStart(2, '0')}

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
    console.error("YouTube Transcriber MCP Server v1.0.0 (TypeScript + Bun) running on stdio");
    console.error(`Output directory: ${OUTPUT_DIR}`);
  }
}

const server = new YouTubeTranscriberServer();
server.run().catch(console.error);
