export interface ElectronAPI {
  selectVideoFile(): Promise<string | null>;
  selectFolder(): Promise<string | null>;
  createProject(name: string): Promise<{ id: string; name: string; folderPath: string } | { error: string } | null>;
  createCollection(name: string, videoPaths: string[]): Promise<{ id: string; name: string; folderPath: string; type: string } | { error: string } | null>;
  addVideosToProject(projectDir: string, videoPaths: string[], videoNames?: string[]): Promise<{ videos: any[] } | { error: string }>;
  updateVideoPath(projectDir: string, videoId: string, videoPath: string): Promise<{ success: boolean } | { error: string }>;
  runPipeline(params: { videoPath: string; projectDir: string; pdfPaths?: string[]; settings: any }): Promise<any>;
  onPipelineProgress(callback: (progress: any) => void): void;
  removePipelineProgressListener(): void;
  getMediaUrl(filePath: string): Promise<string>;
  loadSettings(): Promise<any>;
  saveSettings(settings: any): Promise<void>;
  fetchModels(config: { provider: string; baseUrl: string; apiKey: string }): Promise<{ models?: string[]; error?: string }>;
  loadFlashcards(projectDir: string): Promise<{ deck: any | null; reviews: any[] }>;
  saveFlashcards(projectDir: string, deck: any): Promise<void>;
  saveFlashcardReviews(projectDir: string, reviews: any[]): Promise<void>;
  // TTS
  ttsSynthesize(params: { text: string; projectDir: string; referenceWavPath?: string }): Promise<{ audioPath?: string; error?: string }>;
  ttsCheckAvailable(): Promise<{ available: boolean; modelPath: string }>;
  // File
  readTextFile(filePath: string): Promise<string | null>;
  listProjects(): Promise<ProjectInfo[]>;
  deleteProject(folderPath: string): Promise<{ success: boolean }>;
  openProjectFolder(folderPath: string): Promise<{ success: boolean } | { error: string }>;
  exportProject(projectDir: string): Promise<{ outputPath?: string; error?: string }>;
  importProject(): Promise<{ id?: string; folderPath?: string; error?: string }>;
  // Progress tracking
  loadPlaybackState(projectDir: string): Promise<import('./types').PlaybackState | null>;
  savePlaybackState(projectDir: string, state: import('./types').PlaybackState): Promise<void>;
  loadStudySessions(): Promise<{ sessions: import('./types').StudySession[]; stats: import('./types').StudyStats }>;
  saveStudySession(session: import('./types').StudySession): Promise<import('./types').StudyStats>;
  // Batch
  selectVideoFiles(): Promise<string[] | null>;
  runBatch(items: { videoPath: string; projectDir: string }[], settings: any): Promise<void>;
  onBatchItemStart(cb: (data: { index: number }) => void): void;
  onBatchItemComplete(cb: (data: { index: number; status: string; error?: string }) => void): void;
  onBatchDone(cb: () => void): void;
  removeBatchListeners(): void;
  // Export
  exportPPTX(projectDir: string): Promise<{ outputPath?: string; error?: string }>;
  selectPDFFiles(): Promise<string[] | null>;
  // Question Bank
  loadQuestions(projectDir: string): Promise<{ bank: import('./types').QuestionBank | null }>;
  saveQuestions(projectDir: string, bank: import('./types').QuestionBank): Promise<void>;
  generateQuestions(params: { notesMd: string; llmConfig: any; count?: number }): Promise<any>;
  tagQuestions(params: { questions: any[]; existingPoints: string[]; llmConfig: any }): Promise<any>;
  parseDocumentQuestions(params: { filePath: string; llmConfig: any }): Promise<any>;
  selectQuestionFile(): Promise<string | null>;
  copyImagesToProject(srcDir: string, projectDir: string): Promise<number>;
  // Online video download
  checkYtDlp(): Promise<{ installed: boolean; path: string; version?: string }>;
  getVideoInfo(url: string): Promise<{
    info?: {
      title: string;
      isPlaylist: boolean;
      totalCount: number;
      entries: { title: string; url: string; duration: number; index: number }[];
      uploader: string;
      thumbnail: string;
    };
    error?: string;
  }>;
  downloadVideoFromUrl(params: { url: string; projectDir: string }): Promise<{ filePath?: string; error?: string }>;
  downloadPlaylistVideo(params: { playlistUrl: string; videoIndex: number; projectDir: string }): Promise<{ filePath?: string; error?: string }>;
  onVideoDownloadProgress(cb: (pct: number) => void): void;
  removeVideoDownloadProgressListener(): void;
}

export interface ProjectInfo {
  id: string;
  folderPath: string;
  hasNotes: boolean;
  hasFlashcards: boolean;
  hasTranscript: boolean;
  createdAt: number;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
