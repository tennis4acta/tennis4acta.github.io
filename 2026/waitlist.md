---
layout: page
title: "2026 ACTC皇族香米杯华人网球大奖赛 等候名单"
description: "Waiting List"
permalink: /2026/waitlist/
---

{%- assign t = site.data.tournament -%}

项目报满后，可在此登记等候名单。如有球员退赛，组委会将按登记先后顺序联系您。登记等候名单不代表报名成功。

<form class="form" id="waitlist-form" data-endpoint="{{ t.registration.waitlist_endpoint }}" data-thanks="{{ '/2026/waitlist/thanks/' | relative_url }}" novalidate>
  <label>姓名 Name(s)
    <input name="name" type="text" required maxlength="80" autocomplete="name" placeholder="双打请填写两位球员姓名">
  </label>
  <label>项目 Event
    <select name="event" required>
      <option value="">请选择项目</option>
      {%- for d in t.days %}
      <optgroup label="{{ d.name }} · {{ d.date_text }}">
        {%- for e in t.events %}{% if e.day == d.id %}
        <option value="{{ e.name }}{% if e.tag %}（{{ e.tag }}）{% endif %}" data-id="{{ e.id }}">{{ e.name }}{% if e.tag %}（{{ e.tag }}）{% endif %}</option>
        {%- endif %}{% endfor %}
      </optgroup>
      {%- endfor %}
    </select>
  </label>
  <label>电话 Mobile
    <input name="mobile" type="tel" required maxlength="20" pattern="[0-9 +\(\)\-]{8,20}" autocomplete="tel" placeholder="04xx xxx xxx">
  </label>
  <label>电邮 Email
    <input name="email" type="email" required maxlength="120" autocomplete="email">
  </label>
  <label class="hp" aria-hidden="true">Website <input name="website" type="text" tabindex="-1" autocomplete="off"></label>
  <p class="note note--warn form__msg" role="alert"></p>
  <button class="btn btn--primary" type="submit">提交 Submit</button>
</form>

如有疑问，请发邮件至 [{{ t.registration_email }}](mailto:{{ t.registration_email }})。

<script src="{{ '/js/waitlist.js' | relative_url }}" defer></script>
