'use client';

import { motion } from 'framer-motion';
import { BlogPost } from '@/lib/blog/types';
import { ArticleMetadata } from './article-metadata';

interface ArticleHeroProps {
  post: BlogPost;
}

export function ArticleHero({ post }: ArticleHeroProps) {
  return (
    <section className="border-b border-[#e5e7eb] bg-white py-12 sm:py-16">
      <div className="container mx-auto px-4 sm:px-6 md:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <ArticleMetadata post={post} />

            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[0.95] mb-6 text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
              {post.title}
            </h1>

            <div className="text-sm text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
              by <span className="text-[#3a3a3a] font-medium">{post.author}</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
