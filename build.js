#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { buildAssistPages } = require('./scripts/build-assist-pages');
const { LMFDB_CARD_MAP_FILE, renderLmfdbCardMap } = require('./scripts/lmfdb-card-map');

const REPO = __dirname;
const SITE_URL = 'https://line-monster-farm-tetteikouryaku.com';
const ROOT_PREFIX = '../../../';
const MON_TYPE_ROOT_PREFIX = '../../';
const DRY_RUN = process.argv.includes('--dry');
const GTM_TAG = `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-PC4NG733');<\/script>`;
const INDEXABLE_THRESHOLD = 800;
const PICKUP_SLOTS = 5;
const GACHA_EXCERPT_CHARS = 140;
const GACHA_GATE_VISIBLE_CHARS = 800;
const GACHA_GATE_EXPLANATION = 300;

// 技（スキル）。列＝技を発動できる間合い、行＝ランク。並びはゲーム内表示に合わせる。
const SKILL_RANGES = ['遠', '中', '近', '零'];
const SKILL_RANKS = [1, 2, 3, 4, 5, 6];
// 技のオーラはモンスターの6色に「無」を足した7値。
const SKILL_AURAS = ['赤', '青', '黄', '黒', '白', '緑', '無'];
// ダメージ・命中率・ガッツダウン・クリティカル率の評価。各段に + 付きが存在する。
// 評価は SS〜G。SS はランク6の技で初出（キュービ種 王狐炎衝）
const SKILL_GRADE_PATTERN = /^(?:SS|[SABCDEFG])\+?$/;
// 技登録に必要なレアリティ（★1〜10）
const SKILL_RARITY_MIN = 1;
const SKILL_RARITY_MAX = 10;
// 枠の色分け。ちから＝黄系・かしこさ＝緑系（ゲーム内のアイコン色に合わせる）
const SKILL_TYPE_TONE = { 'ちから': 'power', 'かしこさ': 'wits' };
// 間合いの色。遠＝青・中＝緑・近＝オレンジ・零＝赤（ゲーム内のタブ色）
const SKILL_RANGE_TONE = { '遠': 'far', '中': 'mid', '近': 'near', '零': 'zero' };
// バフ・デバフはゲーム内ヘルプにある共通の状態。技能力テキストの [霊魂] のような表記と結ぶ。
const SKILL_BUFF_KINDS = ['バフ', 'デバフ'];
// 技能力テキストの角括弧には、バフ名のほかに発動条件やゲーム用語も入る。
// バフDBに無いトークンは「未登録候補」として取り込みが報告するので、条件語はここへ足して黙らせる。
const NON_BUFF_TOKENS = [
  '序盤', '中盤', '終盤', '有利', '不利', '同色', '異色',
  'シールド', 'バリア', '固有', '自身', '相手',
  // 技能力テキストの効果表記。バフ・デバフ一覧には無い（例 [完全回避Lv2＜1回＞]）
  '完全回避',
  // モン類を指定する発動条件（例 [相手魔族以外]）。バフではない
  '相手魔族以外',
];

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
  // 技DBは任意入力。無い・空でも血統ページを1枚も生成せずビルドを通す。
  const skillsPath = path.join(REPO, 'src/data/monster-skills.json');
  const skillsJson = fs.existsSync(skillsPath) ? readJson('src/data/monster-skills.json') : null;
  const skillAbilitiesPath = path.join(REPO, 'src/data/skill-abilities.json');
  const skillAbilitiesJson = fs.existsSync(skillAbilitiesPath) ? readJson('src/data/skill-abilities.json') : null;
  const skillBuffsPath = path.join(REPO, 'src/data/skill-buffs.json');
  const skillBuffsJson = fs.existsSync(skillBuffsPath) ? readJson('src/data/skill-buffs.json') : null;

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
    skillsJson,
    skillAbilitiesJson,
    skillBuffsJson,
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
function renderBadgeRow({ aura, mon = '', limitedLabel = '', small = false, compact = false, indent = '' }) {
  // compact は縦型カード用。1行に収めるためオーラは色1文字、限定は画像側のオーバーレイへ回す。
  const auraText = compact ? `${escapeHtml(aura)}` : `${escapeHtml(aura)}オーラ`;
  const badges = [
    `<span class="aura-badge-lg aura-${escapeHtml(aura)}"><span class="aura-dot"></span>${auraText}</span>`,
  ];
  if (mon) badges.push(`<span class="mon-badge">${escapeHtml(mon)}</span>`);
  if (!compact && limitedLabel) badges.push(`<span class="limited-badge-inline">${escapeHtml(limitedLabel)}</span>`);
  let rowClass = 'badge-row';
  if (compact) rowClass = 'badge-row badge-row--compact';
  else if (small) rowClass = 'badge-row badge-row--sm';
  const inner = badges.map(badge => `${indent}  ${badge}`).join('\n');
  return `<div class="${rowClass}">\n${inner}\n${indent}</div>`;
}

// 縦型モンスターカード。モン類一覧の解説なし枠・詳細の「同じ血統のモンスター」で共有する。
function renderMonCard({ href, image, name, aura, mon, subBlood, limitedLabel, indent = '        ', extraClass = '', attrs = '' }) {
  const inner = `${indent}  `;
  const imgBlock = image
    ? `\n${inner}<div class="mon-card-img-wrap">\n${inner}  <img class="mon-card-img" src="${escapeHtml(image)}" alt="${escapeHtml(name)}" loading="lazy">${limitedLabel ? `\n${inner}  <span class="mon-card-limited">${escapeHtml(limitedLabel)}</span>` : ''}\n${inner}</div>`
    : '';
  return `${indent}<a class="mon-card${extraClass ? ` ${extraClass}` : ''}" href="${escapeHtml(href)}"${attrs}>${imgBlock}
${inner}<div class="mon-card-info">
${inner}  <div class="mon-card-name">${escapeHtml(name)}</div>
${inner}  ${renderBadgeRow({ aura, mon, compact: true, indent: `${inner}  ` })}
${inner}  <div class="mon-card-meta">副血統：${escapeHtml(subBlood)}</div>
${inner}</div>
${indent}</a>`;
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

const TOP_PICKUP_EMPTY = '    <p>現在開催中のガチャはありません。<a href="gacha/">開催中ガチャ一覧を見る</a></p>';

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
  // 同じ公開日はgachaId降順（後から追加した新しいものが上）
  return [...gachas].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.gachaId.localeCompare(a.gachaId)).map(gacha => {
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

// ガチャ一覧と同じカード（バナー・タイトル・種別・期間）。一覧・モンスター・カード各ページで共用する
function renderGachaCard(gacha, { href, imageSrc, typeSuffix = '' }) {
  return `      <a class="card" href="${escapeHtml(href)}"><img class="gacha-banner" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(gacha.name)}"><div class="card-info gacha-card-info"><h3 class="card-name gacha-name">${escapeHtml(gacha.name)}</h3><p class="gacha-type">${escapeHtml(gacha.gachaType)}${escapeHtml(typeSuffix)}</p><p class="gacha-period">期間：${escapeHtml(formatGachaPeriod(gacha.startAt))} ～ ${escapeHtml(formatGachaPeriod(gacha.endAt))}</p></div></a>`;
}

// variant: 'box' はモンスター詳細の .section-box、'section' はその他ページの .section
function renderGachaAppearances(gachas, kind, id, rootPrefix, variant = 'section') {
  const matched = gachas.filter(gacha => (kind === 'monster' ? gacha.pickupMonsters : gacha.pickupCards)
    .some(pickup => (kind === 'monster' ? pickup.id : pickup.cardId) === id))
    .sort((a, b) => b.startAt.localeCompare(a.startAt) || a.gachaId.localeCompare(b.gachaId));
  if (!matched.length) return '';
  const cards = matched.map(gacha => renderGachaCard(gacha, {
    href: `${rootPrefix}gacha/${gacha.gachaId}.html`,
    imageSrc: `${rootPrefix}${gacha.image}`,
  })).join('\n');
  const grid = `    <div class="gacha-grid">\n${cards}\n    </div>`;
  if (variant === 'box') {
    return `\n  <div class="section-box">\n    <div class="section-header">\n      <h2 class="section-title">登場ガチャ</h2>\n    </div>\n${grid}\n  </div>\n`;
  }
  return `\n  <section class="section">\n    <h2 class="section-title">登場ガチャ</h2>\n${grid}\n  </section>\n`;
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
  const openingTag = hasDetail
    ? `<a class="card wide-card" href="../${escapeHtml(detailPath)}">`
    : '<article class="card wide-card">';
  const closingTag = hasDetail ? '</a>' : '</article>';
  return `      ${openingTag}
        ${image ? `<img class="card-img" src="../${escapeHtml(image)}" alt="${escapeHtml(monster.name)}">` : ''}
        <div class="card-info">
          <h3 class="card-name gacha-pickup-name">${escapeHtml(monster.name)}</h3>
          ${renderBadgeRow({ aura: monster.aura, mon: monster.mon, limitedLabel: limitedLabelOf(monster), small: true, indent: '          ' })}
          <p class="gacha-pickup-blood">${escapeHtml(monster.blood)}（副血統：${escapeHtml(monster.subBlood)}）</p>
          <p class="gacha-pickup-rate">排出率 ${escapeHtml(pickup.rate)}%</p>
          ${excerpt ? `<p class="wide-card-excerpt" data-gacha-excerpt>${escapeHtml(excerpt)}</p>` : ''}
        </div>
      ${closingTag}`;
}

function renderGachaPickupCard(pickup, card) {
  const excerpt = gachaExcerpt(card.explanation);
  return `      <a class="card wide-card" href="../cards/${escapeHtml(card.cardId)}.html">
        <img class="card-img" src="../${escapeHtml(card.image)}" alt="${escapeHtml(card.name)}">
        <div class="card-info">
          <h3 class="card-name gacha-pickup-name">${escapeHtml(card.name)}</h3>
          ${renderBadgeRow({ aura: card.aura, mon: card.monType, small: true, indent: '          ' })}
          <p class="gacha-pickup-blood">${escapeHtml(card.rarity)} / ${escapeHtml(card.cardType)}</p>
          <p class="gacha-pickup-rate">排出率 ${escapeHtml(pickup.rate)}%</p>
          ${excerpt ? `<p class="wide-card-excerpt" data-gacha-excerpt>${escapeHtml(excerpt)}</p>` : ''}
        </div>
      </a>`;
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
<header><div class="header-inner"><a href="../index.html" class="logo">LINE<span>モンスターファーム</span><span class="logo-sub">徹底攻略</span></a><nav><a href="../monsters.html">モンスター一覧</a><a href="../assist.html">アシストカード一覧</a><a href="index.html" class="active">開催中ガチャ一覧</a></nav></div></header>
<main class="container">
  <p class="page-breadcrumb"><a href="../index.html">トップ</a> &gt; <a href="index.html">開催中ガチャ一覧</a> &gt; ${escapeHtml(gacha.name)}</p>
  <h1 class="page-title">${escapeHtml(gacha.name)}</h1>
  <section class="section gacha-head">
    <img class="gacha-hero" src="../${escapeHtml(gacha.image)}" alt="${escapeHtml(gacha.name)}">
    <dl class="gacha-meta">
      <div><dt>種別</dt><dd>${escapeHtml(gacha.gachaType)}</dd></div>
      <div><dt>開催期間</dt><dd>${escapeHtml(formatGachaPeriod(gacha.startAt))} ～ ${escapeHtml(formatGachaPeriod(gacha.endAt))}</dd></div>
    </dl>
  </section>${explanation}${monsterCards ? `
  <section class="section"><h2 class="section-title">ピックアップモンスター</h2><div class="card-grid wide-grid">
${monsterCards}
  </div></section>` : ''}${assistCards ? `
  <section class="section"><h2 class="section-title">ピックアップアシストカード</h2><div class="card-grid wide-grid">
${assistCards}
  </div></section>` : ''}
  <section class="section"><h2 class="section-title">関連リンク</h2><div class="menu-grid"><a class="menu-link" href="index.html">開催中ガチャ一覧へ戻る</a></div></section>
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
  ${GTM_TAG}
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
  const rows = list => list.map(gacha => renderGachaCard(gacha, {
    href: `${gacha.gachaId}.html`,
    imageSrc: `../${gacha.image}`,
    typeSuffix: Date.parse(now) < Date.parse(gacha.startAt) ? ` / ${gachaStartLabel(gacha.startAt)}` : '',
  })).join('\n');
  const section = (title, list) => list.length
    ? `\n  <section class="section"><h2 class="section-title">${title}</h2><div class="gacha-grid">\n${rows(list)}\n  </div></section>`
    : '';
  return `<!-- このファイルは build.js が自動生成しています。直接編集しないでください。 -->
<!-- 元データ: src/data/gachas.json -->
<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">${GTM_TAG}<meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>開催中ガチャ一覧 | LINEモンスターファーム徹底攻略</title>
  <meta name="description" content="開催中のガチャのピックアップ内容と開催期間を一覧で確認できます。終了済みのガチャもまとめています。">
  <link rel="canonical" href="${SITE_URL}/gacha/"><link rel="stylesheet" href="../style.css">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7841397391542171" crossorigin="anonymous"></script>
</head><body><header><div class="header-inner"><a href="../index.html" class="logo">LINE<span>モンスターファーム</span><span class="logo-sub">徹底攻略</span></a><nav><a href="../monsters.html">モンスター一覧</a><a href="../assist.html">アシストカード一覧</a><a href="index.html" class="active">開催中ガチャ一覧</a></nav></div></header>
<main class="container"><p class="page-breadcrumb"><a href="../index.html">トップ</a> &gt; 開催中ガチャ一覧</p><h1 class="page-title">開催中ガチャ一覧</h1>${section('開催中', current)}${section('終了', ended)}</main>
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
    integratedIndex = replaceMarkerBlock(integratedIndex, 'NAV', '      <a href="gacha/" class="menu-link">\n        <span class="icon">🎰</span> 開催中ガチャ一覧\n      </a>', 'html', 'index.html');
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

function createBuildContext(inputs, eligibleMonTypes, eligibleBloods) {
  const eligibleMonSlugs = new Set(eligibleMonTypes.map(monType => monType.slug));
  const generatedPaths = new Set([
    ...inputs.monsters.map(monster => monster.url.replace(/^\//, '')),
    ...eligibleMonTypes.map(monType => `monsters/${monType.slug}/index.html`),
    ...eligibleBloods.map(blood => `monsters/${blood.monSlug}/${blood.slug}/index.html`),
  ]);
  // 詳細ページは血統ページより先に描画するため、参照に必要なものを先に用意する。
  const bloodPageByBlood = new Map(eligibleBloods.map(blood => [blood.blood, blood]));
  const skillsByBlood = new Map(eligibleBloods.map(blood => [blood.blood, blood.skills]));
  const abilityById = new Map(
    selectCurrentVersions(
      (inputs.skillAbilitiesJson && inputs.skillAbilitiesJson.abilities) || [],
      abilityVersionKey
    ).map(ability => [String(ability.abilityId), ability])
  );
  const buffById = new Map(
    ((inputs.skillBuffsJson && inputs.skillBuffsJson.buffs) || [])
      .map(buff => [String(buff.buffId), buff])
  );
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
    eligibleBloods,
    bloodPageByBlood,
    skillsByBlood,
    abilityById,
    buffById,
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
  // CMSは YYYY-MM-DD / YYYY-MM / YYYY/MM/DD / YYYY/MM のいずれかで実装日を返す。
  const text = String(value || '').trim().replace(/\//g, '-');
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
    return renderMonCard({
      href,
      image,
      name: monster.name,
      aura,
      mon,
      subBlood: monster.subBlood,
      limitedLabel: limitedLabelOf(runtime || monster),
      indent: '    ',
      extraClass: 'monster-card',
      attrs: ` data-aura="${escapeHtml(aura)}" data-limited="${limited ? '1' : '0'}" data-mon="${escapeHtml(mon)}"`,
    });
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
  if (context.bloodPageByBlood && context.bloodPageByBlood.has(monster.blood)) {
    itemListElement.push({
      '@type': 'ListItem',
      position: itemListElement.length + 1,
      name: `${monster.blood}種`,
      item: `${SITE_URL}/monsters/${monster.monSlug}/${monster.bloodSlug}/`,
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
  addLink(context, monster.url.replace(/^\//, ''));
  return renderMonCard({
    href: `${monster.id}.html`,
    image,
    name: monster.name,
    aura: runtime ? runtime.aura : monster.aura,
    mon: monster.mon,
    subBlood: monster.subBlood,
    limitedLabel: limitedLabelOf(runtime || monster),
    indent: '        ',
  });
}

// モンスター詳細に出す技。血統共通技の全量は出さない（血統ページと重複するため）。
// 固有技とそのモンスターが解放できる技だけを出し、詳細は血統ページのアンカーへ送る。
function skillsForMonster(monster, context) {
  const skills = context.skillsByBlood.get(monster.blood) || [];
  const unique = skills.filter(skill => skill.unique && (skill.owners || []).includes(monster.id));
  const unlocks = skills.filter(skill => (skill.unlockedBy || []).some(entry => String(entry.monsterId) === monster.id));
  // 技そのものではなく、技についた技能力の解放元になっている場合
  const abilityUnlocks = [];
  for (const skill of skills) {
    for (const link of skill.abilities || []) {
      if (link.unlock && String(link.unlock.monsterId) === monster.id) {
        abilityUnlocks.push({ skill, link });
      }
    }
  }
  return { unique, unlocks, abilityUnlocks };
}

function skillAnchor(skill) {
  // 血統ページは詳細ページと同じディレクトリにある
  return `index.html#${escapeHtml(skill.skillId)}`;
}

function renderSkillSummaryRow(skill, context) {
  const tone = SKILL_TYPE_TONE[skill.skillType];
  const toneClass = tone ? ` skill-line--${tone}` : '';
  const move = skill.moveTo ? `／${escapeHtml(skill.range)}→${escapeHtml(skill.moveTo)}` : '';
  const abilities = (skill.abilities || [])
    .map(link => (context.abilityById.get(String(link.abilityId)) || {}).name)
    .filter(Boolean)
    .map(escapeHtml)
    .join('・');
  return `      <li class="skill-line${toneClass}">
        <a class="skill-line-name" href="${skillAnchor(skill)}"><span class="skill-aura skill-aura-${escapeHtml(skill.aura)}" aria-hidden="true"></span>${escapeHtml(skill.name)}</a>
        <span class="skill-line-meta">${escapeHtml(skill.range)}距離ランク${skill.rank}／${escapeHtml(skill.skillType)}／ガッツ${skill.guts}${move}</span>${abilities ? `
        <span class="skill-line-abilities">技能力：${abilities}</span>` : ''}
      </li>`;
}

function renderMonsterSkillSections(monster, context) {
  const bloodPage = context.bloodPageByBlood.get(monster.blood);
  if (!bloodPage) return '';
  const { unique, unlocks, abilityUnlocks } = skillsForMonster(monster, context);
  const bloodHref = 'index.html';
  const uniqueSection = unique.length
    ? `

  <div class="section-box">
    <div class="section-header">
      <h2 class="section-title">固有技</h2>
    </div>
    <p class="skill-section-lead">${escapeHtml(monster.name)}が使える、${escapeHtml(monster.blood)}種の中でも限られたモンスターだけの技です。</p>
    <ul class="skill-line-list">
${unique.map(skill => renderSkillSummaryRow(skill, context)).join('\n')}
    </ul>
  </div>`
    : '';
  const unlockSection = unlocks.length
    ? `

  <div class="section-box">
    <div class="section-header">
      <h2 class="section-title">${escapeHtml(monster.name)}のレア度上昇で解放できる技</h2>
    </div>
    <ul class="skill-line-list">
${unlocks.map(skill => {
    const entry = (skill.unlockedBy || []).find(item => String(item.monsterId) === monster.id);
    const owner = skill.unique
      ? (skill.owners || [])
        .map(id => (context.monsterById.get(String(id)) || {}).name)
        .filter(Boolean).map(escapeHtml).join('・')
      : `${escapeHtml(monster.blood)}種の全モンスター`;
    return `      <li class="skill-line${SKILL_TYPE_TONE[skill.skillType] ? ` skill-line--${SKILL_TYPE_TONE[skill.skillType]}` : ''}">
        <a class="skill-line-name" href="${skillAnchor(skill)}"><span class="skill-aura skill-aura-${escapeHtml(skill.aura)}" aria-hidden="true"></span>${escapeHtml(skill.name)}</a>
        <span class="skill-line-req">★${entry ? entry.rarity : '?'}以上で登録可能</span>
        <span class="skill-line-meta">${escapeHtml(skill.range)}距離ランク${skill.rank}／${escapeHtml(skill.skillType)}／ガッツ${skill.guts}／使えるのは${owner}</span>
      </li>`;
  }).join('\n')}
    </ul>
  </div>`
    : '';
  const abilityUnlockSection = abilityUnlocks.length
    ? `

  <div class="section-box">
    <div class="section-header">
      <h2 class="section-title">${escapeHtml(monster.name)}のレア度上昇で解放できる技能力</h2>
    </div>
    <p class="skill-section-lead">技そのものではなく、技についた技能力が解放されます。</p>
    <ul class="skill-line-list">
${abilityUnlocks.map(({ skill, link }) => {
    const ability = context.abilityById.get(String(link.abilityId)) || {};
    return `      <li class="skill-line${SKILL_TYPE_TONE[skill.skillType] ? ` skill-line--${SKILL_TYPE_TONE[skill.skillType]}` : ''}">
        <a class="skill-line-name" href="${skillAnchor(skill)}"><span class="skill-aura skill-aura-${escapeHtml(skill.aura)}" aria-hidden="true"></span>${escapeHtml(ability.name || link.abilityId)}</a>
        <span class="skill-line-req">★${link.unlock.level}以上で解放</span>
        <span class="skill-line-meta">${escapeHtml(skill.name)}（${escapeHtml(skill.range)}距離ランク${skill.rank}）の技能力</span>
      </li>`;
  }).join('\n')}
    </ul>
  </div>`
    : '';
  addLink(context, `monsters/${monster.monSlug}/${monster.bloodSlug}/index.html`);
  const bloodLink = `

  <div class="section-box">
    <div class="section-header">
      <h2 class="section-title">${escapeHtml(monster.blood)}種の技</h2>
    </div>
    <p class="skill-section-lead">技は血統ごとに共通です。${escapeHtml(monster.blood)}種が覚える技の一覧は血統ページにまとめています。</p>
    <div class="menu-grid">
      <a class="menu-link" href="${bloodHref}"><span class="icon">${MON_ICONS[monster.monSlug] || ''}</span>${escapeHtml(monster.blood)}種の技一覧（${bloodPage.skills.length}技）</a>
    </div>
  </div>`;
  return `${uniqueSection}${unlockSection}${abilityUnlockSection}${bloodLink}`;
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
      return `<a href="../index.html">${escapeHtml(monster.mon)}</a>`;
    })()
    : escapeHtml(monster.mon);
  // 血統ページがある血統だけパンくずへ挟む
  const breadcrumbBlood = context.bloodPageByBlood.has(monster.blood)
    ? (() => {
      addLink(context, `monsters/${monster.monSlug}/${monster.bloodSlug}/index.html`);
      return ` &gt; <a href="index.html">${escapeHtml(monster.blood)}種</a>`;
    })()
    : '';
  const navMonsters = rootLink(context, 'monsters.html', 'モンスター一覧');
  const navAssist = rootLink(context, 'assist.html', 'アシストカード一覧');
  const navGacha = rootLink(context, 'gacha/', '開催中ガチャ一覧');
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
  const skillSections = renderMonsterSkillSections(monster, context);
  const gachaAppearances = renderGachaAppearances(
    publishedGachas(context.gachasJson), 'monster', monster.id, ROOT_PREFIX, 'box'
  );
  const limitedLabel = runtime && runtime.limited
    ? runtime.limitedLabel || '限定'
    : '';
  const aura = runtime ? runtime.aura : monster.aura;
  const body = `<body class="monster-detail-page">

<header>
  <div class="header-inner">
    <a href="${ROOT_PREFIX}index.html" class="logo">LINE<span>モンスターファーム</span><span class="logo-sub">徹底攻略</span></a>
    <nav>
      ${navMonsters}
      ${navAssist}
      ${navGacha}
    </nav>
  </div>
</header>

<main class="container">
  <p class="page-breadcrumb">${breadcrumbTop} &gt; ${breadcrumbMonsters} &gt; ${breadcrumbMonType}${breadcrumbBlood} &gt; ${escapeHtml(monster.name)}</p>
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

${explanation}${formations}${skillSections}

  <div class="section-box">
    <div class="section-header">
      <h2 class="section-title">同じ血統のモンスター</h2>
    </div>
    <div class="mon-card-grid">
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
  ${GTM_TAG}
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
  const href = `${monster.bloodSlug}/${monster.id}.html`;
  const aura = runtime ? runtime.aura : monster.aura;
  const limitedLabel = limitedLabelOf(runtime || monster);
  addLink(context, monster.url.replace(/^\//, ''));
  // 解説なしは共通の縦型カード、解説ありは横型カード。
  if (!isIndexable) {
    return renderMonCard({
      href,
      image,
      name: monster.name,
      aura,
      mon: monster.mon,
      subBlood: monster.subBlood,
      limitedLabel,
      indent: '        ',
    });
  }
  const excerpt = `\n            <p class="wide-card-excerpt">${escapeHtml(descriptionFrom(editorial.explanation))}</p>`;
  const content = `${image ? `
          <img class="card-img" src="${escapeHtml(image)}" alt="${escapeHtml(monster.name)}">` : ''}
          <div class="card-info">
            <div class="card-name">${escapeHtml(monster.name)}</div>
            ${renderBadgeRow({
    aura,
    mon: monster.mon,
    limitedLabel,
    small: true,
    indent: '            ',
  })}
            <div class="mon-type-card-meta">副血統：${escapeHtml(monster.subBlood)}</div>${excerpt}
          </div>`;
  return `        <a class="card mon-type-card wide-card" href="${escapeHtml(href)}">${content}
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
  const navMonsters = rootLink(context, 'monsters.html', 'モンスター一覧', MON_TYPE_ROOT_PREFIX);
  const navAssist = rootLink(context, 'assist.html', 'アシストカード一覧', MON_TYPE_ROOT_PREFIX);
  const navGacha = rootLink(context, 'gacha/', '開催中ガチャ一覧', MON_TYPE_ROOT_PREFIX);
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
    <div class="mon-card-grid mon-type-grid">
${compactMembers.map(monster => renderMonTypeCard(monster, context)).join('\n')}
    </div>`
      : '';
    // 血統見出しは常にテキストのまま。血統ページがある血統だけ、見出しの下へ技一覧ボタンを置く。
    // 見出し自体をリンクにすると、体数の表示とリンク先（技一覧）が食い違って読める。
    // ボタンはモンスター詳細の血統導線と同じ menu-grid + menu-link を使う。
    // 見出しの横に並べると、SPで血統名とボタンが不格好に折り返すため、必ず下の行へ置く。
    const bloodPage = context.bloodPageByBlood.get(group.blood);
    const heading = `${escapeHtml(group.blood)}（${group.members.length}体）`;
    let skillNav = '';
    if (bloodPage) {
      addLink(context, `monsters/${bloodPage.monSlug}/${bloodPage.slug}/index.html`);
      skillNav = `
      <div class="menu-grid mon-type-blood-skill-nav">
        <a class="menu-link" href="${escapeHtml(bloodPage.slug)}/index.html"><span class="icon">${MON_ICONS[bloodPage.monSlug] || ''}</span>${escapeHtml(group.blood)}種の技一覧（${bloodPage.skills.length}技）</a>
      </div>`;
    }
    return `
    <div class="mon-type-blood-group">
      <h3 class="mon-type-blood-title">${heading}</h3>${skillNav}${editorialGrid}${compactGrid}
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
  ${GTM_TAG}
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
    <a href="${MON_TYPE_ROOT_PREFIX}index.html" class="logo">LINE<span>モンスターファーム</span><span class="logo-sub">徹底攻略</span></a>
    <nav>
      ${navMonsters}
      ${navAssist}
      ${navGacha}
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

// 技DBの検査。正はこの関数に一本化し、scripts/verify.js は export を参照する。
// 技も技能力も、ゲーム側の更新で内容が変わる。上書きすると戻せないので、同名は
// バージョンとして積み、表示は最新版だけにする。IDはバージョングループ共通で固定なので
// （skillId は血統ページのアンカー、abilityId は技側からの参照キー）、版が上がってもURLと参照は動かない。
const skillVersionKey = skill => `${skill.blood}|${skill.name}`;
const abilityVersionKey = ability => String(ability.name);
const versionOf = row => (Number.isInteger(row.version) ? row.version : 1);

// グループごとに最大 version の1件だけを返す。元の並び順は保つ。
function selectCurrentVersions(rows, keyOf) {
  const best = new Map();
  for (const row of rows || []) {
    const key = keyOf(row);
    const known = best.get(key);
    if (!known || versionOf(row) > versionOf(known)) best.set(key, row);
  }
  const current = new Set(best.values());
  return (rows || []).filter(row => current.has(row));
}

// 技能力テキストの [霊魂] ［火傷Lv1＜20秒＞］ 【シールド】 から中身を取り出す。
function extractBracketTokens(text) {
  return (String(text || '').match(/[[［【]([^\][］】]*)[\]］】]/g) || [])
    .map(token => token.replace(/^[[［【]|[\]］】]$/g, ''));
}

// 「火傷Lv1＜20秒＞」→「火傷」。レベル・持続時間・空白を落として名前だけにする。
function normalizeBuffToken(token) {
  return String(token || '')
    .replace(/[＜<][^＞>]*[＞>]/g, '')
    .replace(/\s+/g, '')
    .replace(/Lv\s*\d+$/i, '')
    .trim();
}

// 「祝：霊魂Lv8」→「霊魂」。接頭辞（祝：疫：）と末尾のLvを落とす。
function normalizeAbilityNameForBuff(name) {
  return normalizeBuffToken(String(name || '').replace(/^[^：:]*[：:]/, ''));
}

// 技能力に対応するバフ・デバフを、テキストの完全一致だけで拾う。
// 素の部分一致は取らない（「混乱」「衰弱」のような一般語や条件タグで誤爆するため）。
// 返り値の unknown は「角括弧にあるがバフDBにも既知の非バフ語にも無い」= 登録漏れの候補。
function detectBuffs(ability, buffByName) {
  const found = [];
  const unknown = [];
  const push = name => {
    const buff = buffByName.get(name);
    if (buff && !found.includes(buff.buffId)) found.push(buff.buffId);
  };
  for (const token of extractBracketTokens(ability.description)) {
    const name = normalizeBuffToken(token);
    if (!name) continue;
    if (buffByName.has(name)) push(name);
    // 数字入りの角括弧は [最大40%] [1回] のような数値注記でバフ名ではない
    else if (!NON_BUFF_TOKENS.includes(name) && !/[0-9０-９%％]/.test(name) && !unknown.includes(name)) {
      unknown.push(name);
    }
  }
  const fromName = normalizeAbilityNameForBuff(ability.name);
  if (buffByName.has(fromName)) push(fromName);
  // 表示順はバフDBの並び（ゲーム内ヘルプの順）にそろえる
  found.sort((a, b) => a.localeCompare(b));
  return { buffs: found, unknown };
}

// バージョングループの検査。版は1から連番で、隣り合う版で中身が同じなら
// 意味のないバージョンなので止める（更新でないなら、その行を書き換えるのが正しい）。
function checkVersionGroups(groups, errors, file, labelOf, bodyOf) {
  for (const [id, rows] of groups) {
    const sorted = [...rows].sort((a, b) => versionOf(a) - versionOf(b));
    const label = labelOf(sorted[sorted.length - 1]) || id;
    sorted.forEach((row, index) => {
      if (versionOf(row) !== index + 1) {
        errors.push(`${file} ${label}: version が1からの連番になっていません（${sorted.map(versionOf).join(', ')}）`);
      }
      if (index > 0 && bodyOf(row) === bodyOf(sorted[index - 1])) {
        errors.push(`${file} ${label}: v${versionOf(sorted[index - 1])} と v${versionOf(row)} の内容が同じです。更新でないなら版を足さずその行を直してください`);
      }
    });
  }
}

function validateSkillData(skillDb, abilityDb, idsJson, buffDb) {
  const errors = [];
  const skills = skillDb && Array.isArray(skillDb.skills) ? skillDb.skills : null;
  const abilities = abilityDb && Array.isArray(abilityDb.abilities) ? abilityDb.abilities : null;
  if (skillDb && skills === null) errors.push('monster-skills.json: skills 配列がありません');
  if (abilityDb && abilities === null) errors.push('skill-abilities.json: abilities 配列がありません');
  if (errors.length) throw new Error(errors.join('\n'));
  const buffs = buffDb && Array.isArray(buffDb.buffs) ? buffDb.buffs : null;
  if (buffDb && buffs === null) errors.push('skill-buffs.json: buffs 配列がありません');
  if (errors.length) throw new Error(errors.join('\n'));
  if (!skills && !abilities) return { skills: [], abilities: [], buffs: [], currentSkills: [], currentAbilities: [] };
  const skillList = skills || [];
  const abilityList = abilities || [];
  const buffList = buffs || [];

  // ---------------------------------------------------------------- バフ・デバフ
  const buffIds = new Set();
  const buffNames = new Set();
  buffList.forEach((buff, index) => {
    const where = `skill-buffs.json[${index}]`;
    const id = String(buff.buffId || '');
    if (!/^bf-\d{4}$/.test(id)) errors.push(`${where}: buffId が bf-#### ではありません: ${id}`);
    else if (buffIds.has(id)) errors.push(`${where}: buffId が重複しています: ${id}`);
    else buffIds.add(id);
    const name = String(buff.name || '').trim();
    if (!name) errors.push(`${where} ${id}: name が空です`);
    else if (buffNames.has(name)) errors.push(`${where}: バフ名が重複しています: ${name}`);
    else buffNames.add(name);
    if (!SKILL_BUFF_KINDS.includes(buff.kind)) {
      errors.push(`${where} ${name || id}: kind は ${SKILL_BUFF_KINDS.join('/')} です: ${buff.kind}`);
    }
    if (!String(buff.description || '').trim()) errors.push(`${where} ${name || id}: description が空です`);
  });

  // ---------------------------------------------------------------- 技能力
  // 一意キーは abilityId + version。同名は同じ abilityId を共有し、版だけが増えていく。
  const abilityIds = new Set();
  const abilityIdByName = new Map();
  const abilityNameById = new Map();
  const abilityVersions = new Map();
  abilityList.forEach((ability, index) => {
    const where = `skill-abilities.json[${index}]`;
    const id = String(ability.abilityId || '');
    const name = String(ability.name || '').trim();
    const version = ability.version;
    if (!/^sab-\d{4}$/.test(id)) errors.push(`${where}: abilityId が sab-#### ではありません: ${id}`);
    if (!name) errors.push(`${where} ${id}: name が空です`);
    if (!String(ability.description || '').trim()) errors.push(`${where} ${id}: description が空です`);
    if (!Number.isInteger(version) || version < 1) {
      errors.push(`${where} ${name || id}: version は1以上の整数です: ${version}`);
    }
    if (ability.level !== null && !Number.isInteger(ability.level)) {
      errors.push(`${where} ${id}: level は整数か null です: ${ability.level}`);
    }
    const idVersion = `${id}|${version}`;
    if (abilityIds.has(idVersion)) errors.push(`${where}: 同じ abilityId に同じ version が2件あります: ${id} v${version}`);
    else abilityIds.add(idVersion);
    // 名前とIDは1対1。片方だけ変えるとバージョングループが割れる。
    if (name) {
      const knownId = abilityIdByName.get(name);
      if (knownId === undefined) abilityIdByName.set(name, id);
      else if (knownId !== id) errors.push(`${where} ${name}: 同じ名前に abilityId が2つあります（${knownId} と ${id}）。同名はバージョン違いとして同じIDを共有します`);
      const knownName = abilityNameById.get(id);
      if (knownName === undefined) abilityNameById.set(id, name);
      else if (knownName !== name) errors.push(`${where} ${id}: 同じ abilityId に名前が2つあります（${knownName} と ${name}）`);
    }
    if (!abilityVersions.has(id)) abilityVersions.set(id, []);
    abilityVersions.get(id).push(ability);
    if (Array.isArray(ability.buffs)) {
      const seen = new Set();
      for (const buffId of ability.buffs) {
        if (!buffIds.has(String(buffId))) errors.push(`${where} ${name || id}: 存在しないバフID: ${buffId}`);
        if (seen.has(String(buffId))) errors.push(`${where} ${name || id}: 同じバフが2回あります: ${buffId}`);
        seen.add(String(buffId));
      }
    } else if (ability.buffs !== undefined) {
      errors.push(`${where} ${name || id}: buffs は配列です`);
    }
  });
  checkVersionGroups(abilityVersions, errors, 'skill-abilities.json', ability => ability.name, ability => ability.description);

  const bloodOrder = new Set(idsJson.bloodOrder);
  const monsterById = new Map(idsJson.monsters.map(monster => [monster.id, monster]));
  const skillIds = new Set();
  const skillIdByKey = new Map();
  const skillKeyById = new Map();
  const skillVersions = new Map();
  const commonSlots = new Map();

  const checkOwners = (value, where, blood) => {
    if (!Array.isArray(value)) {
      errors.push(`${where}: owners は配列です`);
      return;
    }
    for (const id of value) {
      const monster = monsterById.get(String(id));
      if (!monster) errors.push(`${where}: owners に存在しないモンスターID: ${id}`);
      else if (monster.blood !== blood) {
        errors.push(`${where}: owners の ${id} ${monster.name} は ${monster.blood}種で、技の血統 ${blood} と一致しません`);
      }
    }
  };

  // 技登録の解放元は「どのモンスターを★いくつまで上げると登録できるか」の組。
  const checkUnlockedBy = (value, where) => {
    if (!Array.isArray(value)) {
      errors.push(`${where}: unlockedBy は配列です`);
      return;
    }
    for (const entry of value) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        errors.push(`${where}: unlockedBy は { monsterId, rarity } の配列です: ${JSON.stringify(entry)}`);
        continue;
      }
      if (!monsterById.has(String(entry.monsterId))) {
        errors.push(`${where}: unlockedBy に存在しないモンスターID: ${entry.monsterId}`);
      }
      if (!Number.isInteger(entry.rarity) || entry.rarity < SKILL_RARITY_MIN || entry.rarity > SKILL_RARITY_MAX) {
        errors.push(`${where}: unlockedBy の rarity は★${SKILL_RARITY_MIN}〜${SKILL_RARITY_MAX}の整数です: ${entry.rarity}`);
      }
    }
  };

  // 共通枠の重複や表示は最新版だけで判定する。旧版は必ず同じ枠に居るため。
  const currentSkills = selectCurrentVersions(skillList, skillVersionKey);
  const currentSkillSet = new Set(currentSkills);
  skillList.forEach((skill, index) => {
    const id = String(skill.skillId || '');
    const where = `monster-skills.json[${index}] ${skill.name || id} v${skill.version}`;
    const version = skill.version;
    if (!/^sk-\d{4}$/.test(id)) errors.push(`${where}: skillId が sk-#### ではありません: ${id}`);
    if (!Number.isInteger(version) || version < 1) {
      errors.push(`${where}: version は1以上の整数です: ${version}`);
    }
    const idVersion = `${id}|${version}`;
    if (skillIds.has(idVersion)) errors.push(`${where}: 同じ skillId に同じ version が2件あります: ${id} v${version}`);
    else skillIds.add(idVersion);
    if (!String(skill.name || '').trim()) errors.push(`${where}: name が空です`);
    // 血統＋技名とIDは1対1。片方だけ変えるとバージョングループが割れる。
    if (String(skill.name || '').trim()) {
      const key = skillVersionKey(skill);
      const knownId = skillIdByKey.get(key);
      if (knownId === undefined) skillIdByKey.set(key, id);
      else if (knownId !== id) errors.push(`${where}: 同じ ${key} に skillId が2つあります（${knownId} と ${id}）。同名はバージョン違いとして同じIDを共有します`);
      const knownKey = skillKeyById.get(id);
      if (knownKey === undefined) skillKeyById.set(id, key);
      else if (knownKey !== key) errors.push(`${where}: 同じ skillId が別の技を指しています（${knownKey} と ${key}）`);
    }
    if (!skillVersions.has(id)) skillVersions.set(id, []);
    skillVersions.get(id).push(skill);
    if (!bloodOrder.has(skill.blood)) errors.push(`${where}: blood が未知です: ${skill.blood}`);
    if (!SKILL_RANGES.includes(skill.range)) errors.push(`${where}: range は ${SKILL_RANGES.join('/')} です: ${skill.range}`);
    if (!SKILL_RANKS.includes(skill.rank)) errors.push(`${where}: rank は1〜6の整数です: ${skill.rank}`);
    if (skill.moveTo !== null && !SKILL_RANGES.includes(skill.moveTo)) {
      errors.push(`${where}: moveTo は ${SKILL_RANGES.join('/')} か null です: ${skill.moveTo}`);
    }
    if (skill.moveTo === skill.range) errors.push(`${where}: moveTo が range と同じです。移動しない技は null にします`);
    if (!SKILL_AURAS.includes(skill.aura)) errors.push(`${where}: aura は ${SKILL_AURAS.join('/')} です: ${skill.aura}`);
    if (!String(skill.skillType || '').trim()) errors.push(`${where}: skillType が空です`);
    if (!Number.isInteger(skill.guts) || skill.guts < 0) errors.push(`${where}: guts は0以上の整数です: ${skill.guts}`);
    for (const field of ['damage', 'accuracy', 'gutsDown', 'critical']) {
      const value = skill[field];
      if (value !== null && !SKILL_GRADE_PATTERN.test(String(value))) {
        errors.push(`${where}: ${field} は SS〜G の評価か null です: ${value}`);
      }
    }
    // 技能力は { abilityId, unlock } の組。同じ能力名でも解放条件は技ごとに違うため、
    // 条件は能力そのものではなく「技×能力」の線に持たせる。
    if (!Array.isArray(skill.abilities)) {
      errors.push(`${where}: abilities は配列です`);
    } else {
      const seen = new Set();
      for (const link of skill.abilities) {
        if (!link || typeof link !== 'object' || Array.isArray(link)) {
          errors.push(`${where}: abilities は { abilityId, unlock } の配列です: ${JSON.stringify(link)}`);
          continue;
        }
        const abilityId = String(link.abilityId);
        if (!abilityNameById.has(abilityId)) errors.push(`${where}: abilities に未解決の能力ID: ${abilityId}`);
        if (seen.has(abilityId)) errors.push(`${where}: 同じ技に同じ能力が2回あります: ${abilityId}`);
        seen.add(abilityId);
        if (link.unlock === undefined) {
          errors.push(`${where}: abilities の unlock は条件が無ければ null にします: ${abilityId}`);
        } else if (link.unlock !== null) {
          const unlock = link.unlock;
          if (!monsterById.has(String(unlock.monsterId))) {
            errors.push(`${where}: 技能力${abilityId}の解放条件に存在しないモンスターID: ${unlock.monsterId}`);
          }
          if (!Number.isInteger(unlock.level) || unlock.level < SKILL_RARITY_MIN || unlock.level > SKILL_RARITY_MAX) {
            errors.push(`${where}: 技能力${abilityId}の解放レベルは★${SKILL_RARITY_MIN}〜${SKILL_RARITY_MAX}の整数です: ${unlock.level}`);
          }
        }
      }
    }
    if (typeof skill.unique !== 'boolean') errors.push(`${where}: unique は真偽値です: ${skill.unique}`);
    checkOwners(skill.owners, where, skill.blood);
    checkUnlockedBy(skill.unlockedBy, where);
    if (Array.isArray(skill.owners)) {
      if (skill.unique === true && skill.owners.length === 0) {
        errors.push(`${where}: 固有技は owners を1件以上必要とします`);
      }
      if (skill.unique === false && skill.owners.length > 0) {
        errors.push(`${where}: 血統共通技の owners は空配列です`);
      }
    }
    if (skill.unique === false && currentSkillSet.has(skill)) {
      const slot = `${skill.blood}|${skill.range}|${skill.rank}`;
      if (commonSlots.has(slot)) {
        errors.push(`${where}: ${skill.blood}種 ${skill.range}距離ランク${skill.rank} に共通技が2件あります（${commonSlots.get(slot)} と重複）`);
      } else {
        commonSlots.set(slot, skill.name || id);
      }
    }
  });

  const skillBody = skill => JSON.stringify([
    skill.range, skill.rank, skill.moveTo, skill.aura, skill.skillType, skill.guts,
    skill.damage, skill.accuracy, skill.gutsDown, skill.critical, skill.note,
    (skill.abilities || []).map(link => [link.abilityId, link.unlock]),
    skill.unique, skill.owners, skill.unlockedBy,
  ]);
  checkVersionGroups(skillVersions, errors, 'monster-skills.json', skill => `${skill.blood}種 ${skill.name}`, skillBody);

  if (errors.length) throw new Error(errors.join('\n'));
  return {
    skills: skillList,
    abilities: abilityList,
    buffs: buffList,
    currentSkills,
    currentAbilities: selectCurrentVersions(abilityList, abilityVersionKey),
  };
}

// 技データが1件でもある血統だけページを生成する。
function gateBloods(inputs) {
  // 血統ページに載せるのは各技の最新版だけ。旧版はロールバック用にDBへ残るが表示しない。
  const skills = selectCurrentVersions(
    inputs.skillsJson && Array.isArray(inputs.skillsJson.skills) ? inputs.skillsJson.skills : [],
    skillVersionKey
  );
  const byBlood = new Map();
  for (const skill of skills) {
    if (!byBlood.has(skill.blood)) byBlood.set(skill.blood, []);
    byBlood.get(skill.blood).push(skill);
  }
  const bloodSlug = inputs.idsJson.bloodSlug;
  return inputs.idsJson.bloodOrder
    .filter(blood => byBlood.has(blood))
    .map(blood => {
      const members = inputs.monsters
        .filter(monster => monster.blood === blood)
        .sort((a, b) => Number(a.id) - Number(b.id));
      const reasons = [];
      if (!bloodSlug[blood]) reasons.push('monster-ids.json に bloodSlug がありません');
      if (!members.length) reasons.push('所属モンスターが0体です');
      return {
        blood,
        slug: bloodSlug[blood],
        mon: members.length ? members[0].mon : '',
        monSlug: members.length ? members[0].monSlug : '',
        members,
        skills: byBlood.get(blood),
        reasons,
        eligible: reasons.length === 0,
      };
    });
}

function renderSkillAbilityText(text) {
  return escapeHtml(String(text || '')).replace(/\r?\n/g, '<br>');
}

// 技の表示順。血統共通技を先に、固有技を後に置く。
function sortSkillsInCell(skills) {
  return [...skills].sort((a, b) => {
    if (a.unique !== b.unique) return a.unique ? 1 : -1;
    const orderA = Number.isInteger(a.sortOrder) ? a.sortOrder : Number.MAX_SAFE_INTEGER;
    const orderB = Number.isInteger(b.sortOrder) ? b.sortOrder : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return String(a.skillId).localeCompare(String(b.skillId));
  });
}

// 技チップ。移動先は表に出さず、詳細だけで扱う。
function renderSkillChip(skill, context) {
  const ownerNames = (skill.owners || [])
    .map(id => (context.monsterById.get(String(id)) || {}).name)
    .filter(Boolean);
  const uniqueLabel = skill.unique
    ? `<span class="skill-chip-unique">固有${ownerNames.length ? `：${escapeHtml(ownerNames.join('・'))}` : ''}</span>`
    : '';
  const tone = SKILL_TYPE_TONE[skill.skillType];
  const toneClass = tone ? ` skill-chip--${tone}` : '';
  return `            <button type="button" class="skill-chip${toneClass}" data-skill="${escapeHtml(skill.skillId)}" aria-controls="${escapeHtml(skill.skillId)}" aria-expanded="false">
              <span class="skill-aura skill-aura-${escapeHtml(skill.aura)}" aria-hidden="true"></span>
              <span class="skill-chip-name">${escapeHtml(skill.name)}</span>
              <span class="skill-chip-meta">${escapeHtml(skill.skillType)}／ガッツ${skill.guts}</span>${uniqueLabel ? `
              ${uniqueLabel}` : ''}
            </button>`;
}

function renderSkillDetailRow(skill, context, abilityById, columnCount) {
  const monsterLink = id => {
    const monster = context.monsterById.get(String(id));
    if (!monster) return '';
    const target = monster.url.replace(/^\//, '');
    addLink(context, target);
    return `<a href="${ROOT_PREFIX}${escapeHtml(target)}">${escapeHtml(monster.name)}</a>`;
  };
  const grade = value => (value === null || value === undefined ? '—' : escapeHtml(value));
  // 見出し列の色は技種に合わせる（ちから＝黄・かしこさ＝緑）
  const tone = SKILL_TYPE_TONE[skill.skillType];
  const detailTone = tone ? ` skill-detail-table--${tone}` : '';
  // 左2列＝技そのものの条件、右2列＝性能。ゲーム内の並びに合わせる。
  const pairs = [
    ['技種', escapeHtml(skill.skillType), 'ダメージ', grade(skill.damage)],
    ['発動間合い', `${escapeHtml(skill.range)}距離`, '命中率', grade(skill.accuracy)],
    ['移動先', skill.moveTo ? `${escapeHtml(skill.range)}→${escapeHtml(skill.moveTo)}` : '移動なし', 'ガッツダウン', grade(skill.gutsDown)],
    ['消費ガッツ', String(skill.guts), 'クリティカル率', grade(skill.critical)],
  ];
  const wideRows = [];
  if (skill.unique) {
    const owners = (skill.owners || []).map(monsterLink).filter(Boolean).join('・');
    if (owners) wideRows.push(['使用モンスター', owners]);
  }
  const unlocks = (skill.unlockedBy || [])
    .map(entry => {
      const link = monsterLink(entry.monsterId);
      return link ? `${link}（★${entry.rarity}以上）` : '';
    })
    .filter(Boolean)
    .join('・');
  if (unlocks) wideRows.push(['技登録の解放元', unlocks]);

  // バフ・デバフは、それを起こす技能力のカードの中に置く。技単位でまとめると
  // どの能力が付けるものか分からなくなる。見出しは付けない（カードの文脈で読める）。
  const renderBuffs = ability => {
    const items = (ability.buffs || [])
      .map(buffId => context.buffById.get(String(buffId)))
      .filter(Boolean)
      .map(buff => {
        const kindClass = buff.kind === 'デバフ' ? 'debuff' : 'buff';
        const note = String(buff.note || '').trim()
          ? `<span class="skill-buff-note">${escapeHtml(buff.note.trim())}</span>`
          : '';
        return `              <p class="skill-buff skill-buff--${kindClass}"><span class="skill-buff-name">${escapeHtml(buff.name)}</span>${renderSkillAbilityText(buff.description)}${note}</p>`;
      });
    return items.length ? `
            <div class="skill-ability-buffs">
${items.join('\n')}
            </div>` : '';
  };
  const abilityCards = (skill.abilities || [])
    .map(link => ({ link, ability: abilityById.get(String(link.abilityId)) }))
    .filter(entry => entry.ability)
    .map(({ link, ability }) => {
      const unlock = link.unlock
        ? `<span class="skill-ability-unlock">${monsterLink(link.unlock.monsterId) || ''}を★${link.unlock.level}以上で解放</span>`
        : '';
      return `          <div class="skill-ability">
            <p class="skill-ability-name">${escapeHtml(ability.name)}${unlock ? `
              ${unlock}` : ''}</p>
            <p class="skill-ability-desc">${renderSkillAbilityText(ability.description)}</p>${renderBuffs(ability)}
          </div>`;
    })
    .join('\n');
  const note = String(skill.note || '').trim()
    ? `
        <p class="skill-detail-note">${escapeHtml(skill.note.trim())}</p>`
    : '';
  return `        <tr class="skill-detail${tone ? ` skill-detail--${tone}` : ''}" id="${escapeHtml(skill.skillId)}" hidden>
          <td colspan="${columnCount}">
            <div class="skill-detail-inner">
            <button type="button" class="skill-detail-close" aria-label="技詳細を閉じる">×</button>
            <div class="skill-detail-anim"><div class="skill-detail-clip">
            <h3 class="skill-detail-name"><span class="skill-aura skill-aura-${escapeHtml(skill.aura)}" aria-hidden="true"></span>${escapeHtml(skill.name)}<span class="skill-detail-place">${escapeHtml(skill.range)}距離ランク${skill.rank}</span></h3>
            <table class="skill-detail-table${detailTone}">
              <tbody>
${pairs.map(([labelA, valueA, labelB, valueB]) => `                <tr><th>${escapeHtml(labelA)}</th><td>${valueA}</td><th>${escapeHtml(labelB)}</th><td>${valueB}</td></tr>`).join('\n')}
${wideRows.map(([label, value]) => `                <tr><th>${escapeHtml(label)}</th><td colspan="3">${value}</td></tr>`).join('\n')}
              </tbody>
            </table>
        <h4 class="skill-detail-subtitle">技能力</h4>
${abilityCards || '          <p class="skill-detail-none">なし</p>'}${note}
            </div></div>
            </div>
          </td>
        </tr>`;
}

// 行＝ランク1〜6、列＝技を発動できる間合い。技詳細は押した行の直下へ開く。
function renderSkillTable(skills, context, abilityById) {
  const columnCount = SKILL_RANGES.length + 1;
  const cells = new Map();
  for (const skill of skills) {
    const key = `${skill.range}|${skill.rank}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(skill);
  }
  const rows = SKILL_RANKS.map(rank => {
    const rankSkills = [];
    const columns = SKILL_RANGES.map(range => {
      const inCell = sortSkillsInCell(cells.get(`${range}|${rank}`) || []);
      rankSkills.push(...inCell);
      const rangeClass = ` skill-col-${SKILL_RANGE_TONE[range]}`;
      const uniqueId = `skill-unique-${SKILL_RANGE_TONE[range]}-${rank}`;
      // 未実装の枠は空セル。×を置くと表が読みにくくなる
      if (!inCell.length) {
        return `          <td class="skill-cell skill-cell--empty${rangeClass}"></td>`;
      }
      // 固有技はセル内でたたむ。共通技だけを常に見せ、横幅と縦の見通しを保つ。
      const commonSkills = inCell.filter(skill => !skill.unique);
      const uniqueSkills = inCell.filter(skill => skill.unique);
      const commonHtml = commonSkills.map(skill => renderSkillChip(skill, context)).join('\n');
      const uniqueHtml = uniqueSkills.length
        ? `${commonHtml ? '\n' : ''}            <button type="button" class="skill-unique-toggle" aria-expanded="false" aria-controls="${uniqueId}"><span class="skill-unique-label">固有技を見る</span><span class="skill-unique-count">${uniqueSkills.length}</span></button>
            <div class="skill-unique-wrap" id="${uniqueId}" hidden>
${uniqueSkills.map(skill => renderSkillChip(skill, context)).join('\n')}
            </div>`
        : '';
      return `          <td class="skill-cell${rangeClass}">
${commonHtml}${uniqueHtml}
          </td>`;
    }).join('\n');
    const detailRows = rankSkills
      .map(skill => renderSkillDetailRow(skill, context, abilityById, columnCount))
      .join('\n');
    return `        <tr class="skill-rank-row">
          <th scope="row" class="skill-rank"><span class="skill-rank-label">ランク${rank}</span></th>
${columns}
        </tr>${detailRows ? `\n${detailRows}` : ''}`;
  }).join('\n');
  return `    <p class="skill-matrix-note">技名を押すと詳細がその場で開きます。空欄は未実装の枠です。</p>
    <div class="skill-matrix-scroll">
      <table class="skill-matrix">
        <thead>
          <tr>
            <th scope="col"><span class="skill-visually-hidden">ランク</span></th>
${SKILL_RANGES.map(range => `            <th scope="col" class="skill-range-head skill-range-${SKILL_RANGE_TONE[range]}">${escapeHtml(range)}距離</th>`).join('\n')}
          </tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </div>`;
}

function bloodBreadcrumbJson(bloodGate, hasMonTypePage) {
  const itemListElement = [
    { '@type': 'ListItem', position: 1, name: 'LINEモンスターファーム徹底攻略', item: `${SITE_URL}/` },
    { '@type': 'ListItem', position: 2, name: 'モンスター一覧', item: `${SITE_URL}/monsters.html` },
  ];
  if (hasMonTypePage) {
    itemListElement.push({
      '@type': 'ListItem',
      position: 3,
      name: bloodGate.mon,
      item: `${SITE_URL}/monsters/${bloodGate.monSlug}/`,
    });
  }
  itemListElement.push({
    '@type': 'ListItem',
    position: itemListElement.length + 1,
    name: `${bloodGate.blood}種`,
    item: `${SITE_URL}/monsters/${bloodGate.monSlug}/${bloodGate.slug}/`,
  });
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement,
  });
}

function bloodDescription(bloodGate) {
  return descriptionFrom(
    `${bloodGate.blood}種の技を間合い・ランク別にまとめた一覧表です。`
    + `遠中近零それぞれの技名、消費ガッツ、ダメージや命中率の評価、技能力、`
    + `固有技と技登録の解放元モンスターまで掲載しています。`
  );
}

function renderBloodPage(bloodGate, context, abilityById, otherBloodGates) {
  const skills = bloodGate.skills;
  const uniqueSkills = skills.filter(skill => skill.unique);
  const title = `${bloodGate.blood}種の技一覧（${skills.length}技）と所属モンスター${bloodGate.members.length}体 | LINEモンスターファーム徹底攻略`;
  const description = bloodDescription(bloodGate);
  const canonical = `${SITE_URL}/monsters/${bloodGate.monSlug}/${bloodGate.slug}/`;
  const hasMonTypePage = context.eligibleMonSlugs.has(bloodGate.monSlug);
  const breadcrumbTop = rootLink(context, 'index.html', 'トップ');
  const breadcrumbMonsters = rootLink(context, 'monsters.html', 'モンスター一覧');
  const breadcrumbMonType = hasMonTypePage
    ? (() => {
      addLink(context, `monsters/${bloodGate.monSlug}/index.html`);
      return `<a href="../index.html">${escapeHtml(bloodGate.mon)}</a>`;
    })()
    : escapeHtml(bloodGate.mon);
  const navMonsters = rootLink(context, 'monsters.html', 'モンスター一覧');
  const navAssist = rootLink(context, 'assist.html', 'アシストカード一覧');
  const navGacha = rootLink(context, 'gacha/', '開催中ガチャ一覧');
  const privacy = rootLink(context, 'privacy.html', 'プライバシーポリシー');

  const memberCards = bloodGate.members.map(monster => {
    addLink(context, monster.url.replace(/^\//, ''));
    const runtime = context.runtimeById.get(monster.id);
    return renderMonCard({
      href: `${monster.id}.html`,
      image: resolveImage(monster.id, context).url,
      name: monster.name,
      aura: runtime ? runtime.aura : monster.aura,
      mon: monster.mon,
      subBlood: monster.subBlood,
      limitedLabel: limitedLabelOf(runtime || monster),
    });
  }).join('\n');

  const uniqueList = uniqueSkills.length
    ? `
  <section class="section">
    <h2 class="section-title">固有技</h2>
    <p class="skill-unique-lead">${escapeHtml(bloodGate.blood)}種のうち、特定のモンスターだけが使える技です。</p>
    <ul class="skill-unique-list">
${uniqueSkills.map(skill => {
    const owners = (skill.owners || [])
      .map(id => (context.monsterById.get(String(id)) || {}).name)
      .filter(Boolean)
      .map(escapeHtml)
      .join('・');
    return `      <li><a href="#${escapeHtml(skill.skillId)}">${escapeHtml(skill.name)}</a>（${escapeHtml(skill.range)}距離ランク${skill.rank}／${owners}）</li>`;
  }).join('\n')}
    </ul>
  </section>`
    : '';

  const siblings = otherBloodGates.filter(other => other.monSlug === bloodGate.monSlug);
  const siblingLinks = siblings.map(other => {
    addLink(context, `monsters/${other.monSlug}/${other.slug}/index.html`);
    return `      <a class="menu-link" href="../${escapeHtml(other.slug)}/index.html"><span class="icon">${MON_ICONS[other.monSlug] || ''}</span> ${escapeHtml(other.blood)}種の技</a>`;
  }).join('\n');
  const monTypeLink = hasMonTypePage
    ? `      <a class="menu-link" href="../index.html"><span class="icon">${MON_ICONS[bloodGate.monSlug] || ''}</span> ${escapeHtml(bloodGate.mon)}のモンスター一覧</a>`
    : '';
  const navLinks = [siblingLinks, monTypeLink].filter(Boolean).join('\n');
  const relatedSection = navLinks
    ? `

  <section class="section">
    <h2 class="section-title">関連ページ</h2>
    <div class="menu-grid">
${navLinks}
    </div>
  </section>`
    : '';

  const body = `<body class="blood-page">

<header>
  <div class="header-inner">
    <a href="${ROOT_PREFIX}index.html" class="logo">LINE<span>モンスターファーム</span><span class="logo-sub">徹底攻略</span></a>
    <nav>
      ${navMonsters}
      ${navAssist}
      ${navGacha}
    </nav>
  </div>
</header>

<main class="container">
  <p class="page-breadcrumb">${breadcrumbTop} &gt; ${breadcrumbMonsters} &gt; ${breadcrumbMonType} &gt; ${escapeHtml(bloodGate.blood)}種</p>
  <h1 class="page-title">${escapeHtml(bloodGate.blood)}種の技一覧</h1>

  <section class="section">
    <h2 class="section-title">間合い・ランク別の技</h2>
${renderSkillTable(skills, context, abilityById)}
  </section>${uniqueList}

  <section class="section">
    <h2 class="section-title">${escapeHtml(bloodGate.blood)}種のモンスター（${bloodGate.members.length}体）</h2>
    <div class="mon-card-grid">
${memberCards}
    </div>
  </section>${relatedSection}
</main>

<footer>
  &copy; 2026 LINEモンスターファーム徹底攻略 ／ 非公式ファンサイト
  ／ ${privacy}
</footer>

<script>
(function () {
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 別の技へ切り替えるときは即座に閉じ、明示的に閉じたときだけアニメを見せる
  function closeRow(row, animate) {
    var box = row.querySelector('.skill-detail-anim');
    if (!box || !animate || reduced) {
      if (box) box.classList.remove('is-closing');
      row.hidden = true;
      return;
    }
    box.classList.add('is-closing');
    box.addEventListener('animationend', function () {
      box.classList.remove('is-closing');
      row.hidden = true;
    }, { once: true });
  }

  function closeAll() {
    var rows = document.querySelectorAll('.skill-detail');
    for (var i = 0; i < rows.length; i++) closeRow(rows[i], false);
    var chips = document.querySelectorAll('.skill-chip');
    for (var j = 0; j < chips.length; j++) chips[j].setAttribute('aria-expanded', 'false');
  }

  function setToggleLabel(toggle, open) {
    var label = toggle.querySelector('.skill-unique-label');
    if (label) label.textContent = open ? '固有技を隠す' : '固有技を見る';
  }

  // たたまれた固有技を指す導線（#sk-0001 など）から来たときは、その入れ物も開く
  function revealChip(chip) {
    if (!chip) return;
    var wrap = chip.closest('.skill-unique-wrap');
    if (!wrap || !wrap.hidden) return;
    wrap.hidden = false;
    var toggle = document.querySelector('.skill-unique-toggle[aria-controls="' + wrap.id + '"]');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'true');
      setToggleLabel(toggle, true);
    }
  }

  function openSkill(id) {
    var row = document.getElementById(id);
    if (!row) return null;
    closeAll();
    row.hidden = false;
    var chip = document.querySelector('.skill-chip[data-skill="' + id + '"]');
    if (chip) { revealChip(chip); chip.setAttribute('aria-expanded', 'true'); }
    return chip;
  }

  document.addEventListener('click', function (event) {
    var closer = event.target.closest('.skill-detail-close');
    if (closer) {
      var openRow = closer.closest('.skill-detail');
      if (openRow) {
        closeRow(openRow, true);
        var opener = document.querySelector('.skill-chip[data-skill="' + openRow.id + '"]');
        if (opener) { opener.setAttribute('aria-expanded', 'false'); opener.focus(); }
      }
      return;
    }
    var toggle = event.target.closest('.skill-unique-toggle');
    if (toggle) {
      var wrap = document.getElementById(toggle.getAttribute('aria-controls'));
      if (wrap) {
        var open = wrap.hidden;
        wrap.hidden = !open;
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        setToggleLabel(toggle, open);
      }
      return;
    }
    var chip = event.target.closest('.skill-chip');
    if (!chip) return;
    var id = chip.getAttribute('data-skill');
    var row = document.getElementById(id);
    if (!row) return;
    if (!row.hidden) {
      closeRow(row, true);
      chip.setAttribute('aria-expanded', 'false');
      return;
    }
    openSkill(id);
  });

  // モンスター詳細から index.html#sk-0001 で来たときに、その技を開いて見せる
  function openFromHash() {
    var id = location.hash.slice(1);
    if (!/^sk-\\d{4}$/.test(id)) return;
    var chip = openSkill(id);
    if (chip) chip.scrollIntoView({ block: 'center' });
  }
  window.addEventListener('hashchange', openFromHash);
  openFromHash();
})();
<\/script>

</body>
`;
  const contentCharacters = visibleChars(body);
  const indexable = contentCharacters >= INDEXABLE_THRESHOLD;
  const robotsMeta = indexable ? '' : '\n  <meta name="robots" content="noindex,follow">';
  const adsense = indexable
    ? '\n  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7841397391542171" crossorigin="anonymous"></script>'
    : '';
  const html = `<!-- このファイルは build.js が自動生成しています。直接編集しないでください。 -->
<!-- 元データ: src/data/monster-skills.json / src/data/skill-abilities.json / src/data/monster-ids.json -->
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  ${GTM_TAG}
  <link rel="icon" href="${ROOT_PREFIX}S__94175247.jpg">
  <link rel="apple-touch-icon" href="${ROOT_PREFIX}S__94175247.jpg">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">${robotsMeta}
  <link rel="canonical" href="${canonical}">
  <script type="application/ld+json">${bloodBreadcrumbJson(bloodGate, hasMonTypePage)}</script>
  <link rel="stylesheet" href="${ROOT_PREFIX}style.css">
  <link rel="stylesheet" href="${ROOT_PREFIX}blood.css">
  <noscript><style>.skill-detail[hidden]{display:table-row}.skill-unique-wrap[hidden]{display:block}.skill-unique-toggle{display:none}</style></noscript>${adsense}
</head>
${body}</html>
`;
  return {
    path: `monsters/${bloodGate.monSlug}/${bloodGate.slug}/index.html`,
    html,
    title,
    description,
    canonical,
    priority: '0.6',
    indexable,
    contentCharacters,
  };
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
  const generatedUrlPattern = /<loc>https:\/\/line-monster-farm-tetteikouryaku\.com\/(?:monsters\/(?:[^/]+\/(?:index\.html)?|[^/]+\/[^/]+\/(?:index\.html)?|[^/]+\/[^/]+\/\d{4}\.html)|cards\/[^/]+\.html|gacha\/(?:\d{8}-\d+\.html)?)<\/loc>/;
  const existingBlocks = matches
    .map(match => match[0])
    .filter(block => !generatedUrlPattern.test(block));

  if (existingBlocks.length !== 24) {
    throw new Error(`sitemap.xml の手書きURLが24件ではありません: ${existingBlocks.length}件`);
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

function logBuild(inputs, gates, monTypeGates, bloodGates, bloodPages, outputCounts, context, brokenLinks) {
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
  const skippedBloods = bloodGates.filter(bloodGate => !bloodGate.eligible);
  const skillCount = ((inputs.skillsJson && inputs.skillsJson.skills) || []).length;
  if (!skillCount) {
    console.log('  血統ページ   技データが0件のため生成なし');
  } else {
    console.log(`  血統ページ  生成 ${bloodPages.length}件 / 技 ${skillCount}件`);
    for (const page of bloodPages) {
      console.log(`    ${page.path}  ${page.contentCharacters}字${page.indexable ? '' : `（noindex・あと${INDEXABLE_THRESHOLD - page.contentCharacters}字）`}`);
    }
    for (const bloodGate of skippedBloods) {
      console.log(`    ${bloodGate.blood}: ${bloodGate.reasons.join(' / ')}`);
    }
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
  validateSkillData(inputs.skillsJson, inputs.skillAbilitiesJson, inputs.idsJson, inputs.skillBuffsJson);
  const detailEntries = createDetailEntries(inputs);
  const monTypeGates = gateMonTypes(inputs);
  const bloodGates = gateBloods(inputs);
  const eligibleMonTypes = monTypeGates.filter(monType => monType.eligible);
  const eligibleBloods = bloodGates.filter(bloodGate => bloodGate.eligible);
  const context = createBuildContext(inputs, eligibleMonTypes, eligibleBloods);
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
  const bloodPages = eligibleBloods.map(bloodGate => renderBloodPage(
    bloodGate,
    context,
    context.abilityById,
    eligibleBloods.filter(other => other.blood !== bloodGate.blood)
  ));
  const pages = detailPages.concat(monTypePages, bloodPages);
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
  const bloodSitemapPages = bloodPages
    .filter(page => page.indexable)
    .map(page => ({ canonical: page.canonical, priority: page.priority }));
  const sitemap = renderSitemap(
    inputs.sitemap,
    sitemapPages.concat(bloodSitemapPages, assistBuild.sitemapPages, gachaBuild.sitemapPages)
  );
  const brokenLinks = context.linkTargets.filter(target => !linkExists(target, context.generatedPaths));
  if (brokenLinks.length) {
    throw new Error(`リンク先が存在しません: ${brokenLinks.join(', ')}`);
  }

  const outputCounts = {
    new: 0,
    updated: 0,
    unchanged: 0,
    total: pages.length + 7 + gachaBuild.outputs.length,
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
  // 対応表はカードDBの射影として毎回生成し、カード追加時の手作業を不要にする。
  outputCounts[writeIfChanged(
    LMFDB_CARD_MAP_FILE,
    renderLmfdbCardMap(inputs.assistCards)
  )]++;
  logBuild(inputs, detailPages, monTypeGates, bloodGates, bloodPages, outputCounts, context, brokenLinks);
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
  SKILL_RANGES,
  SKILL_RANKS,
  SKILL_AURAS,
  SKILL_GRADE_PATTERN,
  SKILL_RARITY_MIN,
  SKILL_RARITY_MAX,
  SKILL_BUFF_KINDS,
  NON_BUFF_TOKENS,
  validateSkillData,
  selectCurrentVersions,
  skillVersionKey,
  abilityVersionKey,
  detectBuffs,
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
