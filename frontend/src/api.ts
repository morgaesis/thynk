import type {
  Note,
  NoteMetadata,
  SearchResult,
  TagEntry,
  TreeNode,
} from './types';

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  if (res.status === 401) {
    // Session expired or invalid — clear auth state and reload to show login
    const { useAuthStore } = await import('./stores/authStore');
    useAuthStore.setState({ user: null, loading: false });
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

export async function listNotes(): Promise<NoteMetadata[]> {
  return request('/notes');
}

export async function getNote(id: string): Promise<Note> {
  return request(`/notes/${id}`);
}

export async function createNote(data: {
  title: string;
  path?: string;
  content?: string;
}): Promise<Note> {
  return request('/notes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateNote(
  id: string,
  data: { title?: string; content?: string },
): Promise<Note> {
  return request(`/notes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteNote(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/notes/${id}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  if (res.status === 401) {
    const { useAuthStore } = await import('./stores/authStore');
    useAuthStore.setState({ user: null, loading: false });
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
}

export async function searchNotes(query: string): Promise<SearchResult[]> {
  return request(`/search?q=${encodeURIComponent(query)}`);
}

export async function getTree(): Promise<TreeNode[]> {
  return request('/tree');
}

// ── Tags ─────────────────────────────────────────────────────────────────────

export async function listTags(): Promise<TagEntry[]> {
  return request('/tags');
}

export async function getNotesByTag(tag: string): Promise<NoteMetadata[]> {
  return request(`/tags/${encodeURIComponent(tag)}/notes`);
}

// ── Favorites ─────────────────────────────────────────────────────────────────

export async function toggleFavorite(
  id: string,
): Promise<{ favorited: boolean }> {
  return request(`/notes/${id}/favorite`, { method: 'POST' });
}

export async function getFavorites(): Promise<NoteMetadata[]> {
  return request('/favorites');
}

// ── Templates ─────────────────────────────────────────────────────────────────

export async function listTemplates(): Promise<NoteMetadata[]> {
  return request('/templates');
}

export async function createFromTemplate(data: {
  template_id: string;
  title: string;
  path?: string;
}): Promise<Note> {
  return request('/notes/from-template', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── Lock API ──────────────────────────────────────────────────────────────────

export interface LockResponse {
  locked: boolean;
  user?: string;
  expires_at?: string;
}

export async function getLock(noteId: string): Promise<LockResponse> {
  return request(`/notes/${noteId}/lock`);
}

export async function acquireLock(noteId: string): Promise<LockResponse> {
  return request(`/notes/${noteId}/lock`, { method: 'POST' });
}

export async function releaseLock(noteId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/notes/${noteId}/lock`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  if (res.status === 401) {
    const { useAuthStore } = await import('./stores/authStore');
    useAuthStore.setState({ user: null, loading: false });
    throw new Error('Unauthorized');
  }
}

export async function heartbeatLock(noteId: string): Promise<LockResponse> {
  return request(`/notes/${noteId}/lock/heartbeat`, { method: 'POST' });
}
