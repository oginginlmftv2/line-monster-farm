'use strict';
/**
 * アシスト能力の評価値（power）を出す（P15-4b 能力スコアリングの第2段）。
 *
 * 入力は src/lib/ability-parser.js の parseAbility() の結果（effects[].text を含む）と
 * src/data/ability-rubric.json。物差しは「与ダメ上昇Lv1＝1点」。
 * 値の根拠は docs/ability-scoring-design.md の3-1。ここには式だけを置き、数値は rubric から読む。
 *
 * 行の評価 = Σ 効果の値 × 稼働率または回数 × 条件・トリガー・技条件の補正
 * 能力の評価 = 行の合計（同じ原子語は逓減）。下限0
 * 適用条件（hard: [自身赤] など）は power に織り込まない（カードTier側で使う）。
 */

const DECISIVE = new Set(['必中', '完全回避', '食いしばり', '被ダメカット', '被ダメ無効']);

function createScorer(rubric) {
  const B = rubric.battle;
  const C = rubric.coefficients;
  const F = rubric.flat;
  const MOD = rubric.modifiers;
  const d = B.dmgPerLv;
  const held = new Set(rubric.held.abilityIds);
  const heldGrants = new Set(rubric.held.grants);

  // ---------------------------------------------------------------- 物差しへの換算
  const pctToLv = pct => pct / d;
  // 命中率・回避率を pp 上げたときの価値（期待ダメージの増分×M）
  const hitPpToLv = pp => (pp / B.hitRate * 100) / d * C.M;
  // ステータス1項目を pct% 上げたときの価値。お互い statBase を基準にする
  function statToLv(stat, pct) {
    switch (stat) {
      case '攻撃': return pctToLv(pct) * C.special;
      case 'ちから': case 'かしこさ': return pctToLv(pct) * C.special * 0.6;
      // 命中・回避ステ +100 で命中率 ±hitPpPer100Stat%
      // 上げ幅が大きいほど命中率の差が大きく開く（statCurve>1で上に反る）。+100で±hitPpPer100Stat%
      case '命中': case '回避': { const per100 = pct / 100 * B.statBase / 100; return hitPpToLv(B.hitPpPer100Stat * Math.sign(per100) * Math.pow(Math.abs(per100), B.statCurve || 1)); }
      case '丈夫さ': return pctToLv(pct / 2);
      case 'ライフ': return pctToLv(pct) * 0.9;
      default: return 0;
    }
  }
  function statsToLv(stats, pct) {
    const set = new Set(stats);
    let total = 0;
    if (set.has('ちから') && set.has('かしこさ')) { set.delete('ちから'); set.delete('かしこさ'); set.add('攻撃'); }
    for (const s of set) total += statToLv(s, pct);
    return total;
  }
  const gutsToLv = guts => guts * C.gutsToLv;
  const hitsPerBattle = B.skillsPerBattle * B.hitRate / 100;
  // 忠誠度→意味不明の発生率（0で65%、50で20%、70超で0）
  function confusionRate(loyalty) {
    if (loyalty <= 0) return 0.65;
    if (loyalty <= 50) return 0.65 - 0.45 * loyalty / 50;
    if (loyalty <= 70) return 0.2 - 0.2 * (loyalty - 50) / 20;
    return 0;
  }
  const oneSkillShare = 100 / B.skillsPerBattle; // 技1発が試合のダメージに占める%

  // ---------------------------------------------------------------- 原子語ごとの値
  // kind: 'state'＝効いている間ずっと（稼働率を掛ける） / 'event'＝1回あたり（回数を掛ける）
  function effectValue(e, line) {
    const v = e.value;
    const t = e.text || '';
    const raw = line.raw || '';
    const lvOrPct = (lvScale, fallbackPct) => (e.unit === 'Lv' ? v * lvScale : (v != null ? v : fallbackPct));
    switch (e.atom) {
      case '与ダメ上昇': {
        let lv = e.unit === 'Lv' ? v : pctToLv(v != null ? v : C.largeUp);
        if (/特殊/.test(t)) lv *= C.special;
        if (/追撃与ダメ/.test(t)) lv *= C.followupOnly;
        // 「オーラ技の数だけ<1個につきX%>」は所持オーラ技を3個と見込む
        if (/個につき/.test(t)) lv *= 3;
        return { kind: 'state', lv };
      }
      case '相手被ダメ上昇': return { kind: 'state', lv: e.unit === 'Lv' ? v : pctToLv(v || 0) };
      case '自身ステ低下': return { kind: 'state', lv: -statsToLv(e.stats && e.stats.length ? e.stats : ['攻撃'], v || 0), penalty: true };
      case '自身被ダメ上昇': return { kind: 'state', lv: -pctToLv(v || 0) * 0.5, penalty: true };
      case '被ダメ低下': {
        // 「最大ライフの割合で特殊ダメージカット」は一番下の段（30%以上カット）で見る
        if (/最大ライフの割合/.test(t)) return { kind: 'event', lv: C.decisive * C.damageCut * 0.7 * C.defense, decisive: true };
        if (/最大ライフ/.test(t) && /カット|軽減/.test(t)) return { kind: 'event', lv: C.decisive * C.damageCut * (1 - (v || 0) / 100) * C.defense, decisive: true };
        if (/(?:追撃|連撃)のダメージ/.test(t)) return { kind: 'state', lv: pctToLv(v || 0) * B.followupShareOfMain / 100 * C.defense };
        if (e.unit === 'pt') return { kind: 'state', lv: pctToLv((v || 0) / B.mainDamage * 100) * C.defense };
        return { kind: 'state', lv: (e.unit === 'Lv' ? v : pctToLv(v != null ? v : 10)) * C.defense };
      }
      case '被ダメブロック': {
        const step = String(raw).match(/<(\d+)%>ずつ減少/);
        const pct = step && e.unit !== 'Lv' ? Math.max(0, (v || 0) - Number(step[1]) * (hitsPerBattle - 1) / 2) : v;
        return { kind: 'state', lv: (e.unit === 'Lv' ? pct : pctToLv(pct || 0)) * C.special * C.defense };
      }
      case 'クリ率上昇': return { kind: 'state', lv: pctToLv(lvOrPct(d, C.largeUp) * (B.critMultiplier - 1)) };
      case 'クリダメ上昇': return { kind: 'state', lv: pctToLv(B.critRate / 100 * lvOrPct(d, C.largeUp)) };
      case '命中率上昇': {
        // 「モン類Lvに応じて命中率上昇」は数値が次の行（モン類Lv2につき命中率上昇Lv1）にあるので、この行は数えない
        if (v == null && /に応じて/.test(raw)) return { kind: 'state', lv: 0 };
        // 「モン類Lv2につき…Lv1」はモン類Lv10で5倍
        const per = String(raw).match(/モン類Lv(\d+)につき/);
        return { kind: 'state', lv: hitPpToLv(lvOrPct(d, 20)) * (per ? 10 / Number(per[1]) : 1) };
      }
      case '回避率上昇': {
        const pp = lvOrPct(d, C.largeUp);
        return /減少|低下/.test(t) ? { kind: 'state', lv: -hitPpToLv(pp), penalty: true } : { kind: 'state', lv: hitPpToLv(pp) };
      }
      case 'ステ上昇': {
        // 「人気度と忠誠度の合計値X%を加算」は合計100とみなして実数X（管理者確認）
        const pt = /人気度と忠誠度/.test(t) ? v : (e.unit === 'pt' ? v : null);
        const pct = pt != null ? (pt / B.statBase * 100) : e.unit === 'Lv' ? v * d : (v != null ? v : C.largeUp);
        const stats = e.stats && e.stats.length ? e.stats : ['攻撃'];
        return { kind: 'state', lv: statsToLv(stats, pct) };
      }
      case '攻撃ステ加算': {
        const pct = /モン類レベル/.test(t) ? (v || 0) * 10 : (v != null ? v : 10);
        return { kind: 'state', lv: statToLv('攻撃', pct) };
      }
      case 'ステ変換': {
        const pct = v != null ? v : 10;
        // 「丈夫さステの13%をちから、かしこさ、命中、回避ステに加算」は加算先が複数。加算元は加算先と同じ値とみなす
        const to = (t.split('を')[1] || t).match(/ちから|かしこさ|命中|回避|丈夫さ|ライフ/g) || [];
        if (to.length > 1) return { kind: 'state', lv: statsToLv(to, pct) };
        return { kind: 'state', lv: statToLv(/命中/.test(to[0] || t) ? '命中' : '攻撃', pct) };
      }
      case '追撃': {
        const hits = line.hits || 1;
        if (e.unit === 'Lv') return { kind: 'state', lv: pctToLv(v * C.comboPerLv) * hits };
        const pct = v != null ? v : 10;
        const statBased = /ライフ|ちから|かしこさ|命中|回避|丈夫さ/.test(t);
        return { kind: 'state', lv: pctToLv(pct) * (statBased ? C.statFollowup : 1) * hits };
      }
      case '連撃': return { kind: 'state', lv: pctToLv((v || 1) * C.comboPerLv) * (line.hits || 1) };
      case '技性能上昇': return { kind: 'state', lv: pctToLv(v || 0) * (1 + C.M) };
      case '技ステ上昇': return { kind: 'state', lv: (v || 2) * F['技ステ上昇_per1'] };
      case '貫通': return { kind: 'state', lv: pctToLv((v || 1) * 10 / 2) };
      case '適性効果上昇': {
        // 地形は加算が終わった最終値に Lv×10% を上乗せ。距離は暫定で Lv×5%
        const pct = e.unit === 'Lv' ? (v || 1) * (/地形/.test(t) ? 10 : 5) : (v || 0);
        return { kind: 'state', lv: statToLv('攻撃', pct) };
      }
      case 'オーラ変貌': return { kind: 'state', lv: pctToLv(20) + hitPpToLv(B.hitRate * 0.2) };
      case 'クリ無効': {
        // 相手のクリティカルを消す。被クリ率-X%は相手のクリ率から、被クリダメ-X%は相手のクリダメから引く
        if (/被クリ率/.test(t)) return { kind: 'state', lv: pctToLv(Math.min(v || 0, B.critRate) * (B.critMultiplier - 1)) };
        if (/被クリダメ/.test(t)) return { kind: 'state', lv: pctToLv(B.critRate / 100 * Math.min(v || 0, (B.critMultiplier - 1) * 100)) };
        return { kind: 'state', lv: pctToLv(B.critRate / 100 * (B.critMultiplier - 1) * 100) };
      }
      case 'クリ確定': return { kind: 'event', lv: pctToLv(oneSkillShare * (B.critMultiplier - 1) * (1 - B.critRate / 100)) };
      // 「発動技の必中をLv3に上昇」は2本目の必中ではなく、同じ必中のLvが上がるだけ（1発分のLv補正の差）
      case '必中': if (/必中をLv(\d+)に上昇/.test(raw)) { const n = Number(raw.match(/必中をLv(\d+)に上昇/)[1]); return { kind: 'event', lv: C.decisive * C.decisiveLvStep * (n - 1), decisive: true, upgradeHalf: true }; }
        return { kind: 'event', lv: C.decisive * (1 + C.decisiveLvStep * ((v || 1) - 1)), shots: /発動技と次の技/.test(raw) ? 2 : 1, decisive: true };
      case '完全回避': return { kind: 'event', lv: C.decisive * C.evadeOverHit * (1 + C.decisiveLvStep * ((v || 2) - 1)), decisive: true };
      case '食いしばり': return { kind: 'event', lv: F['食いしばり'], decisive: true };
      case 'シールド展開': {
        const numeric = (line.conditions.numeric || []).join(' ');
        let cap = C.shieldCap;
        const m1 = numeric.match(/最大耐久値(\d+)/); if (m1) cap = Number(m1[1]);
        const m2 = numeric.match(/最大値\+(\d+)/); if (m2) cap += Number(m2[1]);
        const dur = String(line.raw).match(/耐久値<?(\d+)>?/); if (dur) cap = Number(dur[1]);
        let amount = cap;
        if (/丈夫さ|回避|ちから|かしこさ/.test(t) && v) amount = Math.min(cap, B.statBase * v / 100);
        return { kind: 'event', lv: pctToLv(amount / B.mainDamage * oneSkillShare) * 1.5 };
      }
      case 'シールド破壊': return { kind: 'event', lv: F['シールド破壊'] };
      case '封じ': return { kind: 'event', lv: F['封じ'] };
      case 'ライフ回復': return { kind: 'event', lv: 5 };
      case '無効化・解除': {
        if (/能力解除|能力.*解除|解除/.test(t) && !/無効/.test(t)) return { kind: 'event', lv: F['能力解除'] };
        if (/被ダメ/.test(raw) && /無効/.test(t) && !/追撃|連撃/.test(t)) return { kind: 'event', lv: C.decisive * C.damageCut, decisive: true };
        if (/追撃|連撃/.test(t)) {
          if (line.duration && line.duration !== 'permanent') return { kind: 'event', lv: F['追撃連撃無効'] * line.duration / 10 };
          if (line.limit == null) return { kind: 'state', lv: F['追撃連撃無効_常時'] };
          return { kind: 'event', lv: F['追撃連撃無効'] };
        }
        return { kind: 'event', lv: 10 };
      }
      case 'ガッツ回復': {
        if (/速度/.test(t)) return { kind: 'state', lv: gutsToLv(B.gutsPerBattle * lvOrPct(1, C.largeUp) / 100) };
        if (/リセット/.test(raw)) return { kind: 'event', lv: 0 };
        // 「忠誠度90を超えた分ガッツ回復<最大30>」は超えた分の見込み（loyaltyExcessGuts）で、上限で止める
        if (/忠誠度\d+を超えた分/.test(raw)) { const cap = String(raw).match(/<最大(\d+)>/); return { kind: 'event', lv: gutsToLv(Math.min(cap ? Number(cap[1]) : Infinity, C.loyaltyExcessGuts)) }; }
        // 「技の命中回数×<6>ガッツ回復<最大30>」は1技の命中回数（hitsPerSkill）を掛けて上限で止める
        const perHit = String(raw).match(/命中回数×<?(\d+)>?/);
        if (perHit) { const cap = String(raw).match(/<最大(\d+)>/); return { kind: 'event', lv: gutsToLv(Math.min(cap ? Number(cap[1]) : Infinity, Number(perHit[1]) * B.hitsPerSkill)) }; }
        const guts = e.unit === 'Lv' || e.unit === 'pt' || e.unit === '%' ? v : 30;
        return { kind: 'event', lv: gutsToLv(guts || 0) };
      }
      case 'ガッツダメ上昇': case 'ガッツダメ低下': {
        const perHit = e.unit === 'Lv' || e.unit === 'pt' ? v : 15 * (v != null ? v : C.largeUp) / 100;
        return { kind: 'state', lv: gutsToLv(perHit * hitsPerBattle) };
      }
      case '消費ガッツ': {
        if (/吸収/.test(raw)) return { kind: 'event', lv: gutsToLv(B.avgGutsCost * (v || 0) / 100) };
        if (/固定/.test(raw)) return { kind: 'event', lv: gutsToLv(Math.max(0, (v || 0) - B.avgGutsCost)) * C.gutsDenialM };
        const guts = B.avgGutsCost * Math.abs(v != null ? v : 20) / 100;
        if (/相手/.test(raw)) return { kind: 'state', lv: gutsToLv(guts * 2) * C.gutsDenialM };
        const up = /上昇|増加|\+/.test(t) || /消費量\d+%上昇/.test(raw);
        return up ? { kind: 'state', lv: -gutsToLv(guts * B.skillsPerBattle), penalty: true } : { kind: 'state', lv: gutsToLv(guts * B.skillsPerBattle) };
      }
      case '相手ガッツ停止': return { kind: 'state', lv: F['相手ガッツ停止'] };
      case '相手ガッツ減少': {
        if (/0にする/.test(t) || v === 0) return { kind: 'event', lv: F['相手ガッツ0'] };
        if (/所持オーラ種/.test(t)) return { kind: 'event', lv: gutsToLv(30) };
        return { kind: 'event', lv: gutsToLv(v || 0) };
      }
      case '相手忠誠度減少': return { kind: 'event', lv: 2 * confusionRate(100 - (v || 0)) * C.confusion };
      case '相手ステ低下': {
        const pct = e.unit === 'Lv' ? v * d : (v != null ? v : 10);
        let lv = 0;
        if (/ライフ以外|全ステ/.test(t)) lv = statToLv('攻撃', pct) + statToLv('命中', pct) + statToLv('回避', pct) + statToLv('丈夫さ', pct);
        else {
          if (/攻撃ステ|ちから|かしこさ/.test(t)) lv += statToLv('攻撃', pct);
          if (/命中率|回避率/.test(t)) lv += hitPpToLv(pct);
          else { if (/命中/.test(t)) lv += statToLv('回避', pct); if (/回避/.test(t)) lv += statToLv('命中', pct); }
          if (/丈夫さ/.test(t)) lv += statToLv('丈夫さ', pct);
        }
        if (/吸収/.test(t)) lv *= 2;
        return { kind: 'state', lv };
      }
      case 'バフ付与': case 'デバフ付与': return grantValue(e, line);
      default: return { kind: 'state', lv: 0 };
    }
  }

  // [強撃Lv2] などの状態。Lv1 はステ系+10%、それ以外+5%
  function grantValue(e, line) {
    const name = String(e.text || '').replace(/Lv\d+$/, '');
    const m = String(e.text || '').match(/Lv(\d+)/);
    const lv = m ? Number(m[1]) : 1;
    const stat = lv * C.grantStatPerLv;
    const other = lv * C.grantOtherPerLv;
    if (heldGrants.has(name)) return { kind: 'state', lv: 0, held: true };
    switch (name) {
      case '強撃': return { kind: 'state', lv: statToLv('攻撃', stat) };
      // 増強は中身（全ステ+10%）がステ上昇として別に取れているときは二重に数えない
      case '増強': return /全ステ/.test(line.raw) ? { kind: 'state', lv: 0 } : { kind: 'state', lv: statsToLv(['ちから', 'かしこさ', '命中', '回避', '丈夫さ'], stat) };
      case '充填': return { kind: 'state', lv: gutsToLv(B.avgGutsCost * other / 100 * hitsPerBattle) };
      case '業物': return { kind: 'state', lv: pctToLv(other) * (1 + C.M) };
      case 'エーテル': return { kind: 'event', lv: F['エーテル'] };
      case '衰弱': case '裂傷': return { kind: 'state', lv: pctToLv(other) };
      case '暗闇': case '暗闘': return { kind: 'state', lv: hitPpToLv(other) };
      case '乱心': return { kind: 'event', lv: 2 * 0.2 * C.confusion };
      case '混乱': return { kind: 'event', lv: 2 * confusionRate(0) * C.confusion };
      default: return { kind: 'state', lv: 0 };
    }
  }

  // ---------------------------------------------------------------- 補正
  function conditionFactor(cond) {
    let f = 1;
    const each = (list, fn) => { for (const x of list || []) f *= fn(String(x)); };
    each(cond.time, x => MOD.time[/中盤以降/.test(x) ? '後半' : x] || 1);
    each(cond.stance, x => {
      if (/優勢/.test(x)) return MOD.stance['優勢'];
      if (/劣勢/.test(x)) return MOD.stance['劣勢'];
      return MOD.stance[x] || 1;
    });
    each(cond.terrain, () => MOD.terrain);
    each(cond.weather, x => { const k = Object.keys(MOD.weather).find(w => x.includes(w)); return k ? MOD.weather[k] : 1; });
    each(cond.position, () => MOD.position);
    each(cond.opponent, () => MOD.opponent);
    each(cond.state, x => MOD.state[x] || 1);
    each(cond.compare, () => MOD.compare);
    each(cond.life, x => {
      if (/相手ライフ/.test(x)) return MOD.life.opponentLow;
      if (/少ないほど/.test(x)) return MOD.life.lowScaling;
      if (/多いほど/.test(x)) return MOD.life.highScaling;
      if (/100%/.test(x)) return MOD.life.full;
      const th = x.match(/(\d+)%/);
      if (/未満|以下|少ない/.test(x)) {
        if (!th) return MOD.life.low30;
        const n = Number(th[1]);
        return n <= 10 ? MOD.life.low10 : n <= 30 ? MOD.life.low30 : MOD.life.low50;
      }
      if (th) { const n = Number(th[1]); return n <= 30 ? MOD.life.high30 : n <= 50 ? MOD.life.high50 : MOD.life.high70; }
      return MOD.life.high50;
    });
    each(cond.probability, x => { const m = x.match(/(\d+)%/); return m ? Number(m[1]) / 100 : MOD.probabilityRare; });
    // 「〜する度に」は頻繁に積み上がるので累積の割引を軽くする
    each(cond.stack, x => (/度に/.test(x) ? MOD.stackEvery : MOD.stack));
    each(cond.while, () => MOD.while);
    if ((cond.loyalty || []).length) f *= MOD.loyalty;
    each(cond.opponentShield, () => MOD.opponentShield);
    each(cond.opponentDisabled, () => MOD.opponentDisabled);
    each(cond.guts, () => MOD.guts);
    each(cond.opponentSize, () => MOD.opponentSize);
    each(cond.opponentAura, () => MOD.opponent);
    each(cond.compare2, () => MOD.compare);
    each(cond.monLevel, () => MOD.monLevel);
    each(cond.numeric, x => {
      if (/モン類Lv\d+以上/.test(x)) return MOD.monLevel;
      const m = x.match(/^(\d+)%(以上|以下|未満)$/);
      if (m) { const n = Number(m[1]); return m[2] === '以上' ? (n <= 30 ? MOD.life.high30 : n <= 50 ? MOD.life.high50 : MOD.life.high70) : n <= 10 ? MOD.life.low10 : n <= 30 ? MOD.life.low30 : MOD.life.low50; }
      return 1;
    });
    each(cond.stage, x => MOD.stage[x.replace(/\D/g, '')] || MOD.stage['3']);
    return f;
  }
  function skillCondFactor(sc, ctx) {
    const S = MOD.skillCond;
    let f = 1;
    // 技DBのある体は、その色の技が技全体に占める割合を使う（無い体は平均の0.5）
    if (sc.aura) f *= ctx && ctx.auraShare ? Math.max(0.2, ctx.auraShare(sc.aura)) : S.aura;
    if (sc.stance) {
      const s = String(sc.stance);
      f *= /なし/.test(s) ? S.stanceNone : /不利以外/.test(s) ? MOD.stance['不利以外'] : /有利/.test(s) ? S.stanceAdvantage : S.stanceAura;
    }
    if (sc.type) f *= S.type;
    if (sc.rank) f *= S.rank;
    if (sc.aptitude) {
      f *= S.aptitude[sc.aptitude] || S.aptitude['S以上'];
      // 基礎データのある体は、一番よい間合い適性から「育成でそこに届く見込み」を掛ける
      if (ctx && ctx.bestRange && !/未満/.test(sc.aptitude)) {
        const need = sc.aptitude.replace(/以上/, '');
        f *= (rubric.aptitudeReach.S[ctx.bestRange] ?? 1) * (rubric.aptitudeReach.beyondS[need] ?? 1);
        if (ctx.rangeCount != null) f *= ctx.rangeCount >= 2 ? rubric.aptitudeReach.rangeCount['2'] : rubric.aptitudeReach.rangeCount['1'];
      }
    }
    if (sc.range) f *= S.range;
    if (sc.position) f *= S.position;
    if (sc.repeat) f *= S.repeat;
    return f;
  }
  const TRIGGER_COUNT = { 'バトル開始時': 1, '技発動時': B.skillsPerBattle, '技命中時': hitsPerBattle, '被ダメ時': hitsPerBattle, '回避時': B.skillsPerBattle - hitsPerBattle, '技非命中時': B.skillsPerBattle - hitsPerBattle, 'クリティカル時': B.skillsPerBattle * B.critRate / 100, 'シールド破壊時': 1, '被ダメ無効時': hitsPerBattle * 0.25 };
  // 秒数の稼働率。バトル開始時は試合の頭（重みの大きい区間）から数える
  function durationShare(sec, trigger) {
    const T = rubric.timeWeight;
    const total = (T.early + T.mid + T.late) * 20;
    if (trigger === 'バトル開始時') {
      let w = 0, left = sec;
      for (const k of ['early', 'mid', 'late']) { const s = Math.min(20, left); w += s * T[k]; left -= s; if (left <= 0) break; }
      return w / total;
    }
    return sec * (total / 60) / total;
  }
  function limitOf(line) {
    if (typeof line.limit === 'number') return line.limit;
    if (line.limit && line.limit.n) return line.limit.n * (/オーラ種/.test(line.raw) ? 2 : 1);
    return null;
  }
  function stateUptime(line, isNext) {
    const trig = line.trigger;
    const lim = limitOf(line);
    if (line.duration === 'permanent') return 1;
    if (typeof line.duration === 'number') {
      const per = durationShare(line.duration, trig);
      const n = lim != null ? lim : (TRIGGER_COUNT[trig] || 1) * (trig && trig !== 'バトル開始時' ? 1 : 1);
      return Math.min(1, n * per);
    }
    if (isNext) return lim != null ? Math.min(1, lim / B.skillsPerBattle) : C.nextSkillRepeat;
    if (lim != null) return Math.min(1, lim / B.skillsPerBattle);
    return 1;
  }
  function eventCount(line, decisive) {
    const lim = limitOf(line);
    if (lim != null) return lim;
    let n = line.trigger ? (TRIGGER_COUNT[line.trigger] || 1) : 1;
    if (typeof line.duration === 'number') n = Math.max(1, n * line.duration / 60);
    return decisive ? (line.trigger ? n : C.decisiveCountCap) : n;
  }

  // ---------------------------------------------------------------- 能力
  function scoreAbility(parsed, monsterCtx) {
    if (held.has(parsed.abilityId)) return { abilityId: parsed.abilityId, held: true, power: null, parts: [] };
    const parts = [];
    let ctx = null; // 「〜時、次の効果が発動」の見出し行の条件・トリガーを後続行へ引き継ぐ
    let hasHeldGrant = false;
    // 「次の効果をランダムで付与」の見出しの後ろにある効果行の数（どれか1つが付く）
    const randomShare = new Map();
    parsed.lines.forEach((l, i) => {
      if (!(l.conditions.random || []).length) return;
      const after = [];
      for (let j = i + 1; j < parsed.lines.length && parsed.lines[j].effects.length; j++) after.push(j);
      for (const j of after) randomShare.set(j, 1 / after.length);
    });
    const effLines = parsed.lines.map((l, i) => [l, i]).filter(([l]) => l.effects.length);
    const chainLimit = new Map();
    const lastEff = effLines[effLines.length - 1];
    if (lastEff && /^さらに/.test(lastEff[0].raw.replace(/^[・\s]+/, '')) && typeof lastEff[0].limit === 'number') {
      for (const [l, i] of effLines.slice(0, -1)) if (l.limit == null) chainLimit.set(i, lastEff[0].limit);
    }
    for (const [lineIndex, line0Raw] of parsed.lines.entries()) {
      let line0 = chainLimit.has(lineIndex) ? { ...line0Raw, limit: chainLimit.get(lineIndex) } : line0Raw;
      const hasCond = Object.keys(line0.conditions).length || line0.trigger || Object.keys(line0.skillCond).length;
      const isHeader = !line0.effects.length && (/次の効果|以下の効果|次の能力/.test(line0.raw) || hasCond);
      if (isHeader) { ctx = { conditions: line0.conditions, trigger: line0.childTrigger || line0.trigger, skillCond: line0.skillCond, limit: line0.limit, duration: line0.duration, raw: line0.raw, grant: /付与/.test(line0.raw) }; continue; }
      const prev = lineIndex > 0 ? parsed.lines[lineIndex - 1] : null;
      if (prev && /^さらに/.test(line0.raw.replace(/^[・\s]+/, '')) && prev.effects.length) {
        line0 = { ...line0, trigger: line0.trigger || prev.trigger, conditions: mergeLists(prev.conditions, line0.conditions), skillCond: { ...prev.skillCond, ...line0.skillCond } };
      }
      const line = ctx ? {
        ...line0,
        trigger: line0.trigger || ctx.trigger,
        limit: line0.limit != null ? line0.limit : ctx.limit,
        duration: line0.duration != null ? line0.duration : ctx.duration,
        conditions: mergeLists(ctx.conditions, line0.conditions),
        skillCond: { ...ctx.skillCond, ...line0.skillCond },
      } : line0;
      const condsFor = atomList => (atomList.includes('食いしばり') ? { ...line.conditions, life: [] } : line.conditions);
      const underGrant = ctx && ctx.grant && line0.duration == null;
      const persistentGrant = underGrant || (/付与/.test(line.raw) && line.duration == null && !/秒>/.test(line.raw));
      const sc = persistentGrant ? { ...line.skillCond, rank: undefined, type: undefined, range: undefined } : line.skillCond;
      const factor = (randomShare.get(lineIndex) || 1) * Math.max(MOD.floor, conditionFactor(condsFor(line.effects.map(e => e.atom))) * skillCondFactor(sc, monsterCtx) * (line.trigger ? MOD.trigger[line.trigger] || 1 : 1));
      const isNext = /次の技/.test(line.raw) && !/発動技と次の技/.test(line.raw);
      const grantStacks = underGrant && typeof ctx.limit === 'number' ? ctx.limit : 1;
      const perUse = /技の発動回数に応じて/.test(line.raw);
      const stackBoost = (line.maxStack ? 1 + (line.maxStack - 1) * 0.5 : 1) * (1 + (grantStacks - 1) * (C.grantStackCredit ?? 0.5));
      for (const e of line.effects) {
        const ev = effectValue(e, line);
        if (ev.held) hasHeldGrant = true;
        if (!ev.lv) continue;
        let qty = ev.kind === 'event' ? eventCount(line, ev.decisive) * (ev.shots || 1) : (persistentGrant ? 1 : stateUptime(line, isNext));
        // 回数の付かない必中・完全回避などは合計3発分で頭打ち（2発で決着する環境）
        if (ev.decisive && limitOf(line) == null) qty = Math.min(C.decisiveCountCap, qty);
        // Lvの上昇は「発動技と次の技」のうち発動技の分だけ（頭打ち3発のうち半分）
        if (ev.upgradeHalf) qty = Math.min(qty, C.decisiveCountCap / 2);
        let ramp = 1;
        if (perUse && e.value) {
          let sum = 0;
          for (let k = 1; k <= B.skillsPerBattle; k++) sum += Math.min(C.perUseStackPct * k, e.value);
          ramp = sum / B.skillsPerBattle / e.value / MOD.stack; // conditionFactor で掛けた累積の一律割引を戻して置き換える
        }
        const lv = ev.lv * qty * (ev.penalty ? 1 : factor) * (ev.penalty ? 1 : stackBoost) * ramp;
        parts.push({ atom: e.atom, lv, penalty: !!ev.penalty, line: line.raw });
      }
      if (line0.effects.length && /次の効果|以下の効果/.test(line0.raw)) ctx = { conditions: line0.conditions, trigger: line0.childTrigger || line0.trigger, skillCond: line0.skillCond, limit: line0.limit, duration: line0.duration, raw: line0.raw, grant: /付与/.test(line0.raw) };
    }
    // 同じ原子語は逓減（大きい順に 1, 0.7, 0.5, 0.5…）。デメリットは逓減しない
    const byAtom = new Map();
    for (const p of parts) if (!p.penalty) (byAtom.get(p.atom) || byAtom.set(p.atom, []).get(p.atom)).push(p);
    for (const list of byAtom.values()) {
      list.sort((a, b) => b.lv - a.lv);
      list.forEach((p, i) => { p.lv *= C.sameAtomDecay[Math.min(i, C.sameAtomDecay.length - 1)]; });
    }
    const total = parts.reduce((s, p) => s + p.lv, 0);
    return { abilityId: parsed.abilityId, held: false, heldGrant: hasHeldGrant, power: Math.max(0, Math.round(total * 10) / 10), parts };
  }

  return { scoreAbility, effectValue, conditionFactor, skillCondFactor, confusionRate, statToLv, hitPpToLv };
}

function mergeLists(a, b) {
  const out = {};
  for (const src of [a || {}, b || {}]) for (const [k, v] of Object.entries(src)) out[k] = [...(out[k] || []), ...v];
  return out;
}

/** 同じ名前・同じ説明文（区切りの違いは無視）の能力を1種にまとめるキー。超根性などが複数IDで入っている */
function groupKey(ability) {
  return ability.name + '|' + String(ability.description || '').replace(/<br\s*\/?>|[・\s\/]/g, '');
}

/** 高い順に並べた点のうち、上位 percent% の位置の点（その点以上がそのTier） */
function cutAt(sortedDesc, percent) {
  if (!sortedDesc.length) return null;
  return sortedDesc[Math.max(0, Math.ceil(sortedDesc.length * percent / 100) - 1)];
}

/**
 * build.js 用：評価対象（系列の上位段階）すべての power と Tier を出す。
 * Tier の境界は同名・同説明をまとめた全体の上位 cutPercentile%。Tier は公開しない（並び順と選別に使う）。
 * reviewedThroughAbilityId より後の abilityId は、読み方の点検（scripts/audit-ability-reading.js）がまだの能力。
 */
function computeAbilityScores({ abilities, cards, rubric, parser }) {
  const scorer = createScorer(rubric);
  const cardById = new Map((cards || []).map(card => [card.cardId, card]));
  const parsed = parser.markSuperseded(abilities.map(ability => ({ ...parser.parseAbility(ability), source: ability.source, cardId: ability.cardId || null, description: parser.normalize(ability.description) })));
  const target = parsed.filter(p => !p.superseded);
  const reviewedThrough = rubric.review && rubric.review.reviewedThroughAbilityId;
  const rows = target.map(p => {
    const result = scorer.scoreAbility(p);
    const card = p.cardId ? cardById.get(p.cardId) : null;
    const top = [...result.parts].filter(part => part.lv > 0).sort((x, y) => y.lv - x.lv).slice(0, 3).map(part => part.atom);
    return {
      abilityId: p.abilityId,
      name: p.name,
      group: groupKey(p),
      source: p.source || null,
      cardId: p.cardId,
      releasedAt: card && card.releasedAt ? card.releasedAt : null,
      categories: parser.categoriesOf(p),
      power: result.held ? null : result.power,
      held: !!result.held,
      mainAtoms: [...new Set(top)],
      reviewed: !reviewedThrough || p.abilityId <= reviewedThrough,
    };
  });
  // 同名・同説明のまとまりは、abilityId の一番小さいものを代表IDにして持つ（説明文をそのまま持つと生成物が重い）
  const groupId = new Map();
  for (const row of [...rows].sort((x, y) => x.abilityId.localeCompare(y.abilityId))) if (!groupId.has(row.group)) groupId.set(row.group, row.abilityId);
  const groupPower = new Map();
  for (const row of rows) if (row.power != null && !groupPower.has(row.group)) groupPower.set(row.group, row.power);
  for (const row of rows) row.group = groupId.get(row.group);
  const sorted = [...groupPower.values()].sort((x, y) => y - x);
  const pct = rubric.tier.cutPercentile;
  const cut = { 1: cutAt(sorted, pct['1']), 2: cutAt(sorted, pct['2']), 3: cutAt(sorted, pct['3']) };
  for (const row of rows) {
    row.tier = row.power == null ? null : row.power >= cut[1] ? 1 : row.power >= cut[2] ? 2 : row.power >= cut[3] ? 3 : 4;
  }
  rows.sort((x, y) => (y.power ?? -1) - (x.power ?? -1) || x.abilityId.localeCompare(y.abilityId));
  return { rows, groups: groupPower.size, cut };
}

module.exports = { createScorer, computeAbilityScores, groupKey, DECISIVE };
