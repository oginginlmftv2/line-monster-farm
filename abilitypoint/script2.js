// ============================================================
// 全能力データ
// searchable:true = 探索UI・計算対象
// searchable:false = 効率一覧のみ
//
// combo: { goldId, whiteId } が設定されている能力は
//        +ボタン押下時に内訳選択モーダルを開き、
//        指定された白能力と自動リンクする（排他制御）
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
  { id:"g85_15",   group:"金", label:"金",       cost:85,  discount:"15%", value:85,   eff:1.0000, searchable:true },
  { id:"g80_20",   group:"金", label:"金",       cost:80,  discount:"20%", value:85,   eff:1.0625, searchable:true },

  // ======== 金 (元pt90) ========
  { id:"g90_0",    group:"金", label:"金",       cost:90,  discount:null,  value:76.5, eff:0.8500, searchable:true },
  { id:"g86_5",    group:"金", label:"金",       cost:86,  discount:"5%",  value:76.5, eff:0.8895, searchable:true },
  { id:"g81_10",   group:"金", label:"金",       cost:81,  discount:"10%", value:76.5, eff:0.9444, searchable:true },

  // ======== 白+金 ========
  // comboOptions: +ボタン押下時に表示する内訳の選択肢
  //   各選択肢は { label, goldId, whiteId } の形式
  //   goldId = 金能力のid、whiteId = 一緒にリンクする白能力のid（排他制御用）
  { id:"wg240", group:"白+金", label:"白+金", cost:240, discount:null, value:174, eff:0.7250, searchable:true,
    comboOptions:[]
  },
  { id:"wg234", group:"白+金", label:"白+金", cost:234, discount:null, value:174, eff:0.7436, searchable:true,
    comboOptions:[]
  },
  { id:"wg228", group:"白+金", label:"白+金", cost:228, discount:null, value:174, eff:0.7632, searchable:true,
    comboOptions:[
      { label:"金108pt ＋ 白120pt", goldId:"g108_10", whiteId:"w120_0" },
    ]
  },
  { id:"wg222", group:"白+金", label:"白+金", cost:222, discount:null, value:174, eff:0.7838, searchable:true,
    comboOptions:[
      { label:"金108pt ＋ 白114pt", goldId:"g108_10", whiteId:"w114_5" },
      { label:"金102pt ＋ 白120pt", goldId:"g102_15", whiteId:"w120_0" },
    ]
  },
  { id:"wg216", group:"白+金", label:"白+金", cost:216, discount:null, value:174, eff:0.8056, searchable:true,
    comboOptions:[
      { label:"金108pt ＋ 白108pt", goldId:"g108_10", whiteId:"w108_10" },
      { label:"金102pt ＋ 白114pt", goldId:"g102_15", whiteId:"w114_5" },
      { label:"金96pt ＋ 白120pt",  goldId:"g96_20",  whiteId:"w120_0" },
    ]
  },
  { id:"wg210", group:"白+金", label:"白+金", cost:210, discount:null, value:174, eff:0.8286, searchable:true,
    comboOptions:[
      { label:"金108pt ＋ 白102pt", goldId:"g108_10", whiteId:"w102_15" },
      { label:"金102pt ＋ 白108pt", goldId:"g102_15", whiteId:"w108_10" },
      { label:"金96pt ＋ 白114pt",  goldId:"g96_20",  whiteId:"w114_5" },
      { label:"金90pt ＋ 白120pt",  goldId:"g90_25",  whiteId:"w120_0" },
    ]
  },
  { id:"wg204", group:"白+金", label:"白+金", cost:204, discount:null, value:174, eff:0.8529, searchable:true,
    comboOptions:[
      { label:"金108pt ＋ 白96pt",  goldId:"g108_10", whiteId:"w96_20" },
      { label:"金102pt ＋ 白102pt", goldId:"g102_15", whiteId:"w102_15" },
      { label:"金96pt ＋ 白108pt",  goldId:"g96_20",  whiteId:"w108_10" },
      { label:"金90pt ＋ 白114pt",  goldId:"g90_25",  whiteId:"w114_5" },
      { label:"金84pt ＋ 白120pt",  goldId:"g84_30",  whiteId:"w120_0" },
    ]
  },
  { id:"wg200_0", group:"白+金", label:"白+金", cost:200, discount:null, value:145, eff:0.7250, searchable:true,
    comboOptions:[
      { label:"金100pt ＋ 白100pt", goldId:"g100_0", whiteId:"w100_0" },
    ]
  },
  { id:"wg198", group:"白+金", label:"白+金", cost:198, discount:null, value:174, eff:0.8788, searchable:true,
    comboOptions:[
      { label:"金108pt ＋ 白90pt",  goldId:"g108_10", whiteId:"w90_25" },
      { label:"金102pt ＋ 白96pt",  goldId:"g102_15", whiteId:"w96_20" },
      { label:"金96pt ＋ 白102pt",  goldId:"g96_20",  whiteId:"w102_15" },
      { label:"金90pt ＋ 白108pt",  goldId:"g90_25",  whiteId:"w108_10" },
      { label:"金84pt ＋ 白114pt",  goldId:"g84_30",  whiteId:"w114_5" },
      { label:"金78pt ＋ 白120pt",  goldId:"g78_35",  whiteId:"w120_0" },
    ]
  },
  { id:"wg192", group:"白+金", label:"白+金", cost:192, discount:null, value:174, eff:0.9063, searchable:true,
    comboOptions:[
      { label:"金108pt ＋ 白84pt",  goldId:"g108_10", whiteId:"w84_30" },
      { label:"金102pt ＋ 白90pt",  goldId:"g102_15", whiteId:"w90_25" },
      { label:"金96pt ＋ 白96pt",   goldId:"g96_20",  whiteId:"w96_20" },
      { label:"金90pt ＋ 白102pt",  goldId:"g90_25",  whiteId:"w102_15" },
      { label:"金84pt ＋ 白108pt",  goldId:"g84_30",  whiteId:"w108_10" },
      { label:"金78pt ＋ 白114pt",  goldId:"g78_35",  whiteId:"w114_5" },
      { label:"金72pt ＋ 白120pt",  goldId:"g72_40",  whiteId:"w120_0" },
    ]
  },
  { id:"wg190_5", group:"白+金", label:"白+金", cost:190, discount:"5%", value:145, eff:0.7632, searchable:true,
    comboOptions:[
      { label:"金95pt ＋ 白95pt", goldId:"g95_5", whiteId:"w95_5" },
      { label:"金90pt ＋ 白100pt", goldId:"g90_10", whiteId:"w100_0" },
    ]
  },
  { id:"wg186", group:"白+金", label:"白+金", cost:186, discount:null, value:174, eff:0.9355, searchable:true,
    comboOptions:[
      { label:"金108pt ＋ 白78pt",  goldId:"g108_10", whiteId:"w78_35" },
      { label:"金102pt ＋ 白84pt",  goldId:"g102_15", whiteId:"w84_30" },
      { label:"金96pt ＋ 白90pt",   goldId:"g96_20",  whiteId:"w90_25" },
      { label:"金90pt ＋ 白96pt",   goldId:"g90_25",  whiteId:"w96_20" },
      { label:"金86pt ＋ 白100pt",  goldId:"g86_5",   whiteId:"w100_0" },
      { label:"金84pt ＋ 白102pt",  goldId:"g84_30",  whiteId:"w102_15" },
      { label:"金78pt ＋ 白108pt",  goldId:"g78_35",  whiteId:"w108_10" },
      { label:"金72pt ＋ 白114pt",  goldId:"g72_40",  whiteId:"w114_5" },
    ]
  },
  { id:"wg180_10", group:"白+金", label:"白+金", cost:180, discount:"10%", value:145, eff:0.8056, searchable:true,
    comboOptions:[
      { label:"金90pt ＋ 白90pt", goldId:"g90_10", whiteId:"w90_10" },
      { label:"金85pt ＋ 白95pt", goldId:"g85_15", whiteId:"w95_5" },
    ]
  },
  { id:"wg180", group:"白+金", label:"白+金", cost:180, discount:null, value:174, eff:0.9667, searchable:true,
    comboOptions:[
      { label:"金108pt ＋ 白72pt",  goldId:"g108_10", whiteId:"w72_40" },
      { label:"金102pt ＋ 白78pt",  goldId:"g102_15", whiteId:"w78_35" },
      { label:"金100pt ＋ 白80pt",  goldId:"g100_0",  whiteId:"w80_0" },
      { label:"金96pt ＋ 白84pt",   goldId:"g96_20",  whiteId:"w84_30" },
      { label:"金95pt ＋ 白85pt",   goldId:"g95_5",   whiteId:"w85_15" },
      { label:"金90pt ＋ 白90pt",   goldId:"g90_25",  whiteId:"w90_25" },
      { label:"金84pt ＋ 白96pt",   goldId:"g84_30",  whiteId:"w96_20" },
      { label:"金78pt ＋ 白102pt",  goldId:"g78_35",  whiteId:"w102_15" },
      { label:"金72pt ＋ 白108pt",  goldId:"g72_40",  whiteId:"w108_10" },
    ]
  },
  { id:"wg174", group:"白+金", label:"白+金", cost:174, discount:null, value:174, eff:1.0000, searchable:true,
    comboOptions:[
      { label:"金102pt ＋ 白72pt",  goldId:"g102_15", whiteId:"w72_40" },
      { label:"金96pt ＋ 白78pt",   goldId:"g96_20",  whiteId:"w78_35" },
      { label:"金90pt ＋ 白84pt",   goldId:"g90_25",  whiteId:"w84_30" },
      { label:"金84pt ＋ 白90pt",   goldId:"g84_30",  whiteId:"w90_25" },
      { label:"金78pt ＋ 白96pt",   goldId:"g78_35",  whiteId:"w96_20" },
      { label:"金72pt ＋ 白102pt",  goldId:"g72_40",  whiteId:"w102_15" },
    ]
  },
  { id:"wg170_15", group:"白+金", label:"白+金", cost:170, discount:"15%", value:145, eff:0.8529, searchable:true,
    comboOptions:[
      { label:"金80pt ＋ 白90pt", goldId:"g80_20", whiteId:"w90_10" },
    ]
  },
  { id:"wg168", group:"白+金", label:"白+金", cost:168, discount:null, value:174, eff:1.0357, searchable:true,
    comboOptions:[
      { label:"金108pt ＋ 白60pt",  goldId:"g108_10", whiteId:"w60_25" },
      { label:"金100pt ＋ 白68pt",  goldId:"g100_0",  whiteId:"w68_15" },
      { label:"金96pt ＋ 白72pt",   goldId:"g96_20",  whiteId:"w72_40" },
      { label:"金90pt ＋ 白78pt",   goldId:"g90_25",  whiteId:"w78_35" },
      { label:"金84pt ＋ 白84pt",   goldId:"g84_30",  whiteId:"w84_30" },
      { label:"金78pt ＋ 白90pt",   goldId:"g78_35",  whiteId:"w90_25" },
      { label:"金72pt ＋ 白96pt",   goldId:"g72_40",  whiteId:"w96_20" },
    ]
  },
  { id:"wg162", group:"白+金", label:"白+金", cost:162, discount:null, value:174, eff:1.0741, searchable:true,
    comboOptions:[
      { label:"金102pt ＋ 白60pt",  goldId:"g102_15", whiteId:"w60_25" },
      { label:"金90pt ＋ 白72pt",   goldId:"g90_25",  whiteId:"w72_40" },
      { label:"金86pt ＋ 白76pt",   goldId:"g86_5",   whiteId:"w76_5" },
      { label:"金84pt ＋ 白78pt",   goldId:"g84_30",  whiteId:"w78_35" },
      { label:"金78pt ＋ 白84pt",   goldId:"g78_35",  whiteId:"w84_30" },
      { label:"金72pt ＋ 白90pt",   goldId:"g72_40",  whiteId:"w90_25" },
    ]
  },
  { id:"wg156", group:"白+金", label:"白+金", cost:156, discount:null, value:174, eff:1.1154, searchable:true,
    comboOptions:[
      { label:"金108pt ＋ 白48pt",  goldId:"g108_10", whiteId:"w48_40" },
      { label:"金100pt ＋ 白56pt",  goldId:"g100_0",  whiteId:"w56_30" },
      { label:"金96pt ＋ 白60pt",   goldId:"g96_20",  whiteId:"w60_25" },
      { label:"金86pt ＋ 白70pt",   goldId:"g86_5",   whiteId:"w70_30" },
      { label:"金84pt ＋ 白72pt",   goldId:"g84_30",  whiteId:"w72_40" },
      { label:"金81pt ＋ 白75pt",   goldId:"g81_10",  whiteId:"w75_25" },
      { label:"金78pt ＋ 白78pt",   goldId:"g78_35",  whiteId:"w78_35" },
      { label:"金72pt ＋ 白84pt",   goldId:"g72_40",  whiteId:"w84_30" },
    ]
  },
  { id:"wg150", group:"白+金", label:"白+金", cost:150, discount:null, value:174, eff:1.1600, searchable:true,
    comboOptions:[
      { label:"金102pt ＋ 白48pt",  goldId:"g102_15", whiteId:"w48_40" },
      { label:"金90pt ＋ 白60pt",   goldId:"g90_25",  whiteId:"w60_25" },
      { label:"金86pt ＋ 白64pt",   goldId:"g86_5",   whiteId:"w64_20" },
      { label:"金78pt ＋ 白72pt",   goldId:"g78_35",  whiteId:"w72_40" },
      { label:"金72pt ＋ 白78pt",   goldId:"g72_40",  whiteId:"w78_35" },
    ]
  },
  { id:"wg144", group:"白+金", label:"白+金", cost:144, discount:null, value:174, eff:1.2083, searchable:true,
    comboOptions:[
      { label:"金96pt ＋ 白48pt",   goldId:"g96_20",  whiteId:"w48_40" },
      { label:"金84pt ＋ 白60pt",   goldId:"g84_30",  whiteId:"w60_25" },
      { label:"金72pt ＋ 白72pt",   goldId:"g72_40",  whiteId:"w72_40" },
    ]
  },

  // ======== ひらめき(New) 元pt120 ========
  { id:"hira_120_10", group:"ひらめき", label:"ひらめき", cost:108, discount:"10%", value:96, eff:0.8889, searchable:true },
  { id:"hira_120_15", group:"ひらめき", label:"ひらめき", cost:102, discount:"15%", value:96, eff:0.9412, searchable:true },
  { id:"hira_120_20", group:"ひらめき", label:"ひらめき", cost:96,  discount:"20%", value:96, eff:1.0000, searchable:true },
  { id:"hira_120_25", group:"ひらめき", label:"ひらめき", cost:90,  discount:"25%", value:96, eff:1.0667, searchable:true },
  { id:"hira_120_30", group:"ひらめき", label:"ひらめき", cost:84,  discount:"30%", value:96, eff:1.1429, searchable:true },
  { id:"hira_120_35", group:"ひらめき", label:"ひらめき", cost:78,  discount:"35%", value:96, eff:1.2308, searchable:true },
  { id:"hira_120_40", group:"ひらめき", label:"ひらめき", cost:72,  discount:"40%", value:96, eff:1.3333, searchable:true },

  // ======== ひらめき(New) 元pt80 ========
  { id:"hira72",   group:"ひらめき", label:"ひらめき", cost:72, discount:"10%", value:64, eff:0.8889, searchable:true },
  { id:"hira68",   group:"ひらめき", label:"ひらめき", cost:68, discount:"15%", value:64, eff:0.9412, searchable:true },
  { id:"hira64",   group:"ひらめき", label:"ひらめき", cost:64, discount:"20%", value:64, eff:1.0000, searchable:true },
  { id:"hira60",   group:"ひらめき", label:"ひらめき", cost:60, discount:"25%", value:64, eff:1.0667, searchable:true },
  { id:"hira56",   group:"ひらめき", label:"ひらめき", cost:56, discount:"30%", value:64, eff:1.1429, searchable:true },
  { id:"hira52",   group:"ひらめき", label:"ひらめき", cost:52, discount:"35%", value:64, eff:1.2308, searchable:true },
  { id:"hira48",   group:"ひらめき", label:"ひらめき", cost:48, discount:"40%", value:64, eff:1.3333, searchable:true },

  // ======== ひらめき(New) 元pt60 ========
  { id:"hira_60_10", group:"ひらめき", label:"ひらめき", cost:54, discount:"10%", value:48, eff:0.8889, searchable:true },
  { id:"hira_60_15", group:"ひらめき", label:"ひらめき", cost:51, discount:"15%", value:48, eff:0.9412, searchable:true },
  { id:"hira_60_20", group:"ひらめき", label:"ひらめき", cost:48, discount:"20%", value:48, eff:1.0000, searchable:true },
  { id:"hira_60_25", group:"ひらめき", label:"ひらめき", cost:45, discount:"25%", value:48, eff:1.0667, searchable:true },
  { id:"hira_60_30", group:"ひらめき", label:"ひらめき", cost:42, discount:"30%", value:48, eff:1.1429, searchable:true },
  { id:"hira_60_35", group:"ひらめき", label:"ひらめき", cost:39, discount:"35%", value:48, eff:1.2308, searchable:true },
  { id:"hira_60_40", group:"ひらめき", label:"ひらめき", cost:36, discount:"40%", value:48, eff:1.3333, searchable:true },

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
  // ロックオン系(白) ← searchable:false に変更（UIには表示しないが計算エンジンで内部利用）
  { id:"lock_w140",  group:"その他", label:"ロックオン系(白)", cost:140, discount:null,  value:84, eff:0.6000, searchable:false },
  { id:"lock_w133",  group:"その他", label:"ロックオン系(白)", cost:133, discount:"5%",  value:84, eff:0.6316, searchable:false },
  { id:"lock_w126",  group:"その他", label:"ロックオン系(白)", cost:126, discount:"10%", value:84, eff:0.6667, searchable:false },
  // ロックオン系(金+白) ← +ボタンで内訳選択モーダルを開き白と自動リンク
  { id:"lock_gw280", group:"その他", label:"ロックオン系(金+白)", cost:280, discount:null,  value:203, eff:0.7250, searchable:true,
    comboOptions:[ { label:"金140pt ＋ 白140pt", goldId:null, whiteId:"lock_w140" } ]
  },
  { id:"lock_gw266", group:"その他", label:"ロックオン系(金+白)", cost:266, discount:"5%",  value:203, eff:0.7632, searchable:true,
    comboOptions:[ { label:"金133pt ＋ 白133pt", goldId:null, whiteId:"lock_w133" } ]
  },
  { id:"lock_gw252", group:"その他", label:"ロックオン系(金+白)", cost:252, discount:"10%", value:203, eff:0.8056, searchable:true,
    comboOptions:[ { label:"金126pt ＋ 白126pt", goldId:null, whiteId:"lock_w126" } ]
  },
  // 英雄白
  { id:"hero_w120",group:"その他", label:"英雄白", cost:120, discount:null,  value:102, eff:0.8500, searchable:true },
  { id:"hero_w114",group:"その他", label:"英雄白", cost:114, discount:"5%",  value:102, eff:0.8947, searchable:true },
  { id:"hero_w108",group:"その他", label:"英雄白", cost:108, discount:"10%", value:102, eff:0.9444, searchable:true },
  { id:"hero_w84", group:"その他", label:"英雄白", cost:84,  discount:"30%", value:102, eff:1.2143, searchable:true },
  { id:"hero_w78", group:"その他", label:"英雄白", cost:78,  discount:"35%", value:102, eff:1.3077, searchable:true },
  { id:"hero_w72", group:"その他", label:"英雄白", cost:72,  discount:"40%", value:102, eff:1.4167, searchable:true },
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
  { key:"白",       label:"白",       cls:"gl-白" },
  { key:"金",       label:"金",       cls:"gl-金" },
  { key:"白+金",    label:"白＋金",   cls:"gl-白金" },
  { key:"ひらめき", label:"ひらめき", cls:"gl-ひらめき" },
  { key:"その他",   label:"その他",   cls:"gl-その他" },
];

// ============================================================
// 状態管理
// ============================================================
const counts = {};  // id → 個数
const links  = {};  // id → リンク先id (null = なし)
const comboSelections = {}; // id → { optIdx: 個数 }
allAbilities.forEach(a => { counts[a.id] = 0; links[a.id] = null; comboSelections[a.id] = {}; });

// ============================================================
// 能力リスト描画
// ============================================================
function renderAbilityList() {
  const container = document.getElementById('abilityList');
  let html = '';

  searchGroups.forEach((grp, idx) => {
    const items = searchAbilities.filter(a => a.group === grp.key);
    if (!items.length) return;

    // ⑥ グループヘッダーを sticky にする（card内スクロール対応）
    html += `<div class="ability-group" id="agrp_${idx}">
      <div class="group-header sticky-group-header" onclick="toggleGroup('grp_${idx}',${idx})">
        <span class="group-label ${grp.cls}">${grp.label}</span>
        <span class="group-toggle-icon" id="icon_grp_${idx}">▼</span>
      </div>
      <div class="group-content" id="grp_${idx}" style="display: none;">`;

    items.forEach(ab => {
      const isCombo = !!(ab.comboOptions && ab.comboOptions.length);
      const isWG    = (ab.group === '白+金');
      // その他グループ: 能力名とptを縦積みで表示
      const isOther = (ab.group === 'その他');
      const showSubLabel = !isWG && ab.label !== '白' && ab.label !== '金' && ab.label !== 'ひらめき';

      let abilityInfoHtml;
      if (isOther && showSubLabel) {
        // ② 縦積みレイアウト
        const linkedId2 = links[ab.id];
        const linkBadge2 = (linkedId2 && !isCombo)
          ? `<span class="link-badge link-badge-static" title="${getAbilityShortName(linkedId2)}を使用しています">🔗 リンク中</span>`
          : '';
        abilityInfoHtml = `<div class="ability-info ability-info-stack">
            <span class="ability-sublabel-stack">${ab.label}</span>
            <div class="ability-cost-row">
              <span class="ability-cost">${ab.cost}pt</span>
              ${ab.discount ? `<span class="ability-disc">${ab.discount}</span>` : ''}
              ${linkBadge2}
            </div>
          </div>`;
      } else {
        const linkedId2 = links[ab.id];
        const linkBadge2 = (linkedId2 && !isCombo)
          ? `<span class="link-badge link-badge-static" title="${getAbilityShortName(linkedId2)}を使用しています">🔗 リンク中</span>`
          : '';
        const subLabel = showSubLabel ? `<span class="ability-sublabel">${ab.label}</span>` : '';
        abilityInfoHtml = `<div class="ability-info">
            ${subLabel}
            <span class="ability-cost">${ab.cost}pt</span>
            ${(!isWG && ab.discount) ? `<span class="ability-disc">${ab.discount}</span>` : ''}
            ${linkBadge2}
          </div>`;
      }

      // カウンターのプラスボタン/マイナスボタン: comboあり→モーダル、なし→直接+-
      const plusAction = isCombo
        ? `openComboModal('${ab.id}')`
        : `change('${ab.id}',+1)`;
      const minusAction = isCombo
        ? `openComboModal('${ab.id}')`
        : `change('${ab.id}',-1)`;

      html += `
      <div class="ability-row${isOther ? ' ability-row-stack' : ''}" id="row_${ab.id}">
        ${abilityInfoHtml}
        <div class="counter">
          <button class="counter-btn${isCombo ? ' combo-minus' : ''}" onclick="${minusAction}">−</button>
          <div class="counter-val" id="cnt_${ab.id}">0</div>
          <button class="counter-btn${isCombo ? ' combo-plus' : ''}" onclick="${plusAction}">＋</button>
        </div>
      </div>`;
    });
    html += `</div></div>`;
  });

  container.innerHTML = html;
}

function toggleGroup(contentId, idx) {
  const content = document.getElementById(contentId);
  const icon    = document.getElementById('icon_grp_' + idx);
  const isOpen  = content.style.display !== 'none';
  content.style.display = isOpen ? 'none' : 'block';
  icon.textContent = isOpen ? '▼' : '▲';
}

function change(id, delta) {
  const newVal = Math.max(0, counts[id] + delta);
  // マイナス時: 0になったらリンクも解除
  if (newVal === 0 && links[id]) removeLink(id);
  counts[id] = newVal;
  const el = document.getElementById('cnt_' + id);
  if (el) el.textContent = counts[id];
  const row = document.getElementById('row_' + id);
  if (row) row.classList.toggle('active', counts[id] > 0);
}

function resetAll() {
  allAbilities.forEach(a => { counts[a.id] = 0; links[a.id] = null; comboSelections[a.id] = {}; });
  renderAbilityList();
  document.getElementById('result').style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// リンク管理ユーティリティ
// ============================================================
function getAbilityShortName(id) {
  const ab = allAbilities.find(a => a.id === id);
  if (!ab) return id;
  return `${ab.label} ${ab.cost}pt${ab.discount ? `(${ab.discount})` : ''}`;
}

function applyLinkPair(srcId, tgtId) {
  // 既存リンクがあれば先に解除
  if (links[srcId]) removeLinkInner(srcId);
  if (links[tgtId]) removeLinkInner(tgtId);
  links[srcId] = tgtId;
  links[tgtId] = srcId;
  refreshRow(srcId);
  refreshRow(tgtId);
}

function removeLinkInner(id) {
  const tid = links[id];
  links[id] = null;
  if (tid) links[tid] = null;
}

function removeLink(id) {
  const tid = links[id];
  removeLinkInner(id);
  refreshRow(id);
  if (tid) refreshRow(tid);
}

function refreshRow(id) {
  const row = document.getElementById('row_' + id);
  if (!row) return;
  // リンクバッジを再描画する（最小限: innerHTMLを操作せずバッジだけ差し替え）
  // 簡易対応: renderAbilityListは重いのでバッジelだけ更新
  const oldBadge = row.querySelector('.link-badge');
  const info     = row.querySelector('.ability-info');
  if (oldBadge) oldBadge.remove();
  const ab = allAbilities.find(a => a.id === id);
  const isCombo = ab ? !!(ab.comboOptions && ab.comboOptions.length) : false;
  if (links[id] && info && ab && !isCombo) {
    const badge = document.createElement('span');
    badge.className = 'link-badge link-badge-static';
    badge.title     = `${getAbilityShortName(links[id])}を使用しています`;
    badge.textContent = '🔗 リンク中';
    info.appendChild(badge);
  }
  if (row) row.classList.toggle('active', counts[id] > 0);
}

// ============================================================
// ① 白+金 / ロックオン系 内訳選択モーダル（カウンター + OK/キャンセル方式）
// ============================================================
let _comboSourceId = null;
// 選択中の各選択肢のカウント { optIdx: count }
let _comboCounts = {};

function openComboModal(srcId) {
  _comboSourceId = srcId;
  _comboCounts = Object.assign({}, comboSelections[srcId] || {});
  const ab = allAbilities.find(a => a.id === srcId);
  document.getElementById('comboModalTitle').textContent =
    `${ab.label} ${ab.cost}pt — 内訳を選択`;
  renderComboOptions();
  document.getElementById('comboOverlay').classList.add('open');
}

function renderComboOptions() {
  const ab   = allAbilities.find(a => a.id === _comboSourceId);
  const opts = ab.comboOptions || [];

  const listHtml = opts.map((opt, i) => {
    const cnt = _comboCounts[i] || 0;
    
    const gAb = opt.goldId ? allAbilities.find(a => a.id === opt.goldId) : null;
    const wAb = opt.whiteId ? allAbilities.find(a => a.id === opt.whiteId) : null;

    let gPart = "";
    if (gAb) {
      const gDisc = gAb.discount ? `<span class="ability-disc">${gAb.discount}</span>` : "";
      gPart = `金${gAb.cost}pt${gDisc}`;
    } else {
      const m = opt.label.match(/金\d+pt/);
      gPart = m ? m[0] : "";
    }

    let wPart = "";
    if (wAb) {
      const wDisc = wAb.discount ? `<span class="ability-disc">${wAb.discount}</span>` : "";
      wPart = `白${wAb.cost}pt${wDisc}`;
    } else {
      const m = opt.label.match(/白\d+pt/);
      wPart = m ? m[0] : "";
    }

    let comboDesc = opt.label;
    if (gPart && wPart) {
      comboDesc = `<div class="combo-label-multi">
        <div class="combo-line">${gPart}</div>
        <div class="combo-line combo-line-sub">＋ ${wPart}</div>
      </div>`;
    } else if (gPart || wPart) {
      comboDesc = `<div class="combo-label-multi">
        <div class="combo-line">${gPart || wPart}</div>
      </div>`;
    }

    return `<div class="combo-option-row">
      <span class="combo-option-label">${comboDesc}</span>
      <div class="counter">
        <button class="counter-btn" onclick="changeComboCount(${i},-1)">−</button>
        <div class="counter-val combo-cnt" id="ccnt_${i}">${cnt}</div>
        <button class="counter-btn" onclick="changeComboCount(${i},+1)">＋</button>
      </div>
    </div>`;
  }).join('');

  const footerHtml = `<div class="combo-footer">
    <button class="combo-cancel-btn" onclick="closeComboModal()">キャンセル</button>
    <button class="combo-ok-btn" onclick="confirmCombo()">OK</button>
  </div>`;

  document.getElementById('comboOptionList').innerHTML = listHtml + footerHtml;
}

function changeComboCount(optIdx, delta) {
  _comboCounts[optIdx] = Math.max(0, (_comboCounts[optIdx] || 0) + delta);
  const el = document.getElementById('ccnt_' + optIdx);
  if (el) el.textContent = _comboCounts[optIdx];
}

function confirmCombo() {
  const ab   = allAbilities.find(a => a.id === _comboSourceId);
  const opts = ab.comboOptions || [];
  const oldSelections = comboSelections[_comboSourceId] || {};
  let totalDelta = 0;

  opts.forEach((opt, i) => {
    const oldCnt = oldSelections[i] || 0;
    const newCnt = _comboCounts[i] || 0;
    const diff = newCnt - oldCnt;

    if (diff !== 0) {
      if (opt.whiteId) {
        // 白のIDがある場合はその在庫も連動させる
        counts[opt.whiteId] = Math.max(0, (counts[opt.whiteId] || 0) + diff);
      }
      totalDelta += diff;
    }
  });

  comboSelections[_comboSourceId] = Object.assign({}, _comboCounts);
  counts[_comboSourceId] = Math.max(0, (counts[_comboSourceId] || 0) + totalDelta);

  const row = document.getElementById('row_' + _comboSourceId);
  if (row) row.classList.toggle('active', counts[_comboSourceId] > 0);
  const cntEl = document.getElementById('cnt_' + _comboSourceId);
  if (cntEl) cntEl.textContent = counts[_comboSourceId];

  opts.forEach((opt, i) => {
    const newCnt = _comboCounts[i] || 0;
    if (newCnt > 0 && opt.whiteId) {
      applyLinkPair(_comboSourceId, opt.whiteId);
    }
  });

  if (counts[_comboSourceId] === 0) {
    if (links[_comboSourceId]) removeLink(_comboSourceId);
  }

  closeComboModal();
}

function closeComboModal() {
  document.getElementById('comboOverlay').classList.remove('open');
  _comboSourceId = null;
  _comboCounts   = {};
}
function closeComboModalOnBg(e) {
  if (e.target === document.getElementById('comboOverlay')) closeComboModal();
}

// ============================================================
// DP計算（Grouped Knapsack + 正確なバックトラック）
// ============================================================
function calculate() {
  const W = parseInt(document.getElementById('totalPt').value) || 0;

  // counts > 0 のアイテム（searchable問わず counts が立っているもの）
  const items = allAbilities.filter(a => counts[a.id] > 0);

  if (items.length === 0) {
    showMsg('所持数を1以上に設定してください');
    scrollToResult();
    return;
  }

  // リンクグループ振り分け
  const processed = new Set();
  const groups = [];

  items.forEach(ab => {
    if (processed.has(ab.id)) return;
    processed.add(ab.id);
    const linkedId = links[ab.id];
    if (linkedId && counts[linkedId] > 0 && !processed.has(linkedId)) {
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
      groups.push({ type: 'independent', items: [{ ab, maxK: counts[ab.id] }] });
    }
  });

  // ===== DP (snaps2 方式) =====
  const usedMapFinal = {};
  let dpFinal = new Float64Array(W + 1);
  const snaps2 = [];

  groups.forEach(grp => {
    if (grp.type === 'independent') {
      const { ab, maxK } = grp.items[0];
      const c = ab.cost; const v = ab.value;
      for (let k = 0; k < maxK; k++) {
        snaps2.push({ grp, dpBefore: new Float64Array(dpFinal) });
        for (let w = W; w >= c; w--) {
          const nv = dpFinal[w - c] + v;
          if (nv > dpFinal[w]) dpFinal[w] = nv;
        }
      }
    } else {
      // リンクグループのDP（白＋金コンボと白単体など）
      // 双方の個数を (k, j) で全列挙し、base2 から遷移させて最善を newDp に入れる
      const base2 = new Float64Array(dpFinal);
      const newDp = new Float64Array(base2);
      
      const itemA = grp.items[0];
      const itemB = grp.items[1];
      
      // どちらがコンボアイテム（親）か判定
      const isACombo = !!(itemA.ab.comboOptions && itemA.ab.comboOptions.length);
      const comboItem = isACombo ? itemA : itemB;
      const singleItem = isACombo ? itemB : itemA;

      for (let k = 0; k <= comboItem.maxK; k++) {
        // コンボアイテムをk個使うと、白アイテムの枠をk個消費する
        // よって、単体アイテムが使えるのは 0 ～ (白の総数 - k) 個まで
        for (let j = 0; j <= singleItem.maxK - k; j++) {
          if (k === 0 && j === 0) continue;
          
          const cost = k * comboItem.ab.cost + j * singleItem.ab.cost;
          const val  = k * comboItem.ab.value + j * singleItem.ab.value;
          
          if (cost > W) continue;
          
          // 前のグループまでの状態(base2)から遷移させた値を現在のグループの状態(newDp)に蓄積
          for (let w = W; w >= cost; w--) {
            const nv = base2[w - cost] + val;
            if (nv > newDp[w]) newDp[w] = nv;
          }
        }
      }
      snaps2.push({ grp, dpBefore: base2 });
      dpFinal = newDp;
    }
  });

  const bestValF = dpFinal[W];
  if (bestValF === 0) {
    showMsg('所持ptが不足しています（最小コストのアイテムにも届きません）');
    scrollToResult();
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
        curF -= c;
      }
      dpFinal = before2;
    } else {
      const { dpBefore, grp: g } = snap;
      const itemA = g.items[0];
      const itemB = g.items[1];
      const isACombo = !!(itemA.ab.comboOptions && itemA.ab.comboOptions.length);
      const comboItem = isACombo ? itemA : itemB;
      const singleItem = isACombo ? itemB : itemA;
      
      let found = false;
      // バックトラック時も (k, j) を全探索し、遷移元と一致するか確認
      for (let k = 0; k <= comboItem.maxK; k++) {
        for (let j = 0; j <= Math.max(0, singleItem.maxK - k); j++) {
           if (k === 0 && j === 0) continue;
           const c = k * comboItem.ab.cost + j * singleItem.ab.cost;
           const v = k * comboItem.ab.value + j * singleItem.ab.value;
           if (curF >= c && Math.abs(dpBefore[curF - c] + v - dpFinal[curF]) < 1e-9) {
              if (k > 0) usedMapFinal[comboItem.ab.id] = (usedMapFinal[comboItem.ab.id] || 0) + k;
              if (j > 0) usedMapFinal[singleItem.ab.id] = (usedMapFinal[singleItem.ab.id] || 0) + j;
              curF -= c;
              found = true;
              break;
           }
        }
        if (found) break;
      }
      dpFinal = dpBefore;
    }
  }

  let verifyPt = 0;
  for (const id in usedMapFinal) {
    const ab = allAbilities.find(a => a.id === id);
    verifyPt += ab.cost * usedMapFinal[id];
  }

  showResult(usedMapFinal, W, bestValF, verifyPt);
  scrollToResult();
}

// ④ 計算後に結果へスクロール
function scrollToResult() {
  setTimeout(() => {
    const el = document.getElementById('result');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
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

  allAbilities.forEach(ab => {
    if (!usedMap[ab.id]) return;
    const cnt = usedMap[ab.id];
    const disc = ab.discount ? `（${ab.discount}）` : '';
    const name = `${ab.label} ${ab.cost}pt${disc}`;
    const valSum = Math.round(ab.value * cnt * 10) / 10;
    const ptSum  = ab.cost * cnt;
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
// 効率一覧モーダル
// ============================================================
const groupBadgeClass = {
  '白':'tb-白', '金':'tb-金', '白+金':'tb-白金',
  'ノラモン':'tb-ノラモン', 'ノラモン・ボスモン':'tb-ノラモン',
  '調':'tb-調', '律':'tb-律',
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
    const pct  = (ab.eff * 100).toFixed(2);
    const ec   = ab.eff >= 1.4 ? 'eff-high' : ab.eff >= 1.0 ? 'eff-mid' : 'eff-low';
    const disc = ab.discount || '—';
    const cls  = groupBadgeClass[ab.group] || 'tb-その他';
    const costText = typeof ab.cost  === 'number' ? ab.cost  + 'pt' : ab.cost;
    const valText  = typeof ab.value === 'number' ? '+' + ab.value  : ab.value;
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
  { label:'律',               rate:1.19, cls:'tb-律'      },
  { label:'超○○単独',       rate:1.33, cls:'tb-超虹'    },
  { label:'調',               rate:1.05, cls:'tb-調'      },
  { label:'ノラモン・ボスモン', rate:1.00, cls:'tb-ノラモン'},
  { label:'白（特殊）',       rate:0.85, cls:'tb-白特殊'  },
  { label:'金',               rate:0.85, cls:'tb-金'      },
  { label:'ひらめき',         rate:0.80, cls:'tb-ひらめき' },
  { label:'白',               rate:0.60, cls:'tb-白'      },
];

function renderBaseRateTab() {
  const sorted = [...baseReturnRates].sort((a, b) => b.rate - a.rate);
  document.getElementById('baseRateTable').innerHTML = sorted.map(row => {
    const pct = (row.rate * 100).toFixed(0) + '%';
    const ec  = row.rate >= 1.10 ? 'eff-high' : row.rate >= 0.85 ? 'eff-mid' : 'eff-low';
    return `<tr>
      <td><span class="type-badge ${row.cls}">${row.label}</span></td>
      <td><span class="eff-value ${ec}">${pct}</span></td>
    </tr>`;
  }).join('');
}

function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }
function closeModalOnBg(e) { if (e.target === document.getElementById('modalOverlay')) closeModal(); }

function openHelpModal()  { document.getElementById('helpOverlay').classList.add('open'); }
function closeHelpModal() { document.getElementById('helpOverlay').classList.remove('open'); }
function closeHelpModalOnBg(e) { if (e.target === document.getElementById('helpOverlay')) closeHelpModal(); }

// 初期化
renderAbilityList();
