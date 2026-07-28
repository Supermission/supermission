import { Metadata } from 'next';
import DefaiClient from './DefaiClient';

export const metadata: Metadata = {
  title: 'DeFAI | Supermission',
  description: 'AI-powered DeFi agent: swaps, yields, lending, portfolio analysis',
};

export default function DefaiPage() {
  return <DefaiClient />;
}
