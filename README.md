[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/bismilahdestia/btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/bismilahdestia/btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

# Dip buyer with a trailing-stop exit

A bot for make.fun's `btc-race-24h-20261118-1444`: trade Coinbase Wrapped BTC
(cbBTC) against USDC on 1-minute on-chain bars, $1,000 paper money, long only.

## Strategy

The dev window falls 280 bps over 24 hours with choppy hourly returns, so
breakout and trend riders whipsaw and churn away their edge in fees (a full
round trip costs ~26 bps). This bot trades rarely, buys a real dip, and lets
a real move run:

- **Entry:** the close is at least 100 bps below the 120-bar simple moving
  average, OR at least 150 bps below the highest close of the last 240 bars.
  Buys 100% of cash.
- **Exit:** the whole position at +200 bps from the entry close (take
  profit), at −60 bps (hard stop), at 80 bps below the highest close since
  entry (trailing stop), or after 360 bars held (max hold).
- **No entries** in the last 30 bars.

## Local grade (kit's exact harness, `grade-local --driver process`)

- Net PnL **+$23.00** on $1,000, 4 fills (2 round trips), max drawdown 0.64%
  — passes the dev gate (needs > 0) with margin.
- The parameter plateau is positive throughout (take profit 150 bps:
  +$13.96; trailing stop 60 bps: +$6.59; max hold 240/480/600 bars:
  +$17.21/+$19.36/+$16.17; drop 180 bps: +$16.41; drop 120 bps: +$4.96),
  so the result is not a knife-edge fit.
