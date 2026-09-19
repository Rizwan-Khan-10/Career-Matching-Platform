import Link from 'next/link';
import { motion } from 'motion/react';

export function ProfileBanner({ href }: { href: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-accent-soft border border-accent/20 rounded-xl px-4 py-3 mb-6 flex items-center justify-between"
        >
            <p className="text-sm text-ink">Your profile is incomplete.</p>
            <Link href={href} className="text-sm font-medium text-accent underline">
                Complete it now
            </Link>
        </motion.div>
    );
}