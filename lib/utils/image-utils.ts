/**
 * Image Utilities
 * Helper functions for image processing in the chat interface
 */

import { MessageAttachment } from '@/lib/store/chat';

// Maximum file size in bytes (5MB)
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

// Supported image MIME types
export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
];

/**
 * Convert a File object to base64 string
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Extract just the base64 data (remove data:image/xxx;base64, prefix)
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

/**
 * Convert a File to MessageAttachment
 */
export async function fileToAttachment(file: File): Promise<MessageAttachment> {
  const base64 = await fileToBase64(file);
  const isImage = file.type.startsWith('image/');

  return {
    type: isImage ? 'image' : 'document',
    name: file.name,
    mimeType: file.type,
    data: base64,
    size: file.size,
  };
}

/**
 * Convert multiple Files to MessageAttachments
 */
export async function filesToAttachments(files: File[]): Promise<MessageAttachment[]> {
  return Promise.all(files.map(fileToAttachment));
}

/**
 * Validate a base64 image string
 */
export function validateBase64Image(data: string): boolean {
  if (!data || typeof data !== 'string') return false;

  // Check if it's a valid base64 string (basic check)
  try {
    // Remove any data URL prefix if present
    const base64Data = data.includes(',') ? data.split(',')[1] : data;

    // Check if it's valid base64
    const decoded = atob(base64Data);

    // Check minimum size (images should have some content)
    if (decoded.length < 100) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a file is a valid image
 */
export function isValidImage(file: File): boolean {
  // Check MIME type
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
    return false;
  }

  // Check size
  if (file.size > MAX_IMAGE_SIZE) {
    return false;
  }

  return true;
}

/**
 * Get image dimensions from base64 string
 */
export function getImageDimensions(base64: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
  });
}

/**
 * Map chain name to chain ID
 * Used when extracting chain info from screenshots
 */
export function chainNameToId(name: string): string {
  const lower = name.toLowerCase().trim();

  const chainMap: Record<string, string> = {
    // Ethereum
    'ethereum': '1',
    'eth': '1',
    'mainnet': '1',
    'ethereum mainnet': '1',

    // Base
    'base': '8453',
    'base mainnet': '8453',

    // Polygon
    'polygon': '137',
    'matic': '137',
    'polygon mainnet': '137',

    // Arbitrum
    'arbitrum': '42161',
    'arb': '42161',
    'arbitrum one': '42161',

    // Optimism
    'optimism': '10',
    'op': '10',
    'op mainnet': '10',

    // BSC
    'bsc': '56',
    'binance': '56',
    'bnb': '56',
    'bnb smart chain': '56',
    'binance smart chain': '56',

    // Avalanche
    'avalanche': '43114',
    'avax': '43114',
    'avalanche c-chain': '43114',

    // Fantom
    'fantom': '250',
    'ftm': '250',

    // zkSync
    'zksync': '324',
    'zksync era': '324',

    // Linea
    'linea': '59144',

    // Solana (special case - not EVM but commonly seen)
    'solana': 'solana',
    'sol': 'solana',
  };

  return chainMap[lower] || '1'; // Default to Ethereum
}

/**
 * Map chain ID to chain name
 */
export function chainIdToName(chainId: string): string {
  const nameMap: Record<string, string> = {
    '1': 'Ethereum',
    '8453': 'Base',
    '137': 'Polygon',
    '42161': 'Arbitrum',
    '10': 'Optimism',
    '56': 'BSC',
    '43114': 'Avalanche',
    '250': 'Fantom',
    '324': 'zkSync Era',
    '59144': 'Linea',
    'solana': 'Solana',
  };

  return nameMap[chainId] || `Chain ${chainId}`;
}

/**
 * Get the full data URL from base64 and mime type
 */
export function getDataUrl(base64: string, mimeType: string): string {
  if (base64.startsWith('data:')) return base64;
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Compress an image to reduce size
 * Useful for very large images before sending to API
 */
export async function compressImage(
  base64: string,
  mimeType: string,
  maxWidth: number = 1920,
  quality: number = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Scale down if needed
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Get compressed base64
      const outputType = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
      const dataUrl = canvas.toDataURL(outputType, quality);
      const compressedBase64 = dataUrl.split(',')[1];

      resolve(compressedBase64);
    };
    img.onerror = reject;
    img.src = getDataUrl(base64, mimeType);
  });
}
