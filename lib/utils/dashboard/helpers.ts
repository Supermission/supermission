import { DatabaseMission, MissionCard } from '@/lib/utils/dashboard/types';

export function extractCategory(description: string): string | null {
  const match = description.match(/prediction market.*?:\s*(\w+)/i);
  if (match) return match[1].toUpperCase();
  return null;
}

export function determineStatus(
  endDate: string | null,
  dbStatus: string
): 'executing' | 'completed' | 'pending' {
  if (endDate) {
    const end = new Date(endDate);
    const now = new Date();
    return now < end ? 'executing' : 'completed';
  }

  const map: Record<string, 'executing' | 'completed' | 'pending'> = {
    pending: 'pending',
    active: 'pending',
    in_progress: 'executing',
    approved: 'executing',
    executing: 'executing',
    completed: 'completed',
    cancelled: 'completed',
    failed: 'completed',
  };

  return map[dbStatus] || 'completed';
}

export function determineMissionType(
  description: string | undefined,
  title: string | undefined,
  category?: string | undefined
): MissionCard['type'] {
  // Use category field from collaborate_missions if available
  if (category) {
    const catMap: Record<string, MissionCard['type']> = {
      'prediction-market': 'prediction_market',
      'token-due-diligence': 'token_analysis',
      'image-generation': 'image_generation',
      'contract-audit': 'audit',
      'defi-yield': 'defi_yield',
      'wallet-intelligence': 'wallet_intelligence',
    };
    if (catMap[category]) return catMap[category];
  }

  // Fallback: text matching for legacy data
  const text = `${description || ''} ${title || ''}`.toLowerCase();
  if (text.includes('prediction market') || text.includes('polymarket')) {
    return 'prediction_market';
  }
  if (text.includes('audit') || text.includes('security') || text.includes('smart contract')) {
    return 'audit';
  }
  if (text.includes('image') || text.includes('generate') || text.includes('logo') || text.includes('visual')) {
    return 'image_generation';
  }
  if (text.includes('token') || text.includes('analysis') || text.includes('crypto') || text.includes('due diligence') || text.includes('tokendd')) {
    return 'token_analysis';
  }
  if (text.includes('yield') || text.includes('defi')) {
    return 'defi_yield';
  }
  if (text.includes('wallet') || text.includes('intelligence')) {
    return 'wallet_intelligence';
  }
  return 'other';
}

export function shouldDisplayInline(missionType: MissionCard['type']): boolean {
  return missionType !== 'prediction_market' && missionType !== 'other';
}

export function shouldFilterMission(mission: DatabaseMission): boolean {
  const description = (mission.description || '').toLowerCase();
  const titleLower = (mission.title || '').toLowerCase();

  return (
    description.includes('logo design') ||
    titleLower.includes('logo design') ||
    description.includes('copywriter') ||
    titleLower.includes('copywriter')
  );
}