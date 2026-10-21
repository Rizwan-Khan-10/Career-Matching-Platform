'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { TwoFactorSettings } from '@/components/security/TwoFactorSettings';

export function SecurityModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    // true while recovery codes are on screen: backdrop click / Escape must not throw them away
    const [locked, setLocked] = useState(false);

    return (
        <Modal isOpen={isOpen} onClose={() => !locked && onClose()} title="Security">
            {/* mounted only while open, so every visit starts from the overview */}
            {isOpen && <TwoFactorSettings onLockClose={setLocked} />}
        </Modal>
    );
}