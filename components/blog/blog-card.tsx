'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { BlogPost } from '@/lib/blog/types';
import { calculateReadingTime, formatDate } from '@/lib/blog/utils';

interface BlogCardProps {
  post: BlogPost;
}

export function BlogCard({ post }: BlogCardProps) {
  const readingTime = calculateReadingTime(post.content);
  const formattedDate = formatDate(post.publishedAt);

  return (
    <Link href={`/blog/${post.slug}`}>
      <motion.article
        className="bg-white border border-[#e5e7eb] p-4 sm:p-6 h-full flex flex-col cursor-pointer rounded-[16px] transition-colors hover:border-[#d1d5db] hover:bg-[#fafbfc] dark:hover:border-white/25 dark:hover:bg-white/[0.04]"
        whileHover={{
          scale: 1.02,
          boxShadow: '0px 8px 24px 0px rgba(0,0,0,0.08)',
        }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="inline-block self-start bg-[#3a3a3a] text-white px-2.5 py-1 text-xs rounded-[6px] mb-4" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          {post.category}
        </div>

        <h2 className="font-bold text-lg sm:text-xl md:text-2xl tracking-tight leading-tight mb-4 text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          {post.title}
        </h2>

        <p className="text-xs sm:text-sm text-[#6b7280] leading-relaxed flex-1 mb-6" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          {post.excerpt}
        </p>

        <div className="border-t border-[#e5e7eb] pt-4">
          <span className="text-[11px] sm:text-xs text-[#9ca3af] font-mono">
            {formattedDate} &middot; {readingTime} min read
          </span>
        </div>
      </motion.article>
    </Link>
  );
}
