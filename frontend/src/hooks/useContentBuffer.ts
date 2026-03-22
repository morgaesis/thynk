const STORAGE_PREFIX = 'thynk_buffer_';

export interface ContentBufferAPI {
  saveBuffer: (noteId: string, content: string) => void;
  getBuffer: (noteId: string) => string | null;
  clearBuffer: (noteId: string) => void;
  hasUnsavedChanges: (noteId: string, serverContent: string) => boolean;
}

export const contentBuffer: ContentBufferAPI = {
  saveBuffer: (noteId: string, content: string) => {
    const bufferKey = `${STORAGE_PREFIX}${noteId}`;
    try {
      sessionStorage.setItem(bufferKey, content);
    } catch (e) {
      console.warn('Failed to save content buffer:', e);
    }
  },

  getBuffer: (noteId: string): string | null => {
    const bufferKey = `${STORAGE_PREFIX}${noteId}`;
    try {
      return sessionStorage.getItem(bufferKey);
    } catch (e) {
      console.warn('Failed to get content buffer:', e);
      return null;
    }
  },

  clearBuffer: (noteId: string) => {
    const bufferKey = `${STORAGE_PREFIX}${noteId}`;
    try {
      sessionStorage.removeItem(bufferKey);
    } catch (e) {
      console.warn('Failed to clear content buffer:', e);
    }
  },

  hasUnsavedChanges: (noteId: string, serverContent: string): boolean => {
    const buffer = contentBuffer.getBuffer(noteId);
    if (!buffer) return false;
    return buffer !== serverContent;
  },
};
