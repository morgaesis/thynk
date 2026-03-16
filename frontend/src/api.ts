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

// ── Wiki-links & Graph ────────────────────────────────────────────────────────

export async function getBacklinks(noteId: string): Promise<NoteMetadata[]> {
  return request(`/notes/${noteId}/backlinks`);
}

export async function getOutgoingLinks(
  noteId: string,
): Promise<NoteMetadata[]> {
  return request(`/notes/${noteId}/links`);
}

export interface GraphNode {
  id: string;
  title: string;
  path: string;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function getGraph(): Promise<GraphData> {
  return request('/graph');
}

// ── Export / Import ───────────────────────────────────────────────────────────

export async function exportWorkspace(): Promise<void> {
  const res = await fetch('/api/export', { credentials: 'same-origin' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Export failed: ${res.status}: ${body}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'thynk-export.zip';
  a.click();
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  imported: number;
  attachments: number;
  errors: string[];
}

export async function importMarkdown(file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/import/markdown', {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Import failed: ${res.status}: ${body}`);
  }
  return res.json();
}

export async function importObsidian(file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/import/obsidian', {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Import failed: ${res.status}: ${body}`);
  }
  return res.json();
}

export async function listNotesByPrefix(
  prefix: string,
): Promise<NoteMetadata[]> {
  const qs = prefix ? `?prefix=${encodeURIComponent(prefix)}` : '';
  return request(`/notes${qs}`);
}

// ── AI ────────────────────────────────────────────────────────────────────────

export interface AiCompleteRequest {
  provider: string;
  api_key: string;
  model: string;
  prompt: string;
  max_tokens?: number;
  temperature?: number;
}

export interface AiCompleteResponse {
  text: string;
}

export interface AiChatMessage {
  role: string;
  content: string;
}

export interface AiChatRequest {
  provider: string;
  api_key: string;
  model: string;
  messages: AiChatMessage[];
  max_tokens?: number;
  temperature?: number;
}

export interface AiChatResponse {
  message: AiChatMessage;
}

export async function aiComplete(req: AiCompleteRequest): Promise<AiCompleteResponse> {
  return request('/ai/complete', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function aiChat(req: AiChatRequest): Promise<AiChatResponse> {
  return request('/ai/chat', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

// ── Unlinked Mentions ───────────────────────────────────────────────────────────

export interface UnlinkedMention {
  title: string;
  path: string;
  id: string;
  context: string;
}

export async function getUnlinkedMentions(noteId: string): Promise<UnlinkedMention[]> {
  return request(`/notes/${noteId}/unlinked-mentions`);
}

// ── Notifications ───────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  userId: string;
  noteId: string;
  notePath: string;
  noteTitle: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
}

export interface UnreadCountResponse {
  count: number;
}

export async function getNotifications(): Promise<Notification[]> {
  const response = await request<NotificationsResponse>('/notifications');
  return response.notifications;
}

export async function getUnreadCount(): Promise<number> {
  const response = await request<UnreadCountResponse>('/notifications/unread-count');
  return response.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await request(`/notifications/${id}/read`, { method: 'PATCH' });
}

// ── Workspace Invitations ───────────────────────────────────────────────────────

export interface Invitation {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
}

export interface AcceptInvitationRequest {
  token: string;
  username: string;
  password: string;
  display_name?: string;
}

export interface AcceptInvitationResponse {
  id: string;
  username: string;
  role: string;
}

export async function listInvitations(): Promise<Invitation[]> {
  return request('/invitations');
}

export async function createInvitation(data: {
  email: string;
  role?: string;
}): Promise<Invitation> {
  return request('/invitations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function revokeInvitation(id: string): Promise<void> {
  await request(`/invitations/${id}`, { method: 'DELETE' });
}

export async function acceptInvitation(
  data: AcceptInvitationRequest,
): Promise<AcceptInvitationResponse> {
  return request('/invitations/accept', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
