import { describe, it, expect } from 'vitest';

function detectMentions(text: string): string[] {
  const regex = /@([a-zA-Z0-9_.[-]]*)$/g;
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

describe('Mention Detection', () => {
  it('detects @username pattern at end of text', () => {
    const text = 'Hello @john';
    const result = detectMentions(text);
    expect(result).toContain('john');
  });

  it('detects @username with numbers', () => {
    const text = 'Hi @user123';
    const result = detectMentions(text);
    expect(result).toContain('user123');
  });

  it('detects @username with underscore and hyphen', () => {
    const text = 'Hey @john_doe-smith';
    const result = detectMentions(text);
    expect(result).toContain('john_doe-smith');
  });

  it('returns empty array when no @ pattern at end', () => {
    const text = 'Hello world @someone here';
    const result = detectMentions(text);
    expect(result).toEqual([]);
  });

  it('returns empty array for empty @', () => {
    const text = 'Hello @';
    const result = detectMentions(text);
    expect(result).toContain('');
  });

  it('returns empty string for partial mention', () => {
    const text = 'Hi @';
    const result = detectMentions(text);
    expect(result).toContain('');
  });
});
