import { useRef, useCallback } from 'react';
import { toast } from 'sonner';

const LOADING_MESSAGES = [
  'Waking the agents up...',
  'Sending them USDC...',
  'Brewing some coffee...',
  'Connecting the dots...',
  'Thinking really hard...',
  'Consulting the blockchain...',
  'Herding digital cats...',
  'Spinning up the hamster wheel...',
  'Asking nicely...',
  'Processing your request...',
];

const TOAST_ID = 'loading-toast';
const MESSAGE_INTERVAL = 2000; // Change message every 2 seconds

export function useLoadingToast() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const messageIndexRef = useRef(0);

  const startLoading = useCallback((initialMessage?: string) => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Reset message index
    messageIndexRef.current = 0;

    // Show initial toast
    const firstMessage = initialMessage || LOADING_MESSAGES[0];
    toast.loading(firstMessage, { id: TOAST_ID });

    // Start rotating messages
    intervalRef.current = setInterval(() => {
      messageIndexRef.current = (messageIndexRef.current + 1) % LOADING_MESSAGES.length;
      toast.loading(LOADING_MESSAGES[messageIndexRef.current], { id: TOAST_ID });
    }, MESSAGE_INTERVAL);
  }, []);

  const stopLoading = useCallback((successMessage?: string, isError = false) => {
    // Clear interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Dismiss or show final message
    if (successMessage) {
      if (isError) {
        toast.error(successMessage, { id: TOAST_ID });
      } else {
        toast.success(successMessage, { id: TOAST_ID });
      }
    } else {
      toast.dismiss(TOAST_ID);
    }
  }, []);

  const dismissLoading = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    toast.dismiss(TOAST_ID);
  }, []);

  return {
    startLoading,
    stopLoading,
    dismissLoading,
  };
}
