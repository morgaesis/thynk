import { create } from 'zustand';
import type { Note, NoteMetadata } from '../types';
import * as api from '../api';

interface NoteStore {
  notes: NoteMetadata[];
  activeNote: Note | null;
  loading: boolean;
  saving: boolean;
  error: string | null;

  fetchNotes: () => Promise<void>;
  openNote: (id: string) => Promise<void>;
  createNote: (title: string, path?: string) => Promise<void>;
  updateNote: (
    id: string,
    data: { title?: string; content?: string },
  ) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useNoteStore = create<NoteStore>((set, get) => ({
  notes: [],
  activeNote: null,
  loading: false,
  saving: false,
  error: null,

  fetchNotes: async () => {
    set({ loading: true, error: null });
    try {
      const notes = await api.listNotes();
      set({ notes, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  openNote: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const note = await api.getNote(id);
      set({ activeNote: note, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createNote: async (title: string, path?: string) => {
    set({ loading: true, error: null });
    try {
      const note = await api.createNote({ title, path });
      set({ activeNote: note, loading: false });
      await get().fetchNotes();
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  updateNote: async (
    id: string,
    data: { title?: string; content?: string },
  ) => {
    set({ saving: true, error: null });
    try {
      const note = await api.updateNote(id, data);
      set({ activeNote: note, saving: false });
      // Refresh the list to reflect title changes
      if (data.title) {
        await get().fetchNotes();
      }
    } catch (e) {
      set({ error: (e as Error).message, saving: false });
    }
  },

  deleteNote: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await api.deleteNote(id);
      const { activeNote } = get();
      if (activeNote?.id === id) {
        set({ activeNote: null });
      }
      set({ loading: false });
      await get().fetchNotes();
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
