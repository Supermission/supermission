import { ChatSkeleton } from '@/components/shared/ChatSkeleton';

export default function Loading() {
  // Rendered inside DefaiLayout's <main>, so it inherits the .dark theme scope.
  return <ChatSkeleton className="h-full" />;
}
