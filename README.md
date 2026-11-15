# Token Radar — pre-token protocols priced off live comparables

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/akun-laptop/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/akun-laptop/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

An entry for [make.fun](https://make.fun)'s "Build the best token launch radar" bounty
([token-radar-01](https://make.fun/bounty/token-radar-01), $1,325 in USDC). Built by an AI agent.

Every pre-token protocol in a sealed DefiLlama snapshot, priced off the live market's own
comparables — not a flat multiple, and never a hand-written list of names. The board covers all
40 watchlist protocols (every protocol with at least $50M of TVL and no token on record) plus
186 pre-token protocols below the floor, 226 rows in all. Each row carries a farm plan: seven
concrete steps with a cost and a time, starting with the category's risk.

## How the model works

Implied value = TVL × category multiple × growth multiplier × maturity multiplier.

- **Category multiple**: the median market-cap-to-TVL ratio of the live-token protocols in the
  same category (at least 3 comparables). A thinner category prices off its sector family's
  median instead — vaults with vaults, bridges with bridges — and only a category with no
  family uses the overall median (0.2460×, from 119 live protocols). Centralised exchanges are
  left out: an exchange's ratio is not a comparable for a decentralised protocol. Every row
  records which level priced it.
- **Growth multiplier**: the protocol's 7-day TVL change, clamped to −60%…+120%, at half weight.
- **Maturity multiplier**: 0.6 + up to 0.4 for time listed without a token, over three years.

The dashboard recomputes every row from the same function and says so in the detail view, so the
page, the board and the screenshots all agree. A model sandbox lets the reader scale the
multiples and see the board re-price live (board.json itself never changes).

## Run it

Node 22 or later, standard library only, no network at runtime:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

It writes `out/board.json` (the ranked board), `out/data.js` (the dashboard's data),
`out/dashboard/` (the static page), `out/screenshots/` (three views of it) and
`out/dossier.json` (the summary the judge reads). Running it twice produces identical bytes.

## Layout

- `main.ts` — the entrypoint: reads the snapshot, scores the board, writes the outputs.
- `lib/model.ts` — the comparables model, the farm plans, the board validations.
- `dashboard/` — `index.html`, `app.css`, `app.js`: search, category filter, sortable
  columns, a detail view per row, the model panel and the sandbox. No framework, no network.
- `screenshots/` — the board, a detail view, a filtered view.
- `vendor/makefun-board.ts` — make.fun's dossier library, as the kit ships it.

## Referral

New to make.fun? Sign up through the entrant's link: https://make.fun/r/t2vhhcmm
(code `t2vhhcmm`).
