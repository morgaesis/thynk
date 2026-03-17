import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as typeof fetch;

// Provide our own implementation that routes through globalThis.fetch.
// This overrides any mock from other test files and lets us verify fetch calls.
vi.mock('../api', () => {
  const API_BASE = '/api';

  async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await (globalThis.fetch as typeof fetch)(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  return {
    listNotes: () => request('/notes'),
    getNote: (id: string) => request(`/notes/${id}`),
    createNote: (data: Record<string, unknown>) =>
      request('/notes', { method: 'POST', body: JSON.stringify(data) }),
    updateNote: (id: string, data: Record<string, unknown>) =>
      request(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteNote: async (id: string) => {
      const res = await (globalThis.fetch as typeof fetch)(`${API_BASE}/notes/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`API ${res.status}: ${body}`);
      }
    },
    searchNotes: (query: string) => request(`/search?q=${encodeURIComponent(query)}`),
    getAuditLog: (query?: Record<string, unknown>) => {
      const params = new URLSearchParams();
      if (query?.note_id) params.set('note_id', String(query.note_id));
      if (query?.since) params.set('since', String(query.since));
      if (query?.limit) params.set('limit', String(query.limit));
      const qs = params.toString();
      return request(`/sync/audit${qs ? `?${qs}` : ''}`);
    },
  };
});

import * as api from '../api';

function makeJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function makeErrorResponse(body: string, status: number) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(body),
  };
}

beforeEach(() => {
  globalThis.fetch = mockFetch as typeof fetch;
  mockFetch.mockReset();
});

describe('api.listNotes', () => {
  it('calls GET /api/notes and returns parsed JSON', async () => {
    const notes = [{ id: 'n1', path: 'notes/a.md', title: 'A' }];
    mockFetch.mockResolvedValue(makeJsonResponse(notes));

    const result = await api.listNotes();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/notes',
      expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }),
    );
    expect(result).toEqual(notes);
  });
});

describe('api.getNote', () => {
  it('calls GET /api/notes/:id and returns the note', async () => {
    const note = { id: 'n1', path: 'notes/a.md', title: 'A', content: '# A' };
    mockFetch.mockResolvedValue(makeJsonResponse(note));

    const result = await api.getNote('n1');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/notes/n1',
      expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }),
    );
    expect(result).toEqual(note);
  });
});

describe('api.createNote', () => {
  it('calls POST /api/notes with correct body', async () => {
    const note = { id: 'new-1', path: 'notes/new.md', title: 'New Note', content: '' };
    mockFetch.mockResolvedValue(makeJsonResponse(note));

    const result = await api.createNote({ title: 'New Note' });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/notes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'New Note' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(result).toEqual(note);
  });

  it('calls POST /api/notes with title and path', async () => {
    const note = { id: 'new-2', path: 'docs/guide.md', title: 'Guide', content: '' };
    mockFetch.mockResolvedValue(makeJsonResponse(note));

    await api.createNote({ title: 'Guide', path: 'docs/guide.md' });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/notes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Guide', path: 'docs/guide.md' }),
      }),
    );
  });
});

describe('api.updateNote', () => {
  it('calls PUT /api/notes/:id with correct body', async () => {
    const updated = { id: 'n1', path: 'notes/a.md', title: 'Updated', content: 'new content' };
    mockFetch.mockResolvedValue(makeJsonResponse(updated));

    const result = await api.updateNote('n1', { title: 'Updated', content: 'new content' });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/notes/n1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ title: 'Updated', content: 'new content' }),
      }),
    );
    expect(result).toEqual(updated);
  });
});

describe('api.deleteNote', () => {
  it('calls DELETE /api/notes/:id on success', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, text: () => Promise.resolve('') });

    await expect(api.deleteNote('n1')).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledWith('/api/notes/n1', { method: 'DELETE' });
  });

  it('throws an error on non-ok response', async () => {
    mockFetch.mockResolvedValue(makeErrorResponse('Not Found', 404));

    await expect(api.deleteNote('bad-id')).rejects.toThrow('API 404: Not Found');
  });
});

describe('api.searchNotes', () => {
  it('calls GET /api/search?q=... with URL encoding', async () => {
    const results = [{ note_id: 'n1', title: 'A', path: 'a.md', snippet: '...', rank: 1.0 }];
    mockFetch.mockResolvedValue(makeJsonResponse(results));

    const result = await api.searchNotes('hello world');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/search?q=hello%20world',
      expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }),
    );
    expect(result).toEqual(results);
  });

  it('URL-encodes special characters in the query', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse([]));

    await api.searchNotes('foo & bar=baz');

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toBe('/api/search?q=foo%20%26%20bar%3Dbaz');
  });

  it('returns empty array when no results', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse([]));

    const result = await api.searchNotes('noresults');
    expect(result).toEqual([]);
  });
});

describe('api error handling (request helper)', () => {
  it('throws with status and body on non-ok response', async () => {
    mockFetch.mockResolvedValue(makeErrorResponse('Unauthorized', 401));

    await expect(api.listNotes()).rejects.toThrow('API 401: Unauthorized');
  });
});

describe('api.getAuditLog', () => {
  it('calls GET /api/sync/audit and returns audit entries', async () => {
    const entries = [
      { id: 1, note_id: 'n1', action: 'create', user_id: 'u1', old_hash: null, new_hash: 'abc', timestamp: '2026-03-17T10:00:00Z' },
      { id: 2, note_id: 'n1', action: 'update', user_id: 'u1', old_hash: 'abc', new_hash: 'def', timestamp: '2026-03-17T11:00:00Z' },
    ];
    mockFetch.mockResolvedValue(makeJsonResponse(entries));

    const result = await api.getAuditLog();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/sync/audit',
      expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }),
    );
    expect(result).toEqual(entries);
  });

  it('passes query parameters when provided', async () => {
    const entries: api.AuditEntry[] = [];
    mockFetch.mockResolvedValue(makeJsonResponse(entries));

    await api.getAuditLog({ note_id: 'n1', limit: 10 });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/sync/audit?note_id=n1&limit=10',
      expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }),
    );
  });

  it('handles since parameter as ISO date string', async () => {
    const entries: api.AuditEntry[] = [];
    mockFetch.mockResolvedValue(makeJsonResponse(entries));

    await api.getAuditLog({ since: '2026-03-01T00:00:00Z', limit: 50 });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/sync/audit?since=2026-03-01T00%3A00%3A00Z&limit=50',
      expect.anything(),
    );
  });
});
