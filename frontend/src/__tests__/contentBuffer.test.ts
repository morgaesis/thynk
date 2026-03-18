import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { contentBuffer } from '../hooks/useContentBuffer';

const STORAGE_PREFIX = 'thynk_buffer_';

describe('contentBuffer', () => {
  const noteId = 'test-note-1';
  const bufferKey = `${STORAGE_PREFIX}${noteId}`;

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  describe('buffering content', () => {
    it('saves content to sessionStorage immediately', () => {
      const content = '<p>Test content</p>';
      
      contentBuffer.saveBuffer(noteId, content);
      
      expect(sessionStorage.getItem(bufferKey)).toBe(content);
    });

    it('overwrites existing buffer content', () => {
      contentBuffer.saveBuffer(noteId, '<p>First</p>');
      contentBuffer.saveBuffer(noteId, '<p>Second</p>');
      
      expect(sessionStorage.getItem(bufferKey)).toBe('<p>Second</p>');
    });
  });

  describe('retrieving buffer', () => {
    it('returns buffered content if exists', () => {
      sessionStorage.setItem(bufferKey, '<p>Buffered</p>');
      
      const result = contentBuffer.getBuffer(noteId);
      
      expect(result).toBe('<p>Buffered</p>');
    });

    it('returns null if no buffer exists', () => {
      const result = contentBuffer.getBuffer(noteId);
      
      expect(result).toBeNull();
    });
  });

  describe('clearing buffer', () => {
    it('removes buffer from sessionStorage', () => {
      sessionStorage.setItem(bufferKey, '<p>Content</p>');
      
      contentBuffer.clearBuffer(noteId);
      
      expect(sessionStorage.getItem(bufferKey)).toBeNull();
    });

    it('only clears the specific note buffer', () => {
      sessionStorage.setItem(bufferKey, '<p>Note 1</p>');
      sessionStorage.setItem(`${STORAGE_PREFIX}test-note-2`, '<p>Note 2</p>');
      
      contentBuffer.clearBuffer(noteId);
      
      expect(sessionStorage.getItem(bufferKey)).toBeNull();
      expect(sessionStorage.getItem(`${STORAGE_PREFIX}test-note-2`)).toBe('<p>Note 2</p>');
    });
  });

  describe('buffer restoration', () => {
    it('detects unsaved changes when buffer differs from server content', () => {
      sessionStorage.setItem(bufferKey, '<p>Unsaved changes</p>');
      
      const result = contentBuffer.hasUnsavedChanges(noteId, '<p>Server content</p>');
      
      expect(result).toBe(true);
    });

    it('detects no unsaved changes when buffer matches server content', () => {
      const content = '<p>Same content</p>';
      sessionStorage.setItem(bufferKey, content);
      
      const result = contentBuffer.hasUnsavedChanges(noteId, content);
      
      expect(result).toBe(false);
    });

    it('detects no unsaved changes when no buffer exists', () => {
      const result = contentBuffer.hasUnsavedChanges(noteId, '<p>Server content</p>');
      
      expect(result).toBe(false);
    });
  });
});
