---
layout: page
title: "2026 年单打赛程（场地调整后）"
description: "2026年11月15日单打赛程"
permalink: /2026/schedule/singles/
wide: true
---
{% assign schedule = site.data.schedules['2026-singles'] %}
{% assign store = site.tournament_scores %}
<link rel="stylesheet" href="{{ '/css/schedule.css' | relative_url }}?v={{ site.time | date: '%s' }}">
<section class="schedule" data-schedule data-repo="{{ store.repo | escape }}" data-branch="{{ store.branch | default: 'master' | escape }}" data-path="{{ store.path | default: 'events/scores' | escape }}">
  <p><a class="btn btn--primary btn-lg btn--block" href="{{ '/2026/1115/' | relative_url }}">返回单打赛事页</a></p>
  <div class="schedule-search" data-schedule-search hidden>
    <div class="schedule-search__controls">
      <div class="schedule-search__field">
        <label for="schedule-player">查找球员</label>
        <input id="schedule-player" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="schedule-suggestions" aria-describedby="schedule-status" autocomplete="off" spellcheck="false" placeholder="输入至少 3 个字母，如 ben">
        <ul id="schedule-suggestions" class="schedule-search__suggestions" role="listbox" aria-label="匹配球员" hidden></ul>
      </div>
      <div class="schedule-search__court">
        <label for="schedule-court">查找场地</label>
        <select id="schedule-court" aria-describedby="schedule-status">
          <option value="">全部场地</option>
          {% for court in schedule.courts %}<option value="{{ court }}">{{ court }} 号场地</option>{% endfor %}
        </select>
      </div>
      <button type="button" data-schedule-clear>显示全部</button>
    </div>
    <p id="schedule-status" class="schedule-search__status" role="status" aria-live="polite">输入至少 3 个字母，再选择球员。</p>
  </div>
  <noscript><p>启用 JavaScript 后可搜索球员；完整赛程仍可在下表查看。</p></noscript>
  <section data-schedule-personal hidden aria-label="筛选赛程">
    <h2 data-schedule-personal-title></h2>
    <ol class="schedule-personal" data-schedule-personal-list></ol>
    <p>晋级后对阵以赛会公布为准。</p>
  </section>
  <div data-schedule-full>
    <p class="schedule__scroll-hint">左右滑动查看全部场地；</p>
    <p class="schedule__scroll-hint">注意：赛会保留更改场地的权利。</p>
    <div class="schedule__scroll table-responsive" role="region" aria-label="完整单打赛程，可左右滚动" tabindex="0">
      <table class="schedule-table" data-schedule-table>
        <caption class="sr-only">2026 年 11 月 15 日单打赛程，按开赛时间及场地排列</caption>
        <thead><tr><th scope="col">开赛时间</th>{% for court in schedule.courts %}<th scope="col">{{ court }} 号场地</th>{% endfor %}</tr></thead>
        <tbody>
          {% for row in schedule.rows %}
          <tr data-time="{{ row.time | escape }}">
            <th scope="row">{{ row.time | escape }}</th>
            {% for match in row.matches %}
            {% assign court_index = forloop.index0 %}
            {% assign court = schedule.courts[court_index] %}
            <td{% if match %} data-match data-court="{{ court }}" data-event="{{ match.eventId | escape }}" data-group="{{ match.group | escape }}" data-label="{{ match.label | escape }}" data-player1="{{ match.player1 | escape }}" data-player2="{{ match.player2 | escape }}"{% endif %}>
              {% if match %}
              {% assign division = match.label | split: '-' | first %}
              <div class="schedule-match{% if division == '女子' %} schedule-match--women{% elsif division == '红宝石' %} schedule-match--ruby{% elsif division == '蓝宝石' %} schedule-match--sapphire{% else %} schedule-match--a{% endif %}">
                <span class="schedule-match__label">{{ match.label | escape }}</span>
                <span><strong>{{ match.player1 | escape }}</strong> <span class="schedule-match__vs">vs</span></span>
                <span><strong>{{ match.player2 | escape }}</strong></span>
                <span class="schedule-score" data-schedule-score hidden></span>
              </div>
              {% else %}<span class="schedule-table__empty" aria-label="未安排比赛">—</span>{% endif %}
            </td>
            {% endfor %}
          </tr>
          {% endfor %}
        </tbody>
      </table>
    </div>
  </div>
  <div class="schedule-sync" data-schedule-sync hidden>
    <button type="button" class="btn btn--outline btn--sm" data-schedule-refresh>刷新比分</button>
    <p data-schedule-score-status role="status" aria-live="polite">正在同步比分…</p>
  </div>
</section>
<script src="{{ '/js/tournament.js' | relative_url }}?v={{ site.time | date: '%s' }}" defer></script>
<script src="{{ '/js/schedule.js' | relative_url }}?v={{ site.time | date: '%s' }}" defer></script>
