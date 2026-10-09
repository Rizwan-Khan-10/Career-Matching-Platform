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
    reason?: string | null;
    matchedSkills?: string[];
    partialSkills?: string[];
    missingSkills?: string[];
    feedback: string | null;
    decision?: 'shortlisted' | 'rejected' | null;
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