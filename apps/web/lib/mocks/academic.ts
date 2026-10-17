// TEMPORARY mock of the academic fields on /applicants/me (contract 4.3 / 5.2). Deleted with lib/mocks after merge.
// State lives in localStorage ('mock-academic'). Scenarios (run in the browser console, then refresh):
//   verified: localStorage.setItem('mock-academic', JSON.stringify({ cgpa: 8.4, branch: 'Computer Science', passingYear: 2026, backlogs: 0, academicVerified: true }))
//   reset:    localStorage.removeItem('mock-academic')
import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { bodyOf } from './helpers';

const KEY = 'mock-academic';

interface MockAcademic {
  cgpa: number | null;
  branch: string | null;
  passingYear: number | null;
  backlogs: number | null;
  academicVerified: boolean;
}

const EMPTY: MockAcademic = { cgpa: null, branch: null, passingYear: null, backlogs: null, academicVerified: false };

function load(): MockAcademic {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<MockAcademic>) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

const num = (value: unknown, fallback: number | null) => (typeof value === 'number' ? value : fallback);
const text = (value: unknown, fallback: string | null) => (typeof value === 'string' ? value : fallback);

async function forward(method: string, config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  if (method === 'patch') {
    const state = load();
    if (!state.academicVerified) {
      const body = bodyOf(config);
      const next: MockAcademic = {
        ...state,
        cgpa: num(body.cgpa, state.cgpa),
        branch: text(body.branch, state.branch),
        passingYear: num(body.passingYear, state.passingYear),
        backlogs: num(body.backlogs, state.backlogs),
      };
      window.localStorage.setItem(KEY, JSON.stringify(next));
    }
  }
  // the rest of the profile is real; the academic fields are added on top
  const real = await axios.getAdapter(axios.defaults.adapter)(config);
  return { ...real, data: { ...real.data, ...load() } };
}

export function handleAcademicMock(method: string, url: string, config: InternalAxiosRequestConfig): Promise<AxiosResponse> | null {
  if (url !== '/applicants/me' || (method !== 'get' && method !== 'patch')) return null;
  return forward(method, config);
}