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
      const meta: NoteMetadata = {
        id: note.id,
        path: note.path,
        title: note.title,
        content_hash: note.content_hash,
        created_at: note.created_at,
        updated_at: note.updated_at,
      };
      set((s) => ({
        activeNote: note,
        loading: false,
        notes: [meta, ...s.notes],
      }));
      useUIStore.getState().addRecentNote(note.id);
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
      const updates: Partial<NoteStore> = { activeNote: note, saving: false };
      if (data.title) {
        updates.notes = get().notes.map((n) =>
          n.id === id
            ? { ...n, title: note.title, updated_at: note.updated_at }
            : n,
        );
      }
      set(updates);
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
      const updates: Partial<NoteStore> = {
        loading: false,
        notes: get().notes.filter((n) => n.id !== id),
      };
      if (activeNote?.id === id) {
        updates.activeNote = null;
        window.history.pushState({}, '', '/');
      }
      set(updates);
    } catch (e) {
      const msg = (e as Error).message;
      set({ error: msg, loading: false });
      useUIStore.getState().addToast('error', `Failed to delete note: ${msg}`);
    }
  },

  clearError: () => set({ error: null }),
}));
