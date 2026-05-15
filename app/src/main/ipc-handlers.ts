import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { ipcMain, BrowserWindow, app } from 'electron';
import { nanoid } from 'nanoid';
import { PythonBridge } from './python-bridge';
import { runFullPipeline } from './pipeline';
import { loadSettings, saveSettings } from './settings-manager';

let bridge: PythonBridge | null = null;

function getModelRoot(): string {
  if (app.isPackaged) return process.resourcesPath;
  return path.join(__dirname, '..', '..', '..', '..');
}

function mergeProjectArtifacts(projectDir: string) {
  const metaPath = path.join(projectDir, 'project.json');
  if (!fs.existsSync(metaPath)) return;
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  const videos: any[] = meta.videos || [];
  if (videos.length === 0) return;

  // Merge notes
  const parts: string[] = [];
  for (const v of videos) {
    const notesPath = path.join(projectDir, 'videos', v.id, 'notes.md');
    if (fs.existsSync(notesPath)) {
      const content = fs.readFileSync(notesPath, 'utf-8');
      parts.push(`## ${v.name}\n\n${content}`);
    }
  }
  if (parts.length > 0) {
    fs.writeFileSync(path.join(projectDir, 'notes.md'), parts.join('\n\n---\n\n'));
  }

  // Merge flashcards
  const allCards: any[] = [];
  for (const v of videos) {
    const fcPath = path.join(projectDir, 'videos', v.id, 'flashcards.json');
    if (fs.existsSync(fcPath)) {
      try {
        const fc = JSON.parse(fs.readFileSync(fcPath, 'utf-8'));
        if (fc.cards) allCards.push(...fc.cards);
      } catch {}
    }
  }
  if (allCards.length > 0) {
    const deck = { projectId: meta.id, cards: allCards, createdAt: meta.createdAt, updatedAt: Date.now() };
    fs.writeFileSync(path.join(projectDir, 'flashcards.json'), JSON.stringify(deck, null, 2));
  }
}

export function registerIpcHandlers() {
  ipcMain.handle('project:create', (_event, name: string, videoPath?: string, videoPaths?: string[]) => {
    const s = loadSettings();
    const projectsDir = (s as any).projectsDir || path.join(getModelRoot(), 'projects');

    // Check for duplicate name
    if (fs.existsSync(projectsDir)) {
      for (const id of fs.readdirSync(projectsDir)) {
        const metaPath = path.join(projectsDir, id, 'project.json');
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            if (meta.name === name) return { error: '项目名称已存在，请使用其他名称' };
          } catch {}
        }
      }
    }

    const projectId = nanoid();
    const projectDir = path.join(projectsDir, projectId);
    fs.mkdirSync(projectDir, { recursive: true });

    if (videoPaths && videoPaths.length > 0) {
      // Multi-video collection project with videos
      const videos = videoPaths.map((vp: string, i: number) => {
        const videoId = nanoid();
        const videoName = path.basename(vp, path.extname(vp));
        const videoDir = path.join(projectDir, 'videos', videoId);
        fs.mkdirSync(videoDir, { recursive: true });
        return { id: videoId, name: videoName, videoPath: vp, status: 'created', createdAt: Date.now(), sourceIndex: i };
      });
      const meta = { id: projectId, name, type: 'multi', videos, createdAt: Date.now() };
      fs.writeFileSync(path.join(projectDir, 'project.json'), JSON.stringify(meta, null, 2));
      return { id: projectId, name, folderPath: projectDir, type: 'multi' };
    }

    // Empty collection (no videos yet) or single video project
    const isMulti = videoPaths !== undefined;
    const meta = { id: projectId, name, videoPath: videoPath || '', type: isMulti ? 'multi' : 'single', videos: [], createdAt: Date.now() };
    fs.writeFileSync(path.join(projectDir, 'project.json'), JSON.stringify(meta, null, 2));
    return { id: projectId, name, folderPath: projectDir, type: isMulti ? 'multi' : 'single' };
  });

  ipcMain.handle('project:addVideos', (_event, projectDir: string, videoPaths: string[], videoNames?: string[]) => {
    const metaPath = path.join(projectDir, 'project.json');
    if (!fs.existsSync(metaPath)) return { error: 'Project not found' };
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    meta.type = 'multi';
    if (!meta.videos) meta.videos = [];
    for (let i = 0; i < videoPaths.length; i++) {
      const vp = videoPaths[i];
      const videoId = nanoid();
      const videoName = (videoNames && videoNames[i]) || path.basename(vp, path.extname(vp));
      const videoDir = path.join(projectDir, 'videos', videoId);
      fs.mkdirSync(videoDir, { recursive: true });
      meta.videos.push({ id: videoId, name: videoName, videoPath: vp, status: 'created', createdAt: Date.now() });
    }
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    return { videos: meta.videos };
  });

  ipcMain.handle('pipeline:runAll', async (event, params) => {
    const win = BrowserWindow.fromWebContents(event.sender)!;
    const root = getModelRoot();

    // Auto-fill model paths if not set
    const s = params.settings || {};
    s.ttsModelPath = s.ttsModelPath || path.join(root, 'model', 'VoxCPM2');
    s.pythonPath = s.pythonPath || 'python';
    params.settings = s;

    try {
      if (!bridge) {
        const pythonPath = PythonBridge.findPython();
        bridge = new PythonBridge(pythonPath);
      }

      if (!(bridge as any)['process']) {
        await bridge.start();
      }
    } catch (startError: any) {
      return { error: `Python 启动失败: ${startError.message}` };
    }

    bridge.setProgressHandler((progress) => {
      win.webContents.send('pipeline:progress', progress);
    });

    try {
      const result = await runFullPipeline(win, bridge, params);
      return result;
    } catch (error: any) {
      return { error: error.message };
    }
  });

  ipcMain.handle('batch:run', async (event, items: { videoPath: string; projectDir: string; videoSubDir?: string }[], settings: any) => {
    const win = BrowserWindow.fromWebContents(event.sender)!;
    const root = getModelRoot();

    const s = settings || {};
    s.ttsModelPath = s.ttsModelPath || path.join(root, 'model', 'VoxCPM2');
    s.pythonPath = s.pythonPath || 'python';

    try {
      if (!bridge) {
        const pythonPath = PythonBridge.findPython();
        bridge = new PythonBridge(pythonPath);
      }
      if (!(bridge as any)['process']) {
        await bridge.start();
      }
    } catch (startError: any) {
      for (let i = 0; i < items.length; i++) {
        win.webContents.send('batch:itemComplete', { index: i, status: 'error', error: `Python 启动失败: ${startError.message}` });
      }
      win.webContents.send('batch:done');
      return;
    }

    bridge.setProgressHandler((progress) => {
      win.webContents.send('pipeline:progress', progress);
    });

    for (let i = 0; i < items.length; i++) {
      win.webContents.send('batch:itemStart', { index: i });
      try {
        let pipelineDir = items[i].projectDir;
        if (items[i].videoSubDir) {
          pipelineDir = path.join(items[i].projectDir, items[i].videoSubDir as string);
          fs.mkdirSync(pipelineDir, { recursive: true });
        }
        await runFullPipeline(win, bridge, { videoPath: items[i].videoPath, projectDir: pipelineDir, settings: s });

        // Update video status in project.json
        if (items[i].videoSubDir) {
          const metaPath = path.join(items[i].projectDir, 'project.json');
          if (fs.existsSync(metaPath)) {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            const video = (meta.videos || []).find((v: any) => items[i].videoSubDir?.includes(v.id));
            if (video) video.status = 'completed';
            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
          }
        }

        win.webContents.send('batch:itemComplete', { index: i, status: 'completed' });
      } catch (err: any) {
        win.webContents.send('batch:itemComplete', { index: i, status: 'error', error: err.message });
      }
    }

    // Merge notes and flashcards for multi-video projects
    const firstProjectDir = items[0]?.projectDir;
    if (firstProjectDir && items[0]?.videoSubDir) {
      mergeProjectArtifacts(firstProjectDir);
    }

    win.webContents.send('batch:done');
  });

  ipcMain.handle('settings:load', () => loadSettings());

  // Project Export/Import
  ipcMain.handle('project:export', async (_event, projectDir: string) => {
    const { exportProject } = await import('./project-exporter');
    return exportProject(projectDir);
  });

  ipcMain.handle('project:import', async () => {
    const { importProject } = await import('./project-exporter');
    return importProject();
  });
  ipcMain.handle('settings:save', (_event, settings) => saveSettings(settings));

  ipcMain.handle('models:fetch', async (_event, config: { provider: string; baseUrl: string; apiKey: string }) => {
    try {
      const { provider, baseUrl, apiKey } = config;

      if (provider === 'claude') {
        const resp = await fetch('https://api.anthropic.com/v1/models', {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
        });
        if (!resp.ok) return { error: `API error: ${resp.status}` };
        const data = await resp.json() as any;
        const models = (data.data || []).map((m: any) => m.id).sort();
        return { models };
      }

      // OpenAI-compatible (OpenAI, DeepSeek, Ollama, LM Studio)
      const url = baseUrl.replace(/\/+$/, '') + '/models';
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      const resp = await fetch(url, { headers });
      if (!resp.ok) return { error: `API error: ${resp.status} ${resp.statusText}` };
      const data = await resp.json() as any;
      const models = (data.data || []).map((m: any) => m.id).sort();
      return { models };
    } catch (error: any) {
      return { error: error.message };
    }
  });

  // Flashcard IPC handlers
  ipcMain.handle('flashcard:load', async (_event, projectDir: string) => {
    const deckPath = path.join(projectDir, 'flashcards.json');
    const reviewsPath = path.join(projectDir, 'flashcard-reviews.json');
    let deck = null;
    let reviews: any[] = [];
    if (fs.existsSync(deckPath)) {
      deck = JSON.parse(fs.readFileSync(deckPath, 'utf-8'));
    }
    if (fs.existsSync(reviewsPath)) {
      reviews = JSON.parse(fs.readFileSync(reviewsPath, 'utf-8'));
    }
    return { deck, reviews };
  });

  ipcMain.handle('flashcard:save', async (_event, projectDir: string, deck: any) => {
    const deckPath = path.join(projectDir, 'flashcards.json');
    fs.writeFileSync(deckPath, JSON.stringify({ ...deck, updatedAt: Date.now() }, null, 2));
  });

  ipcMain.handle('flashcard:saveReviews', async (_event, projectDir: string, reviews: any[]) => {
    const reviewsPath = path.join(projectDir, 'flashcard-reviews.json');
    fs.writeFileSync(reviewsPath, JSON.stringify(reviews, null, 2));
  });

  // TTS IPC handlers
  ipcMain.handle('tts:synthesize', async (_event, params: { text: string; projectDir: string; referenceWavPath?: string }) => {
    const modelDir = path.join(getModelRoot(), 'model', 'VoxCPM2');
    const outputPath = path.join(params.projectDir, 'tts', `tts_${Date.now()}.wav`);

    if (!bridge) {
      bridge = new PythonBridge(PythonBridge.findPython());
    }
    if (!(bridge as any)['process']) await bridge.start();

    return bridge.send('tts_synthesize', {
      text: params.text,
      model_dir: modelDir,
      output_path: outputPath,
      reference_wav_path: params.referenceWavPath || null,
    });
  });

  ipcMain.handle('tts:checkAvailable', async () => {
    const modelDir = path.join(getModelRoot(), 'model', 'VoxCPM2');
    if (bridge && (bridge as any)['process']) {
      return bridge.send('check_voxcpm', { model_dir: modelDir });
    }
    const hasWeights = fs.existsSync(path.join(modelDir, 'model.safetensors'));
    const hasVae = fs.existsSync(path.join(modelDir, 'audiovae.pth'));
    return { data: { available: hasWeights && hasVae, modelPath: modelDir } };
  });

  // --- Progress Tracking IPC ---

  ipcMain.handle('progress:loadPlayback', async (_event, projectDir: string) => {
    const filePath = path.join(projectDir, 'playback-state.json');
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
  });

  ipcMain.handle('progress:savePlayback', async (_event, projectDir: string, state: any) => {
    const filePath = path.join(projectDir, 'playback-state.json');
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
  });

  ipcMain.handle('progress:loadSessions', async () => {
    const s = loadSettings();
    const projectsDir = (s as any).projectsDir || path.join(getModelRoot(), 'projects');
    const filePath = path.join(projectsDir, 'study-sessions.json');
    if (!fs.existsSync(filePath)) {
      return { sessions: [], stats: { totalStudySeconds: 0, totalSessions: 0, streakDays: 0, lastStudyDate: null } };
    }
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return { sessions: [], stats: { totalStudySeconds: 0, totalSessions: 0, streakDays: 0, lastStudyDate: null } };
    }
  });

  ipcMain.handle('progress:saveSession', async (_event, session: any) => {
    const s = loadSettings();
    const projectsDir = (s as any).projectsDir || path.join(getModelRoot(), 'projects');
    const filePath = path.join(projectsDir, 'study-sessions.json');

    let data: any = { sessions: [], stats: { totalStudySeconds: 0, totalSessions: 0, streakDays: 0, lastStudyDate: null } };
    if (fs.existsSync(filePath)) {
      try { data = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch {}
    }

    data.sessions.push(session);

    // Recalculate stats
    data.stats.totalSessions = data.sessions.length;
    data.stats.totalStudySeconds = data.sessions.reduce((sum: number, s: any) => sum + (s.durationSeconds || 0), 0);

    // Calculate streak
    const daySet = new Set<string>();
    data.sessions.forEach((s: any) => {
      const d = new Date(s.startedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      daySet.add(key);
    });
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    data.stats.lastStudyDate = todayKey;

    let streak = 0;
    const check = new Date(today);
    // If no study today, start from yesterday
    if (!daySet.has(todayKey)) {
      check.setDate(check.getDate() - 1);
    }
    while (true) {
      const key = `${check.getFullYear()}-${String(check.getMonth() + 1).padStart(2, '0')}-${String(check.getDate()).padStart(2, '0')}`;
      if (daySet.has(key)) {
        streak++;
        check.setDate(check.getDate() - 1);
      } else {
        break;
      }
    }
    data.stats.streakDays = streak;

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return data.stats;
  });

  // --- Question Bank IPC ---

  ipcMain.handle('question:load', async (_event, projectDir: string) => {
    const bankPath = path.join(projectDir, 'questions.json');
    if (!fs.existsSync(bankPath)) return { bank: null };
    try {
      return { bank: JSON.parse(fs.readFileSync(bankPath, 'utf-8')) };
    } catch {
      return { bank: null };
    }
  });

  ipcMain.handle('question:save', async (_event, projectDir: string, bank: any) => {
    const bankPath = path.join(projectDir, 'questions.json');
    fs.writeFileSync(bankPath, JSON.stringify({ ...bank, updatedAt: Date.now() }, null, 2));
  });

  ipcMain.handle('question:generate', async (_event, params: any) => {
    if (!bridge) {
      bridge = new PythonBridge(PythonBridge.findPython());
    }
    if (!(bridge as any)['process']) await bridge.start();
    return bridge.send('generate_questions', params);
  });

  ipcMain.handle('question:tag', async (_event, params: any) => {
    if (!bridge) {
      bridge = new PythonBridge(PythonBridge.findPython());
    }
    if (!(bridge as any)['process']) await bridge.start();
    return bridge.send('tag_questions', params);
  });

  ipcMain.handle('question:parseDocument', async (_event, params: any) => {
    if (!bridge) {
      bridge = new PythonBridge(PythonBridge.findPython());
    }
    if (!(bridge as any)['process']) await bridge.start();
    return bridge.send('parse_document_questions', params);
  });

  ipcMain.handle('question:copyImages', async (_event, srcDir: string, projectDir: string) => {
    const imagesDir = path.join(srcDir, 'images');
    const destDir = path.join(projectDir, 'notes-images');
    if (!fs.existsSync(imagesDir)) return 0;
    fs.mkdirSync(destDir, { recursive: true });
    let count = 0;
    for (const file of fs.readdirSync(imagesDir)) {
      const ext = file.split('.').pop()?.toLowerCase();
      if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '')) {
        fs.copyFileSync(path.join(imagesDir, file), path.join(destDir, file));
        count++;
      }
    }
    return count;
  });

  // --- Online Video Download IPC ---
  ipcMain.handle('video:checkYtDlp', async () => {
    const { checkYtDlp } = await import('./video-downloader');
    return checkYtDlp();
  });

  ipcMain.handle('video:getInfo', async (_event, url: string) => {
    try {
      const { getVideoInfo } = await import('./video-downloader');
      const info = await getVideoInfo(url);
      return { info };
    } catch (error: any) {
      return { error: error.message };
    }
  });

  ipcMain.handle('video:downloadUrl', async (event, params: { url: string; projectDir: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)!;
    try {
      const { downloadVideo } = await import('./video-downloader');
      const result = await downloadVideo(params.url, params.projectDir, (pct) => {
        win.webContents.send('video:downloadProgress', pct);
      });
      return { filePath: result.filePath };
    } catch (error: any) {
      return { error: error.message };
    }
  });

  ipcMain.handle('video:downloadPlaylistItem', async (event, params: { playlistUrl: string; videoIndex: number; projectDir: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)!;
    try {
      const { downloadPlaylistVideo } = await import('./video-downloader');
      const result = await downloadPlaylistVideo(params.playlistUrl, params.videoIndex, params.projectDir, (pct) => {
        win.webContents.send('video:downloadProgress', pct);
      });
      return { filePath: result.filePath };
    } catch (error: any) {
      return { error: error.message };
    }
  });

  ipcMain.handle('project:updateVideoPath', async (_event, projectDir: string, videoId: string, videoPath: string) => {
    const metaPath = path.join(projectDir, 'project.json');
    if (!fs.existsSync(metaPath)) return { error: 'Project not found' };
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const video = (meta.videos || []).find((v: any) => v.id === videoId);
      if (video) {
        video.videoPath = videoPath;
        video.status = 'downloaded';
      }
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      return { success: true };
    } catch (error: any) {
      return { error: error.message };
    }
  });
}
