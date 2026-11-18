// Dip buyer with a trailing-stop exit for the cbBTC/USDC 24-hour race
// (agent-fun/bars-replay/v1).
//
// Why this shape: the dev window (24h to the 2026-11-18 14:44 UTC open) falls
// 280 bps overall with a 335 bps range and choppy hourly returns that
// alternate sign. Breakout and trend riders whipsaw: an EMA 8/21 cross loses
// about $120 in 62 trades, Donchian 120/10 loses $17.50, and every
// Bollinger mean-reversion variant loses $24 or more — a full-size round trip
// costs about 26 bps in fees, slippage and impact, so frequent trading just
// pays the pool. The only strategies that clear the dev gate trade rarely,
// buy a real dip, and let a real move run. This bot:
//
//   - Entry: the close sits at least 100 bps below the 120-bar SMA, OR at
//     least 150 bps below the highest close of the last 240 bars. Two
//     independent dip detectors: the SMA catches a dip inside a range, the
//     high catches a sharp slide off a top. It buys 100% of cash.
//   - Exit: the whole position at +200 bps from the entry close (take
//     profit), at -60 bps (hard stop), at 80 bps below the highest close
//     since entry (trailing stop — lets a rally run), or after 360 bars
//     held (max hold — forces a re-entry decision instead of riding a
//     reversal all the way down).
//   - No new entries in the last 30 bars: a trade opened there can only be
//     flattened at the end, paying a full round trip for at most one bar.
//
// Offline sweep on the exact fill model (fees 4 bps, slippage 2 bps,
// constant-product impact against each bar's open depth), verified with the
// kit's grade-local (--driver process):
// N=120/K=100/LOOK=240/DROP=150/TP=200/SL=60/TRAIL=80/H=360 -> net PnL
// +22.995588 USDC, 4 fills (2 round trips, win rate 1.0), max drawdown
// 0.64%, fees 1.622651 USDC; at 2x fees still +21.36 USDC. The two
// executions reproduce byte for byte (L1 regrade reproduced).
// The plateau is positive throughout, not a knife edge: TP 150 -> +$13.96,
// TRAIL 60 -> +$6.59, H 240/480/600 -> +$17.21/+$19.36/+$16.17,
// DROP 180 -> +$16.41, DROP 120 -> +$4.96. The whole neighbourhood clears
// the dev gate (needs > 0) with margin, and max drawdown stays under 1.1%.
//
// Long only, one position, at most one order per bar, deterministic (bigint
// arithmetic only, no clock, no randomness, no network, no files). Every
// decision is made on the bar that just closed; the replay fills it at the
// next bar's open, exactly as the local grade shows.

import { runBars, type BarsState, type Batch, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** SMA lookback for the dip test. */
const N = 120;
/** Entry: close must be at least this far below the SMA, in bps. */
const K_BPS = 100n;
/** Lookback for the drop-from-high test. */
const LOOK = 240;
/** Entry: close must be at least this far below the LOOK-bar high, in bps. */
const DROP_BPS = 150n;
/** Take profit: exit when the close is this far above the entry close, in bps. */
const TP_BPS = 200n;
/** Hard stop: exit when the close is this far below the entry close, in bps. */
const STOP_BPS = 60n;
/** Trailing stop: exit when the close is this far below the peak since entry, in bps. */
const TRAIL_BPS = 80n;
/** Max hold: exit once the position has been held this many bars. */
const MAX_HOLD_BARS = 360;
/** No new entries once the batch seq reaches this (the last 30 bars). */
const ENTRY_CUTOFF_SEQ = 1410;
/** Slippage cap per order, in bps from the latest close. */
const MAX_SLIPPAGE_BPS = 100;

const closes: bigint[] = [];
/** Entry close of the current position, once in one. */
let entryPrice: bigint | null = null;
/** Highest close since the current entry, once in a position. */
let peak: bigint | null = null;
/** Batch seq at which the current position was opened. */
let entrySeq = 0;

await runBars({
  onBatch(state: BarsState, batch: Batch): (BuyInput | SellInput)[] {
    if (state.warmingUp) return [];
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const c = BigInt(bar.c);
    closes.push(c);
    if (closes.length < Math.max(N, LOOK)) return [];

    const held = state.positions.get(SYMBOL);
    if (held !== undefined && entryPrice !== null) {
      if (peak === null || c > peak) peak = c;
      const takeProfit = c >= (entryPrice * (10000n + TP_BPS)) / 10000n;
      const stopOut = c <= (entryPrice * (10000n - STOP_BPS)) / 10000n;
      const trailOut = peak !== null && c <= (peak * (10000n - TRAIL_BPS)) / 10000n;
      const heldTooLong = state.seq - entrySeq >= MAX_HOLD_BARS;
      if (takeProfit || stopOut || trailOut || heldTooLong) {
        // Do not reset entryPrice/peak here: if this sell is rejected (e.g.
        // max_slippage) the position is still held next bar and the true
        // entry and peak must survive. They are cleared in the not-holding
        // branch below once the sale lands.
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    entryPrice = null;
    peak = null;
    if (state.seq >= ENTRY_CUTOFF_SEQ) return [];

    let sma = 0n;
    for (const x of closes.slice(-N)) sma += x;
    sma /= BigInt(N);
    let high = 0n;
    for (const x of closes.slice(-LOOK)) if (x > high) high = x;
    const dipBelowSma = c <= (sma * (10000n - K_BPS)) / 10000n;
    const dropFromHigh = c <= (high * (10000n - DROP_BPS)) / 10000n;
    if (!dipBelowSma && !dropFromHigh) return [];

    const notional = state.cash;
    if (notional < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    entryPrice = c;
    peak = c;
    entrySeq = state.seq;
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  },
});
