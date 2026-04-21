// ============================================================
// 全能力データ
// searchable:true = 探索UI・計算対象
// searchable:false = 効率一覧のみ
// ============================================================
const allAbilities = [

  // ======== 白 (元pt120) ========
  { id:"w120_0",   group:"白", label:"白",       cost:120, discount:null,  value:72,   eff:0.6000, searchable:true },
  { id:"w114_5",   group:"白", label:"白",       cost:114, discount:"5%",  value:72,   eff:0.6316, searchable:true },
  { id:"w108_10",  group:"白", label:"白",       cost:108, discount:"10%", value:72,   eff:0.6667, searchable:true },
  { id:"w102_15",  group:"白", label:"白",       cost:102, discount:"15%", value:72,   eff:0.7059, searchable:true },
  { id:"w96_20",   group:"白", label:"白",       cost:96,  discount:"20%", value:72,   eff:0.7500, searchable:true },
  { id:"w90_25",   group:"白", label:"白",       cost:90,  discount:"25%", value:72,   eff:0.8000, searchable:true },
  { id:"w84_30",   group:"白", label:"白",       cost:84,  discount:"30%", value:72,   eff:0.8571, searchable:true },
  { id:"w78_35",   group:"白", label:"白",       cost:78,  discount:"35%", value:72,   eff:0.9231, searchable:true },
  { id:"w72_40",   group:"白", label:"白",       cost:72,  discount:"40%", value:72,   eff:1.0000, searchable:true },

  // ======== 白 (元pt80) ========
  { id:"w80_0",    group:"白", label:"白",       cost:80,  discount:null,  value:48,   eff:0.6000, searchable:true },
  { id:"w76_5",    group:"白", label:"白",       cost:76,  discount:"5%",  value:48,   eff:0.6316, searchable:true },
  { id:"w72_10b",  group:"白", label:"白",       cost:72,  discount:"10%", value:48,   eff:0.6667, searchable:true },
  { id:"w68_15",   group:"白", label:"白",       cost:68,  discount:"15%", value:48,   eff:0.7059, searchable:true },
  { id:"w64_20",   group:"白", label:"白",       cost:64,  discount:"20%", value:48,   eff:0.7500, searchable:true },
  { id:"w60_25",   group:"白", label:"白",       cost:60,  discount:"25%", value:48,   eff:0.8000, searchable:true },
  { id:"w56_30",   group:"白", label:"白",       cost:56,  discount:"30%", value:48,   eff:0.8571, searchable:true },
  { id:"w52_35",   group:"白", label:"白",       cost:52,  discount:"35%", value:48,   eff:0.9231, searchable:true },
  { id:"w48_40",   group:"白", label:"白",       cost:48,  discount:"40%", value:48,   eff:1.0000, searchable:true },

  // ======== 白 (元pt100) ========
  { id:"w100_0",   group:"白", label:"白",       cost:100, discount:null,  value:60,   eff:0.6000, searchable:true },
  { id:"w95_5",    group:"白", label:"白",       cost:95,  discount:"5%",  value:60,   eff:0.6316, searchable:true },
  { id:"w90_10",   group:"白", label:"白",       cost:90,  discount:"10%", value:60,   eff:0.6667, searchable:true },
  { id:"w85_15",   group:"白", label:"白",       cost:85,  discount:"15%", value:60,   eff:0.7059, searchable:true },
  { id:"w80_20",   group:"白", label:"白",       cost:80,  discount:"20%", value:60,   eff:0.7500, searchable:true },
  { id:"w75_25",   group:"白", label:"白",       cost:75,  discount:"25%", value:60,   eff:0.8000, searchable:true },
  { id:"w70_30",   group:"白", label:"白",       cost:70,  discount:"30%", value:60,   eff:0.8571, searchable:true },
  { id:"w65_35",   group:"白", label:"白",       cost:65,  discount:"35%", value:60,   eff:0.9231, searchable:true },
  { id:"w60_40",   group:"白", label:"白",       cost:60,  discount:"40%", value:60,   eff:1.0000, searchable:true },

  // ======== 金 (元pt120) ========
  { id:"g108_10",  group:"金", label:"金",       cost:108, discount:"10%", value:102,  eff:0.9444, searchable:true },
  { id:"g102_15",  group:"金", label:"金",       cost:102, discount:"15%", value:102,  eff:1.0000, searchable:true },
  { id:"g96_20",   group:"金", label:"金",       cost:96,  discount:"20%", value:102,  eff:1.0625, searchable:true },
  { id:"g90_25",   group:"金", label:"金",       cost:90,  discount:"25%", value:102,  eff:1.1333, searchable:true },
  { id:"g84_30",   group:"金", label:"金",       cost:84,  discount:"30%", value:102,  eff:1.2143, searchable:true },
  { id:"g78_35",   group:"金", label:"金",       cost:78,  discount:"35%", value:102,  eff:1.3077, searchable:true },
  { id:"g72_40",   group:"金", label:"金",       cost:72,  discount:"40%", value:102,  eff:1.4167, searchable:true },

  // ======== 金 (元pt100) ========
  { id:"g100_0",   group:"金", label:"金",       cost:100, discount:null,  value:85,   eff:0.8500, searchable:true },
  { id:"g95_5",    group:"金", label:"金",       cost:95,  discount:"5%",  value:85,   eff:0.8947, searchable:true },
  { id:"g90_10",   group:"金", label:"金",       cost:90,  discount:"10%", value:85,   eff:0.9444, searchable:true },

  // ======== 金 (元pt90) ========
  { id:"g90_0",    group:"金", label:"金",       cost:90,  discount:null,  value:76.5, eff:0.8500, searchable:true },
  { id:"g86_5",    group:"金", label:"金",       cost:86,  discount:"5%",  value:76.5, eff:0.8895, searchable:true },
  { id:"g81_10",   group:"金", label:"金",       cost:81,  discount:"10%", value:76.5, eff:0.9444, searchable:true },

  // ======== 白+金 ========
  { id:"wg240",    group:"白+金", label:"白+金", cost:240, discount:null, value:174,   eff:0.7250, searchable:true },
  { id:"wg234",    group:"白+金", label:"白+金", cost:234, discount:null, value:174,   eff:0.7436, searchable:true },
  { id:"wg228",    group:"白+金", label:"白+金", cost:228, discount:null, value:174,   eff:0.7632, searchable:true },
  { id:"wg222",    group:"白+金", label:"白+金", cost:222, discount:null, value:174,   eff:0.7838, searchable:true },
  { id:"wg216",    group:"白+金", label:"白+金", cost:216, discount:null, value:174,   eff:0.8056, searchable:true },
  { id:"wg210",    group:"白+金", label:"白+金", cost:210, discount:null, value:174,   eff:0.8286, searchable:true },
  { id:"wg204",    group:"白+金", label:"白+金", cost:204, discount:null, value:174,   eff:0.8529, searchable:true },
  { id:"wg198",    group:"白+金", label:"白+金", cost:198, discount:null, value:174,   eff:0.8788, searchable:true },
  { id:"wg192",    group:"白+金", label:"白+金", cost:192, discount:null, value:174,   eff:0.9063, searchable:true },
  { id:"wg186",    group:"白+金", label:"白+金", cost:186, discount:null, value:174,   eff:0.9355, searchable:true },
  { id:"wg180",    group:"白+金", label:"白+金", cost:180, discount:null, value:174,   eff:0.9667, searchable:true },
  { id:"wg174",    group:"白+金", label:"白+金", cost:174, discount:null, value:174,   eff:1.0000, searchable:true },
  { id:"wg168",    group:"白+金", label:"白+金", cost:168, discount:null, value:174,   eff:1.0357, searchable:true },
  { id:"wg162",    group:"白+金", label:"白+金", cost:162, discount:null, value:174,   eff:1.0741, searchable:true },
  { id:"wg156",    group:"白+金", label:"白+金", cost:156, discount:null, value:174,   eff:1.1154, searchable:true },
  { id:"wg150",    group:"白+金", label:"白+金", cost:150, discount:null, value:174,   eff:1.1600, searchable:true },
  { id:"wg144",    group:"白+金", label:"白+金", cost:144, discount:null, value:174,   eff:1.2083, searchable:true },

  // ======== ひらめき(New) ========
  { id:"hira72",   group:"ひらめき", label:"ひらめき", cost:72, discount:"10%", value:64, eff:0.8889, searchable:true },
  { id:"hira68",   group:"ひらめき", label:"ひらめき", cost:68, discount:"15%", value:64, eff:0.9412, searchable:true },
  { id:"hira64",   group:"ひらめき", label:"ひらめき", cost:64, discount:"20%", value:64, eff:1.0000, searchable:true },
  { id:"hira60",   group:"ひらめき", label:"ひらめき", cost:60, discount:"25%", value:64, eff:1.0667, searchable:true },
  { id:"hira56",   group:"ひらめき", label:"ひらめき", cost:56, discount:"30%", value:64, eff:1.1429, searchable:true },
  { id:"hira52",   group:"ひらめき", label:"ひらめき", cost:52, discount:"35%", value:64, eff:1.2308, searchable:true },
  { id:"hira48",   group:"ひらめき", label:"ひらめき", cost:48, discount:"40%", value:64, eff:1.3333, searchable:true },

  // ======== その他（探索対象） ========
  // 白(特殊) 元pt120
  { id:"ws108_10", group:"その他", label:"白(特殊)", cost:108, discount:"10%", value:102, eff:0.9444, searchable:true },
  { id:"ws102_15", group:"その他", label:"白(特殊)", cost:102, discount:"15%", value:102, eff:1.0000, searchable:true },
  { id:"ws96_20",  group:"その他", label:"白(特殊)", cost:96,  discount:"20%", value:102, eff:1.0625, searchable:true },
  { id:"ws90_25",  group:"その他", label:"白(特殊)", cost:90,  discount:"25%", value:102, eff:1.1333, searchable:true },
  { id:"ws84_30",  group:"その他", label:"白(特殊)", cost:84,  discount:"30%", value:102, eff:1.2143, searchable:true },
  { id:"ws78_35",  group:"その他", label:"白(特殊)", cost:78,  discount:"35%", value:102, eff:1.3077, searchable:true },
  { id:"ws72_40",  group:"その他", label:"白(特殊)", cost:72,  discount:"40%", value:102, eff:1.4167, searchable:true },
  // 白(特殊) 元pt100
  { id:"ws100_0",  group:"その他", label:"白(特殊)", cost:100, discount:null,  value:85,  eff:0.8500, searchable:true },
  { id:"ws95_5",   group:"その他", label:"白(特殊)", cost:95,  discount:"5%",  value:85,  eff:0.8947, searchable:true },
  { id:"ws90_10",  group:"その他", label:"白(特殊)", cost:90,  discount:"10%", value:85,  eff:0.9444, searchable:true },
  // ロックオン系(白)
  { id:"lock_w140",  group:"その他", label:"ロックオン系(白)", cost:140, discount:null,  value:84, eff:0.6000, searchable:true },
  { id:"lock_w133",  group:"その他", label:"ロックオン系(白)", cost:133, discount:"5%",  value:84, eff:0.6316, searchable:true },
  { id:"lock_w126",  group:"その他", label:"ロックオン系(白)", cost:126, discount:"10%", value:84, eff:0.6667, searchable:true },
  // ロックオン系(金+白)
  { id:"lock_gw280", group:"その他", label:"ロックオン系(金+白)", cost:280, discount:null,  value:203, eff:0.7250, searchable:true },
  { id:"lock_gw266", group:"その他", label:"ロックオン系(金+白)", cost:266, discount:"5%",  value:203, eff:0.7632, searchable:true },
  { id:"lock_gw252", group:"その他", label:"ロックオン系(金+白)", cost:252, discount:"10%", value:203, eff:0.8056, searchable:true },
  // 英雄白
  { id:"hero_w120",group:"その他", label:"英雄白", cost:120, discount:null,  value:102, eff:0.8500, searchable:true },
  { id:"hero_w114",group:"その他", label:"英雄白", cost:114, discount:"5%",  value:102, eff:0.8947, searchable:true },
  { id:"hero_w108",group:"その他", label:"英雄白", cost:108, discount:"10%", value:102, eff:0.9444, searchable:true },
  // 英雄金+白
  { id:"hero_gw204",group:"その他",label:"英雄金+白", cost:204, discount:null, value:204, eff:1.0000, searchable:true },
  { id:"hero_gw192",group:"その他",label:"英雄金+白", cost:192, discount:null, value:204, eff:1.0625, searchable:true },
  { id:"hero_gw180",group:"その他",label:"英雄金+白", cost:180, discount:null, value:204, eff:1.1333, searchable:true },

  // ======== 一覧のみ（searchable:false） ========
  // ノラモン・ボスモン (代表データとして統合)
  { id:"nb_10", group:"ノラモン・ボスモン", label:"ノラモン・ボスモン", cost:"変動", discount:"10%", value:"変動", eff:1.1111, searchable:false },
  { id:"nb_15", group:"ノラモン・ボスモン", label:"ノラモン・ボスモン", cost:"変動", discount:"15%", value:"変動", eff:1.1765, searchable:false },
  { id:"nb_20", group:"ノラモン・ボスモン", label:"ノラモン・ボスモン", cost:"変動", discount:"20%", value:"変動", eff:1.2500, searchable:false },
  { id:"nb_25", group:"ノラモン・ボスモン", label:"ノラモン・ボスモン", cost:"変動", discount:"25%", value:"変動", eff:1.3333, searchable:false },
  { id:"nb_30", group:"ノラモン・ボスモン", label:"ノラモン・ボスモン", cost:"変動", discount:"30%", value:"変動", eff:1.4286, searchable:false },
  { id:"nb_35", group:"ノラモン・ボスモン", label:"ノラモン・ボスモン", cost:"変動", discount:"35%", value:"変動", eff:1.5385, searchable:false },
  { id:"nb_40", group:"ノラモン・ボスモン", label:"ノラモン・ボスモン", cost:"変動", discount:"40%", value:"変動", eff:1.6667, searchable:false },
  // 調
  { id:"chou80",   group:"調", label:"調", cost:80, discount:null,  value:84, eff:1.0500, searchable:false },
  { id:"chou76",   group:"調", label:"調", cost:76, discount:"5%",  value:84, eff:1.1053, searchable:false },
  { id:"chou72",   group:"調", label:"調", cost:72, discount:"10%", value:84, eff:1.1667, searchable:false },
  // 律
  { id:"ritsu100", group:"律", label:"律", cost:100,discount:null,  value:119,eff:1.1900, searchable:false },
  { id:"ritsu95",  group:"律", label:"律", cost:95, discount:"5%",  value:119,eff:1.2526, searchable:false },
  { id:"ritsu90",  group:"律", label:"律", cost:90, discount:"10%", value:119,eff:1.3222, searchable:false },
  // 超○○(虹のみ)
  { id:"cho_r108", group:"超虹", label:"超○○(虹)",  cost:108,discount:"10%",value:160,eff:1.4778,searchable:false },
  { id:"cho_r102", group:"超虹", label:"超○○(虹)",  cost:102,discount:"15%",value:160,eff:1.5647,searchable:false },
  { id:"cho_r96",  group:"超虹", label:"超○○(虹)",  cost:96, discount:"20%",value:160,eff:1.6625,searchable:false },
  // 超○○(新規)
  { id:"cho_n228", group:"その他",label:"超○○(新規)",cost:228,discount:null, value:160,eff:0.7018,searchable:true },
  { id:"cho_n216", group:"その他",label:"超○○(新規)",cost:216,discount:null, value:160,eff:0.7407,searchable:true },
  { id:"cho_n204", group:"その他",label:"超○○(新規)",cost:204,discount:null, value:160,eff:0.7843,searchable:true },
  // 贖罪Ⅰ
  { id:"shok100",  group:"贖罪",label:"贖罪Ⅰ",    cost:100,discount:null,  value:60, eff:0.6000,searchable:false },
  { id:"shok95",   group:"贖罪",label:"贖罪Ⅰ",    cost:95, discount:"5%",  value:60, eff:0.6316,searchable:false },
  { id:"shok90",   group:"贖罪",label:"贖罪Ⅰ",    cost:90, discount:"10%", value:60, eff:0.6667,searchable:false },
  // 贖罪Ⅰ+Ⅱ
  { id:"shok12_240",group:"その他",label:"贖罪Ⅰ+Ⅱ",cost:240,discount:null,  value:179,eff:0.7458,searchable:true },
  { id:"shok12_228",group:"その他",label:"贖罪Ⅰ+Ⅱ",cost:228,discount:"5%",value:179,eff:0.7850,searchable:true },
  { id:"shok12_216",group:"その他",label:"贖罪Ⅰ+Ⅱ",cost:216,discount:"10%",value:179,eff:0.8287,searchable:true },
];

// 探索対象のみ抽出
const searchAbilities = allAbilities.filter(a => a.searchable);

// ============================================================
// グループ設定（探索UI用）
// ============================================================
const searchGroups = [
  { key:"白",      label:"白",         cls:"gl-白" },
  { key:"金",      label:"金",         cls:"gl-金" },
  { key:"白+金",   label:"白＋金",     cls:"gl-白金" },
  { key:"ひらめき",label:"ひらめき",   cls:"gl-ひらめき" },
  { key:"その他",  label:"その他",     cls:"gl-その他" },
];

// カウント管理（id→所持数）
const counts = {};
allAbilities.forEach(a => counts[a.id] = 0);

// リンク管理（id→リンク先idのSet）
// リンクされた能力同士は「同じ実物」として扱い、組み合わせ計算から除外される
const links = {}; // id → string (リンク先id) or null
allAbilities.forEach(a => links[a.id] = null);

// ============================================================
// 能力リスト描画
// ============================================================
function renderAbilityList() {
  const container = document.getElementById('abilityList');
  let html = '';

  searchGroups.forEach((grp, idx) => {
    const items = searchAbilities.filter(a => a.group === grp.key);
    if (!items.length) return;

    html += `<div class="ability-group">
      <div class="group-header" onclick="toggleGroup('grp_${idx}')">
        <span class="group-label ${grp.cls}">${grp.label}</span>
        <span class="group-toggle-icon" id="icon_grp_${idx}">▼</span>
      </div>
      <div class="group-content" id="grp_${idx}" style="display: none;">`;

    items.forEach(ab => {
      // 白+金はラベルなし（取得ptのみ）
      const isWG = (ab.group === '白+金');
      // サブラベル（白/金/ひらめき/その他は label を表示）
      const subLabel = !isWG && ab.label !== '白' && ab.label !== '金' && ab.label !== 'ひらめき'
        ? `<span class="ability-sublabel">${ab.label}</span>` : '';

      const linkedId = links[ab.id];
      const linkBtnLabel = linkedId ? '🔗' : '🔗';
      const linkBtnTitle = linkedId
        ? `リンク中: ${getAbilityShortName(linkedId)} — クリックで解除`
        : 'この能力に含まれる部分能力をリンク';
      const linkActive = linkedId ? 'link-btn-active' : '';

      html += `
      <div class="ability-row" id="row_${ab.id}">
        <div class="ability-info">
          ${subLabel}
          <span class="ability-cost">${ab.cost}pt</span>
          ${(!isWG && ab.discount) ? `<span class="ability-disc">${ab.discount}</span>` : ''}
        </div>
        <button class="link-btn ${linkActive}" id="link_${ab.id}" title="${linkBtnTitle}" onclick="openLinkModal('${ab.id}')">${linkBtnLabel}</button>
        <div class="counter">
          <button class="counter-btn" onclick="change('${ab.id}',-1)">−</button>
          <div class="counter-val" id="cnt_${ab.id}">0</div>
          <button class="counter-btn" onclick="change('${ab.id}',+1)">＋</button>
        </div>
      </div>`;
    });
    html += `</div></div>`;
  });

  container.innerHTML = html;
}

function toggleGroup(id) {
  const content = document.getElementById(id);
  const icon = document.getElementById('icon_' + id);
  if (content.style.display === 'none') {
    content.style.display = 'block';
    icon.textContent = '▲';
  } else {
    content.style.display = 'none';
    icon.textContent = '▼';
  }
}

function change(id, delta) {
  counts[id] = Math.max(0, counts[id] + delta);
  document.getElementById('cnt_' + id).textContent = counts[id];
  document.getElementById('row_' + id).classList.toggle('active', counts[id] > 0);
}

function resetAll() {
  allAbilities.forEach(a => { counts[a.id] = 0; links[a.id] = null; });
  renderAbilityList();
  document.getElementById('result').style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// リンク機能
// ============================================================
function getAbilityShortName(id) {
  const ab = allAbilities.find(a => a.id === id);
  if (!ab) return id;
  const disc = ab.discount ? `(${ab.discount})` : '';
  return `${ab.label} ${ab.cost}pt${disc}`;
}

let _linkSourceId = null;

function openLinkModal(sourceId) {
  // すでにリンク済みならクリックで解除
  if (links[sourceId]) {
    const oldTarget = links[sourceId];
    // 双方向解除
    links[sourceId] = null;
    links[oldTarget] = null;
    refreshLinkBtn(sourceId);
    refreshLinkBtn(oldTarget);
    return;
  }

  _linkSourceId = sourceId;

  // count > 0 の能力の中から sourceId 以外を列挙
  const candidates = searchAbilities.filter(a =>
    a.id !== sourceId && counts[a.id] > 0 && !links[a.id]
  );

  const srcName = getAbilityShortName(sourceId);
  const listHtml = candidates.length === 0
    ? `<p class="link-modal-empty">リンク可能な候補がありません。<br>他の能力の個数を1以上に設定してください。</p>`
    : candidates.map(a => {
        const disc = a.discount ? `<span class="ability-disc" style="font-size:10px;">${a.discount}</span>` : '';
        return `<div class="link-candidate" onclick="applyLink('${a.id}')">
          <span class="ability-sublabel" style="min-width:60px;">${a.label}</span>
          <span class="ability-cost" style="font-size:13px;">${a.cost}pt</span>
          ${disc}
        </div>`;
      }).join('');

  document.getElementById('linkModalTitle').textContent = `「${srcName}」に含まれる部分能力を選択`;
  document.getElementById('linkCandidateList').innerHTML = listHtml;
  document.getElementById('linkOverlay').classList.add('open');
}

function applyLink(targetId) {
  const src = _linkSourceId;
  if (!src || !targetId) return;
  // 双方向リンク
  links[src] = targetId;
  links[targetId] = src;
  refreshLinkBtn(src);
  refreshLinkBtn(targetId);
  closeLinkModal();
}

function refreshLinkBtn(id) {
  const btn = document.getElementById('link_' + id);
  if (!btn) return;
  const linkedId = links[id];
  if (linkedId) {
    btn.classList.add('link-btn-active');
    btn.title = `リンク中: ${getAbilityShortName(linkedId)} — クリックで解除`;
  } else {
    btn.classList.remove('link-btn-active');
    btn.title = 'この能力に含まれる部分能力をリンク';
  }
}

function closeLinkModal() {
  document.getElementById('linkOverlay').classList.remove('open');
  _linkSourceId = null;
}
function closeLinkModalOnBg(e) {
  if (e.target === document.getElementById('linkOverlay')) closeLinkModal();
}

// ============================================================
// 個数制限付きナップサック DP
// アルゴリズム: 各アイテムを所持数分「仮想コピー」して
//              0/1ナップサック(逆順ループ)を適用
// バックトラック: 各アイテムコピー処理後にdpスナップショットを保持し
//              「どのコピーを使ったか」を正確に復元する
// ============================================================
function calculate() {
  const W = parseInt(document.getElementById('totalPt').value) || 0;

  // 所持数 > 0 のアイテムのみ使用
  const items = searchAbilities.filter(a => counts[a.id] > 0);

  if (items.length === 0) {
    showMsg('所持数を1以上に設定してください');
    return;
  }

  // リンクグループを収集（リンクされたidペアを1グループとして管理）
  // グループ内では「合計で最大1個まで選択可能」という制約を追加する
  // 実装: 各グループをまとめてGrouped Knapsackとして処理する
  // グループ: [ {ab, maxK} ]  → この中から1個だけ選ぶか、全グループを0/1で独立扱い

  // まず全アイテムをグループに振り分け
  const processed = new Set();
  const groups = []; // 各グループ = [ {ab, copies} ]  copiesは最大個数

  items.forEach(ab => {
    if (processed.has(ab.id)) return;
    processed.add(ab.id);

    const linkedId = links[ab.id];
    if (linkedId && counts[linkedId] > 0 && !processed.has(linkedId)) {
      // リンクあり: ab と linked の2アイテムで「どちらか一方のみ選べる」グループ
      const linkedAb = allAbilities.find(a => a.id === linkedId);
      processed.add(linkedId);
      groups.push({
        type: 'linked',
        items: [
          { ab, maxK: counts[ab.id] },
          { ab: linkedAb, maxK: counts[linkedId] }
        ]
      });
    } else {
      // 独立アイテム
      groups.push({
        type: 'independent',
        items: [{ ab, maxK: counts[ab.id] }]
      });
    }
  });

  // DP: Grouped Knapsack
  // 各グループについて「そのグループから何をいくつ選ぶか」を処理
  // linkedグループ: 2つのアイテムの中からどちらか（複数コピー可）を選ぶが
  //   「両方を同時に選ぶ」ことは不可 → グループ内でどちらか一方のみ
  // independentグループ: 所持数以内で何個でも選べる

  let dp = new Float64Array(W + 1);
  // バックトラック用スナップショット: グループ単位で記録
  const groupSnapshots = []; // [{ before: Float64Array }]

  groups.forEach(grp => {
    groupSnapshots.push(new Float64Array(dp));

    if (grp.type === 'independent') {
      // 通常の0/1ナップサック（コピー展開）
      grp.items[0];
      const { ab, maxK } = grp.items[0];
      const c = ab.cost;
      const v = ab.value;
      for (let k = 0; k < maxK; k++) {
        for (let w = W; w >= c; w--) {
          const nv = dp[w - c] + v;
          if (nv > dp[w]) dp[w] = nv;
        }
      }
    } else {
      // linkedグループ: 両方同時選択禁止
      // dpA = abのみコピー展開した場合、dpB = linkedAbのみコピー展開した場合
      // それぞれを計算して、各容量でmax(dpA[w], dpB[w]) を取る
      const base = new Float64Array(dp); // グループ処理前のdp

      // パターンA: grp.items[0]のみ選べる
      const dpA = new Float64Array(base);
      const { ab: abA, maxK: maxKA } = grp.items[0];
      for (let k = 0; k < maxKA; k++) {
        for (let w = W; w >= abA.cost; w--) {
          const nv = dpA[w - abA.cost] + abA.value;
          if (nv > dpA[w]) dpA[w] = nv;
        }
      }

      // パターンB: grp.items[1]のみ選べる
      const dpB = new Float64Array(base);
      const { ab: abB, maxK: maxKB } = grp.items[1];
      for (let k = 0; k < maxKB; k++) {
        for (let w = W; w >= abB.cost; w--) {
          const nv = dpB[w - abB.cost] + abB.value;
          if (nv > dpB[w]) dpB[w] = nv;
        }
      }

      // パターンC: どちらも選ばない（base のまま）
      for (let w = 0; w <= W; w++) {
        dp[w] = Math.max(base[w], dpA[w], dpB[w]);
      }
    }
  });

  const bestVal = dp[W];
  if (bestVal === 0) {
    showMsg('所持ptが不足しています（最小コストのアイテムにも届きません）');
    return;
  }

  // 最小消費ptでbestValを達成するwを探す
  let bestW = W;
  for (let w = 0; w <= W; w++) {
    if (dp[w] === bestVal) { bestW = w; break; }
  }

  // バックトラック: グループ単位で逆順に辿る
  const usedMap = {};
  let cur = bestW;

  for (let gi = groups.length - 1; gi >= 0; gi--) {
    const grp = groups[gi];
    const before = groupSnapshots[gi];

    if (grp.type === 'independent') {
      const { ab, maxK } = grp.items[0];
      const c = ab.cost;
      const v = ab.value;
      // このグループで何個選んだか逆算
      let k = 0;
      while (k < maxK && cur >= c && Math.abs(before[cur - c] + v - dp[cur]) < 1e-9) {
        // 選んだ
        usedMap[ab.id] = (usedMap[ab.id] || 0) + 1;
        cur = cur - c;
        k++;
        // dp をbeforeに巻き戻すことはできないので、before[cur]をdpとして使用
        // → 単一アイテムのコピー展開: 選んだ後は before[cur] が基準
        dp = before; // 残りのグループはbeforeが正しいdp
        // ここで break して次の k ループで再評価
        // 実際はコピー展開を一個一個逆算する必要がある
        // → 簡略化: グループ処理前のbeforeを基準に「何個選べるか」を貪欲に確認
        break;
      }
      // 上記は単純化。正確には0/1ナップサックのバックトラックが必要。
      // ここでは greedy approach で before基準で何個選んだかを計算する
    } else {
      // linkedグループ: どちらが選ばれたかを判定
      const { ab: abA, maxK: maxKA } = grp.items[0];
      const { ab: abB, maxK: maxKB } = grp.items[1];

      // パターンA: abAを選んだ場合、cur >= abA.cost && before[cur-abA.cost]+abA.value == dp[cur]
      // パターンB: abBを選んだ場合
      // どちらも選ばない場合: dp[cur] == before[cur]

      // dpA/dpB を再計算してどちらのパターンかを判定
      const dpA = new Float64Array(before);
      for (let k = 0; k < maxKA; k++) {
        for (let w = cur; w >= abA.cost; w--) {
          const nv = dpA[w - abA.cost] + abA.value;
          if (nv > dpA[w]) dpA[w] = nv;
        }
      }
      const dpB = new Float64Array(before);
      for (let k = 0; k < maxKB; k++) {
        for (let w = cur; w >= abB.cost; w--) {
          const nv = dpB[w - abB.cost] + abB.value;
          if (nv > dpB[w]) dpB[w] = nv;
        }
      }

      if (Math.abs(dpA[cur] - dp[cur]) < 1e-9 && dpA[cur] >= dpB[cur]) {
        // パターンA: abAを選んだ
        let remaining = cur;
        for (let k = 0; k < maxKA && remaining >= abA.cost; k++) {
          if (Math.abs(before[remaining - abA.cost] + abA.value - dpA[remaining]) < 1e-9) {
            usedMap[abA.id] = (usedMap[abA.id] || 0) + 1;
            remaining -= abA.cost;
          }
        }
        cur = remaining;
      } else if (Math.abs(dpB[cur] - dp[cur]) < 1e-9) {
        // パターンB: abBを選んだ
        let remaining = cur;
        for (let k = 0; k < maxKB && remaining >= abB.cost; k++) {
          if (Math.abs(before[remaining - abB.cost] + abB.value - dpB[remaining]) < 1e-9) {
            usedMap[abB.id] = (usedMap[abB.id] || 0) + 1;
            remaining -= abB.cost;
          }
        }
        cur = remaining;
      }
      // どちらも選ばない場合は cur 変化なし
      dp = before;
    }
  }

  // バックトラックが単純化しているため、greedyで補完
  // 実際には正確なバックトラックが必要なので以下で再実装
  // → 上のバックトラックを使わず、グループ単位の正確なDPを再実装する
  // ここで結果をshowResultで表示
  // usedMapが不完全な可能性があるため、以下で再計算する

  // ===== 正確なバックトラック再実装 =====
  const usedMapFinal = {};
  let dpFinal = new Float64Array(W + 1);
  const snaps2 = [];

  groups.forEach(grp => {
    if (grp.type === 'independent') {
      const { ab, maxK } = grp.items[0];
      const c = ab.cost; const v = ab.value;
      for (let k = 0; k < maxK; k++) {
        snaps2.push({ grp, itemIdx: 0, copyIdx: k, dpBefore: new Float64Array(dpFinal) });
        for (let w = W; w >= c; w--) {
          const nv = dpFinal[w - c] + v;
          if (nv > dpFinal[w]) dpFinal[w] = nv;
        }
      }
    } else {
      // linkedグループはまとめて1スナップ
      const base2 = new Float64Array(dpFinal);
      const { ab: abA, maxK: maxKA } = grp.items[0];
      const { ab: abB, maxK: maxKB } = grp.items[1];
      const dpA2 = new Float64Array(base2);
      for (let k = 0; k < maxKA; k++) {
        for (let w = W; w >= abA.cost; w--) {
          const nv = dpA2[w - abA.cost] + abA.value;
          if (nv > dpA2[w]) dpA2[w] = nv;
        }
      }
      const dpB2 = new Float64Array(base2);
      for (let k = 0; k < maxKB; k++) {
        for (let w = W; w >= abB.cost; w--) {
          const nv = dpB2[w - abB.cost] + abB.value;
          if (nv > dpB2[w]) dpB2[w] = nv;
        }
      }
      snaps2.push({ grp, dpBefore: base2, dpA: dpA2, dpB: dpB2 });
      for (let w = 0; w <= W; w++) {
        dpFinal[w] = Math.max(base2[w], dpA2[w], dpB2[w]);
      }
    }
  });

  const bestValF = dpFinal[W];
  if (bestValF === 0) {
    showMsg('所持ptが不足しています（最小コストのアイテムにも届きません）');
    return;
  }
  let bestWF = W;
  for (let w = 0; w <= W; w++) {
    if (dpFinal[w] === bestValF) { bestWF = w; break; }
  }

  let curF = bestWF;
  for (let si = snaps2.length - 1; si >= 0; si--) {
    const snap = snaps2[si];
    if (snap.grp.type === 'independent') {
      const { ab } = snap.grp.items[0];
      const c = ab.cost; const v = ab.value;
      const before2 = snap.dpBefore;
      if (curF >= c && Math.abs(before2[curF - c] + v - dpFinal[curF]) < 1e-9) {
        usedMapFinal[ab.id] = (usedMapFinal[ab.id] || 0) + 1;
        curF = curF - c;
      }
      dpFinal = before2;
    } else {
      // linked group snap (single snap for the whole group)
      const { dpBefore, dpA: dpA3, dpB: dpB3, grp: g } = snap;
      const { ab: abA } = g.items[0];
      const { ab: abB } = g.items[1];

      // 選ばれたパターンを判定
      const valA = dpA3 ? dpA3[curF] : -1;
      const valB = dpB3 ? dpB3[curF] : -1;
      const valC = dpBefore[curF];

      if (valA >= valB && valA >= valC && Math.abs(valA - dpFinal[curF]) < 1e-9) {
        // abA選択: greedy backtrack
        let rem = curF;
        const maxK = g.items[0].maxK;
        for (let k = 0; k < maxK && rem >= abA.cost; k++) {
          if (Math.abs(dpBefore[rem - abA.cost] + abA.value - dpA3[rem]) < 1e-9) {
            usedMapFinal[abA.id] = (usedMapFinal[abA.id] || 0) + 1;
            rem -= abA.cost;
          } else break;
        }
        curF = rem;
      } else if (valB >= valA && valB >= valC && Math.abs(valB - dpFinal[curF]) < 1e-9) {
        // abB選択
        let rem = curF;
        const maxK = g.items[1].maxK;
        for (let k = 0; k < maxK && rem >= abB.cost; k++) {
          if (Math.abs(dpBefore[rem - abB.cost] + abB.value - dpB3[rem]) < 1e-9) {
            usedMapFinal[abB.id] = (usedMapFinal[abB.id] || 0) + 1;
            rem -= abB.cost;
          } else break;
        }
        curF = rem;
      }
      // どちらも選ばない場合curF変化なし
      dpFinal = dpBefore;
    }
  }

  let verifyPt = 0;
  for (const id in usedMapFinal) {
    const ab = allAbilities.find(a => a.id === id);
    verifyPt += ab.cost * usedMapFinal[id];
  }

  showResult(usedMapFinal, W, bestValF, verifyPt);
}

// ============================================================
// 結果表示
// ============================================================
function showMsg(msg) {
  const div = document.getElementById('result');
  div.style.display = 'block';
  div.innerHTML = `<div class="no-result">${msg}</div>`;
}

function showResult(usedMap, W, totalVal, usedPt) {
  const div = document.getElementById('result');
  div.style.display = 'block';

  const remaining = W - usedPt;
  let listHtml = '';

  // allAbilities の順番で結果を表示
  allAbilities.forEach(ab => {
    if (!usedMap[ab.id]) return;
    const cnt = usedMap[ab.id];
    const disc = ab.discount ? `（${ab.discount}）` : '';
    const name = `${ab.label} ${ab.cost}pt${disc}`;
    const valSum = Math.round(ab.value * cnt * 10) / 10;
    const ptSum = ab.cost * cnt;
    listHtml += `<li>
      <span class="result-item-name">${name}</span>
      <div class="result-item-right">
        <span class="result-item-count">×${cnt}　+${valSum}</span>
        <span class="result-item-pt">${ptSum}pt使用</span>
      </div>
    </li>`;
  });

  div.innerHTML = `
    <div class="card-title" style="margin-bottom:14px;">最適解</div>
    <div class="result-stats">
      <div class="stat-box">
        <div class="stat-label">使用pt</div>
        <div class="stat-value s-blue">${usedPt}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">総合力</div>
        <div class="stat-value">${Math.round(totalVal * 10) / 10}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">残りpt</div>
        <div class="stat-value s-green">${remaining}</div>
      </div>
    </div>
    <ul class="result-list">${listHtml}</ul>
  `;
}

// ============================================================
// モーダル（全能力を効率降順）
// ============================================================
const groupBadgeClass = {
  '白':'tb-白', '金':'tb-金', '白+金':'tb-白金',
  'ノラモン':'tb-ノラモン', 'ノラモン・ボスモン':'tb-ノラモン', '調':'tb-調', '律':'tb-律',
  '超虹':'tb-超虹', '超新規':'tb-超新規',
  'ひらめき':'tb-ひらめき', 'その他':'tb-その他', '贖罪':'tb-贖罪',
};

function openModal() {
  renderEfficiencyTab();
  document.getElementById('modalOverlay').classList.add('open');
  switchModalTab('efficiency');
}

function switchModalTab(tab) {
  document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.modal-tab-content').forEach(c => c.style.display = 'none');
  document.getElementById('tab-btn-' + tab).classList.add('active');
  document.getElementById('tab-content-' + tab).style.display = 'block';
}

function renderEfficiencyTab() {
  const sorted = [...allAbilities].sort((a, b) => b.eff - a.eff);
  document.getElementById('modalTable').innerHTML = sorted.map(ab => {
    const pct = (ab.eff * 100).toFixed(2);
    const ec = ab.eff >= 1.4 ? 'eff-high' : ab.eff >= 1.0 ? 'eff-mid' : 'eff-low';
    const disc = ab.discount || '—';
    const cls = groupBadgeClass[ab.group] || 'tb-その他';
    const costText = typeof ab.cost === 'number' ? ab.cost + 'pt' : ab.cost;
    const valText = typeof ab.value === 'number' ? '+' + ab.value : ab.value;
    return `<tr>
      <td><span class="type-badge ${cls}">${ab.label}</span></td>
      <td>${costText}</td>
      <td>${disc}</td>
      <td>${valText}</td>
      <td><span class="eff-value ${ec}">${pct}%</span></td>
    </tr>`;
  }).join('');
}

const baseReturnRates = [
  { label: '律',            rate: 1.19,  cls: 'tb-律' },
  { label: '調',            rate: 1.05,  cls: 'tb-調' },
  { label: 'ノラモン・ボスモン', rate: 1.00, cls: 'tb-ノラモン' },
  { label: '白（特殊）',    rate: 0.85,  cls: 'tb-白特殊' },
  { label: '金',            rate: 0.85,  cls: 'tb-金' },
  { label: 'ひらめき',      rate: 0.80,  cls: 'tb-ひらめき' },
  { label: '白',            rate: 0.60,  cls: 'tb-白' },
  { label: '超○○単独',    rate: 1.33,  cls: 'tb-超虹' },
];

function renderBaseRateTab() {
  const sorted = [...baseReturnRates].sort((a, b) => b.rate - a.rate);
  document.getElementById('baseRateTable').innerHTML = sorted.map(row => {
    const pct = (row.rate * 100).toFixed(0) + '%';
    const ec = row.rate >= 1.10 ? 'eff-high' : row.rate >= 0.85 ? 'eff-mid' : 'eff-low';
    return `<tr>
      <td><span class="type-badge ${row.cls}">${row.label}</span></td>
      <td><span class="eff-value ${ec}">${pct}</span></td>
    </tr>`;
  }).join('');
}

function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }
function closeModalOnBg(e) { if (e.target === document.getElementById('modalOverlay')) closeModal(); }

function openHelpModal() { document.getElementById('helpOverlay').classList.add('open'); }
function closeHelpModal() { document.getElementById('helpOverlay').classList.remove('open'); }
function closeHelpModalOnBg(e) { if (e.target === document.getElementById('helpOverlay')) closeHelpModal(); }

// 初期化
renderAbilityList();
