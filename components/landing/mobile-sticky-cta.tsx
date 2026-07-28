'use client';

import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { motion, useScroll } from 'framer-motion';
import { useEffect, useState } from 'react';

export function MobileStickyCTA() {
  const router = useRouter();
  const { scrollY } = useScroll();
  const [isVisible, setIsVisible] = useState(false);

  // Show sticky CTA after user scrolls past hero section (typically around 800px)
  useEffect(() => {
    const unsubscribe = scrollY.on('change', (latest) => {
      setIsVisible(latest > 800);
    });
    return () => unsubscribe();
  }, [scrollY]);

  if (!isVisible) return null;

  return (
    <motion.div
      className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-black p-4 z-50 md:hidden"
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="flex gap-3">
        <Button
          size="lg"
          onClick={() => router.push('/defai')}
          className="flex-1"
        >
          DEPLOY MISSION
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => router.push('/dashboard')}
          className="flex-1"
        >
          VIEW MISSIONS
        </Button>
      </div>
    </motion.div>
  );
}
