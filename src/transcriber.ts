import { execSync, exec } from "child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

interface VideoMetadata {
  videoId: string;
  title: string;
  channel: string;
  duration: number;
  uploadDate: string;
}

interface TranscriptionResult {
  success: boolean;
  files: {
    txt: string;
    json: string;
    md: string;
  };
  metadata: VideoMetadata;
  transcript: string;
  transcriptPreview: string;
}

interface ExecResult {
  stdout: string;
  stderr: string;
}

/**
 * Extract video ID from YouTube URL
 */
function extractVideoId(url: string): string {
  // Match ?v=VIDEO_ID pattern
  let match = url.match(/[?&]v=([^&]+)/);
  if (match) return match[1];

  // Match youtu.be/VIDEO_ID pattern
  match = url.match(/youtu\.be\/([^?]+)/);
  if (match) return match[1];

  throw new Error("Could not extract video ID from URL");
}

/**
 * Sanitize filename
 */
function sanitizeFilename(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9 ]/g, "-")
    .replace(/\s+/g, "-")
    .substring(0, 100);
}

/**
 * Format duration in seconds to HH:MM:SS
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Format date from YYYYMMDD to YYYY-MM-DD
 */
function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return dateStr;
  return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
}

/**
 * Execute command with promise
 */
function execPromise(command: string, options: Record<string, any> = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    exec(command, { maxBuffer: 10 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Command failed: ${error.message}\n${stderr}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

/**
 * Transcribe a YouTube video
 * @param url - YouTube video URL
 * @param outputDir - Output directory path
 * @param onProgress - Progress callback function
 * @returns Paths to generated files and metadata
 */
export async function transcribeYouTube(
  url: string,
  outputDir: string,
  onProgress: (message: string) => void = () => {}
): Promise<TranscriptionResult> {
  const tempDir = mkdtempSync(join(tmpdir(), "youtube-transcript-"));

  try {
    // Extract video ID
    onProgress("Extracting video ID...");
    const videoId = extractVideoId(url);

    // Fetch video metadata
    onProgress("Fetching video metadata...");
    const { stdout: metadataJson } = await execPromise(
      `yt-dlp --dump-json "${url}"`
    );
    const metadata = JSON.parse(metadataJson);

    const videoTitle: string = metadata.title || "Unknown";
    const videoChannel: string = metadata.channel || "Unknown";
    const videoDuration: number = metadata.duration || 0;
    const videoUploadDate: string = metadata.upload_date || "";

    // Create safe filename
    const safeFilename = `${videoId}-${sanitizeFilename(videoTitle)}`;

    // Download audio
    onProgress("Downloading audio...");
    await execPromise(
      `yt-dlp -x --audio-format mp3 -o "video.%(ext)s" "${url}"`,
      { cwd: tempDir }
    );

    const audioPath = join(tempDir, "video.mp3");

    // Transcribe with Whisper
    onProgress("Transcribing audio with Whisper (this may take a few minutes)...");
    await execPromise(
      `whisper "${audioPath}" --model base --output_format all --output_dir "${tempDir}" --language en`,
      { cwd: tempDir }
    );

    // Read transcript files
    const txtContent = readFileSync(join(tempDir, "video.txt"), "utf-8");
    const jsonContent = readFileSync(join(tempDir, "video.json"), "utf-8");

    // Create output files
    const txtOutput = join(outputDir, `${safeFilename}.txt`);
    const jsonOutput = join(outputDir, `${safeFilename}.json`);
    const mdOutput = join(outputDir, `${safeFilename}.md`);

    // Copy text file
    writeFileSync(txtOutput, txtContent);

    // Copy JSON file
    writeFileSync(jsonOutput, jsonContent);

    // Create markdown file
    const mdContent = `# ${videoTitle}

**Video:** ${url}
**Channel:** ${videoChannel}
**Video ID:** ${videoId}
**Duration:** ${formatDuration(videoDuration)}
**Published:** ${formatDate(videoUploadDate)}

---

## Transcript

${txtContent}

---

*Transcribed using OpenAI Whisper*
`;

    writeFileSync(mdOutput, mdContent);

    onProgress("Cleaning up...");

    // Cleanup temp directory
    rmSync(tempDir, { recursive: true, force: true });

    onProgress("Done!");

    return {
      success: true,
      files: {
        txt: txtOutput,
        json: jsonOutput,
        md: mdOutput,
      },
      metadata: {
        videoId,
        title: videoTitle,
        channel: videoChannel,
        duration: videoDuration,
        uploadDate: videoUploadDate,
      },
      transcript: txtContent,
      transcriptPreview: txtContent.substring(0, 500),
    };
  } catch (error) {
    // Cleanup on error
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Transcription failed: ${errorMessage}`);
  }
}

/**
 * Check if required tools are installed
 */
export function checkDependencies(): boolean {
  const dependencies = [
    { name: "yt-dlp", command: "yt-dlp --version" },
    { name: "whisper", command: "whisper --help" },
    { name: "ffmpeg", command: "ffmpeg -version" },
  ];

  const missing: string[] = [];

  for (const dep of dependencies) {
    try {
      execSync(dep.command, { stdio: "ignore" });
    } catch (error) {
      missing.push(dep.name);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing dependencies: ${missing.join(", ")}\n\n` +
      `Please install:\n` +
      missing.map(dep => `  brew install ${dep}`).join("\n")
    );
  }

  return true;
}
