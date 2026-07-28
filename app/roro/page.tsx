import { Metadata } from 'next';
import RoroClient from './RoroClient';

export const metadata: Metadata = {
  title: 'RORO | Supermission',
  description: 'AI stocks & options agent — research, analyze, and trade US equities via Robinhood.',
};

export default function RoroPage() {
  return <RoroClient />;
}
