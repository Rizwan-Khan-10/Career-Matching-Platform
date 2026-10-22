import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
    label: string;
    href?: string;
}

/** "Jobs / Backend Developer / Candidates". The last item is the current page. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
    return (
        <nav aria-label="Breadcrumb" className="mb-2">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-ink-grey">
                {items.map((item, i) => {
                    const last = i === items.length - 1;
                    return (
                        <li key={`${item.label}-${i}`} className="flex items-center gap-1 min-w-0">
                            {item.href && !last ? (
                                <Link href={item.href} className="hover:text-accent transition-colors">
                                    {item.label}
                                </Link>
                            ) : (
                                <span aria-current={last ? 'page' : undefined} className={last ? 'text-ink truncate' : undefined}>
                                    {item.label}
                                </span>
                            )}
                            {!last && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
