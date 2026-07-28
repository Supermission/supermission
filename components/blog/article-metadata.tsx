import { BlogPost } from '@/lib/blog/types';
import { calculateReadingTime, formatDate } from '@/lib/blog/utils';

interface ArticleMetadataProps {
  post: BlogPost;
}

export function ArticleMetadata({ post }: ArticleMetadataProps) {
  const readingTime = calculateReadingTime(post.content);
  const formattedDate = formatDate(post.publishedAt);

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <span className="bg-[#3a3a3a] text-white px-3 py-1 text-xs rounded-[6px]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
        {post.category}
      </span>
      <span className="text-xs text-[#9ca3af] font-mono">
        {readingTime} min read
      </span>
      <span className="text-xs text-[#9ca3af] font-mono">
        {formattedDate}
      </span>
    </div>
  );
}
