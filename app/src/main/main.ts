import { app, BrowserWindow, dialog, protocol, ipcMain, net } from 'electron';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { registerIpcHandlers } from './ipc-handlers';
import { loadSettings } from './settings-manager';
import { exportNotesToPptx } from './pptx-exporter';

let mainWindow: BrowserWindow | null = null;
let mediaServerPort = 0;

function startMediaServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${mediaServerPort}`);
    const filePath = decodeURIComponent(url.searchParams.get('path') || '');

    if (!filePath || !fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const mimeType = getMimeType(filePath);
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
        res.writeHead(206, {
          'Content-Type': mimeType,
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(end - start + 1),
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
    }

    res.writeHead(200, {
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(fileSize),
    });
    fs.createReadStream(filePath).pipe(res);
  });

  server.listen(0, '127.0.0.1', () => {
    mediaServerPort = (server.address() as any).port;
    console.log(`[MediaServer] listening on http://127.0.0.1:${mediaServerPort}`);
  });
}

function mediaUrl(filePath: string): string {
  return `http://127.0.0.1:${mediaServerPort}/?path=${encodeURIComponent(filePath)}`;
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'coursenote',
    privileges: {
      bypassCSP: true,
      stream: true,
      supportFetchAPI: true,
      standard: false,
      secure: true,
    },
  },
]);

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo', '.mov': 'video/quicktime', '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  };
  return types[ext] || 'application/octet-stream';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'CourseNote - 课程总结',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const rendererPath = path.join(__dirname, '..', '..', 'renderer', 'index.html');
  if (!app.isPackaged && !fs.existsSync(rendererPath)) {
    mainWindow.loadURL('http://localhost:5180');
  } else {
    mainWindow.loadFile(rendererPath);
  }
}

app.whenReady().then(() => {
  startMediaServer();
  protocol.handle('coursenote', async (request) => {
    console.log(`[Protocol] request.url: ${request.url}`);
    let urlPath = request.url.replace('coursenote://', '');
    urlPath = urlPath.replace(/^(video|image)\//, '');
    const filePath = decodeURIComponent(urlPath);
    console.log(`[Protocol] filePath: ${filePath}, exists: ${fs.existsSync(filePath)}`);

    if (!fs.existsSync(filePath)) {
      return new Response('Not found', { status: 404 });
    }

    const stat = fs.statSync(filePath);
    const mimeType = getMimeType(filePath);
    const fileSize = stat.size;

    // Handle range requests for video/audio seeking
    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        const buf = Buffer.alloc(chunkSize);
        const fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, buf, 0, chunkSize, start);
        fs.closeSync(fd);

        return new Response(buf as any, {
          status: 206,
          headers: {
            'Content-Type': mimeType,
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize),
          },
        });
      }
    }

    // Full file response
    const buf = fs.readFileSync(filePath);
    return new Response(buf as any, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(fileSize),
      },
    });
  });

  createWindow();
  registerIpcHandlers();

  ipcMain.handle('media:getUrl', (_event, filePath: string) => {
    return mediaUrl(filePath);
  });

  ipcMain.handle('file:readText', (_event, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
      }
      return null;
    } catch {
      return null;
    }
  });

  ipcMain.handle('project:list', () => {
    const s = loadSettings();
    const modelRoot = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', '..', '..', '..');
    const projectsDir = (s as any).projectsDir || path.join(modelRoot, 'projects');
    if (!fs.existsSync(projectsDir)) return [];

    return fs.readdirSync(projectsDir)
      .map((id) => {
        const folderPath = path.join(projectsDir, id);
        if (!fs.statSync(folderPath).isDirectory()) return null;
        let meta: any = {};
        const metaPath = path.join(folderPath, 'project.json');
        if (fs.existsSync(metaPath)) {
          try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch {}
        }
        // Read playback state for progress info
        let progressPct = 0;
        let lastWatchedAt = 0;
        const playbackPath = path.join(folderPath, 'playback-state.json');
        if (fs.existsSync(playbackPath)) {
          try {
            const pb = JSON.parse(fs.readFileSync(playbackPath, 'utf-8'));
            if (pb.duration > 0) progressPct = Math.min(1, pb.timeOffset / pb.duration);
            lastWatchedAt = pb.lastWatchedAt || 0;
          } catch {}
        }
        return {
          id,
          name: meta.name || id,
          videoPath: meta.videoPath || '',
          folderPath,
          hasNotes: fs.existsSync(path.join(folderPath, 'notes.md')),
          hasFlashcards: fs.existsSync(path.join(folderPath, 'flashcards.json')),
          hasTranscript: fs.existsSync(path.join(folderPath, 'transcript.json')),
          createdAt: meta.createdAt || fs.statSync(folderPath).birthtimeMs,
          progressPct,
          lastWatchedAt,
          type: meta.type || 'single',
          videos: meta.videos || [],
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => (b.lastWatchedAt || b.createdAt) - (a.lastWatchedAt || a.createdAt));
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

ipcMain.handle('project:delete', async (_event, folderPath: string) => {
  try {
    console.log(`[Delete] attempting to delete: ${folderPath}`);
    if (!folderPath || !fs.existsSync(folderPath)) {
      console.log(`[Delete] path does not exist: ${folderPath}`);
      return { success: true };
    }
    fs.rmSync(folderPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    // Verify deletion
    if (fs.existsSync(folderPath)) {
      console.log(`[Delete] WARNING: path still exists after rmSync: ${folderPath}`);
      return { error: '删除失败，文件夹可能被占用' };
    }
    console.log(`[Delete] successfully deleted: ${folderPath}`);
    return { success: true };
  } catch (err: any) {
    console.log(`[Delete] error: ${err.message}`);
    return { error: err.message };
  }
});

ipcMain.handle('project:openFolder', async (_event, folderPath: string) => {
  const { shell } = require('electron');
  if (folderPath && fs.existsSync(folderPath)) {
    await shell.openPath(folderPath);
    return { success: true };
  }
  return { error: '目录不存在' };
});

ipcMain.handle('dialog:selectVideo', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '选择课程视频',
    filters: [
      { name: '视频文件', extensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'] },
      { name: '所有文件', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '选择项目存储目录',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:selectVideoFiles', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '选择多个课程视频',
    filters: [
      { name: '视频文件', extensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'] },
      { name: '所有文件', extensions: ['*'] },
    ],
    properties: ['openFile', 'multiSelections'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths;
});

ipcMain.handle('dialog:selectPDF', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '选择课程课件 PDF',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile', 'multiSelections'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths;
});

ipcMain.handle('dialog:selectQuestionFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '选择题库文件',
    filters: [
      { name: '支持的文件', extensions: ['json', 'txt', 'pdf', 'docx', 'doc'] },
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'Word', extensions: ['docx', 'doc'] },
      { name: 'JSON', extensions: ['json'] },
      { name: 'Text', extensions: ['txt'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('export:pptx', async (_event, projectDir: string) => {
  const notesPath = path.join(projectDir, 'notes.md');
  if (!fs.existsSync(notesPath)) {
    return { error: '笔记文件不存在' };
  }
  const notesMd = fs.readFileSync(notesPath, 'utf-8');
  const imagesDir = path.join(projectDir, 'notes-images');
  const projectName = path.basename(projectDir);
  const outputPath = path.join(projectDir, `${projectName}-notes.pptx`);
  try {
    await exportNotesToPptx(notesMd, imagesDir, projectName, outputPath);
    return { outputPath };
  } catch (err: any) {
    return { error: err.message };
  }
});
