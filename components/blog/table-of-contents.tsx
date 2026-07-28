'use client';

import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { TableOfContentsItem } from '@/lib/blog/types';

interface TableOfContentsProps {
  items: TableOfContentsItem[];
}

export function TableOfContents({ items }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>('');
  const placeholderRef = useRef<HTMLDivElement>(null);
  const [leftPos, setLeftPos] = useState<number | null>(null);
  const [footerVisible, setFooterVisible] = useState(false);
  const [pastHero, setPastHero] = useState(false);

  // Track the placeholder's left position and whether we've scrolled past the hero
  useEffect(() => {
    const update = () => {
      if (placeholderRef.current) {
        const rect = placeholderRef.current.getBoundingClientRect();
        setLeftPos(rect.left);
        // Show TOC only when the placeholder (content section) has reached the fixed position
        setPastHero(rect.top <= 96); // 96px = top-24 (6rem)
      }
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
    };
  }, []);

  // Hide TOC when footer is visible
  useEffect(() => {
    const footer = document.querySelector('footer');
    if (!footer) return;
    const observer = new IntersectionObserver(
      ([entry]) => setFooterVisible(entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-80px 0px -80% 0px',
        threshold: 0,
      }
    );

    items.forEach((item) => {
      const element = document.getElementById(item.id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [items]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 100;
      const top = element.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  if (items.length === 0) return null;

  return (
    <>
      {/* Placeholder to reserve space in the flex layout */}
      <div ref={placeholderRef} className="hidden lg:block w-64 shrink-0" />

      {/* Fixed TOC */}
      {leftPos !== null && (
        <nav
          className={`hidden lg:block fixed top-24 w-64 z-40 max-h-[calc(100vh-8rem)] overflow-y-auto transition-opacity duration-300 ${(!pastHero || footerVisible) ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          style={{ left: leftPos }}
        >
          <div className="border border-[#e5e7eb] bg-white p-4 rounded-[12px] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.04)]">
            <div className="text-xs font-semibold text-[#6b7280] mb-4 pb-2 border-b border-[#e5e7eb]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
              Contents
            </div>
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => scrollToSection(item.id)}
                    className={`block w-full text-left text-xs leading-relaxed transition-all duration-200 ${
                      item.level === 3 ? 'pl-4' : ''
                    } ${
                      activeId === item.id
                        ? 'text-[#3a3a3a] font-semibold'
                        : 'text-[#9ca3af] hover:text-[#3a3a3a]'
                    }`}
                    style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                  >
                    <span className="flex items-start gap-2">
                      {activeId === item.id && (
                        <motion.span
                          layoutId="toc-indicator"
                          className="inline-block w-1.5 h-1.5 bg-[#3a3a3a] rounded-full mt-1.5 shrink-0"
                        />
                      )}
                      <span className={activeId === item.id ? '' : 'pl-3.5'}>
                        {item.title}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      )}
    </>
  );
}
