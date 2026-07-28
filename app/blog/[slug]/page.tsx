import { notFound } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { SiteThemeToggle } from '@/components/layout/SiteThemeToggle';
import { Footer } from '@/components/layout/footer';
import { ReadingProgress } from '@/components/blog/reading-progress';
import { ArticleHero } from '@/components/blog/article-hero';
import { BlogContent } from '@/components/blog/blog-content';
import { TableOfContents } from '@/components/blog/table-of-contents';
import { aiAgentsIdentityPost } from '@/content/blog/ai-agents-identity';
import { whyAgentsNeedInfrastructurePost } from '@/content/blog/why-agents-need-infrastructure';
import { oraclePredictionMarketsPost } from '@/content/blog/oracle-prediction-markets';
import { robinhoodChainGettingStartedPost } from '@/content/blog/robinhood-chain-getting-started';
import { extractHeadings } from '@/lib/blog/utils';
import { BlogPost } from '@/lib/blog/types';
import { SiteThemeScope } from '@/components/layout/SiteThemeScope';

const posts: Record<string, BlogPost> = {
  'ai-agents-identity': aiAgentsIdentityPost,
  'why-agents-need-infrastructure': whyAgentsNeedInfrastructurePost,
  'oracle-prediction-markets': oraclePredictionMarketsPost,
  'robinhood-chain-getting-started': robinhoodChainGettingStartedPost,
};

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = posts[slug];

  if (!post) {
    return {
      title: 'Post Not Found | Supermission',
    };
  }

  return {
    title: `${post.title} | Supermission Blog`,
    description: post.excerpt,
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.excerpt,
      url: `https://supermission.fun/blog/${slug}`,
      siteName: 'SUPERMISSION',
      publishedTime: post.publishedAt,
      ...(post.updatedAt ? { modifiedTime: post.updatedAt } : {}),
      authors: [post.author],
      ...(post.coverImage ? { images: [{ url: post.coverImage, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
    },
    alternates: {
      canonical: `https://supermission.fun/blog/${slug}`,
    },
  };
}

export function generateStaticParams() {
  return Object.keys(posts).map((slug) => ({
    slug,
  }));
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const post = posts[slug];

  if (!post) {
    notFound();
  }

  const headings = extractHeadings(post.content);

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    author: { '@type': 'Person', name: post.author || 'SUPERMISSION' },
    publisher: {
      '@type': 'Organization',
      name: 'SUPERMISSION',
      logo: { '@type': 'ImageObject', url: 'https://supermission.fun/metatag.jpg' },
    },
    datePublished: post.publishedAt,
    ...(post.updatedAt ? { dateModified: post.updatedAt } : {}),
    mainEntityOfPage: { '@type': 'WebPage', '@id': `https://supermission.fun/blog/${slug}` },
    ...(post.coverImage ? { image: post.coverImage } : {}),
    ...(post.tags ? { keywords: post.tags.join(', ') } : {}),
  };

  return (
    <SiteThemeScope>
      <div className="min-h-screen flex flex-col bg-white">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
        />
        <ReadingProgress />
        <Header rightExtra={<SiteThemeToggle />} hideSettings />

        <main className="flex-1 pt-14 sm:pt-16">
          <ArticleHero post={post} />

          <section className="py-12 sm:py-16">
            <div className="container mx-auto px-4 sm:px-6 md:px-8">
              <div className="max-w-6xl mx-auto">
                <div className="flex gap-12 items-start">
                  <TableOfContents items={headings} />

                  <div className="flex-1 min-w-0 max-w-3xl">
                    <BlogContent content={post.content} />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <Footer />
        </main>
      </div>
    </SiteThemeScope>
  );
}
