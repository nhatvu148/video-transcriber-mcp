import { execFile } from "child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  statSync,
} from "fs";
import { readFile } from "fs/promises";
import { tmpdir, homedir, cpus } from "os";
import { join, basename, extname, resolve } from "path";

export type WhisperModel = "tiny" | "base" | "small" | "medium" | "large";

const ALL_MODELS: WhisperModel[] = ["tiny", "base", "small", "medium", "large"];

/**
 * The whisper.cpp CLI binary name. `brew install whisper-cpp` installs it as
 * `whisper-cli`. Override with WHISPER_CPP_BINARY if it lives elsewhere / under
 * a different name (e.g. the legacy `main`).
 */
const WHISPER_CLI = process.env.WHISPER_CPP_BINARY || "whisper-cli";

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
  wordCount: number;
  modelUsed: WhisperModel;
}

interface ExecResult {
  stdout: string;
  stderr: string;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Default output directory for generated transcripts.
 * Mirrors the Rust server's `get_default_output_dir()`.
 */
export function getDefaultOutputDir(): string {
  return join(homedir(), "Downloads", "video-transcripts");
}

/**
 * Directory where whisper.cpp ggml model files live.
 * Mirrors the Rust server's `get_models_dir()`.
 */
export function getModelsDir(): string {
  return join(homedir(), ".cache", "video-transcriber-mcp", "models");
}

function modelFilename(model: WhisperModel): string {
  return `ggml-${model}.bin`;
}

function modelPath(model: WhisperModel): string {
  return join(getModelsDir(), modelFilename(model));
}

// ---------------------------------------------------------------------------
// yt-dlp cookies
// ---------------------------------------------------------------------------

/**
 * Resolve the cookie flag pair for yt-dlp from the environment.
 *
 * Precedence (mirrors the Rust `resolve_cookies_args`):
 *   1. YT_DLP_COOKIES — path to a Netscape-format cookies file
 *      (`--cookies <file>`). Preferred on headless/Linux setups.
 *   2. YT_DLP_COOKIES_FROM_BROWSER — browser name to read cookies from
 *      (`--cookies-from-browser <name>`), piggybacking on a logged-in session.
 *
 * Either source bypasses YouTube's "Sign in to confirm you're not a bot" wall
 * and unlocks age-restricted / members-only videos.
 */
export function resolveCookiesArgs(
  cookiesFile = process.env.YT_DLP_COOKIES,
  browser = process.env.YT_DLP_COOKIES_FROM_BROWSER
): string[] | null {
  const file = cookiesFile?.trim();
  if (file) return ["--cookies", file];

  const b = browser?.trim();
  if (b) return ["--cookies-from-browser", b];

  return null;
}

// ---------------------------------------------------------------------------
// Metadata / platform detection
// ---------------------------------------------------------------------------

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
  const hash = Buffer.from(url).toString("base64").substring(0, 11).replace(/\+/g, "-").replace(/\//g, "_");
  return hash;
}

/**
 * Detect platform from URL or metadata
 */
function detectPlatform(url: string, metadata: any): string {
  const urlLower = url.toLowerCase();

  // Check URL patterns
  if (urlLower.includes("youtube.com") || urlLower.includes("youtu.be")) return "YouTube";
  if (urlLower.includes("vimeo.com")) return "Vimeo";
  if (urlLower.includes("tiktok.com")) return "TikTok";
  if (urlLower.includes("twitter.com") || urlLower.includes("x.com")) return "Twitter/X";
  if (urlLower.includes("facebook.com") || urlLower.includes("fb.watch")) return "Facebook";
  if (urlLower.includes("instagram.com")) return "Instagram";
  if (urlLower.includes("twitch.tv")) return "Twitch";
  if (urlLower.includes("dailymotion.com")) return "Dailymotion";

  // Check metadata extractor
  if (metadata.extractor) {
    const extractor = metadata.extractor.toLowerCase();
    if (extractor.includes("youtube")) return "YouTube";
    if (extractor.includes("vimeo")) return "Vimeo";
    if (extractor.includes("tiktok")) return "TikTok";
    if (extractor.includes("twitter")) return "Twitter/X";
    return metadata.extractor; // Return the extractor name as platform
  }

  return "Unknown";
}

/**
 * Check if input is a URL or local file path
 */
function isUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (error) {
    return false;
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
  const videoExtensions = [".mp4", ".avi", ".mov", ".mkv", ".flv", ".wmv", ".webm", ".m4v", ".mpg", ".mpeg", ".3gp", ".ogv"];

  if (!videoExtensions.includes(ext)) {
    throw new Error(`Unsupported file format: ${ext}. Expected video file.`);
  }
}

/**
 * Get basic metadata from a local video file using ffprobe.
 */
async function getLocalVideoMetadata(videoPath: string): Promise<any> {
  const absolutePath = resolve(videoPath);
  const fileName = basename(absolutePath, extname(absolutePath));

  try {
    // Try to get duration using ffprobe
    const { stdout } = await execFilePromise("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      absolutePath,
    ]);

    const duration = parseFloat(stdout.trim()) || 0;

    return {
      id: fileName,
      title: fileName,
      channel: "Local File",
      duration: Math.floor(duration),
      upload_date: "",
      extractor: "local",
    };
  } catch (error) {
    // If ffprobe fails, return basic metadata
    return {
      id: fileName,
      title: fileName,
      channel: "Local File",
      duration: 0,
      upload_date: "",
      extractor: "local",
    };
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize filename - preserves most characters, mirrors the Rust sanitizer's
 * intent (replace filesystem-illegal characters, cap length).
 */
function sanitizeFilename(str: string): string {
  return str
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "") // Remove invalid filename characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/--+/g, "-") // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, "") // Trim hyphens from start/end
    .substring(0, 150);
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

// ---------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------

/**
 * Run a command with an argument array (no shell), returning stdout/stderr.
 * Using an arg array avoids shell-injection from untrusted URLs/paths.
 */
function execFilePromise(
  command: string,
  args: string[],
  options: Record<string, any> = {}
): Promise<ExecResult> {
  return new Promise((res, reject) => {
    execFile(command, args, { maxBuffer: 50 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Command failed: ${command} ${args.join(" ")}\n${error.message}\n${stderr}`));
        return;
      }
      res({ stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });
}

/**
 * Execute a command with retries for transient network failures.
 */
async function execWithRetry(
  command: string,
  args: string[],
  options: Record<string, any> = {},
  maxRetries: number = 3,
  onProgress?: (message: string) => void
): Promise<ExecResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await execFilePromise(command, args, options);
    } catch (error) {
      lastError = error as Error;
      const errorMsg = lastError.message.toLowerCase();

      const isNetworkError =
        errorMsg.includes("network") ||
        errorMsg.includes("connection") ||
        errorMsg.includes("timeout") ||
        errorMsg.includes("unreachable") ||
        errorMsg.includes("temporary failure");

      if (!isNetworkError || attempt === maxRetries) {
        throw lastError;
      }

      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
      onProgress?.(`Network error, retrying in ${delay / 1000}s (attempt ${attempt}/${maxRetries})...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError!;
}

/**
 * Whisper is fastest on Apple Silicon using P-cores only — spilling onto
 * E-cores actively slows transcription. Probe the P-core count on macOS and
 * fall back to all logical cores elsewhere. Mirrors the Rust
 * `optimal_whisper_threads()`.
 */
function optimalWhisperThreads(): number {
  if (process.platform === "darwin") {
    try {
      const out = require("child_process").execFileSync("sysctl", ["-n", "hw.perflevel0.physicalcpu"], {
        encoding: "utf-8",
      });
      const n = parseInt(String(out).trim(), 10);
      if (Number.isFinite(n) && n > 0) return n;
    } catch (error) {
      // fall through
    }
  }
  return cpus().length || 4;
}

// ---------------------------------------------------------------------------
// Downloading / audio extraction
// ---------------------------------------------------------------------------

/**
 * Download audio-only from a URL via yt-dlp into `tempDir`, returning the mp3 path.
 */
async function downloadAudio(
  url: string,
  tempDir: string,
  onProgress?: (message: string) => void
): Promise<string> {
  const args = ["-x", "--audio-format", "mp3", "-o", join(tempDir, "video.%(ext)s")];

  const cookies = resolveCookiesArgs();
  if (cookies) {
    onProgress?.(`Using ${cookies[0]} ${cookies[1]}`);
    args.push(...cookies);
  }
  args.push(url);

  await execWithRetry("yt-dlp", args, {}, 3, onProgress);

  const audioPath = join(tempDir, "video.mp3");
  if (!existsSync(audioPath)) {
    throw new Error(`Downloaded audio file not found at ${audioPath}`);
  }
  return audioPath;
}

/**
 * Extract audio from a local video file using ffmpeg into `outputPath` (mp3).
 */
async function extractAudioFromLocal(
  videoPath: string,
  outputPath: string,
  onProgress?: (message: string) => void
): Promise<void> {
  const absolutePath = resolve(videoPath);
  onProgress?.("Extracting audio from local video file...");

  try {
    await execFilePromise("ffmpeg", [
      "-i", absolutePath,
      "-vn",
      "-acodec", "libmp3lame",
      "-q:a", "2",
      "-y",
      outputPath,
    ]);
    onProgress?.("Audio extracted successfully");
  } catch (error) {
    throw new Error(`Failed to extract audio: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Whisper (whisper.cpp local + remote worker)
// ---------------------------------------------------------------------------

/**
 * Transcribe an audio file. Routes to a remote whisper worker if
 * REMOTE_WHISPER_URL is set; otherwise runs whisper.cpp locally.
 * Returns the plain transcript text.
 */
async function transcribeAudio(
  audioPath: string,
  model: WhisperModel,
  language: string,
  tempDir: string,
  onProgress?: (message: string) => void
): Promise<string> {
  const remote = process.env.REMOTE_WHISPER_URL?.trim();
  if (remote) {
    return transcribeRemote(remote, audioPath, model, language, onProgress);
  }
  return transcribeLocal(audioPath, model, language, tempDir, onProgress);
}

/**
 * Offload transcription to a remote HTTP worker. POSTs multipart
 * {audio, model, language} and expects JSON {transcript, segments[]}.
 * Mirrors the Rust `transcribe_remote`.
 */
async function transcribeRemote(
  url: string,
  audioPath: string,
  model: WhisperModel,
  language: string,
  onProgress?: (message: string) => void
): Promise<string> {
  onProgress?.(`Transcribing via remote Whisper (${url}), model: ${model}...`);

  const bytes = await readFile(audioPath);
  const filename = basename(audioPath) || "audio.mp3";

  const form = new FormData();
  form.append("audio", new Blob([bytes], { type: "audio/mpeg" }), filename);
  form.append("model", model);
  form.append("language", language || "auto");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 600_000); // 10 min

  try {
    const resp = await fetch(url, { method: "POST", body: form, signal: controller.signal });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Remote whisper returned ${resp.status}: ${body}`);
    }
    const data: any = await resp.json();
    const transcript = typeof data.transcript === "string" ? data.transcript : "";
    onProgress?.(
      `Remote transcription complete${Array.isArray(data.segments) ? ` (${data.segments.length} segments)` : ""}`
    );
    return transcript.trim();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Remote whisper request timed out after 600s");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Run whisper.cpp locally via its CLI. whisper.cpp needs 16kHz mono PCM WAV
 * input, so we transcode with ffmpeg first (same conversion the Rust engine
 * feeds to whisper-rs), then invoke `whisper-cli` and read the emitted .txt.
 */
async function transcribeLocal(
  audioPath: string,
  model: WhisperModel,
  language: string,
  tempDir: string,
  onProgress?: (message: string) => void
): Promise<string> {
  const modelFile = modelPath(model);
  if (!existsSync(modelFile)) {
    throw new Error(
      `Whisper model not found: ${modelFile}\n\n` +
        `Please download it using:\n` +
        `  bash scripts/download-models.sh ${model}\n\n` +
        `Or download manually from:\n` +
        `  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${modelFilename(model)}`
    );
  }

  // Convert to 16kHz mono WAV (whisper.cpp's required input format).
  onProgress?.("Converting audio to 16kHz mono WAV...");
  const wavPath = join(tempDir, "audio16k.wav");
  await execFilePromise("ffmpeg", [
    "-i", audioPath,
    "-ar", "16000",
    "-ac", "1",
    "-c:a", "pcm_s16le",
    "-y",
    wavPath,
  ]);

  const outPrefix = join(tempDir, "transcript");
  const args = [
    "-m", modelFile,
    "-f", wavPath,
    "-otxt",
    "-of", outPrefix,
    "-np", // no prints (keep stdout clean)
    "-t", String(optimalWhisperThreads()),
  ];
  if (language && language !== "auto") {
    args.push("-l", language);
  } else {
    args.push("-l", "auto");
  }

  onProgress?.(`Transcribing audio with whisper.cpp (model: ${model})...`);
  try {
    await execFilePromise(WHISPER_CLI, args);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("ENOENT")) {
      throw new Error(
        `whisper.cpp CLI ('${WHISPER_CLI}') not found. Install it with:\n` +
          `  brew install whisper-cpp        (macOS)\n` +
          `Or build from https://github.com/ggerganov/whisper.cpp and set WHISPER_CPP_BINARY.`
      );
    }
    throw new Error(`whisper.cpp transcription failed: ${msg}`);
  }

  const txtPath = `${outPrefix}.txt`;
  if (!existsSync(txtPath)) {
    throw new Error(`whisper.cpp did not produce a transcript at ${txtPath}`);
  }

  const raw = readFileSync(txtPath, "utf-8");
  // whisper.cpp writes one line per segment; join into a single spaced
  // transcript to match the Rust engine's space-joined output.
  const transcript = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join(" ")
    .trim();

  return transcript;
}

// ---------------------------------------------------------------------------
// Output writing
// ---------------------------------------------------------------------------

function saveOutputs(
  metadata: VideoMetadata,
  transcript: string,
  outputDir: string,
  model: WhisperModel
): { txt: string; json: string; md: string } {
  const safeFilename = `${metadata.videoId}-${sanitizeFilename(metadata.title)}`;

  const txtOutput = join(outputDir, `${safeFilename}.txt`);
  const jsonOutput = join(outputDir, `${safeFilename}.json`);
  const mdOutput = join(outputDir, `${safeFilename}.md`);

  writeFileSync(txtOutput, transcript);

  const jsonContent = JSON.stringify(
    {
      metadata,
      transcript,
      model,
    },
    null,
    2
  );
  writeFileSync(jsonOutput, jsonContent);

  const mdContent = `# ${metadata.title}

**Video:** ${metadata.url}
**Platform:** ${metadata.platform}
**Channel:** ${metadata.channel}
**Video ID:** ${metadata.videoId}
**Duration:** ${formatDuration(metadata.duration)}
**Published:** ${formatDate(metadata.uploadDate)}

---

## Transcript

${transcript}

---

*Transcribed using whisper.cpp - Model: ${model}*
`;
  writeFileSync(mdOutput, mdContent);

  return { txt: txtOutput, json: jsonOutput, md: mdOutput };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Transcribe a video from any supported platform (YouTube, Vimeo, TikTok, etc.)
 * or a local video file, using whisper.cpp.
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

  if (isLocalFile) {
    validateLocalFile(url);
    onProgress(`Processing local video file: ${url}`);
  } else {
    onProgress(`Processing video URL: ${url}`);
  }

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const tempDir = mkdtempSync(join(tmpdir(), "video-transcript-"));

  try {
    let metadata: VideoMetadata;
    let audioPath: string;

    if (isLocalFile) {
      const absolutePath = resolve(url);
      onProgress("Extracting metadata from local file...");
      const raw = await getLocalVideoMetadata(absolutePath);

      metadata = {
        videoId: raw.id,
        title: raw.title,
        channel: raw.channel,
        duration: raw.duration,
        uploadDate: raw.upload_date,
        platform: "Local File",
        url: absolutePath,
      };

      audioPath = join(tempDir, "video.mp3");
      await extractAudioFromLocal(absolutePath, audioPath, onProgress);
    } else {
      onProgress(`Fetching video metadata from ${url}...`);
      const metaArgs = ["--dump-json"];
      const cookies = resolveCookiesArgs();
      if (cookies) metaArgs.push(...cookies);
      metaArgs.push(url);

      let raw: any;
      try {
        const { stdout } = await execWithRetry("yt-dlp", metaArgs, {}, 3, onProgress);
        raw = JSON.parse(stdout);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("Sign in to confirm") && !resolveCookiesArgs()) {
          throw new Error(
            "YouTube triggered bot detection. Authenticate with cookies: set " +
              "YT_DLP_COOKIES=/path/to/cookies.txt (a Netscape-format cookies file) or " +
              "YT_DLP_COOKIES_FROM_BROWSER=chrome (or brave/firefox/edge).\n\n" +
              msg
          );
        }
        throw error;
      }

      const platform = detectPlatform(url, raw);
      onProgress(`Detected platform: ${platform}`);

      metadata = {
        videoId: extractVideoId(url, raw),
        title: raw.title || "Unknown",
        channel: raw.channel || raw.uploader || "Unknown",
        duration: raw.duration || 0,
        uploadDate: raw.upload_date || "",
        platform,
        url,
      };

      onProgress(`Downloading audio from ${platform}...`);
      audioPath = await downloadAudio(url, tempDir, onProgress);
    }

    const transcript = await transcribeAudio(audioPath, model, language, tempDir, onProgress);

    const files = saveOutputs(metadata, transcript, outputDir, model);

    onProgress("Cleaning up temporary files...");
    rmSync(tempDir, { recursive: true, force: true });

    onProgress("✅ Transcription complete!");

    const wordCount = transcript.split(/\s+/).filter((w) => w.length > 0).length;

    return {
      success: true,
      files,
      metadata,
      transcript,
      transcriptPreview: transcript.substring(0, 500),
      wordCount,
      modelUsed: model,
    };
  } catch (error) {
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
 * Check whether required tools/models are installed. Returns a human-readable
 * status string (never throws). Mirrors the Rust `check_dependencies`.
 */
export function checkDependencies(): string {
  const lines: string[] = [];

  const has = (cmd: string, args: string[]): boolean => {
    try {
      require("child_process").execFileSync(cmd, args, { stdio: "ignore" });
      return true;
    } catch (error) {
      return false;
    }
  };

  lines.push(has("yt-dlp", ["--version"]) ? "✅ yt-dlp: installed" : "❌ yt-dlp: NOT installed");
  lines.push(has("ffmpeg", ["-version"]) ? "✅ ffmpeg: installed" : "❌ ffmpeg: NOT installed");

  const remote = process.env.REMOTE_WHISPER_URL?.trim();
  if (!remote) {
    lines.push(
      has(WHISPER_CLI, ["--help"])
        ? `✅ whisper.cpp CLI (${WHISPER_CLI}): installed`
        : `❌ whisper.cpp CLI (${WHISPER_CLI}): NOT installed (brew install whisper-cpp)`
    );
  }

  lines.push("");
  lines.push("📦 Whisper Models:");
  if (remote) {
    lines.push("  (remote: REMOTE_WHISPER_URL is set — local models unused)");
  }
  for (const model of ALL_MODELS) {
    const p = modelPath(model);
    const label = model.charAt(0).toUpperCase() + model.slice(1);
    if (existsSync(p)) {
      let size = "unknown";
      try {
        size = `${(statSync(p).size / 1_000_000).toFixed(1)} MB`;
      } catch (e) {
        // keep "unknown"
      }
      lines.push(`  ✅ ${label}: ${p} (${size})`);
    } else {
      lines.push(`  ❌ ${label}: not installed`);
    }
  }

  return lines.join("\n");
}

/**
 * Get list of supported sites from yt-dlp
 */
export async function listSupportedSites(): Promise<string[]> {
  try {
    const { stdout } = await execFilePromise("yt-dlp", ["--list-extractors"]);
    return stdout
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .sort();
  } catch (error) {
    throw new Error("Failed to get supported sites. Make sure yt-dlp is installed.");
  }
}
