#!/usr/bin/env node
/**
 * 「相性のいいアシスト能力」の、その体の基礎データから書く文の確認（build-spec 5-12・src/lib/ability-fit-note.js）。
 * 能力と基礎データは架空のもので持つ。CMSで説明文が変わっても、このテストは壊れない。
 */

const assert = require('assert');
const parser = require('../src/lib/ability-parser');
const { abilityNotes, abilitySummary, descriptionFact } = require('../src/lib/ability-fit-note');

const item = (name, description, categories = ['回避・防御']) => ({ name, categories, parsed: parser.parseAbility({ abilityId: 'x', name, description }) });
const basics = (talent = {}, range = {}) => ({
  talent: { life: 0, power: 0, wisdom: 0, accuracy: 0, evasion: 0, defense: 0, ...talent },
  range: { far: 'B', mid: 'B', near: 'E', zero: 'D', ...range },
});
const note = (description, b) => abilityNotes([item('x', description)], b)[0];
const monster = { name: 'テスト', aura: '白', mon: '獣族', blood: 'グジラ' };

// --- 基礎データの無い体には何も書かない
assert.deepStrictEqual(abilityNotes([item('x', '回避ステ<+400>')], null), [null]);
assert.strictEqual(abilitySummary(monster, [item('x', '回避ステ<+400>')], null), null);
assert.strictEqual(descriptionFact(null), '');

// --- 素質：ステを上げる効果は、高い素質と「噛み合う」、低い素質を「補う」（型0の文面で確かめる）
assert.match(note('バトル開始時、回避ステ<+400>', basics({ evasion: 10 })), /^回避が育ちやすく（素質\+10%・この体で最も高い）/);
assert.match(note('バトル開始時、回避ステ<+400>', basics({ evasion: 10, power: 15 })), /^回避が育ちやすく（素質\+10%）/);
assert.match(note('バトル開始時、回避ステ<+400>', basics({ evasion: -5 })), /回避の素質は-5%と低め/);
assert.strictEqual(note('バトル開始時、回避ステ<+400>', basics({ evasion: 5 })), null, '目立たない素質は書かない');
// 必中・完全回避・被ダメ低下はステの値に関係なく効くので、「補う」だけ
assert.strictEqual(note('完全回避Lv2<1回>', basics({ evasion: 15 })), null);
assert.match(note('完全回避Lv2<1回>', basics({ evasion: -10 })), /回避の素質は-10%と低めで、この能力で回避を補え/);
assert.match(note('被ダメ低下Lv6', basics({ defense: -5 })), /丈夫さの素質は-5%/);
// 相手のステ低下は自分の素質と結ばない。全ステ上昇（5項目以上）は書かない
assert.strictEqual(note('相手のかしこさステ<-30%>', basics({ wisdom: 15 })), null);
assert.strictEqual(note('ライフ以外の全ステータス<+30%>', basics({ power: 15 })), null);

// --- ①の中で同じ素質は1回だけ（2件目は書かない）
{
  const b = basics({ evasion: 10 });
  const notes = abilityNotes([item('a', 'バトル開始時、回避ステ<+400>'), item('b', '回避率<+20%>')], b);
  assert.ok(notes[0] && notes[1] === null);
}

// --- 間合い：開始時の値で書き分ける（B以上＝Sスタート、C＝育成でS、D以下＝上げよう）。名前の付いた条件はその間合い
const lilac = '[自身白]バトル中、自身に次の効果<br>・零または近距離適性がS以上の時、全ステータス<+30%>と[業物Lv6]';
assert.strictEqual(note(lilac, basics({}, { near: 'E', zero: 'D' })), '発動条件の零・近距離適性S以上に対して、開始時は零D・近Eと低め。秘伝や育成の書で上げておきたい。');
assert.match(note(lilac, basics({}, { near: 'E', zero: 'C' })), /開始時の零C・近Eは、秘伝・育成の書や育成中のイベントでSを目指せる/);
assert.match(note(lilac, basics({}, { near: 'B', zero: 'E' })), /Sスタートを狙える/);
const apt = '[自身白][序盤]間合い適性S以上の時、次の効果が発動<br>・最大ライフ<30%>以上の被ダメ軽減<br>・SS以上かつ[相手黒]の時、追撃無効';
assert.strictEqual(note(apt, basics()), '発動条件は間合い適性S以上。開始時の遠B・中Bなら、育成開始時の上昇でSスタートを狙える。');
assert.match(note(apt, basics({}, { far: 'C', mid: 'D' })), /開始時の遠Cは、秘伝/);
assert.match(note(apt, basics({}, { far: 'D', mid: 'D' })), /開始時は遠D・中D・近E・零Dと低め/);
// 同じ条件の文は2回書かない（2件目は素質があれば素質を書く）
{
  const notes = abilityNotes([item('a', apt), item('b', `${apt}<br>・回避ステ<+400>`)], basics({ evasion: 10 }));
  assert.match(notes[0], /発動条件は間合い適性S以上/);
  assert.match(notes[1], /回避/);
}

// --- 言い回しは種類ごとに3通り。種（同じ主血統・オーラの中の順番）が違えば、同じ事実でも型が違う
{
  const b = basics({ evasion: -10 });
  const texts = [0, 1, 2].map(seed => abilityNotes([item('x', '完全回避Lv2<1回>')], b, seed)[0]);
  assert.strictEqual(new Set(texts).size, 3);
  assert.strictEqual(abilityNotes([item('x', '完全回避Lv2<1回>')], b, 3)[0], texts[0], '4番目の体は1番目と同じ型に戻る');
  const leads = [0, 1, 2].map(seed => abilitySummary(monster, [item('x', '完全回避Lv2<1回>')], b, seed));
  assert.strictEqual(new Set(leads).size, 3);
  // 語尾は体言止めか「〜よう」。です・ます・〜ましょうは使わない
  for (const text of [...texts, ...leads]) assert.doesNotMatch(text, /です|ます|ましょう/);
}

// --- ② 導入文：能力名を出した助言は最大2つ（届きにくい間合い→低い素質→Sスタート→…の順）。並び順の断りは入れない（build.js の注記）
{
  const picked = [item('花嫁', apt), item('ルピナス', 'バトル開始時、回避ステ<+400>'), item('ライラック', lilac), item('d', '与ダメ上昇Lv7', ['火力']), item('e', '命中率<+30%>', ['命中'])];
  const summary = abilitySummary(monster, picked, basics({ evasion: -10 }));
  assert.match(summary, /^ライラックは零・近距離適性S以上が発動条件だが、テストの開始時は零D・近E。秘伝や育成の書で頑張って上げよう。/);
  assert.match(summary, /ルピナス/);
  assert.doesNotMatch(summary, /花嫁/, '助言は2つまで');
  assert.doesNotMatch(summary, /新しいカード/);
  // 続けて並ぶ2つの助言は、同じ型から始まらない
  const two = abilitySummary(monster, [item('a', '完全回避Lv2<1回>'), item('b', 'バトル開始時、丈夫さステ<+400>')], basics({ evasion: -10, defense: 15 }));
  assert.doesNotMatch(two, /^テストは.*。テストは/);
  // 能力と結べる事実が無ければ、素質と間合いの要約
  assert.strictEqual(abilitySummary(monster, [item('d', '与ダメ上昇Lv7', ['火力'])], basics({ power: 15 })), '素質はちからの+15%が最も高く、開始時にC以上の間合いは遠B・中B。');
  // 素質が全部0%なら素質には触れない（「全部の0%が最も高い」と書かない）
  assert.strictEqual(abilitySummary(monster, [item('d', '与ダメ上昇Lv7', ['火力'])], basics()), '開始時にC以上の間合いは遠B・中B。');
  // 「素質が高い」の型はどれも述語で終わる（「〜の組み合わせ。」のような名詞だけの文にしない）
  for (const seed of [0, 1, 2]) {
    const text = abilityNotes([item('x', '命中率<+30%>')], basics({ accuracy: 10 }), seed)[0];
    assert.doesNotMatch(text, /組み合わせ。|強化/, text);
  }
}

// --- ③ description の句（同率は画面順で併記。プラスが無ければ空）
assert.strictEqual(descriptionFact(basics({ power: 10, evasion: 10 })), 'ちから・回避の素質+10%。');
assert.strictEqual(descriptionFact(basics({ power: -5 })), '');

console.log('test-ability-fit-note: OK');
