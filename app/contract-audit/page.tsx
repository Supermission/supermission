'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { ContractAuditResultPanel } from '@/components/chat/contract-audit-result-panel';
import { ContractAuditResponse } from '@/lib/new-agents/contractAudit/types';
import { toast } from 'sonner';
import { RequireAuth } from '@/components/auth/require-auth';

// Example contract for demonstration
const EXAMPLE_CONTRACT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract VulnerableBank {
    mapping(address => uint256) public balances;

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    // Vulnerable to reentrancy!
    function withdraw() public {
        uint256 bal = balances[msg.sender];
        require(bal > 0);

        (bool sent, ) = msg.sender.call{value: bal}("");
        require(sent, "Failed to send Ether");

        balances[msg.sender] = 0;
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
}`;

export default function ContractAuditPage() {
  const [sourceCode, setSourceCode] = useState('');
  const [contractName, setContractName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<ContractAuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New state for fetching
  const [inputMode, setInputMode] = useState<'paste' | 'fetch'>('paste');
  const [contractAddress, setContractAddress] = useState('');
  const [chainId, setChainId] = useState<number>(8453);

  const handleAudit = async () => {
    if (inputMode === 'paste' && !sourceCode.trim()) {
      toast.error('Please paste your Solidity source code');
      return;
    }
    if (inputMode === 'fetch' && !contractAddress.trim()) {
      toast.error('Please enter a contract address');
      return;
    }

    setIsLoading(true);
    setError(null);
    setAuditResult(null);

    try {
      // For demo purposes, we'll call the API without payment
      // In production, this would go through the X402 payment flow
      const response = await fetch('/api/new-agents/contract-audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Demo: Using a mock payment proof for testing
          'x-payment-proof': JSON.stringify({
            txHash: '0xdemo',
            from: '0xdemo',
            to: '0xdemo',
            amount: '1000',
          }),
        },
        body: JSON.stringify({
          sourceCode: inputMode === 'paste' ? sourceCode : undefined,
          contractAddress: inputMode === 'fetch' ? contractAddress : undefined,
          chainId: inputMode === 'fetch' ? chainId : undefined,
          contractName: contractName || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Audit failed');
      }

      if (data.success && data.data) {
        setAuditResult(data.data);
        toast.success('Audit completed!');
      } else {
        throw new Error('Invalid response from audit service');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to audit contract';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const loadExample = () => {
    setSourceCode(EXAMPLE_CONTRACT);
    setContractName('VulnerableBank');
    toast.info('Example contract loaded - this contract has intentional vulnerabilities');
  };

  const clearAll = () => {
    setSourceCode('');
    setContractName('');
    setContractAddress('');
    setAuditResult(null);
    setError(null);
  };

  return (
    <RequireAuth>
    <div className="min-h-screen flex flex-col bg-white">
      <Header />

      <main className="flex-1 container mx-auto px-4 sm:px-6 md:px-8 pt-20 sm:pt-24 pb-8">
        {/* Page Header */}
        <div className="border border-[#e5e7eb] bg-white rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] mb-6">
          <div className="p-4">
            <h1 className="font-black text-2xl sm:text-3xl text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Smart Contract Audit</h1>
            <p className="text-xs text-[#6b7280] mt-1">
              Analyze Solidity contracts for security vulnerabilities, gas optimization, and best practices
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <div className="space-y-4">
            {/* Contract Name */}
            <div className="border border-[#e5e7eb] bg-white rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="border-b border-[#e5e7eb] px-4 py-2 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-t-[16px]">
                <label className="font-black text-xs" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Contract Name (Optional)</label>
              </div>
              <div className="p-4">
                <input
                  type="text"
                  value={contractName}
                  onChange={(e) => setContractName(e.target.value)}
                  placeholder="MyContract"
                  className="w-full px-3 py-2 border border-[#e5e7eb] font-mono text-sm rounded-[8px] focus:outline-none focus:ring-2 focus:ring-[#3a3a3a]"
                />
              </div>
            </div>

            {/* Mode Selection */}
            <div className="flex border border-[#e5e7eb] bg-white rounded-[8px] overflow-hidden">
              <button
                onClick={() => setInputMode('paste')}
                className={`flex-1 py-2 font-black text-xs rounded-l-[8px] ${inputMode === 'paste' ? 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white' : 'hover:bg-gray-100 text-[#48484b]'}`}
                style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
              >
                Paste Code
              </button>
              <div className="w-[1px] bg-[#e5e7eb]"></div>
              <button
                onClick={() => setInputMode('fetch')}
                className={`flex-1 py-2 font-black text-xs rounded-r-[8px] ${inputMode === 'fetch' ? 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white' : 'hover:bg-gray-100 text-[#48484b]'}`}
                style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
              >
                Fetch by Address
              </button>
            </div>

            {/* Source Code or Address Input */}
            <div className="border border-[#e5e7eb] bg-white rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="border-b border-[#e5e7eb] px-4 py-2 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white flex justify-between items-center rounded-t-[16px]">
                <label className="font-black text-xs" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                  {inputMode === 'paste' ? 'Solidity Source Code' : 'Contract Details'}
                </label>
                {inputMode === 'paste' && (
                  <button
                    onClick={loadExample}
                    className="text-[10px] underline hover:no-underline"
                    style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                  >
                    Load Example
                  </button>
                )}
              </div>
              <div className="p-4 space-y-4">
                {inputMode === 'paste' ? (
                  <textarea
                    value={sourceCode}
                    onChange={(e) => setSourceCode(e.target.value)}
                    placeholder="// Paste your Solidity contract here..."
                    className="w-full h-[400px] px-3 py-2 border border-[#e5e7eb] font-mono text-xs rounded-[8px] focus:outline-none focus:ring-2 focus:ring-[#3a3a3a] resize-none"
                    spellCheck={false}
                  />
                ) : (
                  <div className="space-y-4 min-h-[400px]">
                    <div>
                      <label className="block text-xs mb-1 font-bold text-[#48484b]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Block Explorer Chain</label>
                      <select
                        value={chainId}
                        onChange={(e) => setChainId(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-[#e5e7eb] font-mono text-sm rounded-[8px] focus:outline-none focus:ring-2 focus:ring-[#3a3a3a] bg-white appearance-none"
                      >
                        <option value={8453}>Base (Basescan)</option>
                        <option value={1}>Ethereum (Etherscan)</option>
                        <option value={42161}>Arbitrum (Arbiscan)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs mb-1 font-bold text-[#48484b]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Contract Address</label>
                      <input
                        type="text"
                        value={contractAddress}
                        onChange={(e) => setContractAddress(e.target.value)}
                        placeholder="0x..."
                        className="w-full px-3 py-2 border border-[#e5e7eb] font-mono text-sm rounded-[8px] focus:outline-none focus:ring-2 focus:ring-[#3a3a3a]"
                      />
                      <p className="text-[10px] text-[#6b7280] mt-1">
                        Note: Contract must be verified on the block explorer.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                onClick={handleAudit}
                disabled={isLoading || (inputMode === 'paste' ? !sourceCode.trim() : !contractAddress.trim())}
                className="flex-1"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Run Audit
                  </>
                )}
              </Button>
              <button
                onClick={clearAll}
                className="px-4 py-2 border border-[#e5e7eb] text-xs rounded-[8px] text-[#48484b] hover:bg-[#3a3a3a] hover:text-white hover:border-[#3a3a3a] transition-colors"
                style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
              >
                Clear
              </button>
            </div>

            {/* Error Display */}
            {error && (
              <div className="border border-red-300 bg-red-50 p-4 rounded-[12px]">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-xs text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Info Box */}
            <div className="border border-[#e5e7eb] bg-white p-4 rounded-[12px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
              <h3 className="font-black text-xs text-[#3a3a3a] mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>What We Check</h3>
              <div className="grid grid-cols-2 gap-2 text-[10px] text-[#48484b]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full" />
                  Reentrancy (SWC-107)
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full" />
                  tx.origin Auth (SWC-115)
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-orange-500 rounded-full" />
                  Unchecked Calls (SWC-104)
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-orange-500 rounded-full" />
                  Access Control
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full" />
                  Gas Optimization
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full" />
                  OpenZeppelin Patterns
                </div>
              </div>
            </div>
          </div>

          {/* Results Section */}
          <div>
            {!auditResult && !isLoading && (
              <div className="border border-[#e5e7eb] bg-white h-full min-h-[500px] flex items-center justify-center rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
                <div className="text-center p-8">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                    <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <h3 className="font-black text-lg text-[#3a3a3a] mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Paste Your Contract</h3>
                  <p className="text-xs text-[#6b7280] max-w-sm">
                    Enter your Solidity source code and click &quot;Run Audit&quot; to analyze for vulnerabilities
                  </p>
                </div>
              </div>
            )}

            {isLoading && (
              <div className="border border-[#e5e7eb] bg-white h-full min-h-[500px] flex items-center justify-center rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
                <div className="text-center p-8">
                  <div className="w-20 h-20 mx-auto mb-4 relative">
                    <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
                    <div className="absolute inset-0 rounded-full border-4 border-[#3a3a3a] border-t-transparent animate-spin" />
                  </div>
                  <h3 className="font-black text-lg text-[#3a3a3a] mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Analyzing Contract</h3>
                  <p className="text-xs text-[#6b7280]">
                    Running security checks, gas analysis, and best practices verification...
                  </p>
                </div>
              </div>
            )}

            {auditResult && (
              <ContractAuditResultPanel data={auditResult} />
            )}
          </div>
        </div>
      </main>
    </div>
    </RequireAuth>
  );
}
