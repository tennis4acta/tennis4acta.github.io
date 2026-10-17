---
layout: page
title: "2026 ACTC皇族香米杯华人网球大奖赛 报名页"
description: "Registration"
permalink: /2026/registration/
---

{%- assign t = site.data.tournament -%}

报名开放：{{ t.registration.opens_text }}。报名截止：{{ t.registration.closes_text }}，或额满提前截止。

请先阅读[参赛规程]({{ '/#rules' | relative_url }})及各项目要求。每位球员每个比赛日只能参加一个项目。

<p class="note note--warn" data-show="before_open" hidden>报名链接将于<strong>{{ t.registration.opens_text }}</strong>在本页开放，届时请刷新本页面。</p>
<p class="note note--warn" data-show="before_open open" hidden><strong>如项目已满，请在<a href="{{ t.registration.waitlist_url | relative_url }}">等候名单页面</a>填写登记。</strong>如有球员退赛，组委会将按登记先后顺序联系您。</p>
<p class="note note--warn" data-show="closed running finished" hidden>报名已截止。如需列入等候名单，请<a href="{{ t.registration.waitlist_url | relative_url }}">填写等候名单</a>。</p>
{% for d in t.days %}
## 2026年{{ d.date_text }}{{ d.time_text | remove: ' ' }} · {{ d.name }}

报名费：{{ d.fee_text }}。比赛地点：{{ t.venue.name }}，{{ t.venue.address }}。

<div data-show="open" hidden>
<ul>
{%- for e in t.events %}{% if e.day == d.id %}
  {%- capture label %}{{ e.name }}{% if e.tag %}（{{ e.tag }}）{% endif %}{% endcapture %}
  {%- if e.full %}
  <li>{{ label }} · <strong>已报满</strong> · <a href="{{ t.registration.waitlist_url | relative_url }}?event={{ e.id }}">加入等候名单</a></li>
  {%- else %}
  <li><a href="{{ e.reg_url }}">{{ label }}</a></li>
  {%- endif %}
{%- endif %}{% endfor %}
</ul>
</div>

[{{ d.name }}赛程与比赛规则]({{ d.url | relative_url }})
{% endfor %}