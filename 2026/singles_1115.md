---
layout: page
title: "2026 ACTC皇族香米杯华人网球大奖赛"
description: "11月15日 单打赛程"
---

{%- assign t = site.data.tournament -%}
{%- assign day = t.days[0] -%}

**2026年11月15日（周日）上午8:00开始** · {{ t.venue.name }}

地址：{{ t.venue.address }}。报名费：{{ day.fee_text }}。

[赛事报名]({{ '/2026/tickets/' | relative_url }}) · [参赛规程]({{ '/#rules' | relative_url }}) · [双打赛程]({{ '/2026/1122/' | relative_url }})

## 赛程表

详细赛程待公布，请留意本网站及球会群的通知。

## 分组及比分

- [男子单打 A级别](#singles-a)
- [男子单打 B级别（红宝石 / 蓝宝石）](#singles-b)
- [女子单打](#singles-w)

分组、晋级安排及比分待公布，以组委会最终公布为准。

<h2 id="singles-a">男子A级别单打</h2>

### 首轮开赛时间：2026年11月15日 上午8:00

- 请在首场比赛前15分钟签到。
- 名额：{{ t.events[0].capacity_text }}。

### 参赛要求

{% for item in t.requirements.singles_a.items %}
- {{ item }}
{% endfor %}

### 淘汰赛

小组出线及淘汰赛安排待公布。

### Update

赛事更新待公布。

<h2 id="singles-b">男子B级别单打 红宝石 / 蓝宝石区</h2>

### 首轮开赛时间：2026年11月15日 上午8:00

- 请在首场比赛前15分钟签到。
- 名额：{{ t.events[1].capacity_text }}。

### 参赛要求

{% for item in t.requirements.singles_b.items %}
- {{ item }}
{% endfor %}

### 淘汰赛

红宝石和蓝宝石两个区分别决出名次，小组出线及淘汰赛安排待公布。

<h2 id="singles-w">女子单打</h2>

### 首轮开赛时间：2026年11月15日 上午8:00

- 请在首场比赛前15分钟签到。
- 名额：{{ t.events[2].capacity_text }}。

### 参赛要求

{% for item in t.requirements.singles_w.items %}
- {{ item }}
{% endfor %}

### 淘汰赛

小组出线及淘汰赛安排待公布。

## 比赛规则 Competition Rules

0. 小组赛按总胜赛数、总胜局数、胜负局数差、球员间比赛成绩为序决定小组内成绩。
1. **Match winning rule:** If there are 3 players in a group, first to 6 games wins (tiebreak at 5 all); if there are 4 players, first to 5 games wins (tiebreak at 4 all); if there are 5 players, first to 4 games wins (tiebreak at 3 all).<br>如果小组有3位球员，比赛先赢6局者获胜（5平时抢五）；如果小组有4位球员，比赛先赢5局者获胜（4平时抢五）；如果小组有5位球员，比赛先赢4局者获胜（3平时抢五）。
2. **No AD scoring (Short Deuce):** At deuce, the next point wins. The receiving player decides the receiving court.<br>如果双方出现第一次DEUCE平分，赢得下一分的一方赢得本局。由接发球方选择接球区。
3. **Tiebreak (finals excepted):** First to 5 points wins, with a two-point lead required. At 4:4, play continues until one player leads by two points.<br>除决赛外的所有比赛采用short tie-break，先赢5分并领先两分者获胜。
4. **Finals:** A normal tiebreak rule applies to all finals.<br>决赛使用常规抢七规则。

---

## 注意事项

- 由于赛程非常紧张，要求球员提前到达赛场等候比赛；如该球员在其球赛开始5分钟后未到场，判负一局；之后迟到每5分钟判负一局；迟到15分钟直接判0:5负。
- 比赛采用信任制，双方球员对自己半场判球。请参赛球员尊重对手，公平竞争，公正裁判，在比赛中展现良好的球品。
- 如遇屡有争议判球，球员可以向协调员申请裁判到场。裁判到场前的比分不做更改；裁判进场后，仍采用信任制由球员判球，但裁判可现场更正并拥有最终决定权。如有球员屡有乱判，组委会将做出进一步处罚。
- {{ t.rules.constraints[1] }}
