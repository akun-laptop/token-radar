// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks every pre-token protocol the snapshot names on the watchlist (the floor, never a
// ceiling) plus every other rankable pre-token protocol below the watchlist floor: the early rows the
// radar exists to find. A protocol is pre-token when its index entry records no token (no market cap,
// no CoinGecko id, no symbol). Live-token protocols are kept apart and shown as the market's own
// values, never mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures, and it is priced off the market's own
// comparables instead of one flat multiple: a DEX and a liquid-staking protocol are not worth the same
// fraction of their TVL, and the snapshot says so. For each category, the multiple is the median
// market-cap-to-TVL ratio of the live-token protocols in that category (at least three of them, else
// the overall median). Then growth and maturity adjust it:
//
//   category_multiple = median(mcap_usd / tvl_usd) over live protocols in the category
//                       (overall median when the category has fewer than 3 live protocols),
//                       clamped to [0.02, 1.50]
//   growth            = clamp(change_7d, -60, 120) per cent
//   growthMult        = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity          = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   implied           = max(1, round(tvl_usd x category_multiple x growthMult x maturity))
//
// The multiple is priced in three levels, so a thin category is never priced off one noisy
// protocol and never thrown straight to the market average either. A category with at least
// three live protocols prices off its own median; a thinner one prices off its sector family's
// median (the families group categories by economic function — vaults with vaults, bridges
// with bridges — and the family median is still the median of live ratios from this snapshot,
// never a hand-picked number); only a category with no family at all, or a family too thin
// to price, falls back to the overall median. Every row records which level priced it, and the
// dashboard shows it, so the pricing is checkable row by row.
//
// The constants are stated in the dashboard and changeable in the model sandbox. No protocol name is
// ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  min_category_n: number;
  multiple_floor: number;
  multiple_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  min_category_n: 3,
  multiple_floor: 0.02,
  multiple_cap: 1.5,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** Which level priced a row's multiple: its own category, its sector family, or the whole market. */
export type MultipleSource = 'category' | 'family' | 'overall';

/**
 * The sector families: categories grouped by economic function, so a thin category prices off
 * its nearest market instead of the market average. A family is a taxonomy, not a number — the
 * multiple is still the median of the live ratios in it, computed from the snapshot. Categories
 * with no natural family (a chain, a card issuer, a one-off) stay unmapped and fall back to the
 * overall median, which the row records honestly.
 */
export const FAMILY_OF: Record<string, string> = {
  // Vaults and yield: the money goes into a strategy and comes back with yield.
  Yield: 'Yield & Vaults',
  'Yield Aggregator': 'Yield & Vaults',
  'Risk Curators': 'Yield & Vaults',
  'Onchain Capital Allocator': 'Yield & Vaults',
  'Liquidity Manager': 'Yield & Vaults',
  Farm: 'Yield & Vaults',
  'Leveraged Farming': 'Yield & Vaults',
  // Lending and credit: assets are supplied, borrowed against, or collateralised.
  Lending: 'Lending & Credit',
  CDP: 'Lending & Credit',
  'CDP Manager': 'Lending & Credit',
  'Collateral Markets': 'Lending & Credit',
  'Collateral Management': 'Lending & Credit',
  'Uncollateralized Lending': 'Lending & Credit',
  // Trading: the protocol is a venue for buying, selling, or betting on a price.
  Dexs: 'Trading',
  Derivatives: 'Trading',
  Options: 'Trading',
  'Options Vault': 'Trading',
  'Prediction Market': 'Trading',
  Synthetics: 'Trading',
  'Interest Rate Derivatives': 'Trading',
  // Staking: the chain's asset is staked, restaked, or pooled.
  'Liquid Staking': 'Staking',
  'Liquid Restaking': 'Staking',
  Restaking: 'Staking',
  'Staking Pool': 'Staking',
  // Bridges: value moves between chains.
  Bridge: 'Bridges',
  'Canonical Bridge': 'Bridges',
  'Cross Chain Bridge': 'Bridges',
  // Stable value and real-world assets: the token tracks a dollar, a commodity, or a yield-bearing claim.
  RWA: 'Stable & RWA',
  'Basis Trading': 'Stable & RWA',
  'Stablecoin Issuer': 'Stable & RWA',
  'Stablecoin Wrapper': 'Stable & RWA',
  'Dual-Token Stablecoin': 'Stable & RWA',
  'Algo-Stables': 'Stable & RWA',
  'Reserve Currency': 'Stable & RWA',
};

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One category's comparable multiple, priced off the live protocols in it. */
export interface Comparable {
  category: string;
  median_multiple: number;
  n: number;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    /** Which level priced the multiple, and the category or family it was priced off. */
    multiple_source: MultipleSource;
    multiple_basis: string;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  multiple_source: MultipleSource;
  multiple_basis: string;
  growth_multiplier: number;
  maturity_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the comparables, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  overall_median_multiple: number;
  comparables: Comparable[];
  /** The sector-family medians, for the categories too thin to price on their own. */
  families: Comparable[];
  /** How many live-token protocols the overall median (and the family pools) are priced off. */
  live_comparables_n: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a sorted list of numbers; null when the list is empty. */
export function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The comparables table: for every category with at least `minN` live-token protocols that carry both
 * a market cap and a TVL, the median market-cap-to-TVL ratio, clamped to the model's band. The same
 * treatment for every sector family, pooled from the live protocols in its categories. Categories
 * below the threshold fall back to their family's median, and only a category with no family (or a
 * family below the threshold) falls back to the overall median, computed over every live protocol.
 * Centralised exchanges are left out of all three: an exchange's market-cap-to-TVL ratio is not a
 * comparable for a decentralised protocol.
 */
export function buildComparables(snapshot: Snapshot, model: ModelConstants = MODEL): {
  byCategory: Map<string, number>;
  byFamily: Map<string, number>;
  overall: number;
  table: Comparable[];
  familyTable: Comparable[];
  live_n: number;
} {
  const byCategory = new Map<string, number[]>();
  const byFamily = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    if (p.category === 'CEX') continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    if (p.category !== null) {
      const list = byCategory.get(p.category) ?? [];
      list.push(ratio);
      byCategory.set(p.category, list);
      const family = FAMILY_OF[p.category];
      if (family !== undefined) {
        const flist = byFamily.get(family) ?? [];
        flist.push(ratio);
        byFamily.set(family, flist);
      }
    }
  }
  const clamp = (n: number): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, n));
  all.sort((a, b) => a - b);
  const overall = clamp(median(all) ?? 0.2);
  const multiples = new Map<string, number>();
  const table: Comparable[] = [];
  for (const [category, ratios] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    ratios.sort((a, b) => a - b);
    if (ratios.length < model.min_category_n) continue;
    const m = clamp(median(ratios)!);
    multiples.set(category, m);
    table.push({ category, median_multiple: round4(m), n: ratios.length });
  }
  table.sort((a, b) => b.n - a.n || a.category.localeCompare(b.category));
  const familyMultiples = new Map<string, number>();
  const familyTable: Comparable[] = [];
  for (const [family, ratios] of [...byFamily.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    ratios.sort((a, b) => a - b);
    if (ratios.length < model.min_category_n) continue;
    const m = clamp(median(ratios)!);
    familyMultiples.set(family, m);
    familyTable.push({ category: family, median_multiple: round4(m), n: ratios.length });
  }
  familyTable.sort((a, b) => b.n - a.n || a.category.localeCompare(b.category));
  return { byCategory: multiples, byFamily: familyMultiples, overall, table, familyTable, live_n: all.length };
}

/** The multiple one protocol is priced at, and which level priced it. */
export function multipleFor(
  p: SnapshotProtocol,
  comparables: { byCategory: Map<string, number>; byFamily: Map<string, number>; overall: number },
): { multiple: number; source: MultipleSource; basis: string } {
  if (p.category !== null) {
    const m = comparables.byCategory.get(p.category);
    if (m !== undefined) return { multiple: m, source: 'category', basis: p.category };
    const family = FAMILY_OF[p.category];
    if (family !== undefined) {
      const fm = comparables.byFamily.get(family);
      if (fm !== undefined) return { multiple: fm, source: 'family', basis: family };
    }
  }
  return { multiple: comparables.overall, source: 'overall', basis: 'all live protocols' };
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  comparables: { byCategory: Map<string, number>; byFamily: Map<string, number>; overall: number },
  model: ModelConstants = MODEL,
): { implied: number; catMult: number; source: MultipleSource; basis: string; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple: catMult, source, basis } = multipleFor(protocol, comparables);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * catMult * growthMult * maturityMult));
  return { implied, catMult, source, basis, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comparables = buildComparables(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the watchlist floor, strongest TVL first.
  // Never a replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, catMult, source, basis, growthPct, growthMult, maturityMult, age } = impliedValue(p, snapshot.as_of, comparables, model);
    return { p, implied, catMult, source, basis, growthPct, growthMult, maturityMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      // Full precision, not rounded: the dashboard recomputes the implied value from this
      // multiple, and a rounded one would drift from board.json by a few dollars.
      category_multiple: s.catMult,
      multiple_source: s.source,
      multiple_basis: s.basis,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and leave it earning.`;
  if (c.includes('dex')) return `Add $${capital} of liquidity to the busiest ${name} pool on ${chain} and keep it in range.`;
  if (c.includes('yield aggregator') || c.includes('yield')) return `Deposit $${capital} into the highest-TVL ${name} vault on ${chain} and hold the receipt.`;
  if (c.includes('leveraged farm')) return `Open a $${capital} leveraged position on ${name} and keep the health factor above 1.5.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the funds inside its app.`;
  if (c.includes('liquid staking') || c.includes('restak') || c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${name} and hold the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} and take one position on a ${name} market you have read.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('onchain capital')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('basis')) return `Deposit $${capital} into the ${name} basis strategy on ${chain} and hold the position.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second qualifying action: a different touchpoint so the activity is not one-note. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow about a third of what you supplied from ${name}, then repay half of it the following week.`;
  if (c.includes('dex')) return `Swap $${Math.max(10, Math.round(capital / 5))} through ${name} on ${chain} once a week instead of holding still.`;
  if (c.includes('yield')) return `Move a quarter of the vault position into a second ${name} vault on another chain it supports.`;
  if (c.includes('bridge')) return `Bridge $${Math.max(10, Math.round(capital / 5))} back through ${name} so both directions are on record.`;
  if (c.includes('liquid staking') || c.includes('restak') || c.includes('staking')) return `Deposit the staking receipt into ${name}'s own yield option, or restake the rewards it pays.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close and reopen the hedge once so the position shows fresh activity.`;
  if (c.includes('prediction')) return `Settle one market and open a second, smaller position on a different outcome.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('onchain capital')) return `Top the vault up by $${Math.max(10, Math.round(capital / 5))} and leave the new shares untouched.`;
  if (c.includes('stable')) return `Use the minted stable asset in one ${name} pool rather than leaving it idle.`;
  if (c.includes('rwa')) return `Claim the yield the asset pays and re-mint with it, keeping one receipt.`;
  if (c.includes('insurance')) return `Renew or extend the cover by one period before the first one lapses.`;
  if (c.includes('basis')) return `Check the funding rate weekly and add $${Math.max(10, Math.round(capital / 5))} when it turns positive.`;
  return `Return to ${name} once a week and repeat the deposit with $${Math.max(10, Math.round(capital / 5))} more.`;
}

/** Why to hold, in the category's own terms: the hold is a qualifying window, not idle waiting. */
function holdFor(p: SnapshotProtocol, hold: number): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Keep the supplied assets in place for at least ${hold} days so the supply accrues across more than one snapshot.`;
  if (c.includes('dex')) return `Keep the liquidity in range for at least ${hold} days so the position earns fees across more than one snapshot.`;
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator') || c.includes('onchain capital')) return `Keep the vault shares for at least ${hold} days so the position is counted in more than one snapshot.`;
  if (c.includes('bridge')) return `Keep the bridged funds working inside the app for at least ${hold} days so the activity is counted in more than one snapshot.`;
  if (c.includes('liquid staking') || c.includes('restak') || c.includes('staking')) return `Keep the stake locked for at least ${hold} days so the position is counted in more than one snapshot.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Keep the margin deposited for at least ${hold} days so the account shows activity in more than one snapshot.`;
  return `Keep the position open for at least ${hold} days so the activity is counted in more than one snapshot.`;
}

/** The weekly action, in the category's own terms: a small, different touchpoint each week. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Once a week, adjust the supplied amount a little, or claim the interest the position earned.`;
  if (c.includes('dex')) return `Once a week, swap a small amount through the pool, or rebalance the range if the price moved.`;
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator') || c.includes('onchain capital')) return `Once a week, check the vault's yield and top the position up with a small amount.`;
  if (c.includes('bridge')) return `Once a week, bridge a small amount back through ${name}, or use the funds inside its app.`;
  if (c.includes('liquid staking') || c.includes('restak') || c.includes('staking')) return `Once a week, restake the rewards the stake pays instead of letting them sit idle.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Once a week, check the funding rate and adjust the hedge if it moved.`;
  if (c.includes('prediction')) return `Once a week, review the open markets and settle any that closed.`;
  if (c.includes('rwa')) return `Once a week, check the yield the asset paid and claim it while the position is open.`;
  return `Once a week, make one small qualifying action on the protocol, such as a deposit, a swap, a vote or a claim.`;
}

/** The exit, in the category's own terms: claim only from the protocol's own page, and log everything. */
function claimFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('liquid staking') || c.includes('restak') || c.includes('staking')) return `Before you withdraw, check the exit queue on the protocol's own page, unstake only from the link it publishes, then log the wallet, dates and transactions.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Before you withdraw, repay any borrow first, then claim only from the protocol's own page and log the wallet, dates and transactions.`;
  if (c.includes('bridge')) return `Before you withdraw, bridge the funds back through the protocol's own route, claim only from the link it publishes, then log the wallet, dates and transactions.`;
  return `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, then log the wallet, dates and transactions.`;
}
function riskFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'a supplied asset can be liquidated if the collateral behind it falls';
  if (c.includes('dex')) return 'a liquidity position loses value when the two sides move apart';
  if (c.includes('yield')) return 'yields compress as more capital chases the same strategy';
  if (c.includes('leveraged farm')) return 'leverage multiplies losses as fast as gains, and the position can be liquidated';
  if (c.includes('bridge')) return 'bridged funds depend on the bridge staying solvent and unhacked';
  if (c.includes('liquid staking') || c.includes('restak') || c.includes('staking')) return 'the staking receipt can trade below the staked asset while exits queue';
  if (c.includes('perpetual') || c.includes('derivative')) return 'a leveraged position can be liquidated by one sharp move';
  if (c.includes('prediction')) return 'a prediction market pays nothing if the outcome goes the other way';
  if (c.includes('curator') || c.includes('allocator') || c.includes('onchain capital')) return 'a vault is only as good as its curator, and its strategy can underperform';
  if (c.includes('stable')) return 'a stable asset can lose its peg if its backing is questioned';
  if (c.includes('rwa')) return 'real-world backing depends on the issuer staying solvent and honest';
  if (c.includes('insurance')) return 'cover pays only for the events the policy names, and claims can be disputed';
  if (c.includes('basis')) return 'the funding rate can turn negative and the strategy pays instead of earning';
  return 'an airdrop is never guaranteed, and the position can lose value while you wait';
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 * The first step names the category's risk, so the plan never reads as a promise.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  return [
    {
      text: `Know the risk before you commit: ${riskFor(p)}. Never farm with money you need back this month.`,
      cost: 'no cost',
      time: '5 minutes',
    },
    {
      text: `Start with a fresh wallet${p.chains.length > 0 ? ` on ${chain}` : ''} that holds only the funds you plan to farm, and store its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital, chain),
      cost: `about $${Math.max(2, Math.round(gas / 2))} of gas`,
      time: '10 minutes',
    },
    {
      text: holdFor(p, hold),
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: weeklyFor(p),
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: claimFor(p),
      cost: 'no fee to check, and never pay to claim',
      time: '15 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    multiple_source: row.model.multiple_source,
    multiple_basis: row.model.multiple_basis,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const comparables = buildComparables(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    overall_median_multiple: round4(comparables.overall),
    comparables: comparables.table,
    families: comparables.familyTable,
    live_comparables_n: comparables.live_n,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board has ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  const nonWatchlist = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  if (nonWatchlist < 60) return `only ${nonWatchlist} rows are outside the watchlist, fewer than 60`;
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
