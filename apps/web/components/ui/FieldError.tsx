'use client';

import { AnimatePresence, motion } from 'motion/react';

export function FieldError({ message }: { message?: string }) {
    return (
        <AnimatePresence>
            {message && (
                <motion.p
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 4 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-xs text-danger overflow-hidden"
                >
                    {message}
                </motion.p>
            )}
        </AnimatePresence>
    );
}