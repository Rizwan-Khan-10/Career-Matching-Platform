'use client';

import { motion } from 'motion/react';
import { staggerContainer, staggerItem } from './variants';

export function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <motion.div initial="hidden" animate="show" variants={staggerContainer} className={className}>
            {children}
        </motion.div>
    );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <motion.div variants={staggerItem} className={className}>
            {children}
        </motion.div>
    );
}