/* Если что-то ломается, показываем текст ошибки сверху страницы (чтобы его можно было прислать) и кнопку сброса сохранённых данных */
(function () {
  function show(msg) {
    var d = document.getElementById('fatal');
    if (!d) {
      d = document.createElement('div'); d.id = 'fatal';
      d.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;background:#b3261e;color:#fff;padding:10px 16px;font:13px Arial;white-space:pre-wrap';
      var b = document.createElement('button'); b.textContent = 'Сбросить сохранённые данные и перезагрузить'; b.style.cssText = 'display:block;margin-top:6px;padding:4px 10px;cursor:pointer';
      b.onclick = function () { try { localStorage.removeItem('ventfactory-kp-v1'); } catch (e) { } location.reload(); };
      d.appendChild(document.createElement('span')); d.appendChild(b); (document.body || document.documentElement).appendChild(d);
    }
    d.firstChild.textContent += 'Ошибка: ' + msg + '\n';
  }
  window.addEventListener('error', function (e) { show((e.message || '') + ' (' + String(e.filename || '').split('/').pop() + ':' + e.lineno + ')'); });
  window.addEventListener('unhandledrejection', function (e) { show(String(e.reason)); });
})();
