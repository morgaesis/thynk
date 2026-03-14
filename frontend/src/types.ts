export interface Note {
  id: string;
  path: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface NoteMetadata {
  id: string;
  path: string;
  title: string;
  created_at: string;
  updated_at: string;
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
  path: string;
  is_dir: boolean;
  children?: TreeNode[];
}
