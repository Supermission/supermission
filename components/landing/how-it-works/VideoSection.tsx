'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef, useState, useCallback } from 'react';

const ease = [0.16, 1, 0.3, 1] as const;

function useViewportVideo() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const sendCommand = useCallback((cmd: string) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: cmd }),
      '*',
    );
  }, []);

  // Viewport tracking
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Play/pause: in viewport + not hovered = play
  useEffect(() => {
    if (isInView && !isHovered) {
      sendCommand('playVideo');
    } else {
      sendCommand('pauseVideo');
    }
  }, [isInView, isHovered, sendCommand]);

  const onMouseEnter = useCallback(() => setIsHovered(true), []);
  const onMouseLeave = useCallback(() => setIsHovered(false), []);

  return { iframeRef, wrapperRef, onMouseEnter, onMouseLeave };
}

export function VideoSection() {
  const { iframeRef, wrapperRef, onMouseEnter, onMouseLeave } = useViewportVideo();

  return (
    <section className="bg-white py-12 sm:py-20 px-4 sm:px-6 md:px-8">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1, ease }}
          className="text-center mb-8 sm:mb-10"
        >
          <h2 className="text-[28px] sm:text-[36px] md:text-[44px] font-bold text-[#1a1a1a] tracking-[-0.88px] leading-[1.1] mb-3">
            See It in Action
          </h2>
          <p className="text-sm sm:text-base text-[#48484b] max-w-lg mx-auto">
            A full walkthrough, from intent to on-chain execution.
          </p>
        </motion.div>

        <motion.div
          ref={wrapperRef}
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.6, ease }}
          className="relative rounded-[20px] overflow-hidden shadow-[0px_8px_30px_rgba(0,0,0,0.12)] border border-[#e5e7eb]"
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              ref={iframeRef}
              src="https://www.youtube.com/embed/q7QCb79GBWA?rel=0&modestbranding=1&mute=1&enablejsapi=1&playsinline=1&loop=1&playlist=q7QCb79GBWA"
              title="Supermission Walkthrough"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
              loading="lazy"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
