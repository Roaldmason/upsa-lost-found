/* INCLUSIVE DESIGN 7: "Reading comfort" bar (text size + high contrast).
   Shown at the top of every page. Choices are remembered on this device.
   Helps people with low vision, older users, people who read better with
   bigger text or stronger contrast, and anyone reading in bright sunlight. */
(function () {
  'use strict';
  var KEY = 'upsa_comfort', MAX = 2;
  var LABELS = ['100%', '125%', '150%'];
  var root = document.documentElement;
  var prefs = { text: 0, contrast: false };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    prefs.text = Math.min(MAX, Math.max(0, parseInt(saved.text, 10) || 0));
    prefs.contrast = saved.contrast === true;
  } catch (e) {}

  function apply() {
    root.setAttribute('data-text', String(prefs.text));
    root.setAttribute('data-contrast', prefs.contrast ? 'high' : 'normal');
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {} }
  apply();

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text) n.textContent = text;
    return n;
  }

  var bar = el('div', { 'class': 'a11y-bar', role: 'group', 'aria-label': 'Reading comfort' });
  bar.appendChild(el('span', { 'class': 'a11y-title', 'aria-hidden': 'true' }, 'Reading comfort'));
  var smaller = el('button', { type: 'button', 'class': 'a11y-btn', 'aria-label': 'Make text smaller' }, 'A\u2212');
  var bigger = el('button', { type: 'button', 'class': 'a11y-btn', 'aria-label': 'Make text bigger' }, 'A+');
  var contrast = el('button', { type: 'button', 'class': 'a11y-btn', 'aria-pressed': 'false' }, 'High contrast');
  var live = el('span', { 'class': 'sr-only', role: 'status', 'aria-live': 'polite' });
  [smaller, bigger, contrast, live].forEach(function (n) { bar.appendChild(n); });

  function paint(msg) {
    smaller.disabled = prefs.text === 0;
    bigger.disabled = prefs.text === MAX;
    contrast.setAttribute('aria-pressed', String(prefs.contrast));
    if (msg) { live.textContent = ''; setTimeout(function () { live.textContent = msg; }, 50); }
  }
  smaller.addEventListener('click', function () { prefs.text = Math.max(0, prefs.text - 1); apply(); save(); paint('Text size ' + LABELS[prefs.text]); });
  bigger.addEventListener('click', function () { prefs.text = Math.min(MAX, prefs.text + 1); apply(); save(); paint('Text size ' + LABELS[prefs.text]); });
  contrast.addEventListener('click', function () { prefs.contrast = !prefs.contrast; apply(); save(); paint(prefs.contrast ? 'High contrast on' : 'High contrast off'); });

  var skip = document.querySelector('.skip-link');
  document.body.insertBefore(bar, skip ? skip.nextSibling : document.body.firstChild);
  paint();
})();
