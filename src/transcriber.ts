import { execSync, exec } from "child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join, basename, extname, resolve } from "path";

export type WhisperModel = "tiny" | "base" | "small" | "medium" | "large";

interface VideoMetadata {
  videoId: string;
  title: string;
  channel: string;
  duration: number;
  uploadDate: string;
  platform: string; // e.g., "YouTube", "Vimeo", "TikTok"
  url: string;
}

interface TranscriptionOptions {
  url: string; // Can be a URL or local file path
  outputDir: string;
  model?: WhisperModel;
  language?: string; // ISO 639-1 code (e.g., "en", "es", "fr") or "auto"
  onProgress?: (message: string) => void;
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
 * Extract video ID from URL (works for YouTube and other platforms)
 */
function extractVideoId(url: string, metadata: any): string {
  // Try YouTube patterns first
  let match = url.match(/[?&]v=([^&]+)/);
  if (match) return match[1];

  match = url.match(/youtu\.be\/([^?]+)/);
  if (match) return match[1];

  // Use yt-dlp metadata ID if available
  if (metadata.id) return metadata.id;

  // Fallback: generate ID from URL
  const hash = Buffer.from(url).toString('base64').substring(0, 11).replace(/\+/g, '-').replace(/\//g, '_');
  return hash;
}

/**
 * Detect platform from URL or metadata
 */
function detectPlatform(url: string, metadata: any): string {
  const urlLower = url.toLowerCase();

  // Check URL patterns
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) return 'YouTube';
  if (urlLower.includes('vimeo.com')) return 'Vimeo';
  if (urlLower.includes('tiktok.com')) return 'TikTok';
  if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) return 'Twitter/X';
  if (urlLower.includes('facebook.com') || urlLower.includes('fb.watch')) return 'Facebook';
  if (urlLower.includes('instagram.com')) return 'Instagram';
  if (urlLower.includes('twitch.tv')) return 'Twitch';
  if (urlLower.includes('dailymotion.com')) return 'Dailymotion';

  // Check metadata extractor
  if (metadata.extractor) {
    const extractor = metadata.extractor.toLowerCase();
    if (extractor.includes('youtube')) return 'YouTube';
    if (extractor.includes('vimeo')) return 'Vimeo';
    if (extractor.includes('tiktok')) return 'TikTok';
    if (extractor.includes('twitter')) return 'Twitter/X';
    return metadata.extractor; // Return the extractor name as platform
  }

  return 'Unknown';
}

/**
 * Check if input is a URL or local file path
 */
function isUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

/**
 * Validate URL format
 */
function validateUrl(url: string): void {
  try {
    new URL(url);
  } catch (error) {
    throw new Error(`Invalid URL format: ${url}`);
  }
}

/**
 * Validate local file path
 */
function validateLocalFile(filePath: string): void {
  const absolutePath = resolve(filePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  // Check if it's a video file by extension
  const ext = extname(absolutePath).toLowerCase();
  const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.webm', '.m4v', '.mpg', '.mpeg', '.3gp', '.ogv'];

  if (!videoExtensions.includes(ext)) {
    throw new Error(`Unsupported file format: ${ext}. Expected video file.`);
  }
}

/**
 * Extract audio from local video file using ffmpeg
 */
async function extractAudioFromLocal(
  videoPath: string,
  outputPath: string,
  onProgress?: (message: string) => void
): Promise<void> {
  const absolutePath = resolve(videoPath);

  onProgress?.(`Extracting audio from local video file...`);

  // Use ffmpeg to extract audio as mp3
  const command = `ffmpeg -i "${absolutePath}" -vn -acodec libmp3lame -q:a 2 "${outputPath}" -y`;

  try {
    await execPromise(command);
    onProgress?.(`Audio extracted successfully`);
  } catch (error) {
    throw new Error(`Failed to extract audio: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get basic metadata from local video file using ffprobe
 */
async function getLocalVideoMetadata(videoPath: string): Promise<any> {
  const absolutePath = resolve(videoPath);
  const fileName = basename(absolutePath, extname(absolutePath));

  try {
    // Try to get duration using ffprobe
    const { stdout } = await execPromise(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${absolutePath}"`
    );

    const duration = parseFloat(stdout.trim()) || 0;

    return {
      id: fileName,
      title: fileName,
      channel: 'Local File',
      duration: Math.floor(duration),
      upload_date: '',
      extractor: 'local',
    };
  } catch (error) {
    // If ffprobe fails, return basic metadata
    return {
      id: fileName,
      title: fileName,
      channel: 'Local File',
      duration: 0,
      upload_date: '',
      extractor: 'local',
    };
  }
}

/**
 * Sanitize filename - improved to preserve more characters
 */
function sanitizeFilename(str: string): string {
  return str
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "") // Remove invalid filename characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/--+/g, "-") // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, "") // Trim hyphens from start/end
    .substring(0, 150); // Increase length limit
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
 * Execute command with retries for network failures
 */
async function execWithRetry(
  command: string,
  options: Record<string, any> = {},
  maxRetries: number = 3,
  onProgress?: (message: string) => void
): Promise<ExecResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await execPromise(command, options);
    } catch (error) {
      lastError = error as Error;
      const errorMsg = lastError.message.toLowerCase();

      // Check if it's a network-related error
      const isNetworkError =
        errorMsg.includes('network') ||
        errorMsg.includes('connection') ||
        errorMsg.includes('timeout') ||
        errorMsg.includes('unreachable') ||
        errorMsg.includes('temporary failure');

      if (!isNetworkError || attempt === maxRetries) {
        throw lastError;
      }

      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
      if (onProgress) {
        onProgress(`Network error, retrying in ${delay / 1000}s (attempt ${attempt}/${maxRetries})...`);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Transcribe a video from any supported platform (YouTube, Vimeo, TikTok, etc.) or a local video file
 * @param options - Transcription options
 * @returns Paths to generated files and metadata
 */
export async function transcribeVideo(options: TranscriptionOptions): Promise<TranscriptionResult> {
  const {
    url,
    outputDir,
    model = "base",
    language = "auto",
    onProgress = () => {},
  } = options;

  const isLocalFile = !isUrl(url);

  // Validate input
  if (isLocalFile) {
    validateLocalFile(url);
    onProgress(`Processing local video file: ${url}`);
  } else {
    validateUrl(url);
    onProgress(`Processing video URL: ${url}`);
  }

  const tempDir = mkdtempSync(join(tmpdir(), "video-transcript-"));

  try {
    let metadata: any;
    let platform: string;
    let videoId: string;
    let videoTitle: string;
    let videoChannel: string;
    let videoDuration: number;
    let videoUploadDate: string;
    const audioPath = join(tempDir, "video.mp3");

    if (isLocalFile) {
      // Handle local file
      const absolutePath = resolve(url);
      onProgress(`Extracting metadata from local file...`);

      metadata = await getLocalVideoMetadata(absolutePath);
      platform = 'Local File';
      videoId = metadata.id;
      videoTitle = metadata.title;
      videoChannel = metadata.channel;
      videoDuration = metadata.duration;
      videoUploadDate = metadata.upload_date;

      // Extract audio from local file
      await extractAudioFromLocal(absolutePath, audioPath, onProgress);
    } else {
      // Handle URL
      // Fetch video metadata
      onProgress(`Fetching video metadata from ${url}...`);
      const { stdout: metadataJson } = await execWithRetry(
        `yt-dlp --dump-json "${url}"`,
        {},
        3,
        onProgress
      );
      metadata = JSON.parse(metadataJson);

      // Detect platform and extract video ID
      platform = detectPlatform(url, metadata);
      onProgress(`Detected platform: ${platform}`);

      videoId = extractVideoId(url, metadata);
      videoTitle = metadata.title || "Unknown";
      videoChannel = metadata.channel || "Unknown";
      videoDuration = metadata.duration || 0;
      videoUploadDate = metadata.upload_date || "";

      // Download audio
      onProgress(`Downloading audio from ${platform}...`);
      await execWithRetry(
        `yt-dlp -x --audio-format mp3 -o "video.%(ext)s" "${url}"`,
        { cwd: tempDir },
        3,
        onProgress
      );
    }

    // Create safe filename
    const safeFilename = `${videoId}-${sanitizeFilename(videoTitle)}`;

    // Transcribe with Whisper
    const modelInfo = ` (model: ${model}${language !== 'auto' ? `, language: ${language}` : ''})`;
    onProgress(`Transcribing audio with Whisper${modelInfo}...`);

    // Build whisper command
    let whisperCmd = `whisper "${audioPath}" --model ${model} --output_format all --output_dir "${tempDir}"`;
    if (language && language !== 'auto') {
      whisperCmd += ` --language ${language}`;
    }

    await execPromise(whisperCmd, { cwd: tempDir });

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
**Platform:** ${platform}
**Channel:** ${videoChannel}
**Video ID:** ${videoId}
**Duration:** ${formatDuration(videoDuration)}
**Published:** ${formatDate(videoUploadDate)}

---

## Transcript

${txtContent}

---

*Transcribed using OpenAI Whisper (model: ${model}${language !== 'auto' ? `, language: ${language}` : ''})*
`;

    writeFileSync(mdOutput, mdContent);

    onProgress("Cleaning up temporary files...");

    // Cleanup temp directory
    rmSync(tempDir, { recursive: true, force: true });

    onProgress("✅ Transcription complete!");

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
        platform,
        url,
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
    const installInstructions = missing.map(dep => {
      if (dep === "yt-dlp" || dep === "whisper") {
        return `  ${dep}: pip install ${dep === "whisper" ? "openai-whisper" : dep}`;
      }
      return `  ${dep}: Install from package manager or https://ffmpeg.org`;
    }).join("\n");

    throw new Error(
      `Missing dependencies: ${missing.join(", ")}\n\n` +
      `Please install:\n${installInstructions}\n\n` +
      `See README for platform-specific installation instructions.`
    );
  }

  return true;
}

/**
 * Get list of supported sites from yt-dlp
 */
export async function listSupportedSites(): Promise<string[]> {
  try {
    const { stdout } = await execPromise('yt-dlp --list-extractors');
    return stdout
      .split('\n')
      .filter(line => line.trim().length > 0)
      .sort();
  } catch (error) {
    throw new Error('Failed to get supported sites. Make sure yt-dlp is installed.');
  }
}
