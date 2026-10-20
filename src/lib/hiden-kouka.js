'use strict';

// 秘伝効果一覧（ikusei/hiden-kouka.html）の表を静的HTMLで出す（P-006 #7）。
// 正は src/data/hiden-kouka.json。ページの JS は並べ替え・絞り込みだけを行い、行は作らない。
// 初期表示は「種類別」で、JS が無くても全件が読める。

const MARKER_START = '<!-- BUILD:HIDEN-ROWS:START -->';
const MARKER_END = '<!-- BUILD:HIDEN-ROWS:END -->';
const COUNT_START = '<!-- BUILD:HIDEN-COUNT:START -->';
const COUNT_END = '<!-- BUILD:HIDEN-COUNT:END -->';

// e2/e3 の "=" は e1 と同じ意味
function effect(item, field) {
  return item[field] === '=' ? item.e1 : item[field];
}

function nb(value) {
  return value.replace(/\n/g, '<br>');
}

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 検索対象の文字列（タグを除いた本文）。行の data-search に入れ、JS は小文字にして部分一致で絞り込む
function searchText(item, cats) {
  return [item.name, item.e1, effect(item, 'e2'), effect(item, 'e3'), item.cond, item.note || '', cats[item.cat]]
    .join(' ')
    .replace(/<[^>]+>/g, '')
    .toLowerCase();
}

// 種類別の並び（ページの JS の既定と同じ：cat 順 → priCat（無ければ pri）順）
function sortByCategory(items) {
  return [...items].sort((a, b) => a.cat !== b.cat
    ? a.cat - b.cat
    : ((a.priCat ?? a.pri) - (b.priCat ?? b.pri)) || a.order - b.order);
}

function validateHidenData(data) {
  const errors = [];
  if (!Array.isArray(data.cats) || !data.cats.length) errors.push('cats がない');
  if (!Array.isArray(data.items) || !data.items.length) errors.push('items がない');
  for (const [index, item] of (data.items || []).entries()) {
    const where = `items[${index}]`;
    if (item.sep) {
      if (typeof item.text !== 'string' || !Number.isFinite(item.pri)) errors.push(`${where}: 区切りは text と pri が必要`);
      continue;
    }
    for (const field of ['name', 'yomi', 'e1', 'e2', 'e3', 'cond']) {
      if (typeof item[field] !== 'string' || !item[field]) errors.push(`${where}: ${field} がない`);
    }
    if (!Number.isInteger(item.cat) || !data.cats[item.cat]) errors.push(`${where}: cat が不正（${item.cat}）`);
    if (!Number.isFinite(item.pri)) errors.push(`${where}: pri が数値でない`);
    if (item.priCat !== undefined && !Number.isFinite(item.priCat)) errors.push(`${where}: priCat が数値でない`);
  }
  if (errors.length) throw new Error(`src/data/hiden-kouka.json が不正です:\n  ${errors.join('\n  ')}`);
}

function renderItemRow(item, cats) {
  const attrs = [
    'data-item',
    `data-order="${item.order}"`,
    `data-cat="${item.cat}"`,
    `data-pri="${item.pri}"`,
    item.priCat !== undefined ? `data-pri-cat="${item.priCat}"` : '',
    `data-yomi="${escapeAttr(item.yomi)}"`,
    `data-search="${escapeAttr(searchText(item, cats))}"`,
  ].filter(Boolean).join(' ');
  return `        <tr ${attrs}>
          <td>${item.name}${item.note ? `<div class="entry-note">${item.note}</div>` : ''}</td>
          <td>${nb(item.e1)}</td>
          <td>${nb(effect(item, 'e2'))}</td>
          <td>${nb(effect(item, 'e3'))}</td>
          <td class="cond-cell">${item.cond}</td>
        </tr>`;
}

// 種類の見出し行は全種類ぶん出し、JS が「種類別」のときだけ使う。区切り行は「優先度順」のときだけ使う（hidden で出す）
// data-order は JSON の並び。並べ替えで同点のときに元の順を保つ（以前の JS の安定ソートと同じ結果にする）
function renderHidenRows(data) {
  validateHidenData(data);
  const items = data.items.map((item, order) => ({ ...item, order }));
  const rows = [];
  let lastCat = -1;
  for (const item of sortByCategory(items.filter(item => !item.sep))) {
    if (item.cat !== lastCat) {
      rows.push(`        <tr class="cat-hd" data-cat-hd="${item.cat}"><td colspan="5">▌ ${data.cats[item.cat]}</td></tr>`);
      lastCat = item.cat;
    }
    rows.push(renderItemRow(item, data.cats));
  }
  for (const sep of items.filter(item => item.sep)) {
    rows.push(`        <tr data-sep data-order="${sep.order}" data-pri="${sep.pri}" hidden><td colspan="5" style="text-align:center;color:#aaa;font-size:12px;padding:6px;border-bottom:2px dashed #ddd;">── ${sep.text} ──</td></tr>`);
  }
  return rows.join('\n');
}

function countItems(data) {
  return data.items.filter(item => !item.sep).length;
}

function replaceBetween(source, start, end, inner, fileName) {
  const from = source.indexOf(start);
  const to = source.indexOf(end);
  if (from === -1 || to === -1 || from > to || source.indexOf(start, from + 1) !== -1 || source.indexOf(end, to + 1) !== -1) {
    throw new Error(`${fileName}: ${start} と ${end} は各1個、この順で必要です`);
  }
  return source.slice(0, from + start.length) + inner + source.slice(to);
}

function renderHidenKoukaPage(source, data, fileName = 'ikusei/hiden-kouka.html') {
  let html = replaceBetween(source, MARKER_START, MARKER_END, `\n${renderHidenRows(data)}\n        `, fileName);
  html = replaceBetween(html, COUNT_START, COUNT_END, `${countItems(data)}件 表示中`, fileName);
  return html;
}

module.exports = { renderHidenKoukaPage, renderHidenRows, validateHidenData, searchText, countItems, MARKER_START, MARKER_END };
