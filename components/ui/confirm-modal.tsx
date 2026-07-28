'use client';

import { useEffect, useId, useRef, useState, useCallback } from 'react';
import { useFocusTrap } from '@/lib/hooks/use-focus-trap';

interface ConfirmModalProps {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Play a satisfying "trash" sound using Web Audio API — no external file needed */
function playTrashSound() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Crumple noise burst
    const noiseLen = 0.15;
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * noiseLen, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseData.length, 3);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 2000;
    noiseFilter.Q.value = 0.5;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseLen);

    noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
    noise.start(now);

    // Thud tone (low)
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.4, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(oscGain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);

    // Cleanup
    setTimeout(() => ctx.close(), 500);
  } catch {
    // Audio not supported — silent fallback
  }
}

export function ConfirmModal({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [deleting, setDeleting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const messageId = useId();

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleting) onCancel();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onCancel, deleting]);

  useFocusTrap(dialogRef, !deleting);

  const handleDelete = useCallback(() => {
    setDeleting(true);
    playTrashSound();
    // Wait for animation to finish before calling onConfirm
    setTimeout(() => {
      onConfirm();
    }, 400);
  }, [onConfirm]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      style={{
        transition: 'opacity 0.3s ease',
        opacity: deleting ? 0 : 1,
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        className="border border-[#e5e7eb] bg-white max-w-md w-full rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)] overflow-hidden"
        style={{
          transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          transform: deleting ? 'scale(0.3) translateY(60px)' : 'scale(1) translateY(0px)',
          opacity: deleting ? 0 : 1,
        }}
      >
        {/* Header */}
        <div className="border-b border-[#e5e7eb] p-5">
          <h2 id={titleId} className="font-semibold text-lg text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
            {title}
          </h2>
        </div>

        {/* Content */}
        {message && (
          <div className="p-5">
            <p id={messageId} className="text-sm text-[#6b7280] leading-relaxed" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
              {message}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="border-t border-[#e5e7eb] p-4 flex gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 h-10 border border-[#e5e7eb] bg-white text-[#3a3a3a] hover:bg-[#f7f7f7] transition-colors font-medium text-sm rounded-[8px] disabled:opacity-50"
            style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
          >
            {cancelText}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 h-10 bg-red-500 text-white hover:bg-red-600 active:scale-95 transition-all font-medium text-sm rounded-[8px] disabled:opacity-50"
            style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
          >
            {deleting ? '...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
