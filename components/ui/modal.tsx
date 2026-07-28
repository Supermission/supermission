'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '@/lib/hooks/use-focus-trap';

interface ModalProps {
    title: string;
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

export function Modal({ title, isOpen, onClose, children }: ModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const titleId = useId();

    // Close on Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    // Prevent scrolling when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    // Focus trap + restore focus to invoking element on close
    useFocusTrap(dialogRef, isOpen);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="border border-[#e5e7eb] bg-white max-w-md w-full max-h-[90vh] overflow-y-auto flex flex-col rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
            >
                {/* Header */}
                <div className="border-b border-[#e5e7eb] p-5 bg-white flex justify-between items-center sticky top-0 z-10 rounded-t-[16px]">
                    <h2 id={titleId} className="font-semibold text-lg text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        aria-label="Close dialog"
                        className="w-8 h-8 flex items-center justify-center hover:bg-[#f7f7f7] rounded-[6px] transition-colors text-[#6b7280] hover:text-[#3a3a3a]"
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div className="p-5">
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
}
