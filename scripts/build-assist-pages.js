#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const SITE_URL = 'https://line-monster-farm-tetteikouryaku.com';
const INPUTS = {
  cards: 'src/data/assist-cards.json',
  effects: 'src/data/assist-effects.json',
  abilities: 'src/data/assist-abilities.json',
};
const RANK_ORDER = ['無凸', '1凸', '2凸', '3凸', '4凸'];
const INDEXABLE_VISIBLE_CHARS = 800;
const INDEXABLE_EXPLANATION_CHARS = 50;
const ADSENSE_TAG = '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7841397391542171" crossorigin="anonymous"></script>';
const ASSIST_INDEX = 'assist.html';
const ASSIST_LIST_START = '<!-- ASSIST_CARD_LIST:START -->';
const ASSIST_LIST_END = '<!-- ASSIST_CARD_LIST:END -->';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO, relativePath), 'utf8'));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeWithBreaks(value) {
  return String(value).split(/<br\s*\/?>/gi).map(escapeHtml).join('<br>');
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, '');
}

function displayValue(value) {
  if (Array.isArray(value)) return value.map(escapeHtml).join(' / ');
  return escapeHtml(value);
}

function descriptionFor(card) {
  return `${card.name}（${card.rarity}・${card.aura}）のアシストカード詳細。${card.cardType}の基本情報、評価、アシスト効果、能力、管理者解説を掲載しています。`;
}

function renderRows(rows) {
  return rows.map(([label, value]) => `      <tr><th>${escapeHtml(label)}</th><td>${displayValue(value)}</td></tr>`).join('\n');
}

function renderPairRows(rows) {
  const cells = rows.map(([label, value]) => `<th>${escapeHtml(label)}</th><td>${displayValue(value)}</td>`);
  const lines = [];
  for (let i = 0; i < cells.length; i += 2) {
    const second = cells[i + 1] || '<td colspan="2"></td>';
    lines.push(`      <tr>${cells[i]}${second}</tr>`);
  }
  return lines.join('\n');
}

function renderRatings(card) {
  const labels = [
    ['ikusei', '総合力育成'],
    ['karyo', '火力'],
    ['battle', 'バトル性能'],
    ['ta', '他オーラモン類'],
  ];
  const rawRatings = labels.filter(([key]) => card.ratings && card.ratings[key] !== null)
    .map(([key, label]) => ({ key, label, value: Number(card.ratings[key]) }));
  const floorAverage = values => values.length
    ? Math.floor((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
    : null;
  const sogo = floorAverage(rawRatings.map(rating => rating.value));
  const itti = floorAverage(rawRatings.filter(rating => rating.key !== 'ta').map(rating => rating.value));
  const ratings = [
    ...(sogo === null ? [] : [{ label: '総合評価', value: sogo, summary: true }]),
    ...(itti === null ? [] : [{ label: '一致評価', value: itti, summary: true }]),
    ...rawRatings,
  ];
  if (!ratings.length) return '';
  return `
  <section class="section">
    <h2 class="section-title">管理者による評価</h2>
    <div class="assist-rating-grid">
${ratings.map(rating => `      <div class="assist-rating-card${rating.summary ? ' assist-rating-card--summary' : ''}">
        <div class="assist-rating-label">${escapeHtml(rating.label)}</div>
        <span class="assist-rating-value">${escapeHtml(Number(rating.value).toFixed(1))}</span><span class="assist-rating-max">/ 5.0</span>
      </div>`).join('\n')}
    </div>
  </section>`;
}

function renderStats(card) {
  const rows = Array.isArray(card.stats) ? card.stats.map(row => [row.label, row.value]) : [];
  if (!rows.length) return '';
  return `
  <section class="section">
    <h2 class="section-title">ステータス</h2>
    <table class="assist-detail-table">
${renderRows(rows)}
    </table>
  </section>`;
}

function renderUnlockDots(rank) {
  const filled = RANK_ORDER.indexOf(rank);
  if (filled < 0) return '';
  const dots = Array.from({ length: 4 }, (_, index) => (index < filled ? '<i class="on"></i>' : '<i></i>')).join('');
  return `<span class="unlock-dots" aria-label="解放段階 ${filled} / 4">${dots}</span>`;
}

function renderEffects(effects) {
  if (!effects.length) return '';
  const groups = RANK_ORDER.map(rank => ({
    rank,
    effects: effects.filter(effect => effect.unlockRank === rank)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  })).filter(group => group.effects.length);
  return `
  <section class="section">
    <h2 class="section-title">アシスト効果</h2>
${groups.map(group => `    <h3 class="assist-subtitle">${escapeHtml(group.rank)}${renderUnlockDots(group.rank)}</h3>
    <table class="assist-detail-table">
${group.effects.map(effect => `      <tr><th>${escapeHtml(effect.name)}</th><td>${escapeWithBreaks(effect.description)}</td></tr>`).join('\n')}
    </table>`).join('\n')}
  </section>`;
}

function renderAbilityCard(ability, indent) {
  return `${indent}<article class="assist-ability-card${ability.source === 'イベント' ? ' is-event' : ''}" data-source="${escapeHtml(ability.source)}">
${indent}  <h3 class="assist-ability-title">${escapeHtml(ability.name)}</h3>
${indent}  <p class="comment-text">${escapeWithBreaks(ability.description)}</p>
${indent}  <div class="comment-meta">
${indent}    <span class="comment-date">入手元：${escapeHtml(ability.source)}${ability.tags.length ? ` ／ タグ：${ability.tags.map(escapeHtml).join('、')}` : ''}</span>
${indent}  </div>
${indent}</article>`;
}

function renderAbilities(abilities) {
  if (!abilities.length) return '';
  const eventAbilities = abilities.filter(ability => ability.source === 'イベント');
  const otherAbilities = abilities.filter(ability => ability.source !== 'イベント');
  const blocks = [];
  if (eventAbilities.length) {
    blocks.push(eventAbilities.map(ability => renderAbilityCard(ability, '    ')).join('\n'));
  }
  if (otherAbilities.length) {
    blocks.push(`    <div class="assist-abilities-sub">
${otherAbilities.map(ability => renderAbilityCard(ability, '      ')).join('\n')}
    </div>`);
  }
  return `
  <section class="section">
    <h2 class="section-title">能力</h2>
${blocks.join('\n')}
  </section>`;
}

function renderExplanation(card) {
  if (!card.explanation) return '';
  return `
  <section class="section">
    <h2 class="section-title">管理者による解説</h2>
    <div class="explanation-body">${escapeHtml(card.explanation)}</div>
  </section>`;
}

function renderFormations(card, cardById) {
  if (!card.formations.length) return '';
  return `
  <section class="section">
    <h2 class="section-title">おすすめ編成</h2>
${card.formations.map(formation => `    <h3 class="assist-subtitle">${escapeHtml(formation.title)}</h3>
    <p>編成：${formation.cards.filter(Boolean).map(id => escapeHtml(cardById.get(id).name)).join(' / ') || '未設定'}</p>${formation.rental ? `
    <p>レンタル：${escapeHtml(cardById.get(formation.rental).name)}</p>` : ''}`).join('\n')}
  </section>`;
}

function renderPage(card, effects, abilities, cardById, indexable, gachaAppearances = '') {
  const canonical = `${SITE_URL}/cards/${card.cardId}.html`;
  const title = `${card.name}（${card.rarity}・${card.aura}）| LINEモンスターファーム徹底攻略`;
  const robotsMeta = indexable ? '' : '\n  <meta name="robots" content="noindex,follow">';
  const adsense = indexable ? `\n  ${ADSENSE_TAG}` : '';
  const basicRows = [
    ['レアリティ', card.rarity],
    ['オーラ', card.aura],
    ['カードタイプ', card.cardType],
    ['アクセサリー', card.accessoryStatus === 'yes' ? '○' : card.accessoryStatus === 'no' ? 'なし' : null],
    ['モン類', card.monType],
    ['イベント2', card.event2],
    ['実装日', card.releasedAt],
  ].filter(([, value]) => value !== null && (!Array.isArray(value) || value.length));
  return `<!-- このファイルは build.js が自動生成しています。直接編集しないでください。 -->
<!-- 元データ: src/data/assist-cards.json / src/data/assist-effects.json / src/data/assist-abilities.json -->
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(descriptionFor(card))}">${robotsMeta}
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="stylesheet" href="../style.css">
  <link rel="stylesheet" href="../assist-detail.css">${adsense}
</head>
<body class="assist-detail-page">
<header>
  <div class="header-inner">
    <a href="../index.html" class="logo">LINE<span>モンスターファーム</span>徹底攻略</a>
    <nav>
      <a href="../index.html">トップ</a>
      <a href="../monsters.html">モンスター一覧</a>
      <a href="../assist.html" class="active">アシストカード一覧</a>
    </nav>
  </div>
</header>

<main class="container">
  <p class="page-breadcrumb"><a href="../index.html">トップ</a> &gt; <a href="../assist.html">アシストカード</a> &gt; ${escapeHtml(card.name)}</p>
  <h1 class="page-title">${escapeHtml(card.name)}（${escapeHtml(card.rarity)}）</h1>

  <section class="section">
    <h2 class="section-title">基本情報</h2>
    <div class="assist-card-visual">
      <img src="../${escapeHtml(card.image)}" alt="${escapeHtml(card.name)}" width="260">
      <p><span class="rarity rarity-${escapeHtml(card.rarity)}">${escapeHtml(card.rarity)}</span></p>
    </div>
    <table class="assist-detail-table assist-detail-table--pairs">
${renderPairRows(basicRows)}
    </table>
  </section>${renderRatings(card)}${renderStats(card)}${renderEffects(effects)}${renderAbilities(abilities)}${renderExplanation(card)}${renderFormations(card, cardById)}${gachaAppearances}

  <section class="section">
    <h2 class="section-title">アシストカード一覧</h2>
    <div class="menu-grid"><a class="menu-link" href="../assist.html">アシストカード一覧へ戻る</a></div>
  </section>
</main>

<footer>
  &copy; 2026 LINEモンスターファーム徹底攻略 ／ 非公式ファンサイト
</footer>
</body>
</html>
`;
}

function buildCardArtifact(card, effects, allAbilities, cardById, gachaAppearances = '') {
  const abilities = allAbilities.filter(ability =>
    ability.linkStatus === 'resolved' && ability.status === 'verified' && ability.cardId === card.cardId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const effectChars = effects.reduce((sum, effect) => sum + stripTags(effect.name).length + stripTags(effect.description).length, 0);
  const abilityChars = abilities.reduce((sum, ability) => sum + stripTags(ability.name).length + stripTags(ability.description).length, 0);
  const explanationChars = stripTags(card.explanation).length;
  const visible = effectChars + abilityChars + explanationChars;
  const indexable = visible >= INDEXABLE_VISIBLE_CHARS
    && explanationChars >= INDEXABLE_EXPLANATION_CHARS;
  return {
    html: renderPage(card, effects, abilities, cardById, indexable, gachaAppearances),
    report: { cardId: card.cardId, visible, explanation: explanationChars, indexable },
  };
}

function validateInputs(cards, effectsByCard, abilities) {
  const ids = cards.map(card => card.cardId);
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) throw new Error('assist-cards.json にcardId重複があります');
  const unknownEffects = Object.keys(effectsByCard).filter(id => !idSet.has(id));
  if (unknownEffects.length) throw new Error(`assist-effects.json に未知のcardId: ${unknownEffects.join(', ')}`);
  const missingEffects = ids.filter(id => !Object.prototype.hasOwnProperty.call(effectsByCard, id));
  if (missingEffects.length) throw new Error(`assist-effects.json にcardIdがありません: ${missingEffects.join(', ')}`);
  const invalidAbilities = abilities.filter(ability => ability.linkStatus === 'resolved' && !idSet.has(ability.cardId));
  if (invalidAbilities.length) throw new Error(`assist-abilities.json に未知のcardId: ${invalidAbilities[0].cardId}`);
  const missingImages = cards.filter(card => !fs.existsSync(path.join(REPO, card.image)));
  if (missingImages.length) throw new Error(`カード画像がありません: ${missingImages.map(card => card.cardId).join(', ')}`);
  const formationIds = cards.flatMap(card => card.formations.flatMap(formation => formation.cards.concat(formation.rental))).filter(Boolean);
  const unknownFormationIds = [...new Set(formationIds.filter(id => !idSet.has(id)))];
  if (unknownFormationIds.length) throw new Error(`編成に未知のcardId: ${unknownFormationIds.join(', ')}`);
}

function writeIfChanged(relativePath, content, dryRun) {
  const absolutePath = path.join(REPO, relativePath);
  const existed = fs.existsSync(absolutePath);
  if (existed && fs.readFileSync(absolutePath, 'utf8') === content) return 'unchanged';
  if (!dryRun) fs.writeFileSync(absolutePath, content);
  return existed ? 'updated' : 'new';
}

function renderAssistCard(card) {
  return `    <a class="card" data-rarity="${escapeHtml(card.rarity)}" href="cards/${escapeHtml(card.cardId)}.html">
      <img class="card-img" src="${escapeHtml(card.image)}" alt="${escapeHtml(card.name)}">
      <div class="card-info"><div class="card-name">${escapeHtml(card.name)}</div><span class="rarity rarity-${escapeHtml(card.rarity)}">${escapeHtml(card.rarity)}</span></div>
    </a>`;
}

function renderAssistIndex(source, cards) {
  const start = source.indexOf(ASSIST_LIST_START);
  const end = source.indexOf(ASSIST_LIST_END);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('assist.html のカード一覧マーカーがありません');
  }
  if (source.indexOf(ASSIST_LIST_START, start + ASSIST_LIST_START.length) >= 0
      || source.indexOf(ASSIST_LIST_END, end + ASSIST_LIST_END.length) >= 0) {
    throw new Error('assist.html のカード一覧マーカーが重複しています');
  }

  const cardById = new Map(cards.map(card => [card.cardId, card]));
  const currentRegion = source.slice(start + ASSIST_LIST_START.length, end);
  const currentIds = [...currentRegion.matchAll(/href="cards\/([A-Za-z0-9._-]+)\.html"/g)]
    .map(match => match[1]);
  const duplicateIds = currentIds.filter((id, index) => currentIds.indexOf(id) !== index);
  if (duplicateIds.length) {
    throw new Error(`assist.html のカード一覧にcardId重複があります: ${[...new Set(duplicateIds)].join(', ')}`);
  }
  const unknownIds = currentIds.filter(id => !cardById.has(id));
  if (unknownIds.length) {
    throw new Error(`assist.html のカード一覧にDB未登録のcardIdがあります: ${unknownIds.join(', ')}`);
  }

  const currentIdSet = new Set(currentIds);
  const orderedCards = currentIds.map(id => cardById.get(id))
    .concat(cards.filter(card => !currentIdSet.has(card.cardId)));
  const list = `\n\n${orderedCards.map(renderAssistCard).join('\n\n')}\n\n    `;
  return source.slice(0, start + ASSIST_LIST_START.length) + list + source.slice(end);
}

function buildAssistPages(options = {}) {
  const dryRun = options.dryRun === true;
  const gachaAppearancesFor = typeof options.gachaAppearancesFor === 'function'
    ? options.gachaAppearancesFor
    : () => '';
  const cardData = readJson(INPUTS.cards);
  const effectData = readJson(INPUTS.effects);
  const abilityData = readJson(INPUTS.abilities);
  if (abilityData.schemaVersion !== 2 || !Array.isArray(abilityData.abilities)) {
    throw new Error('assist-abilities.json はschemaVersion 2のabilities配列が必須です');
  }
  const cards = cardData.cards;
  const effectsByCard = effectData.cards;
  validateInputs(cards, effectsByCard, abilityData.abilities);
  const cardById = new Map(cards.map(card => [card.cardId, card]));
  const counts = { new: 0, updated: 0, unchanged: 0 };
  const reports = [];

  const assistIndex = fs.readFileSync(path.join(REPO, ASSIST_INDEX), 'utf8');
  const assistIndexState = writeIfChanged(ASSIST_INDEX, renderAssistIndex(assistIndex, cards), dryRun);

  for (const card of cards) {
    const effects = effectsByCard[card.cardId].effects;
    const artifact = buildCardArtifact(card, effects, abilityData.abilities, cardById, gachaAppearancesFor(card.cardId));
    counts[writeIfChanged(`cards/${card.cardId}.html`, artifact.html, dryRun)]++;
    reports.push(artifact.report);
  }

  const values = reports.map(report => report.visible).sort((a, b) => a - b);
  const passed = reports.filter(report => report.indexable);
  console.log('\n=== 静的カード詳細 ===');
  console.log(`  一覧 ${ASSIST_INDEX}: ${assistIndexState}`);
  console.log(`  生成 ${cards.length}件 / 新規 ${counts.new}件 / 更新 ${counts.updated}件 / 変更なし ${counts.unchanged}件`);
  console.log(`  ゲート通過 ${passed.length}件: ${passed.map(report => report.cardId).join(', ')}`);
  console.log(`  可視本文 最小 ${values[0]} / 中央値 ${values[Math.floor(values.length / 2)]} / 最大 ${values[values.length - 1]} / 800字以上 ${reports.filter(report => report.visible >= 800).length}件`);
  console.log(`  index ${passed.length}件（robotsメタなし・広告あり） / noindex ${reports.length - passed.length}件（広告なし）`);
  return {
    count: cards.length,
    counts,
    reports,
    passed: passed.map(report => report.cardId),
    assistIndexState,
    sitemapPages: passed.map(report => ({
      canonical: `${SITE_URL}/cards/${report.cardId}.html`,
      priority: '0.7',
    })),
  };
}

if (require.main === module) {
  try {
    buildAssistPages({ dryRun: process.argv.includes('--dry') });
  } catch (error) {
    console.error(`カード詳細ビルド失敗: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { buildAssistPages, buildCardArtifact, renderAssistIndex };
