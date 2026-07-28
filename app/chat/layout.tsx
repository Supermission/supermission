import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DeFi Terminal | SUPERMISSION',
  description: 'Chat with DELPHI to swap, lend, earn yield, and trade prediction markets on Base.',
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
