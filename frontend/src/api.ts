import type { Note, NoteMetadata, SearchResult, TreeNode } from './types';

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
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
  const res = await fetch(`${API_BASE}/notes/${id}`, { method: 'DELETE' });
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
