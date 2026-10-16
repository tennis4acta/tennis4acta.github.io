/* Tournament manager: round robin groups + knockout bracket.
   Config comes from _data/events/<id>.yml (embedded by _includes/event.html).
   Scores live in <repo>/<path>/<id>.json and are written through the GitHub Contents API. */
(function () {
  'use strict';
  if (window.__actcTournament) return;
  window.__actcTournament = true;

  const API = 'https://api.github.com';
  const TOKEN_KEY = 'actc-gh-token';
  const USER_KEY = 'actc-gh-user';
  const REFRESH_MS = 60000;
  const DEFAULT_TIEBREAKERS = ['points', 'h2h', 'set_diff', 'game_diff'];
  const instances = [];
  let rawOnly = false; // set after hitting the anonymous API rate limit

  // ---------- DOM ----------
  function h(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) n.append(c);
    return n;
  }

  // ---------- Score parsing ----------
  const SET_RE = /^(\[)?(\d{1,2})[-:](\d{1,2})(?:\(\d{1,2}\))?\]?$/;

  function parseScore(str) {
    const parts = String(str || '').trim().split(/[\s,，;；]+/).filter(Boolean);
    if (!parts.length) return null;
    const sets = [];
    for (const p of parts) {
      const m = SET_RE.exec(p);
      if (!m || +m[2] === +m[3]) return null;
      sets.push({ a: +m[2], b: +m[3], mtb: !!m[1] });
    }
    return sets;
  }

  function tally(sets) {
    const t = { sa: 0, sb: 0, ga: 0, gb: 0 };
    for (const s of sets || []) {
      if (s.a > s.b) t.sa++; else t.sb++;
      // A match tiebreak [10-8] counts as a single game.
      if (s.mtb) { if (s.a > s.b) t.ga++; else t.gb++; } else { t.ga += s.a; t.gb += s.b; }
    }
    return t;
  }

  const flipScore = (s) => String(s || '').replace(/(\d+)([-:])(\d+)/g, '$3$2$1');
  const pairKey = (prefix, a, b) => [prefix].concat([a, b].sort()).join('|');

  // Result oriented to player a; null if not played or the record belongs to other players.
  function result(matches, key, a, b) {
    const r = matches[key];
    if (!r || !r.w || !Array.isArray(r.p)) return null;
    const flip = r.p[0] === b && r.p[1] === a;
    if (!flip && !(r.p[0] === a && r.p[1] === b)) return null;
    if (r.w !== a && r.w !== b) return null;
    const score = flip ? flipScore(r.s) : (r.s || '');
    return { winner: r.w, loser: r.w === a ? b : a, score, note: r.n || '', sets: parseScore(score) };
  }

  // ---------- Round robin ----------
  function computeGroup(name, players, matches, rules) {
    const pts = Object.assign({ win: 1, loss: 0, wo_loss: 0 }, rules.points);
    const st = {};
    players.forEach((p, i) => { st[p] = { idx: i, played: 0, wins: 0, losses: 0, points: 0, sw: 0, sl: 0, gw: 0, gl: 0 }; });
    const games = [];
    let done = 0;
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i], b = players[j];
        const key = pairKey('RR|' + name, a, b);
        const r = result(matches, key, a, b);
        games.push({ key, a, b, r });
        if (!r) continue;
        done++;
        const w = st[r.winner], l = st[r.loser];
        w.wins++; w.points += pts.win;
        l.losses++; l.points += r.note === 'W/O' ? pts.wo_loss : pts.loss;
        st[a].played++; st[b].played++;
        if (r.note !== 'W/O' && r.sets) {
          const t = tally(r.sets);
          st[a].sw += t.sa; st[a].sl += t.sb; st[a].gw += t.ga; st[a].gl += t.gb;
          st[b].sw += t.sb; st[b].sl += t.sa; st[b].gw += t.gb; st[b].gl += t.ga;
        }
      }
    }
    const ranked = rankPlayers(players, games, st, rules.tiebreakers || DEFAULT_TIEBREAKERS);
    return { name, players, st, games, done, total: games.length, complete: done === games.length, ranked, rounds: roundRobin(players) };
  }

  // Circle (Berger) method: everyone plays once per round, odd groups give each player exactly one bye,
  // and seeds 1 and 2 meet in the last round.
  function roundRobin(players) {
    const list = players.slice();
    if (list.length % 2) list.push(null);
    const n = list.length;
    const rounds = [];
    let arr = list.map((_, i) => i);
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      let bye = null;
      for (let i = 0; i < n / 2; i++) {
        const x = arr[i], y = arr[n - 1 - i];
        if (list[x] === null) bye = list[y];
        else if (list[y] === null) bye = list[x];
        else pairs.push(x < y ? [list[x], list[y]] : [list[y], list[x]]);
      }
      rounds.push({ pairs, bye });
      arr = [arr[0], arr[n - 1]].concat(arr.slice(1, n - 1));
    }
    return rounds;
  }

  function metric(c, p, st, subset, games) {
    const s = st[p];
    switch (c) {
      case 'points': return s.points;
      case 'wins': return s.wins;
      case 'set_diff': return s.sw - s.sl;
      case 'game_diff': return s.gw - s.gl;
      case 'sets_won': return s.sw;
      case 'games_won': return s.gw;
      case 'games_lost': return -s.gl; // fewer is better
      case 'set_ratio': return s.sw + s.sl ? s.sw / (s.sw + s.sl) : 0;
      case 'game_ratio': return s.gw + s.gl ? s.gw / (s.gw + s.gl) : 0;
      case 'h2h': return games.filter((g) => g.r && g.r.winner === p && subset.includes(g.a) && subset.includes(g.b)).length;
      default: return 0;
    }
  }

  // ITF style: once a criterion splits a tie, each smaller tied group restarts from the first criterion.
  function rankPlayers(players, games, st, criteria) {
    function go(subset, crit) {
      if (subset.length < 2) return subset;
      if (!crit.length) return subset.slice().sort((x, y) => st[x].idx - st[y].idx);
      const vals = new Map(subset.map((p) => [p, Math.round(metric(crit[0], p, st, subset, games) * 1e6)]));
      const levels = Array.from(new Set(vals.values())).sort((x, y) => y - x);
      if (levels.length === 1) return go(subset, crit.slice(1));
      return levels.flatMap((v) => go(subset.filter((p) => vals.get(p) === v), criteria));
    }
    return go(players, criteria);
  }

  // ---------- Knockout ----------
  function nextPow2(n) { let s = 1; while (s < n) s *= 2; return s; }

  function seedOrder(size) {
    let order = [1];
    while (order.length < size) {
      const n = order.length * 2;
      order = order.flatMap((s) => [s, n + 1 - s]);
    }
    return order;
  }

  function autoDraw(groupNames, advance) {
    const seeds = [];
    for (let pos = 1; pos <= advance; pos++) groupNames.forEach((g) => seeds.push({ g, pos }));
    const size = nextPow2(seeds.length);
    const slots = seedOrder(size).map((s) => seeds[s - 1] || null);
    const R = Math.log2(size);
    const meetRound = (i, j) => Math.floor(Math.log2(i ^ j)) + 1;
    const cost = () => {
      let c = 0;
      for (let i = 0; i < size; i++) {
        for (let j = i + 1; j < size; j++) {
          if (slots[i] && slots[j] && slots[i].g === slots[j].g) c += Math.pow(2, R - meetRound(i, j));
        }
      }
      return c;
    };
    // Swap equally-placed non-winners so group mates meet as late as possible.
    let best = cost(), improved = true;
    while (improved && best > 0) {
      improved = false;
      for (let i = 0; i < size; i++) {
        for (let j = i + 1; j < size; j++) {
          const a = slots[i], b = slots[j];
          if (!a || !b || a.pos === 1 || a.pos !== b.pos || a.g === b.g) continue;
          slots[i] = b; slots[j] = a;
          const c = cost();
          if (c < best) { best = c; improved = true; } else { slots[i] = a; slots[j] = b; }
        }
      }
    }
    const tok = (s) => (s ? s.g + s.pos : 'BYE');
    const pairs = [];
    for (let i = 0; i < size; i += 2) pairs.push([tok(slots[i]), tok(slots[i + 1])]);
    return pairs;
  }

  function parseToken(tok, groupNames) {
    tok = String(tok).trim();
    if (/^bye$/i.test(tok)) return { bye: true };
    for (const g of groupNames) {
      if (tok.startsWith(g) && /^\d+$/.test(tok.slice(g.length))) return { g, pos: +tok.slice(g.length) };
    }
    return { name: tok };
  }

  function resolveToken(t, groups) {
    if (t.bye) return { bye: true, label: '轮空' };
    if (t.name) return { name: t.name, label: t.name };
    const label = t.g + '组第' + t.pos + '名';
    const G = groups[t.g];
    if (!G || !G.complete) return { name: null, label };
    const name = G.ranked[t.pos - 1];
    return name ? { name, label } : { bye: true, label: '轮空' };
  }

  function roundName(matchCount) {
    if (matchCount === 1) return '决赛';
    if (matchCount === 2) return '半决赛';
    if (matchCount === 4) return '四分之一决赛';
    return matchCount * 2 + '强';
  }

  function decide(m, matches) {
    const a = m.a, b = m.b;
    m.playable = !!(a.name && b.name);
    if (a.bye && b.bye) { m.win = { bye: true, label: '轮空' }; m.lose = m.win; return; }
    if (a.bye) { m.win = b; m.lose = { bye: true, label: '轮空' }; return; }
    if (b.bye) { m.win = a; m.lose = { bye: true, label: '轮空' }; return; }
    m.r = m.playable ? result(matches, m.key, a.name, b.name) : null;
    if (m.r) { m.win = { name: m.r.winner }; m.lose = { name: m.r.loser }; return; }
    m.win = { name: null, label: '第' + m.no + '场胜者' };
    m.lose = { name: null, label: '第' + m.no + '场负者' };
  }

  function computeKO(cfg, groups, matches) {
    const groupNames = Object.keys(cfg.groups);
    const draw = (Array.isArray(cfg.rules.draw) && cfg.rules.draw.length)
      ? cfg.rules.draw.map((p) => [p[0], p[1]])
      : autoDraw(groupNames, cfg.rules.advance);
    while (draw.length & (draw.length - 1)) draw.push(['BYE', 'BYE']);

    const rounds = [];
    let no = 0;
    let cur = draw.map((p, i) => ({
      key: 'KO|1|' + (i + 1), no: ++no,
      a: resolveToken(parseToken(p[0], groupNames), groups),
      b: resolveToken(parseToken(p[1], groupNames), groups),
    }));
    for (let r = 1; ; r++) {
      cur.forEach((m) => decide(m, matches));
      rounds.push({ name: roundName(cur.length), matches: cur });
      if (cur.length === 1) break;
      const next = [];
      for (let i = 0; i < cur.length; i += 2) {
        next.push({ key: 'KO|' + (r + 1) + '|' + (i / 2 + 1), no: ++no, a: cur[i].win, b: cur[i + 1].win });
      }
      cur = next;
    }
    let third = null;
    if (cfg.rules.third_place && rounds.length >= 2) {
      const semis = rounds[rounds.length - 2].matches;
      third = { key: 'KO|3rd', no: ++no, a: semis[0].lose, b: semis[1].lose };
      decide(third, matches);
    }
    const final = rounds[rounds.length - 1].matches[0];
    return { rounds, third, champion: final.win.name || null, runnerUp: final.r ? final.lose.name : null };
  }

  function compute(inst) {
    const cfg = inst.cfg;
    const matches = inst.scores.matches;
    const groups = {};
    let done = 0, total = 0;
    for (const g of Object.keys(cfg.groups)) {
      groups[g] = computeGroup(g, cfg.groups[g], matches, cfg.rules);
      done += groups[g].done; total += groups[g].total;
    }
    const ko = cfg.rules.advance > 0 ? computeKO(cfg, groups, matches) : null;
    return { groups, done, total, rrComplete: done === total, ko };
  }

  // ---------- GitHub storage ----------
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function b64decode(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } };
  const getUser = () => { try { return localStorage.getItem(USER_KEY) || ''; } catch (e) { return ''; } };

  async function gh(path, opts, token) {
    opts = opts || {};
    const headers = Object.assign({ Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, opts.headers);
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(API + path, Object.assign({}, opts, { headers, cache: 'no-store' }));
    if (!res.ok) {
      const err = new Error('GitHub API ' + res.status);
      err.status = res.status;
      throw err;
    }
    return res;
  }

  const emptyScores = () => ({ matches: {} });
  function normalizeScores(d) {
    d = d && typeof d === 'object' ? d : {};
    if (!d.matches || typeof d.matches !== 'object') d.matches = {};
    return d;
  }

  function filePath(inst) {
    return inst.path.split('/').filter(Boolean).concat(inst.id + '.json').map(encodeURIComponent).join('/');
  }
  const contentsUrl = (inst) => '/repos/' + inst.repo + '/contents/' + filePath(inst);

  async function readWithSha(inst, token) {
    try {
      const res = await gh(contentsUrl(inst) + '?ref=' + encodeURIComponent(inst.branch), null, token);
      const j = await res.json();
      return { data: normalizeScores(JSON.parse(b64decode(j.content))), sha: j.sha };
    } catch (e) {
      if (e.status === 404) return { data: emptyScores(), sha: null };
      throw e;
    }
  }

  async function loadScores(inst) {
    const token = getToken();
    if (token) return (await readWithSha(inst, token)).data;
    if (!rawOnly) {
      try {
        const res = await gh(contentsUrl(inst) + '?ref=' + encodeURIComponent(inst.branch), { headers: { Accept: 'application/vnd.github.raw+json' } });
        return normalizeScores(await res.json());
      } catch (e) {
        if (e.status === 404) return emptyScores();
        if (e.status === 403 || e.status === 429) rawOnly = true;
      }
    }
    // CDN copy; may lag a few minutes behind the latest commit.
    const res = await fetch('https://raw.githubusercontent.com/' + inst.repo + '/' + encodeURIComponent(inst.branch) + '/' + filePath(inst) + '?t=' + Date.now(), { cache: 'no-store' });
    if (res.status === 404) return emptyScores();
    if (!res.ok) throw new Error('raw ' + res.status);
    return normalizeScores(await res.json());
  }

  function sortedMatches(m) {
    const out = {};
    Object.keys(m).sort().forEach((k) => { out[k] = m[k]; });
    return out;
  }

  async function writeMatch(inst, key, rec, message) {
    const token = getToken();
    for (let attempt = 0; ; attempt++) {
      const cur = await readWithSha(inst, token);
      if (rec) cur.data.matches[key] = rec; else delete cur.data.matches[key];
      cur.data.matches = sortedMatches(cur.data.matches);
      cur.data.updated = new Date().toISOString();
      const body = { message, content: b64encode(JSON.stringify(cur.data, null, 2) + '\n'), branch: inst.branch };
      if (cur.sha) body.sha = cur.sha;
      try {
        await gh(contentsUrl(inst), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, token);
        return cur.data;
      } catch (e) {
        // 409/422: someone else saved in between; re-read and re-apply this single match.
        if ((e.status === 409 || e.status === 422) && attempt < 2) continue;
        throw e;
      }
    }
  }

  function apiErrorText(e) {
    if (e.status === 401) return '令牌无效或已过期，请重新登录。';
    if (e.status === 403 || e.status === 404) return '该令牌没有本仓库的写入权限（需要 Contents: Read and write）。';
    if (e.status === 409 || e.status === 422) return '多人同时保存发生冲突，请重试。';
    return '保存失败：' + (e.message || e);
  }

  // ---------- Rendering ----------
  function fmtTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('zh-CN', { timeZone: 'Australia/Sydney', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (e) { return iso; }
  }

  function cellText(r) {
    if (r.note === 'W/O') return 'W/O';
    return r.score + (r.note === 'RET' ? ' ret' : '');
  }

  function renderBar(inst, view) {
    const admin = !!getToken();
    let status;
    if (view.ko && view.ko.champion) status = '比赛结束';
    else if (view.rrComplete && view.ko) status = '淘汰赛进行中';
    else if (view.done === 0) status = '尚未开赛';
    else status = '小组赛进行中 ' + view.done + '/' + view.total;

    return h('div', { class: 'tm-bar' },
      h('span', { class: 'tm-chip' + (view.ko && view.ko.champion ? ' is-done' : ''), text: status }),
      inst.scores.updated ? h('span', { class: 'tm-muted', text: '更新于 ' + fmtTime(inst.scores.updated) }) : null,
      inst.error ? h('span', { class: 'tm-error', text: inst.error }) : null,
      h('span', { class: 'tm-bar__sp' }),
      h('button', { class: 'btn btn--outline btn--sm', type: 'button', onclick: () => refresh(inst, true), disabled: inst.busy }, inst.busy ? '同步中…' : '刷新'),
      admin
        ? h('button', { class: 'btn btn--outline btn--sm', type: 'button', onclick: logout, title: getUser() || '' }, '退出计分' + (getUser() ? '（' + getUser() + '）' : ''))
        : h('button', { class: 'btn btn--dark btn--sm', type: 'button', onclick: () => openLogin(inst) }, '裁判登录'));
  }

  function renderGroup(inst, G, advance, admin) {
    const rankOf = new Map(G.ranked.map((p, i) => [p, i + 1]));
    const lookup = new Map();
    G.games.forEach((g) => { lookup.set(g.a + '\u0000' + g.b, g); lookup.set(g.b + '\u0000' + g.a, g); });

    const head = h('tr', null,
      h('th', { text: '#' }), h('th', { class: 'tm-name', text: '选手' }),
      G.players.map((p, i) => h('th', { class: 'tm-x', title: p, text: String(i + 1) })),
      h('th', { text: '胜-负' }), h('th', { text: '积分' }), h('th', { text: '盘' }), h('th', { text: '局' }), h('th', { text: '名次' }));

    const rows = G.players.map((p, i) => {
      const s = G.st[p];
      const rank = rankOf.get(p);
      const cells = G.players.map((q, j) => {
        if (i === j) return h('td', { class: 'tm-x tm-diag' });
        const g = lookup.get(p + '\u0000' + q);
        const r = g.r ? orient(g, p) : null;
        const cls = 'tm-x' + (r ? (r.winner === p ? ' is-win' : ' is-loss') : '');
        const label = r ? cellText(r) : '';
        if (!admin) return h('td', { class: cls, text: label });
        return h('td', { class: cls }, h('button', {
          type: 'button', class: 'tm-cell-btn', 'aria-label': p + ' vs ' + q,
          onclick: () => openEditor(inst, { key: g.key, a: p, b: q, title: G.name + '组' }),
        }, label || '+'));
      });
      return h('tr', { class: G.complete && rank <= advance ? 'is-q' : null },
        h('td', { class: 'tm-muted', text: String(i + 1) }),
        h('td', { class: 'tm-name', text: p }),
        cells,
        h('td', { text: s.wins + '-' + s.losses }),
        h('td', { class: 'tm-strong', text: String(s.points) }),
        h('td', { text: s.sw + '-' + s.sl }),
        h('td', { text: s.gw + '-' + s.gl }),
        h('td', { class: G.complete ? 'tm-strong' : 'tm-muted', text: s.played ? String(rank) : '–' }));
    });

    return h('section', { class: 'tm-card' },
      h('header', { class: 'tm-card__head' },
        h('h4', { text: G.name + '组' }),
        h('span', { class: 'tm-muted', text: G.complete ? '已完赛' : G.done + '/' + G.total + ' 场' })),
      h('div', { class: 'table-scroll' }, h('table', { class: 'tm-table' }, h('thead', null, head), h('tbody', null, rows))),
      inst.cfg.rules.show_order ? renderOrder(inst, G, lookup, admin) : null);
  }

  function renderOrder(inst, G, lookup, admin) {
    const seq = new Map(G.players.map((p, i) => [p, i + 1]));
    const who = (p) => h('span', { class: 'tm-order__p' }, h('small', { text: String(seq.get(p)) }), ' ' + p);
    const items = G.rounds.map((rd, ri) => h('li', null,
      h('div', { class: 'tm-order__round', text: '第' + (ri + 1) + '轮' }),
      h('ul', null, rd.pairs.map(([a, b]) => {
        const g = lookup.get(a + '\u0000' + b);
        const r = g.r ? orient(g, a) : null;
        const line = [
          h('span', { class: r && r.winner === a ? 'is-w' : null }, who(a)),
          h('span', { class: 'tm-muted', text: ' vs ' }),
          h('span', { class: r && r.winner === b ? 'is-w' : null }, who(b)),
          h('span', { class: 'tm-order__score', text: r ? cellText(r) : '' }),
        ];
        if (!admin) return h('li', { class: r ? 'is-done' : null }, line);
        return h('li', { class: r ? 'is-done' : null }, h('button', {
          type: 'button', class: 'tm-order__btn',
          onclick: () => openEditor(inst, { key: g.key, a, b, title: G.name + '组 第' + (ri + 1) + '轮' }),
        }, line));
      })),
      rd.bye ? h('div', { class: 'tm-muted tm-order__bye' }, '轮空：', who(rd.bye)) : null));

    const key = G.name;
    const open = inst.orderOpen[key] === true;
    const det = h('details', { class: 'tm-order', open },
      h('summary', { text: '比赛顺序（' + G.rounds.length + ' 轮）' }),
      h('ol', null, items));
    det.addEventListener('toggle', () => { inst.orderOpen[key] = det.open; });
    return det;
  }

  function orient(g, p) {
    const r = g.r;
    if (g.a === p) return r;
    return { winner: r.winner, loser: r.loser, note: r.note, score: flipScore(r.score), sets: parseScore(flipScore(r.score)) };
  }

  function renderSlot(slot, m, side) {
    const name = slot.name || slot.label;
    const done = !!m.r || ((m.a.bye || m.b.bye) && !!m.win.name);
    const isWin = done && !!slot.name && slot.name === m.win.name;
    let games = [];
    if (m.r && m.r.sets && m.r.note !== 'W/O') {
      const sets = side === 'a' ? m.r.sets : m.r.sets.map((s) => ({ a: s.b, b: s.a }));
      games = sets.map((s) => h('span', { class: s.a > s.b ? 'is-w' : null, text: String(s.a) }));
    }
    let tag = null;
    if (m.r && m.r.note && slot.name === m.r.loser) tag = h('em', { text: m.r.note });
    return h('div', { class: 'tm-slot' + (done && isWin ? ' is-win' : '') + (slot.name ? '' : ' is-tbd') },
      h('span', { class: 'tm-slot__name', text: name }), tag, h('span', { class: 'tm-slot__games' }, games));
  }

  function renderMatch(inst, m, admin, roundLabel) {
    return h('div', { class: 'tm-match' + (m.a.bye || m.b.bye ? ' is-bye' : '') },
      h('div', { class: 'tm-match__no' }, h('span', { text: '第' + m.no + '场' }),
        admin && m.playable ? h('button', {
          type: 'button', class: 'tm-link',
          onclick: () => openEditor(inst, { key: m.key, a: m.a.name, b: m.b.name, title: roundLabel + ' 第' + m.no + '场' }),
        }, m.r ? '修改' : '录入') : null),
      renderSlot(m.a, m, 'a'),
      renderSlot(m.b, m, 'b'));
  }

  function renderKO(inst, ko, admin) {
    const cols = ko.rounds.map((rd) => h('div', { class: 'tm-round' },
      h('div', { class: 'tm-round__title', text: rd.name }),
      h('div', { class: 'tm-round__list' }, rd.matches.map((m) => renderMatch(inst, m, admin, rd.name)))));
    return h('div', null,
      ko.champion ? h('p', { class: 'tm-champ' },
        h('span', { text: '冠军' }), h('strong', { text: ko.champion }),
        ko.runnerUp ? h('span', { class: 'tm-muted', text: '亚军 ' + ko.runnerUp }) : null,
        ko.third && ko.third.win.name && ko.third.r ? h('span', { class: 'tm-muted', text: '季军 ' + ko.third.win.name }) : null) : null,
      h('div', { class: 'tm-bracket' }, cols),
      ko.third ? h('div', { class: 'tm-third' }, h('div', { class: 'tm-round__title', text: '三四名决赛' }), renderMatch(inst, ko.third, admin, '三四名决赛')) : null);
  }

  function render(inst) {
    const view = compute(inst);
    const admin = !!getToken();
    const advance = inst.cfg.rules.advance;
    const groups = Object.keys(view.groups).map((g) => renderGroup(inst, view.groups[g], advance, admin));
    const body = h('div', { class: 'tm-body' },
      renderBar(inst, view),
      h('h3', { text: '小组循环赛' }),
      h('p', { class: 'tm-muted tm-hint', text: '表格中比分为该行选手视角' + (advance > 0 ? '；小组赛结束后每组前 ' + advance + ' 名自动进入淘汰赛（绿色行）。' : '。') }),
      h('div', { class: 'tm-groups' }, groups),
      view.ko ? [h('h3', { text: '淘汰赛' }), view.rrComplete ? null : h('p', { class: 'tm-muted tm-hint', text: '各小组完赛后，出线选手将自动填入对阵表。' }), renderKO(inst, view.ko, admin)] : null);
    if (inst.body) inst.body.replaceWith(body); else inst.root.append(body);
    inst.body = body;
  }

  // ---------- Dialogs ----------
  function modal(content) {
    const dlg = h('dialog', { class: 'tm-dialog' }, content);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    document.body.append(dlg);
    dlg.showModal();
    return dlg;
  }

  function openEditor(inst, ctx) {
    const a = ctx.a, b = ctx.b;
    const existing = result(inst.scores.matches, ctx.key, a, b);
    const hint = inst.cfg.rules.score_hint || '如 6-4 或 6-4 3-6 [10-8]';
    const scoreIn = h('input', { type: 'text', inputmode: 'text', autocomplete: 'off', placeholder: hint, value: existing && existing.note !== 'W/O' ? existing.score : '' });
    const noteSel = h('select', null,
      h('option', { value: '', text: '正常完赛' }),
      h('option', { value: 'RET', text: '中途退赛（RET）' }),
      h('option', { value: 'W/O', text: '弃权（W/O）' }));
    noteSel.value = existing ? existing.note : '';
    const radio = (name) => h('input', { type: 'radio', name: 'tm-winner', value: name });
    const ra = radio(a), rb = radio(b);
    const err = h('p', { class: 'tm-error', role: 'alert' });
    const saveBtn = h('button', { type: 'submit', class: 'btn btn--dark btn--sm' }, '保存');

    function sync() {
      const manual = noteSel.value !== '';
      ra.disabled = rb.disabled = !manual;
      scoreIn.disabled = noteSel.value === 'W/O';
      if (!manual) {
        const sets = parseScore(scoreIn.value);
        const t = sets && tally(sets);
        ra.checked = !!(t && t.sa > t.sb);
        rb.checked = !!(t && t.sb > t.sa);
      }
    }
    if (existing) { (existing.winner === a ? ra : rb).checked = true; }
    scoreIn.addEventListener('input', sync);
    noteSel.addEventListener('change', sync);

    async function persist(rec, msg) {
      saveBtn.disabled = true;
      err.textContent = '';
      try {
        inst.scores = await writeMatch(inst, ctx.key, rec, msg);
        inst.error = '';
        dlg.close();
        render(inst);
      } catch (e) {
        err.textContent = apiErrorText(e);
        saveBtn.disabled = false;
      }
    }

    const form = h('form', {
      method: 'dialog',
      onsubmit: (e) => {
        e.preventDefault();
        const note = noteSel.value;
        const raw = scoreIn.value.trim().replace(/\s+/g, ' ');
        const sets = raw ? parseScore(raw) : null;
        if (raw && !sets && note !== 'W/O') { err.textContent = '比分格式不正确。' + hint; return; }
        let winner;
        if (!note) {
          if (!sets) { err.textContent = '请输入比分。'; return; }
          const t = tally(sets);
          if (t.sa === t.sb) { err.textContent = '无法从比分判断胜者，请检查。'; return; }
          winner = t.sa > t.sb ? a : b;
        } else {
          winner = ra.checked ? a : rb.checked ? b : null;
          if (!winner) { err.textContent = '请选择胜者。'; return; }
        }
        const rec = { p: [a, b], s: note === 'W/O' ? '' : raw, w: winner, t: new Date().toISOString() };
        if (note) rec.n = note;
        if (getUser()) rec.by = getUser();
        persist(rec, 'score(' + inst.id + '): ' + ctx.title + ' ' + a + ' vs ' + b + ' ' + (note === 'W/O' ? 'W/O' : raw) + (note === 'RET' ? ' ret' : ''));
      },
    },
      h('h3', { text: ctx.title }),
      h('p', { class: 'tm-vs' }, h('strong', { text: a }), ' vs ', h('strong', { text: b })),
      h('label', { class: 'tm-field' }, h('span', { text: '比分（以 ' + a + ' 视角）' }), scoreIn),
      h('label', { class: 'tm-field' }, h('span', { text: '结果' }), noteSel),
      h('fieldset', { class: 'tm-field' }, h('legend', { text: '胜者' }),
        h('label', null, ra, ' ', a), h('label', null, rb, ' ', b)),
      err,
      h('div', { class: 'tm-actions' },
        existing ? h('button', {
          type: 'button', class: 'btn btn--outline btn--sm tm-danger',
          onclick: () => { if (confirm('确定清除该场比分？')) persist(null, 'score(' + inst.id + '): clear ' + ctx.title + ' ' + a + ' vs ' + b); },
        }, '清除比分') : null,
        h('span', { class: 'tm-bar__sp' }),
        h('button', { type: 'button', class: 'btn btn--outline btn--sm', onclick: () => dlg.close() }, '取消'),
        saveBtn));
    const dlg = modal(form);
    sync();
    scoreIn.focus();
  }

  function openLogin(inst) {
    const input = h('input', { type: 'password', autocomplete: 'off', placeholder: 'github_pat_…', required: true });
    const err = h('p', { class: 'tm-error', role: 'alert' });
    const btn = h('button', { type: 'submit', class: 'btn btn--dark btn--sm' }, '登录');
    const form = h('form', {
      method: 'dialog',
      onsubmit: async (e) => {
        e.preventDefault();
        const token = input.value.trim();
        if (!token) return;
        btn.disabled = true;
        err.textContent = '';
        try {
          await gh('/repos/' + inst.repo, null, token);
          let login = '';
          try { login = (await (await gh('/user', null, token)).json()).login || ''; } catch (x) { /* optional */ }
          localStorage.setItem(TOKEN_KEY, token);
          if (login) localStorage.setItem(USER_KEY, login); else localStorage.removeItem(USER_KEY);
          dlg.close();
          instances.forEach((i) => refresh(i, true));
        } catch (x) {
          err.textContent = x.status === 401 ? '令牌无效。' : '无法访问仓库 ' + inst.repo + '，请检查令牌权限。';
          btn.disabled = false;
        }
      },
    },
      h('h3', { text: '裁判登录' }),
      h('p', { class: 'tm-muted' }, '请输入 GitHub 细粒度令牌（Fine-grained personal access token），仅授权仓库 ',
        h('code', { text: inst.repo }), '，权限 Contents: Read and write。令牌只保存在本设备浏览器中。'),
      h('label', { class: 'tm-field' }, h('span', { text: '令牌' }), input),
      err,
      h('div', { class: 'tm-actions' },
        h('span', { class: 'tm-bar__sp' }),
        h('button', { type: 'button', class: 'btn btn--outline btn--sm', onclick: () => dlg.close() }, '取消'),
        btn));
    const dlg = modal(form);
    input.focus();
  }

  function logout() {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (e) { /* ignore */ }
    instances.forEach(render);
  }

  // ---------- Lifecycle ----------
  async function refresh(inst, force) {
    if (inst.busy) return;
    if (!force && (document.hidden || document.querySelector('dialog.tm-dialog[open]'))) return;
    inst.busy = true;
    render(inst);
    try {
      inst.scores = await loadScores(inst);
      inst.error = '';
    } catch (e) {
      inst.error = '比分同步失败，请稍后刷新。';
    }
    inst.busy = false;
    render(inst);
  }

  function normalizeConfig(raw) {
    const cfg = raw && typeof raw === 'object' ? raw : {};
    const groups = {};
    for (const g of Object.keys(cfg.groups || {})) {
      const list = (cfg.groups[g] || []).map((p) => String(p).trim()).filter(Boolean);
      if (list.length) groups[String(g)] = list;
    }
    cfg.groups = groups;
    cfg.rules = cfg.rules || {};
    cfg.rules.advance = Math.max(0, parseInt(cfg.rules.advance, 10) || 0);
    return cfg;
  }

  function init(root) {
    const id = root.dataset.event || '';
    const repo = root.dataset.repo || '';
    if (!/^[\w.-]+$/.test(id) || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      root.append(h('p', { class: 'note', text: '赛事配置错误：缺少 id 或仓库设置。' }));
      return;
    }
    const cfgEl = root.querySelector('script[data-tm-config]');
    const inst = {
      root, id, repo,
      branch: root.dataset.branch || 'master',
      path: root.dataset.path || 'events/scores',
      cfg: normalizeConfig(JSON.parse(cfgEl ? cfgEl.textContent : '{}')),
      scores: emptyScores(),
      orderOpen: {},
      busy: false, error: '',
    };
    instances.push(inst);
    render(inst);
    refresh(inst, true);
    setInterval(() => refresh(inst, false), REFRESH_MS);
  }

  function start() { document.querySelectorAll('[data-tm]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) instances.forEach((i) => refresh(i, false)); });
})();
