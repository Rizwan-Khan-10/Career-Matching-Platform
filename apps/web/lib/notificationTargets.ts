import type { AppNotification } from '@/types/notification';

type Role = 'ADMIN' | 'COMPANY' | 'APPLICANT' | null;

const text = (value: unknown) => (typeof value === 'string' && value ? value : null);

export function notificationsPath(role: Role): string {
  if (role === 'COMPANY') return '/company/notifications';
  if (role === 'ADMIN') return '/admin/notifications';
  return '/applicant/notifications';
}

function dashboardPath(role: Role): string {
  if (role === 'COMPANY') return '/company/dashboard';
  if (role === 'ADMIN') return '/admin/dashboard';
  return '/applicant/dashboard';
}

/** Where a click on a notification goes (types from contract section 7). */
export function notificationHref(n: AppNotification, role: Role): string {
  const data = n.data ?? {};
  const matchId = text(data.matchId);
  // the matches page scrolls to and highlights this card
  const match = matchId ? `/applicant/matches#match-${encodeURIComponent(matchId)}` : '/applicant/matches';

  switch (n.type) {
    // applicant
    case 'resume_ready':
      return '/applicant/resume';
    case 'match_eligible':
    case 'shortlisted':
    case 'prep_ready':
    case 'rejected':
    case 'rejection_feedback_ready':
      return match;
    case 'feedback_ready':
      return '/applicant/feedback';
    // company
    case 'roles_ready':
    case 'job_approval':
      return '/company/jobs';
    case 'candidate_ready': {
      const roleId = text(data.jobRoleId);
      return roleId ? `/company/roles/${encodeURIComponent(roleId)}/applicants` : '/company/dashboard';
    }
    case 'company_status':
      return '/company/dashboard';
    default:
      return dashboardPath(role);
  }
}