import Link from 'next/link';

export function ProfileBanner({ href }: { href: string }) {
    return (
        <div className="bg-accent-soft border border-accent/20 rounded-xl px-4 py-3 mb-6 flex items-center justify-between">
            <p className="text-sm text-ink">Your profile is incomplete.</p>
            <Link href={href} className="text-sm font-medium text-accent underline">
                Complete it now
            </Link>
        </div>
    );
}