'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toBlob } from 'html-to-image';
import { positionToShareData } from '@/lib/share/pnl-share';
import { PnLPositionCard } from '@/components/share/pnl-position-card';
import type { ShareablePnLData } from '@/lib/share/pnl-share';
import { useUIStore } from '@/lib/store/ui';

interface PnLShareButtonProps {
  position?: {
    title: string;
    outcome: string;
    avgPrice: number;
    curPrice: number;
    percentPnl: number;
    slug?: string;
  };
  shareData?: ShareablePnLData;
  variant?: 'icon' | 'text' | 'full';
}

export function PnLShareButton({ position, shareData: rawShareData, variant = 'icon' }: PnLShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [primed, setPrimed] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'done'>('idle');
  const prime = useCallback(() => setPrimed(true), []);
  const cardRef = useRef<HTMLDivElement>(null);
  const modalCardRef = useRef<HTMLDivElement>(null);
  // Only used when this share button is rendered from a scoped markets card
  // (outside-portal state can't read scoped CSS variables).
  const marketsDarkMode = useUIStore((s) => s.marketsDarkMode);
  const [isDarkScoped, setIsDarkScoped] = useState(false);
  const iconBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!iconBtnRef.current) return;
    const marketsAncestor = iconBtnRef.current.closest('.markets-theme-scope');
    setIsDarkScoped(
      (!!marketsAncestor && marketsDarkMode)
    );
  }, [marketsDarkMode, open]);

  const shareData = rawShareData || (position ? positionToShareData(position) : null);

  const handleShareOnX = () => {
    if (!shareData) return;
    const isProfit = shareData.pnlPercent >= 0;
    const m = shareData.market;

    const tag = `\n\ntrade markets efficiently w/ @missiondotfun`;

    const PROFIT_TEXTS = [
      `While you were sleeping, I was printing on "${m}".${tag}`,
      `Called it. "${m}" just paid out.${tag}`,
      `My prediction market thesis is alive and well. "${m}" 🟢${tag}`,
      `Not luck. Just conviction. "${m}" delivered.${tag}`,
      `Prediction markets > vibes. "${m}" is proof.${tag}`,
      `I put a number on my belief and "${m}" agreed.${tag}`,
      `The crowd was wrong. I wasn't. "${m}"${tag}`,
      `Thesis confirmed on "${m}". On to the next one.${tag}`,
      `Green day. "${m}" did exactly what I thought it would.${tag}`,
      `I traded my conviction on "${m}" and the market agreed.${tag}`,
      `Who needs alpha when you have a working thesis? "${m}" ✅${tag}`,
      `Slow and steady wins on "${m}". Printing.${tag}`,
      `Information is an edge. "${m}" just proved it.${tag}`,
    ];

    const LOSS_TEXTS = [
      `The market won this round on "${m}". Revenge trade incoming.${tag}`,
      `Wrong on "${m}". The market humbles everyone eventually.${tag}`,
      `Markets 1 – Me 0. "${m}" got me this time.${tag}`,
      `Took an L on "${m}". Updating my model and moving on.${tag}`,
      `"${m}" reminded me that overconfidence is a tax.${tag}`,
      `Not every bet lands. "${m}" was a lesson, not a loss.${tag}`,
      `The red on "${m}" hurts. The insight it bought is worth more.${tag}`,
      `Wrong side of "${m}" today. I'll be back.${tag}`,
      `Lost on "${m}". Didn't lose the conviction to keep trading.${tag}`,
      `That one stings. "${m}" won. I'll get the next one.${tag}`,
      `Prediction markets punish lazy thinking. "${m}" reminded me of that.${tag}`,
      `Down on "${m}". The re-research starts now.${tag}`,
    ];

    const pool = isProfit ? PROFIT_TEXTS : LOSS_TEXTS;
    const text = pool[Math.floor(Math.random() * pool.length)];
    const params = new URLSearchParams({ text });
    window.open(`https://twitter.com/intent/tweet?${params.toString()}`, '_blank');
    setOpen(false);
  };

  const doCopyImage = useCallback(async (ref: React.RefObject<HTMLDivElement | null>) => {
    if (!ref.current || copyState === 'copying') return;
    setCopyState('copying');
    try {
      const blob = await toBlob(ref.current, { pixelRatio: 2, backgroundColor: '#0C0C0E' });
      if (blob) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopyState('done');
        setTimeout(() => setCopyState('idle'), 2000);
      } else {
        setCopyState('idle');
      }
    } catch {
      setCopyState('idle');
    }
  }, [copyState]);

  const handleCopyImage = useCallback(() => doCopyImage(cardRef), [doCopyImage]);
  const handleModalCopyImage = useCallback(() => doCopyImage(modalCardRef), [doCopyImage]);

  const ShareIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );

  const menuItemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
    borderRadius: 6, fontSize: 12, fontWeight: 600,
    color: isDarkScoped ? '#ededed' : '#1a1a1a',
    textDecoration: 'none', fontFamily: 'var(--font-bricolage), sans-serif',
    background: 'transparent', border: 'none', cursor: 'pointer', width: '100%',
  };
  const menuHoverBg = isDarkScoped ? 'rgba(255,255,255,0.06)' : '#f5f5f5';

  const getDropdownPos = useCallback(() => {
    if (!iconBtnRef.current) return { top: 0, right: 0 };
    const rect = iconBtnRef.current.getBoundingClientRect();
    return { top: rect.bottom + 4, right: window.innerWidth - rect.right };
  }, []);

  if (!shareData) return null;

  // Hidden card for "Copy image" from dropdown — opacity 0 in viewport so images load
  const hiddenCard = (
    <div style={{ position: 'fixed', top: 0, left: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
      <PnLPositionCard
        ref={cardRef}
        market={shareData.market}
        position={shareData.position}
        entryPrice={shareData.entryPrice}
        currentPrice={shareData.currentPrice}
        invested={0}
        pnlPercent={shareData.pnlPercent}
        pnlDollar={0}
        date={shareData.date}
        backgroundImage={shareData.bg}
      />
    </div>
  );

  const cardModal = modal && typeof document !== 'undefined'
    ? createPortal(
        <CardModal
          shareData={shareData}
          modalCardRef={modalCardRef}
          copyState={copyState}
          onCopyImage={handleModalCopyImage}
          onShareOnX={() => {
            handleShareOnX();
            setModal(false);
          }}
          onClose={() => setModal(false)}
        />,
        document.body,
      )
    : null;

  if (variant === 'icon') {
    const dropdownMenu = open ? createPortal(
      <>
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        />
        <div style={{
          position: 'fixed', ...getDropdownPos(),
          background: isDarkScoped ? '#1a1a1a' : '#ffffff',
          borderRadius: 8,
          border: isDarkScoped ? '1px solid rgba(255,255,255,0.1)' : '1px solid #d1d5db',
          boxShadow: isDarkScoped
            ? '0 10px 30px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)'
            : '0 8px 24px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
          padding: 4,
          zIndex: 9999, minWidth: 160, maxWidth: 'min(180px, calc(100vw - 32px))',
          display: 'flex', flexDirection: 'column' as const, gap: 2,
        }}>
          <button
            onClick={handleShareOnX}
            style={menuItemStyle}
            onMouseEnter={e => (e.currentTarget.style.background = menuHoverBg)}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            Share on X
          </button>
          <button
            onClick={() => { setOpen(false); setModal(true); }}
            style={menuItemStyle}
            onMouseEnter={e => (e.currentTarget.style.background = menuHoverBg)}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            View card
          </button>
          <button
            onClick={handleCopyImage}
            disabled={copyState === 'copying'}
            style={{ ...menuItemStyle, opacity: copyState === 'copying' ? 0.5 : 1 }}
            onMouseEnter={e => { if (copyState === 'idle') e.currentTarget.style.background = menuHoverBg; }}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copyState === 'done' ? 'Copied!' : copyState === 'copying' ? 'Copying...' : 'Copy image'}
          </button>
        </div>
      </>,
      document.body,
    ) : null;

    return (
      <div style={{ display: 'inline-flex' }} onMouseEnter={prime} onFocus={prime}>
        {(primed || open || modal) && hiddenCard}
        {cardModal}
        {dropdownMenu}
        <button
          ref={iconBtnRef}
          onClick={() => setOpen(!open)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 8,
            background: isDarkScoped ? 'rgba(255,255,255,0.06)' : 'var(--ipl-share-btn-bg, #fafbfc)',
            border: 'none',
            cursor: 'pointer',
            color: isDarkScoped ? 'rgba(255,255,255,0.55)' : 'var(--ipl-share-btn-fg, #b5b5b5)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = isDarkScoped ? 'rgba(255,255,255,0.12)' : 'var(--ipl-share-btn-bg-hover, #f0f0f0)';
            e.currentTarget.style.color = isDarkScoped ? '#ededed' : 'var(--ipl-share-btn-fg-hover, #666)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = isDarkScoped ? 'rgba(255,255,255,0.06)' : 'var(--ipl-share-btn-bg, #fafbfc)';
            e.currentTarget.style.color = isDarkScoped ? 'rgba(255,255,255,0.55)' : 'var(--ipl-share-btn-fg, #b5b5b5)';
          }}
          title="Share"
        >
          <ShareIcon />
        </button>
      </div>
    );
  }

  // Full variant
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onMouseEnter={prime} onFocus={prime}>
      {(primed || modal) && hiddenCard}
      {cardModal}
      <button
        onClick={handleShareOnX}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '5px 12px', background: '#1a1a1a', color: '#fff',
          fontSize: 11, fontWeight: 600, borderRadius: 6, border: 'none',
          cursor: 'pointer', fontFamily: 'var(--font-bricolage), sans-serif',
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
        Share on X
      </button>
      <button
        onClick={() => setModal(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '5px 12px', background: 'transparent', color: '#1a1a1a',
          fontSize: 11, fontWeight: 600, borderRadius: 6, border: '1px solid #e5e7eb',
          cursor: 'pointer', fontFamily: 'var(--font-bricolage), sans-serif',
        }}
      >
        View card
      </button>
      <button
        onClick={handleCopyImage}
        disabled={copyState === 'copying'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '5px 12px', background: 'transparent', color: '#1a1a1a',
          fontSize: 11, fontWeight: 600, borderRadius: 6, border: '1px solid #e5e7eb',
          cursor: 'pointer', fontFamily: 'var(--font-bricolage), sans-serif',
        }}
      >
        {copyState === 'done' ? 'Copied!' : 'Copy image'}
      </button>
    </div>
  );
}

/** Full-screen modal with ambient glow and polished UI */
function CardModal({ shareData, modalCardRef, copyState, onCopyImage, onShareOnX, onClose }: {
  shareData: ShareablePnLData;
  modalCardRef: React.RefObject<HTMLDivElement | null>;
  copyState: 'idle' | 'copying' | 'done';
  onCopyImage: () => void;
  onShareOnX: () => void;
  onClose: () => void;
}) {
  const [linkCopied, setLinkCopied] = useState(false);
  const isProfit = shareData.pnlPercent >= 0;
  const accentRgb = isProfit ? '34,197,94' : '239,68,68';

  // Use same bg as card — if no explicit bg, pick a stable random one based on market name
  const bgImage = shareData.bg || (() => {
    const BACKGROUNDS = [
      '/pnl-backgrounds/mountain-valley.jpg', '/pnl-backgrounds/lake-cabin.jpg',
      '/pnl-backgrounds/earth-glow.jpg', '/pnl-backgrounds/alpine-meadow.jpg',
      '/pnl-backgrounds/field-rest.jpg', '/pnl-backgrounds/leaf-warrior.jpg',
      '/pnl-backgrounds/mountain-ride.jpg',
    ];
    let hash = 0;
    for (let i = 0; i < shareData.market.length; i++) hash = ((hash << 5) - hash) + shareData.market.charCodeAt(i);
    return BACKGROUNDS[Math.abs(hash) % BACKGROUNDS.length];
  })();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/share/pnl?${new URLSearchParams({
      market: shareData.market,
      pos: shareData.position,
      entry: String(shareData.entryPrice),
      current: String(shareData.currentPrice),
      pnl: String(shareData.pnlPercent),
      date: shareData.date,
    }).toString()}`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#000',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 0, padding: '40px 20px',
        animation: 'pnl-modal-fade 0.25s ease-out',
      }}
    >
      <style>{`
        @keyframes pnl-modal-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pnl-card-rise {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .pnl-modal-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 22px;
          font-size: 13px; font-weight: 600;
          border-radius: 10px; cursor: pointer;
          font-family: var(--font-bricolage), sans-serif;
          transition: all 0.15s ease;
          text-decoration: none;
        }
        .pnl-modal-btn:hover { transform: translateY(-1px); }
        .pnl-modal-btn:active { transform: translateY(0); }
        @keyframes pnl-share-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(255,255,255,0.3), 0 0 40px rgba(255,255,255,0.15), 0 4px 12px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 0 28px rgba(255,255,255,0.45), 0 0 56px rgba(255,255,255,0.22), 0 4px 12px rgba(0,0,0,0.3); }
        }
        .pnl-share-x-btn { animation: pnl-share-glow 2s ease-in-out infinite; }
      `}</style>

      {/* Blurred background image — full screen */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={bgImage}
        alt=""
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', filter: 'blur(50px) saturate(1.2)',
          transform: 'scale(1.15)',
          pointerEvents: 'none', opacity: 0.35,
        }}
      />
      {/* Dark + accent gradient overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(ellipse at center 40%, rgba(${accentRgb},0.08) 0%, transparent 60%), linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.7) 100%)`,
      }} />

      {/* Close button */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{
          position: 'absolute', top: 16, right: 20,
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.35)', cursor: 'pointer',
          width: 40, height: 40, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
          e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
          e.currentTarget.style.color = 'rgba(255,255,255,0.35)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Header */}
      <div style={{
        fontFamily: 'var(--font-bricolage), sans-serif',
        fontSize: 13, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.2)', marginBottom: 20,
        animation: 'pnl-card-rise 0.3s ease-out',
      }}>
        Share your position
      </div>

      {/* Card with entrance animation and glow shadow */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          animation: 'pnl-card-rise 0.35s ease-out',
          boxShadow: `0 20px 60px rgba(${accentRgb},0.15), 0 8px 24px rgba(0,0,0,0.4)`,
          borderRadius: 14,
        }}
      >
        <PnLPositionCard
          ref={modalCardRef}
          market={shareData.market}
          position={shareData.position}
          entryPrice={shareData.entryPrice}
          currentPrice={shareData.currentPrice}
          invested={0}
          pnlPercent={shareData.pnlPercent}
          pnlDollar={0}
          date={shareData.date}
          backgroundImage={shareData.bg}
        />
      </div>

      {/* Action buttons */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          marginTop: 24,
          animation: 'pnl-card-rise 0.4s ease-out',
          width: '100%', maxWidth: 400,
        }}
      >
        {/* Share on X — centered, glowing */}
        <button
          className="pnl-modal-btn pnl-share-x-btn"
          onClick={onShareOnX}
          style={{
            background: '#fff', color: '#000',
            border: 'none',
            boxShadow: '0 0 20px rgba(255,255,255,0.3), 0 0 40px rgba(255,255,255,0.15), 0 4px 12px rgba(0,0,0,0.3)',
            padding: '12px 32px',
            fontSize: 14,
            justifyContent: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
          Share on X
        </button>
        {/* Secondary actions */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            className="pnl-modal-btn"
            onClick={onCopyImage}
            disabled={copyState === 'copying'}
            style={{
              background: 'rgba(255,255,255,0.12)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.18)',
              backdropFilter: 'blur(12px)',
              opacity: copyState === 'copying' ? 0.5 : 1,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2-2v1" />
            </svg>
            {copyState === 'done' ? 'Copied!' : copyState === 'copying' ? 'Copying...' : 'Copy image'}
          </button>
          <button
            className="pnl-modal-btn"
            onClick={handleCopyLink}
            style={{
              background: 'rgba(255,255,255,0.12)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.18)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            {linkCopied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </div>
    </div>
  );
}
