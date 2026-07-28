// Chain & token icon components using official branding images
// Images stored in /public/tokens/

import Image from 'next/image';

export function USDCIcon({ size = 24 }: { size?: number }) {
  return (
    <Image
      src="/tokens/usdc-base.png"
      alt="USDC"
      width={size}
      height={size}
      className="rounded-full"
      unoptimized
    />
  );
}

export function BaseIcon({ size = 24 }: { size?: number }) {
  return (
    <Image
      src="/tokens/chain-base.png"
      alt="Base"
      width={size}
      height={size}
      className="rounded-full"
      unoptimized
    />
  );
}

export function PolygonIcon({ size = 24 }: { size?: number }) {
  return (
    <Image
      src="/tokens/chain-polygon.png"
      alt="Polygon"
      width={size}
      height={size}
      className="rounded-full"
      unoptimized
    />
  );
}

export function EthereumIcon({ size = 24 }: { size?: number }) {
  return (
    <Image
      src="/tokens/chain-ethereum.png"
      alt="Ethereum"
      width={size}
      height={size}
      className="rounded-full"
      unoptimized
    />
  );
}

export function RobinhoodIcon({ size = 24 }: { size?: number }) {
  return (
    <Image
      src="/tokens/chain-robinhood.png"
      alt="Robinhood"
      width={size}
      height={size}
      className="rounded-full"
      unoptimized
    />
  );
}

export function OptimismIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="12" fill="#FE0420"/>
      <path fill="#fff" fillRule="evenodd" d="M3.966 15.8q.98.7 2.512.7 1.854 0 2.962-.838 1.107-.849 1.558-2.562.27-1.05.464-2.162a4 4 0 0 0 .064-.663q0-.874-.45-1.5a2.7 2.7 0 0 0-1.237-.95Q9.053 7.5 8.062 7.5q-3.645 0-4.521 3.438a40 40 0 0 0-.477 2.162 4.4 4.4 0 0 0-.064.675q0 1.313.966 2.025m4.65-2.775c-.247.957-.927 1.58-1.958 1.58-1.02 0-1.369-.69-1.185-1.58q.231-1.212.464-2.05c.266-1.034.89-1.58 1.957-1.58 1.016 0 1.349.68 1.172 1.58a30 30 0 0 1-.45 2.05m3.903 3.385q.075.09.212.09h1.704q.126 0 .238-.09a.37.37 0 0 0 .138-.231l.538-2.521h1.734c1.094 0 1.95-.53 2.577-1.002q.951-.707 1.265-2.186.075-.347.075-.669q0-1.117-.852-1.71-.84-.591-2.23-.591h-3.332a.38.38 0 0 0-.238.09.37.37 0 0 0-.138.231l-1.73 8.358a.3.3 0 0 0 .038.231m6.088-5.966c-.156.689-.756 1.32-1.461 1.32h-1.44l.496-2.37h1.503c.512 0 .94.102.94.665q0 .167-.038.385" clipRule="evenodd"/>
    </svg>
  );
}

export function ArbitrumIcon({ size = 24 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="none" viewBox="0 0 24 24">
      <path fill="#213147" d="M4.515 8.471v7.056c0 .45.245.867.64 1.092l6.205 3.529a1.3 1.3 0 0 0 1.28 0l6.203-3.53c.396-.224.64-.64.64-1.09V8.47c0-.45-.244-.867-.64-1.091L12.64 3.85a1.3 1.3 0 0 0-1.28 0L5.155 7.38a1.25 1.25 0 0 0-.639 1.091"/>
      <path fill="#12AAFF" d="m13.353 13.368-.885 2.39a.3.3 0 0 0 0 .205l1.523 4.112 1.76-1.001-2.113-5.706a.152.152 0 0 0-.285 0m1.774-4.019a.152.152 0 0 0-.285 0l-.885 2.39a.3.3 0 0 0 0 .205l2.494 6.732 1.761-1.001z"/>
      <path fill="#9DCCED" d="M11.998 4.115a.3.3 0 0 1 .126.033l6.715 3.818a.25.25 0 0 1 .126.214v7.635c0 .089-.048.17-.126.214l-6.715 3.819a.25.25 0 0 1-.126.032.3.3 0 0 1-.125-.032l-6.715-3.815a.25.25 0 0 1-.126-.215V8.182c0-.089.048-.17.126-.215l6.715-3.818a.26.26 0 0 1 .125-.034m0-1.115c-.238 0-.478.06-.692.183L4.593 7A1.36 1.36 0 0 0 3.9 8.182v7.635c0 .487.264.938.693 1.181l6.714 3.819a1.41 1.41 0 0 0 1.386 0l6.714-3.818a1.36 1.36 0 0 0 .693-1.182V8.182A1.36 1.36 0 0 0 19.407 7l-6.716-3.817A1.4 1.4 0 0 0 11.998 3"/>
      <path fill="#213147" d="m7.559 18.685.617-1.666 1.244 1.018-1.163 1.046z"/>
      <path fill="#fff" d="M11.433 7.635H9.731a.3.3 0 0 0-.285.197l-3.649 9.852 1.761 1.001 4.018-10.849a.15.15 0 0 0-.143-.2m2.979-.001h-1.703a.3.3 0 0 0-.284.197l-4.167 11.25 1.761 1 4.535-12.246a.15.15 0 0 0-.142-.2"/>
    </svg>
  );
}

export function BSCIcon({ size = 24 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="none" viewBox="0 0 24 24">
      <path fill="#F0B90B" d="M7.09 5.755 12 3l4.91 2.755-1.8 1.02L12 5.035l-3.105 1.74zm9.82 3.48-1.8-1.02L12 9.955l-3.105-1.74-1.805 1.02v2.035l3.1 1.74v3.475l1.81 1.02 1.805-1.02V13.01l3.105-1.74zm0 5.515v-2.04l-1.8 1.02v2.035zm1.285.72-3.105 1.735v2.04l4.91-2.76v-5.51l-1.805 1.015zM16.39 7.495l1.8 1.02v2.035L20 9.535v-2.04l-1.805-1.02L16.39 7.5zm-6.2 10.45v2.035L12 21l1.805-1.02v-2.03L12 18.965l-1.805-1.02zm-3.1-3.2 1.8 1.02V13.73l-1.8-1.02v2.04zm3.1-7.25L12 8.515l1.805-1.02L12 6.475 10.195 7.5zm-4.385 1.02 1.805-1.02-1.8-1.02L4 7.5v2.04l1.805 1.015zm0 3.475L4 10.975v5.51l4.91 2.76V17.2l-3.1-1.735v-3.48z"/>
    </svg>
  );
}

export function getChainIcon(chainName: string, size = 24) {
  const name = chainName.toLowerCase();

  if (name.includes('base')) return <BaseIcon size={size} />;
  if (name.includes('polygon') || name.includes('matic')) return <PolygonIcon size={size} />;
  if (name.includes('robinhood')) return <RobinhoodIcon size={size} />;
  if (name.includes('optimism')) return <OptimismIcon size={size} />;
  if (name.includes('ethereum') || name.includes('eth')) return <EthereumIcon size={size} />;
  if (name.includes('arbitrum')) return <ArbitrumIcon size={size} />;
  if (name.includes('bsc') || name.includes('bnb') || name.includes('binance')) return <BSCIcon size={size} />;
  if (name.includes('hyperliquid') || name.includes('hl')) return <img src="/tokens/chain-hyperliquid.png" alt="Hyperliquid" width={size} height={size} className="rounded-full" />;

  // Default fallback
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-black/10 flex items-center justify-center"
    >
      <span className="text-xs font-semibold text-black/40" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
        {chainName[0]?.toUpperCase()}
      </span>
    </div>
  );
}
