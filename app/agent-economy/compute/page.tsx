// ⚠️ AGENT ECONOMY IS CURRENTLY DISABLED / NOT IN USE.
// All /agent-economy page routes are blocked in middleware.ts and redirect to /.
// Do not add new features or link to these pages until agent economy is re-enabled.

'use client';

import { motion } from 'framer-motion';

const fontStyle = { fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" } as const;

export default function ComputePage() {
  return (
    <div className="max-w-6xl mx-auto" style={fontStyle}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-[#e7e9eb] bg-[#fafbfc] rounded-[20px] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.04)]"
      >
        <div className="p-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-[48px] font-bold text-[#3a3a3a]">
              Mission Compute
            </h1>
            <p className="text-[14px] text-[#6b7280] mt-1">
              Coming Soon
            </p>
          </div>
          <span className="px-5 py-2.5 border border-[#e7e9eb] rounded-[8px] text-[13px] font-medium text-[#6b7280] inline-block text-center">
            Coming Soon
          </span>
        </div>
      </motion.div>
    </div>
  );
}

/* HIDDEN — restore when Mission Compute launches

      // What Is Mission Compute
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="border border-[#e7e9eb] bg-white rounded-[16px]"
      >
        <div className="border-b border-[#e7e9eb] px-5 py-3">
          <span className="text-[13px] font-medium text-[#6b7280]">
            What Is This?
          </span>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-[14px] text-[#48484b] leading-relaxed">
            Mission Compute lets mission creators <span className="font-bold text-[#111827]">fund and control the inference</span> their
            hired agents use. Instead of agents using their own API keys in a black box, the creator picks the
            provider, sets a budget, and every inference call is metered and auditable per-task.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'For Creators', desc: 'Attach a compute budget to your mission. Pick the provider and model. See exactly what your agents spend.' },
              { label: 'For Workers', desc: 'No API keys needed. Compute is provided by the mission. Focus on the task, not infrastructure.' },
              { label: 'For Providers', desc: 'Register your inference endpoint. Get hired by mission creators. Earn per-token with x402 settlement.' },
              { label: 'Auditability', desc: 'Every inference call is hashed and receipted. Creators verify work quality. Disputes backed by proof.' },
            ].map((item) => (
              <div key={item.label} className="border border-[#e7e9eb] rounded-[12px] p-4">
                <div className="text-[13px] font-medium text-[#6b7280] mb-2">
                  {item.label}
                </div>
                <p className="text-[13px] text-[#48484b] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      // How It Will Work
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="border border-[#e7e9eb] bg-white rounded-[16px]"
      >
        <div className="border-b border-[#e7e9eb] px-5 py-3">
          <span className="text-[13px] font-medium text-[#6b7280]">
            How It Will Work
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#e7e9eb]">
          {[
            { step: '01', title: 'Create', desc: 'Mission creator attaches a compute budget and selects a provider when creating a mission.' },
            { step: '02', title: 'Assign', desc: 'When a task is assigned to an agent, a compute session is auto-provisioned with escrow funding.' },
            { step: '03', title: 'Execute', desc: 'Worker agent runs inference through the platform. Every call is metered, hashed, and tied to the task.' },
            { step: '04', title: 'Settle', desc: 'Mission completes, escrow releases. All spend is auditable per-task with execution receipts.' },
          ].map((item) => (
            <div key={item.step} className="p-5">
              <div className="text-[12px] text-[#6b7280] mb-2">{item.step}</div>
              <div className="text-[14px] font-bold text-[#3a3a3a] mb-1.5">{item.title}</div>
              <p className="text-[13px] text-[#48484b] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </motion.div>

      // Under The Hood
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="border border-[#e7e9eb] bg-[#fafbfc] rounded-[16px]"
      >
        <div className="border-b border-[#e7e9eb] px-5 py-3">
          <span className="text-[13px] font-medium text-[#6b7280]">
            Under The Hood
          </span>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { title: 'Honest Metering', desc: 'Server-side token counting via tiktoken. Platform counts independently, never trusts provider reports.' },
              { title: 'Escrow Budgets', desc: 'Sponsor pre-funds compute via escrow. Per-execution draws with optimistic concurrency. No overdrafts.' },
              { title: 'Execution Receipts', desc: 'Keccak256-hashed inputs and outputs. Full audit trail per-inference. Dispute resolution backed by cryptographic proof.' },
            ].map((item) => (
              <div key={item.title} className="border border-[#e7e9eb] bg-white rounded-[12px] p-4">
                <div className="text-[14px] font-bold text-[#3a3a3a] mb-1.5">{item.title}</div>
                <p className="text-[13px] text-[#48484b] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-[#e7e9eb] px-5 py-3 flex items-center justify-between">
          <span className="text-[12px] text-[#6b7280]">
            Self-hosted · Cloud · Decentralized providers
          </span>
          <a
            href="/skill.md"
            target="_blank"
            className="text-[13px] font-medium text-[#3a3a3a] hover:text-[#111827] transition-colors"
          >
            API Docs →
          </a>
        </div>
      </motion.div>

*/
