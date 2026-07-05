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
import { readFileSync, readdirSync, statSync, mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";
import {
  transcribeVideo,
  checkDependencies,
  listSupportedSites,
  getDefaultOutputDir,
  WhisperModel,
} from "./transcriber.js";

const VERSION = "2.0.0";
const OUTPUT_DIR = getDefaultOutputDir();

// Ensure output directory exists
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Shared transcript helpers
// ---------------------------------------------------------------------------

interface TranscriptGroup {
  videoId: string;
  files: string[];
  modified: number; // epoch seconds
  mainPath: string;
}

/**
 * Group transcript files in `dir` by their leading video ID and attach the
 * modification time of the main (.txt) file. Sorted newest-first.
 */
function groupTranscripts(dir: string): TranscriptGroup[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".txt") || f.endsWith(".md"));

  const groups = new Map<string, string[]>();
  for (const f of files) {
    const videoId = f.split("-")[0] || "unknown";
    if (!groups.has(videoId)) groups.set(videoId, []);
    groups.get(videoId)!.push(f);
  }

  const result: TranscriptGroup[] = [];
  for (const [videoId, groupFiles] of groups.entries()) {
    const mainFile = groupFiles.find((f) => f.endsWith(".txt")) || groupFiles[0];
    const mainPath = join(dir, mainFile);
    let modified = 0;
    try {
      modified = Math.floor(statSync(mainPath).mtimeMs / 1000);
    } catch (e) {
      continue;
    }
    result.push({ videoId, files: groupFiles, modified, mainPath });
  }

  result.sort((a, b) => b.modified - a.modified);
  return result;
}

function titleFromFile(videoId: string, mainFile: string): string {
  return mainFile
    .replace(`${videoId}-`, "")
    .replace(/\.(txt|md|json)$/i, "")
    .replace(/-/g, " ");
}

function formatTimestamp(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

function text(content: string) {
  return { content: [{ type: "text", text: content }] };
}

class VideoTranscriberServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "video-transcriber",
        version: VERSION,
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
          description:
            "Transcribe videos from 1000+ platforms (YouTube, Vimeo, TikTok, Twitter, etc.) or local video files using whisper.cpp (4-10x faster than Python whisper!). Downloads/extracts audio and generates transcript in TXT, JSON, and Markdown formats.",
          inputSchema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description:
                  "Video URL from any supported platform OR absolute/relative path to a local video file (mp4, avi, mov, mkv, etc.)",
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
                description:
                  "Language code (ISO 639-1: en, es, fr, de, etc.) or 'auto' for automatic detection. Default: 'auto'",
              },
            },
            required: ["url"],
          },
        },
        {
          name: "check_dependencies",
          description: "Check if all required dependencies (yt-dlp, ffmpeg, whisper models) are installed",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "list_supported_sites",
          description:
            "List all video platforms supported by yt-dlp (1000+ sites including YouTube, Vimeo, TikTok, Twitter, Facebook, Instagram, educational platforms, and more)",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "list_transcripts",
          description:
            "List all available transcripts in the output directory, sorted by modification time (newest first)",
          inputSchema: {
            type: "object",
            properties: {
              output_dir: {
                type: "string",
                description: `Optional output directory path. Defaults to ${OUTPUT_DIR}`,
              },
              limit: {
                type: "number",
                description:
                  "Optional limit on number of transcripts to return (newest first). If not specified, returns all transcripts.",
              },
            },
          },
        },
        {
          name: "get_latest_transcript",
          description:
            "Get the path and details of the most recently created/modified transcript. Useful to avoid accidentally reading old transcripts.",
          inputSchema: {
            type: "object",
            properties: {
              output_dir: {
                type: "string",
                description: `Optional output directory path. Defaults to ${OUTPUT_DIR}`,
              },
            },
          },
        },
        {
          name: "delete_transcript",
          description:
            "Delete a specific transcript by video ID. This removes all associated files (txt, json, md).",
          inputSchema: {
            type: "object",
            properties: {
              video_id: {
                type: "string",
                description: "The video ID of the transcript to delete (e.g., 'dQw4w9WgXcQ')",
              },
              output_dir: {
                type: "string",
                description: `Optional output directory path. Defaults to ${OUTPUT_DIR}`,
              },
            },
            required: ["video_id"],
          },
        },
        {
          name: "cleanup_old_transcripts",
          description: "Delete transcripts older than a specified number of days. Helps manage disk space.",
          inputSchema: {
            type: "object",
            properties: {
              days: {
                type: "number",
                description: "Delete transcripts older than this many days (e.g., 30 for month-old transcripts)",
              },
              output_dir: {
                type: "string",
                description: `Optional output directory path. Defaults to ${OUTPUT_DIR}`,
              },
            },
            required: ["days"],
          },
        },
        {
          name: "delete_all_transcripts",
          description:
            "Delete ALL transcripts in the output directory. Use with caution - this cannot be undone!",
          inputSchema: {
            type: "object",
            properties: {
              output_dir: {
                type: "string",
                description: `Optional output directory path. Defaults to ${OUTPUT_DIR}`,
              },
              confirm: {
                type: "boolean",
                description: "Must be set to true to confirm deletion of all transcripts",
              },
            },
            required: ["confirm"],
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
          .filter((f) => f.endsWith(".txt") || f.endsWith(".md") || f.endsWith(".json"))
          .map((f) => {
            const fullPath = join(OUTPUT_DIR, f);
            const stats = statSync(fullPath);
            return {
              uri: `file://${fullPath}`,
              name: f,
              description: `Transcript file (${(stats.size / 1024).toFixed(2)} KB, modified ${stats.mtime.toLocaleDateString()})`,
              mimeType:
                f.endsWith(".json") ? "application/json" : f.endsWith(".md") ? "text/markdown" : "text/plain",
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
      const filePath = request.params.uri.replace("file://", "");
      try {
        const content = readFileSync(filePath, "utf-8");
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType:
                filePath.endsWith(".json")
                  ? "application/json"
                  : filePath.endsWith(".md")
                    ? "text/markdown"
                    : "text/plain",
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
        switch (name) {
          case "transcribe_video":
            return await this.handleTranscribeVideo(
              args?.url as string,
              args?.output_dir as string | undefined,
              args?.model as WhisperModel | undefined,
              args?.language as string | undefined
            );
          case "check_dependencies":
            return this.handleCheckDependencies();
          case "list_supported_sites":
            return await this.handleListSupportedSites();
          case "list_transcripts":
            return this.handleListTranscripts(
              args?.output_dir as string | undefined,
              args?.limit as number | undefined
            );
          case "get_latest_transcript":
            return this.handleGetLatestTranscript(args?.output_dir as string | undefined);
          case "delete_transcript":
            return this.handleDeleteTranscript(
              args?.video_id as string,
              args?.output_dir as string | undefined
            );
          case "cleanup_old_transcripts":
            return this.handleCleanupOldTranscripts(
              args?.days as number,
              args?.output_dir as string | undefined
            );
          case "delete_all_transcripts":
            return this.handleDeleteAllTranscripts(
              args?.confirm as boolean | undefined,
              args?.output_dir as string | undefined
            );
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`[MCP] Tool error (${name}):`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${errorMessage}` }],
          isError: true,
        };
      }
    });
  }

  private handleCheckDependencies() {
    const status = checkDependencies();
    return text(`✅ Dependency Check:\n\n${status}`);
  }

  private async handleTranscribeVideo(
    url: string,
    outputDir?: string,
    model?: WhisperModel,
    language?: string
  ) {
    const dir = outputDir || OUTPUT_DIR;

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    console.error(`[MCP] Starting transcription for: ${url}`);

    const onProgress = (message: string) => {
      console.error(`[MCP] ${message}`);
    };

    const result = await transcribeVideo({
      url,
      outputDir: dir,
      model: model || "base",
      language: language || "auto",
      onProgress,
    });

    console.error(`[MCP] Transcription complete!`);

    return text(
      `✅ Video transcribed successfully!

**Video Details:**
- Title: ${result.metadata.title}
- Platform: ${result.metadata.platform}
- Channel: ${result.metadata.channel}
- Video ID: ${result.metadata.videoId}
- Duration: ${Math.floor(result.metadata.duration / 60)}:${String(result.metadata.duration % 60).padStart(2, "0")}

**Transcription Settings:**
- Model: ${result.modelUsed}
- Language: ${language || "auto"}
- Engine: whisper.cpp

**Output Files:**
- Text: ${result.files.txt}
- JSON: ${result.files.json}
- Markdown: ${result.files.md}

**Transcript Preview:**
${result.transcriptPreview}${result.transcript.length > 500 ? "..." : ""}

**Full transcript has ${result.wordCount} words.**

You can now read the full transcript using the file paths above.`
    );
  }

  private async handleListSupportedSites() {
    try {
      const sites = await listSupportedSites();
      const siteCount = sites.length;
      const preview = sites.slice(0, 50).join(", ");

      return text(`📺 Supported Video Platforms (${siteCount} total)

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
${preview}${siteCount > 50 ? "..." : ""}

**Total: ${siteCount} supported extractors**

You can transcribe videos from any of these platforms by providing the video URL!`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `❌ ${errorMessage}` }], isError: true };
    }
  }

  private handleListTranscripts(outputDir?: string, limit?: number) {
    const dir = outputDir || OUTPUT_DIR;

    if (!existsSync(dir)) {
      return text(
        `📂 No transcripts directory found at: ${dir}\n\nTranscribe your first video to create it!`
      );
    }

    const groups = groupTranscripts(dir);
    if (groups.length === 0) {
      return text(`📂 No transcripts found in ${dir}\n\nTranscribe a video to get started!`);
    }

    const toShow = typeof limit === "number" ? groups.slice(0, Math.max(0, limit)) : groups;

    const list = toShow
      .map((g, i) => {
        const mainFile = g.files.find((f) => f.endsWith(".txt")) || g.files[0];
        const title = titleFromFile(g.videoId, mainFile);
        const sizeKb = statSync(g.mainPath).size / 1024;
        const extensions = g.files.map((f) => f.split(".").pop());

        return `${i + 1}. **${title}**
   Video ID: ${g.videoId}
   Files: ${g.files.length} (${extensions.join(", ")})
   Size: ${sizeKb.toFixed(2)} KB
   Modified: ${formatTimestamp(g.modified)}
   Path: ${g.mainPath}`;
      })
      .join("\n\n");

    const summary =
      toShow.length < groups.length
        ? `showing ${toShow.length} most recent out of ${groups.length} total`
        : `${groups.length} videos`;

    return text(
      `📚 Available transcripts (${summary}):\n\n${list}\n\n💡 Tip: You can read any transcript by asking me to read the file path shown above.`
    );
  }

  private handleGetLatestTranscript(outputDir?: string) {
    const dir = outputDir || OUTPUT_DIR;

    if (!existsSync(dir)) {
      return text(
        `📂 No transcripts directory found at: ${dir}\n\nTranscribe your first video to create it!`
      );
    }

    const groups = groupTranscripts(dir);
    if (groups.length === 0) {
      return text(`📂 No transcripts found in ${dir}\n\nTranscribe a video to get started!`);
    }

    const latest = groups[0]; // already sorted newest-first
    const mainFile = latest.files.find((f) => f.endsWith(".txt")) || latest.files[0];
    const title = titleFromFile(latest.videoId, mainFile);
    const sizeKb = statSync(latest.mainPath).size / 1024;
    const extensions = latest.files.map((f) => f.split(".").pop());

    const txtFile = latest.files.find((f) => f.endsWith(".txt"));
    const mdFile = latest.files.find((f) => f.endsWith(".md"));
    const jsonFile = latest.files.find((f) => f.endsWith(".json"));

    let filePaths = `- Text: ${join(dir, txtFile || mainFile)}`;
    if (mdFile) filePaths += `\n- Markdown: ${join(dir, mdFile)}`;
    if (jsonFile) filePaths += `\n- JSON: ${join(dir, jsonFile)}`;

    return text(
      `📄 **Latest Transcript:**

**Title:** ${title}
**Video ID:** ${latest.videoId}
**Modified:** ${formatTimestamp(latest.modified)}
**Size:** ${sizeKb.toFixed(2)} KB
**Files:** ${latest.files.length} (${extensions.join(", ")})

**File Paths:**
${filePaths}

💡 Tip: Use the text file path above to read or summarize this transcript.`
    );
  }

  private handleDeleteTranscript(videoId: string, outputDir?: string) {
    if (!videoId) {
      throw new Error("Missing 'video_id' parameter");
    }
    const dir = outputDir || OUTPUT_DIR;

    if (!existsSync(dir)) {
      return text("📂 No transcripts directory found.");
    }

    const deleted: string[] = [];
    for (const f of readdirSync(dir)) {
      if (f.startsWith(`${videoId}-`)) {
        const full = join(dir, f);
        try {
          rmSync(full, { force: true });
          deleted.push(full);
        } catch (e) {
          // skip files we can't remove
        }
      }
    }

    if (deleted.length === 0) {
      return text(`⚠️ No transcripts found for video ID: ${videoId}`);
    }

    return text(
      `🗑️ Deleted ${deleted.length} file(s) for video ID '${videoId}':\n\n${deleted
        .map((f) => `- ${f}`)
        .join("\n")}`
    );
  }

  private handleCleanupOldTranscripts(days: number, outputDir?: string) {
    if (typeof days !== "number" || !Number.isFinite(days)) {
      throw new Error("Missing or invalid 'days' parameter");
    }
    const dir = outputDir || OUTPUT_DIR;

    if (!existsSync(dir)) {
      return text("📂 No transcripts directory found.");
    }

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const deleted: string[] = [];

    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      try {
        const stats = statSync(full);
        if (stats.isFile() && stats.mtimeMs < cutoff) {
          rmSync(full, { force: true });
          deleted.push(full);
        }
      } catch (e) {
        // skip entries we can't stat/remove
      }
    }

    if (deleted.length === 0) {
      return text(`✅ No transcripts older than ${days} days found.`);
    }

    return text(
      `🗑️ Deleted ${deleted.length} file(s) older than ${days} days:\n\n${deleted
        .map((f) => `- ${f}`)
        .join("\n")}`
    );
  }

  private handleDeleteAllTranscripts(confirm?: boolean, outputDir?: string) {
    if (!confirm) {
      return text("⚠️ Deletion not confirmed. Set 'confirm' to true to delete all transcripts.");
    }
    const dir = outputDir || OUTPUT_DIR;

    if (!existsSync(dir)) {
      return text("📂 No transcripts directory found.");
    }

    let deletedCount = 0;
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      try {
        if (statSync(full).isFile()) {
          rmSync(full, { force: true });
          deletedCount++;
        }
      } catch (e) {
        // skip
      }
    }

    if (deletedCount === 0) {
      return text("📂 No transcripts found to delete.");
    }

    return text(`🗑️ Deleted ALL transcripts: ${deletedCount} file(s) removed from ${dir}`);
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`Video Transcriber MCP Server v${VERSION} running on stdio`);
    console.error(`⚡ Powered by whisper.cpp — 4-10x faster than Python whisper`);
    console.error(`✨ Supports 1000+ video platforms via yt-dlp`);
    console.error(`📂 Output directory: ${OUTPUT_DIR}`);
  }
}

const server = new VideoTranscriberServer();
server.run().catch(console.error);
