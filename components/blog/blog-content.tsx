'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { slugify } from '@/lib/blog/utils';

interface BlogContentProps {
  content: string;
}

export function BlogContent({ content }: BlogContentProps) {
  const renderedContent = useMemo(() => {
    return parseMarkdown(content);
  }, [content]);

  return (
    <motion.article
      className="prose prose-lg max-w-none"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="blog-content">{renderedContent}</div>
    </motion.article>
  );
}

function parseMarkdown(content: string): React.ReactNode[] {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let currentParagraph: string[] = [];
  let inList = false;
  let listItems: string[] = [];
  let key = 0;

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      const text = currentParagraph.join(' ').trim();
      if (text) {
        elements.push(
          <p
            key={key++}
            className="text-sm sm:text-base leading-relaxed text-[#48484b] mb-6"
            style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            dangerouslySetInnerHTML={{ __html: parseInlineMarkdown(text) }}
          />
        );
      }
      currentParagraph = [];
    }
  };

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} className="list-none space-y-3 mb-6 pl-0">
          {listItems.map((item, i) => (
            <li
              key={i}
              className="text-sm sm:text-base leading-relaxed text-[#48484b] flex items-start gap-3"
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            >
              <span className="inline-block w-1.5 h-1.5 bg-[#3a3a3a] rounded-full mt-2.5 shrink-0" />
              <span dangerouslySetInnerHTML={{ __html: parseInlineMarkdown(item) }} />
            </li>
          ))}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Heading 2
    if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      const text = line.slice(3).trim();
      const id = slugify(text);
      elements.push(
        <h2
          key={key++}
          id={id}
          className="text-2xl sm:text-3xl font-bold tracking-tight mt-12 mb-6 scroll-mt-24 text-[#3a3a3a]"
          style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
        >
          {text}
        </h2>
      );
      continue;
    }

    // Heading 3
    if (line.startsWith('### ')) {
      flushParagraph();
      flushList();
      const text = line.slice(4).trim();
      const id = slugify(text);
      elements.push(
        <h3
          key={key++}
          id={id}
          className="text-xl sm:text-2xl font-semibold tracking-tight mt-8 mb-4 scroll-mt-24 text-[#3a3a3a]"
          style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
        >
          {text}
        </h3>
      );
      continue;
    }

    // Image
    if (line.startsWith('![')) {
      flushParagraph();
      flushList();
      const match = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
      if (match) {
        const alt = match[1];
        const src = match[2];
        elements.push(
          <figure key={key++} className="my-8">
            <div className="overflow-hidden rounded-[12px] max-w-sm mx-auto">
              <Image
                src={src}
                alt={alt}
                width={400}
                height={225}
                className="w-full h-auto"
              />
            </div>
            {alt && (
              <figcaption className="text-xs text-[#9ca3af] mt-2 text-center" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                {alt}
              </figcaption>
            )}
          </figure>
        );
      }
      continue;
    }

    // YouTube embed: [youtube:VIDEO_ID]
    const ytMatch = line.trim().match(/^\[youtube:([a-zA-Z0-9_-]+)\]$/);
    if (ytMatch) {
      flushParagraph();
      flushList();
      elements.push(
        <figure key={key++} className="my-10">
          <div className="overflow-hidden rounded-[12px] w-full" style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
            <iframe
              src={`https://www.youtube.com/embed/${ytMatch[1]}?rel=0&modestbranding=1`}
              title="Supermission Demo"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
            />
          </div>
        </figure>
      );
      continue;
    }

    // Horizontal rule
    if (line.trim() === '---' || line.trim() === '***') {
      flushParagraph();
      flushList();
      elements.push(
        <hr key={key++} className="border-t border-[#e5e7eb] my-12" />
      );
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      flushParagraph();
      flushList();
      const text = line.slice(2).trim();
      elements.push(
        <blockquote
          key={key++}
          className="border-l-4 border-[#e5e7eb] pl-6 py-2 my-8 bg-[#f8fafc] rounded-r-[8px]"
        >
          <p
            className="text-sm sm:text-base italic text-[#6b7280]"
            style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            dangerouslySetInnerHTML={{ __html: parseInlineMarkdown(text) }}
          />
        </blockquote>
      );
      continue;
    }

    // List item
    if (line.startsWith('- ') || line.startsWith('* ')) {
      flushParagraph();
      if (!inList) {
        inList = true;
      }
      listItems.push(line.slice(2).trim());
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }

    // Regular text
    if (inList) {
      flushList();
    }
    currentParagraph.push(line);
  }

  flushParagraph();
  flushList();

  return elements;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseInlineMarkdown(text: string): string {
  // Escape HTML entities first to prevent XSS
  text = escapeHtml(text);
  // Bold
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-[#3a3a3a]">$1</strong>');
  // Italic
  text = text.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');
  // Code
  text = text.replace(/`([^`]+)`/g, '<code class="bg-[#f8fafc] border border-[#e5e7eb] px-1.5 py-0.5 font-mono text-sm rounded-[4px]">$1</code>');
  // Links - validate href to prevent javascript: URLs
  text = text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, linkText, href) => {
      const safeHref = /^https?:\/\//i.test(href) ? href : '#';
      return `<a href="${safeHref}" class="text-[#3a3a3a] underline underline-offset-4 hover:text-[#6b7280] transition-colors" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
    }
  );

  return text;
}
