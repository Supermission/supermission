/**
 * Pinata IPFS Upload Utility
 * Upload JSON metadata and files to IPFS via Pinata
 * Supports both JWT and API key authentication
 */

import axios from 'axios';
import FormData from 'form-data';

const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_API_SECRET = process.env.PINATA_API_SECRET || process.env.PINATA_SECRET_KEY;
const PINATA_JWT = process.env.PINATA_JWT;

if (!PINATA_JWT && (!PINATA_API_KEY || !PINATA_API_SECRET)) {
  console.warn('Pinata credentials not configured. IPFS uploads will fail.');
}

/**
 * Get authentication headers for Pinata API
 */
function getAuthHeaders(): Record<string, string> {
  if (PINATA_JWT) {
    return { Authorization: `Bearer ${PINATA_JWT}` };
  }
  if (PINATA_API_KEY && PINATA_API_SECRET) {
    return {
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_API_SECRET,
    };
  }
  throw new Error('Pinata credentials not configured');
}

/**
 * Upload JSON metadata to IPFS
 * @param data - JSON object to upload
 * @param name - Optional name for the JSON file
 * @param returnFullUri - Return full gateway URL instead of ipfs:// URI (default: false)
 * @returns IPFS hash as ipfs://hash or https://gateway.pinata.cloud/ipfs/hash
 */
export async function uploadJSON(
  data: unknown,
  name?: string,
  returnFullUri = false
): Promise<string> {
  try {
    const response = await axios.post(
      'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      {
        pinataContent: data,
        pinataMetadata: name ? { name } : undefined,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      }
    );

    const hash = response.data.IpfsHash;
    return returnFullUri ? getIPFSUrl(hash) : `ipfs://${hash}`;
  } catch (error) {
    console.error('IPFS JSON upload error:', error);
    throw error;
  }
}

/**
 * Upload file buffer to IPFS (server-side)
 * @param buffer - File contents as Buffer
 * @param filename - Name for the file on IPFS
 * @param returnFullUri - Return full gateway URL instead of ipfs:// URI (default: false)
 * @returns IPFS hash as ipfs://hash or https://gateway.pinata.cloud/ipfs/hash
 */
export async function uploadFile(
  buffer: Buffer,
  filename: string,
  returnFullUri = false
): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('file', buffer, filename);

    const response = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          ...getAuthHeaders(),
        },
      }
    );

    const hash = response.data.IpfsHash;
    return returnFullUri ? getIPFSUrl(hash) : `ipfs://${hash}`;
  } catch (error) {
    console.error('IPFS file upload error:', error);
    throw error;
  }
}

/**
 * Get full IPFS gateway URL from hash
 * @param ipfsHash - IPFS content hash (with or without ipfs:// prefix)
 * @param gateway - Gateway URL (defaults to Pinata)
 * @returns Full gateway URL
 */
export function getIPFSUrl(ipfsHash: string, gateway = 'https://gateway.pinata.cloud'): string {
  const hash = ipfsHash.replace('ipfs://', '');
  return `${gateway}/ipfs/${hash}`;
}

/**
 * Unpin content from IPFS (cleanup)
 */
export async function unpinContent(ipfsHash: string): Promise<void> {
  try {
    // Remove ipfs:// prefix if present
    const hash = ipfsHash.replace('ipfs://', '');

    const response = await fetch(`https://api.pinata.cloud/pinning/unpin/${hash}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.warn(`Pinata unpin failed: ${error}`);
    }
  } catch (error) {
    console.error('IPFS unpin error:', error);
  }
}

/**
 * Get pinned content metadata
 */
export async function getPinnedContent(ipfsHash: string): Promise<unknown> {
  try {
    const hash = ipfsHash.replace('ipfs://', '');

    const response = await fetch(`https://api.pinata.cloud/data/pinList?hashContains=${hash}`, {
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch pinned content');
    }

    const result = await response.json();
    return result.rows[0];
  } catch (error) {
    console.error('IPFS get pinned content error:', error);
    throw error;
  }
}
