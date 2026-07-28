import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { usePaymentWallet } from '@/lib/hooks/use-payment-wallet';

/**
 * Custom hook for managing chat input state and behavior
 */
export function useChatInput() {
  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { paymentAddress, isReady: isWalletReady } = usePaymentWallet();

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 200);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, []);

  // File upload handling
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    const newFiles = Array.from(files);
    const totalFiles = attachedFiles.length + newFiles.length;

    if (totalFiles > 5) {
      toast.error('Maximum 5 files allowed');
      return;
    }

    setAttachedFiles(prev => [...prev, ...newFiles]);
  }, [attachedFiles.length]);

  const handleUploadClick = useCallback(() => {
    if (attachedFiles.length >= 5) {
      toast.error('Maximum 5 files already selected');
      return;
    }
    fileInputRef.current?.click();
  }, [attachedFiles.length]);

  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const clearInput = useCallback(() => {
    setInput('');
    setAttachedFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, []);

  return {
    // State
    input,
    attachedFiles,
    isWalletReady,
    paymentAddress,

    // Refs
    textareaRef,
    fileInputRef,

    // Handlers
    handleInputChange,
    handleFileUpload,
    handleUploadClick,
    handleRemoveAttachment,
    clearInput,
    setInput,
  };
}