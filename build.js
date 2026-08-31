#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { buildAssistPages } = require('./scripts/build-assist-pages');

const REPO = __dirname;
const SITE_URL = 'https://line-monster-farm-tetteikouryaku.com';
const ROOT_PREFIX = '../../../';
const MON_TYPE_ROOT_PREFIX = '../../';
const DRY_RUN = process.argv.includes('--dry');
const INDEXABLE_THRESHOLD = 800;
const PICKUP_SLOTS = 5;
const GACHA_EXCERPT_CHARS = 140;
const GACHA_GATE_VISIBLE_CHARS = 800;
const GACHA_GATE_EXPLANATION = 300;

// モン類の表示順（公式順）。表示に関わる並びはすべてこれを使うこと。
const MON_ORDER = ['souzou', 'genrei', 'mazoku', 'kemono', 'kaibutsu', 'muki'];

// モン類アイコン。トップページの「モン類から探す」と同一。
const MON_ICONS = {
  souzou: '✨', genrei: '🐉', mazoku: '👿', kemono: '🐺', kaibutsu: '👹', muki: '💎',
};

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO, relativePath), 'utf8'));
}

function readScriptValue(relativePath, variableName) {
  const source = fs.readFileSync(path.join(REPO, relativePath), 'utf8');
  return Function(`${source}\n;return ${variableName};`)();
}

function countTaxonomyEntries(taxonomy) {
  if (!taxonomy) return { bloods: 0, monTypes: 0 };
  const bloods = taxonomy.bloods || taxonomy.blood || {};
  const monTypes = taxonomy.monTypes || taxonomy.mons || taxonomy.mon || {};
  return {
    bloods: Array.isArray(bloods) ? bloods.length : Object.keys(bloods).length,
    monTypes: Array.isArray(monTypes) ? monTypes.length : Object.keys(monTypes).length,
  };
}

function loadInputs() {
  const required = [
    'src/data/monster-ids.json',
    'src/data/monsters-editorial.json',
    'src/data/monster-images.json',
    'monsters-data.js',
    'cards/cards-data.js',
    'src/data/assist-cards.json',
    'src/data/gachas.json',
    'src/data/gacha-types.json',
    'monsters.html',
    'sitemap.xml',
  ];
  const missing = required.filter(file => !fs.existsSync(path.join(REPO, file)));
  if (missing.length) {
    throw new Error(`入力ファイルが見つかりません: ${missing.join(', ')}`);
  }

  const idsJson = readJson('src/data/monster-ids.json');
  const editorialJson = readJson('src/data/monsters-editorial.json');
  const imagesJson = readJson('src/data/monster-images.json');
  const monstersData = readScriptValue('monsters-data.js', 'monstersData');
  const cardsData = readScriptValue('cards/cards-data.js', 'cardsData');
  const assistCardsJson = readJson('src/data/assist-cards.json');
  const gachasJson = readJson('src/data/gachas.json');
  const gachaTypesJson = readJson('src/data/gacha-types.json');
  const taxonomyPath = path.join(REPO, 'src/data/taxonomy.json');
  const taxonomy = fs.existsSync(taxonomyPath) ? readJson('src/data/taxonomy.json') : null;

  const monsters = idsJson.monsters;
  const editorial = Object.values(editorialJson.monsters);
  const images = imagesJson.images;
  const ids = monsters.map(monster => monster.id);
  const idSet = new Set(ids);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const invalidIds = ids.filter(id => !/^\d{4}$/.test(id));
  const unknownEditorialIds = editorial.filter(entry => !idSet.has(entry.id)).map(entry => entry.id);
  const unknownImageIds = Object.keys(images).filter(id => !idSet.has(id));

  const errors = [];
  if (unknownEditorialIds.length) {
    errors.push(`monsters-editorial.json に未知のID: ${unknownEditorialIds.join(', ')}`);
  }
  if (unknownImageIds.length) {
    errors.push(`monster-images.json に未知のID: ${unknownImageIds.join(', ')}`);
  }
  if (duplicateIds.length) {
    errors.push(`monster-ids.json に重複ID: ${[...new Set(duplicateIds)].join(', ')}`);
  }
  if (invalidIds.length) {
    errors.push(`monster-ids.json に4桁でないID: ${invalidIds.join(', ')}`);
  }
  if (monstersData.length !== monsters.length) {
    errors.push(`monsters-data.js と monster-ids.json の件数不一致: ${monstersData.length} / ${monsters.length}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));

  const runtimeById = new Map(
    monsters.map(monster => [monster.id, monstersData[monster.arrayIndex]])
  );
  const monsterById = new Map(monsters.map(monster => [monster.id, monster]));

  return {
    idsJson,
    monsters,
    editorial,
    images,
    cardsData,
    assistCards: assistCardsJson.cards,
    gachasJson,
    gachaTypesJson,
    taxonomy,
    sitemap: fs.readFileSync(path.join(REPO, 'sitemap.xml'), 'utf8'),
    runtimeById,
    monsterById,
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// オーラ → モン類 → 限定 の順で共通バッジ行を組み立てる。
// 限定でないモンスターには限定バッジを出さない（空要素も出さない）。
function renderBadgeRow({ aura, mon = '', limitedLabel = '', small = false, indent = '' }) {
  const badges = [
    `<span class="aura-badge-lg aura-${escapeHtml(aura)}"><span class="aura-dot"></span>${escapeHtml(aura)}オーラ</span>`,
  ];
  if (mon) badges.push(`<span class="mon-badge">${escapeHtml(mon)}</span>`);
  if (limitedLabel) badges.push(`<span class="limited-badge-inline">${escapeHtml(limitedLabel)}</span>`);
  const rowClass = small ? 'badge-row badge-row--sm' : 'badge-row';
  const inner = badges.map(badge => `${indent}  ${badge}`).join('\n');
  return `<div class="${rowClass}">\n${inner}\n${indent}</div>`;
}

// 限定ラベル。限定なのにラベルが空なら「限定」を使う。
function limitedLabelOf(source) {
  if (!source || !source.limited) return '';
  return source.limitedLabel || '限定';
}

function formatExplanation(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let index = 0;
  let gap = false;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      gap = true;
      index++;
      continue;
    }

    const gapClass = gap && blocks.length ? ' class="gap"' : '';
    if (/^[・･]/.test(line)) {
      const bulletLines = [];
      while (index < lines.length && /^[・･]/.test(lines[index])) {
        bulletLines.push(lines[index].slice(1));
        index++;
      }
      if (bulletLines.length >= 2) {
        blocks.push(`<ul${gapClass}>${bulletLines.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
      } else {
        blocks.push(`<p${gapClass}>${escapeHtml(line)}</p>`);
      }
      gap = false;
      continue;
    }

    blocks.push(`<p${gapClass}>${escapeHtml(line)}</p>`);
    gap = false;
    index++;
  }

  return blocks.join('');
}

function descriptionFrom(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= 140) return normalized;
  const candidate = normalized.slice(0, 140);
  const sentenceEnd = candidate.lastIndexOf('。');
  if (sentenceEnd >= 40) return candidate.slice(0, sentenceEnd + 1);
  return candidate.slice(0, 100) + '…';
}

function visibleChars(html) {
  const withoutInvisible = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const body = withoutInvisible.match(/<body[\s\S]*?<\/body>/i);
  return (body ? body[0] : withoutInvisible)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '')
    .length;
}

function gachaExcerpt(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= GACHA_EXCERPT_CHARS) return normalized;
  return `${normalized.slice(0, GACHA_EXCERPT_CHARS)}…`;
}

function replaceMarkerBlock(source, markerName, innerHtml, commentStyle = 'html', fileName = '<source>') {
  const prefix = commentStyle === 'js' ? '// ' : '<!-- ';
  const suffix = commentStyle === 'js' ? '' : ' -->';
  const startMarker = `${prefix}GACHA:${markerName}:START${suffix}`;
  const endMarker = `${prefix}GACHA:${markerName}:END${suffix}`;
  const starts = [];
  const ends = [];
  for (let offset = source.indexOf(startMarker); offset !== -1; offset = source.indexOf(startMarker, offset + startMarker.length)) starts.push(offset);
  for (let offset = source.indexOf(endMarker); offset !== -1; offset = source.indexOf(endMarker, offset + endMarker.length)) ends.push(offset);
  if (starts.length !== 1 || ends.length !== 1) {
    throw new Error(`${fileName}: GACHA:${markerName} マーカーはSTART・END各1個が必要です（START ${starts.length} / END ${ends.length}）`);
  }
  if (starts[0] > ends[0]) throw new Error(`${fileName}: GACHA:${markerName} のSTARTがENDより後です`);
  if (innerHtml === null) return source;
  const contentStart = starts[0] + startMarker.length;
  return source.slice(0, contentStart) + `\n${innerHtml}${innerHtml ? '\n' : ''}` + source.slice(ends[0]);
}

function escapeJsSingleQuoted(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    .replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function publishedGachas(gachaDb) {
  return gachaDb.gachas.filter(gacha => gacha.status === 'published');
}

function currentGachas(gachas, now) {
  const timestamp = Date.parse(now);
  return gachas.filter(gacha => Date.parse(gacha.startAt) <= timestamp && timestamp <= Date.parse(gacha.endAt))
    .sort((a, b) => b.startAt.localeCompare(a.startAt) || a.gachaId.localeCompare(b.gachaId));
}

function selectRerollGacha(gachas, now) {
  const candidates = currentGachas(gachas, now);
  if (!candidates.length) return null;
  const priority = candidates.filter(gacha => gacha.rerollPriority === true);
  return (priority.length ? priority : candidates)[0];
}

// トップのピックアップ枠。セクションの器ごとマーカー内へ出力し、
// 対象0件のときは何も出力しない（セクションごと消える）。
function renderTopPickupSection(title, body) {
  return `  <div class="section">\n    <div class="section-title">${title}</div>\n${body}\n  </div>`;
}

const TOP_PICKUP_EMPTY = '    <p>現在開催中のガチャはありません。<a href="gacha/">ガチャ一覧を見る</a></p>';

function renderTopMonsterPickups(gachas, context) {
  const title = '現在のピックアップモンスター一覧';
  if (!gachas.length) return renderTopPickupSection(title, TOP_PICKUP_EMPTY);
  const blocks = gachas.filter(gacha => gacha.pickupMonsters.length).map(gacha => `    <h3 class="pickup-gacha-title">${escapeHtml(gacha.name)}</h3>\n    <div class="card-grid wide-grid">\n${gacha.pickupMonsters.map(pickup => {
    const monster = context.monstersById.get(pickup.id);
    const editorial = context.editorialById.get(pickup.id);
    const image = gachaMonsterImage(monster);
    const excerpt = gachaExcerpt(editorial && editorial.explanation);
    return `      <a href="${escapeHtml(String(monster.url).replace(/^\//, ''))}" class="card wide-card">\n${image ? `        <img class="card-img" src="${escapeHtml(image)}" alt="${escapeHtml(monster.name)}">\n` : ''}        <div class="card-info">\n          <div class="card-name">${escapeHtml(monster.name)}</div>\n          ${renderBadgeRow({ aura: monster.aura, mon: monster.mon, limitedLabel: limitedLabelOf(monster), small: true, indent: '          ' })}${excerpt ? `\n          <div class="wide-card-excerpt">${escapeHtml(excerpt)}</div>` : ''}\n        </div>\n      </a>`;
  }).join('\n')}\n    </div>`);
  if (!blocks.length) return '';
  return renderTopPickupSection(title, blocks.join('\n'));
}

function renderTopCardPickups(gachas, context) {
  const title = '現在のピックアップアシストカード一覧';
  if (!gachas.length) return renderTopPickupSection(title, TOP_PICKUP_EMPTY);
  const blocks = gachas.filter(gacha => gacha.pickupCards.length).map(gacha => `    <h3 class="pickup-gacha-title">${escapeHtml(gacha.name)}</h3>\n    <div class="card-grid wide-grid">\n${gacha.pickupCards.map(pickup => {
    const card = context.cardsById.get(pickup.cardId);
    const excerpt = gachaExcerpt(card.explanation);
    return `      <a href="cards/${escapeHtml(card.cardId)}.html" class="card wide-card">\n        <img class="card-img" src="${escapeHtml(card.image)}" alt="${escapeHtml(card.name)}">\n        <div class="card-info">\n          <div class="card-name">${escapeHtml(card.name)}</div>\n          <span class="rarity rarity-${escapeHtml(card.rarity)}">${escapeHtml(card.rarity)}</span>${excerpt ? `\n          <div class="wide-card-excerpt">${escapeHtml(excerpt)}</div>` : ''}\n        </div>\n      </a>`;
  }).join('\n')}\n    </div>`);
  if (!blocks.length) return '';
  return renderTopPickupSection(title, blocks.join('\n'));
}

function renderGachaUpdates(gachas, context) {
  return [...gachas].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.gachaId.localeCompare(b.gachaId)).map(gacha => {
    const names = gacha.pickupMonsters.map(item => context.monstersById.get(item.id).name)
      .concat(gacha.pickupCards.map(item => context.cardsById.get(item.cardId).name));
    const text = `ガチャ更新：${gacha.name}のピックアップ${names.length ? `（${names.join('・')}）` : ''}情報を掲載`;
    return `['${escapeJsSingleQuoted(gacha.publishedAt.replace(/-/g, '.'))}', a('gacha/${escapeJsSingleQuoted(gacha.gachaId)}.html','${escapeJsSingleQuoted(text)}')],`;
  }).join('\n');
}

function renderReroll(gacha, context) {
  const cards = gacha.pickupCards.map((pickup, index) => {
    const card = context.cardsById.get(pickup.cardId);
    return `    <a href="cards/${escapeHtml(card.cardId)}.html" class="rank-row">\n      <div class="rank-num${index === 0 ? ' gold' : ''}">${index + 1}</div>\n      <img class="rank-img" src="${escapeHtml(card.image)}" alt="${escapeHtml(card.name)}">\n      <div class="rank-info">\n        <div class="rank-name">${escapeHtml(card.name)} <span class="rarity rarity-${escapeHtml(card.rarity)}" style="font-size:11px;padding:1px 6px;">${escapeHtml(card.rarity)}</span></div>\n        <div class="rank-reason">${escapeHtml(gachaExcerpt(card.explanation))}</div>\n      </div>\n      <div class="rank-arrow">›</div>\n    </a>`;
  }).join('\n\n');
  return `    <h3>${escapeHtml(gacha.name)}</h3>\n    <p>開催期間: ${escapeHtml(formatGachaPeriod(gacha.startAt))} ～ ${escapeHtml(formatGachaPeriod(gacha.endAt))} ／ <a href="gacha/${escapeHtml(gacha.gachaId)}.html">ガチャ詳細を見る</a></p>${cards ? `\n\n${cards}` : ''}\n\n    <div class="expl-body">${formatExplanation(gacha.explanation)}</div>`;
}

function renderGachaAppearances(gachas, kind, id, rootPrefix) {
  const matched = gachas.filter(gacha => (kind === 'monster' ? gacha.pickupMonsters : gacha.pickupCards)
    .some(pickup => (kind === 'monster' ? pickup.id : pickup.cardId) === id))
    .sort((a, b) => b.startAt.localeCompare(a.startAt) || a.gachaId.localeCompare(b.gachaId));
  if (!matched.length) return '';
  return `\n  <section class="section">\n    <h2 class="section-title">登場ガチャ</h2>\n    <div class="menu-grid">\n${matched.map(gacha => `      <a class="menu-link" href="${rootPrefix}gacha/${escapeHtml(gacha.gachaId)}.html">${escapeHtml(gacha.name)}</a>`).join('\n')}\n    </div>\n  </section>\n`;
}

function validJstTimestamp(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})\+09:00$/);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const numbers = match.slice(1).map(Number);
  const local = new Date(Date.UTC(numbers[0], numbers[1] - 1, numbers[2], numbers[3], numbers[4]));
  return local.getUTCFullYear() === numbers[0]
    && local.getUTCMonth() + 1 === numbers[1]
    && local.getUTCDate() === numbers[2]
    && local.getUTCHours() === numbers[3]
    && local.getUTCMinutes() === numbers[4];
}

function validateGachaData({ root = REPO, gachaDb, typeDb, monsterDb, cardDb }) {
  const issues = [];
  if (!gachaDb || gachaDb.schemaVersion == null || !Array.isArray(gachaDb.gachas)) {
    issues.push('gachas.jsonのschemaVersionまたはgachas配列が不正');
  }
  if (!typeDb || typeDb.schemaVersion == null || !Array.isArray(typeDb.types)) {
    issues.push('gacha-types.jsonのschemaVersionまたはtypes配列が不正');
  }
  if (issues.length) return issues;

  const monsters = Array.isArray(monsterDb) ? monsterDb : [];
  const cards = Array.isArray(cardDb) ? cardDb : [];
  const monsterIds = new Set(monsters.map(monster => monster.id));
  const cardIds = new Set(cards.map(card => card.cardId));
  const types = new Set(typeDb.types);
  const ids = gachaDb.gachas.map(gacha => gacha && gacha.gachaId);
  const duplicateIds = new Set(ids.filter((id, index) => ids.indexOf(id) !== index));

  for (const gacha of gachaDb.gachas) {
    const label = gacha && gacha.gachaId ? gacha.gachaId : '<gachaIdなし>';
    if (!gacha || !/^\d{8}-\d+$/.test(String(gacha.gachaId || ''))) {
      issues.push(`${label}: gachaId形式が不正`);
      continue;
    }
    if (duplicateIds.has(gacha.gachaId)) issues.push(`${label}: gachaIdが重複`);
    if (!validJstTimestamp(gacha.startAt)) issues.push(`${label}: startAtがJST日時でない`);
    if (!validJstTimestamp(gacha.endAt)) issues.push(`${label}: endAtがJST日時でない`);
    if (Number.isFinite(Date.parse(gacha.startAt)) && Number.isFinite(Date.parse(gacha.endAt))
        && Date.parse(gacha.startAt) >= Date.parse(gacha.endAt)) {
      issues.push(`${label}: startAtがendAtより前でない`);
    }
    if (!types.has(gacha.gachaType)) issues.push(`${label}: gachaTypeがマスタにない`);
    const pickupMonsters = Array.isArray(gacha.pickupMonsters) ? gacha.pickupMonsters : [];
    const pickupCards = Array.isArray(gacha.pickupCards) ? gacha.pickupCards : [];
    if (!Array.isArray(gacha.pickupMonsters)) issues.push(`${label}: pickupMonstersが配列でない`);
    if (!Array.isArray(gacha.pickupCards)) issues.push(`${label}: pickupCardsが配列でない`);
    if (pickupMonsters.length > PICKUP_SLOTS) issues.push(`${label}: pickupMonstersが${PICKUP_SLOTS}枠を超過`);
    if (pickupCards.length > PICKUP_SLOTS) issues.push(`${label}: pickupCardsが${PICKUP_SLOTS}枠を超過`);
    for (const pickup of pickupMonsters) {
      if (!pickup || !monsterIds.has(pickup.id)) issues.push(`${label}: 未知のモンスターID ${pickup && pickup.id}`);
      if (!pickup || typeof pickup.rate !== 'number' || !Number.isFinite(pickup.rate)
          || pickup.rate <= 0 || pickup.rate > 100) {
        issues.push(`${label}: モンスター排出率が0超100以下の数値でない`);
      }
    }
    for (const pickup of pickupCards) {
      if (!pickup || !cardIds.has(pickup.cardId)) issues.push(`${label}: 未知のcardId ${pickup && pickup.cardId}`);
      if (!pickup || typeof pickup.rate !== 'number' || !Number.isFinite(pickup.rate)
          || pickup.rate <= 0 || pickup.rate > 100) {
        issues.push(`${label}: カード排出率が0超100以下の数値でない`);
      }
    }
    if (typeof gacha.image !== 'string'
        || !/^gacha-banner\/[A-Za-z0-9._-]+\.(jpg|png|webp)$/i.test(gacha.image)
        || !fs.existsSync(path.join(root, gacha.image))) {
      issues.push(`${label}: imageがgacha-banner/に実在しない`);
    }
    if (gacha.status === 'published' && !String(gacha.publishedAt || '').trim()) {
      issues.push(`${label}: publishedなのにpublishedAtが空`);
    }
  }
  return issues;
}

function formatGachaPeriod(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})\+09:00$/);
  if (!match) return String(value || '');
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日 ${match[4]}:${match[5]}`;
}

function gachaStartLabel(value) {
  const match = String(value || '').match(/^\d{4}-(\d{2})-(\d{2})T/);
  return match ? `${Number(match[1])}月${Number(match[2])}日開始` : '開始前';
}

function gachaMonsterImage(monster) {
  if (monster.localImg) return `monster/${monster.localImg}`;
  return String(monster.image || '').replace(/^img\/monster\//, 'monster/');
}

function renderGachaPickupMonster(pickup, monster, editorial, root) {
  const excerpt = gachaExcerpt(editorial && editorial.explanation);
  const detailPath = String(monster.url || '').replace(/^\//, '');
  const hasDetail = detailPath && fs.existsSync(path.join(root, detailPath));
  const image = gachaMonsterImage(monster);
  return `      <article class="card">
        ${image ? `<img class="card-img" src="../${escapeHtml(image)}" alt="${escapeHtml(monster.name)}">` : ''}
        <div class="card-info">
          <h3 class="card-name">${escapeHtml(monster.name)}</h3>
          <p>${escapeHtml(monster.aura)}オーラ / ${escapeHtml(monster.mon)} / ${escapeHtml(monster.blood)}（副血統: ${escapeHtml(monster.subBlood)}）</p>
          <p>排出率 ${escapeHtml(pickup.rate)}%</p>
          ${excerpt ? `<p data-gacha-excerpt>${escapeHtml(excerpt)}</p>` : ''}
          ${hasDetail ? `<p><a href="../${escapeHtml(detailPath)}">モンスター詳細を見る</a></p>` : ''}
        </div>
      </article>`;
}

function renderGachaPickupCard(pickup, card) {
  const excerpt = gachaExcerpt(card.explanation);
  return `      <article class="card">
        <img class="card-img" src="../${escapeHtml(card.image)}" alt="${escapeHtml(card.name)}">
        <div class="card-info">
          <h3 class="card-name">${escapeHtml(card.name)}</h3>
          <p>${escapeHtml(card.rarity)} / ${escapeHtml(card.aura)}オーラ / ${escapeHtml(card.cardType)}</p>
          <p>排出率 ${escapeHtml(pickup.rate)}%</p>
          ${excerpt ? `<p data-gacha-excerpt>${escapeHtml(excerpt)}</p>` : ''}
          <p><a href="../cards/${escapeHtml(card.cardId)}.html">カード詳細を見る</a></p>
        </div>
      </article>`;
}

function renderGachaBody(gacha, context, includeExcerpts = true) {
  const monsterCards = gacha.pickupMonsters.map(pickup => {
    const monster = context.monstersById.get(pickup.id);
    const editorial = context.editorialById.get(pickup.id);
    const html = renderGachaPickupMonster(pickup, monster, editorial, context.root);
    return includeExcerpts ? html : html.replace(/\s*<p data-gacha-excerpt>[\s\S]*?<\/p>/, '');
  }).join('\n');
  const assistCards = gacha.pickupCards.map(pickup => {
    const card = context.cardsById.get(pickup.cardId);
    const html = renderGachaPickupCard(pickup, card);
    return includeExcerpts ? html : html.replace(/\s*<p data-gacha-excerpt>[\s\S]*?<\/p>/, '');
  }).join('\n');
  const explanation = String(gacha.explanation || '').trim()
    ? `\n  <section class="section"><h2 class="section-title">ガチャ解説</h2><div class="expl-body">${formatExplanation(gacha.explanation)}</div></section>`
    : '';
  return `<body>
<header><div class="header-inner"><a href="../index.html" class="logo">LINE<span>モンスターファーム</span>徹底攻略</a><nav><a href="../index.html">トップ</a><a href="index.html">ガチャ一覧</a></nav></div></header>
<main class="container">
  <p class="page-breadcrumb"><a href="../index.html">トップ</a> &gt; <a href="index.html">ガチャ一覧</a> &gt; ${escapeHtml(gacha.name)}</p>
  <h1 class="page-title">${escapeHtml(gacha.name)}</h1>
  <section class="section">
    <img class="card-img" src="../${escapeHtml(gacha.image)}" alt="${escapeHtml(gacha.name)}">
    <p>種別: ${escapeHtml(gacha.gachaType)}</p>
    <p>開催期間: ${escapeHtml(formatGachaPeriod(gacha.startAt))} ～ ${escapeHtml(formatGachaPeriod(gacha.endAt))}</p>
  </section>${explanation}
  <section class="section"><h2 class="section-title">ピックアップモンスター</h2><div class="card-grid">
${monsterCards}
  </div></section>
  <section class="section"><h2 class="section-title">ピックアップアシストカード</h2><div class="card-grid">
${assistCards}
  </div></section>
  <section class="section"><h2 class="section-title">関連リンク</h2><div class="menu-grid"><a class="menu-link" href="index.html">ガチャ一覧へ戻る</a></div></section>
</main>
<footer>&copy; 2026 LINEモンスターファーム徹底攻略 ／ 非公式ファンサイト ／ <a href="../privacy.html">プライバシーポリシー</a></footer>
</body>`;
}

function renderGachaDetail(gacha, context) {
  const body = renderGachaBody(gacha, context, true);
  const bodyWithoutExcerpts = renderGachaBody(gacha, context, false);
  const contentCharacters = visibleChars(body);
  const templateCharacters = visibleChars(bodyWithoutExcerpts);
  const explanationCharacters = String(gacha.explanation || '').trim().length;
  const indexable = contentCharacters >= GACHA_GATE_VISIBLE_CHARS
    && explanationCharacters >= GACHA_GATE_EXPLANATION;
  const descriptionSource = String(gacha.explanation || '').trim()
    || `${gacha.name}のピックアップモンスターとアシストカード、排出率、開催期間を掲載しています。`;
  const description = descriptionFrom(descriptionSource);
  const robotsMeta = indexable ? '' : '\n  <meta name="robots" content="noindex,follow">';
  const adsense = indexable
    ? '\n  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7841397391542171" crossorigin="anonymous"></script>'
    : '';
  const canonical = `${SITE_URL}/gacha/${gacha.gachaId}.html`;
  const html = `<!-- このファイルは build.js が自動生成しています。直接編集しないでください。 -->
<!-- 元データ: src/data/gachas.json -->
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(gacha.name)} | LINEモンスターファーム徹底攻略</title>
  <meta name="description" content="${escapeHtml(description)}">${robotsMeta}
  <link rel="canonical" href="${canonical}">
  <link rel="stylesheet" href="../style.css">${adsense}
</head>
${body}
</html>
`;
  return {
    html,
    indexable,
    contentCharacters,
    templateCharacters,
    excerptCharacters: contentCharacters - templateCharacters,
    canonical,
    description,
  };
}

function renderGachaIndex(gachas, now) {
  const current = [];
  const ended = [];
  for (const gacha of [...gachas].sort((a, b) => b.startAt.localeCompare(a.startAt) || a.gachaId.localeCompare(b.gachaId))) {
    (Date.parse(now) <= Date.parse(gacha.endAt) ? current : ended).push(gacha);
  }
  const rows = list => list.map(gacha => {
    const preStart = Date.parse(now) < Date.parse(gacha.startAt) ? ` / ${gachaStartLabel(gacha.startAt)}` : '';
    return `      <article class="card"><a href="${escapeHtml(gacha.gachaId)}.html"><img class="card-img" src="../${escapeHtml(gacha.image)}" alt="${escapeHtml(gacha.name)}"><div class="card-info"><h3 class="card-name">${escapeHtml(gacha.name)}</h3><p>${escapeHtml(gacha.gachaType)}${escapeHtml(preStart)}</p><p>${escapeHtml(formatGachaPeriod(gacha.startAt))} ～ ${escapeHtml(formatGachaPeriod(gacha.endAt))}</p></div></a></article>`;
  }).join('\n');
  const section = (title, list) => list.length
    ? `\n  <section class="section"><h2 class="section-title">${title}</h2><div class="card-grid">\n${rows(list)}\n  </div></section>`
    : '';
  return `<!-- このファイルは build.js が自動生成しています。直接編集しないでください。 -->
<!-- 元データ: src/data/gachas.json -->
<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ガチャ一覧 | LINEモンスターファーム徹底攻略</title>
  <meta name="description" content="開催中と終了済みのガチャ、ピックアップ内容、開催期間を一覧で確認できます。">
  <link rel="canonical" href="${SITE_URL}/gacha/"><link rel="stylesheet" href="../style.css">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7841397391542171" crossorigin="anonymous"></script>
</head><body><header><div class="header-inner"><a href="../index.html" class="logo">LINE<span>モンスターファーム</span>徹底攻略</a></div></header>
<main class="container"><p class="page-breadcrumb"><a href="../index.html">トップ</a> &gt; ガチャ一覧</p><h1 class="page-title">ガチャ一覧</h1>${section('開催中', current)}${section('終了', ended)}</main>
<footer>&copy; 2026 LINEモンスターファーム徹底攻略 ／ 非公式ファンサイト ／ <a href="../privacy.html">プライバシーポリシー</a></footer></body></html>
`;
}

function writeIfChangedAt(outputRoot, relativePath, html, dryRun) {
  const absolutePath = path.join(outputRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    if (!dryRun) {
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, html);
    }
    return 'new';
  }
  if (fs.readFileSync(absolutePath, 'utf8') === html) return 'unchanged';
  if (!dryRun) fs.writeFileSync(absolutePath, html);
  return 'updated';
}

function buildGachaPages({
  root = REPO,
  outputRoot = root,
  dryRun = false,
  now,
  gachaDb,
  typeDb,
  monsterDb,
  editorialDb = [],
  cardDb,
  indexSource = null,
  rerollSource = null,
}) {
  const issues = validateGachaData({ root, gachaDb, typeDb, monsterDb, cardDb });
  if (issues.length) throw new Error(`ガチャDB検査FAIL:\n${issues.join('\n')}`);
  if (indexSource !== null) {
    replaceMarkerBlock(indexSource, 'UPDATES', null, 'js', 'index.html');
    replaceMarkerBlock(indexSource, 'PICKUP:MONSTER', null, 'html', 'index.html');
    replaceMarkerBlock(indexSource, 'PICKUP:CARD', null, 'html', 'index.html');
    replaceMarkerBlock(indexSource, 'NAV', null, 'html', 'index.html');
  }
  if (rerollSource !== null) replaceMarkerBlock(rerollSource, 'REROLL', null, 'html', 'reroll.html');
  const published = publishedGachas(gachaDb);
  if (!published.length) return { pages: [], sitemapPages: [], outputs: [], indexHtml: null };
  if (!now || !Number.isFinite(Date.parse(now))) throw new Error('ガチャ一覧生成には有効な基準時刻 now が必要です');
  const context = {
    root,
    monstersById: new Map(monsterDb.map(monster => [monster.id, monster])),
    editorialById: new Map(editorialDb.map(entry => [entry.id, entry])),
    cardsById: new Map(cardDb.map(card => [card.cardId, card])),
  };
  const pages = published.map(gacha => {
    const rendered = renderGachaDetail(gacha, context);
    return {
      ...rendered,
      gachaId: gacha.gachaId,
      path: `gacha/${gacha.gachaId}.html`,
      priority: '0.7',
    };
  });
  const indexHtml = renderGachaIndex(published, now);
  const outputs = pages.map(page => ({ path: page.path, state: writeIfChangedAt(outputRoot, page.path, page.html, dryRun) }));
  outputs.push({ path: 'gacha/index.html', state: writeIfChangedAt(outputRoot, 'gacha/index.html', indexHtml, dryRun) });
  const active = currentGachas(published, now);
  let integratedIndex = indexSource;
  let integratedReroll = rerollSource;
  if (indexSource !== null) {
    integratedIndex = replaceMarkerBlock(integratedIndex, 'UPDATES', renderGachaUpdates(published, context), 'js', 'index.html');
    integratedIndex = replaceMarkerBlock(integratedIndex, 'PICKUP:MONSTER', renderTopMonsterPickups(active, context), 'html', 'index.html');
    integratedIndex = replaceMarkerBlock(integratedIndex, 'PICKUP:CARD', renderTopCardPickups(active, context), 'html', 'index.html');
    integratedIndex = replaceMarkerBlock(integratedIndex, 'NAV', '      <a href="gacha/" class="menu-link">\n        <span class="icon">🎰</span> ガチャ一覧\n      </a>', 'html', 'index.html');
    outputs.push({ path: 'index.html', state: writeIfChangedAt(outputRoot, 'index.html', integratedIndex, dryRun) });
  }
  const rerollGacha = selectRerollGacha(published, now);
  if (rerollSource !== null && rerollGacha) {
    integratedReroll = replaceMarkerBlock(integratedReroll, 'REROLL', renderReroll(rerollGacha, context), 'html', 'reroll.html');
    outputs.push({ path: 'reroll.html', state: writeIfChangedAt(outputRoot, 'reroll.html', integratedReroll, dryRun) });
  }
  return {
    pages,
    indexHtml,
    integratedIndex,
    integratedReroll,
    rerollGacha,
    outputs,
    sitemapPages: [
      { canonical: `${SITE_URL}/gacha/`, priority: '0.6' },
      ...pages.filter(page => page.indexable).map(page => ({ canonical: page.canonical, priority: page.priority })),
    ],
  };
}

function createDetailEntries(inputs) {
  const editorialById = new Map(inputs.editorial.map(entry => [entry.id, entry]));
  return inputs.monsters.map(monster => {
    return editorialById.get(monster.id) || {
      id: monster.id,
      name: monster.name,
      explanation: '',
      explanationLength: 0,
      formations: [],
    };
  });
}

function resolveBuildNow() {
  return process.env.GACHA_BUILD_NOW || new Date().toISOString();
}

function gateMonTypes(inputs) {
  const taxonomyMonTypes = inputs.taxonomy && inputs.taxonomy.monTypes
    ? inputs.taxonomy.monTypes
    : {};
  const monTypeNames = new Map(
    inputs.monsters.map(monster => [monster.monSlug, monster.mon])
  );

  return MON_ORDER.map(slug => {
    const name = monTypeNames.get(slug) || slug;
    const entry = taxonomyMonTypes[slug];
    const reasons = [];
    if (!entry) {
      reasons.push('taxonomy.json にデータがありません');
      return { slug, name, entry: null, totalLength: 0, reasons, eligible: false };
    }

    const sections = Array.isArray(entry.sections) ? entry.sections : [];
    if (sections.length !== 3) {
      reasons.push(`sections が${sections.length}件。3件必要`);
    }
    sections.forEach((section, index) => {
      const items = Array.isArray(section.items) ? section.items : [];
      if (!items.length) reasons.push(`section ${index + 1} の items が0件。1件以上必要`);
    });
    const totalLength = sections.reduce((sectionTotal, section) => {
      const items = Array.isArray(section.items) ? section.items : [];
      return sectionTotal + items.reduce((itemTotal, item) => {
        return itemTotal + String(item.subheading || '').length + String(item.body || '').length;
      }, 0);
    }, 0);
    if (totalLength < 400) {
      reasons.push(`合計${totalLength}字。400字必要。${400 - totalLength}字不足`);
    }
    return {
      slug,
      name: entry.name || name,
      entry,
      totalLength,
      reasons,
      eligible: reasons.length === 0,
    };
  });
}

function createBuildContext(inputs, eligibleMonTypes) {
  const eligibleMonSlugs = new Set(eligibleMonTypes.map(monType => monType.slug));
  const generatedPaths = new Set([
    ...inputs.monsters.map(monster => monster.url.replace(/^\//, '')),
    ...eligibleMonTypes.map(monType => `monsters/${monType.slug}/index.html`),
  ]);
  const skippedEmptyFormations = inputs.editorial.flatMap(entry => {
    const monster = inputs.monsterById.get(entry.id);
    return (entry.formations || [])
      .filter(isEmptyFormation)
      .map(formation => ({
        id: entry.id,
        name: monster.name,
        title: formation.title || 'おすすめ編成',
      }));
  });
  return {
    ...inputs,
    eligibleMonSlugs,
    eligibleMonTypes,
    editorialById: new Map(inputs.editorial.map(entry => [entry.id, entry])),
    indexableDetailIds: new Set(),
    generatedPaths,
    fallbackImages: new Map(),
    missingCardIds: new Set(),
    skippedEmptyFormations,
    linkTargets: [],
  };
}

function resolveImage(id, context, rootPrefix = ROOT_PREFIX) {
  const runtime = context.runtimeById.get(id);
  if (runtime && runtime.localImg) {
    return {
      url: `${rootPrefix}monster/${runtime.localImg}`,
      filename: path.basename(runtime.localImg),
      source: 'localImg',
    };
  }
  if (context.images[id]) {
    return {
      url: `${rootPrefix}monster/${context.images[id]}`,
      filename: path.basename(context.images[id]),
      source: 'assignments',
    };
  }
  if (runtime && runtime.gwImg) {
    const monster = context.monsterById.get(id);
    context.fallbackImages.set(id, monster ? monster.name : id);
    return {
      url: `https://img.gamewith.jp/article_tools/monsterfarm-line/gacha/Lmonfar_monster_${runtime.gwImg}.png`,
      filename: null,
      source: 'gamewith',
    };
  }
  return { url: null, filename: null, source: null };
}

// releasedAt を比較用キーへ正規化する。YYYY-MM はその月の01日、
// 空・不正は '' として最後尾に回す。
function releasedAtKey(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}$/.test(text)) return `${text}-01`;
  return '';
}

function renderMonsterCards(context) {
  // 第1キー: releasedAt 降順（空は最後尾） / 第2キー: arrayIndex 昇順
  const sortedMonsters = context.monsters
    .map(monster => ({
      monster,
      runtime: context.runtimeById.get(monster.id),
      releasedKey: releasedAtKey((context.editorialById.get(monster.id) || {}).releasedAt),
    }))
    .sort((a, b) => {
      if (a.releasedKey !== b.releasedKey) {
        if (!a.releasedKey) return 1;
        if (!b.releasedKey) return -1;
        return b.releasedKey.localeCompare(a.releasedKey);
      }
      return a.monster.arrayIndex - b.monster.arrayIndex;
    });

  return sortedMonsters.map(({ monster, runtime }) => {
    const image = resolveImage(monster.id, context, '').url;
    const aura = runtime ? runtime.aura : monster.aura;
    const mon = runtime && runtime.mon ? runtime.mon : monster.mon;
    const limited = runtime ? !!runtime.limited : !!monster.limited;
    const href = monster.url.replace(/^\//, '');
    return `    <a class="monster-card" href="${escapeHtml(href)}"
       data-aura="${escapeHtml(aura)}" data-limited="${limited ? '1' : '0'}" data-mon="${escapeHtml(mon)}"
       style="text-decoration:none;color:inherit;display:block;">
      <div class="monster-img-wrap">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(monster.name)}" loading="lazy">` : ''}${limited ? '\n        <span class="badge-limited">限定</span>' : ''}
      </div>
      <div class="monster-info">
        <div class="monster-name">${escapeHtml(monster.name)}</div>
        ${renderBadgeRow({ aura, limitedLabel: limitedLabelOf(runtime), small: true, indent: '        ' })}
      </div>
    </a>`;
  }).join('\n');
}

function renderMonsterIndex(source, context) {
  const startMarker = '    <!-- BUILD:MONSTER-CARDS:START -->';
  const endMarker = '    <!-- BUILD:MONSTER-CARDS:END -->';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error('monsters.html のモンスターカード生成マーカーが見つかりません');
  }
  if (source.indexOf(startMarker, start + startMarker.length) !== -1
      || source.indexOf(endMarker, end + endMarker.length) !== -1) {
    throw new Error('monsters.html のモンスターカード生成マーカーが重複しています');
  }
  const cards = renderMonsterCards(context);
  const withCards = source.slice(0, start + startMarker.length)
    + `\n${cards}\n`
    + source.slice(end);
  return renderMonsterCount(withCards, context.monsters.length);
}

// 説明文中のモンスター総数を実数へ差し替える。
function renderMonsterCount(source, count) {
  const startMarker = '<!-- BUILD:MONSTER-COUNT:START -->';
  const endMarker = '<!-- BUILD:MONSTER-COUNT:END -->';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error('monsters.html のモンスター総数マーカーが見つかりません');
  }
  if (source.indexOf(startMarker, start + startMarker.length) !== -1
      || source.indexOf(endMarker, end + endMarker.length) !== -1) {
    throw new Error('monsters.html のモンスター総数マーカーが重複しています');
  }
  return source.slice(0, start + startMarker.length) + String(count) + source.slice(end);
}

function renderRedirectMap(monsters) {
  const entries = [...monsters]
    .sort((a, b) => a.arrayIndex - b.arrayIndex)
    .map(monster => {
      const destination = monster.url.replace(/^\/monsters\//, '');
      return `  ${JSON.stringify(String(monster.arrayIndex))}: ${JSON.stringify(destination)}`;
    });
  return `/* このファイルは build.js が自動生成しています。直接編集しないでください。 */
window.LMF_REDIRECT_MAP = {
${entries.join(',\n')}
};
`;
}

function addLink(context, target) {
  context.linkTargets.push(target);
}

function rootLink(context, file, label, rootPrefix = ROOT_PREFIX) {
  addLink(context, file);
  return `<a href="${rootPrefix}${file}">${escapeHtml(label)}</a>`;
}

function detailLink(context, monster, label) {
  const target = monster.url.replace(/^\//, '');
  addLink(context, target);
  return `<a href="${monster.id}.html">${escapeHtml(label)}</a>`;
}

function breadcrumbJson(monster, context) {
  const itemListElement = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'LINEモンスターファーム徹底攻略',
      item: `${SITE_URL}/`,
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'モンスター一覧',
      item: `${SITE_URL}/monsters.html`,
    },
  ];
  if (context.eligibleMonSlugs.has(monster.monSlug)) {
    itemListElement.push({
      '@type': 'ListItem',
      position: 3,
      name: monster.mon,
      item: `${SITE_URL}/monsters/${monster.monSlug}/`,
    });
  }
  itemListElement.push({
    '@type': 'ListItem',
    position: itemListElement.length + 1,
    name: monster.name,
    item: `${SITE_URL}${monster.url}`,
  });
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement,
  });
}

function hasAuthoredExplanation(entry) {
  return Boolean(String(entry.author || '').trim() && String(entry.explanation || '').trim());
}

function formatJapaneseDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

function relativeAuthorUrl(authorUrl) {
  const value = String(authorUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//.test(value)) return value;
  return `${ROOT_PREFIX}${value.replace(/^\//, '')}`;
}

function absoluteAuthorUrl(authorUrl) {
  const value = String(authorUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//.test(value)) return value;
  return `${SITE_URL}/${value.replace(/^\//, '')}`;
}

function renderByline(entry) {
  if (!hasAuthoredExplanation(entry)) return '';
  const authorUrl = relativeAuthorUrl(entry.authorUrl);
  const author = authorUrl
    ? `<a href="${escapeHtml(authorUrl)}">${escapeHtml(String(entry.author).trim())}</a>`
    : escapeHtml(String(entry.author).trim());
  const contributors = Array.isArray(entry.contributors)
    ? entry.contributors.map(name => String(name || '').trim()).filter(Boolean)
    : [];
  const createdAt = formatJapaneseDate(entry.createdAt);
  const updatedAt = formatJapaneseDate(entry.updatedAt);
  const contributorText = contributors.length
    ? `（加筆：${contributors.map(escapeHtml).join('・')}）`
    : '';
  const dateText = updatedAt
    ? ` ／ ${createdAt ? `${createdAt} 公開・` : ''}${updatedAt} 更新`
    : '';
  return `<p class="byline">著者：${author}${contributorText}${dateText}</p>`;
}

function articleJson(monster, entry) {
  if (!hasAuthoredExplanation(entry)) return '';
  const author = {
    '@type': 'Person',
    name: String(entry.author).trim(),
  };
  const authorUrl = absoluteAuthorUrl(entry.authorUrl);
  if (authorUrl) author.url = authorUrl;

  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${monster.name}（${monster.blood}・${monster.mon}）`,
    author,
  };
  const contributors = Array.isArray(entry.contributors)
    ? entry.contributors.map(name => String(name || '').trim()).filter(Boolean)
    : [];
  if (contributors.length) {
    article.contributor = contributors.map(name => ({ '@type': 'Person', name }));
  }
  if (entry.createdAt) article.datePublished = entry.createdAt;
  if (entry.updatedAt) article.dateModified = entry.updatedAt;
  article.publisher = {
    '@type': 'Organization',
    name: 'LINEモンスターファーム徹底攻略',
  };
  article.mainEntityOfPage = `${SITE_URL}${monster.url}`;
  return JSON.stringify(article).replace(/</g, '\\u003c');
}

function monTypeBreadcrumbJson(monType) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'LINEモンスターファーム徹底攻略',
        item: `${SITE_URL}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'モンスター一覧',
        item: `${SITE_URL}/monsters.html`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: monType.name,
        item: `${SITE_URL}/monsters/${monType.slug}/`,
      },
    ],
  });
}

function renderFormationCard(id, context) {
  const card = id ? context.cardsData[id] : null;
  if (!card) {
    if (id) context.missingCardIds.add(id);
    return `<div class="f-card"><div class="f-card-placeholder">？</div><div class="f-card-name">${escapeHtml(id || '未設定')}</div></div>`;
  }
  return `<div class="f-card">
            <img src="${ROOT_PREFIX}assist-cards/${escapeHtml(id)}.${escapeHtml(card.ext)}" alt="${escapeHtml(card.name)}">
            <div class="f-card-name">${escapeHtml(card.name)}</div>
          </div>`;
}

function renderFormation(formation, context) {
  const cards = Array.from({ length: 5 }, (_, index) => {
    return (formation.cards || [])[index] || '';
  });
  return `<div class="formation-item">
        <div class="formation-item-name">${escapeHtml(formation.title || 'おすすめ編成')}</div>
        <div class="formation-row">
          <div class="formation-deck-cards">
            ${cards.map(id => renderFormationCard(id, context)).join('\n            ')}
          </div>
          <div class="rental-sep">
            <div class="rental-sep-line"></div>
            <div class="rental-sep-label">レンタル</div>
          </div>
          ${renderFormationCard(formation.rental || '', context)}
        </div>
      </div>`;
}

function isEmptyFormation(formation) {
  const cards = formation.cards || [];
  return cards.every(id => !id) && !formation.rental;
}

function relatedMonsters(monster, context) {
  const sameBlood = context.monsters
    .filter(candidate => candidate.blood === monster.blood)
    .sort((a, b) => Number(a.id) - Number(b.id));
  const index = sameBlood.findIndex(candidate => candidate.id === monster.id);
  return sameBlood.slice(Math.max(0, index - 2), index)
    .concat(sameBlood.slice(index + 1, index + 3));
}

function renderRelatedCard(monster, context) {
  const runtime = context.runtimeById.get(monster.id);
  const image = resolveImage(monster.id, context).url;
  const content = `${image ? `\n          <img class="card-img" src="${escapeHtml(image)}" alt="${escapeHtml(monster.name)}">` : ''}
          <div class="card-info">
            <div class="card-name">${escapeHtml(monster.name)}</div>
            ${renderBadgeRow({
    aura: runtime ? runtime.aura : monster.aura,
    mon: monster.mon,
    limitedLabel: limitedLabelOf(runtime || monster),
    small: true,
    indent: '            ',
  })}
            <div>${escapeHtml(monster.subBlood)}</div>
          </div>`;
  addLink(context, monster.url.replace(/^\//, ''));
  return `        <a class="card" href="${monster.id}.html">${content}\n        </a>`;
}

function renderDetail(entry, context) {
  const monster = context.monsterById.get(entry.id);
  const runtime = context.runtimeById.get(entry.id);
  const title = `${monster.name}（${monster.blood}・${monster.mon}）| LINEモンスターファーム徹底攻略`;
  const description = descriptionFrom(entry.explanation);
  const canonical = `${SITE_URL}${monster.url}`;
  const image = resolveImage(monster.id, context).url;
  const breadcrumbTop = rootLink(context, 'index.html', 'トップ');
  const breadcrumbMonsters = rootLink(context, 'monsters.html', 'モンスター一覧');
  const breadcrumbMonType = context.eligibleMonSlugs.has(monster.monSlug)
    ? (() => {
      addLink(context, `monsters/${monster.monSlug}/index.html`);
      return `<a href="../../index.html">${escapeHtml(monster.mon)}</a>`;
    })()
    : escapeHtml(monster.mon);
  const navTop = rootLink(context, 'index.html', 'トップ');
  const navMonsters = rootLink(context, 'monsters.html', 'モンスター一覧');
  const navAssist = rootLink(context, 'assist.html', 'アシストカード一覧');
  const privacy = rootLink(context, 'privacy.html', 'プライバシーポリシー');
  const nonEmptyFormations = (entry.formations || []).filter(formation => {
    return !isEmptyFormation(formation);
  });
  const byline = renderByline(entry);
  const article = articleJson(monster, entry);
  const formations = nonEmptyFormations.length
    ? `
  <div class="section-box">
    <div class="section-header">
      <h2 class="section-title">おすすめ編成</h2>
    </div>
    ${nonEmptyFormations.map(formation => renderFormation(formation, context)).join('\n    ')}
  </div>`
    : '';
  const explanation = String(entry.explanation || '').trim()
    ? `
  <div class="section-box">
    <div class="section-header">
      <h2 class="section-title">評価解説</h2>
    </div>
    <div class="expl-body">${formatExplanation(entry.explanation)}</div>${byline ? `
    ${byline}` : ''}
  </div>`
    : '';
  const related = relatedMonsters(monster, context);
  const gachaAppearances = renderGachaAppearances(
    publishedGachas(context.gachasJson), 'monster', monster.id, ROOT_PREFIX
  );
  const limitedLabel = runtime && runtime.limited
    ? runtime.limitedLabel || '限定'
    : '';
  const aura = runtime ? runtime.aura : monster.aura;
  const body = `<body class="monster-detail-page">

<header>
  <div class="header-inner">
    <a href="${ROOT_PREFIX}index.html" class="logo">LINE<span>モンスターファーム</span>徹底攻略</a>
    <nav>
      ${navTop}
      ${navMonsters}
      ${navAssist}
    </nav>
  </div>
</header>

<main class="container">
  <p class="page-breadcrumb">${breadcrumbTop} &gt; ${breadcrumbMonsters} &gt; ${breadcrumbMonType} &gt; ${escapeHtml(monster.name)}</p>
  <h1 class="page-title">${escapeHtml(monster.name)}</h1>

  <div class="detail-card">
    <div class="detail-img-wrap">${image ? `
      <img class="detail-img" src="${escapeHtml(image)}" alt="${escapeHtml(monster.name)}">` : ''}${limitedLabel ? `
      <span class="detail-limited-badge">${escapeHtml(limitedLabel)}</span>` : ''}
    </div>
    <div class="detail-body">
      <div class="detail-name">${escapeHtml(monster.name)}</div>
      <div class="detail-badges">
        <span class="aura-badge-lg aura-${escapeHtml(aura)}"><span class="aura-dot"></span>${escapeHtml(aura)}オーラ</span>
        <span class="mon-badge">${escapeHtml(monster.mon)}</span>${limitedLabel ? `
        <span class="limited-badge-inline">${escapeHtml(limitedLabel)}</span>` : ''}
      </div>
      <div class="bloodline-row">
        <div class="bloodline-item"><span class="bloodline-label">主血統</span><span class="bloodline-value">${escapeHtml(monster.blood)}</span></div>
        <div class="bloodline-item"><span class="bloodline-label">副血統</span><span class="bloodline-value">${escapeHtml(monster.subBlood)}</span></div>
      </div>
    </div>
  </div>

${explanation}${formations}

  <div class="section-box">
    <div class="section-header">
      <h2 class="section-title">同じ血統のモンスター</h2>
    </div>
    <div class="card-grid">
${related.map(candidate => renderRelatedCard(candidate, context)).join('\n')}
    </div>
  </div>${gachaAppearances}

  <div class="section-box">
    <div class="section-header">
      <h2 class="section-title">関連リンク</h2>
    </div>
    <div class="menu-grid">
      <a class="menu-link" href="${ROOT_PREFIX}monsters.html"><span class="icon">👾</span>モンスター一覧</a>
    </div>
  </div>
</main>

<footer>
  &copy; 2026 LINEモンスターファーム徹底攻略 ／ 非公式ファンサイト
  ／ ${privacy}
</footer>

</body>
`;
  const contentCharacters = visibleChars(body);
  const indexable = contentCharacters >= INDEXABLE_THRESHOLD;
  const robotsMeta = indexable
    ? ''
    : '\n  <meta name="robots" content="noindex,follow">';
  const adsense = indexable
    ? '\n  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7841397391542171" crossorigin="anonymous"></script>'
    : '';
  const html = `<!-- このファイルは build.js が自動生成しています。直接編集しないでください。 -->
<!-- 元データ: src/data/monsters-editorial.json / src/data/monster-ids.json -->
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <link rel="icon" href="${ROOT_PREFIX}S__94175247.jpg">
  <link rel="apple-touch-icon" href="${ROOT_PREFIX}S__94175247.jpg">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">${robotsMeta}
  <link rel="canonical" href="${canonical}">
  <script type="application/ld+json">${breadcrumbJson(monster, context)}</script>${article ? `
  <script type="application/ld+json">${article}</script>` : ''}
  <link rel="stylesheet" href="${ROOT_PREFIX}style.css">
  <link rel="stylesheet" href="${ROOT_PREFIX}monster-detail.css">${adsense}
</head>
${body}</html>
`;
  return { html, indexable, contentCharacters };
}

function renderMonTypeCard(monster, context) {
  const runtime = context.runtimeById.get(monster.id);
  const image = resolveImage(monster.id, context, MON_TYPE_ROOT_PREFIX).url;
  const editorial = context.editorialById.get(monster.id);
  const isIndexable = context.indexableDetailIds.has(monster.id);
  const excerpt = isIndexable
    ? `\n            <p class="wide-card-excerpt">${escapeHtml(descriptionFrom(editorial.explanation))}</p>`
    : '';
  const content = `${image ? `
          <img class="card-img" src="${escapeHtml(image)}" alt="${escapeHtml(monster.name)}">` : ''}
          <div class="card-info">
            <div class="card-name">${escapeHtml(monster.name)}</div>
            ${renderBadgeRow({
    aura: runtime ? runtime.aura : monster.aura,
    mon: monster.mon,
    limitedLabel: limitedLabelOf(runtime || monster),
    small: true,
    indent: '            ',
  })}
            <div class="mon-type-card-meta">副血統: ${escapeHtml(monster.subBlood)}</div>${excerpt}
          </div>`;
  addLink(context, monster.url.replace(/^\//, ''));
  const displayClass = isIndexable ? ' wide-card' : ' mon-type-card--compact';
  return `        <a class="card mon-type-card${displayClass}" href="${escapeHtml(monster.bloodSlug)}/${monster.id}.html">${content}
        </a>`;
}

function groupMonTypeMonsters(monsters) {
  const groups = new Map();
  for (const monster of monsters) {
    if (!groups.has(monster.blood)) groups.set(monster.blood, []);
    groups.get(monster.blood).push(monster);
  }
  return [...groups.entries()].map(([blood, members]) => {
    members.sort((a, b) => Number(a.id) - Number(b.id));
    return { blood, members, firstId: Number(members[0].id) };
  }).sort((a, b) => b.members.length - a.members.length || a.firstId - b.firstId);
}

function renderMonType(monType, context) {
  const monsters = context.monsters
    .filter(monster => monster.monSlug === monType.slug)
    .sort((a, b) => Number(a.id) - Number(b.id));
  const groups = groupMonTypeMonsters(monsters);
  const title = `${monType.name}のモンスター一覧（${monsters.length}体・${groups.length}血統）| LINEモンスターファーム徹底攻略`;
  const description = descriptionFrom(monType.entry.sections[0].items[0].body);
  const canonical = `${SITE_URL}/monsters/${monType.slug}/`;
  const breadcrumbTop = rootLink(context, 'index.html', 'トップ', MON_TYPE_ROOT_PREFIX);
  const breadcrumbMonsters = rootLink(context, 'monsters.html', 'モンスター一覧', MON_TYPE_ROOT_PREFIX);
  const navTop = rootLink(context, 'index.html', 'トップ', MON_TYPE_ROOT_PREFIX);
  const navMonsters = rootLink(context, 'monsters.html', 'モンスター一覧', MON_TYPE_ROOT_PREFIX);
  const navAssist = rootLink(context, 'assist.html', 'アシストカード一覧', MON_TYPE_ROOT_PREFIX);
  const privacy = rootLink(context, 'privacy.html', 'プライバシーポリシー', MON_TYPE_ROOT_PREFIX);
  const editorialSections = monType.entry.sections.map(section => `
  <section class="section">
    <h2 class="section-title">${escapeHtml(section.heading)}</h2>
${section.items.map(item => `${item.subheading === null ? '' : `    <h3>${escapeHtml(item.subheading)}</h3>\n`}    <p>${escapeHtml(item.body)}</p>`).join('\n')}
  </section>`).join('');
  const bloodGroups = groups.map(group => {
    const editorialMembers = group.members.filter(monster => {
      return context.indexableDetailIds.has(monster.id);
    });
    const compactMembers = group.members.filter(monster => {
      return !context.indexableDetailIds.has(monster.id);
    });
    const editorialGrid = editorialMembers.length
      ? `
    <div class="card-grid mon-type-grid wide-grid">
${editorialMembers.map(monster => renderMonTypeCard(monster, context)).join('\n')}
    </div>`
      : '';
    const compactGrid = compactMembers.length
      ? `
    <div class="card-grid mon-type-grid mon-type-grid--compact">
${compactMembers.map(monster => renderMonTypeCard(monster, context)).join('\n')}
    </div>`
      : '';
    return `
    <div class="mon-type-blood-group">
      <h3 class="mon-type-blood-title">${escapeHtml(group.blood)}（${group.members.length}体）</h3>${editorialGrid}${compactGrid}
    </div>`;
  }).join('');
  const otherMonTypes = context.eligibleMonTypes.filter(other => other.slug !== monType.slug);
  const otherLinks = otherMonTypes.map(other => {
    addLink(context, `monsters/${other.slug}/index.html`);
    const count = context.monsters.filter(monster => monster.monSlug === other.slug).length;
    return `      <a class="menu-link" href="../${escapeHtml(other.slug)}/index.html"><span class="icon">${MON_ICONS[other.slug] || ''}</span> ${escapeHtml(other.name)}（${count}体）</a>`;
  }).join('\n');

  return `<!-- このファイルは build.js が自動生成しています。直接編集しないでください。 -->
<!-- 元データ: src/data/monsters-editorial.json / src/data/monster-ids.json -->
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <link rel="icon" href="${MON_TYPE_ROOT_PREFIX}S__94175247.jpg">
  <link rel="apple-touch-icon" href="${MON_TYPE_ROOT_PREFIX}S__94175247.jpg">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonical}">
  <script type="application/ld+json">${monTypeBreadcrumbJson(monType)}</script>
  <link rel="stylesheet" href="${MON_TYPE_ROOT_PREFIX}style.css">
  <link rel="stylesheet" href="${MON_TYPE_ROOT_PREFIX}monster-type.css">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7841397391542171" crossorigin="anonymous"></script>
</head>
<body class="mon-type-page">

<header>
  <div class="header-inner">
    <a href="${MON_TYPE_ROOT_PREFIX}index.html" class="logo">LINE<span>モンスターファーム</span>徹底攻略</a>
    <nav>
      ${navTop}
      ${navMonsters}
      ${navAssist}
    </nav>
  </div>
</header>

<main class="container">
  <p class="page-breadcrumb">${breadcrumbTop} &gt; ${breadcrumbMonsters} &gt; ${escapeHtml(monType.name)}</p>
  <h1 class="page-title">${escapeHtml(monType.name)}のモンスター</h1>
${editorialSections}

  <section class="section">
    <h2 class="section-title">血統別モンスター</h2>${bloodGroups}
  </section>

  <section class="section">
    <h2 class="section-title">他のモン類</h2>
    <div class="menu-grid">
${otherLinks}
    </div>
  </section>
</main>

<footer>
  &copy; 2026 LINEモンスターファーム徹底攻略 ／ 非公式ファンサイト
  ／ ${privacy}
</footer>

</body>
</html>
`;
}

function writeIfChanged(relativePath, html) {
  return writeIfChangedAt(REPO, relativePath, html, DRY_RUN);
}

function createIdAvailability(idsJson) {
  const bloodOrder = idsJson.bloodOrder.map((name, index) => ({
    code: String(index + 1).padStart(2, '0'),
    name,
    slug: idsJson.bloodSlug[name],
  }));
  const specialEntries = Object.entries(idsJson.specialSub);
  const specialSub = Object.fromEntries(specialEntries.map(([name, from], index) => {
    const next = specialEntries[index + 1];
    return [name, { from, to: next ? next[1] - 1 : 99 }];
  }));
  const taken = [...idsJson.monsters]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(monster => ({ id: monster.id, name: monster.name }));
  return {
    note: 'build.js が生成。ID採番の正は generate-ids.js。このファイルは予測用の参照データ',
    bloodOrder,
    specialSub,
    taken,
    count: idsJson.count,
  };
}

function createPageBaseline(detailPages) {
  const pages = [...detailPages]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(page => ({
      id: page.id,
      baseline: page.baselineCharacters,
      current: page.contentCharacters,
      indexable: page.indexable,
    }));
  return {
    note: 'build.js が生成。baseline = 解説と編成を除いたページの可視文字数',
    threshold: INDEXABLE_THRESHOLD,
    pages,
  };
}

function createCmsSeed(context, detailPages) {
  const editorialById = new Map(context.editorial.map(entry => [entry.id, entry]));
  const detailPageById = new Map(detailPages.map(page => [page.id, page]));
  const monsters = [...context.monsters]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(monster => {
      const runtime = context.runtimeById.get(monster.id);
      const editorial = editorialById.get(monster.id) || {};
      const detailPage = detailPageById.get(monster.id);
      const image = resolveImage(monster.id, context, '');
      return {
        id: monster.id,
        arrayIndex: monster.arrayIndex,
        name: monster.name,
        aura: monster.aura,
        mon: monster.mon,
        mainBlood: monster.blood,
        subBlood: monster.subBlood,
        limited: runtime ? !!runtime.limited : false,
        limitedLabel: runtime && runtime.limitedLabel ? runtime.limitedLabel : '',
        image: image.filename,
        imageSource: image.source,
        gwImg: runtime && runtime.gwImg != null ? runtime.gwImg : null,
        url: monster.url,
        explanation: editorial.explanation || '',
        formations: Array.isArray(editorial.formations) ? editorial.formations : [],
        author: editorial.author || '',
        contributors: Array.isArray(editorial.contributors) ? editorial.contributors : [],
        createdAt: editorial.createdAt || '',
        updatedAt: editorial.updatedAt || '',
        releasedAt: editorial.releasedAt || '',
        baseline: detailPage.baselineCharacters,
        current: detailPage.contentCharacters,
        indexable: detailPage.indexable,
      };
    });
  return {
    note: 'build.js が生成。管理画面（GAS）の初期データ用。手で編集しない',
    threshold: INDEXABLE_THRESHOLD,
    count: monsters.length,
    monsters,
  };
}

function renderSitemap(existingXml, pages) {
  const urlBlockPattern = /  <url>\n[\s\S]*?  <\/url>\n?/g;
  const matches = [...existingXml.matchAll(urlBlockPattern)];
  const generatedUrlPattern = /<loc>https:\/\/line-monster-farm-tetteikouryaku\.com\/(?:monsters\/(?:[^/]+\/(?:index\.html)?|[^/]+\/[^/]+\/\d{4}\.html)|cards\/[^/]+\.html|gacha\/(?:\d{8}-\d+\.html)?)<\/loc>/;
  const existingBlocks = matches
    .map(match => match[0])
    .filter(block => !generatedUrlPattern.test(block));

  if (existingBlocks.length !== 23) {
    throw new Error(`sitemap.xml の手書きURLが23件ではありません: ${existingBlocks.length}件`);
  }

  const header = existingXml.slice(0, matches[0].index);
  const generatedBlocks = pages.map(page => `  <url>
    <loc>${page.canonical}</loc>
    <priority>${page.priority}</priority>
  </url>
`).join('');
  const sitemap = `${header}${existingBlocks.join('')}${generatedBlocks}</urlset>\n`;

  if (/<lastmod>/.test(sitemap)) {
    throw new Error('sitemap.xml に <lastmod> が含まれています');
  }
  const urlCount = (sitemap.match(/<url>/g) || []).length;
  const expectedUrlCount = existingBlocks.length + pages.length;
  if (urlCount !== expectedUrlCount) {
    throw new Error(`sitemap.xml のURLが${expectedUrlCount}件ではありません: ${urlCount}件`);
  }
  return sitemap;
}

function validatePages(pages) {
  const indexablePages = pages.filter(page => page.indexable);
  const thin = indexablePages.filter(page => page.contentCharacters < INDEXABLE_THRESHOLD);
  if (thin.length) {
    throw new Error(`本文量800字未満のページ: ${thin.map(page => `${page.path} (${page.contentCharacters}字)`).join(', ')}`);
  }

  for (const field of ['title', 'canonical']) {
    const values = pages.map(page => page[field]);
    if (new Set(values).size !== values.length) {
      throw new Error(`${field} がユニークではありません`);
    }
  }

  const descriptions = indexablePages.map(page => page.description);
  if (new Set(descriptions).size !== descriptions.length) {
    throw new Error('description がユニークではありません');
  }

  const invalidDescriptions = indexablePages.filter(page => page.description.length < 40 || page.description.length > 140);
  if (invalidDescriptions.length) {
    throw new Error(`meta description が40〜140字ではありません: ${invalidDescriptions.map(page => page.path).join(', ')}`);
  }
}

function linkExists(target, generatedPaths) {
  return generatedPaths.has(target) || fs.existsSync(path.join(REPO, target));
}

function logBuild(inputs, gates, monTypeGates, outputCounts, context, brokenLinks) {
  const taxonomyCounts = countTaxonomyEntries(inputs.taxonomy);
  const noindex = gates.filter(entry => !entry.indexable);
  const indexable = gates.filter(entry => entry.indexable);
  const excludedMonTypes = monTypeGates.filter(monType => !monType.eligible);
  const eligibleMonTypes = monTypeGates.filter(monType => monType.eligible);

  console.log('=== 入力 ===');
  console.log(`  monster-ids        ${inputs.monsters.length}件`);
  console.log(`  monsters-editorial  ${inputs.editorial.length}件`);
  console.log(`  monster-images     ${Object.keys(inputs.images).length}件`);
  console.log(`  taxonomy           血統${taxonomyCounts.bloods}件 / モン類${taxonomyCounts.monTypes}件`);
  console.log('');
  console.log('=== ゲート判定 ===');
  console.log(`  詳細ページ  生成 ${gates.length}件 / インデックス ${indexable.length}件 / noindex ${noindex.length}件`);
  const nearThreshold = noindex
    .filter(entry => entry.contentCharacters >= 700 && entry.contentCharacters < INDEXABLE_THRESHOLD)
    .sort((a, b) => a.contentCharacters - b.contentCharacters || Number(a.id) - Number(b.id));
  console.log(`  昇格まであと少し（可視700〜799字）: ${nearThreshold.length}件`);
  for (const entry of nearThreshold) {
    console.log(`    ${entry.id} ${entry.name}  ${entry.contentCharacters}字（あと${INDEXABLE_THRESHOLD - entry.contentCharacters}字）`);
  }
  console.log(`  モン類ページ 生成 ${eligibleMonTypes.length}件（${eligibleMonTypes.map(monType => monType.name).join(' → ')}） / 除外 ${excludedMonTypes.length}件`);
  for (const monType of excludedMonTypes) {
    console.log(`    ${monType.name}: ${monType.reasons.join(' / ')}`);
  }
  console.log('');
  console.log('=== 出力 ===');
  console.log(`  新規 ${outputCounts.new}件 / 更新 ${outputCounts.updated}件 / 変更なし ${outputCounts.unchanged}件`);
  console.log(`  合計 ${outputCounts.total} ページ`);
  console.log('');
  console.log('=== 警告 ===');
  if (!inputs.taxonomy) {
    console.log('  taxonomy.json が無いため、詳細ページのみ生成し、モン類ページをスキップしました');
  }
  for (const formation of context.skippedEmptyFormations) {
    console.log(`  空の編成をスキップ: ${formation.id} ${formation.name} ${formation.title}`);
  }
  const fallback = [...context.fallbackImages.entries()];
  console.log(`  画像がGameWithにフォールバック ${fallback.length}件${fallback.length ? `: ${fallback.map(([id, name]) => `${id} ${name}`).join(', ')}` : ''}`);
  const missingCards = [...context.missingCardIds];
  console.log(`  cards-data.js に存在しないカードID ${missingCards.length}件${missingCards.length ? `: ${missingCards.map(id => JSON.stringify(id)).join(', ')}` : ''}`);
  console.log(`  リンク先が存在しないリンク ${brokenLinks.length}件${brokenLinks.length ? `: ${brokenLinks.join(', ')}` : ''}`);
}

function main() {
  const inputs = loadInputs();
  const detailEntries = createDetailEntries(inputs);
  const monTypeGates = gateMonTypes(inputs);
  const eligibleMonTypes = monTypeGates.filter(monType => monType.eligible);
  const context = createBuildContext(inputs, eligibleMonTypes);
  const monsterIndex = renderMonsterIndex(
    fs.readFileSync(path.join(REPO, 'monsters.html'), 'utf8'),
    context
  );
  const redirectMap = renderRedirectMap(inputs.monsters);
  const detailPages = detailEntries.map(entry => {
    const monster = inputs.monsterById.get(entry.id);
    const rendered = renderDetail(entry, context);
    const bare = renderDetail({ ...entry, explanation: '', formations: [] }, context);
    const title = `${monster.name}（${monster.blood}・${monster.mon}）| LINEモンスターファーム徹底攻略`;
    return {
      id: monster.id,
      name: monster.name,
      path: monster.url.replace(/^\//, ''),
      html: rendered.html,
      title,
      description: descriptionFrom(entry.explanation),
      canonical: `${SITE_URL}${monster.url}`,
      priority: '0.7',
      indexable: rendered.indexable,
      contentCharacters: rendered.contentCharacters,
      baselineCharacters: bare.contentCharacters,
    };
  });
  context.indexableDetailIds = new Set(
    detailPages.filter(page => page.indexable).map(page => page.id)
  );
  const monTypePages = eligibleMonTypes.map(monType => {
    const html = renderMonType(monType, context);
    const monsters = inputs.monsters.filter(monster => monster.monSlug === monType.slug);
    const bloodCount = new Set(monsters.map(monster => monster.blood)).size;
    return {
      path: `monsters/${monType.slug}/index.html`,
      html,
      title: `${monType.name}のモンスター一覧（${monsters.length}体・${bloodCount}血統）| LINEモンスターファーム徹底攻略`,
      description: descriptionFrom(monType.entry.sections[0].items[0].body),
      canonical: `${SITE_URL}/monsters/${monType.slug}/`,
      priority: '0.6',
      indexable: true,
      contentCharacters: visibleChars(html),
    };
  });
  const pages = detailPages.concat(monTypePages);
  const idAvailability = createIdAvailability(inputs.idsJson);
  const pageBaseline = createPageBaseline(detailPages);
  const cmsSeed = createCmsSeed(context, detailPages);

  validatePages(pages);
  const detailPageById = new Map(detailPages.map(page => {
    return [path.basename(page.path, '.html'), page];
  }));
  const sitemapPages = inputs.editorial
    .map(entry => detailPageById.get(entry.id))
    .filter(page => page && page.indexable)
    .concat([...monTypePages].sort((a, b) => {
      // sitemap.xml は表示順ではないため、既存の決定的なURL順を維持する。
      return inputs.sitemap.indexOf(`<loc>${a.canonical}</loc>`)
        - inputs.sitemap.indexOf(`<loc>${b.canonical}</loc>`);
    }));
  const assistBuild = buildAssistPages({
    dryRun: DRY_RUN,
    gachaAppearancesFor: cardId => renderGachaAppearances(
      publishedGachas(inputs.gachasJson), 'card', cardId, '../'
    ),
  });
  const gachaBuild = buildGachaPages({
    root: REPO,
    outputRoot: REPO,
    dryRun: DRY_RUN,
    now: resolveBuildNow(),
    gachaDb: inputs.gachasJson,
    typeDb: inputs.gachaTypesJson,
    monsterDb: inputs.monsters,
    editorialDb: inputs.editorial,
    cardDb: inputs.assistCards,
    indexSource: fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'),
    rerollSource: fs.readFileSync(path.join(REPO, 'reroll.html'), 'utf8'),
  });
  const sitemap = renderSitemap(
    inputs.sitemap,
    sitemapPages.concat(assistBuild.sitemapPages, gachaBuild.sitemapPages)
  );
  const brokenLinks = context.linkTargets.filter(target => !linkExists(target, context.generatedPaths));
  if (brokenLinks.length) {
    throw new Error(`リンク先が存在しません: ${brokenLinks.join(', ')}`);
  }

  const outputCounts = {
    new: 0,
    updated: 0,
    unchanged: 0,
    total: pages.length + 6 + gachaBuild.outputs.length,
  };
  for (const output of gachaBuild.outputs) outputCounts[output.state]++;
  for (const page of pages) {
    outputCounts[writeIfChanged(page.path, page.html)]++;
  }
  outputCounts[writeIfChanged('sitemap.xml', sitemap)]++;
  outputCounts[writeIfChanged('monsters.html', monsterIndex)]++;
  outputCounts[writeIfChanged('monsters/redirect-map.js', redirectMap)]++;
  outputCounts[writeIfChanged(
    'src/data/id-availability.json',
    JSON.stringify(idAvailability, null, 2) + '\n'
  )]++;
  outputCounts[writeIfChanged(
    'src/data/page-baseline.json',
    JSON.stringify(pageBaseline, null, 2) + '\n'
  )]++;
  outputCounts[writeIfChanged(
    'src/data/cms-seed.json',
    JSON.stringify(cmsSeed, null, 2) + '\n'
  )]++;
  logBuild(inputs, detailPages, monTypeGates, outputCounts, context, brokenLinks);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`ビルド失敗: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  PICKUP_SLOTS,
  GACHA_EXCERPT_CHARS,
  GACHA_GATE_VISIBLE_CHARS,
  GACHA_GATE_EXPLANATION,
  resolveBuildNow,
  visibleChars,
  validateGachaData,
  buildGachaPages,
  replaceMarkerBlock,
  selectRerollGacha,
  renderGachaAppearances,
};
