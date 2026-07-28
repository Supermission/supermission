'use client';

import { Header } from '@/components/layout/header';

export default function AgentProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />
      <main className="flex-1 pt-16 sm:pt-[72px] px-4 sm:px-6 md:px-8">
        {children}
      </main>
    </div>
  );
}
