'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useHLTrade, useHLMarkets } from '@/lib/hyperliquid/hooks';
import { formatPrice, estimateLiqPrice } from '@/lib/hyperliquid/utils';
import { toast } from 'sonner';
import { PerpsLeverageSlider } from './PerpsLeverageSlider';

type OrderSide = 'long' | 'short';
type OrderType = 'market' | 'limit';

const PRIMARY_ORDER_TYPES: { id: OrderType; label: string }[] = [
  { id: 'market', label: 'Market' },
  { id: 'limit', label: 'Limit' },
];

const SL_RANGE = { min: 1, max: 50, step: 0.5 };
const TP_RANGE = { min: 1, max: 100, step: 0.5 };

interface PerpsTradePanelProps {
  coin: string;
  maxLeverage: number;
  limitPrice?: string;
  isSpot?: boolean;
  compact?: boolean;
  darkMode?: boolean;
}

const FONT = 'var(--font-bricolage), Bricolage Grotesque, sans-serif';

let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new AudioContext();
  }
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume();
  }
  return _audioCtx;
}

export function playOrderSound(isLong: boolean) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';

    if (isLong) {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.15);
    } else {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 0.15);
    }
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // Audio not available
  }
}


export function PerpsTradePanel({ coin, maxLeverage, limitPrice, isSpot = false, compact = false, darkMode = false }: PerpsTradePanelProps) {
  const { placeOrder, isExecuting, error } = useHLTrade();
  const { markets } = useHLMarkets();

  const market = useMemo(
    () => markets.find((m) => m.coin === coin),
    [markets, coin],
  );

  const markPx = market ? parseFloat(market.midPx) : 0;
  const decimals = markPx >= 1000 ? 2 : markPx >= 1 ? 4 : 6;

  const prevMarkPx = useRef(markPx);
  const [markPxDirection, setMarkPxDirection] = useState<'up' | 'down' | 'neutral'>('neutral');
  useEffect(() => {
    if (markPx > prevMarkPx.current) setMarkPxDirection('up');
    else if (markPx < prevMarkPx.current) setMarkPxDirection('down');
    prevMarkPx.current = markPx;
  }, [markPx]);

  const [side, setSide] = useState<OrderSide>('long');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [price, setPrice] = useState('');
  const [size, setSize] = useState('');
  const [sizeMode, setSizeMode] = useState<'coin' | 'usd'>('usd');
  const [leverage, setLeverage] = useState(isSpot ? 1 : 5);
  const [slEnabled, setSlEnabled] = useState(false);
  const [slPct, setSlPct] = useState<number>(5);
  const [slInputMode, setSlInputMode] = useState<'pct' | 'price'>('pct');
  const [slDirectPrice, setSlDirectPrice] = useState('');
  const [tpEnabled, setTpEnabled] = useState(false);
  const [tpPct, setTpPct] = useState<number>(10);
  const [tpInputMode, setTpInputMode] = useState<'pct' | 'price'>('pct');
  const [tpDirectPrice, setTpDirectPrice] = useState('');

  // Update price from orderbook click
  useEffect(() => {
    if (limitPrice) {
      setPrice(limitPrice);
      if (orderType === 'market') {
        setOrderType('limit');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitPrice]);

  const isBuy = side === 'long';
  const isMarket = orderType === 'market';

  // Size in both units
  const rawSize = parseFloat(size) || 0;
  const priceNum = isMarket ? markPx : parseFloat(price) || 0;
  const sizeInCoin = sizeMode === 'coin' ? rawSize : (priceNum > 0 ? rawSize / priceNum : 0);
  const sizeNum = sizeInCoin; // for order execution
  const usdValue = sizeMode === 'usd' ? rawSize : rawSize * priceNum;

  // Estimated calculations
  const marginRequired = priceNum > 0 && leverage > 0 ? usdValue / leverage : 0;
  const estimatedFee = usdValue * 0.00035; // ~0.035% taker
  const estimatedLiqPrice = useMemo(
    () => estimateLiqPrice(priceNum, leverage, isBuy),
    [priceNum, leverage, isBuy],
  );

  // Compute SL/TP prices from percentages
  const entryPrice = isMarket ? markPx : priceNum;
  const slPrice = useMemo(() => {
    if (!slEnabled || entryPrice <= 0) return 0;
    if (slInputMode === 'price') return parseFloat(slDirectPrice) || 0;
    return isBuy ? entryPrice * (1 - slPct / 100) : entryPrice * (1 + slPct / 100);
  }, [slEnabled, entryPrice, slPct, isBuy, slInputMode, slDirectPrice]);
  const tpPrice = useMemo(() => {
    if (!tpEnabled || entryPrice <= 0) return 0;
    if (tpInputMode === 'price') return parseFloat(tpDirectPrice) || 0;
    return isBuy ? entryPrice * (1 + tpPct / 100) : entryPrice * (1 - tpPct / 100);
  }, [tpEnabled, entryPrice, tpPct, isBuy, tpInputMode, tpDirectPrice]);

  // Distance from entry to liquidation as a percentage (e.g. 3.2 for 3.2% away)
  const liqDistancePct = useMemo(() => {
    if (priceNum <= 0 || estimatedLiqPrice <= 0) return 0;
    return Math.abs((estimatedLiqPrice - priceNum) / priceNum * 100);
  }, [priceNum, estimatedLiqPrice]);
  const liqIsDangerous = liqDistancePct > 0 && liqDistancePct <= 20;

  // Potential loss/profit calculations
  const slPctEffective = slInputMode === 'price' && entryPrice > 0 && slPrice > 0
    ? Math.abs((slPrice - entryPrice) / entryPrice * 100)
    : slPct;
  const tpPctEffective = tpInputMode === 'price' && entryPrice > 0 && tpPrice > 0
    ? Math.abs((tpPrice - entryPrice) / entryPrice * 100)
    : tpPct;
  // Position P&L = position size * price move %
  const slPotentialLoss = slEnabled && usdValue > 0 ? usdValue * (slPctEffective / 100) : 0;
  const tpPotentialProfit = tpEnabled && usdValue > 0 ? usdValue * (tpPctEffective / 100) : 0;
  // % impact on invested margin (accounts for leverage)
  const slMarginPct = slEnabled && marginRequired > 0 ? (slPotentialLoss / marginRequired) * 100 : 0;
  const tpMarginPct = tpEnabled && marginRequired > 0 ? (tpPotentialProfit / marginRequired) * 100 : 0;
  const riskReward = slPotentialLoss > 0 && tpPotentialProfit > 0
    ? (tpPotentialProfit / slPotentialLoss).toFixed(1)
    : null;
  // Warning: SL is beyond liquidation — user's stop would never fire
  const slBeyondLiq = slEnabled && liqDistancePct > 0 && slPctEffective >= liqDistancePct;

  const handleSubmit = async () => {
    if (!sizeNum || (!isMarket && !priceNum)) return;

    // Spot needs wider slippage (3%) + Ioc; perps use FrontendMarket with 0.5%
    const slippage = isSpot ? 0.03 : 0.005;
    const limitPx = isMarket
      ? isBuy
        ? markPx * (1 + slippage)
        : markPx * (1 - slippage)
      : priceNum;

    const orderTypeParam = {
      limit: { tif: isMarket ? (isSpot ? 'Ioc' as const : 'FrontendMarket' as const) : 'Gtc' as const },
    };

    try {
      await placeOrder({
        coin,
        isBuy,
        sz: sizeNum,
        limitPx: limitPx,
        orderType: orderTypeParam,
        reduceOnly: false,
        // Without this the opening order used the account's standing HL leverage
        // (often 20x) instead of the slider value — margin/liq shown to the user
        // did not match the real position. (SL/TP below are reduceOnly closes.)
        leverage,
      });

      // Play sound immediately after main order succeeds
      playOrderSound(isBuy);

      // Place SL order if enabled — use 10% slippage on limit price for guaranteed fill
      if (slEnabled && slPrice > 0 && !isSpot) {
        const slLimitPx = isBuy ? slPrice * 0.9 : slPrice * 1.1;
        await placeOrder({
          coin,
          isBuy: !isBuy,
          sz: sizeNum,
          limitPx: slLimitPx,
          orderType: { trigger: { triggerPx: slPrice.toString(), isMarket: true, tpsl: 'sl' } },
          reduceOnly: true,
        });
      }

      // Place TP order if enabled — use 10% slippage on limit price for guaranteed fill
      if (tpEnabled && tpPrice > 0 && !isSpot) {
        const tpLimitPx = isBuy ? tpPrice * 0.9 : tpPrice * 1.1;
        await placeOrder({
          coin,
          isBuy: !isBuy,
          sz: sizeNum,
          limitPx: tpLimitPx,
          orderType: { trigger: { triggerPx: tpPrice.toString(), isMarket: true, tpsl: 'tp' } },
          reduceOnly: true,
        });
      }

      // Show toast on success
      const displayPrice = isMarket ? markPx : priceNum;
      const dp = displayPrice >= 1000 ? 2 : displayPrice >= 1 ? 4 : 6;
      let msg = `${isBuy ? 'Long' : 'Short'} ${coin} · $${usdValue.toFixed(2)} at $${formatPrice(displayPrice, dp)} · ${leverage}x`;
      if (slEnabled) msg += ` · SL ${slPct}%`;
      if (tpEnabled) msg += ` · TP ${tpPct}%`;
      toast.success(msg);
    } catch {
      // Error already handled by useHLTrade hook
    }
  };

  return (
    <div className={`overflow-hidden h-full flex flex-col ${darkMode ? 'bg-[#0c0c0d]' : 'bg-white'}`}>
      {/* Side toggle — segmented control with sliding indicator */}
      <div className={`${compact ? 'p-2' : 'p-3'}`}>
        <div
          className={`relative flex p-1 rounded-[10px] ${
            darkMode ? 'bg-white/[0.04] ring-1 ring-inset ring-white/[0.06]' : 'bg-[#f4f4f5]'
          }`}
        >
          {/* Sliding indicator */}
          <div
            className={`absolute top-1 bottom-1 rounded-[8px] transition-all duration-200 ease-out ${
              isBuy
                ? darkMode ? 'bg-emerald-500' : 'bg-emerald-500'
                : darkMode ? 'bg-rose-500' : 'bg-rose-500'
            }`}
            style={{
              left: isBuy ? '0.25rem' : '50%',
              right: isBuy ? '50%' : '0.25rem',
              boxShadow: darkMode ? 'inset 0 1px 0 rgba(255,255,255,0.12)' : 'inset 0 1px 0 rgba(255,255,255,0.18)',
            }}
          />
          <button
            onClick={() => setSide('long')}
            className={`relative z-10 flex-1 font-bold uppercase tracking-wider transition-colors cursor-pointer ${
              compact ? 'py-2.5 text-[12px]' : 'py-2.5 text-[13px]'
            } ${
              isBuy
                ? 'text-white'
                : darkMode ? 'text-white/45 hover:text-white/70' : 'text-[#6b7280] hover:text-[#1a1a1a]'
            }`}
            style={{ fontFamily: FONT }}
          >
            {isSpot ? 'Buy' : 'Long'}
          </button>
          <button
            onClick={() => setSide('short')}
            className={`relative z-10 flex-1 font-bold uppercase tracking-wider transition-colors cursor-pointer ${
              compact ? 'py-2.5 text-[12px]' : 'py-2.5 text-[13px]'
            } ${
              !isBuy
                ? 'text-white'
                : darkMode ? 'text-white/45 hover:text-white/70' : 'text-[#6b7280] hover:text-[#1a1a1a]'
            }`}
            style={{ fontFamily: FONT }}
          >
            {isSpot ? 'Sell' : 'Short'}
          </button>
        </div>
      </div>

      <div className={`flex-1 flex flex-col overflow-y-auto ${compact ? 'px-3 pb-2 space-y-3' : 'px-4 pb-4 space-y-5'}`}>
        {/* Order type */}
        <div>
          <label
            className={`text-[12px] font-medium uppercase tracking-wider mb-1.5 block ${darkMode ? 'text-white/40' : 'text-[#9ca3af]'}`}
            style={{ fontFamily: FONT }}
          >
            Order Type
          </label>
          <div
            className={`perps-order-type-toggle relative flex p-1 rounded-[10px] ${
              darkMode ? 'bg-white/[0.04] ring-1 ring-inset ring-white/[0.06]' : 'bg-[#f4f4f5]'
            }`}
          >
            <div
              className={`absolute top-1 bottom-1 rounded-[7px] transition-all duration-200 ease-out ${
                darkMode
                  ? 'bg-white/[0.10] ring-1 ring-inset ring-white/[0.08]'
                  : 'bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
              }`}
              style={{
                left: orderType === 'market' ? '0.25rem' : '50%',
                right: orderType === 'market' ? '50%' : '0.25rem',
              }}
            />
            {PRIMARY_ORDER_TYPES.map((ot) => (
              <button
                key={ot.id}
                onClick={() => setOrderType(ot.id)}
                aria-pressed={orderType === ot.id}
                className={`relative z-10 flex-1 py-1.5 text-[12px] font-semibold transition-colors cursor-pointer ${
                  orderType === ot.id
                    ? darkMode ? 'text-white' : 'text-[#1a1a1a]'
                    : darkMode ? 'text-white/45 hover:text-white/70' : 'text-[#6b7280] hover:text-[#1a1a1a]'
                }`}
                style={{ fontFamily: FONT }}
              >
                {ot.label}
              </button>
            ))}
          </div>
          {/* Stop Loss / Take Profit — unified risk management */}
          {!isSpot && (() => {
            const SL_PRESETS = [2, 5, 10, 20];
            const TP_PRESETS = [5, 10, 25, 50];
            const renderRow = (kind: 'sl' | 'tp') => {
              const isSL = kind === 'sl';
              const enabled = isSL ? slEnabled : tpEnabled;
              const setEnabled = isSL ? setSlEnabled : setTpEnabled;
              const pct = isSL ? slPct : tpPct;
              const setPct = isSL ? setSlPct : setTpPct;
              const inputMode = isSL ? slInputMode : tpInputMode;
              const setInputMode = isSL ? setSlInputMode : setTpInputMode;
              const directPrice = isSL ? slDirectPrice : tpDirectPrice;
              const setDirectPrice = isSL ? setSlDirectPrice : setTpDirectPrice;
              const triggerPrice = isSL ? slPrice : tpPrice;
              const pctEffective = isSL ? slPctEffective : tpPctEffective;
              const presets = isSL ? SL_PRESETS : TP_PRESETS;
              const accentText = isSL
                ? (darkMode ? 'text-rose-400' : 'text-rose-500')
                : (darkMode ? 'text-emerald-400' : 'text-emerald-600');
              const accentRing = enabled
                ? (isSL ? 'ring-rose-500/40' : 'ring-emerald-500/40')
                : (darkMode ? 'ring-white/[0.06]' : 'ring-black/[0.05]');
              const accentBg = isSL ? 'bg-rose-500' : 'bg-emerald-500';
              const label = isSL ? 'Stop Loss' : 'Take Profit';
              const sign = isSL ? '−' : '+';
              const placeholder = isSL
                ? formatPrice(entryPrice * (isBuy ? 0.95 : 1.05), decimals)
                : formatPrice(entryPrice * (isBuy ? 1.10 : 0.90), decimals);

              return (
                <div
                  className={`rounded-[10px] ring-1 ring-inset transition-colors ${accentRing} ${
                    enabled
                      ? darkMode ? 'bg-white/[0.04]' : 'bg-white'
                      : darkMode ? 'bg-white/[0.02]' : 'bg-[#fafafa]'
                  }`}
                >
                  {/* Header row — entire row is the toggle */}
                  <button
                    type="button"
                    onClick={() => setEnabled(!enabled)}
                    className="w-full flex items-center justify-between px-3 py-2.5 cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2">
                      {/* Custom indicator dot */}
                      <span
                        className={`relative w-3.5 h-3.5 rounded-[4px] ring-1 ring-inset transition-colors flex items-center justify-center ${
                          enabled
                            ? `${accentBg} ${isSL ? 'ring-rose-500' : 'ring-emerald-500'}`
                            : darkMode ? 'ring-white/20 bg-transparent' : 'ring-black/15 bg-transparent'
                        }`}
                      >
                        {enabled && <span className="w-1.5 h-1.5 rounded-[1px] bg-white" />}
                      </span>
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wider ${
                          enabled ? accentText : darkMode ? 'text-white/45' : 'text-[#6b7280]'
                        }`}
                        style={{ fontFamily: FONT }}
                      >
                        {label}
                      </span>
                    </div>
                    {enabled && triggerPrice > 0 ? (
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className={`text-[15px] font-bold tabular-nums ${darkMode ? 'text-white' : 'text-[#1a1a1a]'}`}
                          style={{ fontFamily: FONT, letterSpacing: '-0.01em' }}
                        >
                          ${formatPrice(triggerPrice, decimals)}
                        </span>
                        <span className={`text-[10px] font-semibold tabular-nums ${accentText}`} style={{ fontFamily: FONT }}>
                          {sign}{pctEffective.toFixed(1)}%
                        </span>
                      </div>
                    ) : (
                      <span
                        className={`text-[10px] font-medium uppercase tracking-wider ${darkMode ? 'text-white/30' : 'text-[#9ca3af]'}`}
                        style={{ fontFamily: FONT }}
                      >
                        Off
                      </span>
                    )}
                  </button>

                  {enabled && (
                    <div className={`px-3 pb-2.5 pt-0 flex flex-col gap-2 border-t ${darkMode ? 'border-white/[0.05]' : 'border-black/[0.04]'}`}>
                      {/* Mode segment + presets row */}
                      <div className="flex items-center gap-2 pt-2">
                        {/* %/$ sliding pill — matches order-type segment */}
                        <div
                          className={`relative flex p-0.5 rounded-[7px] flex-shrink-0 ${
                            darkMode ? 'bg-white/[0.04] ring-1 ring-inset ring-white/[0.06]' : 'bg-[#f4f4f5]'
                          }`}
                        >
                          <div
                            className={`absolute top-0.5 bottom-0.5 rounded-[5px] transition-all duration-200 ease-out ${
                              darkMode
                                ? 'bg-white/[0.10] ring-1 ring-inset ring-white/[0.08]'
                                : 'bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                            }`}
                            style={{
                              left: inputMode === 'pct' ? '0.125rem' : '50%',
                              right: inputMode === 'pct' ? '50%' : '0.125rem',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setInputMode('pct')}
                            className={`relative z-10 px-2.5 py-1 text-[10px] font-bold transition-colors cursor-pointer ${
                              inputMode === 'pct'
                                ? darkMode ? 'text-white' : 'text-[#1a1a1a]'
                                : darkMode ? 'text-white/45' : 'text-[#6b7280]'
                            }`}
                            style={{ fontFamily: FONT }}
                          >%</button>
                          <button
                            type="button"
                            onClick={() => setInputMode('price')}
                            className={`relative z-10 px-2.5 py-1 text-[10px] font-bold transition-colors cursor-pointer ${
                              inputMode === 'price'
                                ? darkMode ? 'text-white' : 'text-[#1a1a1a]'
                                : darkMode ? 'text-white/45' : 'text-[#6b7280]'
                            }`}
                            style={{ fontFamily: FONT }}
                          >$</button>
                        </div>

                        {inputMode === 'pct' ? (
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            {presets.map((p) => {
                              const active = pct === p;
                              return (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => setPct(p)}
                                  className={`flex-1 px-1 py-1 rounded-[6px] text-[10px] font-bold tabular-nums transition-colors cursor-pointer ${
                                    active
                                      ? `${accentBg} text-white`
                                      : darkMode
                                        ? 'bg-white/[0.04] ring-1 ring-inset ring-white/[0.06] text-white/55 hover:text-white/85'
                                        : 'bg-[#f4f4f5] text-[#6b7280] hover:text-[#1a1a1a]'
                                  }`}
                                  style={{ fontFamily: FONT }}
                                >
                                  {p}%
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className={`flex items-center rounded-[7px] h-[28px] flex-1 min-w-0 ${darkMode ? 'bg-white/[0.04] ring-1 ring-inset ring-white/[0.08]' : 'bg-white ring-1 ring-inset ring-[#e5e7eb]'}`}>
                            <span className={`text-[10px] pl-2 flex-shrink-0 ${darkMode ? 'text-white/30' : 'text-[#bbb]'}`} style={{ fontFamily: FONT }}>$</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={directPrice}
                              onChange={(e) => setDirectPrice(e.target.value)}
                              placeholder={placeholder}
                              className={`w-full px-1.5 text-[11px] font-semibold bg-transparent outline-none tabular-nums ${darkMode ? 'text-white placeholder:text-white/20' : 'text-[#1a1a1a] placeholder:text-[#c7ccd1]'}`}
                              style={{ fontFamily: FONT }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Fine-tune slider — only in % mode, slim and consistent */}
                      {inputMode === 'pct' && (() => {
                        const range = isSL ? SL_RANGE : TP_RANGE;
                        const fillPct = ((pct - range.min) / (range.max - range.min)) * 100;
                        return (
                          <div className="relative h-4 flex items-center group">
                            <div className={`absolute inset-x-0 h-[2px] rounded-full overflow-hidden ${darkMode ? 'bg-white/[0.08]' : 'bg-[#eef0f2]'}`}>
                              <div
                                className={`h-full ${accentBg} transition-all duration-150`}
                                style={{ width: `${fillPct}%` }}
                              />
                            </div>
                            <input
                              type="range"
                              min={range.min}
                              max={range.max}
                              step={range.step}
                              value={pct}
                              onChange={(e) => setPct(Number(e.target.value))}
                              className="absolute inset-x-0 w-full h-4 opacity-0 cursor-pointer z-10"
                            />
                            <div
                              className={`absolute w-3 h-3 rounded-full bg-white transition-transform duration-150 pointer-events-none group-hover:scale-110 group-active:scale-95 ring-2 ${isSL ? 'ring-rose-500' : 'ring-emerald-500'} ${darkMode ? 'shadow-[0_0_0_1px_rgba(0,0,0,0.4)]' : 'shadow-[0_1px_2px_rgba(0,0,0,0.08)]'}`}
                              style={{ left: `calc(${fillPct}% - 6px)` }}
                            />
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            };

            return (
              <div className="flex flex-col gap-2 mt-2">
                {renderRow('sl')}
                {renderRow('tp')}

                {/* Risk / Reward inline indicator */}
                {riskReward && (
                  <div
                    className={`flex items-center justify-between px-3 py-2 rounded-[10px] ring-1 ring-inset ${
                      darkMode ? 'bg-white/[0.03] ring-white/[0.06]' : 'bg-[#fafafa] ring-black/[0.05]'
                    }`}
                  >
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-white/45' : 'text-[#6b7280]'}`}
                      style={{ fontFamily: FONT }}
                    >
                      Risk / Reward
                    </span>
                    <div className="flex items-center gap-2 flex-1 ml-3">
                      {/* Proportional bar */}
                      <div className={`flex-1 h-[3px] rounded-full overflow-hidden flex ${darkMode ? 'bg-white/[0.06]' : 'bg-[#eef0f2]'}`}>
                        {(() => {
                          const rr = parseFloat(riskReward);
                          const total = 1 + rr;
                          const riskW = (1 / total) * 100;
                          const rewardW = (rr / total) * 100;
                          return (
                            <>
                              <div className="h-full bg-rose-500" style={{ width: `${riskW}%` }} />
                              <div className="h-full bg-emerald-500" style={{ width: `${rewardW}%` }} />
                            </>
                          );
                        })()}
                      </div>
                      <span
                        className={`text-[11px] font-bold tabular-nums ${darkMode ? 'text-white' : 'text-[#1a1a1a]'}`}
                        style={{ fontFamily: FONT }}
                      >
                        1 : {riskReward}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Price input — only for non-market orders */}
        {!isMarket && (
          <div>
            <label
              className={`text-[12px] font-medium uppercase tracking-wider mb-1.5 block ${darkMode ? 'text-white/40' : 'text-[#9ca3af]'}`}
              style={{ fontFamily: FONT }}
            >
              Price
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className={`w-full h-11 px-4 pr-16 rounded-[10px] text-[15px] font-medium tabular-nums focus:outline-none transition-colors ${
                  darkMode
                    ? 'bg-white/[0.04] text-white ring-1 ring-inset ring-white/[0.08] focus:ring-white/25 placeholder:text-white/20'
                    : 'bg-white ring-1 ring-inset ring-[#e5e7eb] text-[#1a1a1a] focus:ring-[#1a1a1a] placeholder:text-[#c7ccd1]'
                }`}
                style={{ fontFamily: FONT }}
              />
              <span
                className={`absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-medium ${darkMode ? 'text-white/30' : 'text-[#9ca3af]'}`}
                style={{ fontFamily: FONT }}
              >
                USDC
              </span>
            </div>
          </div>
        )}

        {/* Size input */}
        <div>
          <div className={`flex items-center justify-between ${compact ? 'mb-1.5' : 'mb-1.5'}`}>
            <label
              className={`font-bold uppercase tracking-widest ${compact ? 'text-[9px]' : 'text-[12px]'} ${darkMode ? 'text-white/40' : 'text-[#9ca3af]'}`}
              style={{ fontFamily: FONT }}
            >
              Size
            </label>
            {/* Coin / USD toggle */}
            <div
              className={`relative flex rounded-full p-[2px] ${compact ? 'h-6' : 'h-7'} ${
                darkMode ? 'bg-white/[0.05] ring-1 ring-inset ring-white/[0.06]' : 'bg-[#f4f4f5]'
              }`}
            >
              <div
                className={`absolute top-[2px] bottom-[2px] rounded-full transition-all duration-200 ease-out ${
                  darkMode ? 'bg-white' : 'bg-[#1a1a1a]'
                }`}
                style={{
                  left: sizeMode === 'usd' ? '2px' : '50%',
                  right: sizeMode === 'usd' ? '50%' : '2px',
                }}
              />
              <button
                type="button"
                onClick={() => { setSize(''); setSizeMode('usd'); }}
                className={`relative z-10 px-3 font-bold transition-colors cursor-pointer ${compact ? 'text-[9px]' : 'text-[11px]'} ${
                  sizeMode === 'usd'
                    ? darkMode ? 'text-black' : 'text-white'
                    : darkMode ? 'text-white/45' : 'text-[#6b7280]'
                }`}
                style={{ fontFamily: FONT }}
              >
                USD
              </button>
              <button
                type="button"
                onClick={() => { setSize(''); setSizeMode('coin'); }}
                className={`relative z-10 px-3 font-bold transition-colors cursor-pointer ${compact ? 'text-[9px]' : 'text-[11px]'} ${
                  sizeMode === 'coin'
                    ? darkMode ? 'text-black' : 'text-white'
                    : darkMode ? 'text-white/45' : 'text-[#6b7280]'
                }`}
                style={{ fontFamily: FONT }}
              >
                {coin}
              </button>
            </div>
          </div>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="0.00"
              className={`w-full px-4 pr-16 font-semibold tabular-nums focus:outline-none transition-colors ${
                compact ? 'h-14 text-[22px] rounded-[10px]' : 'h-14 text-[22px] rounded-[10px]'
              } ${
                darkMode
                  ? 'bg-white/[0.04] text-white ring-1 ring-inset ring-white/[0.08] focus:ring-white/25 placeholder:text-white/20'
                  : 'bg-white ring-1 ring-inset ring-[#e5e7eb] text-[#1a1a1a] focus:ring-[#1a1a1a] placeholder:text-[#c7ccd1]'
              }`}
              style={{ fontFamily: FONT, letterSpacing: '-0.01em' }}
            />
            <span
              className={`absolute right-4 top-1/2 -translate-y-1/2 font-semibold tracking-wide ${compact ? 'text-[11px]' : 'text-[11px]'} ${darkMode ? 'text-white/35' : 'text-[#9ca3af]'}`}
              style={{ fontFamily: FONT }}
            >
              {sizeMode === 'usd' ? 'USDC' : coin}
            </span>
          </div>
          {rawSize > 0 && (
            <span
              className={`mt-1 block tabular-nums ${compact ? 'text-[10px]' : 'text-[11px]'} ${darkMode ? 'text-white/40' : 'text-[#9ca3af]'}`}
              style={{ fontFamily: FONT }}
            >
              ≈ {sizeMode === 'usd' ? `${sizeInCoin.toFixed(4)} ${coin}` : `$${usdValue.toFixed(2)}`}
            </span>
          )}
          {(rawSize === 0 || usdValue <= 1) && (
            <span
              className={`font-medium mt-0.5 block ${compact ? 'text-[9px]' : 'text-[11px]'} ${
                rawSize > 0 && usdValue <= 1
                  ? darkMode ? 'text-[#ff4466]' : 'text-rose-500'
                  : darkMode ? 'text-white/40' : 'text-[#9ca3af]'
              }`}
              style={{ fontFamily: FONT }}
            >
              Min size: $1
            </span>
          )}
        </div>

        {/* Leverage slider — perps only */}
        {!isSpot && (
          <PerpsLeverageSlider
            leverage={leverage}
            maxLeverage={maxLeverage}
            onChange={setLeverage}
            side={isBuy ? 'long' : 'short'}
            darkMode={darkMode}
          />
        )}

        {/* Info displays */}
        <div className={`border-t ${darkMode ? 'border-white/[0.06]' : 'border-black/[0.04]'} ${compact ? 'space-y-2 py-2' : 'space-y-2.5 py-3'}`}>
          {!isSpot && (
            <div className={`flex items-center justify-between ${compact ? 'text-[10px]' : 'text-[13px]'}`}>
              <span className={`flex items-center gap-1.5 ${darkMode ? 'text-white/40' : 'text-[#9ca3af]'}`} style={{ fontFamily: FONT }}>
                {liqIsDangerous && (
                  <span className={`w-1 h-1 rounded-full ${darkMode ? 'bg-[#ff4466]' : 'bg-rose-500'}`} />
                )}
                Liq Price
              </span>
              <span
                className={`font-semibold tabular-nums ${liqIsDangerous ? (darkMode ? 'text-[#ff6b85]' : 'text-rose-500') : (darkMode ? 'text-white' : 'text-[#1a1a1a]')}`}
                style={{ fontFamily: FONT }}
              >
                {estimatedLiqPrice > 0
                  ? <>${formatPrice(estimatedLiqPrice, decimals)}{liqDistancePct > 0 && <span className={`ml-1 ${liqIsDangerous ? (darkMode ? 'text-[#ff4466]/70' : 'text-rose-400/80') : (darkMode ? 'text-white/40' : 'text-[#9ca3af]')} ${compact ? 'text-[9px]' : 'text-[11px]'}`}>({isBuy ? '-' : '+'}{liqDistancePct.toFixed(1)}%)</span>}</>
                  : '—'}
              </span>
            </div>
          )}
          <div className={`flex items-center justify-between ${compact ? 'text-[10px]' : 'text-[13px]'}`}>
            <span className={darkMode ? 'text-white/40' : 'text-[#9ca3af]'} style={{ fontFamily: FONT }}>Mark</span>
            <span className={`font-bold tabular-nums ${markPxDirection === 'up' ? (darkMode ? 'text-[#00ff88]' : 'text-emerald-600') : markPxDirection === 'down' ? (darkMode ? 'text-[#ff4466]' : 'text-rose-500') : (darkMode ? 'text-white' : 'text-[#1a1a1a]')}`} style={{ fontFamily: FONT }}>
              {markPx > 0 ? `$${formatPrice(markPx, decimals)}` : '—'}
            </span>
          </div>
          <div className={`flex items-center justify-between ${compact ? 'text-[10px]' : 'text-[13px]'}`}>
            <span className={darkMode ? 'text-white/40' : 'text-[#9ca3af]'} style={{ fontFamily: FONT }}>Fee</span>
            <span className={`font-bold tabular-nums ${darkMode ? 'text-white' : 'text-[#1a1a1a]'}`} style={{ fontFamily: FONT }}>
              {estimatedFee > 0 ? `$${estimatedFee.toFixed(4)}` : '—'}
            </span>
          </div>
          {!isSpot && (
            <div className={`flex items-center justify-between ${compact ? 'text-[10px]' : 'text-[13px]'}`}>
              <span className={darkMode ? 'text-white/40' : 'text-[#9ca3af]'} style={{ fontFamily: FONT }}>Margin</span>
              <span className={`font-bold tabular-nums ${darkMode ? 'text-white' : 'text-[#1a1a1a]'}`} style={{ fontFamily: FONT }}>
                {marginRequired > 0 ? `$${marginRequired.toFixed(2)}` : '—'}
              </span>
            </div>
          )}
          {/* SL/TP instant preview */}
          {(slEnabled || tpEnabled) && !isSpot && (
            <>
              <div className={`border-t my-1 ${darkMode ? 'border-white/[0.06]' : 'border-black/[0.04]'}`} />
              {slEnabled && slPotentialLoss > 0 && (
                <div className="flex items-center justify-between text-[13px]">
                  <span className={darkMode ? 'text-white/40' : 'text-[#9ca3af]'} style={{ fontFamily: FONT }}>Potential Loss</span>
                  <span className={`font-medium tabular-nums ${darkMode ? 'text-rose-400' : 'text-rose-500'}`} style={{ fontFamily: FONT }}>
                    -${slPotentialLoss.toFixed(2)}{slMarginPct > 0 && <span className={`text-[11px] ${darkMode ? 'text-rose-300/60' : 'text-rose-400/70'}`}> ({slMarginPct.toFixed(1)}% of margin)</span>}
                  </span>
                </div>
              )}
              {tpEnabled && tpPotentialProfit > 0 && (
                <div className="flex items-center justify-between text-[13px]">
                  <span className={darkMode ? 'text-white/40' : 'text-[#9ca3af]'} style={{ fontFamily: FONT }}>Potential Profit</span>
                  <span className={`font-medium tabular-nums ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} style={{ fontFamily: FONT }}>
                    +${tpPotentialProfit.toFixed(2)}{tpMarginPct > 0 && <span className={`text-[11px] ${darkMode ? 'text-emerald-300/60' : 'text-emerald-500/70'}`}> ({tpMarginPct.toFixed(1)}% of margin)</span>}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Warning: stop loss beyond liquidation */}
        {slBeyondLiq && (
          <div
            className={`text-[11px] font-medium px-2.5 py-2 rounded-[8px] leading-snug ${
              darkMode
                ? 'text-rose-300 bg-rose-500/[0.08] ring-1 ring-inset ring-rose-500/20'
                : 'text-rose-600 bg-rose-50 ring-1 ring-inset ring-rose-100'
            }`}
            style={{ fontFamily: FONT }}
          >
            Stop Loss is past the liquidation price. At {leverage}× your position liquidates at {liqDistancePct.toFixed(1)}% before your {slPctEffective.toFixed(1)}% stop can trigger.
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className={`text-[10px] font-medium px-2 py-1.5 rounded-[8px] ${
              darkMode
                ? 'text-rose-300 bg-rose-500/[0.08] ring-1 ring-inset ring-rose-500/20'
                : 'text-rose-500 bg-rose-50'
            }`}
            style={{ fontFamily: FONT }}
          >
            {error}
          </div>
        )}

      </div>

      {/* Submit button — pinned at bottom */}
      <div className={`flex-shrink-0 ${compact ? 'px-3 pb-3 pt-1' : 'px-4 pb-3 pt-1'}`}>
        {(() => {
          const isDisabled = isExecuting || !sizeNum || usdValue <= 1;
          const placeholderLabel = !sizeNum ? 'Enter size' : usdValue <= 1 ? 'Min size $1' : null;
          return (
        <button
          onClick={handleSubmit}
          disabled={isDisabled}
          className={`w-full font-bold tracking-wide transition-colors cursor-pointer disabled:cursor-not-allowed ${
            compact ? 'py-3.5 rounded-[12px] text-[14px]' : 'py-3.5 rounded-[12px] text-[15px]'
          } ${
            isDisabled
              ? darkMode
                ? 'bg-white/[0.05] text-white/40 ring-1 ring-inset ring-white/[0.06]'
                : 'bg-[#f4f4f5] text-[#9ca3af]'
              : isBuy
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                : 'bg-rose-500 hover:bg-rose-600 text-white'
          }`}
          style={{
            fontFamily: FONT,
            boxShadow: isDisabled ? undefined : 'inset 0 1px 0 rgba(255,255,255,0.14)',
          }}
        >
          {isExecuting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Executing
            </span>
          ) : placeholderLabel ? (
            placeholderLabel
          ) : (
            isSpot ? `${isBuy ? 'Buy' : 'Sell'} ${coin}` : `${isBuy ? 'Long' : 'Short'} ${coin}`
          )}
        </button>
          );
        })()}
      </div>
    </div>
  );
}
