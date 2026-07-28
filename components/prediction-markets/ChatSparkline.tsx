'use client';

import { useEffect, useRef, useState } from 'react';

interface ChatSparklineProps {
  conditionId: string;
  tokenId: string;
  width?: number;
  height?: number;
}

/**
 * Lightweight canvas sparkline for chat market cards.
 * Fetches 1D price history and renders a minimal area chart.
 */
export function ChatSparkline({ conditionId, tokenId, width = 120, height = 40 }: ChatSparklineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<{ t: number; p: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const res = await fetch(`/api/markets/${conditionId}/history?tokenId=${tokenId}&timeframe=1D`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.history?.length > 0) {
          setData(json.history);
        }
      } catch {
        // silent fail — sparkline is cosmetic
      }
    }
    if (conditionId && tokenId) fetchData();
    return () => { cancelled = true; };
  }, [conditionId, tokenId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const prices = data.map(d => d.p);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = maxP - minP || 0.01;
    const pad = 2;

    const toX = (i: number) => (i / (data.length - 1)) * width;
    const toY = (p: number) => pad + (1 - (p - minP) / range) * (height - pad * 2);

    const isUp = data[data.length - 1].p >= data[0].p;
    const color = isUp ? '#15803d' : '#b91c1c';

    // Area fill
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(data[0].p));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(toX(i), toY(data[i].p));
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, isUp ? 'rgba(21,128,61,0.12)' : 'rgba(185,28,28,0.12)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(data[0].p));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(toX(i), toY(data[i].p));
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // End dot
    ctx.beginPath();
    ctx.arc(toX(data.length - 1), toY(data[data.length - 1].p), 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }, [data, width, height]);

  if (data.length < 2) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="block"
    />
  );
}
