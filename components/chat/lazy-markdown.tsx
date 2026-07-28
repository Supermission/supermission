'use client';

import dynamic from 'next/dynamic';
import type { ComponentType, ReactNode } from 'react';

export type LazyMarkdownProps = {
  children: string;
  components?: Record<string, unknown>;
};

/**
 * Shared dynamic-imported ReactMarkdown + remark-gfm wrapper.
 * Keeps react-markdown (~35KB) and remark-gfm (~5KB) out of the initial
 * chat bundle — they load only when the first markdown body renders.
 */
const LazyMarkdown: ComponentType<LazyMarkdownProps> = dynamic(
  () =>
    Promise.all([
      import('react-markdown'),
      import('remark-gfm'),
    ]).then(([mdMod, gfmMod]) => {
      const ReactMarkdown = mdMod.default;
      const remarkGfm = gfmMod.default;
      const Wrapper = ({ children, components }: LazyMarkdownProps): ReactNode => (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components as never}>
          {children}
        </ReactMarkdown>
      );
      Wrapper.displayName = 'LazyMarkdown';
      return { default: Wrapper };
    }),
  { ssr: false },
);

export default LazyMarkdown;
