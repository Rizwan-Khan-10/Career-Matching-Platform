export type ShortlistMode = 'online' | 'offline' | 'phone';
export type RejectReasonCategory = 'skills_gap' | 'experience' | 'resume_quality' | 'position_filled' | 'other';

// contract 5.6: written by the company in the shortlist form; the applicant sees it exactly as written
export interface ShortlistInfo {
    roundName: string;
    mode: ShortlistMode;
    scheduledAt?: string | null;
    bring?: string | null;
    link?: string | null;
    address?: string | null;
    note?: string | null;
}

export interface Match {
    id: string;
    applicantId: string;
    jobRoleId: string;
    roleTitle?: string | null;
    resumeId?: string | null;
    companyName?: string;          // applicant side only
    companyIndustry?: string | null;
    jobStopped?: boolean;          // company stopped this job: it no longer accepts applications
    // consent flow: company sees a match only after the applicant approved it
    applicantStatus: 'pending' | 'approved' | 'declined';
    // after approval: 'none' = resume PDF is being prepared, 'ready' = sent to the company, 'failed' = could not convert
    resumeStatus: 'none' | 'ready' | 'failed';
    score: number;
    eligible: boolean;
    verdict?: 'eligible' | 'review' | 'not_eligible'; // 'review' = possible match (below the bar, inside the review band); eligible is true only for 'eligible'
    reason?: string | null;
    matchedSkills?: string[];
    partialSkills?: string[];
    missingSkills?: string[];
    feedback: string | null;
    decision?: 'shortlisted' | 'rejected' | null; // company side (GET /matches/role/:id)
    // company side only, contract 5.6. rejectReason is private; the applicant only ever sees rejectMessage
    rejectReason?: RejectReasonCategory | null;
    rejectMessage?: string | null;
    // applicant side (GET /matches/mine), contract 5.6
    outcome?: 'shortlisted' | 'rejected' | null;
    shortlistInfo?: ShortlistInfo | null;
    prepGuide?: string | null;           // AI generated
    rejectionMessage?: string | null;    // written by the company
    rejectionFeedback?: string | null;   // AI generated, null for position_filled / other
    unverifiedRules?: string[];          // among cgpa, branch, passingYear, backlogs
    resumeTargetLabel?: string | null;   // e.g. "Backend · Java"
    createdAt: string;
}

export interface ApplicantSummary {
    userId: string;
    name: string | null;
    headline: string | null;
    location: string | null;
    education: string | null;
    avatarUrl: string | null;
}