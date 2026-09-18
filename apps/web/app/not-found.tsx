import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-4 text-center">
            <p className="font-heading text-5xl font-bold text-ink mb-2">404</p>
            <p className="text-sm text-ink-grey mb-6">This page doesn&apos;t exist.</p>
            <Link href="/" className="text-sm font-medium text-accent underline">Go back home</Link>
        </div>
    );
}