'use strict';
/**
 * アシスト能力の説明文を構造化する（P15-4b 能力スコアリングの第1段）。
 *
 * 入力は src/data/assist-abilities.json の description。出力は
 *   apply   … 適用条件（誰が使えるか）。自身オーラ／モン類／血統。カードTierにだけ効く
 *   lines[] … 効果行ごとの 状況条件・トリガー・技条件・効果原子（数値つき）・回数・秒数
 * 評価値はここでは出さない。式は src/lib/ability-score.js、基準値と補正は src/data/ability-rubric.json。
 *
 * 語彙は docs/ability-scoring-design.md の表が正。抽出できなかった文字列は
 * line.residual に残し、scripts/build-ability-parse.js がカバレッジ表に出す。
 */

const AURAS = ['赤', '青', '黄', '黒', '白', '緑'];
const MONS = ['獣族', '無機', '魔族', '創造', '幻霊', '怪物'];
const BLOODS = ['アーク', 'アローヘッド', 'イルミネ', 'ウンディーネ', 'ガリ', 'カワズモー', 'キジン', 'キュービ', 'グジラ', 'クジラ', 'ゲル', 'ケンタウロス', 'ゴースト', 'ゴーレム', 'ザン', 'ジョーカー', 'シンリュウ', 'スエゾー', 'ディノ', 'デュラハン', 'ドラゴン', 'ナーガ', 'ニャー', 'ネンドロ', 'ノーブル', 'ハム', 'ピクシー', 'ヒノトリ', 'プラント', 'ヘンガー', 'メタルナー', 'モッチー', 'モノリス', 'ユグドラシル', 'ライガー', 'レアモン', 'ロード', 'ワーム'];
const BUFFS = ['精密', '強襲', '幻影', '見切り', '連撃強化', '変転', '乱変転', '強撃', '覇気', '充填', '狙撃', '急所', '必殺', '確撃', '焦熱', '増強', '昂気', '霊魂', 'エーテル', '業物', '散華', '装甲', '本気', '超本気'];
const DEBUFFS = ['衰弱', '暗闇', '疲労', '追撃封鎖', '混乱', '虚弱', '乱心', '火傷', '裂傷', '出血', '魅了', '傷口', '暗闘', '弱気', '恐怖', '虚脱'];
const STATS = ['ライフ', 'ちから', 'かしこさ', '命中', '回避', '丈夫さ'];

// 大分類→中分類。原子語はこの中分類のどれかに必ず属する
const CATEGORIES = {
  '火力': ['与ダメ上昇', 'クリ率上昇', 'クリダメ上昇', 'クリ確定', '追撃', '連撃', '攻撃ステ加算', 'ステ上昇', '貫通', '技性能上昇'],
  '命中': ['必中', '命中率上昇', 'ステ上昇'],
  '回避・防御': ['完全回避', '回避率上昇', '被ダメ低下', '被ダメブロック', 'クリ無効', 'シールド展開', 'ステ上昇', '食いしばり'],
  'ガッツ': ['ガッツ回復', 'ガッツダメ上昇', 'ガッツダメ低下', '消費ガッツ'],
  '弱体': ['相手ステ低下', '相手被ダメ上昇', '相手ガッツ停止', 'シールド破壊', '封じ', 'デバフ付与', '相手忠誠度減少', '相手ガッツ減少'],
  '支援': ['バフ付与', '無効化・解除', 'オーラ変貌', '適性効果上昇', 'ライフ回復', '技ステ上昇', 'ステ変換'],
};
// ステ上昇は stats で大分類が決まる
const STAT_CATEGORY = { 'ちから': '火力', 'かしこさ': '火力', '攻撃ステータス': '火力', '命中': '命中', '回避': '回避・防御', '丈夫さ': '回避・防御', 'ライフ': '回避・防御' };

const GRADE_ORDER = ['I', 'II', 'III', 'IV', 'V', 'VI'];

function normalize(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/％/g, '%').replace(/＋/g, '+').replace(/－/g, '-').replace(/～/g, '~')
    .replace(/[＜]/g, '<').replace(/[＞]/g, '>')
    .replace(/Ｌｖ/g, 'Lv').replace(/ＬＶ/g, 'Lv')
    .replace(/命中率と回避率(<?\+?\d+%>?)/g, '命中率$1、回避率$1')
    .replace(/回避率と被ダメが上昇し/g, '回避率が上昇し、')
    .replace(/、さらに/g, '\nさらに')
    .replace(/>さらに/g, '>\nさらに')
    .replace(/クリ率とクリダメ(<?\+?\d+%>?)/g, 'クリ率$1、クリダメ$1')
    // 「<+10%><最大+40%>」の累積は上限の値で持ち、累積の補正は stack 条件で掛ける
    .replace(/<\+?(\d+)%>(?:<最大\+?(\d+)%>)/g, '<+$2%>')
    // 「回避ステータスと丈夫さステータス<+10%>」は両方に効くので2つに分ける（セラフィナパッション）
    .replace(/(ライフ|ちから|かしこさ|命中|回避|丈夫さ)(?:ステ(?:ータス)?)?と(ライフ|ちから|かしこさ|命中|回避|丈夫さ)ステ(?:ータス)?(<[^>]+>)/g, '$1ステータス$3、$2ステータス$3')
    .replace(/[ 　\t]+/g, ' ');
}

/** 名前から系列と段階を取る。I→II、III→IV は上位だけ評価対象（superseded は build 側で決める） */
function parseSeries(name) {
  const m = String(name).trim().match(/^(.*?)\s*(I|II|III|IV|V|VI)$/);
  if (m) return { base: m[1].trim(), grade: m[2] };
  const s = String(name).trim().match(/^(.*・)(序|破|急)$/);
  if (s) return { base: s[1] + '{序破急}', grade: s[2] };
  return { base: String(name).trim(), grade: null };
}

/** 角括弧 [..] の1トークンを分類する */
function classifyBracket(token) {
  const t = token.trim();
  const attr = { aura: [], mon: [], blood: [] };
  const parts = t.split(/または|かつ/);
  let allAttr = parts.length > 0;
  for (const p0 of parts) {
    const p = p0.replace(/^自身/, '').replace(/^主血統/, '').replace(/種$/, '');
    if (AURAS.includes(p)) attr.aura.push(p);
    else if (MONS.includes(p)) attr.mon.push(p);
    else if (BLOODS.includes(p)) attr.blood.push(p);
    else allAttr = false;
  }
  if (allAttr && !/^相手/.test(t)) return { kind: 'apply', value: { ...attr, op: /かつ/.test(t) ? 'and' : (parts.length > 1 ? 'or' : null), raw: t } };
  if (/^(序盤|前半|中盤|後半|終盤)$/.test(t)) return { kind: 'time', value: t };
  if (/^(有利|有利以外|不利以外|自身有利|オーラ有利|自身オーラ有利|モン類有利|不利)$/.test(t)) return { kind: 'stance', value: t };
  if (/^(砂漠|森林|海岸|雪山|火山)$/.test(t)) return { kind: 'terrain', value: t };
  if (/^(晴れ|曇り|雨|悪天候)$/.test(t)) return { kind: 'weather', value: t };
  if (/^(前衛|後衛|遠距離|中距離|近距離|零距離)$/.test(t)) return { kind: 'position', value: t };
  if (/^相手/.test(t)) return { kind: 'opponent', value: t };
  if (/^(状態変化|怒)$/.test(t)) return { kind: 'state', value: t };
  if (/^(最大耐久値|最大値|上昇量|ライフ\d|\d+%以|モン類Lv|累積|最大\d+回|最大\d+%|1回$)/.test(t)) return { kind: 'numeric', value: t };
  if (/^同名能力|^古代トチカのちから・|^執事の心得・/.test(t)) return { kind: 'reference', value: t };
  // [強撃Lv1] [被ダメ-20%<20秒>] [乱心<20秒>] など、付与される効果そのもの
  return { kind: 'grant', value: t };
}

// 効果原子。順序＝優先。value は最初に取れた数値グループ
const ATOMS = [
  ['必中', /必中Lv(\d+)|(?:が|に)?必中(?!Lv)/],
  ['完全回避', /完全回避Lv(\d+)|完全回避(?!Lv)/],
  ['クリ確定', /クリティカル確定|必ずクリティカル/],
  ['クリ無効', /クリティカル無効|被クリ率<?-(\d+)%>?|被クリダメ<?-(\d+)%>?/],
  ['技性能上昇', /技性能<(\d+)%>上昇|技性能(?:を)?<?\+?(\d+)%>?(?:上昇)?/],
  ['ガッツダメ上昇', /ガッツダメ(?:ージ)?上昇<\+(\d+)>|ガッツダメ(?:ージ)?上昇Lv(\d+)|ガッツダメ(?:ージ)?<?\+?(\d+)%?>?(?:上昇)?/],
  ['与ダメ上昇', /与ダメ上昇<1個につき(\d+)%>|(?:特殊|追撃)与ダメ<?\+(\d+)%>?|与ダメ上昇<?\+(\d+)%>?|(?:与ダメ(?:ージ)?|技ダメージ|特殊与ダメ|(?<!ガッツ|被|クリ|クリティカル)ダメ)上昇Lv(\d+)|(?:与ダメ(?:ージ)?|技ダメージ)(?:を)?<?\+?(\d+)%>?(?:上昇|増加)|ダメージ<?\+(\d+)%>?|ダメージ(?:を|に)?(\d+)%(?:上昇|乗算)|与ダメージ(?:が)?上昇(?:<最大(\d+)%>)?|(?<!被)ダメージ上昇<最大(\d+)%>/],
  ['クリダメ上昇', /クリ(?:ティカル)?ダメ(?:ージ)?上昇Lv(\d+)|クリ(?:ティカル)?ダメ(?:ージ)?<?\+?(\d+)%>?/],
  ['クリ率上昇', /クリ(?:ティカル)?率上昇Lv(\d+)|クリ(?:ティカル)?率<?\+?(\d+)%>?|クリ(?:ティカル)?率が?上昇/],
  ['連撃', /連撃(?:強化)?Lv(\d+)|連撃回数(?:が)?(?:\+(\d+)|上昇)|連撃(?:を)?(?:<(\d+)回>)?(?:付与|発動)/],
  ['追撃', /(?:ライフ|最大ライフ|ちから|かしこさ|命中|回避|丈夫さ|与ダメ(?:ージ)?|ダメージ|相手のちから|技ダメージ)?(?:ステ(?:ータス)?)?(?:の|から)?<?(\d+)%>?(?:分)?(?:の|で)(?:<\d+回>)?追撃(?:を<\d+回>(?:与える|追加)|<\d+回>|を与える|を追加|ダメージ)?|(?:の|で)?<(\d+)回>追撃|追撃<(\d+)回>|追撃を<(\d+)回>(?:与える|追加)|追撃Lv(\d+)|(?:で|の)追撃(?:を与える|ダメージ|を追加)?|追撃ダメージ(?:Lv)?(\d+)?|(?:最大ライフの)?(\d+)%の追加ダメージ(?:を与える)?|追加ダメージLv(\d+)/],
  ['攻撃ステ加算', /(?:ライフ|ちから|かしこさ|命中|回避|丈夫さ|技ガッツダウン|忠誠度|人気度|攻撃ステータス|モン類レベル)?(?:の)?<?(\d+)%>?(?:を|×<?\d+%>?を)?(?:さらに)?(?:攻撃ステ(?:ータス)?|技ダメージ|ダメージ)に(?:加算|乗算)|高い方を攻撃ステータスとして使用|(?:攻撃ステ(?:ータス)?|技ダメージ)に加算|(?:を)?ダメージに乗算/],
  ['ステ変換', /(?:ライフ|ちから|かしこさ|命中|回避|丈夫さ)ステ(?:ータス)?の<?(\d+)%>?を(?:(?:ちから|かしこさ|命中|回避|丈夫さ|ライフ)、)+(?:ちから|かしこさ|命中|回避|丈夫さ|ライフ)ステ(?:ータス)?に加算|(?:ライフ|ちから|かしこさ|命中|回避|丈夫さ)(?:の)?<?(\d+)%>?を(?:かしこさ|ちから|命中|回避|丈夫さ|ライフ)(?:ステータス)?に加算|(?:人気度|忠誠度)\d+を超えた分を(?:命中率|攻撃ステータス)に加算/],
  ['命中率上昇', /命中率上昇<最大\+?(\d+)%>|命中(?:率)?上昇Lv(\d+)|命中率(?:を|に)?<?\+?(\d+)%>?(?!>?毎)(?:上昇|加算)?|命中率(?:が)?上昇/],
  ['回避率上昇', /回避(?:率)?上昇Lv(\d+)|回避率<?\+?(\d+)%>?(?:上昇|減少|低下)?|回避(?:率)?低下|回避率(?:が)?上昇/],
  ['被ダメ低下', /被ダメ(?:ージ)?低下Lv(\d+)|(?:連撃\/追撃|追撃|連撃)のダメージを(\d+)%ダウン|被ダメ(?:ージ)?<?-?(\d+)%>?(?:減少|低下|軽減|カット)?|(?:技|相手の)?ダメージを<?(\d+)%>?(?:減少|低下|軽減)|被ダメカット|(?:相手の)?技ダメージを<-?(\d+)>低下|最大ライフ<?(\d+)%>?以上の(?:被ダメ|ダメージ)(?:を)?(?:カット|軽減)|最大ライフの割合で特殊ダメージカット/],
  ['被ダメブロック', /被ダメブロックLv(\d+)|被ダメブロック<?[+-]?(\d+)%?>?|ブロックLv(\d+)|ブロック<-(\d+)%>/],
  ['シールド展開', /(?:ライフ|最大ライフ|丈夫さ|ちから|かしこさ)?(?:の)?(\d+)%(?:分)?\s*の【?シールド】?(?:を)?展開|【?シールド】?(?:を)?(?:展開|付与)(?:<(\d+)>)?|【?シールド】?(?:の)?耐久値<?\+(\d+)>?/],
  ['シールド破壊', /【?シールド】?(?:を)?破壊/],
  ['ガッツ回復', /ガッツ回復Lv(\d+)|ガッツ回復(?:速度)?(?:を)?<?\+?(\d+)%>?(?:上昇)?|ガッツ速度上昇Lv(\d+)|ガッツ<\+(\d+)>|ガッツ(?:を)?(\d+)回復|ガッツ<(\d+)>回復|ガッツ回復<\+(\d+)>|ガッツ回復(?!を停止)/],
  ['相手ガッツ停止', /相手のガッツ回復を停止|ガッツ回復を停止/],
  ['相手ガッツ減少', /相手のガッツ(?:を)?<?-?(\d+)>?(?:減少|低下|にする)|所持オーラ種×<(\d+)>ガッツダメ/],
  ['ガッツダメ低下', /被ガッツダメ(?:ージ)?(?:減少|低下)Lv(\d+)|被ガッツダメ(?:ージ)?(?:を)?<?-?(\d+)%?>?(?:減少|低下)?/],
  ['消費ガッツ', /消費ガッツ上昇Lv(\d+)|消費ガッツ(?:を|量)?<?([-+]?\d+)%?>?(?:減少|上昇|低下)?|ガッツ消費量(\d+)%(?:上昇|減少)|消費ガッツ(?:が)?低下/],
  ['相手忠誠度減少', /相手の忠誠度を(\d+)%減少/],
  ['相手被ダメ上昇', /相手(?:の|に)被ダメ(?:ージ)?上昇Lv(\d+)|相手(?:の|に)被ダメ(?:ージ)?上昇<?(\d+)%>?|相手(?:の|に)被ダメ(?:ージ)?<?\+?(\d+)%>?/],
  ['自身ステ低下', /自身の(?:ちから|かしこさ|命中|回避|丈夫さ|ライフ)ステ(?:ータス)?<-(\d+)%>/],
  // 自分の被ダメ上昇はデメリット。大分類には数えない（CATEGORIES に入れない）
  ['自身被ダメ上昇', /被ダメ(?:ージ)?上昇<最大(\d+)%>/],
  ['相手ステ低下', /相手の命中率(?:減少|低下)Lv(\d+)|相手の(?:ライフ以外の)?基礎ステータス<?(\d+)%>?(?:低下|減少)|相手の?(?:攻撃ステータス|ライフ以外のステ(?:ータス)?|全ステ(?:ータス)?|ちから(?:と|・)?かしこさ(?:ステ)?|回避(?:と|・)?命中(?:ステ)?|ちから|かしこさ|命中|回避|丈夫さ|命中率|回避率)(?:ステ(?:ータス)?)?(?:を)?<?-?(\d+)%>?(?:減少|低下|吸収)?|(?:ライフ以外のステ|ちからとかしこさステ|回避と命中ステ)<-(\d+)%>|相手の攻撃ステータス減少<-(\d+)%>|相手の攻撃ステータスをちからとかしこさの低い方にする/],
  ['封じ', /使用不可|使用(?:でき|出来)なく|追撃封鎖|封じ/],
  ['無効化・解除', /(?:追撃|連撃)(?:[\/／](?:追撃|連撃))?ダメージ(?:を)?(?:すべて)?無効(?:化)?|(?:追撃|連撃|状態変化|デバフ|能力|効果)(?:\/(?:追撃|連撃))?(?:を)?(?:無効|解除)/],
  ['食いしばり', /(?:通常\/追撃\/連撃)?ダメージを受けた時ライフ1で耐える|ライフ1で耐える/],
  ['オーラ変貌', /有利オーラに変貌|有利オーラ(?:に)?変換|オーラ有利(?:に|として)/],
  ['適性効果上昇', /(?:近|中|遠|零)?距離?適性効果上昇Lv(\d+)|地形適性効果上昇Lv(\d+)|(?:地形)?適[性応]効果(?:を)?<?\+?(\d+)%>?/],
  ['ライフ回復', /ライフ(?:を)?<?(\d+)%?>?回復|ライフ(?:が)?回復/],
  ['貫通', /貫通Lv(\d+)|貫通/],
  ['技ステ上昇', /技ステータス<?\+(\d+)>?|すべての技ステータス上昇Lv(\d+)|技ステ(?:ータス)?(?:が)?上昇/],
  ['ステ上昇', /攻撃ステ上昇<最大\+?(\d+)%>|(?:攻撃ステータス|ちから|かしこさ|命中|回避|丈夫さ|ライフ)(?:ステ(?:ータス)?)?上昇\+(\d+)%|全ステ(?:ータス)?\+(\d+)(?![\d%])|人気度と忠誠度の合計値<?(\d+)%>?をライフ以外の全ステータスに加算|ライフ以外の基礎ステータス<?(\d+)%>?上昇|(?:ライフを除く|ライフ以外の)?(?:全ステ(?:ータス)?|ライフ以外のステ(?:ータス)?)(?:を)?<?\+?(\d+)%>?(?:上昇)?|(?:攻撃ステータス|ちから|かしこさ|命中|回避|丈夫さ|ライフ)(?:ステ(?:ータス)?)?(?:を|が)?<(\d+)%>上昇|(?:攻撃ステータス|ちから|かしこさ|命中|回避|丈夫さ|ライフ)(?:ステ(?:ータス)?)?上昇<\+(\d+)%>|(?:攻撃ステータス|ちから|かしこさ|命中|回避|丈夫さ|ライフ)(?:ステ(?:ータス)?)?(?:を|が)?<?\+(\d+)%?>?(?:上昇)?|(?:攻撃ステータス|ちから|かしこさ|命中|回避|丈夫さ|ライフ)(?:ステ(?:ータス)?)?(?:を|が)?(\d+)%上昇|(?:ちから|かしこさ|丈夫さ|命中|回避|ライフ)UP\s?Lv(\d+)|基礎(?:丈夫さ|ちから|かしこさ|命中|回避|ライフ)ステ\+(\d+)|(?:攻撃ステータス|ちから|かしこさ|命中|回避|丈夫さ|ライフ)(?:ステ(?:ータス)?)?(?:が)?上昇(?:Lv(\d+)|<最大(\d+)%>)?/],
  ['クリ率上昇', /クリ率大上昇/],
  ['命中率上昇', /命中率大上昇/],
  ['回避率上昇', /回避率大上昇/],
  ['ガッツ回復', /ガッツ(?:が)?大回復|ガッツ速度大上昇/],
  ['ガッツダメ上昇', /ガッツダメ大上昇/],
  ['与ダメ上昇', /与ダメ大上昇/],
  ['バフ付与', new RegExp('(' + BUFFS.join('|') + ')(?:Lv(\\d+))?')],
  ['デバフ付与', new RegExp('(' + DEBUFFS.join('|') + ')(?:Lv(\\d+))?')],
];

const TRIGGERS = [
  ['技非命中時', /技を外した(?:とき|時)|技が命中しなかった(?:とき|時)|命中しなかった(?:とき|時)/],
  ['技命中時', /技命中後|技命中時|技が命中した(?:とき|時)|命中時|命中したとき/],
  ['技発動時', /技発動時|技を発動した(?:とき|時)|技発動で|技発動中/],
  ['被ダメ無効時', /被ダメ無効時/],
  ['被ダメ時', /相手技命中時|被ダメ(?:した)?(?:とき|時)|技を受けた時|ダメージを受けた時|ガッツダメージ受けた時/],
  ['回避時', /技回避時|技を回避後|回避後|回避した(?:とき|時)|技を回避したとき/],
  ['クリティカル時', /クリティカル(?:発生)?時/],
  ['バトル開始時', /バトル開始時/],
  ['シールド破壊時', /シールド(?:が)?破壊(?:された)?時/],
];

function stripAll(text, patterns) {
  let rest = text;
  for (const re of patterns) rest = rest.replace(re, ' ');
  return rest;
}

function parseLine(rawLine) {
  const line = { raw: rawLine, conditions: {}, apply: null, trigger: null, skillCond: {}, effects: [], grants: [], residual: '' };
  let text = rawLine.trim().replace(/^[・\-]\s*/, '');
  // 1. 角括弧
  text = text.replace(/\[([^\]]+)\]/g, (m, inner, offset, whole) => {
    // 「相手[創造]時」のように直前が「相手」なら、自身の適用条件ではなく相手の条件
    if (whole.slice(Math.max(0, offset - 2), offset) === '相手') { (line.conditions.opponent = line.conditions.opponent || []).push('相手' + inner); return ' '; }
    const c = classifyBracket(inner);
    if (c.kind === 'apply') {
      // [無機][自身黒] のように適用条件が並ぶときは「かつ」。and に各グループを持つ
      if (line.apply) {
        const groups = [...(line.apply.and || [line.apply]), c.value];
        line.apply = { aura: groups.flatMap(g => g.aura), mon: groups.flatMap(g => g.mon), blood: groups.flatMap(g => g.blood), op: 'and', raw: groups.map(g => g.raw).join('][') , and: groups };
      } else line.apply = c.value;
      return ' ';
    }
    if (c.kind === 'grant') { line.grants.push(c.value); return ' [G] '; }
    (line.conditions[c.kind] = line.conditions[c.kind] || []).push(c.value);
    return ' ';
  });
  // 「相手<オーラ緑>技発動後」は自分の技ではなく相手の技の色（ローズシールド）
  text = text.replace(/相手<オーラ(赤|青|黄|黒|白|緑)>技(?:発動後|発動時)?、?/g, (m, c) => { (line.conditions.opponentAura = line.conditions.opponentAura || []).push('相手' + c + '技'); return ' '; });
  // 2. 技条件 <...>技
  const skillAura = text.match(/<(?:オーラ)?(赤|青|黄|黒|白|緑)(?:オーラ)?(?:または(?:オーラ)?(赤|青|黄|黒|白|緑|無))?>(?:オーラ)?(?:ちから|かしこさ)?技|<(?:オーラ技)(赤|青|黄|黒|白|緑)>|<(赤|青|黄|黒|白|緑)オーラ技>|(赤|青|黄|黒|白|緑)技(?:発動|命中)|<(?:オーラ)?(黒または無|緑または無|オーラなしまたは青|黒または白)(?:オーラ)?>技/);
  if (skillAura) { line.skillCond.aura = (skillAura.slice(1).filter(Boolean)).join('または'); const keep = skillAura[0].match(/(ちから|かしこさ)技$/); text = text.replace(skillAura[0], skillAura[0].endsWith('技') ? (keep ? keep[0] : '技') : ' '); }
  const stance = text.match(/<(オーラ有利|オーラ不利以外|オーラなし|オーラあり|オーラ|相手オーラ|オーラ技|オーラなし技|オーラ有利技)>(?:技)?|オーラ有利時|(オーラ技|オーラなし技)(?=が?(?:発動|命中))/);
  if (stance) { line.skillCond.stance = stance[1] || stance[2] || 'オーラ有利'; text = text.replace(stance[0], /技/.test(stance[0]) ? '技' : ' '); }
  const type = text.match(/<(ちから|かしこさ)>技|(ちから|かしこさ)技(?=発動|命中|を)/);
  if (type) { line.skillCond.type = type[1] || type[2]; text = text.replace(type[0], '技'); }
  const rank = text.match(/R(\d)以上(?:の)?/); if (rank) { line.skillCond.rank = Number(rank[1]); text = text.replace(rank[0], ' '); }
  // 「間合い適性に応じて」は一番下の段（S以上）から効く（全種族魅了）
  if (/間合い適性に応じて/.test(text)) { line.skillCond.aptitude = 'S以上'; text = text.replace(/間合い適性に応じて/, ' '); }
  const apt = !line.skillCond.aptitude && text.match(/(?:間合い)?(?:適性)?(M|SS|S|A)(以上|未満)(?:：|の間合いで|技)?/); if (apt) { line.skillCond.aptitude = apt[1] + apt[2]; text = text.replace(apt[0], ' '); }
  const pos = text.match(/<(前衛|後衛|相手前衛|相手後衛)>技/); if (pos) { line.skillCond.position = pos[1]; text = text.replace(pos[0], '技'); }
  const selfAura = text.match(/自身<オーラ(赤|青|黄|黒|白|緑)>で/); if (selfAura) { line.apply = line.apply || { aura: [], mon: [], blood: [], op: null, raw: selfAura[0] }; line.apply.aura.push(selfAura[1]); text = text.replace(selfAura[0], ' '); }
  const size = text.match(/自身<(小さい|ふつう|大きい)>で/); if (size) { (line.conditions.size = line.conditions.size || []).push(size[1]); text = text.replace(size[0], ' '); }
  const oppAura = text.match(/相手が<オーラ(赤|青|黄|黒|白|緑)>のとき/); if (oppAura) { (line.conditions.opponent = line.conditions.opponent || []).push('相手' + oppAura[1]); text = text.replace(oppAura[0], ' '); }
  const dist = text.match(/<?(遠距離|中距離|近距離|零距離)>?(?:技|で)/); if (dist) { line.skillCond.range = dist[1]; text = text.replace(dist[0], ' '); }
  if (/つ前と同じ技|同じ技を使用|連続で使用|連続使用|連続で発動|1回前が/.test(text)) { line.skillCond.repeat = true; text = text.replace(/(?:\d)?つ前と同じ技を使用した(?:とき|時)|同じオーラ技を連続で使用した(?:とき|時)|1回前が[^、]*(?:時|とき)/, ' '); }
  // 3. トリガー
  // 文中で最初に出るトリガーをこの行のものにする。「次の効果」の見出しに2つあるときは、最後のものが後続行のトリガー
  const found = [];
  for (const [name, re] of TRIGGERS) { const m = text.match(re); if (m && !found.some(f => f.index === m.index)) found.push({ name, index: m.index, re }); }
  found.sort((a, b) => a.index - b.index);
  if (found.length) {
    line.trigger = found[0].name; text = text.replace(found[0].re, ' ');
    if (found.length > 1 && /次の効果/.test(text)) { line.childTrigger = found[found.length - 1].name; text = text.replace(found[found.length - 1].re, ' '); }
  }
  // 4. 散文の状況条件
  const prose = [
    ['compare', /相手より(?:も)?(?:[^、\s]+?)(?:ステータス)?が(?:高い|多い)(?:とき|時|と)?/],
    ['life', /(?:自身の)?(?:残り)?(?<!最大)ライフ(?:が)?<?\d+%>?(?:以上|以下|未満|の時)(?:かつ|、|で|の時|時)?|残りライフが(?:少ない|多い)(?:ほど|とき|時)|相手ライフが少ない時|ライフが相手より高いと|残りライフが相手より多い時/],
    ['stance', /(?:優勢|劣勢)のとき|優勢時|劣勢時/],
    ['weather', /天候が(?:晴れ|曇り|悪天候)のとき/],
    ['loyalty', /(?:忠誠度|人気度)<?\d+>?(?:以上)?(?:かつ)?[^、]*?(?:超えた分を)?/],
    ['stack', /スタック(?:が)?<?\d+>?(?:になり)?|地形適性に応じて|技のRに応じて|回数に応じて|(?<!ライフの?|率)に応じて|(?<!<)(?:\d+)個につき|度に|回数分/],
    ['probability', /<(\d+)%>の確率で|稀に/],
    ['while', /(?:この能力の)?【?シールド】?破壊まで|(?:この)?シールド展開中|発動中|この効果中/],
    ['opponentShield', /相手シールド展開中(?:のとき)?/],
    // 他の能力で相手の技や移動を止めないと発動しない（コスモスシールド）
    ['opponentDisabled', /相手が技使用・移動のいずれか不可の時/],
    ['guts', /(?:相手|残り)?ガッツ(?:が)?\d+(?:以上|以下|未満)(?:の時|時|で)?|相手ガッツが多いとき/],
    // 超闘魂の「中盤以降」は後半と同じ重み
    ['time', /中盤以降で?/],
    ['opponentSize', /相手<(?:大きい|小さい|ふつう)>(?:で|と|のとき)?/],
    ['opponentAura', /相手<オーラ(?:赤|青|黄|黒|白|緑)>(?:のとき|かつ|で)?/],
    ['compare2', /(?:ちから|かしこさ|丈夫さ|命中|回避)優位時|<?(?:ちから|かしこさ|丈夫さ|命中|回避)>?が相手より高い時|自身の回避ステ\d+以上の時/],
    ['monLevel', /モン類(?:Lv|レベル)\d+以上の時|モン類(?:Lv|レベル)に応じて/],
    // 「回数に応じて次の効果」の段階（ホワイトアウト：1回：…／2回：…／3回：…）
    ['stage', /^(\d)回：/],
    // 「次の効果をランダムで付与」は後続行のどれか1つ（巫女の占い）
    ['random', /次の効果をランダムで付与|ランダムで次の効果/],
  ];
  for (const [kind, re] of prose) { const m = text.match(re); if (m) { (line.conditions[kind] = line.conditions[kind] || []).push(m[0].trim()); text = text.replace(re, ' '); } }
  // 5. 回数・秒数・上限
  const dur = text.match(/<(\d+)秒>/); if (dur) { line.duration = Number(dur[1]); text = text.replace(/<\d+秒>/g, ' '); }
  // 「一定時間」は20秒とみなす（管理者確認 2026-09-27）
  if (line.duration == null && /一定時間/.test(text)) { line.duration = 20; text = text.replace(/一定時間/, ' '); }
  if (/<永続>/.test(text)) { line.duration = 'permanent'; text = text.replace(/<永続>/, ' '); }
  const max = text.match(/<最大(\d+)回>|最大(\d+)回まで|累積(\d+)回まで|<(\d+)回まで(?:重複可|累積)>/); if (max) { line.maxStack = Number(max.slice(1).find(Boolean)); text = text.replace(max[0], ' '); }
  if (/何回でも|何度でも/.test(text)) { line.limit = 'unlimited'; text = text.replace(/<?(?:何回でも|何度でも)>?/, ' '); }
  const each = text.match(/<各(?:オーラ種毎に)?(\d+)回>/); if (each) { line.limit = { per: 'aura', n: Number(each[1]) }; text = text.replace(each[0], ' '); }
  // 追撃・連撃に隣接する <N回> はヒット数。それ以外の <N回> は発動回数制限
  const hitsM = text.match(/<(\d+)回>(?=追撃|連撃)|(?:追撃|連撃)<(\d+)回>|追撃を<(\d+)回>|[×✕xX](\d+)回/);
  if (hitsM) { line.hits = Number(hitsM.slice(1).find(Boolean)); text = text.replace(hitsM[0], m => m.replace(/<\d+回>|[×✕xX]\d+回/, '')); }
  const lim = text.match(/<(\d+)回>/); if (lim) { line.limit = Number(lim[1]); text = text.replace(/<\d+回>/g, ' '); }
  // 6. 効果原子
  let rest = text;
  const grantsText = line.grants.join(' / ');
  for (const [atom, re] of ATOMS) {
    const found = [];
    rest = rest.replace(new RegExp(re.source, 'g'), (...m) => {
      const groups = m.slice(1, -2).filter(v => v !== undefined);
      // 全ステ系は6項目（「ライフを除く／以外」ならライフを外す）。それ以外は本文に出るステ名
      const stats = /全ステ|ライフ以外の(?:基礎)?ステ|ライフを除く/.test(m[0])
        ? STATS.filter(s => !(s === 'ライフ' && /ライフ(?:を除く|以外)/.test(m[0])))
        : STATS.filter(s => m[0].includes(s));
      found.push({ atom, value: groups.length ? Number(groups[0]) : null, unit: /Lv/.test(m[0]) ? 'Lv' : (/%/.test(m[0]) ? '%' : (groups.length ? 'pt' : null)), stats: stats.length ? stats : undefined, text: m[0].trim() });
      // text は分類（ステ上昇の全ステ判定）にだけ使う
      return ' ';
    });
    line.effects.push(...found);
  }
  // 付与される効果 [G] の中身も原子として解析（[強撃Lv1]・[被ダメ-20%<20秒>] など）
  for (const g of line.grants) {
    const inner = parseLine(g.replace(/<\d+秒>/, m => m));
    for (const e of inner.effects) line.effects.push({ ...e, granted: true, duration: inner.duration });
  }
  // 7. 残り
  const fillerPhrases = ['次の効果が発動', '次の効果を発動', '次の効果発動', '次の効果', '効果が発動', '効果を発動', '次の能力を付与', 'バトル中', 'この能力の', 'この効果', 'ランダムで', '一定時間', 'を付与', '付与', '発動', 'する', '自身に', '自身の', '自身', '相手に', '相手の', '相手', '次の技', '技', 'さらに', 'また', 'かつ', 'ずつ', '能力', '効果', 'の時', 'のとき', 'とき', '[G]', '＆', '&'];
  let residual = rest;
  for (const ph of fillerPhrases) residual = residual.split(ph).join(' ');
  line.residual = residual.replace(/[のをにがでと、。,.・：:\s<>]+|時/g, '').trim();
  return line;
}

function parseAbility(ability) {
  const text = normalize(ability.description);
  const rawLines = text.split('\n').map(s => s.trim()).filter(Boolean);
  const lines = rawLines.map(parseLine);
  // apply は先頭行の角括弧が基本だが、行ごとに違う条件が付くこともある（[有利]など状況は別）
  const apply = lines.map(l => l.apply).find(Boolean) || null;
  const flags = [];
  if (lines.some(l => (l.conditions.reference || []).length)) flags.push('reference');
  // 条件だけの行（「〜時、次の効果を発動」）は残りが無ければ問題ない。効果が1つも無ければ none
  const anyEffect = lines.some(l => l.effects.length);
  const status = anyEffect && lines.every(l => l.residual === '') ? 'full' : (anyEffect ? 'partial' : 'none');
  const series = parseSeries(ability.name);
  return { abilityId: ability.abilityId, name: ability.name, series, apply, lines, status, flags };
}

/** 系列の中で上位に置き換えられる段階に superseded を付ける（I→II、III→IV。IIとIVは並列） */
function markSuperseded(parsed) {
  const bySeries = new Map();
  for (const p of parsed) {
    const key = p.series.base;
    (bySeries.get(key) || bySeries.set(key, []).get(key)).push(p);
  }
  for (const group of bySeries.values()) {
    const grades = new Set(group.map(p => p.series.grade));
    for (const p of group) {
      const g = p.series.grade;
      p.superseded = (g === 'I' && grades.has('II')) || (g === 'III' && grades.has('IV')) || (g === 'V' && grades.has('VI'));
    }
  }
  return parsed;
}

function categoriesOf(parsed) {
  const set = new Set();
  for (const line of parsed.lines) for (const e of line.effects) {
    if (e.atom === 'ステ上昇' || e.atom === 'ステ変換') {
      const stats = e.stats && e.stats.length ? e.stats : ['攻撃ステータス'];
      for (const s of stats) set.add(STAT_CATEGORY[s] || '支援');
      continue;
    }
    for (const [cat, atoms] of Object.entries(CATEGORIES)) if (atoms.includes(e.atom)) set.add(cat);
  }
  return [...set];
}

module.exports = { AURAS, MONS, BLOODS, BUFFS, DEBUFFS, STATS, CATEGORIES, STAT_CATEGORY, GRADE_ORDER, normalize, parseSeries, classifyBracket, parseLine, parseAbility, markSuperseded, categoriesOf, ATOMS, TRIGGERS };
