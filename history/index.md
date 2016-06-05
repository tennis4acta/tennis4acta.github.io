---
layout: page
title: "過往賽事"
description: "History"
header-img: "img/history-bg.jpg"
---

{% for cat in site.category-list %}
<ul>
  {% for page in site.pages %}
    {% if page.resource == true %}
      {% for pc in page.categories %}
        {% if pc == cat %}
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
  </div>

        {% endif %}   <!-- cat-match-p -->
      {% endfor %}  <!-- page-category -->
    {% endif %}   <!-- resource-p -->
  {% endfor %}  <!-- page -->
</ul>
{% endfor %}  <!-- cat -->
