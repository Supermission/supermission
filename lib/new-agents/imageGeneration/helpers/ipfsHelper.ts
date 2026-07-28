/**
 * IPFS Helper for Image Generation
 * Handles uploading generated images to Pinata IPFS
 */

import { uploadFile, uploadJSON, getIPFSUrl } from '@/lib/ipfs/pinata';

export interface IPFSUploadResult {
  hash: string;
  url: string;
  metadataHash?: string;
  metadataUrl?: string;
}

export interface ImageMetadata {
  prompt: string;
  enhancedPrompt?: string;
  model: string;
  generatedAt: string;
  analysis?: unknown;
  width?: number;
  height?: number;
}

/**
 * Upload a base64 image to IPFS
 * @param base64DataUrl - The data URL (data:image/png;base64,...)
 * @param metadata - Optional metadata to store alongside
 * @returns IPFS hash and gateway URL
 */
export async function uploadBase64ToIPFS(
  base64DataUrl: string,
  metadata?: ImageMetadata
): Promise<IPFSUploadResult> {
  try {
    // Extract base64 data from data URL
    const matches = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid base64 data URL format');
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    // Convert base64 to Buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Determine file extension from mime type
    const extensions: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    const ext = extensions[mimeType] || 'png';

    // Generate filename
    const filename = `superimagen-${Date.now()}.${ext}`;

    // Upload image to IPFS
    const ipfsUri = await uploadFile(buffer, filename, false);
    const hash = ipfsUri.replace('ipfs://', '');
    const url = getIPFSUrl(hash);

    const result: IPFSUploadResult = {
      hash,
      url,
    };

    // Optionally upload metadata
    if (metadata) {
      const metadataWithImage = {
        ...metadata,
        image: ipfsUri,
        imageUrl: url,
        uploadedAt: new Date().toISOString(),
      };

      const metadataUri = await uploadJSON(
        metadataWithImage,
        `${filename}-metadata.json`,
        false
      );
      const metadataHash = metadataUri.replace('ipfs://', '');

      result.metadataHash = metadataHash;
      result.metadataUrl = getIPFSUrl(metadataHash);
    }

    console.log(`[IPFS] Uploaded image: ${url}`);
    return result;
  } catch (error) {
    console.error('[IPFS] Upload error:', error);
    throw error;
  }
}

/**
 * Get a publicly accessible URL from an IPFS hash
 */
export function getPublicIPFSUrl(hash: string): string {
  return getIPFSUrl(hash);
}
