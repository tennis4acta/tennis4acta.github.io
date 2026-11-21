/* Real-time court management & dispatch console.
   Reads/writes the same per-event score files as js/tournament.js via window.ACTCCourtMgt. */
(function () {
  'use strict';

  function elapsedMinutes(iso, nowMs) {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    return Math.max(0, Math.floor(((nowMs || Date.now()) - t) / 60000));
  }

  function elapsedText(iso, nowMs) {
    const mins = elapsedMinutes(iso, nowMs);
    if (mins == null) return '';
    if (mins < 1) return '刚刚开赛';
    if (mins < 60) return '已进行 ' + mins + ' 分钟';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return '已进行 ' + h + ' 小时' + (m ? ' ' + m + ' 分钟' : '');
  }

  function startClockText(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString('zh-CN', {
        timeZone: 'Australia/Sydney',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch (e) {
      return '';
    }
  }

  function sortPlayableForCourt(list, courtId) {
    return list.slice().sort((x, y) => {
      const xBusy = x.busyConflict ? 1 : 0;
      const yBusy = y.busyConflict ? 1 : 0;
      if (xBusy !== yBusy) return xBusy - yBusy;
      const xPin = courtId && x.plannedCourt === courtId ? 0 : 1;
      const yPin = courtId && y.plannedCourt === courtId ? 0 : 1;
      if (xPin !== yPin) return xPin - yPin;
      const xKo = x.stage === 'ko' ? 0 : 1;
      const yKo = y.stage === 'ko' ? 0 : 1;
      if (xKo !== yKo) return xKo - yKo;
      if (x.scheduleSeq !== y.scheduleSeq) return x.scheduleSeq - y.scheduleSeq;
      if (x.roundNo !== y.roundNo) return x.roundNo - y.roundNo;
      return x.eventId.localeCompare(y.eventId);
    });
  }

  function filterPlayableMatches(list, eventFilter, query) {
    const q = String(query || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return list.filter((m) => {
      if (eventFilter && m.eventId !== eventFilter) return false;
      if (!q) return true;
      const hay = [m.eventLabel, m.eventShort, m.roundText, m.a, m.b, m.plannedCourt ? m.plannedCourt + '号场' : '']
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      elapsedMinutes,
      elapsedText,
      startClockText,
      sortPlayableForCourt,
      filterPlayableMatches,
    };
  }

  if (typeof document === 'undefined') return;

  function boot() {
    const root = document.querySelector('[data-court-mgt]');
    if (!root) return;
    const tools = window.ACTCCourtMgt;
    const bodyEl = root.querySelector('[data-court-mgt-body]');
    if (!tools || !bodyEl) {
      if (bodyEl) bodyEl.textContent = '球场管理组件加载失败，请刷新页面重试。';
      return;
    }
    const { h, nameNode, courtText } = tools;
    const repo = root.dataset.repo || '';
    const branch = root.dataset.branch || 'master';
    const scorePath = root.dataset.path || 'events/scores';
    const cfgEl = root.querySelector('script[data-court-mgt-config]');
    let courtMgt = null;
    try {
      courtMgt = tools.normalizeCourtMgt(JSON.parse(cfgEl ? cfgEl.textContent : '{}'));
    } catch (e) { /* invalid json */ }
    if (!courtMgt || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      bodyEl.replaceChildren(h('p', { class: 'note', text: '球场管理配置缺失或无效。' }));
      return;
    }

    const clients = courtMgt.events.map((ev) => ({
      id: ev.id,
      label: ev.label,
      short: ev.short,
      theme: ev.theme,
      url: ev.url,
      repo,
      branch,
      path: scorePath,
      cfg: ev.cfg,
      courts: tools.scheduleCourts(courtMgt.schedule, ev.id),
      courtMgt,
      scores: { matches: {} },
      loadedAt: 0,
      error: '',
      scoreSource: '',
    }));
    const clientById = new Map(clients.map((c) => [c.id, c]));

    let filterMode = 'all';
    let busy = false;
    let lastSyncMs = 0;

    function scoresMap() {
      const out = {};
      clients.forEach((c) => { out[c.id] = c.scores; });
      return out;
    }

    function themeClass(theme) {
      if (theme === 'sapphire' || theme === 'women' || theme === 'ruby' || theme === 'a') return 'cm-badge--' + theme;
      return 'cm-badge--a';
    }

    async function cancelLiveMatch(lm) {
      const client = clientById.get(lm.eventId);
      if (!client) return;
      const where = lm.court ? courtText(lm.court) : '未分配球场';
      if (!confirm('确定取消「' + lm.eventShort + ' · ' + lm.roundText + '（' + lm.a + ' vs ' + lm.b + '）」的进行中状态并释放 ' + where + '？（未录入比分）')) {
        return;
      }
      try {
        const desc = lm.editorTitle + ' ' + lm.a + ' vs ' + lm.b;
        client.scores = await tools.writeMatch(
          client,
          lm.key,
          tools.liveUpdate(lm.key, lm.a, lm.b, null),
          'score(' + client.id + '): clear live ' + desc
        );
        client.error = '';
        tools.notifySync({ type: 'live-clear', eventId: client.id, key: lm.key });
        await refreshBoard(true);
      } catch (e) {
        tools.openWarningModal('释放球场失败', tools.apiErrorText(e));
        await refreshBoard(true);
      }
    }

    async function quickStartMatch(match, courtId) {
      const client = clientById.get(match.eventId);
      if (!client) return;
      try {
        await Promise.all(clients.map(async (c) => {
          c.scores = await tools.loadScores(c);
          c.loadedAt = Date.now();
          c.error = '';
        }));
        const pre = tools.checkCourtAssignment(
          courtId,
          { eventId: match.eventId, key: match.key, a: match.a, b: match.b },
          courtMgt,
          scoresMap()
        );
        if (!pre.ok) {
          renderBoard();
          tools.openWarningModal(pre.code === 'occupied' ? '球场已被占用' : '无法开始比赛', pre.message);
          return;
        }
        const rec = { p: [match.a, match.b], live: true, c: pre.court, t: new Date().toISOString() };
        if (tools.getUser()) rec.by = tools.getUser();
        const desc = match.editorTitle + ' ' + match.a + ' vs ' + match.b;
        client.scores = await tools.writeMatch(
          client,
          match.key,
          tools.liveUpdate(match.key, match.a, match.b, rec, (latestMatches) => {
            const latest = Object.assign(scoresMap(), { [client.id]: { matches: latestMatches } });
            const finalCheck = tools.checkCourtAssignment(
              pre.court,
              { eventId: match.eventId, key: match.key, a: match.a, b: match.b },
              courtMgt,
              latest
            );
            if (!finalCheck.ok) {
              const ce = new Error(finalCheck.message);
              ce.userMessage = finalCheck.message;
              ce.conflictCheck = finalCheck;
              throw ce;
            }
          }),
          'score(' + client.id + '): live ' + desc + ' @ court ' + pre.court
        );
        tools.notifySync({ type: 'live', eventId: client.id, key: match.key });
        renderBoard();
      } catch (e) {
        await refreshBoard(true);
        tools.openWarningModal(e && e.conflictCheck ? '球场已被占用' : '派场失败', tools.apiErrorText(e));
      }
    }

    function openDispatchDialog(presetCourtId) {
      let selectedCourt = tools.normalizeCourtId(presetCourtId || '');
      let eventFilter = '';
      let searchQuery = '';
      let selectedMatch = null;
      let syncing = true;

      const courtGrid = h('div', { class: 'tm-court-grid', role: 'radiogroup', 'aria-label': '选择球场' });
      const filterRow = h('div', { class: 'cm-dispatch__filters' });
      const searchIn = h('input', {
        type: 'text',
        autocomplete: 'off',
        spellcheck: 'false',
        placeholder: '搜索球员姓名、组别或淘汰赛轮次…',
      });
      const matchList = h('div', { class: 'cm-dispatch__list', role: 'listbox', 'aria-label': '待开始比赛' });
      const warnBox = h('div', { class: 'tm-warn', role: 'alert', hidden: true });
      const err = h('p', { class: 'tm-error', role: 'alert' });
      const saveBtn = h('button', { type: 'submit', class: 'btn btn--dark btn--sm', disabled: true }, '开始比赛并占用球场');
      let dlg;

      function showWarn(text) {
        warnBox.textContent = text ? ('⚠️ ' + text) : '';
        warnBox.hidden = !text;
      }

      function renderDispatch() {
        const map = scoresMap();
        const board = tools.buildCourtBoard(courtMgt, map);
        if (!selectedCourt) {
          const firstFree = board.courts.find((c) => c.matches.length === 0);
          if (firstFree && !presetCourtId) selectedCourt = firstFree.id;
        }
        courtGrid.replaceChildren(...board.courts.map((c) => {
          const isOccupied = c.matches.length > 0;
          const isSelected = !isOccupied && selectedCourt === c.id;
          const first = c.matches[0];
          return h('button', {
            type: 'button',
            class: 'tm-court-btn' + (isOccupied ? ' is-occupied' : isSelected ? ' is-selected' : ''),
            role: 'radio',
            'aria-checked': String(isSelected),
            'data-court-id': c.id,
            'data-occupied': isOccupied ? 'true' : null,
            onclick: () => {
              if (isOccupied) {
                const msg = courtText(c.id) + ' 当前已被占用：\n' +
                  '项目：' + first.eventLabel + '\n' +
                  '轮次：' + first.roundText + '\n' +
                  '球员：' + first.a + ' vs ' + first.b + '\n\n不能使用已被占用的球场，请选择其他空闲球场。';
                showWarn(courtText(c.id) + ' 已被占用：' + first.eventShort + ' · ' + first.roundText + '（' + first.a + ' vs ' + first.b + '）。');
                tools.openWarningModal('球场已被占用', msg);
                return;
              }
              selectedCourt = c.id;
              showWarn('');
              err.textContent = '';
              renderDispatch();
            },
          },
            h('span', { class: 'tm-court-btn__num', text: courtText(c.id) }),
            h('span', { class: 'tm-court-btn__sub', text: isOccupied ? ('占用 · ' + first.eventShort) : '空闲' }));
        }));

        const tabs = [{ id: '', label: '全部项目' }].concat(
          courtMgt.events.map((ev) => ({ id: ev.id, label: ev.short }))
        );
        filterRow.replaceChildren(...tabs.map((tab) => h('button', {
          type: 'button',
          class: 'cm-pill' + (eventFilter === tab.id ? ' is-active' : ''),
          onclick: () => { eventFilter = tab.id; renderDispatch(); },
        }, tab.label)));

        const allPlayable = tools.collectPlayableMatches(courtMgt, map);
        const filtered = filterPlayableMatches(sortPlayableForCourt(allPlayable, selectedCourt), eventFilter, searchQuery);
        if (selectedMatch && !allPlayable.some((m) => m.eventId === selectedMatch.eventId && m.key === selectedMatch.key && !m.busyConflict)) {
          selectedMatch = null;
        }
        if (!selectedMatch && selectedCourt) {
          const autoMatch = filtered.find((m) => m.plannedCourt === selectedCourt && !m.busyConflict);
          if (autoMatch && presetCourtId) selectedMatch = autoMatch;
        }

        if (!filtered.length) {
          matchList.replaceChildren(h('p', { class: 'tm-muted cm-dispatch__empty', text: '没有符合条件的待开始比赛。' }));
        } else {
          matchList.replaceChildren(...filtered.map((m) => {
            const isSel = !!(selectedMatch && selectedMatch.eventId === m.eventId && selectedMatch.key === m.key);
            const isBusy = !!m.busyConflict;
            const isCourtPlanned = selectedCourt && m.plannedCourt === selectedCourt;
            return h('button', {
              type: 'button',
              class: 'cm-match-opt' + (isSel ? ' is-selected' : '') + (isBusy ? ' is-busy' : ''),
              role: 'option',
              'aria-selected': String(isSel),
              onclick: () => {
                if (isBusy) {
                  const bc = m.busyConflict;
                  const msg = '该场有球员正在进行另一场比赛：\n' +
                    bc.eventLabel + ' · ' + bc.roundText + (bc.court ? '（' + courtText(bc.court) + '）' : '') + '\n' +
                    bc.a + ' vs ' + bc.b + '\n\n请先结束那场比赛后再派场。';
                  showWarn('球员正在另一场比赛中（' + bc.eventShort + ' ' + bc.roundText + '）。');
                  tools.openWarningModal('球员比赛冲突', msg);
                  return;
                }
                selectedMatch = m;
                err.textContent = '';
                showWarn('');
                renderDispatch();
              },
            },
              h('div', { class: 'cm-match-opt__top' },
                h('span', { class: 'cm-badge ' + themeClass(m.theme), text: m.eventShort }),
                h('strong', { text: m.roundText }),
                m.stage === 'ko' ? h('span', { class: 'cm-tag cm-tag--ko', text: '淘汰赛' }) : null,
                isCourtPlanned ? h('span', { class: 'cm-tag cm-tag--plan', text: '原定本场' })
                  : (m.plannedCourt ? h('span', { class: 'cm-tag', text: '原赛程 ' + courtText(m.plannedCourt) }) : null),
                isBusy ? h('span', { class: 'cm-tag cm-tag--busy', text: '球员在' + (m.busyConflict.court ? courtText(m.busyConflict.court) : '比赛中') }) : null),
              h('div', { class: 'cm-match-opt__players', text: m.a + ' vs ' + m.b }));
          }));
        }
        saveBtn.disabled = syncing || !selectedCourt || !selectedMatch;
      }

      searchIn.addEventListener('input', () => {
        searchQuery = searchIn.value;
        renderDispatch();
      });

      async function syncLatest() {
        syncing = true;
        saveBtn.disabled = true;
        await Promise.all(clients.map(async (c) => {
          try {
            c.scores = await tools.loadScores(c);
            c.loadedAt = Date.now();
            c.error = '';
          } catch (e) {
            c.error = e.message || String(e);
          }
        }));
        syncing = false;
        if (selectedCourt) {
          const check = tools.checkCourtAssignment(selectedCourt, { eventId: '', key: '' }, courtMgt, scoresMap());
          if (!check.ok && check.code === 'occupied') {
            selectedCourt = '';
            showWarn(check.message);
          }
        }
        renderDispatch();
      }

      const form = h('form', {
        method: 'dialog',
        class: 'cm-dispatch',
        onsubmit: async (e) => {
          e.preventDefault();
          if (syncing) return;
          if (!selectedCourt) { err.textContent = '请先选择空闲球场。'; return; }
          if (!selectedMatch) { err.textContent = '请选择要开始的比赛。'; return; }
          saveBtn.disabled = true;
          dlg.close();
          await quickStartMatch(selectedMatch, selectedCourt);
        },
      },
        h('h3', { text: '分配球场并开始比赛' }),
        h('div', { class: 'tm-field' }, h('span', { text: '1. 选择空闲球场' }), courtGrid),
        warnBox,
        h('div', { class: 'tm-field' },
          h('span', { text: '2. 选择待开始的比赛（支持小组赛与淘汰赛）' }),
          filterRow,
          searchIn,
          matchList),
        err,
        h('div', { class: 'tm-actions' },
          h('span', { class: 'tm-bar__sp' }),
          h('button', { type: 'button', class: 'btn btn--outline btn--sm', onclick: () => dlg.close() }, '取消'),
          saveBtn));

      dlg = tools.modal(form);
      renderDispatch();
      syncLatest();
    }

    function renderMatchBlock(lm, admin) {
      const client = clientById.get(lm.eventId);
      const clock = startClockText(lm.startedAt);
      const elapsed = elapsedText(lm.startedAt, Date.now());
      const timeStr = [clock ? (clock + ' 开赛') : '', elapsed].filter(Boolean).join(' · ');

      return h('div', { class: 'cm-live-item' },
        h('div', { class: 'cm-live-item__head' },
          lm.url
            ? h('a', { class: 'cm-badge ' + themeClass(lm.theme), href: lm.url, text: lm.eventLabel })
            : h('span', { class: 'cm-badge ' + themeClass(lm.theme), text: lm.eventLabel }),
          h('span', { class: 'cm-round', text: lm.roundText })),
        h('div', { class: 'cm-players' },
          h('div', { class: 'cm-players__side' }, nameNode(lm.a)),
          h('span', { class: 'cm-players__vs', text: 'vs' }),
          h('div', { class: 'cm-players__side' }, nameNode(lm.b))),
        timeStr ? h('p', { class: 'cm-time tm-muted', text: timeStr }) : null,
        admin && client ? h('div', { class: 'cm-card__actions' },
          h('button', {
            type: 'button',
            class: 'btn btn--dark btn--sm',
            onclick: () => tools.openEditor(
              client,
              { key: lm.key, a: lm.a, b: lm.b, title: lm.eventShort + ' · ' + lm.editorTitle },
              () => refreshBoard(true)
            ),
          }, '录入比分（释放）'),
          h('button', {
            type: 'button',
            class: 'btn btn--outline btn--sm',
            onclick: () => tools.openLiveEditor(
              client,
              { key: lm.key, a: lm.a, b: lm.b, title: lm.eventShort + ' · ' + lm.editorTitle, live: { court: lm.court } },
              () => refreshBoard(true)
            ),
          }, '换场地'),
          h('button', {
            type: 'button',
            class: 'btn btn--outline btn--sm tm-danger',
            onclick: () => cancelLiveMatch(lm),
          }, '释放')) : null);
    }

    function renderCourtCard(court, admin) {
      const isBusy = court.matches.length > 0;
      const isConflict = court.matches.length > 1;
      const statusText = isConflict
        ? ('⚠️ 场地冲突 (' + court.matches.length + '场)')
        : (isBusy ? '使用中' : '空闲');
      const next = court.nextScheduled;

      return h('article', {
        class: 'cm-card' + (isConflict ? ' is-conflict' : isBusy ? ' is-busy' : ' is-free'),
        'data-court-card': court.id,
        'data-court-state': isBusy ? 'busy' : 'free',
      },
        h('header', { class: 'cm-card__head' },
          h('div', { class: 'cm-card__title-wrap' },
            h('h3', { class: 'cm-card__title', text: courtText(court.id) }),
            court.note ? h('span', { class: 'cm-card__note tm-muted', text: court.note }) : null),
          h('span', {
            class: 'cm-status' + (isConflict ? ' is-conflict' : isBusy ? ' is-busy' : ' is-free'),
            text: statusText,
          })),
        isBusy
          ? h('div', { class: 'cm-card__body' }, court.matches.map((lm) => renderMatchBlock(lm, admin)))
          : h('div', { class: 'cm-card__body cm-card__body--free' },
            h('p', { class: 'cm-idle-label', text: '当前空闲，可分配比赛' }),
            next ? h('div', { class: 'cm-next' },
              h('div', { class: 'cm-next__head' },
                h('span', { class: 'cm-next__tag', text: '赛程待打' + (next.time ? ' · ' + next.time.replace(/\s+/g, ' ') : '') }),
                h('span', { class: 'cm-badge ' + themeClass(next.theme), text: next.eventShort }),
                h('span', { class: 'cm-next__round', text: next.roundText })),
              h('div', { class: 'cm-next__players', text: next.a + ' vs ' + next.b }),
              admin ? h('div', { class: 'cm-next__actions' },
                h('button', {
                  type: 'button',
                  class: 'btn btn--dark btn--sm',
                  onclick: () => quickStartMatch(next, court.id),
                }, '按赛程直接开赛'),
                h('button', {
                  type: 'button',
                  class: 'btn btn--outline btn--sm',
                  onclick: () => openDispatchDialog(court.id),
                }, '分配其他比赛')) : null)
              : (admin ? h('div', { class: 'cm-card__actions' },
                h('button', {
                  type: 'button',
                  class: 'btn btn--outline btn--sm',
                  onclick: () => openDispatchDialog(court.id),
                }, '+ 分配比赛到此球场')) : null)));
    }

    function renderBoard() {
      const admin = !!tools.getToken();
      const board = tools.buildCourtBoard(courtMgt, scoresMap());
      const failed = clients.filter((c) => c.error);
      const anyCdn = !admin && clients.some((c) => c.scoreSource === 'cdn');
      const syncClock = lastSyncMs ? startClockText(new Date(lastSyncMs).toISOString()) : '';

      const filterButtons = [
        { id: 'all', label: '全部 (' + board.total + ')' },
        { id: 'busy', label: '使用中 (' + board.busy + ')' },
        { id: 'free', label: '空闲 (' + board.free + ')' },
      ].map((f) => h('button', {
        type: 'button',
        'aria-pressed': String(filterMode === f.id),
        onclick: () => { filterMode = f.id; renderBoard(); },
      }, f.label));

      const visibleCourts = board.courts.filter((c) => {
        if (filterMode === 'busy') return c.matches.length > 0;
        if (filterMode === 'free') return c.matches.length === 0;
        return true;
      });

      const bar = h('div', { class: 'tm-bar cm-bar' },
        h('span', { class: 'cm-summary-chip is-busy', text: '使用中 ' + board.busy }),
        h('span', { class: 'cm-summary-chip is-free', text: '空闲 ' + board.free }),
        board.conflicts > 0 ? h('span', { class: 'cm-summary-chip is-conflict', text: '⚠️ 冲突 ' + board.conflicts }) : null,
        h('div', { class: 'tm-view-switch cm-filter', role: 'group', 'aria-label': '筛选球场状态' }, filterButtons),
        syncClock ? h('span', {
          class: 'tm-muted cm-sync-meta',
          text: '同步于 ' + syncClock + (admin ? '（实时 API）' : anyCdn ? '（CDN 缓存）' : ''),
        }) : null,
        h('span', { class: 'tm-bar__sp' }),
        h('button', {
          type: 'button',
          class: 'btn btn--outline btn--sm',
          disabled: busy,
          onclick: () => refreshBoard(true),
        }, busy ? '同步中…' : '刷新'),
        admin ? h('button', {
          type: 'button',
          class: 'btn btn--dark btn--sm',
          onclick: () => openDispatchDialog(''),
        }, '+ 派场开赛') : null,
        admin
          ? h('button', {
            type: 'button',
            class: 'btn btn--outline btn--sm',
            title: tools.getUser() || '',
            onclick: () => tools.logout(() => refreshBoard(true)),
          }, '退出计分' + (tools.getUser() ? '（' + tools.getUser() + '）' : ''))
          : h('button', {
            type: 'button',
            class: 'btn btn--dark btn--sm',
            onclick: () => tools.openLogin(clients[0], () => refreshBoard(true)),
          }, '裁判登录'));

      const errBanner = failed.length ? h('div', { class: 'tm-warn', role: 'alert' },
        '⚠️ 部分项目同步失败：' + failed.map((c) => c.short + '（' + c.error + '）').join('、') + '；当前保留上次已读取的数据。') : null;

      const loginHint = !admin ? h('p', {
        class: 'tm-muted tm-hint',
        text: '裁判登录后可直接在此页面派场开赛、换场地、录入比分（自动释放球场），并通过 GitHub API 实时无缓存同步。',
      }) : null;

      const unassignedBox = board.unassigned.length ? h('section', { class: 'cm-unassigned' },
        h('h3', { text: '未分配有效球场的进行中比赛（' + board.unassigned.length + '）' }),
        h('div', { class: 'cm-unassigned__list' }, board.unassigned.map((lm) => renderMatchBlock(lm, admin)))) : null;

      const grid = visibleCourts.length
        ? h('div', { class: 'cm-grid' }, visibleCourts.map((c) => renderCourtCard(c, admin)))
        : h('p', { class: 'tm-muted', text: filterMode === 'busy' ? '当前没有使用中的球场。' : '当前没有空闲球场。' });

      bodyEl.replaceChildren(...[bar, errBanner, loginHint, unassignedBox, grid].filter(Boolean));
    }

    async function refreshBoard(force) {
      if (busy) return;
      if (!force && (document.hidden || document.querySelector('dialog.tm-dialog[open]'))) return;
      busy = true;
      renderBoard();
      await Promise.all(clients.map(async (c) => {
        try {
          c.scores = await tools.loadScores(c);
          c.loadedAt = Date.now();
          c.error = '';
        } catch (e) {
          c.error = e.message || String(e);
        }
      }));
      if (clients.some((c) => c.loadedAt)) lastSyncMs = Date.now();
      busy = false;
      renderBoard();
    }

    tools.onSync(() => { refreshBoard(true); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshBoard(false); });
    setInterval(() => {
      if (tools.getToken()) refreshBoard(false);
      else if (!document.hidden && !document.querySelector('dialog.tm-dialog[open]')) renderBoard();
    }, 30000);
    setInterval(() => {
      if (!tools.getToken()) refreshBoard(false);
    }, 60000);

    renderBoard();
    refreshBoard(true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
