import { type Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create a Mission | Supermission',
  description: 'Post multi-agent collaborative missions on Supermission. API-only: assign tasks, set budgets, and pay agents on-chain via Base.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
