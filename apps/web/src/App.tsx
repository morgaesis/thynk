import {
  BookOpenText,
  FilePlus2,
  LockKeyhole,
  RefreshCw,
  Save,
  Search,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type NoteSummary = {
  slug: string;
  title: string;
  path: string;
  tags: string[];
  updated_at: string;
  links: string[];
  backlinks: string[];
};

type NoteDetail = NoteSummary & {
  content: string;
  frontmatter: Record<string, unknown>;
};

type SearchResult = {
  slug: string;
  title: string;
  excerpt: string;
  tags: string[];
};

const tokenKey = 'thynk-access-token';

function request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  return fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...init.headers,
    },
  }).then(async (response) => {
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || response.statusText);
    }
    return response.json() as Promise<T>;
  });
}

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem(tokenKey) ?? '');
  const [draftToken, setDraftToken] = useState(token);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [detail, setDetail] = useState<NoteDetail | null>(null);
  const [content, setContent] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadNotes = useCallback(async () => {
    if (!token) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      const noteData = await request<NoteSummary[]>('/api/notes', token);
      setNotes(noteData);
      if (!selectedSlug && noteData[0]) {
        setSelectedSlug(noteData[0].slug);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load notes');
    } finally {
      setLoading(false);
    }
  }, [selectedSlug, token]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    if (!selectedSlug || !token) {
      return;
    }
    request<NoteDetail>(`/api/notes/${selectedSlug}`, token)
      .then((note) => {
        setDetail(note);
        setContent(note.content);
        setMessage('');
      })
      .catch((openError) => setError(openError instanceof Error ? openError.message : 'Unable to open note'));
  }, [selectedSlug, token]);

  function submitToken(event: FormEvent) {
    event.preventDefault();
    const cleanToken = draftToken.trim();
    localStorage.setItem(tokenKey, cleanToken);
    setToken(cleanToken);
  }

  function logout() {
    localStorage.removeItem(tokenKey);
    setToken('');
    setDraftToken('');
    setNotes([]);
    setDetail(null);
  }

  async function save() {
    if (!detail) {
      return;
    }
    const saved = await request<NoteDetail>(`/api/notes/${detail.slug}`, token, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
    setDetail(saved);
    setMessage('Saved');
    await loadNotes();
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!newTitle.trim()) {
      return;
    }
    const created = await request<NoteDetail>('/api/notes', token, {
      method: 'POST',
      body: JSON.stringify({ title: newTitle, tags: ['inbox'] }),
    });
    setNewTitle('');
    setSelectedSlug(created.slug);
    setDetail(created);
    setContent(created.content);
    await loadNotes();
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    const found = await request<SearchResult[]>(`/api/search?q=${encodeURIComponent(query)}`, token);
    setResults(found);
  }

  const noteMap = useMemo(() => new Map(notes.map((note) => [note.slug, note.title])), [notes]);

  if (!token) {
    return <LoginScreen draftToken={draftToken} onDraftToken={setDraftToken} onSubmit={submitToken} />;
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand" title="Thynk">
          <BookOpenText size={24} />
          <div>
            <span>Thynk</span>
            <strong>Workspace</strong>
          </div>
        </div>

        <form className="compact-form" onSubmit={create}>
          <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="New note title" />
          <button title="Create note" type="submit">
            <FilePlus2 size={16} />
          </button>
        </form>

        <form className="compact-form" onSubmit={search}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes" />
          <button title="Search notes" type="submit">
            <Search size={16} />
          </button>
        </form>

        <div className="note-buttons">
          {notes.map((note) => (
            <button
              className={selectedSlug === note.slug ? 'selected' : ''}
              key={note.slug}
              onClick={() => setSelectedSlug(note.slug)}
              type="button"
            >
              <span>{note.title}</span>
              <small>{note.tags.join(', ') || 'untagged'}</small>
            </button>
          ))}
        </div>

        {results.length ? (
          <div className="search-results">
            <h2>Search results</h2>
            {results.map((result) => (
              <button key={result.slug} onClick={() => setSelectedSlug(result.slug)} type="button">
                <strong>{result.title}</strong>
                <span>{result.excerpt}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="sidebar-actions">
          <button onClick={() => void loadNotes()} title="Refresh notes" type="button">
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
          <button onClick={logout} title="Clear local access token" type="button">
            <LockKeyhole size={16} />
            <span>Lock</span>
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Markdown workspace</p>
            <h1>{detail?.title ?? 'Notes'}</h1>
          </div>
          {detail ? (
            <button onClick={() => void save()} title="Save note" type="button">
              <Save size={16} />
              Save
            </button>
          ) : null}
        </header>

        {error ? <div className="notice">{error}</div> : null}
        {loading && !notes.length ? <div className="notice">Loading notes...</div> : null}

        {detail ? (
          <section className="editor-pane">
            <p className="path-label">{detail.path}</p>
            <textarea value={content} onChange={(event) => setContent(event.target.value)} spellCheck="true" />
            <div className="metadata-strip">
              <LinkGroup title="Links" items={detail.links.map((link) => noteMap.get(slugify(link)) ?? link)} />
              <LinkGroup title="Backlinks" items={detail.backlinks.map((slug) => noteMap.get(slug) ?? slug)} />
            </div>
            {message ? <p className="save-message">{message}</p> : null}
          </section>
        ) : (
          <div className="empty-state">Select or create a Markdown note.</div>
        )}
      </section>
    </main>
  );
}

function LoginScreen({
  draftToken,
  onDraftToken,
  onSubmit,
}: {
  draftToken: string;
  onDraftToken: (token: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <main className="login">
      <section className="login-panel">
        <div className="login-mark">
          <BookOpenText size={28} />
        </div>
        <p className="eyebrow">Thynk</p>
        <h1>Workspace</h1>
        <form onSubmit={onSubmit}>
          <label htmlFor="token">Access token</label>
          <input
            id="token"
            autoComplete="current-password"
            value={draftToken}
            onChange={(event) => onDraftToken(event.target.value)}
            placeholder="local-dev-token"
            type="password"
          />
          <button type="submit">
            <LockKeyhole size={18} />
            Unlock
          </button>
        </form>
      </section>
    </main>
  );
}

function LinkGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h2>{title}</h2>
      <div className="chips">
        {items.length ? items.map((item) => <span key={item}>{item}</span>) : <small>None</small>}
      </div>
    </div>
  );
}

function slugify(input: string) {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9 _/-]/g, '')
    .replace(/[ _/]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'note';
}
