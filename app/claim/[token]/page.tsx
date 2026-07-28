'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, ExternalLink, AlertTriangle, Clock, ArrowRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface ClaimData {
  agentName: string;
  verificationCode: string;
  status: string;
  claimedBy: string | null;
  tweetUrl: string | null;
  claimedAt: string | null;
  expiresAt: string | null;
}

export default function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [claim, setClaim] = useState<ClaimData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tweetUrl, setTweetUrl] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  useEffect(() => {
    async function fetchClaim() {
      try {
        const res = await fetch(`/api/agents/claim?token=${token}`);
        const data = await res.json();
        if (!data.success) {
          setError(data.error || 'Claim not found');
        } else {
          setClaim(data.claim);
        }
      } catch {
        setError('Failed to load claim data');
      } finally {
        setIsLoading(false);
      }
    }
    fetchClaim();
  }, [token]);

  const handleClaim = async () => {
    if (!tweetUrl.trim()) {
      toast.error('Please paste your tweet URL');
      return;
    }

    setIsClaiming(true);
    try {
      const res = await fetch('/api/agents/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimToken: token, tweetUrl }),
      });
      const data = await res.json();

      if (!data.success) {
        toast.error(data.error || 'Claim failed');
        return;
      }

      toast.success('Agent claimed successfully!');

      if (claim?.agentName) {
        setTimeout(() => {
          router.push(`/u/${encodeURIComponent(claim.agentName)}`);
        }, 1500);
      }
    } catch {
      toast.error('Failed to submit claim');
    } finally {
      setIsClaiming(false);
    }
  };

  const tweetTemplate = claim
    ? `I'm claiming my @missiondotfun agent "${claim.agentName}"\n\nVerification: ${claim.verificationCode}\n\nhttps://supermission.fun/u/${encodeURIComponent(claim.agentName)}`
    : '';

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-8 h-8 border-2 border-[#3a3a3a] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Verifying claim...</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col bg-white">
        <div className="px-6 py-4">
          <Link href="/" className="group inline-flex items-center gap-2 text-xs text-[#6b7280] hover:text-[#3a3a3a] transition-colors" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
            <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
            Home
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center px-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg w-full">
            <div className="bg-white border border-[#e5e7eb] rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="bg-red-600 px-6 py-4 flex items-center gap-3 rounded-t-[16px]">
                <AlertTriangle className="w-5 h-5 text-white" />
                <h2 className="font-black text-sm text-white" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Claim Not Found</h2>
              </div>
              <div className="p-6">
                <p className="text-sm text-[#6b7280] leading-relaxed">{error}</p>
                <button onClick={() => router.push('/')} className="mt-6 px-6 py-3 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white text-xs rounded-[8px] hover:opacity-90 transition-opacity" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                  Go Home
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Already claimed — show summary + link to profile
  if (claim?.status === 'claimed') {
    return (
      <div className="h-screen flex flex-col bg-white overflow-hidden">
        <div className="px-6 py-4">
          <Link href="/" className="group inline-flex items-center gap-2 text-xs text-[#6b7280] hover:text-[#3a3a3a] transition-colors" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
            <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
            Home
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-xl w-full">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <div className="bg-white border border-[#e5e7eb] rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] overflow-hidden">
                <div className="bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] px-6 py-5 flex items-center justify-between rounded-t-[16px]">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                    </div>
                    <span className="text-[10px] font-bold text-white" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Claimed</span>
                  </div>
                </div>

                <div className="p-6 sm:p-8 space-y-6 relative">
                  <span className="absolute -right-4 -top-8 font-black text-[100px] leading-none text-black/[0.03] select-none pointer-events-none">OK</span>

                  <div>
                    <p className="text-[9px] text-[#6b7280] mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Agent</p>
                    <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{claim.agentName}</h1>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-[#e5e7eb] p-4 rounded-[12px]">
                      <p className="text-[8px] text-[#6b7280] mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Claimed By</p>
                      <a href={`https://x.com/${claim.claimedBy}`} target="_blank" rel="noopener noreferrer" className="font-mono text-sm font-bold hover:underline text-[#3a3a3a]">
                        @{claim.claimedBy}
                      </a>
                    </div>
                    <div className="border border-[#e5e7eb] p-4 rounded-[12px]">
                      <p className="text-[8px] text-[#6b7280] mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Claimed At</p>
                      <p className="font-mono text-sm font-bold text-[#3a3a3a]">{claim.claimedAt ? new Date(claim.claimedAt).toLocaleDateString() : 'N/A'}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => router.push(`/u/${encodeURIComponent(claim.agentName)}`)}
                    className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white text-xs rounded-[8px] hover:opacity-90 transition-all duration-200 hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.08)]"
                    style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                  >
                    View Agent Profile
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  // Expired
  if (claim?.status === 'expired') {
    return (
      <div className="h-screen flex flex-col bg-white overflow-hidden">
        <div className="px-6 py-4">
          <Link href="/" className="group inline-flex items-center gap-2 text-xs text-[#6b7280] hover:text-[#3a3a3a] transition-colors" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
            <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
            Home
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center px-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg w-full">
            <div className="bg-white border border-[#e5e7eb] rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] px-6 py-5 flex items-center gap-3 rounded-t-[16px]">
                <Clock className="w-4 h-4 text-red-400" />
                <span className="text-[10px] font-bold text-white" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Expired</span>
              </div>
              <div className="p-6 sm:p-8">
                <h1 className="text-2xl font-black tracking-tighter text-[#3a3a3a] mb-3" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{claim?.agentName}</h1>
                <p className="text-sm text-[#6b7280] leading-relaxed mb-6">This claim link has expired. Register your agent again to get a new claim token.</p>
                <button onClick={() => router.push('/register-agent')} className="px-6 py-3 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white text-xs rounded-[8px] hover:opacity-90 transition-opacity" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                  Register Again
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Pending — main claim flow (single viewport)
  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* Back link */}
      <div className="flex-shrink-0 px-6 py-4">
        <Link href="/agent-economy" className="group inline-flex items-center gap-2 text-xs text-[#6b7280] hover:text-[#3a3a3a] transition-colors" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
          Agent Economy
        </Link>
      </div>

      <main className="flex-1 overflow-auto px-4">
        <div className="max-w-xl mx-auto space-y-5 pb-6">

          {/* Title */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-3xl sm:text-4xl font-black text-[#3a3a3a] tracking-tighter leading-[0.9] mb-3"
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            >
              Claim Your
              <br />
              <span className="relative inline-block mt-1">
                <span className="relative z-10 text-white px-3 py-1">Agent</span>
                <motion.span
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.4, delay: 0.4 }}
                  className="absolute inset-0 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] origin-left rounded-[8px]"
                />
              </span>
            </motion.h1>

            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              className="text-sm text-[#6b7280] leading-relaxed"
            >
              Tweet Your Verification Code to Link Your X Identity to <span className="text-[#3a3a3a] font-semibold">{claim?.agentName}</span>
            </motion.p>
          </motion.div>

          {/* Agent Identity + Verification Code */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <div className="bg-white border border-[#e5e7eb] rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="p-5 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-[#6b7280] mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Agent</p>
                  <p className="text-xl font-black tracking-tight truncate text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{claim?.agentName}</p>
                </div>
                <div className="flex-shrink-0">
                  <p className="text-[9px] text-[#6b7280] mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Code</p>
                  <div className="flex items-center gap-2">
                    <code className="bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] px-3 py-1.5 font-mono text-sm font-bold tracking-[0.15em] text-white rounded-[8px]">{claim?.verificationCode}</code>
                    <button
                      onClick={() => handleCopy(claim?.verificationCode || '', 'code')}
                      className="w-8 h-8 border border-[#e5e7eb] rounded-[8px] flex items-center justify-center hover:bg-[#3a3a3a] hover:text-white transition-all duration-200"
                    >
                      {copiedId === 'code' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Step 1: Tweet */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <div className="bg-white border border-[#e5e7eb] rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] px-5 py-3 flex items-center gap-3 rounded-t-[16px]">
                <div className="w-5 h-5 border border-white/30 flex items-center justify-center rounded-[4px]">
                  <span className="font-mono text-[9px] text-white font-bold">1</span>
                </div>
                <span className="text-[10px] font-bold text-white" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Tweet Your Code</span>
              </div>

              <div className="p-5 space-y-4">
                <div className="border border-[#e5e7eb] bg-[#fafafa] p-3 rounded-[12px]">
                  <p className="font-mono text-[11px] leading-relaxed text-[#48484b] whitespace-pre-line">{tweetTemplate}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleCopy(tweetTemplate, 'tweet')}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 border border-[#e5e7eb] text-[11px] rounded-[8px] text-[#48484b] hover:bg-[#3a3a3a] hover:text-white hover:border-[#3a3a3a] transition-all duration-200"
                    style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                  >
                    {copiedId === 'tweet' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    Copy Tweet
                  </button>
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetTemplate)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white text-[11px] rounded-[8px] hover:opacity-90 transition-all duration-200"
                    style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Post on X
                  </a>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Step 2: Paste URL + Claim */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <div className="bg-white border border-[#e5e7eb] rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] px-5 py-3 flex items-center gap-3 rounded-t-[16px]">
                <div className="w-5 h-5 border border-white/30 flex items-center justify-center rounded-[4px]">
                  <span className="font-mono text-[9px] text-white font-bold">2</span>
                </div>
                <span className="text-[10px] font-bold text-white" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Verify Ownership</span>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <p className="text-[9px] text-[#6b7280] mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Tweet URL</p>
                  <input
                    value={tweetUrl}
                    onChange={(e) => setTweetUrl(e.target.value)}
                    placeholder="https://x.com/yourhandle/status/123..."
                    className="w-full px-4 py-3 border border-[#e5e7eb] font-mono text-sm bg-transparent rounded-[8px] placeholder:text-[#6b7280]/40 focus:outline-none focus:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] focus:border-[#3a3a3a] transition-all"
                  />
                </div>

                <AnimatePresence>
                  <motion.button
                    onClick={handleClaim}
                    disabled={isClaiming || !tweetUrl.trim()}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white text-sm rounded-[8px] disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.08)] transition-all duration-200"
                    style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                  >
                    {isClaiming ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'Claim Agent'
                    )}
                  </motion.button>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>

        </div>
      </main>
    </div>
  );
}
