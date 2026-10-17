// TEMPORARY mock of GET /matches/role/:id, PATCH /matches/:id/decision and POST /applicants/summaries
// (contract 5.6). Deleted with lib/mocks after merge.
// Open /company/roles/mock-role/applicants to use it. State lives in localStorage ('mock-candidates');
// reset: localStorage.removeItem('mock-candidates')
// To see a server error in the modal, shortlist with the round name "fail".
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { ApplicantSummary, Match, RejectReasonCategory, ShortlistInfo, ShortlistMode } from '@/types/match';
import { bodyOf, errorBody, respond } from './helpers';

const KEY = 'mock-candidates';
const ROLE_ID = 'mock-role';
const MODES: ShortlistMode[] = ['online', 'offline', 'phone'];
const CATEGORIES: RejectReasonCategory[] = ['skills_gap', 'experience', 'resume_quality', 'position_filled', 'other'];

const PEOPLE: Record<string, ApplicantSummary> = {
  'mock-a-c1': { userId: 'mock-a-c1', name: 'Aarav Sharma', headline: 'Final-year CS student', location: 'Pune', education: 'B.Tech CS', avatarUrl: null },
  'mock-a-c2': { userId: 'mock-a-c2', name: 'Diya Patil', headline: 'Full-stack developer', location: 'Mumbai', education: 'B.Tech IT', avatarUrl: null },
  'mock-a-c3': { userId: 'mock-a-c3', name: 'Rohan Iyer', headline: 'Backend developer', location: 'Bengaluru', education: 'B.Tech CS', avatarUrl: null },
  'mock-a-c4': { userId: 'mock-a-c4', name: 'Sneha Kulkarni', headline: 'Java developer', location: 'Pune', education: 'B.E. Computer', avatarUrl: null },
};

function make(id: string, over: Partial<Match>): Match {
  return {
    id,
    applicantId: `mock-a-${id.replace('mock-', '')}`,
    jobRoleId: ROLE_ID,
    roleTitle: 'Backend Developer',
    resumeId: 'mock-r1',
    applicantStatus: 'approved',
    resumeStatus: 'ready',
    score: 0.85,
    eligible: true,
    reason: 'Strong overlap with the required skills.',
    matchedSkills: ['Java', 'Spring Boot'],
    partialSkills: [],
    missingSkills: [],
    feedback: null,
    decision: null,
    shortlistInfo: null,
    rejectReason: null,
    rejectMessage: null,
    unverifiedRules: [],
    resumeTargetLabel: 'Backend · Java',
    createdAt: new Date().toISOString(),
    ...over,
  };
}

function seed(): Match[] {
  return [
    // no decision yet
    make('mock-c1', {}),
    // no decision, unverified academic rules, resume for another target
    make('mock-c2', {
      score: 0.78,
      missingSkills: ['Docker'],
      unverifiedRules: ['cgpa', 'backlogs'],
      resumeTargetLabel: 'Full-stack · JavaScript / TypeScript (Node, React…)',
    }),
    // already shortlisted
    make('mock-c3', {
      score: 0.9,
      decision: 'shortlisted',
      shortlistInfo: {
        roundName: 'Technical round 1',
        mode: 'online',
        scheduledAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        link: 'https://meet.example.com/abc-defg',
        bring: 'Laptop with IntelliJ installed.',
      },
    }),
    // already rejected (private reason + message shown to the candidate)
    make('mock-c4', {
      score: 0.61,
      decision: 'rejected',
      rejectReason: 'skills_gap',
      rejectMessage: 'We need someone with more Docker experience for this role.',
    }),
  ];
}

function save(list: Match[]) {
  if (typeof window !== 'undefined') window.localStorage.setItem(KEY, JSON.stringify(list));
}

function load(): Match[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as Match[];
    } catch {
      /* fall through to the seed */
    }
  }
  const initial = seed();
  save(initial);
  return initial;
}

export function handleCandidateMock(method: string, url: string, config: InternalAxiosRequestConfig): Promise<AxiosResponse> | null {
  if (method === 'get' && url === `/matches/role/${ROLE_ID}`) return respond(config, 200, load());

  // only answer when every id is a mock id; real ids go to the real backend
  if (method === 'post' && url === '/applicants/summaries') {
    const ids = bodyOf(config).ids;
    if (Array.isArray(ids) && ids.length > 0 && ids.every((id) => typeof id === 'string' && id in PEOPLE)) {
      return respond(config, 200, ids.map((id) => PEOPLE[id as string]));
    }
    return null;
  }

  const route = /^\/matches\/(mock-c\d+)\/decision$/.exec(url);
  if (method !== 'patch' || !route) return null;

  const list = load();
  const found = list.find((m) => m.id === route[1]);
  if (!found) return respond(config, 404, errorBody(404, 'Match not found', 'Not Found'));

  const body = bodyOf(config);
  const problems: string[] = [];

  if (body.decision === 'shortlisted') {
    const s = (body.shortlist ?? {}) as Record<string, unknown>;
    if (typeof s.roundName !== 'string' || s.roundName.trim() === '') problems.push('shortlist.roundName should not be empty');
    if (!MODES.includes(s.mode as ShortlistMode)) problems.push('shortlist.mode must be one of: online, offline, phone');
    if (problems.length === 0) {
      if ((s.roundName as string).trim().toLowerCase() === 'fail') {
        return respond(config, 503, errorBody(503, 'Could not reach the notification service, try again', 'Service Unavailable'));
      }
      found.decision = 'shortlisted';
      found.shortlistInfo = s as unknown as ShortlistInfo;
      found.rejectReason = null;
      found.rejectMessage = null;
    }
  } else if (body.decision === 'rejected') {
    const r = (body.rejection ?? {}) as Record<string, unknown>;
    if (!CATEGORIES.includes(r.reasonCategory as RejectReasonCategory)) {
      problems.push('rejection.reasonCategory must be one of: ' + CATEGORIES.join(', '));
    } else {
      found.decision = 'rejected';
      found.rejectReason = r.reasonCategory as RejectReasonCategory;
      found.rejectMessage = typeof r.message === 'string' && r.message ? r.message : null;
      found.shortlistInfo = null;
    }
  } else if (body.decision === null) {
    found.decision = null;
    found.shortlistInfo = null;
    found.rejectReason = null;
    found.rejectMessage = null;
  } else {
    problems.push('decision must be one of: shortlisted, rejected, null');
  }

  if (problems.length > 0) return respond(config, 400, { statusCode: 400, message: problems, error: 'Bad Request' });
  save(list);
  return respond(config, 200, found);
}