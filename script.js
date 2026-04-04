
// State
let selectedMonsters = {
    // Feature 1
    gf_f: null, gf_ff: null, gf_fm: null,
    gf_m: null, gf_mf: null, gf_mm: null,
    // Feature 2
    opt_child: null,
    // Feature 3
    rev_child: null, rev_f: null, rev_ff: null, rev_fm: null, rev_m: null, rev_mf: null, rev_mm: null,
    // Feature 4
    gen_ff: null, gen_fm: null, gen_mf: null, gen_mm: null,
    // Feature 4: Matching Mode
    gen_match_p: null, gen_match_gp1: null, gen_match_gp2: null
};

// Target Bloodline State
let searchTargetMode = 'all'; // 'all' or 'designated'
let targetBloodlines = new Set(); // Stores IDs of selected monsters

// Set of excluded IDs
let excludedMonsters = new Set();

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    renderMonstersToModal();
    renderExclusionModal();
    updateAllPlaceholders();
    updateAllPlaceholders();
    updateExclusionCounts();
    renderExclusionModal();
    updateAllPlaceholders();
    updateAllPlaceholders();
    updateExclusionCounts();
    syncSliderLabels();
    syncSliderLabels();
    initPatchSystem(); // Initialize Data/Patch System
    initNobleData();
});

function syncSliderLabels() {
    const s3 = document.getElementById('secret3');
    const s2 = document.getElementById('secret2');
    const noble = document.getElementById('noble');

    if (s3) document.getElementById('v3-val').innerText = s3.value;
    if (s2) document.getElementById('v2-val').innerText = s2.value;
    if (noble) document.getElementById('noble-val').innerText = noble.value;
}

// --- Logic Helpers ---

// Get compatibility from matrix. Row: Younger, Col: Older
function getComb(youngerIdx, olderIdx) {
    if (youngerIdx === null || olderIdx === null) return 0;
    if (!COMPATIBILITY_MATRIX[youngerIdx]) return 0;
    return COMPATIBILITY_MATRIX[youngerIdx][olderIdx] || 0;
}

// Calculate total compatibility score
function calculateScore(childId, fId, ffId, fmId, mId, mfId, mmId, sec3, sec2, noble) {
    if (childId === null || fId === null || ffId === null || fmId === null || mId === null || mfId === null || mmId === null) return 0;

    let term1 = getComb(childId, fId);
    let term2 = Math.min(getComb(fId, ffId), getComb(childId, ffId));
    let term3 = Math.min(getComb(fId, fmId), getComb(childId, fmId));
    let term4 = getComb(childId, mId);
    let term5 = Math.min(getComb(mId, mfId), getComb(childId, mfId));
    let term6 = Math.min(getComb(mId, mmId), getComb(childId, mmId));
    let term7 = getComb(fId, mId);

    let base = 224;
    let bonus = (sec2 * 5) + (sec3 * 12.5) + Number(noble);

    return term1 + term2 + term3 + term4 + term5 + term6 + term7 + base + bonus;
}

function getSymbol(score) {
    if (score >= 660) return "👑";
    if (score >= 614) return "☆";
    if (score >= 490) return "◎";
    if (score >= 374) return "○";
    if (score >= 255) return "△";
    return "×";
}

// --- Feature 1: Gift Search ---
function runGiftSearch() {
    const s3 = Number(document.getElementById('secret3').value);
    const s2 = Number(document.getElementById('secret2').value);
    let nobleInput = Number(document.getElementById('noble').value);
    let noble = nobleInput;
    if (nobleMode === 'star') {
        if (nobleInput === 0) noble = 0;
        else noble = currentNobleData[nobleInput] || 0;
    }

    const ids = [selectedMonsters.gf_f, selectedMonsters.gf_ff, selectedMonsters.gf_fm,
    selectedMonsters.gf_m, selectedMonsters.gf_mf, selectedMonsters.gf_mm];

    if (ids.every(x => x !== null)) {
        let results = [];
        MONSTER_NAMES.forEach((name, idx) => {
            let s = calculateScore(idx, ids[0], ids[1], ids[2], ids[3], ids[4], ids[5], s3, s2, noble);
            results.push({ id: idx, name: name, score: s, symbol: getSymbol(s) });
        });
        results.sort((a, b) => b.score - a.score);

        // Prepare context for image saving
        const context = {
            f: ids[0], ff: ids[1], fm: ids[2],
            m: ids[3], mf: ids[4], mm: ids[5],
            s3: s3, s2: s2, noble: noble
        };

        renderResults('gift-results', results, context);
        return;
    }

    if (ids.some(x => x === null)) {
        alert("親・祖父母をすべて指定してください");
        return;
    }
}

// --- Feature 2: Optimization ---
function runOptimization() {
    const childId = selectedMonsters.opt_child;
    const targetSymbolScore = Number(document.getElementById('target-symbol').value);

    if (childId === null) {
        alert("育成モンスター(子)を選択してください");
        return;
    }

    // Filtered Monster Indices
    const validMonsters = [];
    for (let i = 0; i < MONSTER_NAMES.length; i++) {
        if (!excludedMonsters.has(i)) validMonsters.push(i);
    }

    let bestP = [];
    let bestM = [];

    // Pool size for grandparents
    const GP_POOL_SIZE = 5;

    for (let i of validMonsters) {
        // Calculate GPs for Parent side
        let gpCandidates = [];
        for (let gp of validMonsters) {
            let val = Math.min(getComb(i, gp), getComb(childId, gp));
            gpCandidates.push({ id: gp, score: val });
        }
        // Sort distinct GPs by score desc
        gpCandidates.sort((a, b) => b.score - a.score);
        // Keep top N
        let topGPs = gpCandidates.slice(0, GP_POOL_SIZE);

        if (topGPs.length === 0) continue;

        // Generate Top Tuples (GP1, GP2)
        // Permutate Top GPs (5x5 = 25) to allow distinct grandparents
        let tuples = [];
        let base = getComb(childId, i);

        for (let g1 of topGPs) {
            for (let g2 of topGPs) {
                tuples.push({
                    gp1: g1.id,
                    gp2: g2.id,
                    score: g1.score + g2.score
                });
            }
        }
        // Sort tuples, keep Top N
        tuples.sort((a, b) => b.score - a.score);
        let bestTuples = tuples.slice(0, GP_POOL_SIZE);

        // Store
        bestP.push({ id: i, baseScore: base, tuples: bestTuples });
        bestM.push({ id: i, baseScore: base, tuples: bestTuples });
    }

    // Collect all candidates
    let allCandidates = [];

    // Optimization: To avoid 400*400*25 loop freezing UI, we could sort bestP/bestM by their 'best potential' first?
    // But we need exhaustive search for top 10.
    // 400*400*25 = 4M. Should be fine.

    for (let p of bestP) {
        for (let m of bestM) {
            let fmScore = getComb(p.id, m.id);
            let baseTotal = p.baseScore + m.baseScore + fmScore + 224;

            // Iterate through top Tuples for both
            for (let t1 of p.tuples) {
                for (let t2 of m.tuples) {
                    let total = baseTotal + t1.score + t2.score;

                    allCandidates.push({
                        f: p.id, ff: t1.gp1, fm: t1.gp2,
                        m: m.id, mf: t2.gp1, mm: t2.gp2,
                        child: childId,
                        rawScore: total
                    });
                }
            }
        }
    }

    if (allCandidates.length === 0) {
        alert("有効な結果が見つかりませんでした (除外リストを確認してください)");
        return;
    }

    // Sort descending
    allCandidates.sort((a, b) => b.rawScore - a.rawScore);

    // Top 10
    const topCombos = allCandidates.slice(0, 10);

    renderTabbedResults('opt-results', topCombos, targetSymbolScore);
}

// --- Feature 3: Completion Search ---
function runReverseOpt() {
    const childId = selectedMonsters.rev_child;
    if (childId === null) {
        alert("育成モンスター(子)を選択してください");
        return;
    }

    const slots = {
        f: selectedMonsters.rev_f,
        ff: selectedMonsters.rev_ff,
        fm: selectedMonsters.rev_fm,
        m: selectedMonsters.rev_m,
        mf: selectedMonsters.rev_mf,
        mm: selectedMonsters.rev_mm
    };

    const validMonsters = [];
    for (let i = 0; i < MONSTER_NAMES.length; i++) {
        if (!excludedMonsters.has(i)) validMonsters.push(i);
    }

    // Config: How many candidates to keep per parent-slot
    const GP_POOL_SIZE = 5;

    function getBestUnit(isMother) {
        let p = isMother ? slots.m : slots.f;
        let gp1 = isMother ? slots.mf : slots.ff;
        let gp2 = isMother ? slots.mm : slots.fm;

        let candidates = [];
        let pList = (p !== null) ? [p] : validMonsters;

        for (let i of pList) {
            if (p === null && excludedMonsters.has(i)) continue;

            // Get Top GP1s
            let gp1List = (gp1 !== null) ? [gp1] : validMonsters;
            let gp1Candidates = [];
            for (let g of gp1List) {
                let val = Math.min(getComb(i, g), getComb(childId, g));
                gp1Candidates.push({ id: g, score: val });
            }
            gp1Candidates.sort((a, b) => b.score - a.score);
            let topGP1 = gp1Candidates.slice(0, GP_POOL_SIZE);

            // Get Top GP2s
            let gp2List = (gp2 !== null) ? [gp2] : validMonsters;
            let gp2Candidates = [];
            for (let g of gp2List) {
                let val = Math.min(getComb(i, g), getComb(childId, g));
                gp2Candidates.push({ id: g, score: val });
            }
            gp2Candidates.sort((a, b) => b.score - a.score);
            let topGP2 = gp2Candidates.slice(0, GP_POOL_SIZE);

            if (topGP1.length === 0 || topGP2.length === 0) continue;

            // Generate Top Tuples (GP1, GP2) for this Parent i
            // We want the best 5 combinations of (GP1, GP2)
            let parentTuples = [];
            let base = getComb(childId, i);

            for (let g1 of topGP1) {
                for (let g2 of topGP2) {
                    // Score = Base + GP1Score + GP2Score
                    // Note: This does not check for GP1 != GP2 here, assuming game allows it or user checks conflicts.
                    // But if we want to be safe against self-overlap:
                    // if (g1.id === g2.id && gp1 === null && gp2 === null) continue; // Optional?
                    // User request implies "don't miss optimal", allowing overlap might be optimal stat-wise but invalid rule-wise.
                    // I will leave it open (allow overlap) to maximize finding high stats, user can exclude if needed.
                    // Exception: If `excludedMonsters` handles it (already done).

                    parentTuples.push({
                        id: i,
                        gp1: g1.id,
                        gp2: g2.id,
                        score: base + g1.score + g2.score
                    });
                }
            }
            // Sort tuples
            parentTuples.sort((a, b) => b.score - a.score);

            // Keep Top N tuples for this parent
            // Pushing flattened candidates
            candidates.push(...parentTuples.slice(0, GP_POOL_SIZE));
        }
        return candidates;
    }

    let pUnits = getBestUnit(false);
    let mUnits = getBestUnit(true);

    if (pUnits.length === 0 || mUnits.length === 0) {
        alert("探索候補が見つかりませんでした");
        return;
    }

    // Optimization: Sort units globally by score to potentially trim tail?
    // Not strictly needed if N is small (5). 400 * 5 = 2000 units.
    // 2000 * 2000 = 4,000,000 iterations. OK.

    let allCandidates = [];

    for (let p of pUnits) {
        for (let m of mUnits) {
            let fmScore = getComb(p.id, m.id);
            let total = p.score + m.score + fmScore + 224;

            allCandidates.push({
                f: p.id, ff: p.gp1, fm: p.gp2,
                m: m.id, mf: m.gp1, mm: m.gp2,
                child: childId,
                rawScore: total
            });
        }
    }

    if (allCandidates.length === 0) {
        alert("有効な結果が見つかりませんでした");
        return;
    }

    // Sort
    allCandidates.sort((a, b) => b.rawScore - a.rawScore);

    // Top 10
    const topCombos = allCandidates.slice(0, 10);
    const targetSymbolScore = Number(document.getElementById('target-symbol-rev').value);

    renderTabbedResults('rev-opt-results', topCombos, targetSymbolScore);
}

// --- Feature 4: General Search ---
function runGeneralSearch() {
    // Check mode
    const mode = document.getElementById('gen_mode').value;
    if (mode === 'matching') {
        runMatchingSearch();
        return;
    }

    // Existing Grandparents Search Logic
    const fixedIds = [selectedMonsters.gen_ff, selectedMonsters.gen_fm,
    selectedMonsters.gen_mf, selectedMonsters.gen_mm];

    // Count nulls
    const nullCount = fixedIds.filter(x => x === null).length;

    if (nullCount > 2) {
        alert("空きスロットは2つまでにしてください（処理負荷のため）");
        return;
    }

    const validMonsters = [];
    for (let i = 0; i < MONSTER_NAMES.length; i++) {
        if (!excludedMonsters.has(i)) validMonsters.push(i);
    }

    // UI: Show loading, hide previous results
    const loadingDiv = document.getElementById('gen-loading');
    const resultContainer = document.getElementById('gen-results');
    loadingDiv.style.display = 'block';
    resultContainer.innerHTML = '';

    // Defer execution to allow UI to render
    setTimeout(() => {
        let maxMinScore = -1;
        let bestSolution = null;
        let topCombos = [];

        // Determine targets
        let targets = null;
        if (searchTargetMode === 'designated' && targetBloodlines.size > 0) {
            targets = Array.from(targetBloodlines);
        } else if (searchTargetMode === 'designated' && targetBloodlines.size === 0) {
            // Fallback if empty
            // alert('育成対象が選択されていません。全血統モードで実行します。');
            targets = null;
        }

        // Helper to calculate score based on mode
        const targetVal = Number(document.getElementById('gen-target-val').value);

        function evaluateLineage(f, m, gps) {
            // Mode: All Bloodlines -> Maximize Count >= TargetVal
            if (searchTargetMode === 'all') {
                let count = 0;
                // Loop all
                for (let c = 0; c < MONSTER_NAMES.length; c++) {
                    let s = calculateScore(c, f, gps[0], gps[1], m, gps[2], gps[3], 0, 0, 0);
                    if (s >= targetVal) count++;
                }
                return count;
            }

            // Mode: Designated -> Maximize Minimum Score (Floor)
            let minScore = 9999;
            const loopTargets = (targets && targets.length > 0) ? targets : Array.from({ length: MONSTER_NAMES.length }, (_, i) => i);

            for (let c of loopTargets) {
                // calculateScore(child, f, ff, fm, m, mf, mm, ...)
                // gps is [ff, fm, mf, mm]
                let s = calculateScore(c, f, gps[0], gps[1], m, gps[2], gps[3], 0, 0, 0);
                if (s < minScore) minScore = s;
            }
            return minScore;
        }

        // Recursive solver for missing grandparents
        // currentGPs: array of 4 (some null)
        // missingIndices: array of indices [0, 1, 2, 3] that are null
        // depth: current index in missingIndices
        function solveGPs(f, m, currentGPs, missingIndices, depth) {
            if (depth === missingIndices.length) {
                // All filled
                let val = evaluateLineage(f, m, currentGPs);
                if (val > maxMinScore) {
                    maxMinScore = val;
                    // Clone currentGPs because it's reused
                    bestSolution = { f: f, m: m, gps: [...currentGPs], val: val };
                }
                // Also add to topCombos
                topCombos.push({ f: f, m: m, gps: [...currentGPs], val: val });
                return;
            }

            let targetIndex = missingIndices[depth];
            for (let cand of validMonsters) {
                currentGPs[targetIndex] = cand;
                solveGPs(f, m, currentGPs, missingIndices, depth + 1);
                currentGPs[targetIndex] = null; // Backtrack (though not strictly needed as we overwrite)
            }
        }

        // Identify missing indices
        let missingIndices = [];
        for (let i = 0; i < 4; i++) {
            if (fixedIds[i] === null) missingIndices.push(i);
        }

        // Main loop: Iterate Parents
        for (let f of validMonsters) {
            for (let m of validMonsters) {
                // Prepare a working copy of GPs
                let workingGPs = [...fixedIds];
                solveGPs(f, m, workingGPs, missingIndices, 0);
            }
        }

        // Search Complete - hide loading
        loadingDiv.style.display = 'none';

        if (topCombos.length === 0) {
            alert("有効な結果が見つかりませんでした");
            return;
        }

        // Sort topCombos by score (val) descending
        topCombos.sort((a, b) => b.val - a.val);
        if (topCombos.length > 10) topCombos = topCombos.slice(0, 10);

        // Use renderGeneralTabbedResults for consistency
        renderGeneralTabbedResults('gen-results', topCombos, targetVal);

    }, 50); // Small delay to let UI render loading spinner
}

// --- Feature 4: Matching Search (New) ---
function runMatchingSearch() {
    const p = selectedMonsters.gen_match_p;
    const gp1 = selectedMonsters.gen_match_gp1;
    const gp2 = selectedMonsters.gen_match_gp2;

    if (p === null || gp1 === null || gp2 === null) {
        alert("親・祖父・祖母の3体をすべて指定してください。");
        return;
    }

    const resultContainer = document.getElementById('gen-results');
    resultContainer.classList.remove('result-grid'); // Fix layout
    resultContainer.innerHTML = '';
    const loadingDiv = document.getElementById('gen-loading');
    loadingDiv.style.display = 'block';

    const validMonsters = [];
    for (let i = 0; i < MONSTER_NAMES.length; i++) {
        if (!excludedMonsters.has(i)) {
            validMonsters.push(i);
        }
    }

    // Helper to calculate min score for a full lineage
    const targetVal = Number(document.getElementById('gen-target-val').value);

    function evaluateLineage(f, m, gps, targets) {
        if (searchTargetMode === 'all') {
            let count = 0;
            for (let c = 0; c < MONSTER_NAMES.length; c++) {
                let s = calculateScore(c, f, gps[0], gps[1], m, gps[2], gps[3], 0, 0, 0);
                if (s >= targetVal) count++;
            }
            return count;
        }

        let minScore = 9999;
        const loopTargets = (targets && targets.length > 0) ? targets : Array.from({ length: MONSTER_NAMES.length }, (_, i) => i);

        for (let c of loopTargets) {
            // calculateScore(child, f, ff, fm, m, mf, mm, ...)
            // gps is [ff, fm, mf, mm]
            let s = calculateScore(c, f, gps[0], gps[1], m, gps[2], gps[3], 0, 0, 0);
            if (s < minScore) minScore = s;
        }
        return minScore;
    }

    setTimeout(() => {
        let targets = null;
        if (searchTargetMode === 'designated' && targetBloodlines.size > 0) {
            targets = Array.from(targetBloodlines);
        } else if (searchTargetMode === 'designated' && targetBloodlines.size === 0) {
            alert('育成対象が選択されていません。全血統モードで実行します。');
            targets = null; // Fallback
        }

        let bestScore = -1;
        let bestCombo = null;
        let topCombos = [];

        // Pattern A: Input is Father side (f=P, ff=GP1, fm=GP2)
        // Search Mother side (m, mf, mm)
        // Fixed: f, ff, fm
        const f = p;
        const ff = gp1;
        const fm = gp2;

        for (let m of validMonsters) {
            for (let mf of validMonsters) {
                for (let mm of validMonsters) {
                    // lineage: f, m, [ff, fm, mf, mm]
                    let score = evaluateLineage(f, m, [ff, fm, mf, mm], targets);
                    if (score > bestScore) {
                        bestScore = score;
                        bestCombo = {
                            mode: 'A', // Input is Father
                            f: f, m: m,
                            gps: [ff, fm, mf, mm],
                            val: score
                        };
                    }
                    topCombos.push({
                        mode: 'A',
                        f: f, m: m,
                        gps: [ff, fm, mf, mm],
                        val: score
                    });
                }
            }
        }

        // Pattern B: Input is Mother side (m=P, mf=GP1, mm=GP2)
        // Search Father side (f, ff, fm)
        // Fixed: m, mf, mm
        const m = p;
        const mf = gp1;
        const mm = gp2;

        for (let fIter of validMonsters) {
            for (let ffIter of validMonsters) {
                for (let fmIter of validMonsters) {
                    // lineage: fIter, m, [ffIter, fmIter, mf, mm]
                    let score = evaluateLineage(fIter, m, [ffIter, fmIter, mf, mm], targets);
                    if (score > bestScore) {
                        bestScore = score;
                        bestCombo = {
                            mode: 'B',
                            f: fIter, m: m,
                            gps: [ffIter, fmIter, mf, mm],
                            val: score
                        };
                    }
                    // Add to top list
                    topCombos.push({
                        mode: 'B',
                        f: fIter, m: m,
                        gps: [ffIter, fmIter, mf, mm],
                        val: score
                    });
                }
            }
        }


        loadingDiv.style.display = 'none';

        if (bestCombo) {
            // Sort topCombos by score (val) descending
            topCombos.sort((a, b) => b.val - a.val);
            if (topCombos.length > 10) topCombos = topCombos.slice(0, 10);

            // Use renderGeneralTabbedResults for consistency
            renderGeneralTabbedResults('gen-results', topCombos, targetVal);
        } else {
            document.getElementById('gen-results').innerHTML = '<div style="text-align:center; padding:20px; color:#888;">条件を満たす組合せが見つかりませんでした。</div>';
        }
    }, 100);
}

function renderMatchingResult(container, combo, score) {
    let html = '';

    // Determine labels based on mode
    let fLabel = "父親 (相方)";
    const fClass = ""; // Removed highlight class
    let mLabel = "母親 (固定)";
    const mClass = ""; // Removed highlight class

    if (combo.mode === 'A') {
        // Input was Father (Fixed), Found Mother (Partner)
        fLabel = "父親 (固定)";
        mLabel = "母親 (相方)";
    }

    // Helper to get name
    const getName = (id) => (id !== null) ? MONSTER_NAMES[id] : '？';
    const getImg = (id) => (id !== null) ? `images/${MONSTER_NAMES[id]}.png` : '';

    // Reuse render2x3 styled structure but custom labels
    // We already have combo.f, combo.m, combo.gps = [ff, fm, mf, mm]
    const fId = combo.f;
    const mId = combo.m;
    const [ffId, fmId, mfId, mmId] = combo.gps;

    const fIsFound = (combo.mode === 'B');
    const mIsFound = (combo.mode === 'A');

    // Header Text Logic
    let headerText = "";
    const targetVal = Number(document.getElementById('gen-target-val').value);

    if (searchTargetMode === 'all') {
        headerText = `条件達成 ${score}体 (目標 ${targetVal}〜)`;
    } else {
        headerText = `${getSymbol(score)} <span style="font-size:1.2rem; margin-left:10px; font-weight:bold;">${score.toFixed(1)}</span>`;
    }

    html += `
    <div id="capture-gen-match" style="padding:10px; background:#121212;">
    <div class="result-card-2x3">
        <div class="result-header">
            ${headerText}
            <span style="font-size:0.8rem; color:#aaa; margin-left:10px;">
                ${fIsFound ? '母側固定 / 父側探索結果' : '父側固定 / 母側探索結果'}
            </span>
        </div>
        
        <div class="result-parents-grid">
            <div class="parent-label">父親側</div>
            <div class="mini-card"><img src="${getImg(fId)}" onerror="this.src=''"><div>父<br>${getName(fId)}</div></div>
            <div class="mini-card"><img src="${getImg(ffId)}" onerror="this.src=''"><div>祖父<br>${getName(ffId)}</div></div>
            <div class="mini-card"><img src="${getImg(fmId)}" onerror="this.src=''"><div>祖母<br>${getName(fmId)}</div></div>
        </div>
        
        <div class="result-parents-grid">
            <div class="parent-label">母親側</div>
            <div class="mini-card"><img src="${getImg(mId)}" onerror="this.src=''"><div>母<br>${getName(mId)}</div></div>
            <div class="mini-card"><img src="${getImg(mfId)}" onerror="this.src=''"><div>祖父<br>${getName(mfId)}</div></div>
            <div class="mini-card"><img src="${getImg(mmId)}" onerror="this.src=''"><div>祖母<br>${getName(mmId)}</div></div>
        </div>
    </div>
    `;

    // --- Append Full List of Scores (User Request) ---
    // Generate list for the found combination
    const resultList = [];
    for (let c = 0; c < MONSTER_NAMES.length; c++) {
        let s = calculateScore(c, fId, ffId, fmId, mId, mfId, mmId, 0, 0, 0);
        resultList.push({
            name: MONSTER_NAMES[c],
            score: s,
            symbol: getSymbol(s)
        });
    }

    // Sort by score descending (User Request)
    resultList.sort((a, b) => b.score - a.score);

    // Reuse logic from renderResults to generate grid HTML
    const listHtml = resultList.map(item => {
        // Highlight in list if designated OR meeting threshold in all mode
        const isDesignated = (searchTargetMode === 'designated' && targetBloodlines.has(MONSTER_NAMES.indexOf(item.name)));
        const targetVal = Number(document.getElementById('gen-target-val').value);

        let highlightClass = isDesignated ? 'designated-highlight' : '';
        if (searchTargetMode === 'all' && item.score >= targetVal) {
            highlightClass = 'designated-highlight';
        }

        return `
        <div class="result-card ${highlightClass}">
            <img src="images/${item.name}.png" onerror="this.src=''">
            <div>${item.name}</div>
            <div class="result-score">${item.score.toFixed(1)}</div>
            <div class="result-symbol">${item.symbol}</div>
        </div>
    `}).join('');

    html += `
    <div style="margin-top:20px; font-size:0.9rem; color:#aaa; text-align:center;">全モンスター相性一覧</div>
    <div class="result-grid">
        ${listHtml}
    </div>
    </div> <!-- Close capture div -->
    <div style="text-align:center; margin-top:15px;">
        <button class="save-img-btn" onclick="saveAsImage('capture-gen-match', 'general_matching_result')">📷 画像を保存</button>
    </div>
    `;

    container.innerHTML = html;
}

// --- UI Helpers ---

function resetInputs(feature) {
    if (feature === 'gift') {
        selectedMonsters.gf_f = null; selectedMonsters.gf_ff = null; selectedMonsters.gf_fm = null;
        selectedMonsters.gf_m = null; selectedMonsters.gf_mf = null; selectedMonsters.gf_mm = null;
        document.getElementById('secret3').value = 0;
        document.getElementById('secret2').value = 0;
        document.getElementById('noble').value = 0;
        document.getElementById('v3-val').innerText = '0';
        document.getElementById('v2-val').innerText = '0';
        document.getElementById('noble-val').innerText = '0';
        document.getElementById('gift-results').innerHTML = '';
    }
    if (feature === 'opt') {
        selectedMonsters.opt_child = null;
        document.getElementById('target-symbol').value = "999";
        document.getElementById('opt-results').innerHTML = '';
    }
    if (feature === 'rev') {
        selectedMonsters.rev_child = null;
        selectedMonsters.rev_f = null; selectedMonsters.rev_ff = null; selectedMonsters.rev_fm = null;
        selectedMonsters.rev_m = null; selectedMonsters.rev_mf = null; selectedMonsters.rev_mm = null;
        document.getElementById('target-symbol-rev').value = "999";
        document.getElementById('rev-opt-results').innerHTML = '';
    }
    if (feature === 'gen') {
        const mode = document.getElementById('gen_mode').value;
        if (mode === 'matching') {
            selectedMonsters.gen_match_p = null;
            selectedMonsters.gen_match_gp1 = null;
            selectedMonsters.gen_match_gp2 = null;
        } else {
            selectedMonsters.gen_ff = null;
            selectedMonsters.gen_fm = null;
            selectedMonsters.gen_mf = null;
            selectedMonsters.gen_mm = null;
        }
        document.getElementById('gen-results').innerHTML = '';
    }
    saveToLocalStorage();
    updateAllPlaceholders();
}

// --- Feature 4 Mode Toggle ---
function toggleGenMode(mode) {
    if (!mode) return; // safety

    // Update hidden input
    document.getElementById('gen_mode').value = mode;

    // Update Tab Styles
    document.getElementById('tab-gen-gp').classList.toggle('active', mode === 'grandparents');
    document.getElementById('tab-gen-match').classList.toggle('active', mode === 'matching');

    const gpDiv = document.getElementById('gen-input-grandparents');
    const matchDiv = document.getElementById('gen-input-matching');
    const gpLabel = document.getElementById('gen-label-gp');
    const matchLabel = document.getElementById('gen-label-match');

    // Description is now inside the div, so it toggles automatically with the div.
    // We just need to ensure the Labels for "Parents" vs "Grandparents" toggle if they are separate.

    if (mode === 'matching') {
        gpDiv.style.display = 'none';
        matchDiv.style.display = 'block';
        gpLabel.style.display = 'none';
        matchLabel.style.display = 'inline';
        if (document.getElementById('gen-note-gp')) document.getElementById('gen-note-gp').style.display = 'none';
    } else {
        gpDiv.style.display = 'block';
        matchDiv.style.display = 'none';
        gpLabel.style.display = 'inline';
        matchLabel.style.display = 'none';
        if (document.getElementById('gen-note-gp')) document.getElementById('gen-note-gp').style.display = 'block';
    }
    // Clear results when switching
    document.getElementById('gen-results').innerHTML = '';
}

function render2x3Result(containerId, combo, finalScore, items) {
    const container = document.getElementById(containerId);
    let itemsHTML = '';
    if (items) {
        itemsHTML = `
        <div style="margin-top:10px; padding-top:10px; border-top:1px dashed #444; font-size:0.9rem; text-align:center;">
            <div>推奨共通秘伝数・加算値</div>
            <div style="color:var(--accent-color); font-weight:bold; margin-top:5px;">
                共通秘伝Ⅲ：${items.s3}個, 共通秘伝Ⅱ：${items.s2}個, ノーブル秘伝：${items.noble}
            </div>
        </div>`;
    }

    const captureId = `capture-${containerId}`;
    container.innerHTML = `
        <div id="${captureId}" class="result-card-2x3">
            <div class="result-header">
                ${combo.child != null ? `<div style="margin-bottom:5px; font-size:0.9rem; color:#ccc; display:flex; align-items:center; justify-content:center; gap:6px;">
                    <span>育成モンスター:</span>
                    <img src="images/${MONSTER_NAMES[combo.child]}.png" style="width:24px; height:24px; border-radius:4px; vertical-align:middle;">
                    <span>${MONSTER_NAMES[combo.child]}</span>
                </div>` : ''}
                ${getSymbol(finalScore)} <span style="font-size:1.2rem; margin-left:10px; font-weight:bold;">${finalScore.toFixed(1)}</span>
            </div>
            
            <div class="result-parents-grid">
                <div class="parent-label">父親側</div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[combo.f]}.png" onerror="this.src=''"><div>父<br>${MONSTER_NAMES[combo.f]}</div></div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[combo.ff]}.png" onerror="this.src=''"><div>祖父<br>${MONSTER_NAMES[combo.ff]}</div></div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[combo.fm]}.png" onerror="this.src=''"><div>祖母<br>${MONSTER_NAMES[combo.fm]}</div></div>
            </div>
            
            <div class="result-parents-grid">
                <div class="parent-label">母親側</div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[combo.m]}.png" onerror="this.src=''"><div>母<br>${MONSTER_NAMES[combo.m]}</div></div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[combo.mf]}.png" onerror="this.src=''"><div>祖父<br>${MONSTER_NAMES[combo.mf]}</div></div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[combo.mm]}.png" onerror="this.src=''"><div>祖母<br>${MONSTER_NAMES[combo.mm]}</div></div>
            </div>
            
            ${itemsHTML}
        </div>
        <div style="text-align:right; margin-top:10px; display:flex; justify-content:flex-end; gap:10px;">
            <button class="mini-action-btn" 
                onclick='applyToTyrant(${JSON.stringify(combo)}, ${JSON.stringify(items || {})})'>
                タイラントツールへ適用
            </button>
            <button class="save-img-btn" style="margin-top:0;" onclick="saveAsImage('${captureId}', 'opt_result')">📷 画像を保存</button>
        </div>
    `;
}


function switchTab(tabId, navEl) {
    document.querySelectorAll('section').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');

    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    navEl.classList.add('active');
}

let currentModalTarget = null;

function openMonsterModal(slotKey) {
    currentModalTarget = slotKey;
    document.getElementById('monster-modal').classList.add('open');
}

function closeModal() {
    document.getElementById('monster-modal').classList.remove('open');
}

function selectMonster(idx) {
    if (currentModalTarget) {
        selectedMonsters[currentModalTarget] = idx;
        saveToLocalStorage();
        updateAllPlaceholders();
    }
    closeModal();
}

function openExclusionModal() {
    document.getElementById('exclusion-modal').classList.add('open');
}

function closeExclusionModal() {
    document.getElementById('exclusion-modal').classList.remove('open');
    updateExclusionCounts();
}

function selectNonNoble() {
    excludedMonsters.clear();
    MONSTER_NAMES.forEach((name, idx) => {
        if (!NOBLE_MONSTER_NAMES.includes(name)) {
            excludedMonsters.add(idx);
        }
    });
    renderExclusionModal();
    updateExclusionCounts();
    saveToLocalStorage();
}

function clearExclusions() {
    excludedMonsters.clear();
    renderExclusionModal();
    updateExclusionCounts();
    saveToLocalStorage();
}

function toggleExclusion(idx) {
    if (excludedMonsters.has(idx)) {
        excludedMonsters.delete(idx);
    } else {
        excludedMonsters.add(idx);
    }
    renderExclusionModal();
    saveToLocalStorage();
}

function renderExclusionModal() {
    const grid = document.getElementById('exclusion-grid');
    grid.innerHTML = MONSTER_NAMES.map((name, idx) => {
        const isExcluded = excludedMonsters.has(idx);
        const style = isExcluded ? 'background: #500; border: 1px solid red;' : '';
        return `
        <div class="modal-item" style="${style}" onclick="toggleExclusion(${idx})">
            <div>
                <img src="images/${name}.png" alt="${name}" style="width:32px; height:32px; display:block; margin:0 auto; opacity:${isExcluded ? 0.5 : 1}"><br>
                ${name}
            </div>
        </div>
    `}).join('');
}

function updateExclusionCounts() {
    const count = excludedMonsters.size;
    document.getElementById('exclusion-count-opt').innerText = `${count}体 除外中`;
    document.getElementById('exclusion-count-rev').innerText = `${count}体 除外中`;
    document.getElementById('exclusion-count-gen').innerText = `${count}体 除外中`;

    // Update small icons
    const renderIcons = (containerId) => {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = Array.from(excludedMonsters).map(id =>
            `<img src="images/${MONSTER_NAMES[id]}.png" class="excluded-icon" title="${MONSTER_NAMES[id]}">`
        ).join('');
    };

    renderIcons('exclusion-icons-opt');
    renderIcons('exclusion-icons-rev');
    renderIcons('exclusion-icons-gen');
}

function updateAllPlaceholders() {
    for (let key in selectedMonsters) {
        const idx = selectedMonsters[key];
        const el = document.querySelector(`.monster-btn[data-slot="${key}"]`);
        if (!el) continue;

        if (idx !== null) {
            el.innerHTML = `<img src="images/${MONSTER_NAMES[idx]}.png" onerror="this.src=''">${MONSTER_NAMES[idx]}`;
            el.classList.remove('placeholder');
        } else {
            el.innerHTML = "選択";
            el.classList.add('placeholder');
        }
    }
}

function renderMonstersToModal() {
    const grid = document.getElementById('modal-grid');
    // Add "Empty" option first
    const emptyOption = `
        <div class="modal-item" onclick="selectMonster(null)" style="background:#444; border:1px dashed #777;">
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%;">
                <span style="font-size:1.5rem; color:#aaa;">X</span>
                <span style="font-size:0.7rem;">空欄に戻す</span>
            </div>
        </div>
    `;

    const monsterOptions = MONSTER_NAMES.map((name, idx) => `
        <div class="modal-item" onclick="selectMonster(${idx})">
            <div>
                <img src="images/${name}.png" alt="${name}" style="width:32px; height:32px; display:block; margin:0 auto;"><br>
                ${name}
            </div>
        </div>
    `).join('');

    grid.innerHTML = emptyOption + monsterOptions;
}

// --- Image Saving ---
function saveAsImage(elementId, fileName) {
    const element = document.getElementById(elementId);
    if (!element) return;

    // Temporarily hide buttons inside the element from screenshot? 
    // Or just let them be visible. User might want to see them.
    // Spec says "capture result". Usually buttons are excluded, but let's keep it simple first.
    // If we want to exclude, we can use 'ignoreElements' callback.

    // Use logging to see what happens
    html2canvas(element, {
        backgroundColor: "#1e1e1e", // Match card-bg or bg-color
        scale: 2, // High res
        logging: false
    }).then(canvas => {
        try {
            const link = document.createElement('a');
            link.download = `${fileName}.png`;
            link.href = canvas.toDataURL();
            link.click();
        } catch (e) {
            if (e.name === "SecurityError") {
                alert("【画像の保存に失敗しました】\n\nローカルファイル(file://)から直接実行している場合、ブラウザのセキュリティ制限により画像を保存できません。\n\n解決策：\n1. ローカルサーバー(VSCodeのLive Server等)を使用する\n2. OSのスクリーンショット機能を使用する");
            } else {
                throw e;
            }
        }
    }).catch(err => {
        console.error("Image save failed:", err);
        if (err.name === "SecurityError" || err.message.includes("Tainted")) {
            alert("【画像の保存に失敗しました】\n\nローカルファイル(file://)から直接実行している場合、ブラウザのセキュリティ制限により画像を保存できません。\n\n解決策：\n1. ローカルサーバー(VSCodeのLive Server等)を使用する\n2. OSのスクリーンショット機能を使用する");
        } else {
            alert("画像の保存に失敗しました: " + err.message);
        }
    });
}

function renderResults(containerId, list, context) {
    const container = document.getElementById(containerId);

    // KEY FIX: The container usually has 'result-grid' class which breaks layout if we add children directly.
    // We remove it from the parent and put it on the inner wrapper.
    container.classList.remove('result-grid');

    let headerHTML = '';
    if (context) {
        headerHTML = `
        <div style="margin-bottom:15px; padding:5px;">
             <div class="result-card-2x3">
                <div class="result-header"> 共通秘伝Ⅲ:${context.s3}　共通秘伝Ⅱ:${context.s2}<br>ノーブル:${context.noble}</div>
                <div class="result-parents-grid">
                    <div class="parent-label">父親側</div>
                    <div class="mini-card"><img src="images/${MONSTER_NAMES[context.f]}.png" onerror="this.src=''"><div>父<br>${MONSTER_NAMES[context.f]}</div></div>
                    <div class="mini-card"><img src="images/${MONSTER_NAMES[context.ff]}.png" onerror="this.src=''"><div>祖父<br>${MONSTER_NAMES[context.ff]}</div></div>
                    <div class="mini-card"><img src="images/${MONSTER_NAMES[context.fm]}.png" onerror="this.src=''"><div>祖母<br>${MONSTER_NAMES[context.fm]}</div></div>
                </div>
                <div class="result-parents-grid">
                    <div class="parent-label">母親側</div>
                    <div class="mini-card"><img src="images/${MONSTER_NAMES[context.m]}.png" onerror="this.src=''"><div>母<br>${MONSTER_NAMES[context.m]}</div></div>
                    <div class="mini-card"><img src="images/${MONSTER_NAMES[context.mf]}.png" onerror="this.src=''"><div>祖父<br>${MONSTER_NAMES[context.mf]}</div></div>
                    <div class="mini-card"><img src="images/${MONSTER_NAMES[context.mm]}.png" onerror="this.src=''"><div>祖母<br>${MONSTER_NAMES[context.mm]}</div></div>
                </div>
            </div>
        </div>`;
    }

    let html = list.map(item => `
        <div class="result-card">
            <img src="images/${item.name}.png" onerror="this.src=''">
            <div>${item.name}</div>
            <div class="result-score">${item.score.toFixed(1)}</div>
            <div class="result-symbol">${item.symbol}</div>
        </div>
    `).join('');

    // Wrap in a capture div (which will have the grid layout) + button
    container.innerHTML = `
        <div id="capture-${containerId}" style="padding:10px; background:#121212;">
            ${headerHTML}
            <div class="result-grid" style="margin-top:0;">${html}</div>
        </div>
        <div style="text-align:center; margin-top:15px;">
            <button class="save-img-btn" onclick="saveAsImage('capture-${containerId}', 'gift_result')">📷 画像を保存</button>
        </div>
    `;
}

// --- Target Bloodline Logic ---

function toggleTargetMode() {
    const radios = document.getElementsByName('target_mode');
    for (let r of radios) {
        if (r.checked) {
            searchTargetMode = r.value;
            break;
        }
    }
    const selectorArea = document.getElementById('target-selector-area');
    const targetValArea = document.getElementById('target-val-area'); // New slider area

    if (searchTargetMode === 'designated') {
        selectorArea.style.display = 'block';
        if (targetValArea) targetValArea.style.display = 'none'; // Hide slider
        updateTargetCount();
    } else {
        selectorArea.style.display = 'none';
        if (targetValArea) targetValArea.style.display = 'block'; // Show slider
    }
}

function openBloodlineModal() {
    renderBloodlineModal();
    document.getElementById('bloodline-modal').classList.add('open');
}

function closeBloodlineModal() {
    document.getElementById('bloodline-modal').classList.remove('open');
    updateTargetCount();
}

function toggleTarget(idx) {
    if (targetBloodlines.has(idx)) {
        targetBloodlines.delete(idx);
    } else {
        targetBloodlines.add(idx);
    }
    renderBloodlineModal(); // re-render to update styles
    updateTargetCount();
}

function selectAllTargets() {
    for (let i = 0; i < MONSTER_NAMES.length; i++) {
        targetBloodlines.add(i);
    }
    renderBloodlineModal();
    updateTargetCount();
}

function clearAllTargets() {
    targetBloodlines.clear();
    renderBloodlineModal();
    updateTargetCount();
}

// Group definitions
const GROUP_INDICES = {
    'inorganic': [20, 31, 11, 4, 3],
    'creation': [12, 9, 27, 29],
    'phantom': [32, 19, 14, 25, 18, 17],
    'demon': [1, 22, 26, 13, 16, 0],
    'beast': [24, 7, 8, 10, 5, 2],
    'monster': [28, 30, 21, 23, 6, 15]
};

function selectGroup(groupKey) {
    const indices = GROUP_INDICES[groupKey];
    if (!indices) return;

    // logic: Add all.
    for (let idx of indices) {
        targetBloodlines.add(idx);
    }
    renderBloodlineModal();
    updateTargetCount();
}

function renderBloodlineModal() {
    const grid = document.getElementById('target-grid');
    grid.innerHTML = '';

    for (let i = 0; i < MONSTER_NAMES.length; i++) {
        const div = document.createElement('div');
        div.className = 'modal-item';
        // highlight if selected
        if (targetBloodlines.has(i)) {
            div.style.border = "2px solid var(--accent-color)";
            div.style.background = "#333";
        }

        div.onclick = () => toggleTarget(i);
        div.innerHTML = `
            <img src="images/${MONSTER_NAMES[i]}.png" style="width:30px;height:30px;display:block;margin-bottom:2px;">
            <div>${MONSTER_NAMES[i]}</div>
        `;
        grid.appendChild(div);
    }

    document.getElementById('target-count').innerText = `${targetBloodlines.size}体 選択中`;
}

function updateTargetCount() {
    // Updates the count on the main screen button
    const btnCount = document.getElementById('target-btn-count');
    if (btnCount) btnCount.innerText = `(${targetBloodlines.size})`;

    // Check Icons Preview
    const previewContainer = document.getElementById('target-icons-preview');
    if (previewContainer) {
        previewContainer.innerHTML = '';
        targetBloodlines.forEach(idx => {
            const img = document.createElement('img');
            img.src = `images/${MONSTER_NAMES[idx]}.png`;
            img.style.width = '30px';
            img.style.height = '30px';
            img.style.borderRadius = '4px';
            img.style.border = '1px solid #555';
            img.title = MONSTER_NAMES[idx];
            previewContainer.appendChild(img);
        });
    }
}


function saveToLocalStorage() {
    localStorage.setItem('mf_sim_data', JSON.stringify(selectedMonsters));
    localStorage.setItem('mf_sim_excluded', JSON.stringify(Array.from(excludedMonsters)));
}

function loadFromLocalStorage() {
    const data = localStorage.getItem('mf_sim_data');
    if (data) {
        selectedMonsters = JSON.parse(data);
    }
    const exData = localStorage.getItem('mf_sim_excluded');
    if (exData) {
        excludedMonsters = new Set(JSON.parse(exData));
    }
}

function applyToTyrant(combo, items) {
    if (!combo) return;

    // 1. Set Tyrant Feature State
    // 1. Set Tyrant Feature State
    selectedMonsters.gf_f = combo.f;
    // Check for gps array (General Search) or direct props (Optimal Search)
    if (combo.gps && Array.isArray(combo.gps) && combo.gps.length === 4) {
        selectedMonsters.gf_ff = combo.gps[0];
        selectedMonsters.gf_fm = combo.gps[1];
        selectedMonsters.gf_mf = combo.gps[2];
        selectedMonsters.gf_mm = combo.gps[3];
    } else {
        selectedMonsters.gf_ff = combo.ff;
        selectedMonsters.gf_fm = combo.fm;
        selectedMonsters.gf_mf = combo.mf;
        selectedMonsters.gf_mm = combo.mm;
    }
    selectedMonsters.gf_m = combo.m;

    // 2. Fix Noble Mode if needed
    if (nobleMode === 'star') {
        toggleNobleMode('val'); // Force switch to 123 mode
    }

    // 3. Set Items if present
    if (items) {
        document.getElementById('secret3').value = items.s3 || 0;
        document.getElementById('secret2').value = items.s2 || 0;
        document.getElementById('noble').value = items.noble || 0;
    } else {
        document.getElementById('secret3').value = 0;
        document.getElementById('secret2').value = 0;
        document.getElementById('noble').value = 0;
    }

    // 3. Update UI
    saveToLocalStorage();
    updateAllPlaceholders();
    syncSliderLabels();

    // 4. Switch Tab
    const giftTab = document.querySelector('a[onclick*="tab-gift"]');
    if (giftTab) giftTab.click();

    // 5. Scroll & Run
    setTimeout(() => {
        const tyrantArea = document.getElementById('tyrant-calc');
        if (tyrantArea) tyrantArea.scrollIntoView({ behavior: 'smooth' });

        // Auto-run calculation
        runGiftSearch();
    }, 300);
}

// --- Top 10 & Tab Helpers ---

function calculateItemsForScore(currentScore, targetScore) {
    if (targetScore === 999 || currentScore >= targetScore) {
        return { s3: 0, s2: 0, noble: 0, totalScore: currentScore };
    }
    let diff = targetScore - currentScore;
    let s3Part = diff * (12 / 25);
    let s2Part = diff * (1 / 25);
    let n3 = Math.round(s3Part / 12.5);
    let n2 = Math.round(s2Part / 5);

    // Optimization to reduce items if possible (consistent with existing logic)
    let currentCover = (n3 * 12.5) + (n2 * 5);
    let remainder = diff - currentCover;
    let nn = Math.ceil(remainder);
    if (nn < 0) nn = 0;
    if ((n3 * 12.5) + (n2 * 5) + nn < diff) {
        nn = Math.ceil(diff - ((n3 * 12.5) + (n2 * 5)));
    }
    return {
        s3: n3, s2: n2, noble: nn,
        totalScore: currentScore + (n3 * 12.5) + (n2 * 5) + nn
    };
}

window.showResultTab = function (containerId, tabName) {
    const bestDiv = document.getElementById(`${containerId}-best`);
    const top10Div = document.getElementById(`${containerId}-top10`);
    if (bestDiv) bestDiv.style.display = 'none';
    if (top10Div) top10Div.style.display = 'none';

    const tabs = document.querySelectorAll(`#${containerId}-tabs .sub-tab`);
    tabs.forEach(t => t.classList.remove('active'));

    const targetDiv = document.getElementById(`${containerId}-${tabName}`);
    if (targetDiv) targetDiv.style.display = 'block';

    const activeTab = document.querySelector(`#${containerId}-tabs .sub-tab[onclick*="'${tabName}'"]`);
    if (activeTab) activeTab.classList.add('active');
}

function generate2x3HTML(containerId, combo, finalScore, items) {
    let itemsHTML = '';
    // Normalize items object structure (remove totalScore or keep it, doesn't matter)
    // The items object usually has { s3, s2, noble }
    if (items && (items.s3 > 0 || items.s2 > 0 || items.noble > 0)) {
        itemsHTML = `
        <div style="margin-top:10px; padding-top:10px; border-top:1px dashed #444; font-size:0.9rem; text-align:center;">
            <div>推奨共通秘伝数・加算値</div>
            <div style="color:var(--accent-color); font-weight:bold; margin-top:5px;">
                共通秘伝Ⅲ：${items.s3}個, 共通秘伝Ⅱ：${items.s2}個, ノーブル秘伝：${items.noble}
            </div>
        </div>`;
    }

    const captureId = `capture-${containerId}`; // Unique capture ID based on container
    // Note: If we use this for best result, it works.

    return `
        <div id="${captureId}" class="result-card-2x3">
            <div class="result-header">
                ${combo.child != null ? `<div style="margin-bottom:5px; font-size:0.9rem; color:#ccc; display:flex; align-items:center; justify-content:center; gap:6px;">
                    <span>育成モンスター:</span>
                    <img src="images/${MONSTER_NAMES[combo.child]}.png" style="width:24px; height:24px; border-radius:4px; vertical-align:middle;">
                    <span>${MONSTER_NAMES[combo.child]}</span>
                </div>` : ''}
                ${getSymbol(finalScore)} <span style="font-size:1.2rem; margin-left:10px; font-weight:bold;">${finalScore.toFixed(1)}</span>
            </div>
            
            <div class="result-parents-grid">
                <div class="parent-label">父親側</div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[combo.f]}.png" onerror="this.src=''"><div>父<br>${MONSTER_NAMES[combo.f]}</div></div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[combo.ff]}.png" onerror="this.src=''"><div>祖父<br>${MONSTER_NAMES[combo.ff]}</div></div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[combo.fm]}.png" onerror="this.src=''"><div>祖母<br>${MONSTER_NAMES[combo.fm]}</div></div>
            </div>
            
            <div class="result-parents-grid">
                <div class="parent-label">母親側</div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[combo.m]}.png" onerror="this.src=''"><div>母<br>${MONSTER_NAMES[combo.m]}</div></div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[combo.mf]}.png" onerror="this.src=''"><div>祖父<br>${MONSTER_NAMES[combo.mf]}</div></div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[combo.mm]}.png" onerror="this.src=''"><div>祖母<br>${MONSTER_NAMES[combo.mm]}</div></div>
            </div>
            
            ${itemsHTML}
        </div>
        <div style="text-align:right; margin-top:10px; display:flex; justify-content:flex-end; gap:10px;">
            <button class="mini-action-btn" 
                onclick='applyToTyrant(${JSON.stringify(combo)}, ${JSON.stringify(items || {})})'>
                タイラントツールへ適用
            </button>
            <button class="save-img-btn" style="margin-top:0;" onclick="saveAsImage('${captureId}', '${containerId}_result')">📷 画像を保存</button>
        </div>
    `;
}

function renderTabbedResults(containerId, topCombos, targetScore) {
    const container = document.getElementById(containerId);

    // Process Top 10
    const processed = topCombos.map(c => {
        const itemRes = calculateItemsForScore(c.rawScore, targetScore);
        // Clean items object for stringify
        const itemsClean = { s3: itemRes.s3, s2: itemRes.s2, noble: itemRes.noble };
        return { ...c, items: itemsClean, finalScore: itemRes.totalScore };
    });

    const best = processed[0];

    // Generate Best HTML
    const bestHTML = generate2x3HTML(containerId + '-best-card', best, best.finalScore, best.items);

    // Generate Top 10 List HTML
    const listHTML = processed.map((p, idx) => {
        // Reuse generate2x3HTML logic for consistency (Icon Style)
        // Add #Rank label wrapper
        const cardHTML = generate2x3HTML(`top10-${idx}`, p, p.finalScore, p.items);

        return `<div style="position:relative;">
            <div style="position:absolute; top:5px; left:5px; font-weight:bold; color:#888; z-index:10;">#${idx + 1}</div>
            ${cardHTML}
        </div>`;
    }).join('');

    container.innerHTML = `
        <div id="${containerId}-tabs" class="sub-tabs">
            <div class="sub-tab active" onclick="showResultTab('${containerId}', 'best')">最適となる組合せ</div>
            <div class="sub-tab" onclick="showResultTab('${containerId}', 'top10')">上位10件の組合せ</div>
        </div>
        <div id="${containerId}-best">${bestHTML}</div>
        <div id="${containerId}-top10" style="display:none;">${listHTML}</div>
    `;
}

// --- General Search Rendering ---
function renderGeneralTabbedResults(containerId, topCombos, targetVal) {
    const container = document.getElementById(containerId);

    // Apply button for General Search (No items)
    // p is the result object
    const getApplyBtn = (p) => {
        // Construct dummy items
        const dummyItems = { s3: 0, s2: 0, noble: 0 };
        return `<button class="mini-action-btn" onclick='applyToTyrant(${JSON.stringify(p)}, ${JSON.stringify(dummyItems)})'>
                 タイラントツールへ適用
                </button>`;
    };

    // Helper to generate a card HTML (Icon Style)
    const generateCard = (p, isBest, suppressButton = false) => {
        // Determine layout based on result (Grandparents vs Matching)
        // General Search result structure: { f, m, gps: [id, id, id, id], val }

        // Normalize
        let fId = p.f;
        let mId = p.m;
        let gps = p.gps || [];
        let ffId = gps[0]; let fmId = gps[1];
        let mfId = gps[2]; let mmId = gps[3];

        let targetText = "";
        const score = p.val !== undefined ? p.val : (p.score !== undefined ? p.score : 0);

        if (searchTargetMode === 'all') {
            targetText = isBest ? `条件達成 ${score}体 (目標 ${targetVal}〜)` : `条件達成 ${score}体`;
        } else {
            targetText = isBest ? `推奨系統 (最低保証 ${score.toFixed(1)})` : `最低保証 ${score.toFixed(1)}`;
        }

        // Use reuse generate2x3HTML style manually since generate2x3HTML expects flat combo object
        // We will construct the HTML directly to ensure it matches the user's desire for icons

        let btnHTML = '';
        if (!suppressButton) {
            btnHTML = `
             <div style="text-align:center;">
                  ${getApplyBtn(p)}
             </div>`;
        }

        return `
        <div class="result-card-2x3" style="margin-bottom:10px; border:1px solid #444; padding:10px;">
             <div class="result-header" style="border-bottom:none; padding-bottom:5px; margin-bottom:5px;">
                ${targetText}
             </div>
             
             <div class="result-parents-grid">
                <div class="parent-label">父親側</div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[fId]}.png" onerror="this.src=''"><div>父<br>${MONSTER_NAMES[fId]}</div></div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[ffId]}.png" onerror="this.src=''"><div>祖父<br>${MONSTER_NAMES[ffId]}</div></div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[fmId]}.png" onerror="this.src=''"><div>祖母<br>${MONSTER_NAMES[fmId]}</div></div>
            </div>
            
            <div class="result-parents-grid">
                <div class="parent-label">母親側</div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[mId]}.png" onerror="this.src=''"><div>母<br>${MONSTER_NAMES[mId]}</div></div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[mfId]}.png" onerror="this.src=''"><div>祖父<br>${MONSTER_NAMES[mfId]}</div></div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[mmId]}.png" onerror="this.src=''"><div>祖母<br>${MONSTER_NAMES[mmId]}</div></div>
            </div>
             
             ${btnHTML}
        </div>`;
    };

    const best = topCombos[0];
    const bestHTML = generateCard(best, true, true); // true = suppress internal button

    const listHTML = topCombos.map((p, i) => {
        return `<div style="position:relative;">
            <div style="position:absolute; top:5px; left:5px; font-weight:bold; color:#888; z-index:10;">#${i + 1}</div>
            ${generateCard(p, false, false)}
        </div>`;
    }).join('');

    // Add "Best" Tab content wrapper
    // Reuse capture container style for the Best tab so it can be saved as image
    const bestTabContent = `
        <div id="${containerId}-capture" style="padding:10px; background:#121212;">
            ${bestHTML}
            <div style="margin-top:20px; font-size:0.9rem; color:#aaa; text-align:center;">
                全モンスター相性一覧
            </div>
             <div class="result-grid" id="${containerId}-best-grid">
                <!-- Injected Logic for Grid -->
             </div>
        </div>
        <div style="text-align:right; margin-top:10px; display:flex; justify-content:flex-end; gap:10px;">
             ${getApplyBtn(best)}
             <button class="save-img-btn" style="margin-top:0;" onclick="saveAsImage('${containerId}-capture', 'general_search_best')">📷 画像を保存</button>
        </div>
    `;

    // Fix for Tab Layout Bug: Clear any existing grid classes on container
    container.className = '';

    container.innerHTML = `
        <div id="${containerId}-tabs" class="sub-tabs">
            <div class="sub-tab active" onclick="showResultTab('${containerId}', 'best')">最適となる組合せ</div>
            <div class="sub-tab" onclick="showResultTab('${containerId}', 'top10')">上位10件の組合せ</div>
        </div>
        <div id="${containerId}-best">${bestTabContent}</div>
        <div id="${containerId}-top10" style="display:none;">${listHTML}</div>
    `;

    // Populate Best Grid (Async to avoid blocking?)
    setTimeout(() => {
        const gridContainer = document.getElementById(`${containerId}-best-grid`);
        if (gridContainer) {
            // Re-calculate list for Best
            // Logic differs for Matching vs Grandparents? 
            // We can unify calculateScore usage.
            // p = best
            const f = best.f; const m = best.m;
            const gps = best.gps || [];

            const list = [];
            for (let c = 0; c < MONSTER_NAMES.length; c++) {
                // calculateScore(child, f, ff, fm, m, mf, mm, ...)
                let s = calculateScore(c, f, gps[0], gps[1], m, gps[2], gps[3], 0, 0, 0);
                list.push({ name: MONSTER_NAMES[c], score: s, id: c });
            }
            // Sort
            list.sort((a, b) => b.score - a.score);

            gridContainer.innerHTML = list.map(item => {
                let highlightClass = '';
                if (searchTargetMode === 'designated' && targetBloodlines.has(item.id)) highlightClass = 'designated-highlight';
                else if (searchTargetMode === 'all' && item.score >= targetVal) highlightClass = 'designated-highlight';

                return `
                    <div class="result-card ${highlightClass}">
                        <img src="images/${item.name}.png" onerror="this.src=''">
                        <div>${item.name}</div>
                        <div class="result-score">${item.score.toFixed(1)}</div>
                        <div class="result-symbol">${getSymbol(item.score)}</div>
                    </div>
                 `;
            }).join('');
        }
    }, 10);
}

// --- Data / Patching System ---

let ORIGINAL_MATRIX = null;
let patchData = {}; // Key: "childIdx-parentIdx", Value: diff (number)
let isPatchActive = true;
let isOverlayVisible = false;
let currentEditTarget = null; // {c, p}

function initPatchSystem() {
    // 1. Capture Original
    if (typeof structuredClone === 'function') {
        ORIGINAL_MATRIX = structuredClone(COMPATIBILITY_MATRIX);
    } else {
        // Fallback for older browsers
        ORIGINAL_MATRIX = JSON.parse(JSON.stringify(COMPATIBILITY_MATRIX));
    }

    // 2. Load Data
    const savedPatch = localStorage.getItem('mf_sim_patch_data');
    if (savedPatch) {
        try { patchData = JSON.parse(savedPatch); } catch (e) { console.error(e); }
    }

    const savedOverlay = localStorage.getItem('mf_sim_overlay_visible');
    if (savedOverlay) {
        isOverlayVisible = (savedOverlay === 'true');
    }

    // 3. Apply Patch
    // Default Active on load? Yes "Auto load last applied..." implies active.
    applyPatchToMatrix();

    // 4. Update UI
    document.getElementById('overlay-toggle').checked = isOverlayVisible;
    updateOverlayUI();
    renderMatrix();

    // Init state
    currentDataTab = 'matrix';
}

let currentDataTab = 'matrix'; // 'matrix' or 'noble'

function applyPatchToMatrix() {
    // Reset to Original
    for (let i = 0; i < MONSTER_NAMES.length; i++) {
        for (let j = 0; j < MONSTER_NAMES.length; j++) {
            COMPATIBILITY_MATRIX[i][j] = ORIGINAL_MATRIX[i][j];
        }
    }

    const body = document.body;
    const statusText = document.getElementById('patch-status-text');
    const toggleBtn = document.getElementById('patch-toggle-btn');

    if (isPatchActive) {
        // Apply Diffs
        for (let key in patchData) {
            const [c, p] = key.split('-').map(Number);
            const diff = patchData[key];
            if (!Number.isNaN(c) && !Number.isNaN(p)) {
                COMPATIBILITY_MATRIX[c][p] += diff;
            }
        }
        body.classList.add('patch-active');
        if (statusText) statusText.innerText = "パッチ適用中";
        if (statusText) statusText.style.color = "var(--accent-color)";
        if (toggleBtn) toggleBtn.classList.add('on');
    } else {
        body.classList.remove('patch-active');
        if (statusText) statusText.innerText = "パッチOFF";
        if (statusText) statusText.style.color = "#aaa";
        if (toggleBtn) toggleBtn.classList.remove('on');
    }

    // Update Matrix View if visible?
    // Optimization: only if data tab is active? 
    // Just render it.
    const matrixTable = document.getElementById('matrix-table');
    if (matrixTable && matrixTable.offsetParent !== null) {
        renderMatrix();
    }
}

function togglePatchActive() {
    isPatchActive = !isPatchActive;
    applyPatchToMatrix();
}

function toggleOverlaySetting() {
    const cb = document.getElementById('overlay-toggle');
    isOverlayVisible = cb.checked;
    localStorage.setItem('mf_sim_overlay_visible', isOverlayVisible);
    updateOverlayUI();
}

function updateOverlayUI() {
    const overlay = document.getElementById('patch-overlay');
    if (isOverlayVisible) {
        overlay.style.display = 'flex';
    } else {
        overlay.style.display = 'none';
    }
}

function renderMatrix() {
    const table = document.getElementById('matrix-table');
    if (!table) return;

    // Header
    let html = '<thead><tr><th class="corner">子\\親</th>';
    MONSTER_NAMES.forEach(name => {
        html += `<th><img src="images/${name}.png" style="width:20px;"></th>`;
    });
    html += '</tr></thead><tbody>';

    // Body
    MONSTER_NAMES.forEach((childName, cIdx) => {
        html += `<tr>`;
        // Row Header
        html += `<th class="row-header"><img src="images/${childName}.png" style="width:20px;"></th>`;

        MONSTER_NAMES.forEach((parentName, pIdx) => {
            const currentVal = COMPATIBILITY_MATRIX[cIdx][pIdx];
            const originalVal = ORIGINAL_MATRIX[cIdx][pIdx];
            const diff = currentVal - originalVal;

            // Diff display
            let diffHTML = '';
            // Only show diff if patch is active AND there is a diff
            if (isPatchActive && diff !== 0) {
                const sign = diff > 0 ? '+' : '';
                const cls = diff < 0 ? 'neg' : '';
                diffHTML = `<span class="diff-val ${cls}">(${sign}${diff})</span>`;
            } else if (patchData[`${cIdx}-${pIdx}`] && !isPatchActive) {
                // Show that a patch exists but inactive? (Optional)
                // User asked: "view change amount... (0) -> +n"
                // Let's stick to current active value state.
            }

            // Cell color?
            // User requested: "視覚的にわかりやすく" (visually clear)
            // Maybe colorize based on value?
            // High value = Gold/Yellow?
            let bgStyle = '';
            if (currentVal >= 30) bgStyle = 'background:rgba(255,215,0, 0.1);';
            if (currentVal >= 35) bgStyle = 'background:rgba(255,215,0, 0.2);';
            if (currentVal < 20) bgStyle = 'background:rgba(255,0,0, 0.1);';

            html += `<td class="matrix-cell" style="${bgStyle}" onclick="openEditModal(${cIdx}, ${pIdx})">
                ${currentVal}
                ${diffHTML}
            </td>`;
        });
        html += `</tr>`;
    });
    html += '</tbody>';
    table.innerHTML = html;
}

// --- Edit Logic ---

function openEditModal(c, p) {
    currentEditTarget = { c, p };
    const currentVal = COMPATIBILITY_MATRIX[c][p];

    document.getElementById('edit-target-label').innerText = `${MONSTER_NAMES[c]} (子) × ${MONSTER_NAMES[p]} (親)`;
    document.getElementById('edit-child-img').src = `images/${MONSTER_NAMES[c]}.png`;
    document.getElementById('edit-parent-img').src = `images/${MONSTER_NAMES[p]}.png`;

    document.getElementById('edit-val-input').value = currentVal;

    document.getElementById('edit-value-modal').classList.add('open');
}

function closeEditModal() {
    document.getElementById('edit-value-modal').classList.remove('open');
    currentEditTarget = null;
}

function confirmEditValue() {
    if (!currentEditTarget) return;
    const { c, p } = currentEditTarget;
    const inputVal = Number(document.getElementById('edit-val-input').value);

    // Calculate Diff relative to ORIGINAL
    const originalVal = ORIGINAL_MATRIX[c][p];
    const diff = inputVal - originalVal;

    const key = `${c}-${p}`;
    if (diff === 0) {
        delete patchData[key];
    } else {
        patchData[key] = diff;
    }

    // Save
    localStorage.setItem('mf_sim_patch_data', JSON.stringify(patchData));

    // Apply (If patch mode is inactive, should we activate it? probably yes to see result)
    if (!isPatchActive) {
        isPatchActive = true;
        togglePatchActive(); // This calls apply
    } else {
        applyPatchToMatrix();
    }

    closeEditModal();
}

function resetEditValue() {
    if (!currentEditTarget) return;
    const { c, p } = currentEditTarget;
    document.getElementById('edit-val-input').value = ORIGINAL_MATRIX[c][p];
}

function resetPatch() {
    if (currentDataTab === 'noble') {
        if (!confirm("ノーブル秘伝のデータをリセットし、初期値に戻しますか？")) return;
        resetNobleData();
    } else {
        if (!confirm("現在のパッチを全てリセットし、元の数値に戻しますか？")) return;
        patchData = {};
        localStorage.removeItem('mf_sim_patch_data');
        applyPatchToMatrix();
    }
}

// --- Export / Import ---

function exportPatch() {
    if (currentDataTab === 'noble') {
        exportNobleData();
        return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(patchData));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "mf_sim_patch.json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function triggerImport() {
    // handled by label wrapping or onclick delegation in HTML, 
    // but here we just ensure input is clicked (handled by CSS positioning in button usually)
    // In HTML I put input inside button.
}

function importPatch(inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (typeof imported === 'object') {
                if (currentDataTab === 'noble') {
                    // Import Noble
                    currentNobleData = imported;
                    localStorage.setItem('mf_sim_noble_data', JSON.stringify(currentNobleData));
                    renderNobleTable();

                    // Also update main slider if in star mode
                    const s = document.getElementById('noble');
                    if (nobleMode === 'star') onNobleInput(s.value);

                    alert("ノーブル秘伝データを読み込みました");
                } else {
                    // Import Patch
                    patchData = imported;
                    localStorage.setItem('mf_sim_patch_data', JSON.stringify(patchData));
                    applyPatchToMatrix();
                    alert("パッチを読み込みました");
                }
            }
        } catch (err) {
            console.error(err);
            alert("読み込みエラー: " + err.message);
        }
    };
    reader.readAsText(file);
    inputElement.value = ''; // Reset
}

// --- Slider Helper ---
function adjustSlider(id, delta) {
    const input = document.getElementById(id);
    if (!input) return;

    let val = Number(input.value);
    let step = Number(input.step) || 1;
    let min = Number(input.min);
    let max = Number(input.max);

    let newVal = val + (delta * step);

    if (newVal < min) newVal = min;
    if (newVal > max) newVal = max;

    input.value = newVal;

    // Trigger input event
    input.dispatchEvent(new Event('input'));
}

// --- Noble Data & Logic ---
let nobleMode = 'val'; // 'val' or 'star'
let currentNobleData = {};

function initNobleData() {
    // Clone Default
    if (typeof structuredClone === 'function') {
        currentNobleData = structuredClone(DEFAULT_NOBLE_DATA);
    } else {
        currentNobleData = JSON.parse(JSON.stringify(DEFAULT_NOBLE_DATA));
    }

    // Load Override
    const saved = localStorage.getItem('mf_sim_noble_data');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // Merge into current (to keep keys if any new ones added, though keys are fixed 1-36)
            for (let k in parsed) {
                currentNobleData[k] = parsed[k];
            }
        } catch (e) { console.error(e); }
    }

    // UI Init (Ensure correct mode)
    // Default to 'star' as requested
    toggleNobleMode('star');
}

function toggleNobleMode(mode) {
    const prevMode = nobleMode;
    nobleMode = mode;

    const slider = document.getElementById('noble');
    const prevVal = Number(slider.value);

    document.getElementById('nb-mode-star').classList.toggle('active', mode === 'star');
    document.getElementById('nb-mode-val').classList.toggle('active', mode === 'val');

    if (mode === 'star') {
        slider.max = 36;
        slider.step = 1;

        // Switch Logic: 123 -> Star
        // Find closest start
        let closestStar = 0;
        let minDiff = 9999;

        // Loop 1-36
        for (let i = 1; i <= 36; i++) {
            const starVal = currentNobleData[i] || 0;
            const diff = Math.abs(starVal - prevVal);
            if (diff < minDiff) {
                minDiff = diff;
                closestStar = i;
            }
        }

        // If prevVal is 0, keep 0
        if (prevVal === 0) closestStar = 0;

        slider.value = closestStar;

        // Markers Update
        document.getElementById('noble-markers').innerHTML = `
            <span class="marker-label" style="left: 0%">0</span>
            <span class="marker-label" style="left: 50%">18</span>
            <span class="marker-label" style="left: 100%">36</span>
        `;
    } else {
        // Switching TO '123' (val) mode FROM 'star' mode
        let targetVal = prevVal; // default if not star

        if (prevMode === 'star') {
            if (prevVal === 0) targetVal = 0;
            else targetVal = currentNobleData[prevVal] || 0;
        }

        slider.max = 300;
        slider.step = 0.5;
        slider.value = targetVal;

        document.getElementById('noble-markers').innerHTML = `
            <span class="marker-label" style="left: 0%">0</span>
            <span class="marker-label" style="left: 50%">150</span>
            <span class="marker-label" style="left: 100%">300</span>
        `;
    }

    onNobleInput(slider.value);
}

function onNobleInput(val) {
    val = Number(val);
    const labelMain = document.getElementById('noble-label-text');
    const disp = document.getElementById('noble-val');

    if (nobleMode === 'star') {
        labelMain.innerText = "ノーブル星数";
        if (val === 0) {
            disp.innerText = "★0 (0)";
        } else {
            const addedVal = currentNobleData[val] || 0;
            disp.innerText = `★${val} (${addedVal})`;
        }
    } else {
        labelMain.innerText = "ノーブル加算値";
        disp.innerText = val;
    }
}

// Data Tab Switching
// Data Tab Switching
function switchDataTab(tab) {
    currentDataTab = tab;
    document.getElementById('dt-tab-matrix').classList.toggle('active', tab === 'matrix');
    document.getElementById('dt-tab-noble').classList.toggle('active', tab === 'noble');

    document.getElementById('data-view-matrix').style.display = (tab === 'matrix' ? 'block' : 'none');
    document.getElementById('data-view-noble').style.display = (tab === 'noble' ? 'block' : 'none');

    // Toggle Overlay Settings visibility (Separate container)
    // IMPORTANT: relies on #patch-config-container being present in index.html

    // We want to hide the CONFIG area (Label + Checkbox), but keep the BUTTONS area visible
    const patchConfig = document.getElementById('patch-config-container');
    const matrixButtons = document.getElementById('matrix-ops-container');
    const nobleButtons = document.getElementById('noble-ops-container');

    if (patchConfig) patchConfig.style.display = (tab === 'noble') ? 'none' : 'block';
    if (matrixButtons) matrixButtons.style.display = (tab === 'noble') ? 'none' : 'flex';
    if (nobleButtons) nobleButtons.style.display = (tab === 'noble') ? 'flex' : 'none';

    if (tab === 'noble') {
        renderNobleTable();
    }
}

function renderNobleTable() {
    const tableDiv = document.getElementById('data-view-noble');
    // Generate Div Grid 6 columns
    // We replace the innerHTML directly, no table element needed if we just use grid

    let html = `
        <div style="
            display: grid; 
            grid-template-columns: repeat(6, 1fr); 
            gap: 5px; 
            margin-bottom: 20px;
        ">
    `;

    for (let i = 1; i <= 36; i++) {
        const val = currentNobleData[i] || 0;
        html += `
            <div style="
                background: #2a2a2a; 
                padding: 5px; 
                border-radius: 4px; 
                text-align: center;
                border: 1px solid #444;
            ">
                <div style="font-size:0.7rem; color:var(--accent-color); margin-bottom:2px;">★${i}</div>
                <input type="number" step="0.5" value="${val}" 
                    style="
                        width:100%; 
                        text-align:center; 
                        background:#111; 
                        color:#fff; 
                        border:1px solid #555; 
                        padding:2px;
                        font-size:0.8rem;
                    "
                    onchange="updateNobleData(${i}, this.value)">
            </div>
        `;
    }
    html += `</div>`;

    // Add specific Noble Buttons here if not in main layout? 
    // User asked for "Reset/Export/Import" to disappear/appear based on tab.
    // I will handle that via 'noble-ops-container' in HTML, but can inject buttons here if easier.
    // Plan: Use HTML containers toggle.

    tableDiv.innerHTML = html;
}

function updateNobleData(star, val) {
    currentNobleData[star] = Number(val);
    localStorage.setItem('mf_sim_noble_data', JSON.stringify(currentNobleData));

    // Update live view if needed (if currently in star mode and selecting this star)
    const slider = document.getElementById('noble');
    if (nobleMode === 'star' && Number(slider.value) === star) {
        onNobleInput(slider.value);
    }
}

function resetNobleData() {
    if (typeof structuredClone === 'function') {
        currentNobleData = structuredClone(DEFAULT_NOBLE_DATA);
    } else {
        currentNobleData = JSON.parse(JSON.stringify(DEFAULT_NOBLE_DATA));
    }
    localStorage.removeItem('mf_sim_noble_data');
    renderNobleTable();
    alert("ノーブル秘伝データを初期値に戻しました");
}

function exportNobleData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentNobleData));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "mf_noble_data.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}
