import { create } from 'zustand';
import type { Question, QuestionBank, AnswerRecord } from '@shared/types';

interface PracticeState {
  queue: Question[];
  currentIndex: number;
  selectedAnswer: string;
  showResult: boolean;
  answers: AnswerRecord[];
}

interface QuestionState {
  bank: QuestionBank | null;
  isGenerating: boolean;
  isTagging: boolean;
  allKnowledgePoints: string[];
  selectedPoints: string[];
  selectedDifficulty: string | null;

  // Practice
  practice: PracticeState;

  // Actions
  loadBank: (projectDir: string) => Promise<void>;
  saveBank: (projectDir: string) => Promise<void>;
  setBank: (bank: QuestionBank) => void;
  generateQuestions: (projectDir: string, notesMd: string, llmConfig: any) => Promise<void>;
  importAndTag: (projectDir: string, questions: any[], llmConfig: any) => Promise<void>;
  parseAndImport: (projectDir: string, filePath: string, llmConfig: any) => Promise<void>;
  setSelectedPoints: (points: string[]) => void;
  setSelectedDifficulty: (d: string | null) => void;
  startPractice: () => void;
  submitAnswer: (answer: string) => void;
  nextQuestion: () => void;
  endPractice: () => void;
  reset: () => void;
}

export const useQuestionStore = create<QuestionState>()((set, get) => ({
  bank: null,
  isGenerating: false,
  isTagging: false,
  allKnowledgePoints: [],
  selectedPoints: [],
  selectedDifficulty: null,
  practice: {
    queue: [],
    currentIndex: 0,
    selectedAnswer: '',
    showResult: false,
    answers: [],
  },

  loadBank: async (projectDir: string) => {
    const result = await window.electronAPI?.loadQuestions(projectDir);
    if (result?.bank) {
      const points = extractKnowledgePoints(result.bank.questions);
      set({ bank: result.bank, allKnowledgePoints: points });
    } else {
      set({ bank: null, allKnowledgePoints: [] });
    }
  },

  saveBank: async (projectDir: string) => {
    const { bank } = get();
    if (bank) {
      // Rebuild knowledge point index
      const index: Record<string, string[]> = {};
      for (const q of bank.questions) {
        for (const p of q.knowledgePoints) {
          if (!index[p]) index[p] = [];
          index[p].push(q.id);
        }
      }
      bank.knowledgePointIndex = index;
      await window.electronAPI?.saveQuestions(projectDir, bank);
    }
  },

  setBank: (bank: QuestionBank) => {
    const points = extractKnowledgePoints(bank.questions);
    set({ bank, allKnowledgePoints: points });
  },

  generateQuestions: async (projectDir: string, notesMd: string, llmConfig: any) => {
    set({ isGenerating: true });
    try {
      const result = await window.electronAPI?.generateQuestions({
        notesMd,
        llmConfig,
        count: 10,
      });
      if (result?.status === 'success' && result.data?.questions) {
        const { bank } = get();
        const existing = bank?.questions || [];
        const newQuestions: Question[] = result.data.questions;
        const merged = [...existing, ...newQuestions];

        const updatedBank: QuestionBank = {
          projectId: bank?.projectId || pathBasename(projectDir),
          questions: merged,
          knowledgePointIndex: {},
          createdAt: bank?.createdAt || Date.now(),
          updatedAt: Date.now(),
        };

        const points = extractKnowledgePoints(merged);
        set({ bank: updatedBank, allKnowledgePoints: points, isGenerating: false });
        await get().saveBank(projectDir);
      } else {
        set({ isGenerating: false });
      }
    } catch {
      set({ isGenerating: false });
    }
  },

  importAndTag: async (projectDir: string, questions: any[], llmConfig: any) => {
    set({ isTagging: true });
    try {
      const { allKnowledgePoints } = get();
      const result = await window.electronAPI?.tagQuestions({
        questions,
        existingPoints: allKnowledgePoints,
        llmConfig,
      });
      if (result?.status === 'success' && result.data?.questions) {
        const { bank } = get();
        const existing = bank?.questions || [];
        const tagged: Question[] = result.data.questions;
        const merged = [...existing, ...tagged];

        const updatedBank: QuestionBank = {
          projectId: bank?.projectId || pathBasename(projectDir),
          questions: merged,
          knowledgePointIndex: {},
          createdAt: bank?.createdAt || Date.now(),
          updatedAt: Date.now(),
        };

        const points = extractKnowledgePoints(merged);
        set({ bank: updatedBank, allKnowledgePoints: points, isTagging: false });
        await get().saveBank(projectDir);
      } else {
        set({ isTagging: false });
      }
    } catch {
      set({ isTagging: false });
    }
  },

  parseAndImport: async (projectDir: string, filePath: string, llmConfig: any) => {
    set({ isTagging: true });
    try {
      // Step 1: Parse document into questions
      const parseResult = await window.electronAPI?.parseDocumentQuestions({
        filePath,
        llmConfig,
      });
      if (parseResult?.status !== 'success' || !parseResult.data?.questions?.length) {
        set({ isTagging: false });
        return { error: 'AI 未能从文档中识别出题目' };
      }

      // Step 2: Tag questions with knowledge points
      const { allKnowledgePoints, bank } = get();
      const existingQuestions = bank?.questions || [];
      const parsedQuestions = parseResult.data.questions;

      const tagResult = await window.electronAPI?.tagQuestions({
        questions: parsedQuestions,
        existingPoints: allKnowledgePoints,
        llmConfig,
      });

      if (tagResult?.status === 'success' && tagResult.data?.questions) {
        const tagged: Question[] = tagResult.data.questions;
        const merged = [...existingQuestions, ...tagged];
        const updatedBank: QuestionBank = {
          projectId: bank?.projectId || pathBasename(projectDir),
          questions: merged,
          knowledgePointIndex: {},
          createdAt: bank?.createdAt || Date.now(),
          updatedAt: Date.now(),
        };
        const points = extractKnowledgePoints(merged);
        set({ bank: updatedBank, allKnowledgePoints: points, isTagging: false });
        await get().saveBank(projectDir);
        return { success: true, count: tagged.length };
      } else {
        set({ isTagging: false });
        return { error: '知识点分类失败' };
      }
    } catch (e: any) {
      set({ isTagging: false });
      return { error: e.message };
    }
  },

  setSelectedPoints: (points: string[]) => set({ selectedPoints: points }),
  setSelectedDifficulty: (d: string | null) => set({ selectedDifficulty: d }),

  startPractice: () => {
    const { bank, selectedPoints, selectedDifficulty } = get();
    if (!bank) return;

    let pool = bank.questions;
    if (selectedPoints.length > 0) {
      pool = pool.filter(q =>
        q.knowledgePoints.some(p => selectedPoints.includes(p))
      );
    }
    if (selectedDifficulty) {
      pool = pool.filter(q => q.difficulty === selectedDifficulty);
    }

    // Shuffle
    const shuffled = [...pool].sort(() => Math.random() - 0.5);

    set({
      practice: {
        queue: shuffled,
        currentIndex: 0,
        selectedAnswer: '',
        showResult: false,
        answers: [],
      },
    });
  },

  submitAnswer: (answer: string) => {
    const { practice, bank } = get();
    const current = practice.queue[practice.currentIndex];
    if (!current) return;

    const isCorrect = answer.trim().toUpperCase() === current.answer.trim().toUpperCase();

    set({
      practice: {
        ...practice,
        selectedAnswer: answer,
        showResult: true,
        answers: [
          ...practice.answers,
          {
            questionId: current.id,
            isCorrect,
            studentAnswer: answer,
            answeredAt: Date.now(),
          },
        ],
      },
    });
  },

  nextQuestion: () => {
    const { practice } = get();
    set({
      practice: {
        ...practice,
        currentIndex: practice.currentIndex + 1,
        selectedAnswer: '',
        showResult: false,
      },
    });
  },

  endPractice: () => {
    set({
      practice: {
        queue: [],
        currentIndex: 0,
        selectedAnswer: '',
        showResult: false,
        answers: [],
      },
    });
  },

  reset: () => {
    set({
      bank: null,
      isGenerating: false,
      isTagging: false,
      allKnowledgePoints: [],
      selectedPoints: [],
      selectedDifficulty: null,
      practice: {
        queue: [],
        currentIndex: 0,
        selectedAnswer: '',
        showResult: false,
        answers: [],
      },
    });
  },
}));

function extractKnowledgePoints(questions: Question[]): string[] {
  const pointSet = new Set<string>();
  for (const q of questions) {
    for (const p of q.knowledgePoints) {
      pointSet.add(p);
    }
  }
  return Array.from(pointSet).sort();
}

function pathBasename(p: string): string {
  return p.split(/[/\\]/).pop() || '';
}
