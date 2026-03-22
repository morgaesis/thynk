/**
 * Format an ISO timestamp as a human-readable relative time string.
 * Examples: "just now", "2m ago", "3h ago", "5d ago"
 *
 * @param iso - ISO 8601 timestamp string
 * @param maxDays - If age exceeds this many days, return locale date string instead. Defaults to Infinity (always relative).
 */
export function relativeTime(iso: string, maxDays = Infinity): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days <= maxDays) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
