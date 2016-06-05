---
layout: page
title: "過往賽事"
description: "History"
header-img: "img/history-bg.jpg"
---

{% for page in n site.pages %}
  {% if page.categories contains 'history' %}
    <div class="post-preview">
      <a href="{{ page.url | prepend: page.baseurl }}">
        <h2 class="page-title">
          {{ page.title }}
        </h2>
        {% if page.subtitle %}
          <h3 class="post-subtitle">
            {{ page.subtitle }}
          </h3>
        {% endif %}
      </a>
      <p/>
      {% if page.title == site.categories.history.first.title %}
        {{ page.excerpt }}
      {% endif %}
    </div>
  {% endif %}
{% endfor %}

