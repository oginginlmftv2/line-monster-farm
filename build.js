#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REPO = __dirname;
const SITE_URL = 'https://line-monster-farm-tetteikouryaku.com';
const ROOT_PREFIX = '../../../';
const DRY_RUN = process.argv.includes('--dry');

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

function formationsTextLength(formations) {
  if (!formations) return 0;
  return JSON.stringify(formations).replace(/["{}\[\],:]/g, '').length;
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
        blocks.push(`<ul>\n${bulletLines.map(item => `          <li>${escapeHtml(item)}</li>`).join('\n')}\n        </ul>`);
      } else {
        blocks.push(`<p>${escapeHtml(line)}</p>`);
      }
      continue;
    }

    blocks.push(`<p>${escapeHtml(line)}</p>`);
    index++;
  }

  return blocks.join('\n        ');
}

function descriptionFrom(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= 120) return normalized;
  const candidate = normalized.slice(0, 120);
  const sentenceEnd = candidate.indexOf('。', 79);
  if (sentenceEnd !== -1) return candidate.slice(0, sentenceEnd + 1);
  return normalized.slice(0, 100);
}

function visibleChars(html) {
  let body = html.replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  return body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
}

function gateDetails(editorial) {
  return editorial.map(entry => {
    const formationsLength = formationsTextLength(entry.formations);
    const totalLength = entry.explanationLength + formationsLength;
    return { ...entry, formationsLength, totalLength, eligible: totalLength >= 500 };
  });
}

function createBuildContext(inputs, eligibleEntries) {
  const eligibleIds = new Set(eligibleEntries.map(entry => entry.id));
  const generatedPaths = new Set(
    eligibleEntries.map(entry => inputs.monsterById.get(entry.id).url.replace(/^\//, ''))
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
    eligibleIds,
    generatedPaths,
    fallbackImages: new Map(),
    missingCardIds: new Set(),
    skippedEmptyFormations,
    linkTargets: [],
  };
}

function resolveImage(id, context) {
  const runtime = context.runtimeById.get(id);
  if (runtime && runtime.localImg) return `${ROOT_PREFIX}monster/${runtime.localImg}`;
  if (context.images[id]) return `${ROOT_PREFIX}monster/${context.images[id]}`;
  if (runtime && runtime.gwImg) {
    const monster = context.monsterById.get(id);
    context.fallbackImages.set(id, monster ? monster.name : id);
    return `https://img.gamewith.jp/article_tools/monsterfarm-line/gacha/Lmonfar_monster_${runtime.gwImg}.png`;
  }
  return null;
}

function addLink(context, target) {
  context.linkTargets.push(target);
}

function rootLink(context, file, label) {
  addLink(context, file);
  return `<a href="${ROOT_PREFIX}${file}">${escapeHtml(label)}</a>`;
}

function detailLink(context, monster, label) {
  const target = monster.url.replace(/^\//, '');
  addLink(context, target);
  return `<a href="${monster.id}.html">${escapeHtml(label)}</a>`;
}

function breadcrumbJson(monster) {
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
        name: monster.name,
        item: `${SITE_URL}${monster.url}`,
      },
    ],
  });
}

function renderFormation(formation, context) {
  const cardName = id => {
    const card = context.cardsData[id];
    if (!card) {
      context.missingCardIds.add(id);
      return id;
    }
    return card.name;
  };
  const rows = (formation.cards || []).map((id, index) => `
            <tr><th>カード${index + 1}</th><td>${escapeHtml(cardName(id))}</td></tr>`).join('');
  const rental = formation.rental
    ? `\n            <tr><th>レンタル</th><td>${escapeHtml(cardName(formation.rental))}</td></tr>`
    : '';
  return `
        <h3>${escapeHtml(formation.title || 'おすすめ編成')}</h3>
        <table>
          <tbody>${rows}${rental}
          </tbody>
        </table>`;
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
  if (context.eligibleIds.has(monster.id)) {
    addLink(context, monster.url.replace(/^\//, ''));
    return `        <a class="card" href="${monster.id}.html">${content}\n        </a>`;
  }
  return `        <div class="card">${content}\n        </div>`;
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
  const navTop = rootLink(context, 'index.html', 'トップ');
  const navMonsters = rootLink(context, 'monsters.html', 'モンスター一覧');
  const navAssist = rootLink(context, 'assist.html', 'アシストカード一覧');
  const privacy = rootLink(context, 'privacy.html', 'プライバシーポリシー');
  const nonEmptyFormations = (entry.formations || []).filter(formation => {
    return !isEmptyFormation(formation);
  });
  const formations = nonEmptyFormations.length
    ? `
    <section class="section">
      <h2 class="section-title">おすすめ編成</h2>${nonEmptyFormations.map(formation => renderFormation(formation, context)).join('\n')}
    </section>`
    : '';
  const related = relatedMonsters(monster, context);
  const limitedRow = runtime && runtime.limitedLabel
    ? `\n              <tr><th>限定</th><td>${escapeHtml(runtime.limitedLabel)}</td></tr>`
    : '';

  return `<!-- このファイルは build.js が自動生成しています。直接編集しないでください。 -->
<!-- 元データ: src/data/monsters-editorial.json / src/data/monster-ids.json -->
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <link rel="icon" href="${ROOT_PREFIX}S__94175247.jpg">
  <link rel="apple-touch-icon" href="${ROOT_PREFIX}S__94175247.jpg">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonical}">
  <script type="application/ld+json">${breadcrumbJson(monster)}</script>
  <link rel="stylesheet" href="${ROOT_PREFIX}style.css">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7841397391542171" crossorigin="anonymous"></script>
</head>
<body>

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
  <p>${breadcrumbTop} &gt; ${breadcrumbMonsters} &gt; ${escapeHtml(monster.name)}</p>
  <h1 class="page-title">${escapeHtml(monster.name)}</h1>

  <section class="section">
    <h2 class="section-title">基本情報</h2>
    <div class="card-grid">
      <div class="card">${image ? `
        <img class="card-img" src="${escapeHtml(image)}" alt="${escapeHtml(monster.name)}">` : ''}
        <div class="card-info">
          <div class="card-name">${escapeHtml(monster.name)}</div>
        </div>
      </div>
      <div class="card">
        <table>
          <tbody>
            <tr><th>モン類</th><td>${escapeHtml(monster.mon)}</td></tr>
            <tr><th>主血統</th><td>${escapeHtml(monster.blood)}</td></tr>
            <tr><th>副血統</th><td>${escapeHtml(monster.subBlood)}</td></tr>
            <tr><th>オーラ</th><td>${escapeHtml(runtime ? runtime.aura : monster.aura)}</td></tr>${limitedRow}
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="section">
    <h2 class="section-title">運営者による解説</h2>
    ${formatExplanation(entry.explanation)}
  </section>${formations}

  <section class="section">
    <h2 class="section-title">同じ血統のモンスター</h2>
    <div class="card-grid">
${related.map(candidate => renderRelatedCard(candidate, context)).join('\n')}
    </div>
  </section>

  <section class="section">
    <h2 class="section-title">関連リンク</h2>
    <div class="menu-grid">
      <a class="menu-link" href="${ROOT_PREFIX}monsters.html"><span class="icon">👾</span>モンスター一覧</a>
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

function renderSitemap(existingXml, pages) {
  const urlBlockPattern = /  <url>\n[\s\S]*?  <\/url>\n?/g;
  const matches = [...existingXml.matchAll(urlBlockPattern)];
  const detailUrlPattern = /<loc>https:\/\/line-monster-farm-tetteikouryaku\.com\/monsters\/[^/]+\/[^/]+\/\d{4}\.html<\/loc>/;
  const existingBlocks = matches
    .map(match => match[0])
    .filter(block => !detailUrlPattern.test(block));

  if (existingBlocks.length !== 24) {
    throw new Error(`sitemap.xml の既存URLが24件ではありません: ${existingBlocks.length}件`);
  }

  const header = existingXml.slice(0, matches[0].index);
  const detailBlocks = pages.map(page => `  <url>
    <loc>${page.canonical}</loc>
    <priority>0.7</priority>
  </url>
`).join('');
  const sitemap = `${header}${existingBlocks.join('')}${detailBlocks}</urlset>\n`;

  if (/<lastmod>/.test(sitemap)) {
    throw new Error('sitemap.xml に <lastmod> が含まれています');
  }
  const urlCount = (sitemap.match(/<url>/g) || []).length;
  if (urlCount !== 81) {
    throw new Error(`sitemap.xml のURLが81件ではありません: ${urlCount}件`);
  }
  return sitemap;
}

function validatePages(pages) {
  const thin = pages.filter(page => page.visibleCharacters < 800);
  if (thin.length) {
    throw new Error(`可視800字未満のページ: ${thin.map(page => `${page.path} (${page.visibleCharacters}字)`).join(', ')}`);
  }

  for (const field of ['title', 'description', 'canonical']) {
    const values = pages.map(page => page[field]);
    if (new Set(values).size !== values.length) {
      throw new Error(`${field} がユニークではありません`);
    }
  }

  const invalidDescriptions = pages.filter(page => page.description.length < 80 || page.description.length > 120);
  if (invalidDescriptions.length) {
    throw new Error(`meta description が80〜120字ではありません: ${invalidDescriptions.map(page => page.path).join(', ')}`);
  }
}

function linkExists(target, generatedPaths) {
  return generatedPaths.has(target) || fs.existsSync(path.join(REPO, target));
}

function logBuild(inputs, gates, outputCounts, context, brokenLinks) {
  const taxonomyCounts = countTaxonomyEntries(inputs.taxonomy);
  const excluded = gates.filter(entry => !entry.eligible);
  const eligible = gates.filter(entry => entry.eligible);
  const bloodCount = new Set(inputs.monsters.map(monster => monster.blood)).size;
  const monTypeCount = new Set(inputs.monsters.map(monster => monster.mon)).size;

  console.log('=== 入力 ===');
  console.log(`  monster-ids        ${inputs.monsters.length}件`);
  console.log(`  monsters-editorial  ${inputs.editorial.length}件`);
  console.log(`  monster-images     ${Object.keys(inputs.images).length}件`);
  console.log(`  taxonomy           血統${taxonomyCounts.bloods}件 / モン類${taxonomyCounts.monTypes}件`);
  console.log('');
  console.log('=== ゲート判定 ===');
  console.log(`  詳細ページ  生成 ${eligible.length}件 / 除外 ${excluded.length}件`);
  for (const entry of excluded) {
    console.log(`    ${entry.id} ${entry.name}: 解説${entry.explanationLength}字 / 編成${entry.formationsLength}字 / 合計${entry.totalLength}字`);
  }
  console.log(`  血統ページ  生成 0件 / 除外 ${bloodCount}件（taxonomy.json が無いため）`);
  console.log(`  モン類ページ 生成 0件 / 除外 ${monTypeCount}件（taxonomy.json が無いため）`);
  console.log('');
  console.log('=== 出力 ===');
  console.log(`  新規 ${outputCounts.new}件 / 更新 ${outputCounts.updated}件 / 変更なし ${outputCounts.unchanged}件`);
  console.log(`  合計 ${outputCounts.total} ページ`);
  console.log('');
  console.log('=== 警告 ===');
  console.log('  taxonomy.json が無いため、詳細ページのみ生成し、集約ページをスキップしました');
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
  const gates = gateDetails(inputs.editorial);
  const eligible = gates.filter(entry => entry.eligible);
  const context = createBuildContext(inputs, eligible);
  const pages = eligible.map(entry => {
    const monster = inputs.monsterById.get(entry.id);
    const html = renderDetail(entry, context);
    const title = `${monster.name}（${monster.blood}・${monster.mon}）| LINEモンスターファーム徹底攻略`;
    return {
      path: monster.url.replace(/^\//, ''),
      html,
      title,
      description: descriptionFrom(entry.explanation),
      canonical: `${SITE_URL}${monster.url}`,
      visibleCharacters: visibleChars(html),
    };
  });

  validatePages(pages);
  const sitemap = renderSitemap(inputs.sitemap, pages);
  const brokenLinks = context.linkTargets.filter(target => !linkExists(target, context.generatedPaths));
  if (brokenLinks.length) {
    throw new Error(`リンク先が存在しません: ${brokenLinks.join(', ')}`);
  }

  const outputCounts = { new: 0, updated: 0, unchanged: 0, total: pages.length + 1 };
  for (const page of pages) {
    outputCounts[writeIfChanged(page.path, page.html)]++;
  }
  outputCounts[writeIfChanged('sitemap.xml', sitemap)]++;
  logBuild(inputs, gates, outputCounts, context, brokenLinks);
}

try {
  main();
} catch (error) {
  console.error(`ビルド失敗: ${error.message}`);
  process.exitCode = 1;
}
