import { Metadata } from 'next';
import EventViewClient from './EventViewClient';

export const dynamic = 'force-dynamic';


export const metadata: Metadata = {
  title: 'Event Detail | SUPERMISSION',
  description:
    'Track prediction market events with sub-market analysis, live pricing, and aggregate statistics.',
  openGraph: {
    title: 'Event Detail | SUPERMISSION',
    description:
      'Prediction market event tracker with live sub-market data and AI analysis.',
  },
};

export default function EventDetailPage() {
  return <EventViewClient />;
}
