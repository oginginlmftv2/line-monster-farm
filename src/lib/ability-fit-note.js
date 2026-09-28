'use strict';
/**
 * 「相性のいいアシスト能力」に、その体の基礎データ（素質・間合い適性）から書く文（build-spec 5-12）。
 * 5件の選び方には基礎データを使わない（src/lib/ability-recommend.js）。適性や素質はこの文でだけ触れる。
 *
 *   ① abilityNotes      能力ごとの一文。能力の効果・条件と、その体の素質％・間合いの開始時ランクを結ぶ
 *   ② abilitySummary    セクション導入文。「◯◯のおすすめ能力のうち」＋能力名を出した助言（最大2つ）
 *   ③ descriptionFact   meta description に入れる短い句（解説の無い体だけ使う）
 *
 * 決まり（2026-09-28・管理者確認）
 *   - 基礎データのある体だけ。数値は必ずその体の基礎データから取り、目立つ事実が無ければ書かない（水増ししない）
 *   - ①の中では同じ事実を1回だけ。①②③の間で同じ事実が出るのはよいが、同じ文面にはしない
 *   - 相手のステ低下は自分の素質と結ばない。全ステ上昇（5項目以上）は素質の文を出さない
 *   - 間合い適性の条件は開始時の値で書き分ける：B以上＝開始時の上昇でSスタートを狙える、C＝秘伝・育成の書・
 *     育成中のイベントでSを目指せる、D以下＝条件に対して低いので上げよう（docs/monster-basics-design.md 2章）
 */

const { TALENTS, RANGES } = require('./monster-basics');

const TALENT_HIGH = 10;
const TALENT_LOW = -5;
const RANK_ORDER = ['M', 'SS', 'S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
const TALENT_LABEL = Object.fromEntries(TALENTS.map(t => [t.key, t.label]));
const TALENT_BY_LABEL = Object.fromEntries(TALENTS.map(t => [t.label, t.key]));
const RANGE_KEY = Object.fromEntries(RANGES.map(r => [r.label, r.key]));
// 命中率・回避率はステと同じ向きに効くので「高い素質と噛み合う」を書ける。
// 必中・完全回避・被ダメ低下はステの値に関係なく効くので、「低い素質を補う」だけを書く
const ATOM_TALENT = { 命中率上昇: 'accuracy', 回避率上昇: 'evasion' };
const ATOM_COVER = { 必中: 'accuracy', 完全回避: 'evasion', 被ダメ低下: 'defense', 被ダメブロック: 'defense' };

const signed = v => (v > 0 ? `+${v}` : String(v));
const better = (a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b);
/** 開始時のランクから、S以上へ届くまでの段階 */
const reachLevel = rank => (better(rank, 'B') <= 0 ? 'start' : rank === 'C' ? 'train' : 'low');

/** 能力と結ぶ素質。grow＝高いと噛み合う、cover＝低いのを補う（grow を含む）。全ステ上昇は空 */
function talentKeys(parsed) {
  const grow = new Set();
  const cover = new Set();
  for (const line of parsed.lines) {
    for (const effect of line.effects) {
      if (effect.atom === 'ステ上昇') for (const stat of effect.stats || []) if (TALENT_BY_LABEL[stat]) grow.add(TALENT_BY_LABEL[stat]);
      if (ATOM_TALENT[effect.atom]) grow.add(ATOM_TALENT[effect.atom]);
      if (ATOM_COVER[effect.atom]) cover.add(ATOM_COVER[effect.atom]);
    }
  }
  if (grow.size >= 5) return { grow: [], cover: [] };
  for (const key of grow) cover.add(key);
  return { grow: [...grow], cover: [...cover] };
}

/**
 * 間合い適性の条件（「零または近距離適性がS以上」「間合い適性S以上」）の事実。
 * 名前の付いた条件はその間合い、無ければ4つの間合いのうち一番届きやすい段階の間合いを挙げる
 */
function aptitudeFact(parsed, basics) {
  if (!basics.range) return null;
  const lines = parsed.lines.filter(line => line.skillCond.aptitude && !/未満/.test(line.skillCond.aptitude));
  if (!lines.length) return null;
  const need = lines.map(line => line.skillCond.aptitude).sort((a, b) => better(a.replace('以上', ''), b.replace('以上', '')))[lines.length - 1];
  const named = [...new Set(lines.flatMap(line => line.skillCond.aptitudeRanges || []))];
  const labels = named.length ? named : RANGES.map(r => r.label);
  const ranked = labels.map(label => ({ label, rank: basics.range[RANGE_KEY[label]] }));
  const level = ranked.map(r => reachLevel(r.rank)).sort((a, b) => ['start', 'train', 'low'].indexOf(a) - ['start', 'train', 'low'].indexOf(b))[0];
  // 名前の付いた条件は全部の間合いを、そうでなければ一番届きやすい段階の間合いだけを挙げる
  const shown = named.length ? ranked : ranked.filter(r => reachLevel(r.rank) === level);
  return {
    kind: 'aptitude',
    level,
    condition: named.length ? `${named.join('・')}距離適性${need}` : `間合い適性${need}`,
    ranks: shown.map(r => `${r.label}${r.rank}`).join('・'),
    key: `aptitude:${named.join('')}:${need}`,
  };
}

/** 素質の事実（高い素質と噛み合う／低い素質を補う）。目立つ素質から順に */
function talentFacts(parsed, basics) {
  if (!basics.talent) return [];
  const top = Math.max(...Object.values(basics.talent));
  const { grow, cover } = talentKeys(parsed);
  const facts = [];
  for (const key of cover.sort((a, b) => Math.abs(basics.talent[b]) - Math.abs(basics.talent[a]) || a.localeCompare(b))) {
    const value = basics.talent[key];
    if (value >= TALENT_HIGH && grow.includes(key)) facts.push({ kind: 'talentHigh', label: TALENT_LABEL[key], value, top: value === top, key });
    else if (value <= TALENT_LOW) facts.push({ kind: 'talentLow', label: TALENT_LABEL[key], value, key });
  }
  return facts;
}

const factsFor = (item, basics) => [aptitudeFact(item.parsed, basics), ...talentFacts(item.parsed, basics)].filter(Boolean);

// ---------------------------------------------------------------- 言い回し（種類ごとに3通り）
// 語尾は体言止めか「〜よう」（です・ます、〜ましょうは使わない。2026-09-28 管理者指定）。
// どの型を使うかは variantSeed（同じ主血統・オーラの体の中での順番）と、ページ内でその種類が出た回数で決める。
// 同じグループの3体までは、同じ位置に同じ種類の文が来ても型が必ず違う
const topMark = fact => (fact.top ? '・6項目で最も高い' : '');
const NOTE_TEMPLATES = {
  'aptitude:start': [
    f => `発動条件は${f.condition}。開始時の${f.ranks}なら、育成開始時の上昇でSスタートを狙える。`,
    f => `${f.condition}が条件。開始時の${f.ranks}なら、育成開始時の上昇でSスタートが現実的。`,
    f => `条件の${f.condition}には、開始時の${f.ranks}が近道。開始時の上昇でSスタートを狙いたい。`,
  ],
  'aptitude:train': [
    f => `発動条件は${f.condition}。開始時の${f.ranks}は、秘伝・育成の書や育成中のイベントでSを目指せる。`,
    f => `${f.condition}が条件。開始時の${f.ranks}からでも、秘伝や育成の書、育成中のイベントでSに届く。`,
    f => `条件の${f.condition}には、開始時の${f.ranks}から育成の書と秘伝、育成中のイベントで押し上げたい。`,
  ],
  'aptitude:low': [
    f => `発動条件の${f.condition}に対して、開始時は${f.ranks}と低め。秘伝や育成の書で上げておきたい。`,
    f => `${f.condition}が条件だが、開始時は${f.ranks}。秘伝や育成の書で底上げしたい。`,
    f => `条件の${f.condition}まで、開始時の${f.ranks}からは距離がある。育成の書と秘伝で引き上げたい。`,
  ],
  talentHigh: [
    f => `${f.label}が育ちやすく（素質${signed(f.value)}%${topMark(f)}）、この能力の${f.label}を上げる効果と噛み合う。`,
    f => `${f.label}は素質${signed(f.value)}%${f.top ? '（6項目で最も高い）' : ''}で伸びやすい。この能力で${f.label}をさらに上げられる。`,
    f => `素質${signed(f.value)}%${f.top ? '（6項目で最も高い）' : ''}の${f.label}を、この能力でさらに押し上げられる。`,
  ],
  talentLow: [
    f => `${f.label}の素質は${signed(f.value)}%と低めで、この能力で${f.label}を補える。`,
    f => `素質${signed(f.value)}%と伸びにくい${f.label}を、この能力でカバーできる。`,
    f => `${f.label}は素質${signed(f.value)}%の弱点。この能力で埋め合わせたい。`,
  ],
};
const ADVICE_TEMPLATES = {
  'aptitude:low': [
    (m, a, f) => `${a}は${f.condition}が発動条件だが、${m}の開始時は${f.ranks}。秘伝や育成の書で頑張って上げよう。`,
    (m, a, f) => `${a}を活かすなら${f.condition}が必要。開始時が${f.ranks}の${m}は、秘伝と育成の書で引き上げよう。`,
    (m, a, f) => `${m}の開始時の${f.ranks}では、${a}の条件（${f.condition}）に届かない。育成の書や秘伝で狙っていこう。`,
  ],
  'aptitude:start': [
    (m, a, f) => `${a}は${f.condition}が必要だが、${f.ranks}は育成の書と秘伝でSスタートを狙いやすい。`,
    (m, a, f) => `${a}の条件は${f.condition}。${m}は開始時が${f.ranks}なので、育成の書と秘伝でSスタートが見える。`,
    (m, a, f) => `${m}の開始時の${f.ranks}なら、${a}の${f.condition}もSスタートで満たしやすい。育成の書と秘伝で狙おう。`,
  ],
  'aptitude:train': [
    (m, a, f) => `${a}は${f.condition}が必要で、${f.ranks}は秘伝・育成の書や育成中のイベントでSを目指せる。`,
    (m, a, f) => `${a}の条件は${f.condition}。開始時の${f.ranks}からでも、秘伝や育成の書、育成中のイベントで届く。`,
    (m, a, f) => `${m}の開始時の${f.ranks}は、育成中のイベントまで使えば${a}の${f.condition}に届く。秘伝と育成の書も併せて狙おう。`,
  ],
  talentLow: [
    (m, a, f) => `${m}は${f.label}の素質が低め（${signed(f.value)}%）なので、${a}で${f.label}の低さを補おう。`,
    (m, a, f) => `${f.label}の素質${signed(f.value)}%が${m}の弱点。${a}でカバーしよう。`,
    (m, a, f) => `${a}は、${f.label}が伸びにくい${m}（素質${signed(f.value)}%）の穴埋め役。`,
  ],
  talentHigh: [
    (m, a, f) => `${m}は${f.label}の素質が高い（${signed(f.value)}%）ので、${a}の${f.label}を上げる効果を活かしやすい。`,
    (m, a, f) => `${f.label}の素質${signed(f.value)}%は${m}の強み。${a}でさらに伸ばそう。`,
    (m, a, f) => `${a}の${f.label}を上げる効果は、${f.label}の素質が${signed(f.value)}%の${m}と好相性。`,
  ],
};
// 助言を書けない体の要約（最も高い素質・開始時にC以上の間合い）
const PROFILE_TEMPLATES = [
  (m, t, r) => `素質は${t}が最も高く、${r}。`,
  (m, t, r) => `${m}の素質の最高は${t}。${r}。`,
  (m, t, r) => `${r}。素質は${t}が最高。`,
];

const factKind = fact => (fact.kind === 'aptitude' ? `aptitude:${fact.level}` : fact.kind);

/**
 * 型の選び手。種に加えて、ページ内でその種類が出た回数と、それまでに選んだ文の数だけ先へ送る
 * （同じ種類の2回目も、続けて並ぶ2つの助言も、同じ型にならない）
 */
function variantPicker(seed) {
  const count = new Map();
  let total = 0;
  return (kind, list) => {
    const n = count.get(kind) || 0;
    count.set(kind, n + 1);
    return list[(seed + n + total++) % list.length];
  };
}

/**
 * ① 能力ごとの一文（picked と同じ並び。書けない能力は null）。
 * 間合いの条件があれば間合い、無ければ素質。①の中で同じ事実（同じ素質・同じ条件）は2回書かない
 */
function abilityNotes(picked, basics, variantSeed = 0) {
  if (!basics) return picked.map(() => null);
  const used = new Set();
  const pick = variantPicker(variantSeed);
  return picked.map(item => {
    const fact = factsFor(item, basics).find(f => !used.has(f.key));
    if (!fact) return null;
    used.add(fact.key);
    return pick(factKind(fact), NOTE_TEMPLATES[factKind(fact)])(fact);
  });
}

// ② で先に挙げる事実の順：条件に届きにくい間合い → 低い素質を補う → Sスタートを狙える間合い → 育成でSを目指せる間合い → 高い素質
const SUMMARY_ORDER = ['aptitude:low', 'talentLow', 'aptitude:start', 'aptitude:train', 'talentHigh'];

/** 最も高い素質（同率は画面順で併記） */
function topTalents(basics) {
  const top = Math.max(...Object.values(basics.talent));
  return { value: top, labels: TALENTS.filter(t => basics.talent[t.key] === top).map(t => t.label) };
}

/**
 * ② セクション導入文（基礎データのある体だけ。無い体は build.js の従来の文）。
 * 能力名を出した助言を最大 maxAdvice 個（同じ能力・同じ事実は1回）。書けなければ素質と間合いの要約。
 * 並び順の断り（※新しいカードの能力から並べています）は build.js が全ページ共通の注記として別の行に出す
 */
function abilitySummary(monster, picked, basics, variantSeed = 0, maxAdvice = 2) {
  if (!basics || !picked.length) return null;
  const pick = variantPicker(variantSeed);
  const parts = [];
  const advice = picked
    .flatMap((item, order) => factsFor(item, basics).map(fact => ({ item, fact, order })))
    .sort((a, b) => SUMMARY_ORDER.indexOf(factKind(a.fact)) - SUMMARY_ORDER.indexOf(factKind(b.fact)) || a.order - b.order);
  const usedAbility = new Set();
  const usedFact = new Set();
  for (const { item, fact } of advice) {
    if (parts.length >= maxAdvice || usedAbility.has(item.name) || usedFact.has(fact.key)) continue;
    usedAbility.add(item.name);
    usedFact.add(fact.key);
    parts.push(pick(factKind(fact), ADVICE_TEMPLATES[factKind(fact)])(monster.name, item.name, fact));
  }
  if (!parts.length && basics.talent && basics.range) {
    const top = topTalents(basics);
    const good = RANGES.filter(r => better(basics.range[r.key], 'C') <= 0).map(r => `${r.label}${basics.range[r.key]}`);
    const ranges = good.length ? `開始時にC以上の間合いは${good.join('・')}` : '開始時の間合い適性はすべてD以下';
    // 最も高い素質が0%以下（全部0%など）なら素質には触れず、間合いだけ書く
    parts.push(top.value > 0 ? pick('profile', PROFILE_TEMPLATES)(monster.name, `${top.labels.join('・')}の${signed(top.value)}%`, ranges) : `${ranges}。`);
  }
  return parts.length ? parts.join('') : null;
}

/** ③ meta description に入れる短い句（例：「ちからの素質+15%。」）。書ける事実が無ければ空文字 */
function descriptionFact(basics) {
  if (!basics || !basics.talent) return '';
  const top = topTalents(basics);
  return top.value > 0 ? `${top.labels.join('・')}の素質${signed(top.value)}%。` : '';
}

module.exports = { TALENT_HIGH, TALENT_LOW, talentKeys, abilityNotes, abilitySummary, descriptionFact };
