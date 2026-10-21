/** Plain-language names of the event streams on the system health page. The raw name stays available as a tooltip. */
const STREAM_LABELS: Record<string, string> = {
  'resume.uploaded': 'Resumes uploaded',
  'resume.parsed': 'Resumes read',
  'resume.confirmed': 'Resumes confirmed',
  'resume.updated': 'Resumes updated',
  'resume.superseded': 'Resumes replaced',
  'resume.deleted': 'Resumes deleted',
  'jd.uploaded': 'Job documents uploaded',
  'jd.extracted': 'Job requirements read',
  'job.approval.changed': 'Job approvals changed',
  'job.role.deleted': 'Roles deleted',
  'job.stopped': 'Jobs stopped',
  'match.computed': 'Matches calculated',
  'candidate.ready': 'Candidate resumes ready',
  'candidate.shortlisted': 'Candidates shortlisted',
  'candidate.rejected': 'Candidates rejected',
  'prep.ready': 'Interview guides ready',
  'feedback.ready': 'Feedback ready',
  'notification.created': 'Notifications created',
};

/** "match.computed" -> "Matches calculated". A dead-letter list ("x.dead") is named after its stream. Unknown streams get a readable fallback. */
export function streamLabel(name: string): string {
  const dead = name.endsWith('.dead');
  const base = dead ? name.slice(0, -5) : name;
  const known = STREAM_LABELS[base];
  if (known) return dead ? `${known} (failed)` : known;
  const text = name.replace(/[._-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : name;
}
