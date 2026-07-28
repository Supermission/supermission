"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useUIStore } from "@/lib/store/ui";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/components/auth/require-auth";
import { useAgentStatusStore, type AgentId } from "@/lib/stores/agent-status";

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

const AGENT_ITEMS: Array<{ href: string; label: string; desc: string; avatar: string; statusId: AgentId }> = [
  { href: "/defai", label: "Delphi", desc: "DeFi Agent", avatar: "/avatars/delphi.svg", statusId: "delphi" },
  { href: "/markets?tab=agent", label: "Oracle", desc: "Prediction Markets", avatar: "/avatars/oracle.svg", statusId: "oracle" },
  { href: "/security", label: "Securo", desc: "Security Audit", avatar: "/avatars/securo.svg", statusId: "securo" },
  { href: "/perps?tab=hyperion", label: "Hyperion", desc: "Perpetual Trading", avatar: "/avatars/hyperion.svg", statusId: "hyperion" },
  { href: "/roro", label: "Roro", desc: "Stocks & Options", avatar: "/avatars/roro.svg", statusId: "roro" },
];


/* ── Icon set — 22×22 · stroke-based · clean outlines ── */

function NavIcon({ id, active }: { id: string; active: boolean }) {
  const color = active ? "#ffffff" : "#777777";
  const sw = 1.6;

  switch (id) {
    /* Markets — candlestick chart */
    case "markets":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <line x1="7" y1="4" x2="7" y2="20" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <rect x="5" y="8" width="4" height="6" rx="1" stroke={color} strokeWidth={sw} fill={active ? "rgba(255,255,255,0.15)" : "none"} />
          <line x1="17" y1="4" x2="17" y2="20" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <rect x="15" y="10" width="4" height="5" rx="1" stroke={color} strokeWidth={sw} fill={active ? "rgba(255,255,255,0.15)" : "none"} />
        </svg>
      );

    /* Agents — bot/robot head */
    case "agents":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="8" width="16" height="12" rx="3" stroke={color} strokeWidth={sw} />
          <circle cx="9" cy="14" r="1.5" fill={color} />
          <circle cx="15" cy="14" r="1.5" fill={color} />
          <line x1="12" y1="4" x2="12" y2="8" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <circle cx="12" cy="3.5" r="1.5" stroke={color} strokeWidth={sw} />
          <line x1="1" y1="13" x2="4" y2="13" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <line x1="20" y1="13" x2="23" y2="13" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </svg>
      );

    /* Dashboard — grid */
    case "dashboard":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="8" height="8" rx="2" stroke={color} strokeWidth={sw} fill={active ? "rgba(255,255,255,0.08)" : "none"} />
          <rect x="13" y="3" width="8" height="8" rx="2" stroke={color} strokeWidth={sw} fill={active ? "rgba(255,255,255,0.08)" : "none"} />
          <rect x="3" y="13" width="8" height="8" rx="2" stroke={color} strokeWidth={sw} fill={active ? "rgba(255,255,255,0.08)" : "none"} />
          <rect x="13" y="13" width="8" height="8" rx="2" stroke={color} strokeWidth={sw} fill={active ? "rgba(255,255,255,0.08)" : "none"} />
        </svg>
      );

    /* Perps — bar chart */
    case "perps":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M2 20h20" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <path d="M5 20V10" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <path d="M9 20V6" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <path d="M13 20V12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <path d="M17 20V4" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <path d="M21 20V8" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </svg>
      );

    /* Blog — document */
    case "blog":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="3" width="16" height="18" rx="2.5" stroke={color} strokeWidth={sw} fill={active ? "rgba(255,255,255,0.08)" : "none"} />
          <path d="M8 8h8M8 12h5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </svg>
      );

    default:
      return null;
  }
}

export function MobileNav() {
  const pathname = usePathname();
  const hideMobileNav = useUIStore((state) => state.hideMobileNav);
  const auth = useAuth();
  const isApproved = !!auth?.authenticated;

  const [scrollHidden, setScrollHidden] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const agentStatuses = useAgentStatusStore(s => s.statuses);
  const lastScrollY = useRef(0);
  const popupRef = useRef<HTMLDivElement>(null);
  const agentsBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (y > lastScrollY.current && y > 80) setScrollHidden(true);
      else setScrollHidden(false);
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!agentsOpen) return;
    const handler = (e: TouchEvent | MouseEvent) => {
      const target = e.target as Node;
      if (
        popupRef.current && !popupRef.current.contains(target) &&
        agentsBtnRef.current && !agentsBtnRef.current.contains(target)
      ) {
        setAgentsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [agentsOpen]);

  if (hideMobileNav || !isApproved) return null;

  const isActive = (path: string) =>
    path === "/" ? pathname === "/" : pathname.startsWith(path);

  const isAgentActive = AGENT_ITEMS.some(a => isActive(a.href.split('?')[0]));

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50"
      style={{
        transform: scrollHidden
          ? "translateY(calc(100% + 16px))"
          : "translateY(0)",
        willChange: "transform",
        transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Agents popup */}
      {agentsOpen && (
        <div
          ref={popupRef}
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            right: 0,
            marginBottom: 4,
            padding: "0 12px",
          }}
        >
          <div
            style={{
              background: "#252525",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.1)",
              padding: "6px",
              boxShadow: "0 -4px 24px rgba(0,0,0,0.3)",
            }}
          >
            {AGENT_ITEMS.map((agent) => {
              const active = isActive(agent.href) && isAgentActive;
              return (
                <Link
                  key={agent.href}
                  href={agent.href}
                  onClick={() => setAgentsOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-[10px] transition-colors"
                  style={{
                    background: active ? "rgba(255,255,255,0.1)" : "transparent",
                  }}
                >
                  <Image src={agent.avatar} alt={agent.label} width={32} height={32} className="rounded-[6px] flex-shrink-0" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        style={{
                          fontFamily: FONT,
                          fontSize: 14,
                          fontWeight: 600,
                          color: active ? "#ffffff" : "#cccccc",
                        }}
                      >
                        {agent.label}
                      </span>
                      {agentStatuses[agent.statusId] !== 'unknown' && (
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: agentStatuses[agent.statusId] === 'ok' ? '#22c55e' : '#ef4444',
                            display: 'inline-block',
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        color: "#777",
                        marginTop: 1,
                      }}
                    >
                      {agent.desc}
                    </span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M6 4l4 4-4 4" stroke={active ? "#fff" : "#666"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div
        style={{
          background: "#1a1a1a",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div
          className="flex items-center justify-around"
          style={{ height: 64 }}
        >
          {/* Markets */}
          <Link
            href="/markets"
            className="flex flex-col items-center justify-center flex-1"
            style={{ gap: 4, WebkitTapHighlightColor: "transparent", paddingTop: 8, paddingBottom: 4 }}
          >
            <NavIcon id="markets" active={isActive("/markets")} />
            <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: isActive("/markets") ? 700 : 500, letterSpacing: "0.02em", lineHeight: 1, color: isActive("/markets") ? "#ffffff" : "#777777", transition: "color 0.2s ease" }}>
              Markets
            </span>
          </Link>

          {/* Perps */}
          <Link
            href="/perps"
            className="flex flex-col items-center justify-center flex-1"
            style={{ gap: 4, WebkitTapHighlightColor: "transparent", paddingTop: 8, paddingBottom: 4 }}
          >
            <NavIcon id="perps" active={isActive("/perps")} />
            <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: isActive("/perps") ? 700 : 500, letterSpacing: "0.02em", lineHeight: 1, color: isActive("/perps") ? "#ffffff" : "#777777", transition: "color 0.2s ease" }}>
              Perps
            </span>
          </Link>

          {/* Agents */}
          <button
            ref={agentsBtnRef}
            onClick={() => setAgentsOpen(!agentsOpen)}
            className="flex flex-col items-center justify-center flex-1"
            style={{ gap: 4, WebkitTapHighlightColor: "transparent", paddingTop: 8, paddingBottom: 4, background: "none", border: "none" }}
          >
            <NavIcon id="agents" active={isAgentActive} />
            <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: isAgentActive ? 700 : 500, letterSpacing: "0.02em", lineHeight: 1, color: isAgentActive ? "#ffffff" : "#777777", transition: "color 0.2s ease" }}>
              Agents
            </span>
          </button>

          {/* Dashboard */}
          <Link
            href="/dashboard"
            className="flex flex-col items-center justify-center flex-1"
            style={{ gap: 4, WebkitTapHighlightColor: "transparent", paddingTop: 8, paddingBottom: 4 }}
          >
            <NavIcon id="dashboard" active={isActive("/dashboard")} />
            <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: isActive("/dashboard") ? 700 : 500, letterSpacing: "0.02em", lineHeight: 1, color: isActive("/dashboard") ? "#ffffff" : "#777777", transition: "color 0.2s ease" }}>
              Dashboard
            </span>
          </Link>

          {/* Blog */}
          <Link
            href="/blog"
            className="flex flex-col items-center justify-center flex-1"
            style={{ gap: 4, WebkitTapHighlightColor: "transparent", paddingTop: 8, paddingBottom: 4 }}
          >
            <NavIcon id="blog" active={isActive("/blog")} />
            <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: isActive("/blog") ? 700 : 500, letterSpacing: "0.02em", lineHeight: 1, color: isActive("/blog") ? "#ffffff" : "#777777", transition: "color 0.2s ease" }}>
              Blog
            </span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
