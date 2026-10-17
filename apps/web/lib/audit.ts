/** "company.status.changed" -> "Company status changed". Unknown actions still read fine. */
export function actionLabel(action: string): string {
  const text = action.replace(/[._-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Unknown action';
}

/** One line for the audit list: "status: approved · note: unreadable". */
export function metaText(meta: Record<string, unknown> | null): string {
  if (!meta) return '';
  return Object.entries(meta)
    .map(([key, value]) => `${key}: ${typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}`)
    .join(' · ');
}