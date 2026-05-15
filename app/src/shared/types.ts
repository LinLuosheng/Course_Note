export interface ProjectVideo {
  id: string;
  name: string;
  videoPath: string;
  status: ProjectStatus;
  createdAt: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  folderPath: string;
  videoPath: string;
  status: ProjectStatus;
  type?: 'single' | 'multi';
  videos?: ProjectVideo[];
}

export type ProjectStatus =
  | 'created'
  | 'extracting_audio'
  | 'transcribing'
  | 'extracting_slides'
  | 'generating_summary'
  | 'generating_flashcards'
  | 'completed'
  | 'error';

export interface ProcessingProgress {
  stage: ProjectStatus;
  progress: number;
  message: string;
}

export interface ExtractedSlide {
  timestamp: number;
  filePath: string;
  slideNumber: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface AppSettings {
  whisperModel: 'tiny' | 'base' | 'small' | 'medium' | 'large';
  whisperLanguage: string;
  llmProvider: 'openai' | 'claude' | 'deepseek' | 'ollama' | 'lmstudio';
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  sceneThreshold: number;
  projectsDir: string;
  pythonPath: string;
  flashcardAutoGenerate: boolean;
  ttsEnabled: boolean;
  ttsModelPath: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  whisperModel: 'large',
  whisperLanguage: 'auto',
  llmProvider: 'openai',
  llmApiKey: '',
  llmBaseUrl: 'https://api.openai.com/v1',
  llmModel: 'gpt-4o',
  sceneThreshold: 8,
  projectsDir: '',
  pythonPath: 'python',
  flashcardAutoGenerate: true,
  ttsEnabled: true,
  ttsModelPath: '',
};

// --- Flashcard Types ---

export type FlashcardType = 'concept' | 'formula' | 'number' | 'rule';

export interface Flashcard {
  id: string;
  type: FlashcardType;
  text: string;         // Full text with {{c1::answer}}, {{c2::answer}} cloze syntax
  clozes: string[];     // Answer strings, index maps to c-number (1-based)
  sourceSection: string;
  timestamp: number | null;
  createdAt: number;
}

export interface FlashcardDeck {
  projectId: string;
  cards: Flashcard[];
  createdAt: number;
  updatedAt: number;
}

export interface ClozeReviewData {
  cardId: string;
  clozeIndex: number;
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: number;
  lastReview: number | null;
}

// --- Progress Tracking Types ---

export interface PlaybackState {
  timeOffset: number;
  duration: number;
  timeWatched: number;
  timesWatched: number;
  lastWatchedAt: number;
  playbackSpeed: number;
  completed: boolean;
}

export interface StudySession {
  id: string;
  projectId: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
}

export interface StudyStats {
  totalStudySeconds: number;
  totalSessions: number;
  streakDays: number;
  lastStudyDate: string | null;
}

// --- Batch Types ---

export interface BatchQueueItem {
  videoPath: string;
  projectName: string;
  projectDir: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  stage: string;
  errorMessage?: string;
}

// --- Question Bank Types ---

export interface Question {
  id: string;
  content: string;
  options?: string[];
  answer: string;
  explanation?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  source: 'generated' | 'imported';
  knowledgePoints: string[];
  sourceSection?: string;
  timestamp?: number;
  similarToQuestionId?: string;
  createdAt: number;
}

export interface QuestionBank {
  projectId: string;
  questions: Question[];
  knowledgePointIndex: Record<string, string[]>;
  createdAt: number;
  updatedAt: number;
}

export interface AnswerRecord {
  questionId: string;
  isCorrect: boolean;
  studentAnswer: string;
  answeredAt: number;
}
