/**
 * Pinata IPFS Client
 * Upload files and JSON to IPFS via Pinata
 */

import axios from 'axios';

// ============================================================================
// TYPES
// ============================================================================

export interface PinataUploadResponse {
  ipfsHash: string;
  url: string;
  size?: number;
  timestamp: string;
}

export interface PinataFileMetadata {
  name?: string;
  keyvalues?: Record<string, string>;
}

// ============================================================================
// PINATA CLIENT
// ============================================================================

export class PinataClient {
  private jwt: string;
  private gatewayUrl: string;

  constructor(config?: { jwt?: string; gatewayUrl?: string }) {
    this.jwt = config?.jwt || process.env.PINATA_JWT || '';
    this.gatewayUrl = config?.gatewayUrl || 'https://gateway.pinata.cloud';

    if (!this.jwt) {
      throw new Error('PINATA_JWT environment variable is required');
    }
  }

  /**
   * Upload file to IPFS
   */
  async uploadFile(
    file: File | Buffer,
    metadata?: PinataFileMetadata
  ): Promise<PinataUploadResponse> {
    try {
      const formData = new FormData();

      // Add file to form data
      if (file instanceof Buffer) {
        const blob = new Blob([new Uint8Array(file)]);
        formData.append('file', blob, metadata?.name || 'file');
      } else if (file instanceof File) {
        formData.append('file', file);
      } else {
        throw new Error('Invalid file type');
      }

      // Add metadata if provided
      if (metadata) {
        const pinataMetadata = {
          name: metadata.name,
          keyvalues: metadata.keyvalues,
        };
        formData.append('pinataMetadata', JSON.stringify(pinataMetadata));
      }

      const response = await axios.post(
        'https://api.pinata.cloud/pinning/pinFileToIPFS',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${this.jwt}`,
            'Content-Type': 'multipart/form-data',
          },
          maxBodyLength: Infinity,
        }
      );

      return {
        ipfsHash: response.data.IpfsHash,
        url: `${this.gatewayUrl}/ipfs/${response.data.IpfsHash}`,
        size: response.data.PinSize,
        timestamp: response.data.Timestamp,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Pinata file upload failed: ${error.response?.data?.error || error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Upload JSON to IPFS
   */
  async uploadJSON(
    json: object,
    metadata?: PinataFileMetadata
  ): Promise<PinataUploadResponse> {
    try {
      const body: {
        pinataContent: object;
        pinataMetadata?: { name?: string; keyvalues?: Record<string, string> };
      } = {
        pinataContent: json,
      };

      if (metadata) {
        body.pinataMetadata = {
          name: metadata.name,
          keyvalues: metadata.keyvalues,
        };
      }

      const response = await axios.post(
        'https://api.pinata.cloud/pinning/pinJSONToIPFS',
        body,
        {
          headers: {
            'Authorization': `Bearer ${this.jwt}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        ipfsHash: response.data.IpfsHash,
        url: `${this.gatewayUrl}/ipfs/${response.data.IpfsHash}`,
        size: response.data.PinSize,
        timestamp: response.data.Timestamp,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Pinata JSON upload failed: ${error.response?.data?.error || error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Fetch content from IPFS
   */
  async fetchFromIPFS<T = unknown>(ipfsHash: string): Promise<T> {
    try {
      const response = await axios.get(`${this.gatewayUrl}/ipfs/${ipfsHash}`);
      return response.data as T;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Failed to fetch from IPFS: ${error.response?.data?.error || error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Get IPFS URL for hash
   */
  getUrl(ipfsHash: string): string {
    return `${this.gatewayUrl}/ipfs/${ipfsHash}`;
  }

  /**
   * Extract IPFS hash from URL
   */
  extractHash(url: string): string | null {
    const match = url.match(/\/ipfs\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }

  /**
   * Test connection to Pinata
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await axios.get('https://api.pinata.cloud/data/testAuthentication', {
        headers: {
          'Authorization': `Bearer ${this.jwt}`,
        },
      });
      return response.data.message === 'Congratulations! You are communicating with the Pinata API!';
    } catch (error) {
      console.error('Pinata connection test failed:', error);
      return false;
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let pinataClient: PinataClient | null = null;

export function getPinataClient(): PinataClient {
  if (!pinataClient) {
    pinataClient = new PinataClient();
  }
  return pinataClient;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Upload mission requirements to IPFS
 */
export async function uploadMissionRequirements(requirements: {
  description: string;
  agents: Array<{ capability: string; requirements?: string }>;
  [key: string]: unknown;
}): Promise<PinataUploadResponse> {
  const client = getPinataClient();
  return client.uploadJSON(requirements, {
    name: `mission-requirements-${Date.now()}`,
    keyvalues: {
      type: 'mission_requirements',
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Upload agent deliverable to IPFS
 */
export async function uploadDeliverable(
  file: File | Buffer,
  metadata: {
    missionId: string;
    agentId: string;
    capability: string;
  }
): Promise<PinataUploadResponse> {
  const client = getPinataClient();
  return client.uploadFile(file, {
    name: `deliverable-${metadata.missionId}-${metadata.agentId}`,
    keyvalues: {
      type: 'deliverable',
      mission_id: metadata.missionId,
      agent_id: metadata.agentId,
      capability: metadata.capability,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Upload bounty proposal to IPFS
 */
export async function uploadBountyProposal(proposal: {
  bidderAddress: string;
  description: string;
  approach?: string;
  timeline?: string;
  [key: string]: unknown;
}): Promise<PinataUploadResponse> {
  const client = getPinataClient();
  return client.uploadJSON(proposal, {
    name: `bounty-proposal-${proposal.bidderAddress}`,
    keyvalues: {
      type: 'bounty_proposal',
      bidder: proposal.bidderAddress,
      timestamp: new Date().toISOString(),
    },
  });
}
