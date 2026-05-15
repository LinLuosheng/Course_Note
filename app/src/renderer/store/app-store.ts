import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AppSettings, DEFAULT_SETTINGS, ProcessingProgress } from '@shared/types';

interface AppState {
  settings: AppSettings;
  isSettingsOpen: boolean;
  progress: ProcessingProgress | null;
  isProcessing: boolean;
  updateSettings: (partial: Partial<AppSettings>) => void;
  setSettingsOpen: (open: boolean) => void;
  setProgress: (progress: ProcessingProgress | null) => void;
  setProcessing: (processing: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      isSettingsOpen: false,
      progress: null,
      isProcessing: false,
      updateSettings: (partial) =>
        set((state) => ({ settings: { ...state.settings, ...partial } })),
      setSettingsOpen: (open) => set({ isSettingsOpen: open }),
      setProgress: (progress) => set({ progress }),
      setProcessing: (processing) => set({ isProcessing: processing }),
    }),
    { name: 'coursenote-settings', partialize: (state) => ({ settings: state.settings }) }
  )
);
