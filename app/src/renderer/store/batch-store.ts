import { create } from 'zustand';
import { BatchQueueItem } from '@shared/types';

interface BatchStore {
  items: BatchQueueItem[];
  isRunning: boolean;
  currentIndex: number;

  setItems: (items: BatchQueueItem[]) => void;
  setItemStatus: (index: number, status: BatchQueueItem['status'], error?: string) => void;
  setItemProgress: (index: number, progress: number, stage: string) => void;
  setCurrentIndex: (index: number) => void;
  setRunning: (running: boolean) => void;
  clearCompleted: () => void;
  reset: () => void;
}

export const useBatchStore = create<BatchStore>()((set) => ({
  items: [],
  isRunning: false,
  currentIndex: -1,

  setItems: (items) => set({ items }),

  setItemStatus: (index, status, error) =>
    set((s) => ({
      items: s.items.map((item, i) =>
        i === index ? { ...item, status, errorMessage: error } : item
      ),
    })),

  setItemProgress: (index, progress, stage) =>
    set((s) => ({
      items: s.items.map((item, i) =>
        i === index ? { ...item, progress, stage } : item
      ),
    })),

  setCurrentIndex: (index) => set({ currentIndex: index }),

  setRunning: (running) => set({ isRunning: running }),

  clearCompleted: () =>
    set((s) => ({
      items: s.items.filter((item) => item.status !== 'completed' && item.status !== 'error'),
    })),

  reset: () => set({ items: [], isRunning: false, currentIndex: -1 }),
}));
