import { SecurityAnalysis } from "../types";

export function computeSecurityScore(security: Omit<SecurityAnalysis, "securityScore">): number {
  let score = 100;

  if (security.isHoneypot) score -= 50;
  if (security.canMint) score -= 20;
  if (security.canPauseTransfers) score -= 15;
  if (security.canChangeOwnership) score -= 15;
  if (security.hiddenOwner) score -= 10;
  if (!security.openSource) score -= 10;
  if (security.proxyContract) score -= 5;
  if (security.selfDestruct) score -= 20;

  return Math.max(0, score);
}
