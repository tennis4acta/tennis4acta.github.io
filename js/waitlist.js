(function () {
  'use strict';
  var params = new URLSearchParams(location.search);

  var thanks = document.getElementById('waitlist-thanks');
  if (thanks) {
    var who = (params.get('name') || '').trim();
    var ev = (params.get('event') || '').trim();
    if (who) thanks.textContent = who + ' 已加入' + (ev ? '「' + ev + '」' : '') + '等候名单。';
    return;
  }

  var form = document.getElementById('waitlist-form');
  if (!form) return;
  var msg = form.querySelector('.form__msg');
  var btn = form.querySelector('button[type="submit"]');
  var endpoint = form.dataset.endpoint;

  var pre = params.get('event');
  if (pre) {
    var opt = form.querySelector('option[data-id="' + CSS.escape(pre) + '"]');
    if (opt) opt.selected = true;
  }

  if (!endpoint) {
    msg.textContent = '等候名单登记暂未开放，请稍后再试或发邮件至 info@actc.org.au。';
    btn.disabled = true;
    return;
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    msg.textContent = '';
    if (!form.reportValidity()) return;
    var data = new URLSearchParams(new FormData(form));
    btn.disabled = true;
    btn.textContent = '提交中…';
    // Form-encoded POST is a CORS "simple request", so Apps Script needs no preflight.
    fetch(endpoint, { method: 'POST', body: data })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.ok) throw new Error(res && res.error || 'failed');
        location.href = form.dataset.thanks + '?' + new URLSearchParams({ name: data.get('name'), event: data.get('event') });
      })
      .catch(function () {
        msg.textContent = '提交失败，请检查网络后重试，或发邮件至 info@actc.org.au。';
        btn.disabled = false;
        btn.textContent = '提交 Submit';
      });
  });
})();
