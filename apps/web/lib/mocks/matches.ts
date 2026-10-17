// TEMPORARY mock of GET /matches/mine and PATCH /matches/:id/approval (contract 5.6). Deleted with lib/mocks after merge.
// State lives in localStorage ('mock-matches'); to reset: localStorage.removeItem('mock-matches')
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { Match } from '@/types/match';
import { bodyOf, errorBody, respond } from './helpers';

const KEY = 'mock-matches';
const PDF_DELAY_MS = 3000; // after approving, "Preparing your resume as a PDF…" for 3 seconds, then ready

interface MockMatch extends Match {
  approvedAt?: number;
}

function make(id: string, over: Partial<MockMatch>): MockMatch {
  return {
    id,
    applicantId: 'mock-applicant',
    jobRoleId: `role-${id}-0000`,
    roleTitle: 'Backend Developer',
    resumeId: 'mock-r1',
    companyName: 'Acme Tech',
    companyIndustry: 'Software',
    jobStopped: false,
    applicantStatus: 'pending',
    resumeStatus: 'none',
    score: 0.82,
    eligible: true,
    reason: 'Strong overlap with the required skills.',
    matchedSkills: ['Java', 'Spring Boot'],
    partialSkills: ['Docker'],
    missingSkills: [],
    feedback: null,
    outcome: null,
    shortlistInfo: null,
    prepGuide: null,
    rejectionMessage: null,
    rejectionFeedback: null,
    unverifiedRules: [],
    resumeTargetLabel: 'Backend · Java',
    createdAt: new Date().toISOString(),
    ...over,
  };
}

function seed(): MockMatch[] {
  const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString();
  return [
    // eligible, waiting for approval, with an unverified CGPA rule
    make('m1', { missingSkills: ['Kubernetes'], unverifiedRules: ['cgpa'] }),
    // shortlisted, online round, AI prep tips ready
    make('m2', {
      roleTitle: 'Java Engineer',
      companyName: 'Northwind Labs',
      score: 0.91,
      applicantStatus: 'approved',
      resumeStatus: 'ready',
      outcome: 'shortlisted',
      shortlistInfo: {
        roundName: 'Technical round 1',
        mode: 'online',
        scheduledAt: inTwoDays,
        link: 'https://meet.example.com/abc-defg',
        bring: 'Laptop with IntelliJ installed.\nA government photo ID.',
        note: 'Please join 5 minutes early.',
      },
      prepGuide:
        '- Revise Spring Boot basics: dependency injection, REST controllers and exception handling.\n- Be ready to explain the Campus Portal project in detail.\n- Practice two or three SQL join questions.',
    }),
    // shortlisted, in person, AI prep tips still being written (placeholder)
    make('m3', {
      roleTitle: 'Platform Engineer',
      companyName: 'Orbit Systems',
      score: 0.87,
      applicantStatus: 'approved',
      resumeStatus: 'ready',
      outcome: 'shortlisted',
      shortlistInfo: {
        roundName: 'HR + technical',
        mode: 'offline',
        scheduledAt: inTwoDays,
        address: 'Floor 4, Tech Park, Hinjewadi, Pune',
        bring: 'Printed resume (2 copies).',
      },
      prepGuide: null,
    }),
    // rejected with a message from the company and AI feedback
    make('m4', {
      roleTitle: 'Backend Developer',
      companyName: 'Zenith Software',
      applicantStatus: 'approved',
      resumeStatus: 'ready',
      outcome: 'rejected',
      rejectionMessage: 'We went ahead with a candidate who has more production experience.',
      rejectionFeedback:
        'Your resume lists projects but not what you personally built. Add measurable results, and strengthen Docker and CI/CD basics for roles like this.',
    }),
    // rejected, position filled: only the polite default message, no AI feedback
    make('m5', {
      roleTitle: 'API Developer',
      companyName: 'Lumen Cloud',
      applicantStatus: 'approved',
      resumeStatus: 'ready',
      outcome: 'rejected',
    }),
    // not eligible, with the improvement guide
    make('m6', {
      roleTitle: 'DevOps Engineer',
      companyName: 'Stackwise',
      score: 0.31,
      eligible: false,
      reason: 'Required skills are missing.',
      matchedSkills: ['Linux'],
      partialSkills: [],
      missingSkills: ['Docker', 'Kubernetes', 'Terraform'],
      feedback: 'Learn Docker first, then build and deploy one small project with it. Add it to your resume.',
    }),
    // eligible, declined earlier
    make('m7', { roleTitle: 'Junior Java Developer', companyName: 'Brightpath', applicantStatus: 'declined' }),
  ];
}

function save(list: MockMatch[]) {
  if (typeof window !== 'undefined') window.localStorage.setItem(KEY, JSON.stringify(list));
}

function load(): MockMatch[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as MockMatch[];
    } catch {
      /* fall through to the seed */
    }
  }
  const initial = seed();
  save(initial);
  return initial;
}

function view(m: MockMatch): Match {
  const { approvedAt, ...rest } = m;
  const pdfReady = approvedAt != null && Date.now() - approvedAt > PDF_DELAY_MS;
  return { ...rest, resumeStatus: rest.resumeStatus === 'none' && pdfReady ? 'ready' : rest.resumeStatus };
}

export function handleMatchMock(method: string, url: string, config: InternalAxiosRequestConfig): Promise<AxiosResponse> | null {
  if (method === 'get' && url === '/matches/mine') return respond(config, 200, load().map(view));

  const approval = /^\/matches\/([^/]+)\/approval$/.exec(url);
  if (method === 'patch' && approval) {
    const list = load();
    const found = list.find((m) => m.id === approval[1]);
    if (!found) return respond(config, 404, errorBody(404, 'Match not found', 'Not Found'));
    const approved = bodyOf(config).approved === true;
    found.applicantStatus = approved ? 'approved' : 'declined';
    if (approved) {
      found.resumeStatus = 'none';
      found.approvedAt = Date.now();
    }
    save(list);
    return respond(config, 200, view(found));
  }
  return null;
}