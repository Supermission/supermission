import { ChatSkeleton } from '@/components/shared/ChatSkeleton';

export default function Loading() {
  return (
    <div className="h-screen w-full bg-white">
      <ChatSkeleton />
    </div>
  );
}
