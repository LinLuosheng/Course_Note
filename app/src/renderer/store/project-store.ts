import { create } from 'zustand';
import { Project } from '@shared/types';

interface ProjectState {
  currentProject: Project | null;
  notesContent: string;
  setCurrentProject: (project: Project | null) => void;
  updateProject: (partial: Partial<Project>) => void;
  setNotesContent: (content: string) => void;
}

export const useProjectStore = create<ProjectState>()((set) => ({
  currentProject: null,
  notesContent: '',
  setCurrentProject: (project) => set({ currentProject: project }),
  updateProject: (partial) =>
    set((state) => ({
      currentProject: state.currentProject
        ? { ...state.currentProject, ...partial }
        : null,
    })),
  setNotesContent: (content) => set({ notesContent: content }),
}));
