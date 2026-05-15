import { contextBridge, ipcRenderer } from 'electron';

let progressCallback: ((data: any) => void) | null = null;

const progressHandler = (_event: any, data: any) => {
  if (progressCallback) progressCallback(data);
};

contextBridge.exposeInMainWorld('electronAPI', {
  selectVideoFile: () => ipcRenderer.invoke('dialog:selectVideo'),
  selectVideoFiles: () => ipcRenderer.invoke('dialog:selectVideoFiles'),
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  createProject: (name: string) => ipcRenderer.invoke('project:create', name),
  createCollection: (name: string, videoPaths: string[]) => ipcRenderer.invoke('project:create', name, undefined, videoPaths),
  addVideosToProject: (projectDir: string, videoPaths: string[], videoNames?: string[]) => ipcRenderer.invoke('project:addVideos', projectDir, videoPaths, videoNames),
  updateVideoPath: (projectDir: string, videoId: string, videoPath: string) => ipcRenderer.invoke('project:updateVideoPath', projectDir, videoId, videoPath),
  runPipeline: (params: any) => ipcRenderer.invoke('pipeline:runAll', params),
  onPipelineProgress: (callback: (data: any) => void) => {
    if (progressCallback) {
      ipcRenderer.removeListener('pipeline:progress', progressHandler);
    }
    progressCallback = callback;
    ipcRenderer.on('pipeline:progress', progressHandler);
  },
  removePipelineProgressListener: () => {
    ipcRenderer.removeListener('pipeline:progress', progressHandler);
    progressCallback = null;
  },
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: any) => ipcRenderer.invoke('settings:save', settings),
  fetchModels: (config: any) => ipcRenderer.invoke('models:fetch', config),
  loadFlashcards: (projectDir: string) => ipcRenderer.invoke('flashcard:load', projectDir),
  saveFlashcards: (projectDir: string, deck: any) => ipcRenderer.invoke('flashcard:save', projectDir, deck),
  saveFlashcardReviews: (projectDir: string, reviews: any[]) => ipcRenderer.invoke('flashcard:saveReviews', projectDir, reviews),
  // TTS
  ttsSynthesize: (params: any) => ipcRenderer.invoke('tts:synthesize', params),
  ttsCheckAvailable: () => ipcRenderer.invoke('tts:checkAvailable'),
  // Media
  getMediaUrl: (filePath: string) => ipcRenderer.invoke('media:getUrl', filePath),
  // File read
  readTextFile: (filePath: string) => ipcRenderer.invoke('file:readText', filePath),
  // Projects
  listProjects: () => ipcRenderer.invoke('project:list'),
  deleteProject: (folderPath: string) => ipcRenderer.invoke('project:delete', folderPath),
  openProjectFolder: (folderPath: string) => ipcRenderer.invoke('project:openFolder', folderPath),
  exportProject: (projectDir: string) => ipcRenderer.invoke('project:export', projectDir),
  importProject: () => ipcRenderer.invoke('project:import'),
  // Progress tracking
  loadPlaybackState: (projectDir: string) => ipcRenderer.invoke('progress:loadPlayback', projectDir),
  savePlaybackState: (projectDir: string, state: any) => ipcRenderer.invoke('progress:savePlayback', projectDir, state),
  loadStudySessions: () => ipcRenderer.invoke('progress:loadSessions'),
  saveStudySession: (session: any) => ipcRenderer.invoke('progress:saveSession', session),
  // Batch
  runBatch: (items: any[], settings: any) => ipcRenderer.invoke('batch:run', items, settings),
  onBatchItemStart: (cb: (data: { index: number }) => void) => { ipcRenderer.on('batch:itemStart', (_e, d) => cb(d)); },
  onBatchItemComplete: (cb: (data: { index: number; status: string; error?: string }) => void) => { ipcRenderer.on('batch:itemComplete', (_e, d) => cb(d)); },
  onBatchDone: (cb: () => void) => { ipcRenderer.on('batch:done', () => cb()); },
  removeBatchListeners: () => {
    ipcRenderer.removeAllListeners('batch:itemStart');
    ipcRenderer.removeAllListeners('batch:itemComplete');
    ipcRenderer.removeAllListeners('batch:done');
  },
  // Export
  exportPPTX: (projectDir: string) => ipcRenderer.invoke('export:pptx', projectDir),
  selectPDFFiles: () => ipcRenderer.invoke('dialog:selectPDF'),
  // Question Bank
  loadQuestions: (projectDir: string) => ipcRenderer.invoke('question:load', projectDir),
  saveQuestions: (projectDir: string, bank: any) => ipcRenderer.invoke('question:save', projectDir, bank),
  generateQuestions: (params: any) => ipcRenderer.invoke('question:generate', params),
  tagQuestions: (params: any) => ipcRenderer.invoke('question:tag', params),
  parseDocumentQuestions: (params: any) => ipcRenderer.invoke('question:parseDocument', params),
  selectQuestionFile: () => ipcRenderer.invoke('dialog:selectQuestionFile'),
  copyImagesToProject: (srcDir: string, projectDir: string) => ipcRenderer.invoke('question:copyImages', srcDir, projectDir),
  // Online video download
  checkYtDlp: () => ipcRenderer.invoke('video:checkYtDlp'),
  getVideoInfo: (url: string) => ipcRenderer.invoke('video:getInfo', url),
  downloadVideoFromUrl: (params: { url: string; projectDir: string }) => ipcRenderer.invoke('video:downloadUrl', params),
  downloadPlaylistVideo: (params: { playlistUrl: string; videoIndex: number; projectDir: string }) => ipcRenderer.invoke('video:downloadPlaylistItem', params),
  onVideoDownloadProgress: (cb: (pct: number) => void) => { ipcRenderer.on('video:downloadProgress', (_e, pct) => cb(pct)); },
  removeVideoDownloadProgressListener: () => { ipcRenderer.removeAllListeners('video:downloadProgress'); },
});
