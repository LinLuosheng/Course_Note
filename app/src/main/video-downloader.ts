import { spawn, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { nanoid } from 'nanoid';

function findYtDlp(): string {
  try {
    const result = execSync('where yt-dlp 2>nul || which yt-dlp 2>/dev/null', { encoding: 'utf-8' });
    return result.trim().split('\n')[0].trim();
  } catch {
    return 'yt-dlp';
  }
}

export async function checkYtDlp(): Promise<{ installed: boolean; path: string; version?: string }> {
  const bin = findYtDlp();
  try {
    const ver = execSync(`"${bin}" --version`, { encoding: 'utf-8', timeout: 10000 }).trim();
    return { installed: true, path: bin, version: ver };
  } catch {
    return { installed: false, path: bin };
  }
}

export interface VideoEntry {
  title: string;
  url: string;
  duration: number;
  index: number;
}

export interface VideoInfoResult {
  title: string;
  isPlaylist: boolean;
  totalCount: number;
  entries: VideoEntry[];
  uploader: string;
  thumbnail: string;
}

function parseJsonLines(stdout: string): any[] {
  const results: any[] = [];
  for (const line of stdout.trim().split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      results.push(JSON.parse(trimmed));
    } catch {}
  }
  return results;
}

export async function getVideoInfo(url: string): Promise<VideoInfoResult> {
  return new Promise((resolve, reject) => {
    const bin = findYtDlp();
    // --flat-playlist: don't download, just list entries
    // --dump-json: output as JSON
    // Without --no-playlist so it can detect playlist
    const proc = spawn(bin, ['--flat-playlist', '--dump-json', '--no-warnings', url], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(stderr || `yt-dlp exited with code ${code}`));
        return;
      }
      try {
        const items = parseJsonLines(stdout);
        if (items.length === 0) {
          reject(new Error('No video info returned'));
          return;
        }

        if (items.length === 1) {
          // Single video
          const d = items[0];
          resolve({
            title: d.title || 'Untitled',
            isPlaylist: false,
            totalCount: 1,
            entries: [{ title: d.title || 'Untitled', url: d.url || d.webpage_url || url, duration: d.duration || 0, index: 0 }],
            uploader: d.uploader || d.channel || '',
            thumbnail: d.thumbnail || '',
          });
        } else {
          // Playlist / collection
          const first = items[0];
          const entries: VideoEntry[] = items.map((d: any, i: number) => ({
            title: d.title || `Video ${i + 1}`,
            url: d.url || d.webpage_url || '',
            duration: d.duration || 0,
            index: i,
          }));
          resolve({
            title: first.playlist_title || first.title || 'Playlist',
            isPlaylist: true,
            totalCount: items.length,
            entries,
            uploader: first.uploader || first.channel || '',
            thumbnail: first.thumbnail || '',
          });
        }
      } catch (e: any) {
        reject(new Error(`Failed to parse yt-dlp output: ${e.message}`));
      }
    });
  });
}

export async function downloadVideo(
  url: string,
  outputDir: string,
  onProgress: (pct: number) => void
): Promise<{ filePath: string }> {
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'video.mp4');

  return new Promise((resolve, reject) => {
    const bin = findYtDlp();
    const proc = spawn(bin, [
      '-f', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
      '--merge-output-format', 'mp4',
      '-o', outputPath,
      '--no-warnings',
      '--no-playlist',
      url,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => {
      const line = d.toString();
      const match = line.match(/\[download\]\s+([\d.]+)%/);
      if (match) {
        onProgress(parseFloat(match[1]));
      }
    });
    proc.stderr.on('data', (d) => (stderr += d));

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `yt-dlp download failed with code ${code}`));
        return;
      }
      if (!fs.existsSync(outputPath)) {
        const files = fs.readdirSync(outputDir);
        const mp4 = files.find((f) => f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm'));
        if (mp4) {
          resolve({ filePath: path.join(outputDir, mp4) });
        } else {
          reject(new Error('Download completed but output file not found'));
        }
        return;
      }
      resolve({ filePath: outputPath });
    });
  });
}

export async function downloadPlaylistVideo(
  playlistUrl: string,
  videoIndex: number,
  outputDir: string,
  onProgress: (pct: number) => void
): Promise<{ filePath: string }> {
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'video.mp4');

  return new Promise((resolve, reject) => {
    const bin = findYtDlp();
    const proc = spawn(bin, [
      '-f', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
      '--merge-output-format', 'mp4',
      '-o', outputPath,
      '--no-warnings',
      '--playlist-items', String(videoIndex + 1),
      playlistUrl,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => {
      const line = d.toString();
      const match = line.match(/\[download\]\s+([\d.]+)%/);
      if (match) {
        onProgress(parseFloat(match[1]));
      }
    });
    proc.stderr.on('data', (d) => (stderr += d));

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `yt-dlp download failed with code ${code}`));
        return;
      }
      if (!fs.existsSync(outputPath)) {
        const files = fs.readdirSync(outputDir);
        const mp4 = files.find((f) => f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm'));
        if (mp4) resolve({ filePath: path.join(outputDir, mp4) });
        else reject(new Error('Download completed but output file not found'));
        return;
      }
      resolve({ filePath: outputPath });
    });
  });
}
