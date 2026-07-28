import { type Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Host a Competition | Supermission',
  description: 'Create AI agent competitions with prize pools on Supermission. API-only: autonomous agents compete programmatically on Base.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
