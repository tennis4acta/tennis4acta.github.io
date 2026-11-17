---
layout: page
title: "2026 ACTC皇族香米杯华人网球大奖赛"
description: "11月22日 双打赛程"
permalink: /2026/1122/
---

{%- assign t = site.data.tournament -%}

**2026年11月22日（周日）上午8:00开始** · {{ t.venue.name }}

地址：{{ t.venue.address }}。

[参赛规程]({{ '/#rules' | relative_url }}) · [单打赛程]({{ t.days[0].url | relative_url }})

## 赛程表

详细赛程待公布，请留意本网站及球会群的通知。

## 分组及比分

<div class="mcards">
  <a class="mcard" href="{{ '/2026/matches/doubles_a/' | relative_url }}">
    <span class="mcard__badge">男子双打</span>
    <h3>A 级别</h3>
    <ul class="mcard__stats">
      <li><b>12</b><span>组合</span></li>
      <li><b>4</b><span>小组</span></li>
      <li><b>2</b><span>种子</span></li>
    </ul>
    <span class="mcard__go">查看分组及比分 →</span>
  </a>
  <a class="mcard mcard--sapphire" href="{{ '/2026/matches/doubles_b/' | relative_url }}">
    <span class="mcard__badge">男子双打</span>
    <h3>B 级别</h3>
    <ul class="mcard__stats">
      <li><b>32</b><span>组合</span></li>
      <li><b>8</b><span>小组</span></li>
      <li><b>4</b><span>对/组</span></li>
    </ul>
    <span class="mcard__go">查看分组及比分 →</span>
  </a>
  <a class="mcard mcard--women" href="{{ '/2026/matches/womens_doubles/' | relative_url }}">
    <span class="mcard__badge">女子双打</span>
    <h3>女子双打</h3>
    <ul class="mcard__stats">
      <li><b>16</b><span>组合</span></li>
      <li><b>4</b><span>小组</span></li>
      <li><b>2</b><span>种子</span></li>
    </ul>
    <span class="mcard__go">查看分组及比分 →</span>
  </a>
  <a class="mcard mcard--ruby" href="{{ '/2026/matches/senior_doubles/' | relative_url }}">
    <span class="mcard__badge">中年组双打</span>
    <h3>50–70 岁</h3>
    <ul class="mcard__stats">
      <li><b>8</b><span>组合</span></li>
      <li><b>2</b><span>小组</span></li>
      <li><b>2</b><span>种子</span></li>
    </ul>
    <span class="mcard__go">查看分组及比分 →</span>
  </a>
</div>

各项目均设小组赛，每组前 2 名晋级淘汰赛，不设三四名赛；以组委会最终公布为准。

<h2 id="doubles-a">男子A级别双打</h2>

### 首轮开赛时间：2026年11月22日 上午8:00

- 请在首场比赛前15分钟签到。
- 名额：{{ t.events[3].capacity_text }}。

### 参赛要求

{% for item in t.requirements.doubles_a.items %}
- {{ item }}
{% endfor %}

### 淘汰赛

每组前 2 名晋级 8 对淘汰赛（QF），对阵见[分组及比分页面]({{ '/2026/matches/doubles_a/' | relative_url }})。

<h2 id="doubles-b">男子B级别双打</h2>

### 首轮开赛时间：2026年11月22日 上午8:00

- 请在首场比赛前15分钟签到。
- 名额：{{ t.events[4].capacity_text }}。

### 参赛要求

{% for item in t.requirements.doubles_b.items %}
- {{ item }}
{% endfor %}

### 淘汰赛

每组前 2 名晋级 16 强淘汰赛，对阵见[分组及比分页面]({{ '/2026/matches/doubles_b/' | relative_url }})。

<h2 id="doubles-w">女子双打</h2>

### 首轮开赛时间：2026年11月22日 上午8:00

- 请在首场比赛前15分钟签到。
- 名额：{{ t.events[5].capacity_text }}。

### 参赛要求

{% for item in t.requirements.doubles_w.items %}
- {{ item }}
{% endfor %}

### 淘汰赛

每组前 2 名晋级 8 对淘汰赛（QF），对阵见[分组及比分页面]({{ '/2026/matches/womens_doubles/' | relative_url }})。

<h2 id="doubles-s">中年组双打（50-70岁）</h2>

### 首轮开赛时间：2026年11月22日 上午8:00

- 请在首场比赛前15分钟签到。
- 名额：{{ t.events[6].capacity_text }}。

### 参赛要求

{% for item in t.requirements.doubles_s.items %}
- {{ item }}
{% endfor %}

### 淘汰赛

每组前 2 名晋级半决赛（SF，共 4 对），对阵见[分组及比分页面]({{ '/2026/matches/senior_doubles/' | relative_url }})。

## 比赛规则 Competition Rules

0. 小组赛按总胜赛数、总胜局数、胜负局数差、球员间比赛成绩为序决定小组内成绩。每组前2名晋级淘汰赛，不设三四名赛。
1. **Match winning rule:** If there are 3 pairs in a group, first to 6 games wins (tiebreak at 5 all); if there are 4 pairs, first to 5 games wins (tiebreak at 4 all).<br>如果小组有3对球员，比赛先赢6局者获胜（5平时抢五）；如果小组有4对球员，比赛先赢5局者获胜（4平时抢五）。
2. **No AD scoring (Short Deuce):** At deuce, the next point wins. The receiving pair decides who returns the point.<br>如果双方出现第一次DEUCE平分，赢得下一分的一方赢得本局。由接发球方选择接球区。
3. **Tiebreak (finals excepted):** First to 5 points wins, with a two-point lead required. At 4:4, play continues until one pair leads by two points.<br>除决赛外的所有比赛采用short tie-break，先赢5分并领先两分者获胜。
4. **Playoffs (finals excepted):** First to 5 games wins (tiebreak at 4 all).<br>淘汰赛除决赛外先赢五局者获胜，4平时抢五。
5. **Finals:** A normal no-ad set applies, with a normal tiebreak at 5 all.<br>决赛使用常规short deuce set，5平时使用常规抢七规则。

---

## 注意事项

- 由于赛程非常紧张，要求球员提前到达赛场等候比赛；如该球员在其球赛开始5分钟后未到场，判负一局；之后迟到每5分钟判负一局；迟到15分钟直接判0:5负。
- 比赛采用信任制，双方球员对自己半场判球。请参赛球员尊重对手，公平竞争，公正裁判，在比赛中展现良好的球品。
- 如遇屡有争议判球，球员可以向协调员申请裁判到场。裁判到场前的比分不做更改；裁判进场后，仍采用信任制由球员判球，但裁判可现场更正并拥有最终决定权。如有球员屡有乱判，组委会将做出进一步处罚。
- {{ t.rules.constraints[1] }}