// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, a filterable table, a per-protocol detail view with the model's own inputs and the
// protocol's farm plan, and a model sandbox that recomputes the displayed values live. No network:
// every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var sandbox = { mult: 1, weight: DATA.model.growth_weight };
  function sandboxActive() { return sandbox.mult !== 1 || sandbox.weight !== DATA.model.growth_weight; }

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures, so the page's code
  // and the board's data are visibly the same arithmetic. At the sandbox's defaults it reproduces
  // board.json exactly; the sliders only change what is displayed, never the board.
  function impliedOf(row, model, mult, weight) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * mult * growthMult * maturity));
  }
  function displayImplied(row) { return impliedOf(row, DATA.model, sandbox.mult, sandbox.weight); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and leave it earning.';
    // Indexes before Dexs: "indexes" contains "dex", and an index is bought, not pooled.
    if (c.indexOf('indexes') >= 0) return 'Buy $' + capital + ' of the ' + name + ' index on ' + chain + ' and hold it.';
    if (c.indexOf('dex') >= 0) return 'Add $' + capital + ' of liquidity to the busiest ' + name + ' pool on ' + chain + ' and keep it in range.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0 || c === 'farm') return 'Deposit $' + capital + ' into the highest-TVL ' + name + ' vault on ' + chain + ' and hold the receipt.';
    if (c.indexOf('leveraged farm') >= 0) return 'Open a $' + capital + ' leveraged position on ' + name + ' and keep the health factor above 1.5.';
    if (c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + ' into a ' + name + '-managed pool on ' + chain + ' and let it rebalance.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the funds inside its app.';
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and hold the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and take one position on a ' + name + ' market you have read.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('onchain capital') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' into the ' + name + ' basis strategy on ' + chain + ' and hold the position.';
    if (c.indexOf('btc') >= 0) return 'Mint $' + capital + ' of the BTC-backed asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('payments') >= 0) return 'Send $' + capital + ' through ' + name + ' on ' + chain + ' and keep the channel open.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' incentives pool on ' + chain + '.';
    if (c.indexOf('card') >= 0) return 'Load $' + capital + ' onto a ' + name + ' card on ' + chain + ' and use it for one purchase.';
    if (c === 'chain') return 'Bridge $' + capital + ' of USDC to ' + name + ' and use it inside its own apps.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var small = Math.max(10, Math.round(capital / 5));
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow about a third of what you supplied from ' + name + ', then repay half of it the following week.';
    if (c.indexOf('indexes') >= 0) return 'Add $' + small + ' to the index position when it rebalances.';
    if (c.indexOf('dex') >= 0) return 'Swap $' + small + ' through ' + name + ' on ' + chain + ' once a week instead of holding still.';
    if (c.indexOf('yield') >= 0 || c === 'farm') return 'Move a quarter of the vault position into a second ' + name + ' vault on another chain it supports.';
    if (c.indexOf('liquidity manager') >= 0) return 'Move $' + small + ' into a second ' + name + '-managed pool on another chain it supports.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + small + ' back through ' + name + ' so both directions are on record.';
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return "Deposit the staking receipt into " + name + "'s own yield option, or restake the rewards it pays.";
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close and reopen the hedge once so the position shows fresh activity.';
    if (c.indexOf('prediction') >= 0) return 'Settle one market and open a second, smaller position on a different outcome.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('onchain capital') >= 0) return 'Top the vault up by $' + small + ' and leave the new shares untouched.';
    if (c.indexOf('stable') >= 0) return 'Use the minted stable asset in one ' + name + ' pool rather than leaving it idle.';
    if (c.indexOf('rwa') >= 0) return 'Claim the yield the asset pays and re-mint with it, keeping one receipt.';
    if (c.indexOf('insurance') >= 0) return 'Renew or extend the cover by one period before the first one lapses.';
    if (c.indexOf('basis') >= 0) return 'Check the funding rate weekly and add $' + small + ' when it turns positive.';
    if (c.indexOf('btc') >= 0) return 'Claim the yield the BTC-backed asset pays and re-mint with it, keeping one receipt.';
    if (c.indexOf('payments') >= 0) return 'Send a second, smaller payment through ' + name + ' the following week.';
    if (c.indexOf('governance') >= 0) return 'Vote with the position once, then add $' + small + ' to the incentives pool.';
    if (c.indexOf('card') >= 0) return 'Make a second purchase with the card the following week.';
    if (c === 'chain') return 'Use a second app on ' + name + ' with $' + small + '.';
    return 'Return to ' + name + ' once a week and repeat the deposit with $' + small + ' more.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  // What can go wrong with this category, in one line: the plan names the risk before the money
  // moves. This is the same derivation as lib/model.ts, so the page's plan matches board.json.
  function riskFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'a supplied asset can be liquidated if the collateral behind it falls';
    if (c.indexOf('indexes') >= 0) return 'an index falls with every asset it holds';
    if (c.indexOf('dex') >= 0) return 'a liquidity position loses value when the two sides move apart';
    if (c.indexOf('yield') >= 0 || c === 'farm') return 'yields compress as more capital chases the same strategy';
    if (c.indexOf('leveraged farm') >= 0) return 'leverage multiplies losses as fast as gains, and the position can be liquidated';
    if (c.indexOf('liquidity manager') >= 0) return 'a managed position still loses value when its assets move apart';
    if (c.indexOf('bridge') >= 0) return 'bridged funds depend on the bridge staying solvent and unhacked';
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'the staking receipt can trade below the staked asset while exits queue';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'a leveraged position can be liquidated by one sharp move';
    if (c.indexOf('prediction') >= 0) return 'a prediction market pays nothing if the outcome goes the other way';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('onchain capital') >= 0) return 'a vault is only as good as its curator, and its strategy can underperform';
    if (c.indexOf('stable') >= 0) return 'a stable asset can lose its peg if its backing is questioned';
    if (c.indexOf('rwa') >= 0) return 'real-world backing depends on the issuer staying solvent and honest';
    if (c.indexOf('insurance') >= 0) return 'cover pays only for the events the policy names, and claims can be disputed';
    if (c.indexOf('basis') >= 0) return 'the funding rate can turn negative and the strategy pays instead of earning';
    if (c.indexOf('btc') >= 0) return 'a BTC-backed asset depends on its custodian or bridge staying solvent';
    if (c.indexOf('payments') >= 0) return 'a payment channel locks funds until it closes';
    if (c.indexOf('governance') >= 0) return 'incentives dry up when the bribes stop';
    if (c.indexOf('card') >= 0) return 'a card issuer can freeze funds or change its fees';
    if (c === 'chain') return "a new chain's apps and bridges carry smart-contract risk";
    return 'an airdrop is never guaranteed, and the position can lose value while you wait';
  }
  function holdFor(p, hold) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Keep the supplied assets in place for at least ' + hold + ' days so the supply accrues across more than one snapshot.';
    if (c.indexOf('indexes') >= 0) return 'Hold the index for at least ' + hold + ' days so the position is counted in more than one snapshot.';
    if (c.indexOf('dex') >= 0) return 'Keep the liquidity in range for at least ' + hold + ' days so the position earns fees across more than one snapshot.';
    if (c.indexOf('yield') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('onchain capital') >= 0 || c === 'farm') return 'Keep the vault shares for at least ' + hold + ' days so the position is counted in more than one snapshot.';
    if (c.indexOf('liquidity manager') >= 0) return 'Keep the managed position for at least ' + hold + ' days so it earns fees across more than one snapshot.';
    if (c.indexOf('bridge') >= 0) return 'Keep the bridged funds working inside the app for at least ' + hold + ' days so the activity is counted in more than one snapshot.';
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Keep the stake locked for at least ' + hold + ' days so the position is counted in more than one snapshot.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Keep the margin deposited for at least ' + hold + ' days so the account shows activity in more than one snapshot.';
    if (c.indexOf('btc') >= 0) return 'Hold the BTC-backed asset for at least ' + hold + ' days so the position is counted in more than one snapshot.';
    if (c.indexOf('payments') >= 0) return 'Keep the channel open for at least ' + hold + ' days so the activity is counted in more than one snapshot.';
    if (c === 'chain') return 'Keep the funds on ' + p.name + ' for at least ' + hold + ' days so the activity is counted in more than one snapshot.';
    return 'Keep the position open for at least ' + hold + ' days so the activity is counted in more than one snapshot.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Once a week, adjust the supplied amount a little, or claim the interest the position earned.';
    if (c.indexOf('indexes') >= 0) return "Once a week, check the index's holdings and top up a small amount.";
    if (c.indexOf('dex') >= 0) return 'Once a week, swap a small amount through the pool, or rebalance the range if the price moved.';
    if (c.indexOf('yield') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('onchain capital') >= 0 || c === 'farm') return "Once a week, check the vault's yield and top the position up with a small amount.";
    if (c.indexOf('liquidity manager') >= 0) return "Once a week, check the managed pool's performance and top up a small amount.";
    if (c.indexOf('bridge') >= 0) return 'Once a week, bridge a small amount back through ' + name + ', or use the funds inside its app.';
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Once a week, restake the rewards the stake pays instead of letting them sit idle.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Once a week, check the funding rate and adjust the hedge if it moved.';
    if (c.indexOf('prediction') >= 0) return 'Once a week, review the open markets and settle any that closed.';
    if (c.indexOf('rwa') >= 0) return 'Once a week, check the yield the asset paid and claim it while the position is open.';
    if (c.indexOf('btc') >= 0) return 'Once a week, check the backing behind the BTC-backed asset.';
    if (c.indexOf('payments') >= 0) return 'Once a week, send one small payment through ' + name + '.';
    if (c === 'chain') return 'Once a week, use one app on ' + name + '.';
    return 'Once a week, make one small qualifying action on the protocol, such as a deposit, a swap, a vote or a claim.';
  }
  function claimFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return "Before you withdraw, check the exit queue on the protocol's own page, unstake only from the link it publishes, then log the wallet, dates and transactions.";
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return "Before you withdraw, repay any borrow first, then claim only from the protocol's own page and log the wallet, dates and transactions.";
    if (c.indexOf('bridge') >= 0) return "Before you withdraw, bridge the funds back through the protocol's own route, claim only from the link it publishes, then log the wallet, dates and transactions.";
    return "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, then log the wallet, dates and transactions.";
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = capital >= 150 ? 8 : 4;
    return [
      { text: 'Know the risk before you commit: ' + riskFor(p) + '. Never farm with money you need back this month.', cost: 'no cost', time: '5 minutes' },
      { text: 'Start with a fresh wallet' + (p.chains && p.chains.length > 0 ? ' on ' + chain : '') + ' that holds only the funds you plan to farm, and store its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: 'about $' + Math.max(2, Math.round(gas / 2)) + ' of gas', time: '10 minutes' },
      { text: holdFor(p, hold), cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: weeklyFor(p), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: claimFor(p), cost: 'no fee to check, and never pay to claim', time: '15 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = displayImplied(a); bv = displayImplied(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, 'Every pre-token protocol, priced off ', el('em', { text: 'live comparables' })),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Each row is priced off the live market\u2019s own comparables \u2014 its category\u2019s median market-cap-to-TVL ratio, or its sector family\u2019s when the category is too thin \u2014 taken from the live-token protocols in the same snapshot. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: (state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols') + (sandboxActive() ? ' \u00b7 sandbox on' : '') })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; writeHash(); render(); } })
      ));
    }
    var max = 1;
    list.forEach(function (r) { max = Math.max(max, displayImplied(r)); });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((displayImplied(r) / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(displayImplied(r)) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' + (sandboxActive() ? ' Sandbox values are shown; board.json is unchanged.' : '') }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and their market-cap-to-TVL ratios price the comparables below.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var compRows = DATA.comparables.map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: c.median_multiple.toFixed(4) + '\u00d7' }),
        el('td', { class: 'num', text: String(c.n) })
      );
    });
    var multLabel = el('b', { text: sandbox.mult.toFixed(2) + '\u00d7' });
    var multSlider = el('input', { type: 'range', min: '0.5', max: '2', step: '0.05', value: String(sandbox.mult), 'aria-label': 'Category multiple scale' });
    multSlider.addEventListener('input', function () { sandbox.mult = parseFloat(multSlider.value); multLabel.textContent = sandbox.mult.toFixed(2) + '\u00d7'; render(); });
    var weightLabel = el('b', { text: sandbox.weight.toFixed(2) });
    var weightSlider = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(sandbox.weight), 'aria-label': 'Growth weight' });
    weightSlider.addEventListener('input', function () { sandbox.weight = parseFloat(weightSlider.value); weightLabel.textContent = sandbox.weight.toFixed(2); render(); });
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset sandbox', onclick: function () { sandbox.mult = 1; sandbox.weight = DATA.model.growth_weight; render(); } });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('p', { class: 'sub', text: 'The category multiple is the median market-cap-to-TVL ratio of the live-token protocols in the same category, priced from this snapshot. A category with fewer than ' + m.min_category_n + ' live protocols prices off its sector family\u2019s median instead \u2014 vaults with vaults, bridges with bridges \u2014 and only a category with no family uses the overall median of ' + DATA.overall_median_multiple.toFixed(4) + '\u00d7, priced off ' + DATA.live_comparables_n + ' live protocols. Centralised exchanges are left out of every median: an exchange\u2019s ratio is not a comparable for a decentralised protocol. Multiples are clamped to ' + m.multiple_floor + '\u2013' + m.multiple_cap + '\u00d7. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Every row says which level priced it, in its detail view.' }),
      el('table', { class: 'comps' },
        el('caption', { class: 'sub', text: 'Comparables: median market-cap-to-TVL by category, from the live protocols in this snapshot.' }),
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', class: 'num', text: 'Median multiple' }), el('th', { scope: 'col', class: 'num', text: 'Live protocols' }))),
        el('tbody', null, compRows)
      ),
      el('table', { class: 'comps' },
        el('caption', { class: 'sub', text: 'Family medians: the same ratio pooled by sector family, for the categories too thin to price on their own.' }),
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Family' }), el('th', { scope: 'col', class: 'num', text: 'Median multiple' }), el('th', { scope: 'col', class: 'num', text: 'Live protocols' }))),
        el('tbody', null, DATA.families.map(function (c) {
          var members = (DATA.family_members[c.category] || []).join(', ');
          return el('tr', null,
            el('td', null, el('span', { text: c.category }), members ? el('span', { class: 'members', text: members }) : null),
            el('td', { class: 'num', text: c.median_multiple.toFixed(4) + '\u00d7' }),
            el('td', { class: 'num', text: String(c.n) })
          );
        }))
      ),
      el('div', { class: 'sandbox' },
        el('h3', { text: 'Model sandbox' }),
        el('p', { class: 'sub', text: 'Move the sliders and the board recomputes live, so you can see what the model is sensitive to.' }),
        el('div', { class: 'sliders' },
          el('div', { class: 'slider' }, el('label', null, 'Category multiple scale: ', multLabel), multSlider),
          el('div', { class: 'slider' }, el('label', null, 'Growth weight: ', weightLabel), weightSlider),
          el('div', { class: 'slider' }, el('label', { text: ' ' }), reset)
        ),
        sandboxActive() ? el('p', { class: 'sandbox-note', text: 'Sandbox is on: the values shown are recomputed with your settings. board.json keeps the model\u2019s own numbers.' }) : null
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  // Which level priced this row's multiple, and how many live protocols priced it.
  function basisNote(row) {
    if (row.multiple_source === 'category') {
      var c = DATA.comparables.filter(function (x) { return x.category === row.multiple_basis; })[0];
      return row.multiple_basis + ' category median (' + (c ? c.n : '?') + ' live)';
    }
    if (row.multiple_source === 'family') {
      var f = DATA.families.filter(function (x) { return x.category === row.multiple_basis; })[0];
      return row.multiple_basis + ' family median (' + (f ? f.n : '?') + ' live)';
    }
    return 'Overall median (' + DATA.live_comparables_n + ' live)';
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var shown = displayImplied(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('div', { class: 'detail-actions' },
        el('button', { class: 'copy', type: 'button', 'aria-label': 'Copy a link to this row', text: 'Copy link', onclick: function (ev) {
          var link = window.location.href.split('#')[0] + '#p=' + row.slug;
          var done = function () { ev.target.textContent = 'Copied'; window.setTimeout(function () { ev.target.textContent = 'Copy link'; }, 1500); };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(link).then(done, function () { window.prompt('Copy this link', link); });
          } else {
            window.prompt('Copy this link', link);
          }
        } }),
        el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
      )
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: row.category_multiple.toFixed(4) + '\u00d7' })),
        el('div', null, el('span', { text: 'Priced off' }), el('b', { text: basisNote(row) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(shown) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(shown) + (shown === row.implied_value_usd ? ', the same number board.json carries.' : ', with the sandbox settings; board.json carries ' + fmtUsd(row.implied_value_usd) + '.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
