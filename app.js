(function () {
  'use strict';

  const STORE = 'siong-fatt-review-v1';
  const PL_SECTIONS = ['Sales', 'Sales returns', 'Cost of sales', 'Other income', 'Expenses', 'Taxation'];
  const BS_SECTIONS = ['Fixed assets', 'Current assets', 'Current liabilities', 'Equity'];
  const TABS = [
    { id: 'summary', label: 'Summary' },
    { id: 'profit', label: 'Profit' },
    { id: 'cash', label: 'Cash & working capital' },
    { id: 'equity', label: 'Equity' },
    { id: 'shares', label: 'Share value' },
    { id: 'whatif', label: 'What-if' },
    { id: 'compare', label: 'Comparison' },
    { id: 'data', label: 'Data' }
  ];

  // ---------- helpers ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.setAttribute('style', v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  const div = (n, d) => (d ? n / d : 0);
  const num = v => (Number.isFinite(+v) ? +v : 0);

  const nf0 = new Intl.NumberFormat('en-MY', { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = v => (v < 0 ? '−' : '');
  const fmt = {
    rm: v => sign(v) + 'RM ' + nf0.format(Math.abs(v)),
    rmc: v => {
      const a = Math.abs(v);
      const s = a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e4 ? (a / 1e3).toFixed(0) + 'k' : nf0.format(a);
      return sign(v) + 'RM ' + s;
    },
    rm2: v => sign(v) + nf2.format(Math.abs(v)),
    pct: v => (v * 100).toFixed(1) + '%',
    pct0: v => (v * 100).toFixed(0) + '%',
    x: v => v.toFixed(2) + '×',
    days: v => v.toFixed(1) + ' days',
    days0: v => v.toFixed(0) + ' days'
  };

  // ---------- state ----------
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE));
      if (valid(s)) return withDefaults(s);
    } catch (e) { /* storage blocked or empty */ }
    return withDefaults(clone(window.DEFAULT_DATA));
  }
  function withDefaults(s) {
    s.assumptions = Object.assign({}, window.DEFAULT_DATA.assumptions, s.assumptions);
    s.label = s.label || 'Main report';
    s.reports = Array.isArray(s.reports) ? s.reports.filter(r => r && Array.isArray(r.pl) && Array.isArray(r.bs)) : [];
    s.compare = Object.assign({ a: 'main', b: null }, s.compare);
    return s;
  }
  function valid(s) {
    return s && Array.isArray(s.pl) && Array.isArray(s.bs) && s.assumptions && typeof s.assumptions === 'object';
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  let state = load();

  // ---------- calculations ----------
  function compute(s) {
    const A = s.assumptions;
    const pl = s.pl, bs = s.bs;
    const tot = rows => rows.reduce((a, r) => a + num(r.amount), 0);
    const sec = (rows, x) => tot(rows.filter(r => r.section === x));
    const grp = (rows, x) => tot(rows.filter(r => r.group === x));
    const code = (rows, c) => tot(rows.filter(r => r.code === c));
    const byGroup = rows => {
      const m = new Map();
      rows.forEach(r => m.set(r.group || '(no group)', (m.get(r.group || '(no group)') || 0) + num(r.amount)));
      const t = tot(rows);
      return [...m].map(([group, amount]) => ({ group, amount, share: div(amount, t) })).sort((a, b) => b.amount - a.amount);
    };

    const k = {};
    k.gross_sales = sec(pl, 'Sales');
    k.net_sales = k.gross_sales - sec(pl, 'Sales returns');
    k.cogs = sec(pl, 'Cost of sales');
    k.gross_profit = k.net_sales - k.cogs;
    k.other_income = sec(pl, 'Other income');
    k.opex = sec(pl, 'Expenses');
    k.npbt = k.gross_profit + k.other_income - k.opex;
    k.tax = sec(pl, 'Taxation');
    k.npat = k.npbt - k.tax;
    k.depreciation = grp(pl, 'Depreciation');
    k.finance = grp(pl, 'Finance costs');
    k.ebitda = k.npbt + k.depreciation + k.finance;
    k.gp_margin = div(k.gross_profit, k.net_sales);
    k.np_margin = div(k.npat, k.net_sales);
    k.ebitda_margin = div(k.ebitda, k.net_sales);
    k.interest_cover = div(k.ebitda, k.finance);
    k.subcontractors = grp(pl, 'Subcontractors');

    k.stock_open = grp(pl, 'Opening stock');
    k.stock_close = grp(bs, 'Stock');
    k.debtors = grp(bs, 'Trade debtors');
    k.creditors = grp(bs, 'Trade creditors');
    k.cash = grp(bs, 'Cash');
    k.borrowings = grp(bs, 'Bank borrowings');
    k.dividend = grp(bs, 'Dividend payable');
    k.fa = sec(bs, 'Fixed assets');
    k.ca = sec(bs, 'Current assets');
    k.cl = sec(bs, 'Current liabilities');
    k.equity = sec(bs, 'Equity');
    k.paid_up = grp(bs, 'Paid-up capital');
    k.profit_in_bs = grp(bs, 'Profit for the year');
    k.total_assets = k.fa + k.ca;

    k.daily_sales = k.net_sales / 365;
    k.daily_cogs = k.cogs / 365;
    k.daily_spend = (k.cogs + k.opex - k.depreciation) / 365;
    k.dso = div(k.debtors, k.daily_sales);
    k.dio = div(k.stock_close, k.daily_cogs);
    k.dio_avg = div((k.stock_open + k.stock_close) / 2, k.daily_cogs);
    k.dpo = div(k.creditors, k.daily_cogs);
    k.ccc = k.dio + k.dso - k.dpo;
    k.ccc_avg = k.dio_avg + k.dso - k.dpo;
    k.stock_increase = k.stock_close - k.stock_open;
    k.stock_share_of_profit = div(k.stock_increase, k.npat);

    k.nca = k.ca - k.cl;
    k.current_ratio = div(k.ca, k.cl);
    k.quick_ratio = div(k.ca - k.stock_close, k.cl);
    k.cash_ratio = div(k.cash, k.cl);
    k.trade_wc = k.debtors + k.stock_close - k.creditors;
    k.cash_after_div = k.cash - k.dividend;
    k.days_cash = div(k.cash, k.daily_spend);
    k.days_cash_after_div = div(k.cash_after_div, k.daily_spend);

    k.opening_equity = k.equity - k.profit_in_bs;
    k.equity_ratio = div(k.equity, k.total_assets);
    k.liab_to_equity = div(k.cl, k.equity);
    k.debt_to_equity = div(k.borrowings, k.equity);
    k.net_debt = k.borrowings - k.cash;
    k.net_gearing = div(k.net_debt, k.equity);
    k.nd_ebitda = div(k.net_debt, k.ebitda);
    k.roe = div(k.npat, k.equity);
    k.roa = div(k.npat, k.total_assets);
    k.balance_diff = k.fa + k.nca - k.equity;
    k.profit_diff = k.npat - k.profit_in_bs;

    // Lorry towing: cost vs what was billed
    k.lorry_towing_cost = code(pl, '621-0000');
    k.lorry_towing_income = code(pl, '510-1000');

    // Value per share
    const n = Math.max(1, num(A.shares_issued));
    k.shares = n;
    k.issue_price = k.paid_up / n;
    k.nav_ps = k.equity / n;
    k.eps = k.npat / n;
    k.dps = k.dividend / n;
    const profit = k.npat - num(A.tax_estimate);
    const debtLike = k.net_debt + k.dividend;
    const pe = [num(A.pe_low), num(A.pe_high)].map(m => (profit * m) / n);
    const ev = [num(A.ev_low), num(A.ev_high)].map(m => (k.ebitda * m - debtLike) / n);
    let fair = [Math.max(pe[0], ev[0]), Math.min(pe[1], ev[1])];
    let fairBasis = 'Where the price/earnings and EV/EBITDA ranges overlap';
    if (fair[0] > fair[1]) {
      fair = [(pe[0] + ev[0]) / 2, (pe[1] + ev[1]) / 2];
      fairBasis = 'Average of the price/earnings and EV/EBITDA ranges (they do not overlap)';
    }
    const minority = [fair[0] * (1 - num(A.minority_discount_high)), fair[1] * (1 - num(A.minority_discount_low))];
    const cautious = (k.equity - num(A.tax_estimate) - num(A.cautious_writedown)) / n;
    k.fair = fair;
    k.minority = minority;
    const shareValue = [
      { method: 'Issue price', low: k.issue_price, high: k.issue_price, basis: 'Paid-up capital ÷ shares in issue' },
      { method: 'Cautious book value', low: cautious, high: cautious, basis: 'Equity less the tax estimate and a write-down of stock, debtors and deposits' },
      { method: 'Book value', low: (k.equity - num(A.tax_estimate)) / n, high: k.nav_ps, basis: 'Equity after and before the tax estimate' },
      { method: 'Price/earnings', low: pe[0], high: pe[1], basis: `Profit after the tax estimate × ${A.pe_low} to ${A.pe_high}` },
      { method: 'EV/EBITDA', low: ev[0], high: ev[1], basis: `EBITDA × ${A.ev_low} to ${A.ev_high}, less net debt and dividend payable` },
      { method: 'Fair value (whole company)', low: fair[0], high: fair[1], basis: fairBasis, key: true },
      { method: 'Minority stake', low: minority[0], high: minority[1], basis: `Fair value less a ${fmt.pct0(num(A.minority_discount_low))}–${fmt.pct0(num(A.minority_discount_high))} discount for lack of control` }
    ];

    // Mixes
    const salesRows = pl.filter(r => r.section === 'Sales');
    const revenueMix = byGroup(salesRows);
    const cogsMix = byGroup(pl.filter(r => r.section === 'Cost of sales' && r.group !== 'Opening stock' && r.group !== 'Closing stock'));
    const opexMix = byGroup(pl.filter(r => r.section === 'Expenses'));
    const caMix = byGroup(bs.filter(r => r.section === 'Current assets'));
    const clMix = byGroup(bs.filter(r => r.section === 'Current liabilities'));
    const eqMix = byGroup(bs.filter(r => r.section === 'Equity'));
    const topExpenses = pl.filter(r => r.section === 'Expenses').slice().sort((a, b) => num(b.amount) - num(a.amount)).slice(0, 10);

    // Health check
    const st = (ok, watch) => (ok ? 'Good' : watch ? 'Watch' : 'Weak');
    const health = [
      { metric: 'Gross margin', result: fmt.pct(k.gp_margin), healthy: '25% or more', status: st(k.gp_margin >= 0.25, k.gp_margin >= 0.2) },
      { metric: 'Net margin after tax', result: fmt.pct(k.np_margin), healthy: '5% or more', status: st(k.np_margin >= 0.05, k.np_margin >= 0.03) },
      { metric: 'Interest cover (EBITDA ÷ interest)', result: fmt.x(k.interest_cover), healthy: '4× or more', status: st(k.interest_cover >= 4, k.interest_cover >= 2) },
      { metric: 'Current ratio', result: fmt.x(k.current_ratio), healthy: '1.2× to 2.0×', status: st(k.current_ratio >= 1.2, k.current_ratio >= 1) },
      { metric: 'Quick ratio', result: fmt.x(k.quick_ratio), healthy: '1.0× or more', status: st(k.quick_ratio >= 1, k.quick_ratio >= 0.8) },
      { metric: 'Cash ratio', result: fmt.x(k.cash_ratio), healthy: '0.2× or more', status: st(k.cash_ratio >= 0.2, k.cash_ratio >= 0.1) },
      { metric: 'Debtor days', result: fmt.days(k.dso), healthy: '35 days or less', status: st(k.dso <= 35, k.dso <= 50) },
      { metric: 'Stock days', result: fmt.days(k.dio), healthy: '15 days or less', status: st(k.dio <= 15, k.dio <= 25) },
      { metric: 'Cash conversion cycle', result: fmt.days(k.ccc), healthy: '15 days or less', status: st(k.ccc <= 15, k.ccc <= 35) },
      { metric: 'Equity ÷ total assets', result: fmt.pct(k.equity_ratio), healthy: '35% or more', status: st(k.equity_ratio >= 0.35, k.equity_ratio >= 0.25) },
      { metric: 'Total liabilities ÷ equity', result: fmt.x(k.liab_to_equity), healthy: '2× or less', status: st(k.liab_to_equity <= 2, k.liab_to_equity <= 2.5) },
      { metric: 'Bank borrowings ÷ equity', result: fmt.x(k.debt_to_equity), healthy: '1× or less', status: st(k.debt_to_equity <= 1, k.debt_to_equity <= 1.5) },
      { metric: 'Net debt ÷ EBITDA', result: fmt.x(k.nd_ebitda), healthy: '3× or less', status: st(k.nd_ebitda <= 3, k.nd_ebitda <= 4) },
      { metric: 'Return on equity', result: fmt.pct(k.roe), healthy: '15% or more', status: st(k.roe >= 0.15, k.roe >= 0.1) },
      { metric: 'Return on assets', result: fmt.pct(k.roa), healthy: '5% or more', status: st(k.roa >= 0.05, k.roa >= 0.03) }
    ];

    // What-if
    const w = {};
    w.dso_release = (k.dso - num(A.target_dso)) * k.daily_sales;
    w.dio_release = (k.dio - num(A.target_dio)) * k.daily_cogs;
    w.dpo_release = (num(A.target_dpo) - k.dpo) * k.daily_cogs;
    w.total = w.dso_release + w.dio_release + w.dpo_release;
    w.new_ccc = num(A.target_dio) + num(A.target_dso) - num(A.target_dpo);
    w.div_now = k.dividend * num(A.dividend_now_pct);
    w.div_later = k.dividend - w.div_now;
    w.cash_after = k.cash + w.total - w.div_now;
    w.days_after = div(w.cash_after, k.daily_spend);
    w.sub_saving = k.subcontractors * num(A.subcontractor_saving_pct);

    return { k, A, shareValue, revenueMix, cogsMix, opexMix, caMix, clMix, eqMix, topExpenses, health, w };
  }

  // ---------- components ----------
  const tip = $('#tip');
  function showTip(ev, lines) {
    tip.replaceChildren(...lines.map((t, i) => h('div', { class: i === 0 ? 't1' : '' }, t)));
    tip.hidden = false;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + tw > window.innerWidth - 8) x = Math.max(8, ev.clientX - tw - 14);
    if (y + th > window.innerHeight - 8) y = Math.max(8, ev.clientY - th - 14);
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  function withTip(el, lines) {
    el.addEventListener('mousemove', ev => showTip(ev, lines));
    el.addEventListener('mouseleave', hideTip);
    return el;
  }

  const tile = (label, value, sub, status) =>
    h('div', { class: 'tile' + (status ? ' ' + status : '') }, h('span', { class: 'label' }, label), h('span', { class: 'value' }, value), sub ? h('span', { class: 'sub' }, sub) : null);
  const card = (title, note, ...content) => h('div', { class: 'card' }, h('h3', null, title), note ? h('p', { class: 'note' }, note) : null, ...content);
  const tiles = (...t) => h('div', { class: 'tiles' }, ...t);
  const grid = (...c) => h('div', { class: 'grid' }, ...c);
  const pill = s => h('span', { class: 'pill ' + ({ Good: 'good', Watch: 'watch', Weak: 'weak' }[s] || '') }, s);
  const status = (ok, watch) => (ok ? 'good' : watch ? 'watch' : 'weak');

  function bars(rows, o) {
    const vals = rows.map(r => num(r[o.value]));
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const span = hi - lo || 1;
    const x = v => ((v - lo) / span) * 100;
    return h('div', { class: 'bars' }, rows.map((r, i) => {
      const v = num(r[o.value]);
      const track = h('div', { class: 'bar-track' },
        h('div', { class: 'bar', style: `left:${x(Math.min(0, v))}%;width:${Math.max(0.6, Math.abs(x(v) - x(0)))}%;background:${o.color ? o.color(r, i) : 'var(--accent)'}` }),
        lo < 0 ? h('div', { class: 'bar-zero', style: `left:${x(0)}%` }) : null);
      const row = h('div', { class: 'bar-row' + (o.total && o.total(r) ? ' total' : '') },
        h('div', { class: 'bar-label' }, r[o.label]), track, h('div', { class: 'bar-value' }, o.fmt(v, r)));
      return o.tip ? withTip(row, o.tip(r)) : row;
    }));
  }

  function rangeChart(rows) {
    const hi = Math.max(1, ...rows.map(r => r.high));
    const x = v => (Math.max(0, v) / hi) * 100;
    return h('div', { class: 'bars' }, rows.map(r => {
      const w = x(r.high) - x(r.low);
      const left = w < 1.2 ? x(r.low) - 0.6 : x(r.low);
      const same = Math.round(r.low) === Math.round(r.high);
      const row = h('div', { class: 'bar-row' + (r.key ? ' total' : '') },
        h('div', { class: 'bar-label' }, r.method),
        h('div', { class: 'bar-track' }, h('div', { class: 'bar', style: `left:${left}%;width:${Math.max(1.2, w)}%;background:${r.key ? 'var(--accent)' : 'var(--bar-muted)'}` })),
        h('div', { class: 'bar-value' }, same ? fmt.rmc(r.low) : fmt.rmc(r.low) + '–' + fmt.rmc(r.high).replace('RM ', '')));
      return withTip(row, [r.method, same ? fmt.rm(r.low) : fmt.rm(r.low) + ' to ' + fmt.rm(r.high), r.basis]);
    }));
  }

  function stackBar(parts) {
    const colors = ['var(--accent)', 'var(--accent-2)', 'var(--accent-3)'];
    return h('div', { class: 'bars' },
      h('div', { class: 'stack' }, parts.map((p, i) => withTip(h('div', { style: `flex:${Math.max(p.share, 0.002)};background:${colors[i]}` }), [p.part, fmt.rm(p.amount), fmt.pct(p.share) + ' of net sales']))),
      h('div', { class: 'legend' }, parts.map((p, i) => h('div', null, h('span', { class: 'swatch', style: `background:${colors[i]}` }), `${p.part} · ${fmt.pct(p.share)} · ${fmt.rmc(p.amount)}`))));
  }

  function table(cols, rows, rowClass) {
    return h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, cols.map(c => h('th', { class: c.num ? 'num' : '' }, c.label)))),
      h('tbody', null, rows.map(r => h('tr', { class: rowClass ? rowClass(r) : '' }, cols.map(c => h('td', { class: c.num ? 'num' : '' }, c.render ? c.render(r) : r[c.key])))))));
  }

  const muted = () => 'var(--bar-muted)';
  const firstAccent = (r, i) => (i === 0 ? 'var(--accent)' : 'var(--bar-muted)');

  // ---------- panels ----------
  function risks(c) {
    const { k, A } = c;
    const out = [];
    if (k.days_cash_after_div < 14) out.push(`Only ${fmt.rm(k.cash_after_div)} cash is left once the dividend is paid, about ${fmt.days0(k.days_cash_after_div)} of spending.`);
    if (k.dso > 35) out.push(`Customers take ${fmt.days(k.dso)} to pay. Collecting 10 days faster would free about ${fmt.rm(k.daily_sales * 10)}.`);
    if (k.stock_share_of_profit > 0.2) out.push(`Stock rose by ${fmt.rm(k.stock_increase)}, which is ${fmt.pct0(k.stock_share_of_profit)} of net profit. Check the stock count and valuation.`);
    if (k.npbt > 0 && k.tax < 0.05 * k.npbt) out.push(`Tax provided is only ${fmt.rm(k.tax)}. A proper charge could be around ${fmt.rm(num(A.tax_estimate))}.`);
    if (k.nca < 0) out.push(`Net current assets are ${fmt.rm(k.nca)}, partly because ${fmt.rm(k.borrowings)} of bank borrowings are all shown as current.`);
    if (k.equity_ratio < 0.35) out.push(`Equity is only ${fmt.pct(k.equity_ratio)} of total assets, and bank borrowings are ${fmt.x(k.debt_to_equity)} equity.`);
    if (k.lorry_towing_cost > k.lorry_towing_income) out.push(`Lorry towing cost ${fmt.rm(k.lorry_towing_cost)} but only ${fmt.rm(k.lorry_towing_income)} was billed as towing income.`);
    if (!out.length) out.push('No major warning signs on these figures.');
    return out;
  }

  function renderSummary(c) {
    const { k } = c;
    const p = $('#p-summary');
    p.replaceChildren(
      h('p', { class: 'lead' },
        k.npat >= 0 ? 'A profitable year: net profit after tax of ' : 'A loss-making year: net result after tax of ',
        h('b', null, fmt.rm(k.npat)), ` on ${fmt.rm(k.net_sales)} net sales (${fmt.pct(k.np_margin)}). `,
        k.days_cash_after_div < 14 ? 'Cash is tight: ' : 'Cash position: ',
        h('b', null, fmt.rm(k.cash_after_div)), ` left once the dividend is paid, about ${fmt.days0(k.days_cash_after_div)} of spending.`),
      tiles(
        tile('Net profit after tax', fmt.rmc(k.npat), fmt.pct(k.np_margin) + ' of sales', status(k.np_margin >= 0.05, k.np_margin >= 0.03)),
        tile('Cash conversion cycle', fmt.days(k.ccc), fmt.days(k.ccc_avg) + ' using average stock', status(k.ccc <= 15, k.ccc <= 35)),
        tile('Net current assets', fmt.rmc(k.nca), 'Current ratio ' + fmt.x(k.current_ratio), status(k.nca >= 0, k.current_ratio >= 0.8)),
        tile('Equity ÷ total assets', fmt.pct(k.equity_ratio), 'Bank borrowings ' + fmt.x(k.debt_to_equity) + ' equity', status(k.equity_ratio >= 0.35, k.equity_ratio >= 0.25)),
        tile('Fair value per share', fmt.rmc(k.fair[0]) + '–' + fmt.rmc(k.fair[1]).replace('RM ', ''), 'Whole-company sale, ' + k.shares + ' shares')),
      card('Health check', 'Each ratio against a common rule of thumb for a business of this kind.',
        table([{ label: 'Measure', key: 'metric' }, { label: 'Result', key: 'result', num: true }, { label: 'Healthy level', key: 'healthy' }, { label: 'Status', render: r => pill(r.status) }], c.health)),
      grid(
        card('Main risks', null, h('ul', { class: 'list' }, risks(c).map(t => h('li', null, t)))),
        card('Actions', null, h('ul', { class: 'list' },
          ['Pay the dividend in stages, or reinvest it as share capital.',
            'Review the debtor ageing report every week and take deposits on large lorry jobs.',
            'Ask for longer supplier terms and pay subcontractors after the customer pays.',
            'Hold stock to about 15 days of cost of sales and return slow-moving parts.',
            'Arrange a standby overdraft and keep a minimum cash balance.',
            'Ask the accountant to split loans into current and non-current portions and to provide for tax.'].map(t => h('li', null, t))))));
  }

  function renderProfit(c) {
    const { k } = c;
    const salesSplit = [
      { part: 'Cost of sales', amount: k.cogs, share: div(k.cogs, k.net_sales) },
      { part: 'Operating expenses', amount: k.opex, share: div(k.opex, k.net_sales) },
      { part: 'Profit before tax', amount: k.npbt, share: div(k.npbt, k.net_sales) }
    ];
    const pnl = [
      { line: 'Net sales', amount: k.net_sales, sub: true },
      { line: 'Cost of sales', amount: -k.cogs },
      { line: 'Gross profit', amount: k.gross_profit, sub: true },
      { line: 'Other income', amount: k.other_income },
      { line: 'Operating expenses', amount: -k.opex },
      { line: 'Profit before tax', amount: k.npbt, sub: true },
      { line: 'Taxation', amount: -k.tax },
      { line: 'Profit after tax', amount: k.npat, sub: true },
      { line: 'Add back depreciation', amount: k.depreciation },
      { line: 'Add back interest', amount: k.finance },
      { line: 'EBITDA', amount: k.ebitda, sub: true }
    ];
    $('#p-profit').replaceChildren(
      tiles(
        tile('Net sales', fmt.rmc(k.net_sales), 'After returns inwards'),
        tile('Gross profit', fmt.rmc(k.gross_profit), fmt.pct(k.gp_margin) + ' of sales', status(k.gp_margin >= 0.25, k.gp_margin >= 0.2)),
        tile('Net profit after tax', fmt.rmc(k.npat), fmt.pct(k.np_margin) + ' of sales', status(k.np_margin >= 0.05, k.np_margin >= 0.03)),
        tile('EBITDA', fmt.rmc(k.ebitda), fmt.pct(k.ebitda_margin) + ' of sales · interest cover ' + fmt.x(k.interest_cover))),
      grid(
        card('Where each ringgit of sales goes', 'Share of net sales taken by cost of sales, operating expenses and profit before tax.', stackBar(salesSplit)),
        card('Profit and loss summary', null, table(
          [{ label: 'Line', key: 'line' }, { label: 'RM', num: true, render: r => fmt.rm2(r.amount) }, { label: '% of sales', num: true, render: r => fmt.pct(div(r.amount, k.net_sales)) }],
          pnl, r => (r.sub ? 'subtotal' : ''))),
        card('Sales by segment', 'Each segment\'s share of gross sales.',
          bars(c.revenueMix, { label: 'group', value: 'amount', fmt: fmt.rmc, color: firstAccent, tip: r => [r.group, fmt.rm(r.amount), fmt.pct(r.share) + ' of gross sales'] })),
        card('Cost of sales by type', `Opening and closing stock are left out. Stock rose by ${fmt.rm(k.stock_increase)}, which lowered cost of sales and is ${fmt.pct0(k.stock_share_of_profit)} of net profit.`,
          bars(c.cogsMix, { label: 'group', value: 'amount', fmt: fmt.rmc, color: (r, i) => (i < 2 ? 'var(--accent)' : 'var(--bar-muted)'), tip: r => [r.group, fmt.rm(r.amount), fmt.pct(r.share) + ' of cost of sales before stock'] })),
        card('Operating expenses by type', null,
          bars(c.opexMix, { label: 'group', value: 'amount', fmt: fmt.rmc, color: firstAccent, tip: r => [r.group, fmt.rm(r.amount), fmt.pct(r.share) + ' of operating expenses'] })),
        card('Largest expense lines', 'The ten biggest lines in operating expenses.',
          bars(c.topExpenses, { label: 'account', value: 'amount', fmt: fmt.rmc, color: muted, tip: r => [r.account, fmt.rm(num(r.amount)), fmt.pct(div(num(r.amount), k.opex)) + ' of operating expenses'] }))));
  }

  function renderCash(c) {
    const { k } = c;
    const cccParts = [
      { part: 'Stock days', days: k.dio },
      { part: 'Debtor days', days: k.dso },
      { part: 'Supplier days', days: -k.dpo },
      { part: 'Cash cycle', days: k.ccc }
    ];
    const wc = [
      { item: 'Trade debtors (net)', amount: k.debtors, days: fmt.days(k.dso) + ' of sales' },
      { item: 'Stock', amount: k.stock_close, days: fmt.days(k.dio) + ' of cost of sales' },
      { item: 'Trade creditors', amount: -k.creditors, days: fmt.days(k.dpo) + ' of cost of sales' },
      { item: 'Trade working capital', amount: k.trade_wc, days: fmt.days(k.ccc) + ' cash cycle', sub: true },
      { item: 'Cash', amount: k.cash, days: fmt.days0(k.days_cash) + ' of spending' },
      { item: 'Dividend payable', amount: -k.dividend, days: '' },
      { item: 'Cash after dividend', amount: k.cash_after_div, days: fmt.days0(k.days_cash_after_div) + ' of spending', sub: true }
    ];
    $('#p-cash').replaceChildren(
      tiles(
        tile('Cash conversion cycle', fmt.days(k.ccc), fmt.days(k.ccc_avg) + ' using average stock', status(k.ccc <= 15, k.ccc <= 35)),
        tile('Current ratio', fmt.x(k.current_ratio), 'Comfortable range is 1.2× to 2.0×', status(k.current_ratio >= 1.2, k.current_ratio >= 1)),
        tile('Net current assets', fmt.rmc(k.nca), 'Quick ratio ' + fmt.x(k.quick_ratio), status(k.nca >= 0, k.current_ratio >= 0.8)),
        tile('Cash left after dividend', fmt.rmc(k.cash_after_div), 'About ' + fmt.days0(k.days_cash_after_div) + ' of total spending', status(k.days_cash_after_div >= 30, k.days_cash_after_div >= 14))),
      grid(
        card('How the cash cycle adds up', `Stock days plus debtor days, less supplier days. Collecting 10 days faster would free about ${fmt.rm(k.daily_sales * 10)}.`,
          bars(cccParts, { label: 'part', value: 'days', fmt: v => sign(v) + Math.abs(v).toFixed(1), total: r => r.part === 'Cash cycle', color: r => (r.part === 'Cash cycle' ? 'var(--accent)' : r.days < 0 ? 'var(--accent-3)' : 'var(--bar-muted)'), tip: r => [r.part, Math.abs(r.days).toFixed(1) + ' days' + (r.days < 0 ? ' (subtracted)' : '')] })),
        card('Working capital and cash', null, table(
          [{ label: 'Item', key: 'item' }, { label: 'RM', num: true, render: r => fmt.rm2(r.amount) }, { label: 'Days', key: 'days', num: true }],
          wc, r => (r.sub ? 'subtotal' : ''))),
        card('Current liabilities by type', 'Bank borrowings and the dividend payable push net current assets below zero.',
          bars(c.clMix, { label: 'group', value: 'amount', fmt: fmt.rmc, color: r => (r.group === 'Bank borrowings' || r.group === 'Dividend payable' ? 'var(--bad)' : 'var(--bar-muted)'), tip: r => [r.group, fmt.rm(r.amount), fmt.pct(r.share) + ' of current liabilities'] })),
        card('Current assets by type', null,
          bars(c.caMix, { label: 'group', value: 'amount', fmt: fmt.rmc, color: firstAccent, tip: r => [r.group, fmt.rm(r.amount), fmt.pct(r.share) + ' of current assets'] }))));
  }

  function renderEquity(c) {
    const { k } = c;
    const funding = [
      { item: 'Fixed assets', amount: k.fa },
      { item: 'Equity', amount: k.equity },
      { item: 'Bank borrowings', amount: k.borrowings },
      { item: 'Net debt', amount: k.net_debt }
    ];
    const gearing = [
      { measure: 'Total assets', value: fmt.rm(k.total_assets) },
      { measure: 'Total liabilities', value: fmt.rm(k.cl) },
      { measure: 'Equity ÷ total assets', value: fmt.pct(k.equity_ratio) },
      { measure: 'Total liabilities ÷ equity', value: fmt.x(k.liab_to_equity) },
      { measure: 'Bank borrowings ÷ equity', value: fmt.x(k.debt_to_equity) },
      { measure: 'Net debt ÷ equity', value: fmt.x(k.net_gearing) },
      { measure: 'Net debt ÷ EBITDA', value: fmt.x(k.nd_ebitda) },
      { measure: 'Return on equity', value: fmt.pct(k.roe) },
      { measure: 'Return on assets', value: fmt.pct(k.roa) }
    ];
    $('#p-equity').replaceChildren(
      tiles(
        tile('Total equity', fmt.rmc(k.equity), 'Up from ' + fmt.rmc(k.opening_equity) + ' at the start of the year'),
        tile('Equity ÷ total assets', fmt.pct(k.equity_ratio), 'Healthy is 35% or more', status(k.equity_ratio >= 0.35, k.equity_ratio >= 0.25)),
        tile('Bank borrowings ÷ equity', fmt.x(k.debt_to_equity), 'Healthy is 1.0× or less', status(k.debt_to_equity <= 1, k.debt_to_equity <= 1.5)),
        tile('Return on equity', fmt.pct(k.roe), 'Profit after tax ÷ closing equity', status(k.roe >= 0.15, k.roe >= 0.1))),
      grid(
        card('What equity is made of', null,
          bars(c.eqMix, { label: 'group', value: 'amount', fmt: fmt.rmc, color: (r, i) => ['var(--accent)', 'var(--accent-2)', 'var(--accent-3)'][i % 3], tip: r => [r.group, fmt.rm(r.amount), fmt.pct(r.share) + ' of equity'] })),
        card('Fixed assets against equity and debt', k.fa > k.equity ? `Fixed assets are ${fmt.rm(k.fa - k.equity)} more than equity, so part of them is funded by short-term money.` : 'Equity covers all fixed assets.',
          bars(funding, { label: 'item', value: 'amount', fmt: fmt.rmc, color: r => (r.item === 'Equity' ? 'var(--accent)' : 'var(--bar-muted)'), tip: r => [r.item, fmt.rm(r.amount)] })),
        card('Gearing and returns', null, table([{ label: 'Measure', key: 'measure' }, { label: 'Result', key: 'value', num: true }], gearing))));
  }

  function renderShares(c) {
    const { k, A } = c;
    const sell = Math.max(0, num(A.shares_to_sell));
    const pctSold = div(sell, k.shares);
    $('#out-shares').replaceChildren(
      h('p', { class: 'note' }, `Based on ${k.shares} shares in issue, so each share is ${fmt.pct(div(1, k.shares))} of the company. An indicative estimate, not a formal valuation.`),
      tiles(
        tile('Fair value per share', fmt.rmc(k.fair[0]) + '–' + fmt.rmc(k.fair[1]).replace('RM ', ''), 'Whole-company sale'),
        tile('Minority stake per share', fmt.rmc(k.minority[0]) + '–' + fmt.rmc(k.minority[1]).replace('RM ', ''), 'After the minority discount'),
        tile('Book value per share', fmt.rm(k.nav_ps), 'Issued at ' + fmt.rm(k.issue_price) + ' per share'),
        tile('Earnings per share', fmt.rm(k.eps), 'Dividend payable ' + fmt.rm(k.dps) + ' per share')),
      grid(
        card('Value per share by method', 'Low to high estimate for each method, on one scale.', rangeChart(c.shareValue)),
        card('How each value is worked out', 'Per share.', table(
          [{ label: 'Method', key: 'method' }, { label: 'Low', num: true, render: r => fmt.rm(r.low) }, { label: 'High', num: true, render: r => fmt.rm(r.high) }, { label: 'Basis', key: 'basis' }],
          c.shareValue, r => (r.key ? 'subtotal' : ''))),
        card(`Selling ${sell} share${sell === 1 ? '' : 's'} (${fmt.pct(pctSold)})`, 'Set the number of shares in the assumptions below.', table(
          [{ label: 'Basis', key: 'basis' }, { label: 'Value', key: 'value', num: true }],
          [
            { basis: 'Book value', value: fmt.rm(k.nav_ps * sell) },
            { basis: 'Minority stake, fair value', value: fmt.rm(k.minority[0] * sell) + ' to ' + fmt.rm(k.minority[1] * sell) },
            { basis: 'Whole-company fair value, pro rata', value: fmt.rm(k.fair[0] * sell) + ' to ' + fmt.rm(k.fair[1] * sell) }
          ]))));
  }

  function renderWhatIf(c) {
    const { k, A, w } = c;
    const days = [
      { part: 'Debtor days', now: k.dso, target: num(A.target_dso) },
      { part: 'Stock days', now: k.dio, target: num(A.target_dio) },
      { part: 'Supplier days', now: k.dpo, target: num(A.target_dpo) },
      { part: 'Cash cycle', now: k.ccc, target: w.new_ccc }
    ];
    const daysRows = days.flatMap(d => [{ label: d.part + ' now', v: d.now, kind: 'now' }, { label: d.part + ' target', v: d.target, kind: 'target' }]);
    $('#out-whatif').replaceChildren(
      tiles(
        tile('Cash released', fmt.rmc(w.total), 'From debtors, stock and suppliers', status(w.total > 0, w.total >= 0)),
        tile('New cash conversion cycle', fmt.days(w.new_ccc), 'Now ' + fmt.days(k.ccc)),
        tile('Cash after dividend', fmt.rmc(w.cash_after), 'About ' + fmt.days0(w.days_after) + ' of spending · now ' + fmt.rmc(k.cash_after_div), status(w.days_after >= 30, w.days_after >= 14)),
        tile('Extra profit a year', fmt.rmc(w.sub_saving), 'From ' + fmt.pct0(num(A.subcontractor_saving_pct)) + ' lower subcontractor rates')),
      grid(
        card('Where the cash comes from', null, table(
          [{ label: 'Source', key: 'src' }, { label: 'RM', num: true, render: r => fmt.rm(r.amount) }],
          [
            { src: `Debtors: ${fmt.days(k.dso)} → ${fmt.days(num(A.target_dso))}`, amount: w.dso_release },
            { src: `Stock: ${fmt.days(k.dio)} → ${fmt.days(num(A.target_dio))}`, amount: w.dio_release },
            { src: `Suppliers: ${fmt.days(k.dpo)} → ${fmt.days(num(A.target_dpo))}`, amount: w.dpo_release },
            { src: 'Total released', amount: w.total, sub: true },
            { src: 'Cash today', amount: k.cash },
            { src: `Dividend paid now (${fmt.pct0(num(A.dividend_now_pct))})`, amount: -w.div_now },
            { src: 'Cash after changes and dividend', amount: w.cash_after, sub: true },
            { src: 'Dividend still to pay later', amount: w.div_later }
          ], r => (r.sub ? 'subtotal' : ''))),
        card('Days now and at target', null,
          bars(daysRows, { label: 'label', value: 'v', fmt: v => v.toFixed(1), color: r => (r.kind === 'target' ? 'var(--accent)' : 'var(--bar-muted)'), tip: r => [r.label, r.v.toFixed(1) + ' days'] }))));
  }

  // ---------- controls ----------
  const SHARE_CONTROLS = [
    { key: 'shares_issued', label: 'Shares in issue', type: 'number', min: 1, step: 1 },
    { key: 'shares_to_sell', label: 'Shares to sell (example)', type: 'number', min: 0, step: 1 },
    { key: 'tax_estimate', label: 'Tax not yet provided (RM)', type: 'number', min: 0, step: 1000 },
    { key: 'cautious_writedown', label: 'Cautious write-down (RM)', type: 'number', min: 0, step: 1000, hint: 'Doubts about stock, debtors and deposits' },
    { key: 'pe_low', label: 'P/E multiple, low', type: 'range', min: 1, max: 10, step: 0.5, show: v => v + '×' },
    { key: 'pe_high', label: 'P/E multiple, high', type: 'range', min: 1, max: 10, step: 0.5, show: v => v + '×' },
    { key: 'ev_low', label: 'EV/EBITDA multiple, low', type: 'range', min: 1, max: 8, step: 0.5, show: v => v + '×' },
    { key: 'ev_high', label: 'EV/EBITDA multiple, high', type: 'range', min: 1, max: 8, step: 0.5, show: v => v + '×' },
    { key: 'minority_discount_low', label: 'Minority discount, low', type: 'range', min: 0, max: 0.5, step: 0.05, show: fmt.pct0 },
    { key: 'minority_discount_high', label: 'Minority discount, high', type: 'range', min: 0, max: 0.5, step: 0.05, show: fmt.pct0 }
  ];
  const WHATIF_CONTROLS = [
    { key: 'target_dso', label: 'Target debtor days', type: 'range', min: 15, max: 70, step: 1, show: v => v + ' days' },
    { key: 'target_dio', label: 'Target stock days', type: 'range', min: 5, max: 40, step: 1, show: v => v + ' days' },
    { key: 'target_dpo', label: 'Target supplier days', type: 'range', min: 15, max: 90, step: 1, show: v => v + ' days' },
    { key: 'dividend_now_pct', label: 'Share of dividend paid now', type: 'range', min: 0, max: 1, step: 0.05, show: fmt.pct0 },
    { key: 'subcontractor_saving_pct', label: 'Subcontractor rate saving', type: 'range', min: 0, max: 0.15, step: 0.01, show: fmt.pct0 }
  ];

  function buildControls(container, defs) {
    container.replaceChildren(...defs.map(d => {
      const id = 'ctl-' + d.key;
      const out = h('output', { for: id }, d.show ? d.show(num(state.assumptions[d.key])) : '');
      const input = h('input', { id, type: d.type, min: d.min, max: d.max, step: d.step, value: state.assumptions[d.key] });
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        if (!Number.isFinite(v)) return;
        state.assumptions[d.key] = v;
        if (d.show) out.textContent = d.show(v);
        save();
        renderOutputs();
      });
      return h('div', { class: 'control' },
        h('div', { class: 'row' }, h('label', { for: id }, d.label), d.type === 'range' ? out : null),
        input,
        d.hint ? h('span', { class: 'hint' }, d.hint) : null);
    }));
  }

  // ---------- data editor ----------
  function knownGroups() {
    const set = new Set([...state.pl, ...state.bs].map(r => r.group).filter(Boolean));
    ['Opening stock', 'Closing stock', 'Depreciation', 'Finance costs', 'Subcontractors', 'Stock', 'Trade debtors', 'Trade creditors', 'Cash', 'Bank borrowings', 'Dividend payable', 'Paid-up capital', 'Profit for the year'].forEach(g => set.add(g));
    $('#groups-list').replaceChildren(...[...set].sort().map(g => h('option', { value: g })));
  }

  function dataTable(which, sections) {
    const rows = state[which];
    const onChange = (r, field, value) => {
      r[field] = field === 'amount' ? num(value) : value;
      save();
      if (field === 'group') knownGroups();
      renderOutputs();
    };
    const inp = (r, field, attrs) => {
      const el = h('input', Object.assign({ value: r[field] ?? '', 'aria-label': field }, attrs));
      el.addEventListener('change', () => onChange(r, field, el.value));
      return el;
    };
    const body = rows.map((r, i) => {
      const sel = h('select', { 'aria-label': 'section' }, sections.map(s => h('option', { value: s, selected: r.section === s }, s)));
      sel.addEventListener('change', () => onChange(r, 'section', sel.value));
      return h('tr', null,
        h('td', { class: 'code' }, inp(r, 'code', { type: 'text' })),
        h('td', { class: 'account' }, inp(r, 'account', { type: 'text' })),
        h('td', null, sel),
        h('td', { class: 'group' }, inp(r, 'group', { type: 'text', list: 'groups-list' })),
        h('td', { class: 'num' }, inp(r, 'amount', { type: 'number', step: '0.01', class: 'amount' })),
        h('td', null, h('button', { type: 'button', class: 'icon', 'aria-label': 'Remove line ' + (r.account || i + 1), onclick: () => { rows.splice(i, 1); save(); renderData(); renderOutputs(); } }, '✕')));
    });
    return h('table', { class: 'data-table' },
      h('thead', null, h('tr', null, ['Code', 'Account', 'Section', 'Group', 'Amount (RM)', ''].map((t, i) => h('th', { class: i === 4 ? 'num' : '' }, t)))),
      h('tbody', null, body));
  }

  function renderData() {
    knownGroups();
    $('#data-pl').replaceChildren(dataTable('pl', PL_SECTIONS));
    $('#data-bs').replaceChildren(dataTable('bs', BS_SECTIONS));
  }

  function renderTotals(c) {
    const { k } = c;
    const ok = Math.abs(k.balance_diff) < 0.01;
    const profitOk = Math.abs(k.profit_diff) < 0.01;
    $('#data-totals').replaceChildren(
      h('div', { class: 'checks' },
        [['Net sales', k.net_sales], ['Cost of sales', k.cogs], ['Operating expenses', k.opex], ['Profit after tax', k.npat],
          ['Fixed assets', k.fa], ['Current assets', k.ca], ['Current liabilities', k.cl], ['Equity', k.equity]]
          .map(([l, v]) => h('div', null, h('span', null, l), h('b', null, fmt.rm2(v))))),
      h('p', { class: 'note ' + (ok ? 'good' : 'weak') }, ok ? 'Balance sheet balances: fixed assets plus net current assets equal equity.' : `Balance sheet is out by ${fmt.rm2(k.balance_diff)}.`),
      h('p', { class: 'note ' + (profitOk ? 'good' : 'weak') }, profitOk ? 'Profit after tax matches the profit for the year in the balance sheet.' : `Profit after tax differs from the balance sheet's profit for the year by ${fmt.rm2(k.profit_diff)}.`),
      h('p', { class: 'note' }, 'Some calculations rely on group names: Opening stock, Depreciation, Finance costs and Subcontractors in the P&L; Stock, Trade debtors, Trade creditors, Cash, Bank borrowings, Dividend payable, Paid-up capital and Profit for the year in the balance sheet.'));
    const notice = $('#notice');
    notice.hidden = ok && profitOk;
    notice.textContent = ok ? 'Profit after tax does not match the balance sheet. Check the Data tab.' : 'The balance sheet does not balance. Check the Data tab.';
  }

  function addRow(which, section) {
    state[which].push({ code: '', account: '', section, group: '', amount: 0 });
    save();
    renderData();
    renderOutputs();
    const inputs = document.querySelectorAll(`#data-${which} tbody tr:last-child input`);
    if (inputs[1]) inputs[1].focus();
  }

  // ---------- render ----------
  function renderOutputs() {
    const c = compute(state);
    $('#company').textContent = state.company || 'Financial review';
    $('#period').textContent = (state.period || '') + ' · management accounts, unaudited';
    document.title = (state.company ? state.company.replace(/ Sdn\.? ?Bhd\.?/i, '') : 'Company') + ' Financial Review';
    renderSummary(c);
    renderProfit(c);
    renderCash(c);
    renderEquity(c);
    renderShares(c);
    renderWhatIf(c);
    renderTotals(c);
    renderReports();
    renderCompare();
  }

  function renderAll() {
    buildControls($('#ctl-shares'), SHARE_CONTROLS);
    buildControls($('#ctl-whatif'), WHATIF_CONTROLS);
    buildManualForm();
    renderData();
    renderOutputs();
  }

  // ---------- yearly reports ----------
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const AMT = '-?\\d{1,3}(?:,\\d{3})*\\.\\d{2}';
  const CODE_LINE = new RegExp('^(\\d{3}-\\d{4}|[A-Z]{2,4}-\\d{4})\\s*(.*?)\\s*(' + AMT + ')$');
  const PL_HEADS = { 'SALES': 'Sales', 'REVENUE': 'Sales', 'SALES ADJUSTMENTS': 'Sales returns', 'COST OF GOODS SOLD': 'Cost of sales', 'COST OF SALES': 'Cost of sales', 'OTHER INCOMES': 'Other income', 'OTHER INCOME': 'Other income', 'EXPENSES': 'Expenses', 'TAXATION': 'Taxation' };
  const BS_HEADS = { 'FIXED ASSETS': 'Fixed assets', 'NON-CURRENT ASSETS': 'Fixed assets', 'CURRENT ASSETS': 'Current assets', 'CURRENT LIABILITIES': 'Current liabilities', 'FINANCED BY': 'Equity', 'CAPITAL': 'Equity', 'RETAINED EARNING': 'Equity', 'RETAINED EARNINGS': 'Equity' };
  const toAmount = s => parseFloat(String(s).replace(/,/g, '')) || 0;

  const mainReport = () => ({ id: 'main', label: state.label, period: state.period, company: state.company, pl: state.pl, bs: state.bs });
  const allReports = () => [mainReport(), ...state.reports];
  const findReport = id => allReports().find(r => r.id === id);
  const newId = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const reportCalc = r => compute({ pl: r.pl, bs: r.bs, assumptions: state.assumptions }).k;

  function addReport(rep) {
    const i = state.reports.findIndex(r => r.label === rep.label);
    if (i >= 0) { rep.id = state.reports[i].id; state.reports[i] = rep; } else state.reports.push(rep);
    state.compare = { a: 'main', b: rep.id };
    return i >= 0 ? 'Replaced ' + rep.label : 'Added ' + rep.label;
  }

  function codeGroupMap() {
    const m = new Map();
    [state, ...state.reports, window.DEFAULT_DATA].forEach(r => [...r.pl, ...r.bs].forEach(l => {
      if (l.code && l.group && !m.has(l.code)) m.set(l.code, l.group);
    }));
    return m;
  }

  function sectionFromCode(kind, code) {
    const n = parseInt(code, 10);
    if (kind === 'pl') {
      if (n === 528) return 'Sales returns';
      if (n >= 500 && n < 530) return 'Sales';
      if (n >= 530 && n < 600) return 'Other income';
      if (n >= 600 && n < 700) return 'Cost of sales';
      if (n === 999) return 'Taxation';
      return 'Expenses';
    }
    if (n < 200) return 'Equity';
    if (n < 300) return 'Fixed assets';
    if (n < 400) return 'Current assets';
    return 'Current liabilities';
  }

  function guessGroup(kind, section, account) {
    const a = String(account).toUpperCase();
    if (kind === 'pl') {
      if (/OPENING STOCK|STOCKS? AT THE BEGINNING/.test(a)) return 'Opening stock';
      if (/CLOSING STOCK|STOCKS? AT THE END/.test(a)) return 'Closing stock';
      if (/DEPRECIATION/.test(a)) return 'Depreciation';
      if (section === 'Expenses' && /INTEREST/.test(a)) return 'Finance costs';
      if (/SUB-?CONTRACT/.test(a)) return 'Subcontractors';
      return { 'Sales': 'Other sales', 'Sales returns': 'Sales returns', 'Cost of sales': 'Other cost of sales', 'Other income': 'Other income', 'Expenses': 'Admin & other', 'Taxation': 'Taxation' }[section] || 'Other';
    }
    if (/^STOCK|INVENTOR/.test(a)) return 'Stock';
    if (/TRADE (DEBTORS|RECEIVABLES)|IMPAIRMENT OF TRADE/.test(a)) return 'Trade debtors';
    if (/TRADE (CREDITORS|PAYABLES)/.test(a)) return 'Trade creditors';
    if (/^CASH|BANK BALANCE/.test(a)) return 'Cash';
    if (/DIVIDEND/.test(a)) return 'Dividend payable';
    if (/PAID[- ]?UP|SHARE CAPITAL/.test(a)) return 'Paid-up capital';
    if (section === 'Current liabilities' && /LOAN|HIRE PURCHASE|LEASING|OVERDRAFT|FINANCING|INTEREST SUSPENSE/.test(a)) return 'Bank borrowings';
    return { 'Fixed assets': 'Fixed assets', 'Current assets': 'Other receivables', 'Current liabilities': 'Other operating payables', 'Equity': 'Retained earnings' }[section] || 'Other';
  }

  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDFJS;
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; resolve(window.pdfjsLib); };
      s.onerror = () => reject(new Error('the PDF reader could not load. Check the internet connection and try again'));
      document.head.append(s);
    });
  }

  // Text lines of a PDF, in the order they are drawn, with pieces on the same line joined.
  async function pdfLines(file) {
    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const lines = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const rows = [];
      content.items.forEach(it => {
        if (!it.str || !it.str.trim()) return;
        const y = it.transform[5];
        let row = rows.find(r => Math.abs(r.y - y) <= 2);
        if (!row) { row = { y, items: [] }; rows.push(row); }
        row.items.push({ x: it.transform[4], s: it.str });
      });
      rows.forEach(r => lines.push(r.items.sort((a, b) => a.x - b.x).map(i => i.s).join(' ').replace(/\s+/g, ' ').trim()));
    }
    return lines;
  }

  function parseStatement(lines) {
    const text = lines.join('\n');
    const kind = /balance sheet|financial position/i.test(text) ? 'bs' : /profit (and|&) loss|income statement/i.test(text) ? 'pl' : null;
    if (!kind) return null;
    const company = (lines.find(l => /SDN\.? ?BHD|BERHAD|ENTERPRISE|TRADING/i.test(l)) || '').trim();
    const m = text.match(/(?:\bto|as at)\s+(\d{2}\/\d{2}\/\d{4})/i);
    const end = m ? m[1] : '';
    const heads = kind === 'pl' ? PL_HEADS : BS_HEADS;
    const groups = codeGroupMap();
    const reBf = new RegExp('^RETAINED EARNINGS?\\s*(' + AMT + ')$', 'i');
    const reCy = new RegExp('^PROFIT\\s*/\\s*\\(LOSS\\)\\s*(' + AMT + ')$', 'i');
    let section = null;
    const rows = [];
    lines.forEach(raw => {
      const line = raw.replace(/\s+/g, ' ').trim();
      if (heads[line.toUpperCase()]) { section = heads[line.toUpperCase()]; return; }
      let mm = line.match(CODE_LINE);
      if (mm) {
        const code = mm[1], account = mm[2].trim();
        const sec = section || sectionFromCode(kind, code);
        rows.push({ code, account, section: sec, group: groups.get(code) || guessGroup(kind, sec, account), amount: toAmount(mm[3]) });
        return;
      }
      if (kind !== 'bs') return;
      if ((mm = line.match(reBf))) rows.push({ code: 'RE-BF', account: 'Retained earnings brought forward', section: 'Equity', group: 'Retained earnings', amount: toAmount(mm[1]) });
      else if ((mm = line.match(reCy))) rows.push({ code: 'RE-CY', account: 'Profit for the year', section: 'Equity', group: 'Profit for the year', amount: toAmount(mm[1]) });
    });
    return { kind, company, end, rows };
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const head = (rows.shift() || []).map(x => x.trim().toLowerCase());
    if (!head.includes('section') || !head.includes('amount')) throw new Error('the CSV needs at least the columns section and amount');
    return rows.filter(r => r.some(x => x.trim())).map(r => Object.fromEntries(head.map((k, i) => [k, (r[i] || '').trim()])));
  }

  async function importReportFiles(files) {
    const status = $('#report-status');
    const done = [], errors = [], statements = [];
    status.textContent = 'Reading ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '…';
    for (const f of files) {
      try {
        if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
          const st = parseStatement(await pdfLines(f));
          if (!st) throw new Error('it is not a profit and loss statement or a balance sheet');
          if (!st.rows.length) throw new Error('no account lines were found in it');
          statements.push(st);
        } else if (/\.json$/i.test(f.name)) {
          const s = JSON.parse(await f.text());
          if (!Array.isArray(s.pl) || !Array.isArray(s.bs)) throw new Error('it is not a data file exported from this app');
          done.push(addReport({ id: newId(), label: s.label || f.name.replace(/\.json$/i, ''), period: s.period || '', company: s.company || '', pl: s.pl, bs: s.bs }));
        } else if (/\.csv$/i.test(f.name)) {
          const rows = parseCsv(await f.text());
          const groups = codeGroupMap();
          const rep = { id: newId(), label: f.name.replace(/\.csv$/i, ''), period: '', company: '', pl: [], bs: [] };
          rows.forEach(r => {
            const kind = PL_SECTIONS.includes(r.section) ? 'pl' : BS_SECTIONS.includes(r.section) ? 'bs' : null;
            if (!kind) return;
            rep[kind].push({ code: r.code || '', account: r.account || '', section: r.section, group: r.group || groups.get(r.code) || guessGroup(kind, r.section, r.account || ''), amount: toAmount(r.amount) });
          });
          if (!rep.pl.length && !rep.bs.length) throw new Error('no rows had a known section such as Sales, Expenses or Current assets');
          done.push(addReport(rep));
        } else {
          throw new Error('only PDF, JSON and CSV files can be added');
        }
      } catch (e) {
        errors.push(f.name + ': ' + (e && e.message ? e.message : e));
      }
    }
    // A year's P&L and balance sheet share the same end date, so join them into one report.
    const byEnd = new Map();
    statements.forEach(st => {
      const key = st.end || 'unknown';
      if (!byEnd.has(key)) byEnd.set(key, { end: st.end, company: st.company, pl: [], bs: [] });
      byEnd.get(key)[st.kind] = st.rows;
    });
    byEnd.forEach(v => {
      const year = v.end.slice(-4);
      const missing = !v.pl.length ? ' (balance sheet only)' : !v.bs.length ? ' (profit and loss only)' : '';
      done.push(addReport({ id: newId(), label: year ? 'FY' + year : 'Imported report', period: v.end ? 'Year ended ' + v.end : '', company: v.company, pl: v.pl, bs: v.bs }) + missing);
    });
    save();
    renderOutputs();
    status.textContent = [done.length ? done.join('. ') + '.' : '', errors.length ? 'Could not read ' + errors.join('; ') + '.' : ''].filter(Boolean).join(' ');
    status.className = 'note ' + (errors.length ? 'weak' : 'good');
  }

  const MANUAL_FIELDS = [
    { heading: 'Report' },
    { key: 'label', label: 'Report name', type: 'text', placeholder: 'FY2024' },
    { key: 'period', label: 'Period', type: 'text', placeholder: 'Year ended 30/06/2024' },
    { heading: 'Profit and loss (RM)' },
    { key: 'net_sales', label: 'Net sales' },
    { key: 'opening_stock', label: 'Opening stock' },
    { key: 'cogs', label: 'Cost of sales, total' },
    { key: 'other_income', label: 'Other income' },
    { key: 'opex', label: 'Operating expenses, total' },
    { key: 'depreciation', label: 'of which depreciation' },
    { key: 'finance', label: 'of which interest' },
    { key: 'tax', label: 'Taxation' },
    { heading: 'Balance sheet (RM)' },
    { key: 'fa', label: 'Fixed assets' },
    { key: 'debtors', label: 'Trade debtors, net' },
    { key: 'stock', label: 'Closing stock' },
    { key: 'cash', label: 'Cash and bank' },
    { key: 'other_ca', label: 'Other current assets' },
    { key: 'creditors', label: 'Trade creditors' },
    { key: 'borrowings', label: 'Bank borrowings' },
    { key: 'dividend', label: 'Dividend payable' },
    { key: 'other_cl', label: 'Other current liabilities' },
    { key: 'paid_up', label: 'Paid-up capital' },
    { key: 'retained', label: 'Retained earnings brought forward' }
  ];

  function buildManualForm() {
    const form = $('#manual-form');
    form.replaceChildren(
      ...MANUAL_FIELDS.map(f => f.heading
        ? h('div', { class: 'heading' }, f.heading)
        : h('label', { for: 'mf-' + f.key }, f.label, h('input', { id: 'mf-' + f.key, name: f.key, type: f.type || 'number', step: f.type ? null : '0.01', placeholder: f.placeholder || '0.00' }))),
      h('p', { class: 'note', style: 'grid-column:1/-1' }, 'Profit for the year is worked out from the profit and loss figures. The balance check shows whether the balance sheet figures add up.'),
      h('div', { class: 'submit' }, h('button', { type: 'submit' }, 'Add report')));
  }

  $('#manual-form').addEventListener('submit', ev => {
    ev.preventDefault();
    const v = k => toAmount((ev.target.elements[k] || {}).value || 0);
    const label = (ev.target.elements.label.value || '').trim();
    const status = $('#report-status');
    if (!label) { status.textContent = 'Give the report a name, such as FY2024.'; status.className = 'note weak'; ev.target.elements.label.focus(); return; }
    const npat = v('net_sales') - v('cogs') + v('other_income') - v('opex') - v('tax');
    const line = (account, section, group, amount) => ({ code: '', account, section, group, amount });
    const rep = {
      id: newId(), label, period: (ev.target.elements.period.value || '').trim(), company: state.company,
      pl: [
        line('Net sales', 'Sales', 'Sales', v('net_sales')),
        line('Opening stock', 'Cost of sales', 'Opening stock', v('opening_stock')),
        line('Closing stock', 'Cost of sales', 'Closing stock', -v('stock')),
        line('Other cost of sales', 'Cost of sales', 'Other cost of sales', v('cogs') - v('opening_stock') + v('stock')),
        line('Other income', 'Other income', 'Other income', v('other_income')),
        line('Depreciation', 'Expenses', 'Depreciation', v('depreciation')),
        line('Interest', 'Expenses', 'Finance costs', v('finance')),
        line('Other operating expenses', 'Expenses', 'Admin & other', v('opex') - v('depreciation') - v('finance')),
        line('Taxation', 'Taxation', 'Taxation', v('tax'))
      ],
      bs: [
        line('Fixed assets', 'Fixed assets', 'Fixed assets', v('fa')),
        line('Trade debtors', 'Current assets', 'Trade debtors', v('debtors')),
        line('Stock', 'Current assets', 'Stock', v('stock')),
        line('Cash and bank', 'Current assets', 'Cash', v('cash')),
        line('Other current assets', 'Current assets', 'Other receivables', v('other_ca')),
        line('Trade creditors', 'Current liabilities', 'Trade creditors', v('creditors')),
        line('Bank borrowings', 'Current liabilities', 'Bank borrowings', v('borrowings')),
        line('Dividend payable', 'Current liabilities', 'Dividend payable', v('dividend')),
        line('Other current liabilities', 'Current liabilities', 'Other operating payables', v('other_cl')),
        line('Paid-up capital', 'Equity', 'Paid-up capital', v('paid_up')),
        line('Retained earnings brought forward', 'Equity', 'Retained earnings', v('retained')),
        line('Profit for the year', 'Equity', 'Profit for the year', npat)
      ]
    };
    const msg = addReport(rep);
    save();
    ev.target.reset();
    renderOutputs();
    status.textContent = msg + '.';
    status.className = 'note good';
  });

  function renderReports() {
    const reps = allReports();
    const list = $('#report-list');
    list.replaceChildren(table(
      [
        { label: 'Report', render: r => [r.label || '(no name)', r.id === 'main' ? h('span', { class: 'badge' }, 'main') : null] },
        { label: 'Period', render: r => r.period || '' },
        { label: 'Net sales', num: true, render: r => fmt.rm(reportCalc(r).net_sales) },
        { label: 'Profit after tax', num: true, render: r => fmt.rm(reportCalc(r).npat) },
        {
          label: 'Check', render: r => {
            const k = reportCalc(r);
            if (!r.pl.length || !r.bs.length) return h('span', { class: 'pill watch' }, !r.pl.length ? 'No P&L' : 'No balance sheet');
            return Math.abs(k.balance_diff) < 1 ? h('span', { class: 'pill good' }, 'Balances') : h('span', { class: 'pill weak' }, 'Out by ' + fmt.rm(k.balance_diff));
          }
        },
        {
          label: '', render: r => r.id === 'main' ? '' : h('div', { class: 'row-actions' },
            h('button', { type: 'button', class: 'ghost', title: 'Show this report on every tab and edit it in the Data tab', onclick: () => makeMain(r.id) }, 'Make main'),
            h('button', { type: 'button', class: 'icon', 'aria-label': 'Remove ' + r.label, onclick: () => removeReport(r.id) }, '✕'))
        }
      ], reps));

    const opts = sel => reps.map(r => h('option', { value: r.id, selected: r.id === sel }, r.label + (r.id === 'main' ? ' (main)' : '')));
    if (!findReport(state.compare.a)) state.compare.a = 'main';
    if (!findReport(state.compare.b) || state.compare.b === state.compare.a) {
      const other = reps.find(r => r.id !== state.compare.a);
      state.compare.b = other ? other.id : null;
    }
    $('#cmp-a').replaceChildren(...opts(state.compare.a));
    $('#cmp-b').replaceChildren(...opts(state.compare.b));
  }

  function makeMain(id) {
    const i = state.reports.findIndex(r => r.id === id);
    if (i < 0) return;
    const next = state.reports[i];
    const prev = { id: newId(), label: state.label, period: state.period, company: state.company, pl: state.pl, bs: state.bs };
    state.reports[i] = prev;
    state.label = next.label;
    state.period = next.period;
    if (next.company) state.company = next.company;
    state.pl = next.pl;
    state.bs = next.bs;
    state.compare = { a: 'main', b: prev.id };
    save();
    renderAll();
    $('#report-status').textContent = next.label + ' is now the main report. ' + prev.label + ' was moved to the list.';
    $('#report-status').className = 'note good';
  }

  function removeReport(id) {
    const r = state.reports.find(x => x.id === id);
    state.reports = state.reports.filter(x => x.id !== id);
    save();
    renderOutputs();
    $('#report-status').textContent = 'Removed ' + (r ? r.label : 'report') + '.';
    $('#report-status').className = 'note';
  }

  $('#file-reports').addEventListener('change', ev => {
    const files = [...ev.target.files];
    ev.target.value = '';
    if (files.length) importReportFiles(files);
  });
  $('#cmp-a').addEventListener('change', ev => { state.compare.a = ev.target.value; save(); renderOutputs(); });
  $('#cmp-b').addEventListener('change', ev => { state.compare.b = ev.target.value; save(); renderOutputs(); });

  // ---------- comparison ----------
  const CMP_FIGURES = [
    ['Net sales', 'net_sales', 'rm', 1],
    ['Gross profit', 'gross_profit', 'rm', 1],
    ['Operating expenses', 'opex', 'rm', -1],
    ['Profit before tax', 'npbt', 'rm', 1],
    ['Profit after tax', 'npat', 'rm', 1],
    ['EBITDA', 'ebitda', 'rm', 1],
    ['Cash', 'cash', 'rm', 1],
    ['Trade debtors', 'debtors', 'rm', 0],
    ['Stock', 'stock_close', 'rm', 0],
    ['Trade creditors', 'creditors', 'rm', 0],
    ['Bank borrowings', 'borrowings', 'rm', -1],
    ['Net current assets', 'nca', 'rm', 1],
    ['Total equity', 'equity', 'rm', 1]
  ];
  const CMP_RATIOS = [
    ['Gross margin', 'gp_margin', 'pct', 1],
    ['Net margin after tax', 'np_margin', 'pct', 1],
    ['Debtor days', 'dso', 'days', -1],
    ['Stock days', 'dio', 'days', -1],
    ['Supplier days', 'dpo', 'days', 1],
    ['Cash conversion cycle', 'ccc', 'days', -1],
    ['Current ratio', 'current_ratio', 'x', 1],
    ['Quick ratio', 'quick_ratio', 'x', 1],
    ['Equity ÷ total assets', 'equity_ratio', 'pct', 1],
    ['Bank borrowings ÷ equity', 'debt_to_equity', 'x', -1],
    ['Interest cover', 'interest_cover', 'x', 1],
    ['Return on equity', 'roe', 'pct', 1]
  ];
  const showFmt = { rm: fmt.rm, pct: fmt.pct, days: fmt.days, x: fmt.x };
  function change(kind, a, b) {
    let d = a - b;
    if (Math.abs(d) < (kind === 'rm' ? 0.5 : 1e-6)) d = 0;
    const s = d > 0 ? '+' : d < 0 ? '−' : '', m = Math.abs(d);
    if (kind === 'rm') return s + 'RM ' + nf0.format(m);
    if (kind === 'pct') return s + (m * 100).toFixed(1) + ' pts';
    if (kind === 'days') return s + m.toFixed(1) + ' days';
    return s + m.toFixed(2) + '×';
  }
  const pctChange = (a, b) => (b ? (Math.abs(a - b) < 0.5 ? 0 : (a - b) / Math.abs(b)) : null);
  function verdict(dir, kind, a, b) {
    if (!dir) return '';
    const d = a - b;
    const tiny = kind === 'rm' ? Math.abs(d) < 1 : kind === 'pct' ? Math.abs(d) < 0.0005 : Math.abs(d) < 0.05;
    if (tiny) return 'Same';
    return d * dir > 0 ? 'Better' : 'Worse';
  }
  const verdictPill = v => (v ? h('span', { class: 'pill ' + ({ Better: 'good', Worse: 'weak', Same: 'watch' }[v]) }, v) : '');

  function compareTable(defs, ka, kb, la, lb) {
    return table([
      { label: 'Measure', key: 'name' },
      { label: lb, num: true, render: r => showFmt[r.kind](r.b) },
      { label: la, num: true, render: r => showFmt[r.kind](r.a) },
      { label: 'Change', num: true, render: r => change(r.kind, r.a, r.b) },
      { label: '% change', num: true, render: r => (r.kind === 'rm' && r.pc != null ? (r.pc > 0 ? '+' : r.pc < 0 ? '−' : '') + (Math.abs(r.pc) * 100).toFixed(1) + '%' : '') },
      { label: '', render: r => verdictPill(r.v) }
    ], defs.map(([name, key, kind, dir]) => ({ name, kind, a: ka[key], b: kb[key], pc: pctChange(ka[key], kb[key]), v: verdict(dir, kind, ka[key], kb[key]) })));
  }

  function pairBars(items, la, lb) {
    const max = Math.max(1, ...items.flatMap(i => [i.a, i.b]));
    const x = v => (Math.max(0, v) / max) * 100;
    const one = (v, color) => h('div', { class: 'bar-track' }, h('div', { class: 'bar', style: `left:0;width:${Math.max(0.6, x(v))}%;background:${color}` }));
    return h('div', { class: 'bars' },
      h('div', { class: 'legend' },
        h('div', null, h('span', { class: 'swatch', style: 'background:var(--bar-muted)' }), lb),
        h('div', null, h('span', { class: 'swatch', style: 'background:var(--accent)' }), la)),
      items.map(i => withTip(h('div', { class: 'bar-row' },
        h('div', { class: 'bar-label' }, i.name),
        h('div', { class: 'pair' }, one(i.b, 'var(--bar-muted)'), one(i.a, 'var(--accent)')),
        h('div', { class: 'bar-value' }, fmt.rmc(i.a))), [i.name, lb + ': ' + fmt.rm(i.b), la + ': ' + fmt.rm(i.a), 'Change: ' + change('rm', i.a, i.b)])));
  }

  function lineDiff(la, lb) {
    const key = r => r.code ? 'c:' + r.code : 'a:' + String(r.account).toLowerCase();
    const m = new Map();
    const add = (rows, side) => rows.forEach(r => {
      const k = key(r);
      const e = m.get(k) || { code: r.code || '', account: r.account || '', section: r.section, a: 0, b: 0 };
      e[side] += num(r.amount);
      m.set(k, e);
    });
    add(la, 'a');
    add(lb, 'b');
    return [...m.values()].map(e => Object.assign(e, { d: e.a - e.b })).sort((p, q) => Math.abs(q.d) - Math.abs(p.d));
  }

  const showAll = { pl: false, bs: false };
  function lineCard(title, rows, which, la, lb) {
    const shown = showAll[which] ? rows : rows.slice(0, 15);
    return card(title, 'Matched by account code and sorted by the size of the change. Works best when both reports come from the same accounting system.',
      table([
        { label: 'Code', key: 'code' },
        { label: 'Account', key: 'account' },
        { label: lb, num: true, render: r => fmt.rm2(r.b) },
        { label: la, num: true, render: r => fmt.rm2(r.a) },
        { label: 'Change', num: true, render: r => (Math.abs(r.d) < 0.005 ? '0.00' : (r.d > 0 ? '+' : '−') + nf2.format(Math.abs(r.d))) },
        { label: '%', num: true, render: r => (Math.abs(r.d) < 0.005 ? '' : r.b ? (r.d > 0 ? '+' : '−') + (Math.abs(r.d / r.b) * 100).toFixed(0) + '%' : 'new') }
      ], shown),
      rows.length > 15 ? h('div', { class: 'show-all' }, h('button', { type: 'button', class: 'ghost', onclick: () => { showAll[which] = !showAll[which]; renderCompare(); } }, showAll[which] ? 'Show the 15 largest changes' : `Show all ${rows.length} lines`)) : null);
  }

  function renderCompare() {
    const out = $('#out-compare');
    const A = findReport(state.compare.a), B = findReport(state.compare.b);
    if (!A || !B) {
      out.replaceChildren(card('Nothing to compare yet', 'Add another year\'s report above, for example last year\'s profit and loss and balance sheet PDFs. It will then be compared with ' + (state.label || 'the main report') + '.'));
      return;
    }
    if (A.id === B.id) {
      out.replaceChildren(card('Pick two different reports', 'The report and the one it is compared against are the same.'));
      return;
    }
    const ka = reportCalc(A), kb = reportCalc(B);
    const la = A.label || 'Report', lb = B.label || 'Compared';
    const salesPc = pctChange(ka.net_sales, kb.net_sales), npatPc = pctChange(ka.npat, kb.npat);
    const cmpTile = (label, key, kind, dir) => {
      const v = verdict(dir, kind, ka[key], kb[key]);
      return tile(label, kind === 'rm' ? fmt.rmc(ka[key]) : showFmt[kind](ka[key]), change(kind, ka[key], kb[key]) + ' vs ' + lb, v === 'Better' ? 'good' : v === 'Worse' ? 'weak' : null);
    };
    const pctWord = p => (p == null ? '' : ' ' + (Math.abs(p) * 100).toFixed(1) + '%');
    const dirWord = (a, b, up, down) => (Math.abs(a - b) < 0.05 ? 'unchanged' : a > b ? up : down);
    const pairItems = [['Net sales', 'net_sales'], ['Gross profit', 'gross_profit'], ['Operating expenses', 'opex'], ['Profit after tax', 'npat'], ['EBITDA', 'ebitda'], ['Cash', 'cash'], ['Trade debtors', 'debtors'], ['Stock', 'stock_close'], ['Trade creditors', 'creditors'], ['Bank borrowings', 'borrowings'], ['Total equity', 'equity']]
      .map(([name, key]) => ({ name, a: ka[key], b: kb[key] }));

    out.replaceChildren(
      h('p', { class: 'lead' },
        h('b', null, la), ' compared with ', h('b', null, lb), ': sales ',
        dirWord(ka.net_sales, kb.net_sales, 'up' + pctWord(salesPc), 'down' + pctWord(salesPc)),
        ', profit after tax ', dirWord(ka.npat, kb.npat, 'up' + pctWord(npatPc), 'down' + pctWord(npatPc)),
        ', and the cash cycle is ', dirWord(ka.ccc, kb.ccc, Math.abs(ka.ccc - kb.ccc).toFixed(1) + ' days longer', Math.abs(ka.ccc - kb.ccc).toFixed(1) + ' days shorter'), '.'),
      tiles(
        cmpTile('Net sales', 'net_sales', 'rm', 1),
        cmpTile('Profit after tax', 'npat', 'rm', 1),
        cmpTile('Cash conversion cycle', 'ccc', 'days', -1),
        cmpTile('Total equity', 'equity', 'rm', 1)),
      grid(
        card('Key figures', null, compareTable(CMP_FIGURES, ka, kb, la, lb)),
        card('Ratios', null, compareTable(CMP_RATIOS, ka, kb, la, lb))),
      card('Side by side', 'Each pair of bars is on one scale.', pairBars(pairItems, la, lb)),
      grid(
        lineCard('Profit and loss lines', lineDiff(A.pl, B.pl), 'pl', la, lb),
        lineCard('Balance sheet lines', lineDiff(A.bs, B.bs), 'bs', la, lb)));
  }

  // ---------- tabs ----------
  function showTab(id) {
    if (!TABS.some(t => t.id === id)) id = 'summary';
    document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.dataset.tab === id));
    hideTip();
  }
  $('#tabs').replaceChildren(...TABS.map(t => h('button', {
    class: 'tab', type: 'button', role: 'tab', 'data-tab': t.id,
    onclick: () => { history.replaceState(null, '', '#' + t.id); showTab(t.id); }
  }, t.label)));
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

  // ---------- toolbar ----------
  // Online (as a claude.ai artifact) the page cannot print or start downloads,
  // so Print is hidden and Export copies the data instead.
  const HOSTED = !!window.APP_HOSTED;
  if (HOSTED) {
    $('#btn-print').hidden = true;
    $('#btn-export').textContent = 'Copy data';
  }
  $('#btn-print').addEventListener('click', () => window.print());
  $('#btn-compare').addEventListener('click', () => { history.replaceState(null, '', '#compare'); showTab('compare'); });
  $('#btn-export').addEventListener('click', () => {
    if (HOSTED) {
      const text = JSON.stringify(state, null, 2);
      const fallback = () => {
        const n = $('#notice');
        n.hidden = false;
        const area = h('textarea', { rows: 6, readonly: true, style: 'width:100%;font:12px monospace;margin-top:8px' });
        area.value = text;
        n.replaceChildren('Copy this text and save it as a .json file. Use Import data to load it again.', area);
        area.focus();
        area.select();
      };
      try {
        navigator.clipboard.writeText(text).then(() => flash('Data copied. Paste it into a text file, save it as .json, and use Import data to load it again.'), fallback);
      } catch (e) { fallback(); }
      return;
    }
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'siong-fatt-review-data.json' });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
  $('#file-import').addEventListener('change', ev => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const s = JSON.parse(reader.result);
        if (!valid(s)) throw new Error('missing pl, bs or assumptions');
        const keep = state.reports;
        state = withDefaults(s);
        if (!state.reports.length) state.reports = keep;
        save();
        renderAll();
        flash('Imported ' + file.name + '.');
      } catch (e) {
        flash('Could not import ' + file.name + ': it is not a data file exported from this app.');
      }
      ev.target.value = '';
    };
    reader.readAsText(file);
  });
  const resetBtn = $('#btn-reset');
  let resetTimer = null;
  resetBtn.addEventListener('click', () => {
    if (!resetTimer) {
      resetBtn.textContent = 'Click again to reset';
      resetBtn.classList.add('danger');
      resetTimer = setTimeout(() => { resetTimer = null; resetBtn.textContent = 'Reset to report'; resetBtn.classList.remove('danger'); }, 4000);
      return;
    }
    clearTimeout(resetTimer);
    resetTimer = null;
    resetBtn.textContent = 'Reset to report';
    resetBtn.classList.remove('danger');
    const keep = state.reports;
    state = withDefaults(clone(window.DEFAULT_DATA));
    state.reports = keep;
    save();
    renderAll();
    flash('Reset to the figures from the report. Your saved yearly reports were kept.');
  });
  function flash(msg) {
    const n = $('#notice');
    n.hidden = false;
    n.textContent = msg;
    setTimeout(() => renderOutputs(), 4000);
  }

  $('#add-pl').addEventListener('click', () => addRow('pl', 'Expenses'));
  $('#add-bs').addEventListener('click', () => addRow('bs', 'Current liabilities'));

  renderAll();
  showTab(location.hash.slice(1));
})();
