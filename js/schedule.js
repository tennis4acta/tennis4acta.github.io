(function () {
  'use strict';

  function normalize(value) {
    return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  }

  function isPlayer(name) {
    return !/^(?:[A-H][12]|Winner .+)$/i.test(name);
  }

  function playerNames(matches) {
    return Array.from(new Set(matches.flatMap(function (match) {
      return [match.player1, match.player2].filter(isPlayer);
    }))).sort(function (a, b) { return a.localeCompare(b); });
  }

  function suggestions(players, query) {
    var needle = normalize(query);
    if (Array.from(needle).length < 3) return [];
    return players.filter(function (player) { return normalize(player).includes(needle); });
  }

  function matchesForPlayer(matches, player) {
    return matches.filter(function (match) { return match.player1 === player || match.player2 === player; });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { playerNames: playerNames, suggestions: suggestions, matchesForPlayer: matchesForPlayer };
  }
  if (typeof document === 'undefined') return;
  var root = document.querySelector('[data-schedule]');
  if (!root) return;
  var input = root.querySelector('#schedule-player');
  var list = root.querySelector('#schedule-suggestions');
  var status = root.querySelector('#schedule-status');
  var full = root.querySelector('[data-schedule-full]');
  var personal = root.querySelector('[data-schedule-personal]');
  var personalList = root.querySelector('[data-schedule-personal-list]');
  var title = root.querySelector('[data-schedule-personal-title]');
  var courtCounts = {};
  var matches = Array.from(root.querySelectorAll('[data-match]')).map(function (cell) {
    var court = cell.dataset.court;
    courtCounts[court] = (courtCounts[court] || 0) + 1;
    return {
      time: cell.closest('tr').dataset.time, court: court, order: courtCounts[court],
      label: cell.dataset.label, player1: cell.dataset.player1, player2: cell.dataset.player2
    };
  });
  var players = playerNames(matches);
  var options = [];
  var active = -1;
  root.querySelector('[data-schedule-search]').hidden = false;

  function closeSuggestions() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function showAll() {
    full.hidden = false;
    personal.hidden = true;
  }

  function selectPlayer(player) {
    var selected = matchesForPlayer(matches, player);
    input.value = player;
    closeSuggestions();
    personalList.replaceChildren();
    title.textContent = player + ' 的赛程';
    selected.forEach(function (match) {
      var card = document.createElement('li');
      var heading = document.createElement('h3');
      heading.textContent = match.time;
      card.appendChild(heading);
      var details = document.createElement('dl');
      [
        ['场地', match.court + ' 号场地 · 该场地第 ' + match.order + ' 场'],
        ['比赛', match.label],
        ['对手', match.player1 === player ? match.player2 : match.player1]
      ].forEach(function (detail) {
        var term = document.createElement('dt');
        var value = document.createElement('dd');
        term.textContent = detail[0];
        value.textContent = detail[1];
        details.append(term, value);
      });
      card.appendChild(details);
      personalList.appendChild(card);
    });
    full.hidden = true;
    personal.hidden = false;
    status.textContent = '已选择 ' + player + '，共 ' + selected.length + ' 场比赛。';
  }

  function updateSuggestions() {
    showAll();
    options = suggestions(players, input.value);
    list.replaceChildren();
    closeSuggestions();
    if (!options.length) {
      status.textContent = Array.from(normalize(input.value)).length < 3 ?
        '输入至少 3 个字母，再选择球员。' : '没有匹配球员，请检查姓名拼写。';
      return;
    }
    options.forEach(function (player, index) {
      var item = document.createElement('li');
      item.setAttribute('role', 'presentation');
      var button = document.createElement('button');
      button.type = 'button';
      button.id = 'schedule-player-option-' + index;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', 'false');
      button.tabIndex = -1;
      button.textContent = player;
      button.addEventListener('pointerdown', function (event) { event.preventDefault(); });
      button.addEventListener('click', function () { selectPlayer(player); });
      item.appendChild(button);
      list.appendChild(item);
    });
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    status.textContent = '找到 ' + options.length + ' 位球员，点击姓名或用方向键选择。';
  }

  input.addEventListener('input', updateSuggestions);
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { closeSuggestions(); return; }
    if (list.hidden || !options.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = event.key === 'ArrowDown' ? (active + 1) % options.length :
        (active < 0 ? options.length - 1 : (active - 1 + options.length) % options.length);
      var buttons = list.querySelectorAll('[role="option"]');
      buttons.forEach(function (button, index) { button.setAttribute('aria-selected', String(index === active)); });
      input.setAttribute('aria-activedescendant', buttons[active].id);
      buttons[active].scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      selectPlayer(options[active]);
    }
  });
  input.addEventListener('blur', closeSuggestions);
  root.querySelector('[data-schedule-clear]').addEventListener('click', function () {
    input.value = '';
    updateSuggestions();
    input.focus();
  });
  document.addEventListener('click', function (event) {
    if (!root.querySelector('.schedule-search__field').contains(event.target)) closeSuggestions();
  });
})();
