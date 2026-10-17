// TEMPORARY mock of the resume-service contract (section 5.4). Deleted together with lib/mocks after merge.
// State lives in localStorage ('mock-resumes'); to reset: localStorage.removeItem('mock-resumes')
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { STACK_LABELS } from '@/lib/targetRoles';
import type { ParsedResumeData } from '@/types/resume';
import { errorBody, respond } from './helpers';

const KEY = 'mock-resumes';
const MAX_RESUMES = 5;
const PARSE_DELAY_MS = 3000; // a new upload shows "Processing" for 3 seconds, then becomes parsed

const TRACKS: { id: string; label: string; stacks: string[] }[] = [
  { id: 'frontend', label: 'Frontend', stacks: ['javascript', 'other'] },
  { id: 'backend', label: 'Backend', stacks: ['java', 'python', 'javascript', 'dotnet', 'go', 'php', 'ruby', 'other'] },
  { id: 'fullstack', label: 'Full-stack', stacks: ['java', 'python', 'javascript', 'dotnet', 'php', 'other'] },
  { id: 'mobile', label: 'Mobile', stacks: ['android', 'ios', 'cross_platform', 'other'] },
  { id: 'data_ml', label: 'Data / ML / AI', stacks: ['data_analyst', 'data_engineer', 'ml_ai', 'other'] },
  { id: 'devops_cloud', label: 'DevOps / Cloud', stacks: ['aws', 'azure', 'gcp', 'general', 'other'] },
  { id: 'qa', label: 'QA / Testing', stacks: ['manual', 'automation', 'other'] },
  { id: 'other', label: 'Other', stacks: [] },
];

const SAMPLE_PARSED: ParsedResumeData = {
  currentTitle: 'Software Engineer',
  summary: 'Final-year student with project experience.',
  skills: ['Java', 'Spring Boot', 'SQL', 'Docker'],
  experience: [],
  projects: [{ name: 'Campus Portal', description: 'Web portal for campus notices built with Spring Boot.' }],
  education: 'B.Tech Computer Science',
  certifications: [],
  cgpa: 8.2,
  experienceYears: 0,
  branch: 'Computer Science',
  passingYear: 2026,
  backlogs: 0,
};

interface MockResume {
  id: string;
  targetTrack: string;
  targetStack: string;
  createdAt: string;
  confirmedAt: string | null;
  supersededAt: string | null;
  usedByApprovedMatch?: boolean; // mock only: delete returns 409
  parsedData?: ParsedResumeData;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

function seed(): MockResume[] {
  return [
    // confirmed + used by an approved match: DELETE gives 409
    { id: 'mock-r1', targetTrack: 'backend', targetStack: 'java', createdAt: daysAgo(10), confirmedAt: daysAgo(10), supersededAt: null, usedByApprovedMatch: true },
    // parsed but not confirmed
    { id: 'mock-r2', targetTrack: 'frontend', targetStack: 'javascript', createdAt: daysAgo(1), confirmedAt: null, supersededAt: null },
    // replaced, but kept because an approved match still uses it
    { id: 'mock-r3', targetTrack: 'backend', targetStack: 'python', createdAt: daysAgo(30), confirmedAt: daysAgo(30), supersededAt: daysAgo(5), usedByApprovedMatch: true },
  ];
}

function load(): MockResume[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as MockResume[];
    } catch {
      /* fall through to the seed */
    }
  }
  const initial = seed();
  save(initial);
  return initial;
}

function save(list: MockResume[]) {
  if (typeof window !== 'undefined') window.localStorage.setItem(KEY, JSON.stringify(list));
}

function labelOf(track: string, stack: string): string {
  const trackLabel = TRACKS.find((t) => t.id === track)?.label ?? track;
  if (track === 'other') return trackLabel;
  return `${trackLabel} · ${STACK_LABELS[stack] ?? stack}`;
}

function toResume(r: MockResume) {
  const status = Date.now() - Date.parse(r.createdAt) < PARSE_DELAY_MS ? 'pending' : 'parsed';
  return {
    id: r.id,
    status,
    fileUrl: '',
    parsedData: status === 'parsed' ? (r.parsedData ?? SAMPLE_PARSED) : null,
    createdAt: r.createdAt,
    targetTrack: r.targetTrack,
    targetStack: r.targetStack,
    targetLabel: labelOf(r.targetTrack, r.targetStack),
    confirmedAt: r.confirmedAt,
    supersededAt: r.supersededAt,
  };
}

function upload(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const form = config.data instanceof FormData ? config.data : null;
  const track = String(form?.get('targetTrack') ?? '');
  const stack = String(form?.get('targetStack') ?? '');
  const def = TRACKS.find((t) => t.id === track);

  if (!form?.get('file')) return respond(config, 400, errorBody(400, 'File is required', 'Bad Request'));
  const stackOk = !!def && (def.stacks.includes(stack) || (def.stacks.length === 0 && stack === 'other'));
  if (!stackOk) return respond(config, 400, errorBody(400, 'Pick a valid target role and stack', 'Bad Request'));

  const list = load();
  if (list.filter((r) => !r.supersededAt).length >= MAX_RESUMES) {
    return respond(config, 409, errorBody(409, 'You can keep at most 5 resumes. Delete one before uploading another.', 'Conflict'));
  }

  // a newer unconfirmed upload for the same target replaces the older unconfirmed one
  const kept = list.filter((r) => !(r.targetTrack === track && r.targetStack === stack && !r.confirmedAt && !r.supersededAt));
  const created: MockResume = {
    id: `mock-${Date.now()}`,
    targetTrack: track,
    targetStack: stack,
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    supersededAt: null,
  };
  save([...kept, created]);
  return respond(config, 201, toResume(created));
}

export function handleResumeMock(method: string, url: string, config: InternalAxiosRequestConfig): Promise<AxiosResponse> | null {
  if (!url.startsWith('/resumes')) return null;

  if (method === 'get' && url === '/resumes/target-roles') {
    return respond(config, 200, {
      tracks: TRACKS.map((t) => ({
        id: t.id,
        label: t.label,
        stacks: t.stacks.map((id) => ({ id, label: STACK_LABELS[id] ?? id })),
      })),
    });
  }
  if (method === 'get' && url === '/resumes/mine') return respond(config, 200, load().map(toResume));
  if (method === 'post' && url === '/resumes/upload') return upload(config);

  const match = /^\/resumes\/([^/]+)$/.exec(url);
  if (!match) return null;
  const list = load();
  const found = list.find((r) => r.id === match[1]);
  if (!found) return respond(config, 404, errorBody(404, 'Resume not found', 'Not Found'));

  if (method === 'delete') {
    if (found.usedByApprovedMatch) {
      return respond(config, 409, errorBody(409, 'This resume is used by an approved match and cannot be deleted.', 'Conflict'));
    }
    save(list.filter((r) => r.id !== found.id));
    return respond(config, 200, { deleted: true });
  }

  if (method === 'patch') {
    const body = typeof config.data === 'string' ? (JSON.parse(config.data) as ParsedResumeData) : {};
    found.parsedData = { ...(found.parsedData ?? SAMPLE_PARSED), ...body };
    save(list);
    return respond(config, 200, toResume(found));
  }

  return null;
}