import type { Metadata } from 'next';
import GalleryContent from './gallery-content';

export const metadata: Metadata = {
  title: 'PnL Card Gallery (internal) | Supermission',
  description: 'Internal visual index of every PnL card variation.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function PnLCardGalleryPage() {
  return <GalleryContent />;
}
