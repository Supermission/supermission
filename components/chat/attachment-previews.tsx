'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';

interface AttachmentPreviewsProps {
  files: File[];
  onRemove: (index: number) => void;
}

// Generate preview URL for a file
function useFilePreview(file: File): string | null {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file.type.startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  return previewUrl;
}

// Individual attachment preview component
function AttachmentPreview({
  file,
  index,
  onRemove,
}: {
  file: File;
  index: number;
  onRemove: (index: number) => void;
}) {
  const previewUrl = useFilePreview(file);
  const isImage = file.type.startsWith('image/');

  // Format file size
  const fileSize = useMemo(() => {
    const bytes = file.size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, [file.size]);

  if (isImage && previewUrl) {
    // Image with thumbnail preview
    return (
      <div className="relative group">
        <div className="relative border border-[#e5e7eb] bg-black rounded-[12px] overflow-hidden">
          <Image
            src={previewUrl}
            alt={file.name}
            width={80}
            height={80}
            className="w-20 h-20 object-cover"
            unoptimized
          />
          {/* Overlay with file info */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-1">
            <span className="text-[8px] text-white truncate max-w-full px-1">{file.name}</span>
            <span className="text-[7px] text-white/70">{fileSize}</span>
          </div>
        </div>
        {/* Remove button */}
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center bg-white border border-[#e5e7eb] rounded-full text-[#3a3a3a] hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors text-xs font-bold"
          title="Remove"
        >
          ×
        </button>
      </div>
    );
  }

  // Non-image file (document)
  return (
    <div className="relative group">
      <div className="flex items-center gap-1.5 bg-[#f8fafc] text-[#3a3a3a] px-2.5 py-1.5 text-[10px] font-mono max-w-[180px] sm:max-w-[200px] border border-[#e5e7eb] rounded-[12px]">
        <svg
          className="w-3 h-3 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
          />
        </svg>
        <div className="flex-1 min-w-0">
          <span className="truncate block">{file.name}</span>
          <span className="text-[8px] text-[#6b7280]">{fileSize}</span>
        </div>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="ml-1 w-5 h-5 flex items-center justify-center bg-white border border-[#e5e7eb] rounded-full text-[#3a3a3a] hover:bg-red-500 hover:text-white transition-colors text-xs font-bold flex-shrink-0"
          title="Remove"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function AttachmentPreviews({ files, onRemove }: AttachmentPreviewsProps) {
  if (files.length === 0) return null;

  const hasImages = files.some(f => f.type.startsWith('image/'));

  return (
    <div className={`flex flex-wrap gap-2 mb-3 p-2 ${hasImages ? 'bg-white/50' : 'bg-gray-100 sm:bg-transparent'} border border-[#e5e7eb] rounded-[12px]`}>
      {files.map((file, index) => (
        <AttachmentPreview
          key={`${file.name}-${index}-${file.lastModified}`}
          file={file}
          index={index}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
