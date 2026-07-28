import { Header } from '@/components/layout/header';
import { SiteThemeToggle } from '@/components/layout/SiteThemeToggle';
import { Footer } from '@/components/layout/footer';
import { BlogHero } from '@/components/blog/blog-hero';
import { BlogCard } from '@/components/blog/blog-card';
import { SiteThemeScope } from '@/components/layout/SiteThemeScope';
import { aiAgentsIdentityPost } from '@/content/blog/ai-agents-identity';
import { whyAgentsNeedInfrastructurePost } from '@/content/blog/why-agents-need-infrastructure';
import { oraclePredictionMarketsPost } from '@/content/blog/oracle-prediction-markets';
import { robinhoodChainGettingStartedPost } from '@/content/blog/robinhood-chain-getting-started';

export const metadata = {
  title: 'Blog | Supermission',
  description: 'Insights and updates on AI agents, decentralized infrastructure, and autonomous systems.',
};

const posts = [robinhoodChainGettingStartedPost, oraclePredictionMarketsPost, whyAgentsNeedInfrastructurePost, aiAgentsIdentityPost];

export default function BlogPage() {
  return (
    <SiteThemeScope>
      <div className="min-h-screen flex flex-col bg-white">
        <Header rightExtra={<SiteThemeToggle />} hideSettings />

        <main className="flex-1 pt-14 sm:pt-16">
          <BlogHero />

          <section className="py-8 sm:py-12 md:py-16">
            <div className="container mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
              <div className="max-w-6xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  {posts.map((post) => (
                    <BlogCard key={post.slug} post={post} />
                  ))}
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
