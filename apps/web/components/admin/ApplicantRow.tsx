import { Pill } from '@/components/admin/Pill';
import { UserLifecycleActions } from '@/components/admin/UserLifecycleActions';
import type { AdminApplicant } from '@/types/admin';

export const APPLICANTS_KEY = ['adminApplicants'] as const;

export function ApplicantRow({ applicant }: { applicant: AdminApplicant }) {
    const name = applicant.name || 'This applicant';
    const academic = [
        applicant.cgpa != null ? `CGPA ${applicant.cgpa}` : null,
        applicant.branch || null,
        applicant.passingYear != null ? `Batch ${applicant.passingYear}` : null,
        applicant.backlogs != null ? (applicant.backlogs === 0 ? 'No backlogs' : `${applicant.backlogs} backlog${applicant.backlogs === 1 ? '' : 's'}`) : null,
    ].filter((v): v is string => v !== null);

    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink">{applicant.name || 'Unnamed'}</p>
                    {applicant.isActive === false && <Pill tone="muted">Deactivated</Pill>}
                </div>
                <p className="text-xs text-ink-grey truncate">{applicant.email || 'Email not available'}</p>
                <p className="text-xs text-ink-grey">
                    {applicant.education || 'Education not set'} · Joined {new Date(applicant.createdAt).toLocaleDateString()}
                </p>

                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {academic.length > 0 ? (
                        <>
                            {academic.map((item) => (
                                <span key={item} className="bg-paper text-ink border border-hairline text-xs px-2 py-0.5 rounded-full">
                                    {item}
                                </span>
                            ))}
                            {applicant.academicVerified ? (
                                <Pill tone="success" title="Imported by an admin. The applicant cannot change these values.">
                                    Verified
                                </Pill>
                            ) : (
                                <Pill tone="muted" title="Entered by the applicant or read from their resume">
                                    Not verified
                                </Pill>
                            )}
                        </>
                    ) : (
                        <span className="text-xs text-ink-grey">No academic details yet</span>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
                <UserLifecycleActions userId={applicant.userId} name={name} isActive={applicant.isActive !== false} listKey={APPLICANTS_KEY} />
            </div>
        </div>
    );
}