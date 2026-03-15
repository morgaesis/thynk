export interface Note {
  id: string;
  path: string;
  title: string;
  content: string;
  content_hash: string;
  created_at: string;
  updated_at: string;
  last_updated_by?: string;
}

export interface NoteMetadata {
  id: string;
  path: string;
  title: string;
  content_hash: string;
  created_at: string;
  updated_at: string;
  last_updated_by?: string;
}

export interface SearchResult {
  note_id: string;
  title: string;
  path: string;
  snippet: string;
  rank: number;
}

export interface TreeNode {
  name: string;
  children?: TreeNode[];
}
