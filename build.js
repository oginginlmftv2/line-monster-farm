#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REPO = __dirname;
const SITE_URL = 'https://line-monster-farm-tetteikouryaku.com';
const ROOT_PREFIX = '../../../';
const MON_TYPE_ROOT_PREFIX = '../../';
const DRY_RUN = process.argv.includes('--dry');
const INDEXABLE_THRESHOLD = 800;

// モン類の表示順（公式順）。表示に関わる並びはすべてこれを使うこと。
const MON_ORDER = ['souzou', 'genrei', 'mazoku', 'kemono', 'kaibutsu', 'muki'];

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

function formatExplanation(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index++;
      continue;
    }

    if (/^[・･]/.test(line)) {
      const bulletLines = [];
      while (index < lines.length && /^[・･]/.test(lines[index])) {
        bulletLines.push(lines[index].slice(1));
        index++;
      }
      if (bulletLines.length >= 2) {
        blocks.push(`<ul>${bulletLines.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
      } else {
        blocks.push(`<p>${escapeHtml(line)}</p>`);
      }
      continue;
    }

    blocks.push(`<p>${escapeHtml(line)}</p>`);
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
  if (runtime && runtime.localImg) return `${rootPrefix}monster/${runtime.localImg}`;
  if (context.images[id]) return `${rootPrefix}monster/${context.images[id]}`;
  if (runtime && runtime.gwImg) {
    const monster = context.monsterById.get(id);
    context.fallbackImages.set(id, monster ? monster.name : id);
    return `https://img.gamewith.jp/article_tools/monsterfarm-line/gacha/Lmonfar_monster_${runtime.gwImg}.png`;
  }
  return null;
}

function renderMonsterCards(context) {
  const sortedMonsters = context.monsters
    .map(monster => ({
      monster,
      runtime: context.runtimeById.get(monster.id),
    }))
    .sort((a, b) => {
      const av = a.runtime && a.runtime.gwImg != null ? a.runtime.gwImg : Infinity;
      const bv = b.runtime && b.runtime.gwImg != null ? b.runtime.gwImg : Infinity;
      if (av === Infinity && bv === Infinity) {
        return b.monster.arrayIndex - a.monster.arrayIndex;
      }
      return bv - av;
    });

  return sortedMonsters.map(({ monster, runtime }) => {
    const image = resolveImage(monster.id, context, '');
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
        <div class="aura-badge aura-${escapeHtml(aura)}"><span class="aura-dot"></span>${escapeHtml(aura)}</div>
        <div class="monster-name">${escapeHtml(monster.name)}</div>
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
  return source.slice(0, start + startMarker.length)
    + `\n${cards}\n`
    + source.slice(end);
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
  const image = resolveImage(monster.id, context);
  const content = `${image ? `\n          <img class="card-img" src="${escapeHtml(image)}" alt="${escapeHtml(monster.name)}">` : ''}
          <div class="card-info">
            <div class="card-name">${escapeHtml(monster.name)}</div>
            <div>${escapeHtml(monster.aura)}オーラ / ${escapeHtml(monster.subBlood)}</div>
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
  const image = resolveImage(monster.id, context);
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
  </div>

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
  const image = resolveImage(monster.id, context, MON_TYPE_ROOT_PREFIX);
  const editorial = context.editorialById.get(monster.id);
  const isIndexable = context.indexableDetailIds.has(monster.id);
  const excerpt = isIndexable
    ? `\n            <p class="mon-type-card-excerpt">${escapeHtml(descriptionFrom(editorial.explanation))}</p>`
    : '';
  const limited = runtime && runtime.limitedLabel
    ? ` / ${escapeHtml(runtime.limitedLabel)}`
    : '';
  const content = `${image ? `
          <img class="card-img" src="${escapeHtml(image)}" alt="${escapeHtml(monster.name)}">` : ''}
          <div class="card-info">
            <div class="card-name">${escapeHtml(monster.name)}</div>
            <div class="mon-type-card-meta">${escapeHtml(runtime ? runtime.aura : monster.aura)}オーラ / 副血統: ${escapeHtml(monster.subBlood)}${limited}</div>${excerpt}
          </div>`;
  addLink(context, monster.url.replace(/^\//, ''));
  const displayClass = isIndexable ? ' mon-type-card--editorial' : ' mon-type-card--compact';
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
    <div class="card-grid mon-type-grid mon-type-grid--editorial">
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
    return `      <a class="menu-link" href="../${escapeHtml(other.slug)}/index.html">${escapeHtml(other.name)}のモンスター</a>`;
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
  const absolutePath = path.join(REPO, relativePath);
  if (!fs.existsSync(absolutePath)) {
    if (!DRY_RUN) {
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, html);
    }
    return 'new';
  }
  if (fs.readFileSync(absolutePath, 'utf8') === html) return 'unchanged';
  if (!DRY_RUN) fs.writeFileSync(absolutePath, html);
  return 'updated';
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

function renderSitemap(existingXml, pages) {
  const urlBlockPattern = /  <url>\n[\s\S]*?  <\/url>\n?/g;
  const matches = [...existingXml.matchAll(urlBlockPattern)];
  const generatedUrlPattern = /<loc>https:\/\/line-monster-farm-tetteikouryaku\.com\/monsters\/(?:[^/]+\/(?:index\.html)?|[^/]+\/[^/]+\/\d{4}\.html)<\/loc>/;
  const existingBlocks = matches
    .map(match => match[0])
    .filter(block => !generatedUrlPattern.test(block));

  if (existingBlocks.length !== 24) {
    throw new Error(`sitemap.xml の既存URLが24件ではありません: ${existingBlocks.length}件`);
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
  if (urlCount !== 79) {
    throw new Error(`sitemap.xml のURLが79件ではありません: ${urlCount}件`);
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
  const sitemap = renderSitemap(inputs.sitemap, sitemapPages);
  const brokenLinks = context.linkTargets.filter(target => !linkExists(target, context.generatedPaths));
  if (brokenLinks.length) {
    throw new Error(`リンク先が存在しません: ${brokenLinks.join(', ')}`);
  }

  const outputCounts = { new: 0, updated: 0, unchanged: 0, total: pages.length + 5 };
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
  logBuild(inputs, detailPages, monTypeGates, outputCounts, context, brokenLinks);
}

try {
  main();
} catch (error) {
  console.error(`ビルド失敗: ${error.message}`);
  process.exitCode = 1;
}
