export function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const lines = match[1].split('\n');
  const result: Record<string, string> = {};
  for (const line of lines) {
    const parts = line.split(/:\s+/, 2);
    if (parts.length === 2) {
      result[parts[0]] = parts[1];
    }
  }
  return result;
}

export function updateFrontmatter(
  content: string,
  props: Record<string, string>,
): string {
  const yaml = Object.entries(props)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
  return `---\n${yaml}\n---\n${body}`;
}
