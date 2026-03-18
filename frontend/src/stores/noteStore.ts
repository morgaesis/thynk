import { create } from 'zustand';
import type { Note, NoteMetadata } from '../types';
import * as api from '../api';
import { useUIStore } from './uiStore';

interface NoteStore {
  notes: NoteMetadata[];
  activeNote: Note | null;
  loading: boolean;
  saving: boolean;
  error: string | null;

  fetchNotes: () => Promise<void>;
  openNote: (id: string) => Promise<void>;
  openNoteByPath: (path: string) => Promise<void>;
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
      const msg = (e as Error).message;
      set({ error: msg, loading: false });
      useUIStore.getState().addToast('error', `Failed to load notes: ${msg}`);
    }
  },

  openNote: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const note = await api.getNote(id);
      window.history.pushState(
        {},
        '',
        `/notes/${encodeURIComponent(note.path)}`,
      );
      set({ activeNote: note, loading: false });
      useUIStore.getState().addRecentNote(id);
    } catch (e) {
      const msg = (e as Error).message;
      set({ error: msg, loading: false });
      useUIStore.getState().addToast('error', `Failed to open note: ${msg}`);
    }
  },

  openNoteByPath: async (path: string) => {
    const { notes, openNote } = get();
    const note = notes.find((n) => n.path === path);
    if (note) {
      await openNote(note.id);
      return;
    }
    try {
      const response = await api.getNoteByPath(path);
      await openNote(response.id);
    } catch (e) {
      const msg = (e as Error).message;
      set({ error: msg, loading: false });
      useUIStore.getState().addToast('error', `Failed to open note: ${msg}`);
    }
  },

  createNote: async (title: string, path?: string) => {
    set({ loading: true, error: null });
    try {
      const note = await api.createNote({ title, path });
      set({ activeNote: note, loading: false });
      await get().fetchNotes();
    } catch (e) {
      const msg = (e as Error).message;
      set({ error: msg, loading: false });
      useUIStore.getState().addToast('error', `Failed to create note: ${msg}`);
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
      if (data.title) {
        await get().fetchNotes();
      }
    } catch (e) {
      const msg = (e as Error).message;
      set({ error: msg, saving: false });
      useUIStore.getState().addToast('error', `Failed to save note: ${msg}`);
    }
  },

  deleteNote: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await api.deleteNote(id);
      const { activeNote } = get();
      if (activeNote?.id === id) {
        set({ activeNote: null });
        window.history.pushState({}, '', '/');
      }
      set({ loading: false });
      await get().fetchNotes();
    } catch (e) {
      const msg = (e as Error).message;
      set({ error: msg, loading: false });
      useUIStore.getState().addToast('error', `Failed to delete note: ${msg}`);
    }
  },

  clearError: () => set({ error: null }),
}));
