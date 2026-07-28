'use client';

import { useParams, useRouter } from 'next/navigation';
import { EventView } from '@/components/markets/EventView';

export default function EventViewClient() {
  const params = useParams<{ eventId: string }>();
  const router = useRouter();
  const eventId = params?.eventId;

  if (!eventId) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500 text-sm font-mono">
          No event ID provided
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top bar */}
      <div className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-xs font-mono text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-600 rounded px-2.5 py-1 transition-all"
          >
            &larr; Back
          </button>
          <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
            Event Series Tracker
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6">
        <EventView eventId={eventId} />
      </div>
    </div>
  );
}
