'use client';

import { use, useState, useEffect, useRef } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/loader';
import { formatAddress } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useAccount, usePublicClient } from 'wagmi';
import { toast } from 'sonner';
import type { Address } from 'viem';
import { getAgentById, type EnhancedAgentData } from '@/lib/erc8004/unified-discovery';
import { OfficialERC8004Client, ERC8004_OFFICIAL, scoreToStars, getReputationTier } from '@/lib/erc8004/official-client';
import { AgentProfile } from '@/lib/supabase/agents';

export default function AgentProfilePage({ params }: { params: Promise<{ agentId: string }> }) {
  const router = useRouter();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { agentId } = use(params);
  const [agent, setAgent] = useState<EnhancedAgentData | null>(null);
  const [dbAgent, setDbAgent] = useState<AgentProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [erc8004Id, setErc8004Id] = useState<string>('0');
  const [registrationTxHash, setRegistrationTxHash] = useState<string>('');
  const [showEndpointModal, setShowEndpointModal] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState('');
  const [isUpdatingEndpoint, setIsUpdatingEndpoint] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);

  const [resourceParams, setResourceParams] = useState<Record<string, string>>({});
  const [isCallingResource, setIsCallingResource] = useState(false);
  const [resourceResponse, setResourceResponse] = useState<string | Record<string, any> | null>(null);
  const [resourceError, setResourceError] = useState<string | null>(null);

  const publicClientRef = useRef(publicClient);
  publicClientRef.current = publicClient;

  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function fetchAgent() {
      try {
        setIsLoading(true);

        // Get agent from database
        const dbResponse = await fetch(`/api/agents/${agentId}`);
        if (!dbResponse.ok) {
          setError('Agent not found');
          setIsLoading(false);
          return;
        }

        const dbData = await dbResponse.json();
        setDbAgent(dbData);

        if (dbData.resources.length){
          setSelectedResourceId(dbData.resources[0].id);
        }

        // Convert DB agent to EnhancedAgentData format for display
        const mockAgent: EnhancedAgentData = {
          agentId: dbData.erc8004_agent_id ? dbData.erc8004_agent_id.toString() : '0',
          owner: (dbData.owner_address || dbData.address || '0x0000000000000000000000000000000000000000') as Address,
          name: dbData.name,
          description: dbData.bio || '',
          tokenUri: '',
          isRegistered: !!dbData.erc8004_agent_id,
          agentType: dbData.agent_type,
          capabilities: dbData.capabilities || [],
          cdpWallet: dbData.address as Address,
          endpoint: dbData.endpoint_url || undefined,
          pricing: {
            perTask: dbData.pricing_per_task || 0,
            currency: 'USDC',
          },
          reputation: {
            averageScore: dbData.rating ? Math.round(dbData.rating * 20) : 0, // Convert 0-5 to 0-100
            rating: dbData.rating || 0,
            count: dbData.total_reviews || 0,
            tier: dbData.rating >= 4 ? 'expert' : dbData.rating >= 3 ? 'proficient' : 'beginner',
            clients: [],
          },
        };
        setAgent(mockAgent);

        // Get ERC-8004 ID from database (if available)
        const nftId = dbData.erc8004_agent_id || '0';
        setErc8004Id(nftId);

        // Try to fetch on-chain data if we have a valid NFT ID
        const pc = publicClientRef.current;
        if (nftId !== '0' && pc) {
          try {
            // Fetch real on-chain reputation from ERC-8004
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const erc8004Client = new OfficialERC8004Client(pc as any);
            const onChainReputation = await erc8004Client.getReputationSummary(BigInt(nftId));

            // Create updated agent with on-chain reputation
            const updatedAgent: EnhancedAgentData = {
              ...mockAgent,
              reputation: {
                averageScore: Number(onChainReputation.summaryValue),
                rating: scoreToStars(Number(onChainReputation.summaryValue)),
                count: Number(onChainReputation.count),
                tier: getReputationTier(Number(onChainReputation.summaryValue)).tier.toLowerCase() as 'expert' | 'proficient' | 'beginner',
                clients: onChainReputation.clients || [],
              },
            };

            setAgent(updatedAgent);

            // Also try to get additional on-chain agent data
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const onChainAgent = await getAgentById(pc as any, nftId);
              if (onChainAgent) {
                setAgent(onChainAgent); // Override with full blockchain data if available
              }
            } catch (err) {
              console.warn('[Agent Profile] Could not fetch full on-chain agent data:', err);
            }

            // Query blockchain for registration transaction (last 100k blocks to avoid RPC limits)
            try {
              const IDENTITY_REGISTRY = ERC8004_OFFICIAL.IDENTITY_REGISTRY;
              const currentBlock = await pc.getBlockNumber();
              const fromBlock = currentBlock > 100000n ? currentBlock - 100000n : 0n;

              const logs = await pc.getLogs({
                address: IDENTITY_REGISTRY,
                event: {
                  type: 'event',
                  name: 'Registered',
                  inputs: [
                    { name: 'agentId', type: 'uint256', indexed: true },
                    { name: 'tokenURI', type: 'string', indexed: false },
                    { name: 'owner', type: 'address', indexed: true },
                  ],
                },
                args: {
                  agentId: BigInt(nftId),
                },
                fromBlock,
                toBlock: 'latest',
              });

              if (logs.length > 0) {
                setRegistrationTxHash(logs[0].transactionHash);
              }
            } catch (logErr) {
              console.warn('[Agent Profile] Could not fetch registration transaction:', logErr);
              // Not critical - continue without registration tx
            }
          } catch (err) {
            console.error('[Agent Profile] Failed to fetch on-chain data:', err);
            // Don't fail - we have DB data
          }
        }

      } catch (err) {
        setError('Failed to load agent');
        console.error('Error fetching agent:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAgent();
  }, [agentId]);

  const handleHireAgent = () => {
    // if (address && agent?.owner.toLowerCase() === address.toLowerCase()) {
    //   toast.error('Cannot hire your own agent');
    //   return;
    // }
    router.push(`/chat?agent=${agentId}`);
  };

  const handleUpdateEndpoint = async () => {
    if (!address || !dbAgent) {
      toast.error('Please connect your wallet');
      return;
    }

    // Verify ownership
    if (dbAgent.owner_address?.toLowerCase() !== address.toLowerCase()) {
      toast.error('Only the agent owner can update the endpoint');
      return;
    }

    if (!endpointUrl.trim()) {
      toast.error('Please enter a valid endpoint URL');
      return;
    }

    try {
      setIsUpdatingEndpoint(true);

      const response = await fetch(`/api/agents/${agentId}/endpoint`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpointUrl: endpointUrl.trim(),
          ownerAddress: address,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update endpoint');
      }

      // Update local state
      setDbAgent({
        ...dbAgent,
        endpoint_url: endpointUrl.trim(),
        endpoint_status: data.endpoint.status,
        updated_at: data.endpoint.lastChecked,
      });

      if (data.endpoint.status === 'active') {
        toast.success('Endpoint verified and updated successfully!');
      } else {
        toast.warning(`Endpoint saved but health check failed: ${data.endpoint.error}`);
      }

      setShowEndpointModal(false);
      setEndpointUrl('');
    } catch (error) {
      console.error('Endpoint update error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update endpoint');
    } finally {
      setIsUpdatingEndpoint(false);
    }
  };

  const handleCallResource = async () => {
    if (!dbAgent?.endpoint_url){
      toast.error('No endpoint configured for this agent');
      return;
    }

    if (!selectedResource){
      toast.error('Please select a resource first');
      return
    }

    const bodyParams = selectedResource.body_params as 
      | { key: string; type: string; label: string; required: boolean; description: string}[]
      | undefined;

    if (bodyParams && bodyParams.length) {
      const missing = bodyParams.filter(
        (p) => p.required && !resourceParams[p.key]?.trim()
      );
      if (missing.length) {
        toast.error(
          'Please fill all the required fields'
        );
        return;
      }
    }

    try {
      setIsCallingResource(true);
      setResourceError(null);
      setResourceResponse(null);

      const url = `${dbAgent.endpoint_url}${selectedResource.route}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resourceParams)
      });

      const text = await res.text();
      let parsed: string | Record<string, any> | null = text;
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = text
      }

      if (!res.ok){
        setResourceError(
          typeof parsed === 'string'
            ? parsed
            : JSON.stringify(parsed, null, 2)
        );
        toast.error('Request failed');
        return
      }

      setResourceResponse(parsed);
      toast.success('Request successful');
    } catch (err){
      console.error('Resource call failed: ', err);
      setResourceError(
        err instanceof Error ? err.message : 'Failed to call resource'
      );
      toast.error('Failed to call resource')
    } finally {
      setIsCallingResource(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#f5f5f5]">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <LoadingState message="Loading..." size="lg" />
        </main>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="min-h-screen flex flex-col bg-[#f5f5f5]">
        <Header />
        <main className="flex-1 container mx-auto px-4 pt-20 sm:pt-24 pb-4">
          <div className="border border-black bg-[#f5f5f5]">
            <div className="border-b border-black p-3 bg-black text-white">
              <h3 className="font-black text-sm uppercase">NOT FOUND</h3>
            </div>
            <div className="p-8 text-center">
              <p className="font-mono text-xs opacity-60 mb-6">
                Agent not found
              </p>
              <Button onClick={() => router.push('/leaderboard')} className="h-10 text-[10px]">
                BACK TO LEADERBOARD
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const agentTypeLabel = agent.agentType === 'ai' ? 'AI' : agent.agentType === 'human' ? 'HUMAN' : 'HYBRID';
  const selectedResource = dbAgent?.resources?.find(
    (r: any) => r.id === selectedResourceId
  ) || null;


  return (
    <div className="min-h-screen flex flex-col bg-[#f5f5f5]">
      <Header />

      <main className="flex-1 container mx-auto px-4 pt-20 sm:pt-24 pb-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-4">
            {/* Hero Header */}
            <div className="border border-black bg-[#f5f5f5]">
              <div className="border-b border-black p-3 bg-black text-white">
                <h1 className="font-black text-sm uppercase">AGENT PROFILE</h1>
              </div>
              <div className="p-4">
                <div className="flex items-start gap-4 mb-4">
                  {/* Avatar */}
                  {dbAgent?.avatar_url ? (
                    <img
                      src={dbAgent.avatar_url}
                      alt={agent.name}
                      className="w-20 h-20 border border-black object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 border border-black bg-white flex items-center justify-center flex-shrink-0">
                      <div className="w-10 h-10 bg-black" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 font-bold text-[9px] uppercase border ${
                        agent.agentType === 'ai'
                          ? 'bg-purple-500 text-white border-purple-500'
                          : agent.agentType === 'human'
                          ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-green-500 text-white border-green-500'
                      }`}>
                        {agentTypeLabel}
                      </span>
                      {dbAgent?.endpoint_status === 'active' && (
                        <span className="px-2 py-0.5 bg-green-500 text-white font-bold text-[9px] uppercase border border-green-500">
                          ACTIVE
                        </span>
                      )}
                      {dbAgent?.endpoint_status === 'inactive' && dbAgent?.endpoint_url && (
                        <span className="px-2 py-0.5 bg-yellow-500 text-white font-bold text-[9px] uppercase border border-yellow-500">
                          ENDPOINT INACTIVE
                        </span>
                      )}
                      {erc8004Id !== '0' && (
                        <span className="px-2 py-0.5 bg-purple-500 text-white font-bold text-[9px] uppercase border border-purple-500">
                          ERC-8004 VERIFIED
                        </span>
                      )}
                    </div>
                    <h2 className="font-black text-2xl sm:text-3xl uppercase mb-2">{agent.name}</h2>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[10px] opacity-40">NFT ID:</span>
                        <span className="font-mono text-[10px] font-bold">#{erc8004Id}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[10px] opacity-40">OWNER:</span>
                        <span className="font-mono text-[10px]">{formatAddress(agent.owner)}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(agent.owner);
                            toast.success('Owner address copied!');
                          }}
                          className="w-5 h-5 border border-black hover:bg-blue-500 hover:border-blue-500 hover:text-white transition-colors flex items-center justify-center"
                          title="Copy owner address"
                        >
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                        </button>
                        <button
                          onClick={() => window.open(`https://basescan.org/address/${agent.owner}`, '_blank')}
                          className="w-5 h-5 border border-black hover:bg-blue-500 hover:border-blue-500 hover:text-white transition-colors flex items-center justify-center"
                          title="View owner on BaseScan"
                        >
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                          </svg>
                        </button>
                      </div>
                      {dbAgent?.address && (
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[10px] opacity-40">PAYMENT:</span>
                          <span className="font-mono text-[10px]">{formatAddress(dbAgent.address)}</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(dbAgent.address);
                              toast.success('Payment wallet copied!');
                            }}
                            className="w-5 h-5 border border-black hover:bg-blue-500 hover:border-blue-500 hover:text-white transition-colors flex items-center justify-center"
                            title="Copy payment wallet"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                          </button>
                          <button
                            onClick={() => window.open(`https://basescan.org/address/${dbAgent.address}`, '_blank')}
                            className="w-5 h-5 border border-black hover:bg-blue-500 hover:border-blue-500 hover:text-white transition-colors flex items-center justify-center"
                            title="View payment wallet on BaseScan"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Description */}
                {agent.description && (
                  <div className="border-t border-black pt-4 mb-4">
                    <p className="font-mono text-xs leading-relaxed">{agent.description}</p>
                  </div>
                )}

                {/* Capabilities */}
                {agent.capabilities && agent.capabilities.length > 0 && (
                  <div className="border-t border-black pt-4 mb-4">
                    <div className="font-mono text-[9px] uppercase opacity-40 mb-2">CAPABILITIES</div>
                    <div className="flex flex-wrap gap-2">
                      {agent.capabilities.map((capability) => (
                        <div
                          key={capability}
                          className="px-2 py-1 border border-black bg-white font-mono text-[9px] uppercase hover:bg-black hover:text-white transition-colors"
                        >
                          {capability.replace(/-/g, ' ')}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Endpoint Management */}
                {address && dbAgent?.owner_address?.toLowerCase() === address.toLowerCase() && (
                  <div className="border-t border-black pt-4 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-mono text-[9px] uppercase opacity-40">AGENT ENDPOINT</div>
                      <button
                        onClick={() => {
                          setEndpointUrl(dbAgent?.endpoint_url || '');
                          setShowEndpointModal(true);
                        }}
                        className="px-2 py-1 border border-black bg-white hover:bg-black hover:text-white transition-colors font-mono text-[9px] uppercase"
                      >
                        {dbAgent?.endpoint_url ? 'UPDATE' : 'SETUP'}
                      </button>
                    </div>
                    {dbAgent?.endpoint_url ? (
                      <>
                        <div className="font-mono text-[10px] break-all mb-2">{dbAgent.endpoint_url}</div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 font-bold text-[9px] uppercase border ${
                            dbAgent.endpoint_status === 'active'
                              ? 'bg-green-500 text-white border-green-500'
                              : 'bg-red-500 text-white border-red-500'
                          }`}>
                            {dbAgent.endpoint_status?.toUpperCase() || 'UNKNOWN'}
                          </span>
                          {dbAgent.updated_at && (
                            <span className="font-mono text-[9px] opacity-40">
                              Last checked: {new Date(dbAgent.updated_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="font-mono text-[10px] opacity-60">
                        No endpoint configured. Setup your endpoint to start receiving tasks.
                      </p>
                    )}
                  </div>
                )}

                {/* Contract Address */}
                <div className="border-t border-black pt-4 mb-4">
                  <div className="font-mono text-[9px] uppercase opacity-40 mb-2">ERC-8004 CONTRACT</div>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-[10px]">0x8004AA63c570c570eBF15376c0dB199918BFe9Fb</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText('0x8004AA63c570c570eBF15376c0dB199918BFe9Fb');
                        toast.success('Contract address copied!');
                      }}
                      className="w-5 h-5 border border-black hover:bg-blue-500 hover:border-blue-500 hover:text-white transition-colors flex items-center justify-center"
                      title="Copy contract address"
                    >
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    </button>
                    <button
                      onClick={() => window.open('https://basescan.org/address/0x8004AA63c570c570eBF15376c0dB199918BFe9Fb', '_blank')}
                      className="w-5 h-5 border border-black hover:bg-blue-500 hover:border-blue-500 hover:text-white transition-colors flex items-center justify-center"
                      title="View contract on BaseScan"
                    >
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Hire Button */}
                <div className="border-t border-black pt-4">
                  <Button
                    className="w-full h-12 text-[10px]"
                    onClick={handleHireAgent}
                  >
                    HIRE THIS AGENT
                  </Button>
                </div>
              </div>
            </div>

            {/* Reputation & Performance */}
            <div className="border border-black bg-[#f5f5f5]">
              <div className="border-b border-black p-3 bg-black text-white">
                <h2 className="font-black text-sm uppercase">REPUTATION & PERFORMANCE</h2>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-3 gap-3">
                  {/* Reputation Score */}
                  <div className="border border-black bg-white p-3 text-center">
                    <div className="font-mono text-[9px] uppercase opacity-40 mb-2">REPUTATION</div>
                    <div className="font-black text-3xl">{agent.reputation?.averageScore || 50}</div>
                    <div className="font-mono text-[9px] opacity-40 mt-1">OUT OF 100</div>
                  </div>

                  {/* Rating */}
                  <div className="border border-black bg-white p-3 text-center">
                    <div className="font-mono text-[9px] uppercase opacity-40 mb-2">RATING</div>
                    <div className="font-black text-3xl">{agent.reputation?.rating?.toFixed(1) || '2.5'}</div>
                    <div className="font-mono text-[9px] opacity-40 mt-1">★ STARS</div>
                  </div>

                  {/* Reviews */}
                  <div className="border border-black bg-white p-3 text-center">
                    <div className="font-mono text-[9px] uppercase opacity-40 mb-2">REVIEWS</div>
                    <div className="font-black text-3xl">{agent.reputation?.count || 0}</div>
                    <div className="font-mono text-[9px] opacity-40 mt-1">ON-CHAIN</div>
                  </div>
                </div>

                {/* Registration TX inline */}
                {registrationTxHash && (
                  <div className="mt-4 pt-4 border-t border-black">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-[9px] uppercase opacity-40">Registration TX</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[10px]">{registrationTxHash.slice(0, 8)}...{registrationTxHash.slice(-6)}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(registrationTxHash);
                            toast.success('Transaction hash copied!');
                          }}
                          className="w-5 h-5 border border-black hover:bg-blue-500 hover:border-blue-500 hover:text-white transition-colors flex items-center justify-center"
                          title="Copy transaction hash"
                        >
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                        </button>
                        <button
                          onClick={() => window.open(`https://basescan.org/tx/${registrationTxHash}`, '_blank')}
                          className="w-5 h-5 border border-black hover:bg-blue-500 hover:border-blue-500 hover:text-white transition-colors flex items-center justify-center"
                          title="View on BaseScan"
                        >
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-4">

            {/* Pricing / Resources */}
            <div className="border border-black bg-black text-white">
              <div className="p-4">
                <div className="text-center mb-4">
                  <div className="font-mono text-[9px] uppercase opacity-60 mb-2">
                    {dbAgent?.resources?.length ? 'RESOURCES' : 'PRICING'}
                  </div>

                  {!dbAgent?.resources?.length && (
                    <>
                      <div className="font-black text-4xl mb-1">
                        {agent.pricing?.perTask || 0}
                      </div>
                      <div className="font-mono text-[9px] opacity-60">
                        PER TASK (USDC)
                      </div>
                    </>
                  )}
                </div>

                {dbAgent?.resources?.length ? (
                  <>
                    {/* Resource list */}
                    <div className="space-y-3 mb-4">
                      {dbAgent.resources.map((resource: any) => (
                        <button
                          key={resource.id}
                          onClick={() => {
                            setSelectedResourceId(resource.id);
                            setResourceParams({}); // reset inputs on change
                            setResourceResponse(null);
                            setResourceError(null);
                          }}
                          className={
                            `w-full text-left border border-white/40 px-3 py-2 text-xs transition-colors ` +
                            (resource.id === selectedResourceId
                              ? 'bg-white text-black'
                              : 'bg-black text-white hover:bg-white hover:text-black')
                          }
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold uppercase text-[10px]">
                              {resource.name}
                            </span>
                            <span className="font-mono text-[10px]">
                              ${resource.pricing_per_task} USDC
                            </span>
                          </div>
                          {resource.short_description && (
                            <p className="font-mono text-[9px] opacity-70">
                              {resource.short_description}
                            </p>
                          )}
                          <p className="font-mono text-[9px] opacity-40 mt-1">
                            Route: {resource.route}
                          </p>
                        </button>
                      ))}
                    </div>

                    {/* Dynamic form for selected resource */}
                    {selectedResource && (
                      <div className="mt-2 border-t border-white/40 pt-3">
                        <div className="font-mono text-[9px] uppercase opacity-60 mb-2">
                          Request Body
                        </div>

                        {selectedResource.body_params?.map((param: any) => (
                          <div key={param.key} className="mb-2">
                            <label className="block font-mono text-[9px] mb-1">
                              {param.label || param.key}
                              {param.required && <span className="text-red-400"> *</span>}
                            </label>
                            <input
                              type="text"
                              placeholder={param.placeholder || ''}
                              value={resourceParams[param.key] || ''}
                              onChange={(e) =>
                                setResourceParams((prev) => ({
                                  ...prev,
                                  [param.key]: e.target.value,
                                }))
                              }
                              className="w-full h-8 px-2 border border-white/40 bg-transparent font-mono text-[10px] focus:outline-none focus:border-white"
                            />
                            {param.description && (
                              <p className="font-mono text-[9px] opacity-60 mt-0.5">
                                {param.description}
                              </p>
                            )}
                          </div>
                        ))}

                        <Button
                          onClick={handleCallResource}
                          disabled={isCallingResource}
                          className="w-full h-9 mt-2 text-[10px]"
                        >
                          {isCallingResource
                            ? 'CALLING RESOURCE...'
                            : `CALL ${selectedResource.name.toUpperCase()}`}
                        </Button>

                        {/* Response / Error */}
                        {(resourceResponse || resourceError) && (
                          <div className="mt-3 p-2 border border-white/40 bg-black/40 max-h-64 overflow-auto">
                            {resourceError && (
                              <div className="mb-2 font-mono text-[10px] text-red-300">
                                Error: {resourceError}
                              </div>
                            )}
                            {resourceResponse && (
                              <pre className="font-mono text-[10px] whitespace-pre-wrap break-all">
                                {typeof resourceResponse === 'string'
                                  ? resourceResponse
                                  : JSON.stringify(resourceResponse, null, 2)}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </div>





            {/* Quick Stats */}
            <div className="border border-black bg-[#f5f5f5]">
              <div className="border-b border-black p-3 bg-black text-white">
                <h2 className="font-black text-sm uppercase">QUICK STATS</h2>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[9px] uppercase opacity-40">Agent Type</span>
                  <span className="font-mono text-[10px] font-bold">{agentTypeLabel}</span>
                </div>
                <div className="border-t border-black pt-3 flex justify-between items-center">
                  <span className="font-mono text-[9px] uppercase opacity-40">Capabilities</span>
                  <span className="font-mono text-[10px] font-bold">{agent.capabilities?.length || 0}</span>
                </div>
                <div className="border-t border-black pt-3 flex justify-between items-center">
                  <span className="font-mono text-[9px] uppercase opacity-40">Reputation Tier</span>
                  <span className="font-mono text-[10px] font-bold">{agent.reputation?.tier?.toUpperCase() || 'BEGINNER'}</span>
                </div>
                <div className="border-t border-black pt-3 flex justify-between items-center">
                  <span className="font-mono text-[9px] uppercase opacity-40">Total Reviews</span>
                  <span className="font-mono text-[10px] font-bold">{agent.reputation?.count || 0}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
      
            <button
              onClick={() => window.open(`https://basescan.org/token/0x8004AA63c570c570eBF15376c0dB199918BFe9Fb?a=${erc8004Id}`, '_blank')}
              className="w-full h-10 border border-black bg-[#f5f5f5] hover:bg-black hover:text-white transition-colors font-bold text-[10px] uppercase"
            >
              VIEW NFT ON BASESCAN
            </button>
            <button
              onClick={() => router.push('/leaderboard')}
              className="w-full h-10 border border-black bg-[#f5f5f5] hover:bg-black hover:text-white transition-colors font-bold text-[10px] uppercase"
            >
              BACK TO LEADERBOARD
            </button>
          </div>
        </div>
      </main>

      {/* Endpoint Setup/Update Modal */}
      {showEndpointModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-[#f5f5f5] border-2 border-black max-w-md w-full">
            <div className="border-b-2 border-black p-3 bg-black text-white">
              <h3 className="font-black text-sm uppercase">
                {dbAgent?.endpoint_url ? 'UPDATE' : 'SETUP'} ENDPOINT
              </h3>
            </div>
            <div className="p-4">
              <p className="font-mono text-[10px] mb-4 opacity-60">
                Enter your agent endpoint URL. We&apos;ll verify it&apos;s working before saving.
              </p>

              <div className="mb-4">
                <label className="font-mono text-[9px] uppercase opacity-40 mb-2 block">
                  ENDPOINT URL
                </label>
                <input
                  type="url"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="https://your-agent.com/api"
                  className="w-full h-10 px-3 border-2 border-black font-mono text-xs focus:outline-none focus:border-blue-500"
                  disabled={isUpdatingEndpoint}
                />
              </div>

              <div className="mb-4 p-3 border border-black bg-yellow-50">
                <p className="font-mono text-[9px] leading-relaxed">
                  <strong>IMPORTANT:</strong> Your endpoint must respond to POST requests with a 200 status code.
                  We&apos;ll send a health check request to verify it&apos;s working.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleUpdateEndpoint}
                  disabled={isUpdatingEndpoint || !endpointUrl.trim()}
                  className="flex-1 h-10 text-[10px]"
                >
                  {isUpdatingEndpoint ? 'VERIFYING...' : 'VERIFY & SAVE'}
                </Button>
                <button
                  onClick={() => {
                    setShowEndpointModal(false);
                    setEndpointUrl('');
                  }}
                  disabled={isUpdatingEndpoint}
                  className="px-4 h-10 border-2 border-black bg-white hover:bg-black hover:text-white transition-colors font-bold text-[10px] uppercase disabled:opacity-50"
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
