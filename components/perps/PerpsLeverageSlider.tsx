'use client';

import { useMemo, useCallback, useRef, useState } from 'react';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

interface PerpsLeverageSliderProps {
  leverage: number;
  maxLeverage: number;
  onChange: (value: number) => void;
  side?: 'long' | 'short';
  darkMode?: boolean;
}

export function PerpsLeverageSlider({
  leverage,
  maxLeverage,
  onChange,
  side = 'long',
  darkMode = false,
}: PerpsLeverageSliderProps) {
  const isLong = side === 'long';
  const activeColor = isLong ? '#22c55e' : '#ef4444';
  const totalBars = 24;
  const filledBars = leverage >= maxLeverage ? totalBars : Math.round((leverage / maxLeverage) * totalBars);
  const prevLevRef = useRef(leverage);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const markers = useMemo(() => {
    const all = [1, 2, 5, 10, 20, 25, 50];
    const filtered = all.filter((m) => m <= maxLeverage);
    if (!filtered.includes(maxLeverage)) filtered.push(maxLeverage);
    return filtered;
  }, [maxLeverage]);

  // Haptic feedback on value change — skip if user prefers reduced motion
  const handleChange = useCallback((newLev: number) => {
    if (newLev !== prevLevRef.current) {
      prevLevRef.current = newLev;
      const reduced = typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (!reduced && navigator.vibrate) navigator.vibrate(5);
    }
    onChange(newLev);
  }, [onChange]);

  const handleBarClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const lev = pct >= 0.95 ? maxLeverage : Math.max(1, Math.round(pct * maxLeverage));
    handleChange(lev);
  }, [maxLeverage, handleChange]);

  // Drag support
  const isDragging = useRef(false);
  const barRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handleBarClick(e as unknown as React.MouseEvent<HTMLDivElement>);
  }, [handleBarClick]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || !barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const lev = pct >= 0.95 ? maxLeverage : Math.max(1, Math.round(pct * maxLeverage));
    handleChange(lev);
  }, [maxLeverage, handleChange]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  return (
    <div className="space-y-2">
      {/* Label + value */}
      <div className="flex items-baseline justify-between">
        <span
          className={`perps-lev-label text-[12px] font-medium uppercase tracking-wider ${darkMode ? 'text-white/40' : 'text-[#9ca3af]'}`}
          style={{ fontFamily: FONT }}
        >
          Leverage
        </span>
        {isEditing ? (
          <input
            autoFocus
            type="number"
            min={1}
            max={maxLeverage}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => {
              const val = Math.max(1, Math.min(maxLeverage, Math.round(Number(editValue) || leverage)));
              handleChange(val);
              setIsEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const val = Math.max(1, Math.min(maxLeverage, Math.round(Number(editValue) || leverage)));
                handleChange(val);
                setIsEditing(false);
              } else if (e.key === 'Escape') {
                setIsEditing(false);
              }
            }}
            className="w-14 text-right text-[20px] font-semibold tabular-nums bg-transparent border-b-2 outline-none"
            style={{ fontFamily: FONT, color: activeColor, borderColor: activeColor }}
          />
        ) : (
          <button
            onClick={() => { setEditValue(String(leverage)); setIsEditing(true); }}
            className="text-[20px] font-semibold tabular-nums cursor-pointer hover:opacity-80 transition-opacity"
            style={{ fontFamily: FONT, color: activeColor, letterSpacing: '-0.01em' }}
          >
            {leverage}<span className="text-[14px] opacity-60 ml-0.5">x</span>
          </button>
        )}
      </div>

      {/* Segmented bar — draggable */}
      <div
        ref={barRef}
        className="flex gap-[2px] h-3 cursor-pointer touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {Array.from({ length: totalBars }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 rounded-[2px] transition-all duration-100 ${i < filledBars ? '' : 'perps-lev-bar-empty'}`}
            style={{
              background: i < filledBars
                ? activeColor
                : darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              transform: i < filledBars ? 'scaleY(1)' : 'scaleY(0.7)',
              opacity: i < filledBars ? 1 : 1,
            }}
          />
        ))}
      </div>

      {/* Quick-select markers */}
      <div className="flex items-center justify-between">
        {markers.map((m) => (
          <button
            key={m}
            onClick={() => handleChange(m)}
            className={`px-1.5 py-0.5 rounded-[4px] text-[10px] font-semibold tabular-nums transition-all duration-150 cursor-pointer ${
              leverage === m
                ? 'text-white'
                : `perps-lev-marker ${darkMode ? 'text-white/45 hover:text-white/80' : 'text-[#9ca3af] hover:text-[#1a1a1a]'}`
            }`}
            style={{
              fontFamily: FONT,
              ...(leverage === m ? { background: activeColor } : {}),
            }}
          >
            {m}x
          </button>
        ))}
      </div>
    </div>
  );
}
