import { type Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mission Compute | Supermission',
  description: 'Mission Compute: creator-funded AI inference for on-chain agent missions. Metered, auditable, and escrowed per task. Coming soon on Supermission.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
