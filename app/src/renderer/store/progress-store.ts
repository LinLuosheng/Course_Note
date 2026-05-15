import { create } from 'zustand';
import { PlaybackState, StudySession, StudyStats } from '@shared/types';

const DEFAULT_PLAYBACK: PlaybackState = {
  timeOffset: 0,
  duration: 0,
  timeWatched: 0,
  timesWatched: 0,
  lastWatchedAt: 0,
  playbackSpeed: 1,
  completed: false,
};

interface ProgressState {
  playback: PlaybackState | null;
  sessionStartTime: number | null;
  currentProjectId: string | null;
  sessions: StudySession[];
  stats: StudyStats;

  loadPlayback: (projectDir: string) => Promise<void>;
  updatePlayback: (partial: Partial<PlaybackState>) => void;
  savePlayback: (projectDir: string) => Promise<void>;
  resetPlayback: () => void;

  startSession: (projectId: string) => void;
  endSession: () => Promise<StudyStats | null>;
  loadSessions: () => Promise<void>;
}

export const useProgressStore = create<ProgressState>()((set, get) => ({
  playback: null,
  sessionStartTime: null,
  currentProjectId: null,
  sessions: [],
  stats: { totalStudySeconds: 0, totalSessions: 0, streakDays: 0, lastStudyDate: null },

  loadPlayback: async (projectDir: string) => {
    const saved = await window.electronAPI?.loadPlaybackState(projectDir);
    if (saved) {
      saved.timesWatched = (saved.timesWatched || 0) + 1;
      saved.lastWatchedAt = Date.now();
      set({ playback: saved });
    } else {
      set({
        playback: {
          ...DEFAULT_PLAYBACK,
          timesWatched: 1,
          lastWatchedAt: Date.now(),
        },
      });
    }
  },

  updatePlayback: (partial) => {
    set((state) => ({
      playback: state.playback ? { ...state.playback, ...partial } : null,
    }));
  },

  savePlayback: async (projectDir: string) => {
    const { playback } = get();
    if (!playback) return;
    await window.electronAPI?.savePlaybackState(projectDir, playback);
  },

  resetPlayback: () => {
    set({ playback: null, sessionStartTime: null, currentProjectId: null });
  },

  startSession: (projectId: string) => {
    // End any existing session first
    const { sessionStartTime, currentProjectId } = get();
    if (sessionStartTime && currentProjectId) {
      get().endSession();
    }
    set({ sessionStartTime: Date.now(), currentProjectId: projectId });
  },

  endSession: async () => {
    const { sessionStartTime, currentProjectId } = get();
    if (!sessionStartTime || !currentProjectId) return null;

    const endedAt = Date.now();
    const durationSeconds = Math.round((endedAt - sessionStartTime) / 1000);

    if (durationSeconds < 1) {
      set({ sessionStartTime: null });
      return null;
    }

    const session: StudySession = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      projectId: currentProjectId,
      startedAt: sessionStartTime,
      endedAt,
      durationSeconds,
    };

    const stats = await window.electronAPI?.saveStudySession(session) ?? get().stats;
    set({ sessionStartTime: null, stats });
    return stats;
  },

  loadSessions: async () => {
    const data = await window.electronAPI?.loadStudySessions();
    if (data) {
      set({ sessions: data.sessions, stats: data.stats });
    }
  },
}));
