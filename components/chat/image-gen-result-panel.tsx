'use client';

import { ImageGenResponse } from '@/lib/new-agents/imageGeneration/types';
import React, { useState } from 'react';
import Image from 'next/image';
import { useChatStore } from '@/lib/store/chat';
import { toast } from 'sonner';

interface ImageGenResultPanelProps {
  data: ImageGenResponse | null;
}

export function ImageGenResultPanel({ data }: ImageGenResultPanelProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const addMessage = useChatStore((state) => state.addMessage);

  if (!data) return null;

  const image = data.primaryImage;

  const handleDownload = async () => {
    try {
      if (image.url.startsWith('data:')) {
        const link = document.createElement('a');
        link.href = image.url;
        link.download = `superimagen-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      const response = await fetch(image.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `superimagen-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
    } catch (err) {
      window.open(image.url, '_blank');
    }
  };

  // Handle follow-up actions - adds assistant message with action card
  const handleActionClick = (actionType: 'variation' | 'style' | 'quality') => {
    const actionMessages = {
      variation: "I'd like to help you create a variation. Choose your options:",
      style: "Let's transform this into a new style. Pick one:",
      quality: "Ready to enhance quality. Select your settings:",
    };

    const actionTypes = {
      variation: 'image_variation_options',
      style: 'image_style_options',
      quality: 'image_quality_options',
    };

    // Add assistant message with action card
    addMessage({
      role: 'assistant',
      content: actionMessages[actionType],
      metadata: {
        action: {
          type: actionTypes[actionType],
          data: data as unknown as Record<string, unknown>,
        },
      },
    });
  };

  return (
    <div className="max-w-sm bg-white border border-[#e5e7eb] rounded-[16px] overflow-hidden font-sans">
      {/* Header */}
      <div className="p-3 border-b border-[#e5e7eb] bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#3a3a3a] rounded-[6px] flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="font-bold text-[#3a3a3a] tracking-tight text-xs">SuperImageGen</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold bg-green-700 text-white px-2 py-0.5 rounded-[4px]">
              {data.cost} $USDC
            </span>
            <button
              onClick={() => setShowInfo(!showInfo)}
              className={`w-6 h-6 flex items-center justify-center border border-[#e5e7eb] rounded-[6px] transition-colors ${showInfo ? 'bg-[#3a3a3a] text-white' : 'bg-white text-[#3a3a3a] hover:bg-[#f7f7f7]'}`}
              title="View details"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Image Display */}
      <div className="relative aspect-square bg-[#f8fafc] overflow-hidden">
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white">
            <div className="w-10 h-10 border-2 border-[#e5e7eb] border-t-[#3a3a3a] rounded-full animate-spin mb-3" />
            <span className="text-[10px] font-bold text-black/50">Loading image...</span>
          </div>
        )}
        {imageError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white">
            <svg className="w-8 h-8 text-red-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-[10px] font-bold text-black/70">Failed to load</span>
            <a href={image.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-700 hover:underline mt-1">
              Open directly
            </a>
          </div>
        )}
        <Image
          src={image.url}
          alt={data.metadata.originalPrompt}
          fill
          className={`object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          unoptimized
        />
      </div>

      {/* Info Panel */}
      {showInfo && (
        <div className="border-t border-[#e5e7eb] p-3 space-y-2 bg-[#f8fafc]">
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="flex justify-between">
              <span className="text-black/50">Model</span>
              <span className="font-bold font-mono">{image.model.replace('gemini-', '').replace('-preview', '').toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-black/50">Size</span>
              <span className="font-bold font-mono">{image.width}x{image.height}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-black/50">Style</span>
              <span className="font-bold">{data.analysis.detectedStyle}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-black/50">Time</span>
              <span className="font-bold font-mono">{(image.generationTime / 1000).toFixed(1)}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-black/50">Enhanced</span>
              <span className="font-bold">{data.metadata.wasEnhanced ? 'YES' : 'NO'}</span>
            </div>
            {image.ipfsHash && (
              <div className="flex justify-between">
                <span className="text-black/50">IPFS</span>
                <a href={image.ipfsUrl} target="_blank" rel="noopener noreferrer" className="font-bold font-mono text-blue-700 hover:underline">
                  {image.ipfsHash.slice(0, 8)}...
                </a>
              </div>
            )}
          </div>
          <div className="pt-2 border-t border-[#e5e7eb]">
            <div className="text-[9px] text-black/50 mb-1">Prompt</div>
            <p className="text-[10px] text-black/70 leading-snug line-clamp-2">{data.metadata.originalPrompt}</p>
          </div>
        </div>
      )}

      {/* Download Button */}
      <button
        onClick={handleDownload}
        className="w-full flex items-center justify-center gap-2 py-3 bg-[#3a3a3a] text-white text-xs font-bold hover:bg-[#3a3a3a]/90 transition-colors border-t border-[#e5e7eb]"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Download Image
      </button>

      {/* Follow-up Actions */}
      <div className="border-t border-[#e5e7eb] p-3 bg-white">
        <div className="text-[9px] text-black/50 mb-2">What's next?</div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => handleActionClick('variation')}
            className="text-[9px] px-2 py-1 border border-[#e5e7eb] rounded-[6px] text-black/70 hover:bg-[#f7f7f7] cursor-pointer transition-colors font-bold"
          >
            Generate variation
          </button>
          <button
            onClick={() => handleActionClick('style')}
            className="text-[9px] px-2 py-1 border border-[#e5e7eb] rounded-[6px] text-black/70 hover:bg-[#f7f7f7] cursor-pointer transition-colors font-bold"
          >
            Different style
          </button>
          <button
            onClick={() => handleActionClick('quality')}
            className="text-[9px] px-2 py-1 border border-[#e5e7eb] rounded-[6px] text-black/70 hover:bg-[#f7f7f7] cursor-pointer transition-colors font-bold"
          >
            Higher quality
          </button>
        </div>
      </div>
    </div>
  );
}

// Skeleton component for loading state
export function ImageGenSkeleton() {
  return (
    <div className="max-w-sm bg-white border border-[#e5e7eb] rounded-[16px] overflow-hidden font-sans">
      <div className="p-3 border-b border-[#e5e7eb] bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-black/10 rounded-[6px] animate-pulse" />
            <div className="w-24 h-4 bg-black/10 rounded-[4px] animate-pulse" />
          </div>
          <div className="w-16 h-5 bg-black/10 rounded-[4px] animate-pulse" />
        </div>
      </div>
      <div className="relative aspect-square bg-[#f8fafc] overflow-hidden">
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-2 border-[#e5e7eb] border-t-[#3a3a3a] rounded-full animate-spin mb-3" />
          <span className="text-[10px] font-bold text-black/50">Generating image...</span>
          <div className="mt-4 flex gap-1">
            <div className="w-2 h-2 bg-black/30 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-black/30 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-black/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
      <div className="p-3 border-t border-[#e5e7eb]">
        <div className="w-full h-10 bg-black/10 rounded-[8px] animate-pulse" />
      </div>
    </div>
  );
}
