import { Metadata } from 'next';
import DashboardClient from './DashboardClient';

export const metadata: Metadata = {
  title: 'Dashboard | Supermission',
  description: 'DeFi portfolio analytics and AI-powered insights',
};

export default function DashboardPage() {
  return <DashboardClient />;
}
