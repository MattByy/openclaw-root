// Minimum years of data an asset must have to appear in the long-term (Table 3) correlation table.
// Assets below this threshold get an N/A column instead of being silently excluded or
// truncating the whole matrix. Adjust as needed.
const MIN_YEARS_FOR_TABLE_3 = 7;
function calculateCorrelationMatrix() {
    const start = new Date();
    Logger.log('🔗 Starting correlation calculation...');

    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const returnsSheet = ss.getSheetByName('Returns of Import');
        const corrSheet = ss.getSheetByName('Correlation Matrix');
        const ipsSheet = ss.getSheetByName('IPS');

        if (!returnsSheet) { SpreadsheetApp.getUi().alert('❌ Returns of Import sheet not found!'); return; }
        if (!corrSheet) { SpreadsheetApp.getUi().alert('❌ Correlation Matrix sheet not found!'); return; }
        if (!ipsSheet) { SpreadsheetApp.getUi().alert('❌ IPS sheet not found!'); return; }

        const endDate = corrSheet.getRange('B4').getValue();
        const startDate = corrSheet.getRange('B3').getValue();
        const months = corrSheet.getRange('B5').getValue() || '';
        if (!endDate) { SpreadsheetApp.getUi().alert('❌ Please enter End Date in B4'); return; }
        if (!startDate) { SpreadsheetApp.getUi().alert('❌ Please enter Start Date in B3'); return; }

        const returnsData = returnsSheet.getDataRange().getValues();
        const returnsHeaders = returnsData[0];

        const allDates = [];
        for (let row = 1; row < returnsData.length; row++) {
            if (returnsData[row][0]) allDates.push(new Date(returnsData[row][0]));
        }
        allDates.sort((a, b) => a - b);

        // ── Read IPS portfolio 1 tickers ─────────────────────────
        const ipsTickers = ipsSheet.getRange('I5:I14').getValues().flat()
            .filter(t => t && t.toString().trim())
            .map(t => t.toString().trim().toUpperCase());

        if (ipsTickers.length === 0) {
            SpreadsheetApp.getUi().alert('❌ No tickers found in IPS I5:I14!');
            return;
        }

        // ── Match each IPS ticker to its exact column in Returns sheet ──
        const assetCols = {};
        const assets = [];
        const missing = [];

        ipsTickers.forEach(ticker => {
            let found = false;
            for (let i = 1; i < returnsHeaders.length; i++) {
                const header = returnsHeaders[i] ? returnsHeaders[i].toString().trim().toUpperCase() : '';
                if (header === ticker) {
                    assetCols[ticker] = i;
                    assets.push(ticker);
                    found = true;
                    Logger.log('✅ ' + ticker + ' → Returns column index ' + i);
                    break;
                }
            }
            if (!found) {
                missing.push(ticker);
                Logger.log('❌ ' + ticker + ' NOT found in Returns of Import');
            }
        });

        if (assets.length === 0) {
            SpreadsheetApp.getUi().alert('❌ None of the IPS tickers found in Returns of Import!\n\nMissing: ' + missing.join(', '));
            return;
        }
        if (missing.length > 0) {
            SpreadsheetApp.getUi().alert('⚠️ Some tickers not found:\n' + missing.join(', ') + '\n\nContinuing with: ' + assets.join(', '));
        }

        const numAssets = Math.min(assets.length, 10);

        // ── Clear everything before writing ──────────────────────
        corrSheet.getRange(6, 1, 300, 30).clearContent().clearFormat();

        // ── Dynamic row layout ────────────────────────────────────
        const t1Title = 6;
        const t1Header = t1Title + 1;
        const t1Data = t1Header + 1;
        const t1Ret = t1Data + numAssets + 1;
        const t1Vol = t1Ret + 1;

        const t2Title = t1Vol + 3;
        const t2Header = t2Title + 1;
        const t2Data = t2Header + 1;
        const t2Ret = t2Data + numAssets + 1;
        const t2Vol = t2Ret + 1;

        const t3Title = t2Vol + 3;
        const t3Header = t3Title + 1;
        const t3Data = t3Header + 1;
        const t3Ret = t3Data + numAssets + 1;
        const t3Vol = t3Ret + 1;

        const t4Title = t3Vol + 3;
        const t4Header = t4Title + 1;
        const t4Data = t4Header + 1;
        const t4Ret = t4Data + numAssets + 1;
        const t4Vol = t4Ret + 1;

        // ── Write weight input cells O3/P3/Q3/R3 ─────────────────
        const weightLabels = [
            ['O2', 'Short-term weight'],
            ['P2', '5yr weight'],
            ['Q2', '10yr weight'],
            ['R2', 'Forward-looking weight'],
        ];
        weightLabels.forEach(([cell, label]) => {
            corrSheet.getRange(cell)
                .setValue(label)
                .setFontStyle('italic')
                .setFontColor('#555555')
                .setFontSize(9)
                .setHorizontalAlignment('center');
        });

        ['O3', 'P3', 'Q3', 'R3'].forEach(cell => {
            corrSheet.getRange(cell)
                .setBackground('#fff2cc')
                .setBorder(true, true, true, true, false, false, '#f1c232', SpreadsheetApp.BorderStyle.SOLID_MEDIUM)
                .setFontWeight('bold')
                .setNumberFormat('0%')
                .setHorizontalAlignment('center');
        });

        // ── Calculate Tables 1, 2, 3 ─────────────────────────────
        const t1Name = 'Correlation table — ' + months + ' months';
        calculateAndWriteCorrelationTable(
            corrSheet, returnsData, assets, assetCols, numAssets,
            startDate, endDate, t1Title, t1Header, t1Data, t1Ret, t1Vol, t1Name, 0
        );

        const target2 = new Date(endDate);
        target2.setFullYear(target2.getFullYear() - 5);
        const startDate2 = findNearestTradingDay(target2, allDates);
        calculateAndWriteCorrelationTable(
            corrSheet, returnsData, assets, assetCols, numAssets,
            startDate2, endDate, t2Title, t2Header, t2Data, t2Ret, t2Vol, 'Correlation table — 5 years', 0
        );

        const target3 = new Date(endDate);
        target3.setFullYear(target3.getFullYear() - 10);
        const startDate3 = findNearestTradingDay(target3, allDates);
        calculateAndWriteCorrelationTable(
            corrSheet, returnsData, assets, assetCols, numAssets,
            startDate3, endDate, t3Title, t3Header, t3Data, t3Ret, t3Vol, 'Correlation table — 10 years', MIN_YEARS_FOR_TABLE_3
        );

        // ── Draw Table 4 template (forward-looking, user fills in) ─
        // Title
        corrSheet.getRange(t4Title, 2, 1, numAssets)
            .merge()
            .setValue('Correlation table — forward-looking assumptions (fill in manually)')
            .setBackground('#f1c232')
            .setFontWeight('bold')
            .setHorizontalAlignment('center');

        // Header row
        corrSheet.getRange(t4Header, 2, 1, numAssets)
            .setValues([assets])
            .setBackground('#4a86e8').setFontColor('#ffffff')
            .setFontWeight('bold').setHorizontalAlignment('center');

        // Row labels and placeholder cells
        corrSheet.getRange(t4Data, 1, numAssets, 1)
            .setValues(assets.map(n => [n]));

        // Placeholder cells for correlations (light grey, editable)
        for (let i = 0; i < numAssets; i++) {
            for (let j = 0; j < numAssets; j++) {
                const cell = corrSheet.getRange(t4Data + i, 2 + j);
                if (i === j) {
                    cell.setValue(1).setNumberFormat('0.0000')
                        .setBackground('#d9ead3').setFontWeight('bold');
                } else {
                    cell.setValue('')
                        .setBackground('#efefef')
                        .setNumberFormat('0.0000')
                        .setNote('Enter your forward-looking correlation assumption here');
                }
            }
        }

        // Ann. Return and Volatility placeholder rows
        corrSheet.getRange(t4Ret, 1).setValue('Ann. Return').setFontWeight('bold');
        corrSheet.getRange(t4Vol, 1).setValue('Ann. Volatility').setFontWeight('bold');
        for (let i = 0; i < numAssets; i++) {
            corrSheet.getRange(t4Ret, 2 + i)
                .setBackground('#efefef').setNumberFormat('0.00%')
                .setNote('Enter your forward-looking annual return assumption here');
            corrSheet.getRange(t4Vol, 2 + i)
                .setBackground('#efefef').setNumberFormat('0.00%')
                .setNote('Enter your forward-looking annual volatility assumption here');
        }

        corrSheet.autoResizeColumns(1, numAssets + 5);

        const elapsed = ((new Date() - start) / 1000).toFixed(1);
        SpreadsheetApp.getUi().alert(
            '✅ Correlation matrices calculated!\n\n' +
            'Assets (' + numAssets + '): ' + assets.join(', ') + '\n\n' +
            'Table 1 (' + months + ' months): ' + new Date(startDate).toLocaleDateString() + ' → ' + new Date(endDate).toLocaleDateString() + '\n' +
            'Table 2 (5yr): ' + startDate2.toLocaleDateString() + ' → ' + new Date(endDate).toLocaleDateString() + '\n' +
            'Table 3 (10yr): ' + startDate3.toLocaleDateString() + ' → ' + new Date(endDate).toLocaleDateString() + '\n' +
            'Table 4: Forward-looking template drawn — fill in manually\n\n' +
            '👉 Enter weights in O3 (short), P3 (5yr), Q3 (10yr), R3 (forward)\n' +
            '   then run "Calculate Combined Correlation Table"\n\n' +
            'Time: ' + elapsed + 's'
        );

    } catch (error) {
        Logger.log('Error: ' + error);
        SpreadsheetApp.getUi().alert('❌ Error: ' + error.toString());
    }
}

// ============================================================
// FUNCTION 2: CALCULATE COMBINED TABLE
// Always written to fixed position: col U (labels) + col V
// onwards (data), starting at row 6 — aligned with Table 1.
// This gives the optimizer a stable address to read from.
//
// Fixed layout constants:
//   Row 6          : title
//   Row 7          : ticker headers  (col V onwards)
//   Row 8          : data start      (col V onwards)
//   Row 8+n+1      : Ann. Return     (col V onwards)
//   Row 8+n+2      : Ann. Volatility (col V onwards)
//   Col U (21)     : row labels
//   Col V (22)     : data starts
// ============================================================
function calculateWeightedAverageTables() {
    try {
        const corrSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Correlation Matrix');
        if (!corrSheet) { SpreadsheetApp.getUi().alert('❌ Correlation Matrix sheet not found!'); return; }

        // ── Read weights from O3/P3/Q3/R3 ────────────────────────
        let w1 = parseFloat(corrSheet.getRange('O3').getValue()) || 0;
        let w2 = parseFloat(corrSheet.getRange('P3').getValue()) || 0;
        let w3 = parseFloat(corrSheet.getRange('Q3').getValue()) || 0;
        let w4 = parseFloat(corrSheet.getRange('R3').getValue()) || 0;

        if (w1 + w2 + w3 + w4 > 1.5) { w1 /= 100; w2 /= 100; w3 /= 100; w4 /= 100; }

        const sum = w1 + w2 + w3 + w4;
        if (Math.abs(sum - 1.0) > 0.001) {
            SpreadsheetApp.getUi().alert(
                '❌ Weights in O3/P3/Q3/R3 must sum to 100%!\n\n' +
                'Current sum: ' + (sum * 100).toFixed(1) + '%\n\n' +
                'O3 (short-term): ' + (w1 * 100).toFixed(1) + '%\n' +
                'P3 (5yr): ' + (w2 * 100).toFixed(1) + '%\n' +
                'Q3 (10yr): ' + (w3 * 100).toFixed(1) + '%\n' +
                'R3 (forward-looking): ' + (w4 * 100).toFixed(1) + '%'
            );
            return;
        }

        // ── Detect numAssets from t1Header (always row 7, col B=2) ──
        const tickerRow = corrSheet.getRange(7, 2, 1, 10).getValues()[0];
        let numAssets = 0;
        for (let i = 0; i < tickerRow.length; i++) {
            if (tickerRow[i] !== '' && tickerRow[i] !== null && tickerRow[i] !== undefined) numAssets++;
            else break;
        }
        if (numAssets === 0) {
            SpreadsheetApp.getUi().alert('❌ No assets found!\n\nRun "Calculate Correlations" first.');
            return;
        }

        // ── Reconstruct dynamic layout to find source row positions ──
        // Each table now has an extra "Obs. / window" row after Ann. Volatility,
        // so the gap between tables is: volRow + 1 (obs row) + 2 blank = volRow + 3 = next title.
        // The +3 spacing in calculateCorrelationMatrix already absorbs this correctly.
        const t1Data = 8;
        const t1Ret = t1Data + numAssets + 1;
        const t1Vol = t1Ret + 1;

        const _t2Title = t1Vol + 3;
        const _t2Header = _t2Title + 1;
        const _t2Data = _t2Header + 1;
        const _t2Ret = _t2Data + numAssets + 1;
        const _t2Vol = _t2Ret + 1;

        const _t3Title = _t2Vol + 3;
        const _t3Header = _t3Title + 1;
        const _t3Data = _t3Header + 1;
        const _t3Ret = _t3Data + numAssets + 1;
        const _t3Vol = _t3Ret + 1;

        const _t4Title = _t3Vol + 3;
        const _t4Header = _t4Title + 1;
        const _t4Data = _t4Header + 1;
        const _t4Ret = _t4Data + numAssets + 1;
        const _t4Vol = _t4Ret + 1;

        // ── Fixed output position for combined table ──────────────
        const LABEL_COL = 21;  // U
        const DATA_COL = 22;  // V
        const T5_TITLE = 6;
        const T5_HEADER = 7;
        const T5_DATA = 8;
        const T5_RET = T5_DATA + numAssets + 1;
        const T5_VOL = T5_RET + 1;

        // ── Read source grids ─────────────────────────────────────
        function readGrid(startRow) {
            return corrSheet.getRange(startRow, 2, numAssets, numAssets).getValues();
        }
        function readVec(row) {
            return corrSheet.getRange(row, 2, 1, numAssets).getValues()[0];
        }

        const corr1 = readGrid(t1Data);
        const corr2 = readGrid(_t2Data);
        const corr3 = readGrid(_t3Data);
        const corr4 = readGrid(_t4Data);

        const ret1 = readVec(t1Ret); const vol1 = readVec(t1Vol);
        const ret2 = readVec(_t2Ret); const vol2 = readVec(_t2Vol);
        const ret3 = readVec(_t3Ret); const vol3 = readVec(_t3Vol);
        const ret4 = readVec(_t4Ret); const vol4 = readVec(_t4Vol);

        // ── Check Table 4 ─────────────────────────────────────────
        let table4Empty = true;
        outer: for (let i = 0; i < numAssets; i++)
            for (let j = 0; j < numAssets; j++) {
                if (i === j) continue;
                const v = parseFloat(corr4[i][j]);
                if (!isNaN(v) && v !== 0) { table4Empty = false; break outer; }
            }

        if (table4Empty && w4 > 0) {
            SpreadsheetApp.getUi().alert(
                '❌ Table 4 (forward-looking) is empty but R3 weight is ' +
                (w4 * 100).toFixed(1) + '%.\n\nFill in Table 4 or set R3 to 0%.');
            return;
        }
        if (table4Empty && w4 === 0) {
            const histSum = w1 + w2 + w3;
            if (histSum > 0) { w1 /= histSum; w2 /= histSum; w3 /= histSum; }
        }

        // ── blendCells helper ─────────────────────────────────────
        // For each matrix cell, only blend tables that have a real numeric value.
        // Tables with 'N/A' or blank (short-history assets in Table 3) are skipped,
        // and the remaining weights are renormalised to sum to 1.
        // If NO table has a numeric value for this cell, returns 'N/A'.
        // This prevents the old bug where N/A was silently treated as 0,
        // which pulled correlations toward zero for short-history assets.
        function blendCells(values, weights) {
            const pairs = values
                .map((v, i) => ({ v: parseFloat(v), w: weights[i] }))
                .filter(p => !isNaN(p.v));
            if (pairs.length === 0) return 'N/A';
            const wSum = pairs.reduce((s, p) => s + p.w, 0);
            if (wSum === 0) return pairs.reduce((s, p) => s + p.v, 0) / pairs.length;
            return pairs.reduce((s, p) => s + (p.w / wSum) * p.v, 0);
        }

        const weights = [w1, w2, w3, w4];

        // ── Build weighted average matrices ───────────────────────
        const wCorr = [];
        for (let i = 0; i < numAssets; i++) {
            const row = [];
            for (let j = 0; j < numAssets; j++) {
                if (i === j) {
                    row.push(1); // diagonal always 1
                } else {
                    row.push(blendCells(
                        [corr1[i][j], corr2[i][j], corr3[i][j], corr4[i][j]],
                        weights
                    ));
                }
            }
            wCorr.push(row);
        }

        const wRet = [], wVol = [];
        for (let i = 0; i < numAssets; i++) {
            wRet.push(blendCells([ret1[i], ret2[i], ret3[i], ret4[i]], weights));
            wVol.push(blendCells([vol1[i], vol2[i], vol3[i], vol4[i]], weights));
        }

        // ── Nearest PSD correction on the numeric portion ─────────
        // Build a numeric-only submatrix from qualifying assets (those without N/A).
        // Run nearestPSD on that submatrix, then write results back into wCorr.
        // Assets with N/A cells are left as N/A — they cannot be corrected without data.
        const qualifyingIdx = [];
        for (let i = 0; i < numAssets; i++) {
            if (wCorr[i].every(v => v !== 'N/A')) qualifyingIdx.push(i);
        }

        let minEigBefore = 'n/a', minEigAfter = 'n/a', psdApplied = false;

        if (qualifyingIdx.length >= 2) {
            // Extract numeric submatrix
            const sub = qualifyingIdx.map(i => qualifyingIdx.map(j => wCorr[i][j]));

            // Check minimum eigenvalue before correction
            const { values: eigsBefore } = jacobiEigen(sub.map(r => [...r]), qualifyingIdx.length);
            minEigBefore = Math.min(...eigsBefore);

            if (minEigBefore < 0) {
                // Matrix is not PSD — apply correction
                const subCleaned = nearestPSD(sub);
                qualifyingIdx.forEach((gi, li) => {
                    qualifyingIdx.forEach((gj, lj) => {
                        wCorr[gi][gj] = subCleaned[li][lj];
                    });
                });
                const { values: eigsAfter } = jacobiEigen(subCleaned.map(r => [...r]), qualifyingIdx.length);
                minEigAfter = Math.min(...eigsAfter);
                psdApplied = true;
            } else {
                minEigAfter = minEigBefore; // already valid
            }
        }

        const assets = corrSheet.getRange(7, 2, 1, numAssets).getValues()[0];

        // ── Clear fixed output zone ───────────────────────────────
        corrSheet.getRange(T5_TITLE, LABEL_COL, T5_VOL - T5_TITLE + 5, numAssets + 2)
            .clearContent().clearFormat();

        // ── Title ─────────────────────────────────────────────────
        const titleNote = psdApplied ? ' [PSD corrected]' : '';
        corrSheet.getRange(T5_TITLE, LABEL_COL, 1, numAssets + 1)
            .merge()
            .setValue('Correlation table — combined (weighted average)' + titleNote)
            .setBackground(psdApplied ? '#1a4480' : '#1a4480')
            .setFontColor('#ffffff')
            .setFontWeight('bold')
            .setHorizontalAlignment('center');

        if (psdApplied) {
            corrSheet.getRange(T5_TITLE, LABEL_COL)
                .setNote('Nearest PSD correction applied.\nMin eigenvalue before: ' +
                    minEigBefore.toFixed(6) + '\nMin eigenvalue after: ' + minEigAfter.toFixed(6));
        }

        // ── Ticker headers ────────────────────────────────────────
        corrSheet.getRange(T5_HEADER, DATA_COL, 1, numAssets)
            .setValues([assets])
            .setBackground('#4a86e8').setFontColor('#ffffff')
            .setFontWeight('bold').setHorizontalAlignment('center');

        // ── Row labels ────────────────────────────────────────────
        corrSheet.getRange(T5_DATA, LABEL_COL, numAssets, 1)
            .setValues(assets.map(n => [n]));

        // ── Correlation data + heatmap — cell by cell ─────────────
        // Must be cell-by-cell because N/A strings and numbers
        // cannot be batch-written into the same range.
        for (let i = 0; i < numAssets; i++) {
            for (let j = 0; j < numAssets; j++) {
                const cell = corrSheet.getRange(T5_DATA + i, DATA_COL + j);
                const v = wCorr[i][j];

                if (v === 'N/A') {
                    cell.setValue('N/A')
                        .setBackground('#e0e0e0')
                        .setFontColor('#888888')
                        .setFontStyle('italic')
                        .setHorizontalAlignment('center')
                        .setNote('No data available across any weighted table for this asset pair.');
                    continue;
                }

                cell.setValue(v).setNumberFormat('0.0000');
                if (i === j) { cell.setBackground('#d9ead3').setFontWeight('bold'); }
                else if (v >= 0.7) { cell.setBackground('#93c47d'); }
                else if (v >= 0.4) { cell.setBackground('#b6d7a8'); }
                else if (v >= 0.1) { cell.setBackground('#d9ead3'); }
                else if (v >= -0.1) { cell.setBackground('#ffffff'); }
                else if (v >= -0.4) { cell.setBackground('#f4cccc'); }
                else if (v >= -0.7) { cell.setBackground('#ea9999'); }
                else { cell.setBackground('#e06666').setFontColor('#ffffff'); }
            }
        }

        // ── Ann. Return and Ann. Volatility — cell by cell ────────
        corrSheet.getRange(T5_RET, LABEL_COL).setValue('Ann. Return').setFontWeight('bold');
        corrSheet.getRange(T5_VOL, LABEL_COL).setValue('Ann. Volatility').setFontWeight('bold');

        for (let i = 0; i < numAssets; i++) {
            const rCell = corrSheet.getRange(T5_RET, DATA_COL + i);
            const vCell = corrSheet.getRange(T5_VOL, DATA_COL + i);

            if (wRet[i] === 'N/A') {
                rCell.setValue('N/A').setBackground('#e0e0e0')
                    .setFontColor('#888888').setFontStyle('italic').setHorizontalAlignment('center');
            } else {
                rCell.setValue(wRet[i]).setNumberFormat('0.00%');
            }

            if (wVol[i] === 'N/A') {
                vCell.setValue('N/A').setBackground('#e0e0e0')
                    .setFontColor('#888888').setFontStyle('italic').setHorizontalAlignment('center');
            } else {
                vCell.setValue(wVol[i]).setNumberFormat('0.00%');
            }
        }

        // ── Weight summary string for alert ──────────────────────
        const wStr = table4Empty
            ? (w1 * 100).toFixed(1) + '% + ' + (w2 * 100).toFixed(1) + '% + ' + (w3 * 100).toFixed(1) + '% (T4 excluded)'
            : (w1 * 100).toFixed(1) + '% + ' + (w2 * 100).toFixed(1) + '% + ' + (w3 * 100).toFixed(1) + '% + ' + (w4 * 100).toFixed(1) + '%';

        const naAssets = assets.filter((_, i) => wRet[i] === 'N/A');
        const naNote = naAssets.length > 0
            ? '\n⚠ N/A assets (no data across all tables): ' + naAssets.join(', ')
            : '\n✅ All assets have data in at least one table';

        const psdNote = psdApplied
            ? '\n🔧 PSD correction applied — min eigenvalue: ' +
            minEigBefore.toFixed(4) + ' → ' + minEigAfter.toFixed(4)
            : '\n✅ Matrix already positive semi-definite (min λ = ' +
            (typeof minEigBefore === 'number' ? minEigBefore.toFixed(4) : 'n/a') + ')';

        SpreadsheetApp.getUi().alert(
            '✅ Combined Table written to column U/V!\n\n' +
            'Weights: ' + wStr + '\n' +
            naNote + '\n' +
            psdNote + '\n\n' +
            'Asset names : row 7,  cols V–' + String.fromCharCode(86 + numAssets - 1) + '\n' +
            'Correlations: rows 8–' + (8 + numAssets - 1) + ', cols V–' + String.fromCharCode(86 + numAssets - 1) + '\n' +
            'Ann. Return : row ' + T5_RET + '\n' +
            'Ann. Vol    : row ' + T5_VOL + '\n\n' +
            '✅ Ready for optimization!'
        );

    } catch (error) {
        Logger.log('Error: ' + error);
        SpreadsheetApp.getUi().alert('❌ Error: ' + error.toString());
    }
}
function toDateStr(d) {
    const dt = (d instanceof Date) ? d : new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
}

function calculateAndWriteCorrelationTable(corrSheet, returnsData, assets, assetCols, numAssets,
    startDate, endDate, titleRow, headerRow, dataStartRow, returnsRow, volRow, tableName, minYearsRequired) {

    // minYearsRequired = 0  → synchronous mode: all assets use the common latest-start window
    // minYearsRequired > 0  → pairwise mode:    assets below threshold get N/A columns;
    //                                            qualifying pairs use their own date overlap

    minYearsRequired = minYearsRequired || 0;

    const startStr = toDateStr(startDate);
    const endStr = toDateStr(endDate);
    const nominalYears = (new Date(endDate) - new Date(startDate)) / (365.25 * 24 * 3600 * 1000);

    if (nominalYears <= 0) { Logger.log('WARNING ' + tableName + ': invalid date range'); return; }

    const names = assets.slice(0, numAssets);

    // ── Step 1: build date → return maps, one per asset ───────────
    const dateMaps = {};
    names.forEach(a => { dateMaps[a] = {}; });

    for (let row = 1; row < returnsData.length; row++) {
        const rawDate = returnsData[row][0];
        if (!rawDate) continue;
        const dStr = toDateStr(rawDate);
        if (dStr < startStr || dStr > endStr) continue;
        names.forEach(a => {
            const colIdx = assetCols[a];
            if (colIdx === undefined) return;
            const r = parseFloat(returnsData[row][colIdx]);
            if (!isNaN(r)) dateMaps[a][dStr] = r;
        });
    }

    // ── Step 2: measure each asset's available history ────────────
    const assetInfo = {};
    names.forEach(a => {
        const dates = Object.keys(dateMaps[a]).sort();
        const years = dates.length > 1
            ? (new Date(dates[dates.length - 1]) - new Date(dates[0])) / (365.25 * 24 * 3600 * 1000)
            : 0;
        assetInfo[a] = { dates, years, firstDate: dates[0] || null };
    });

    // ── Step 3: determine qualifying vs excluded assets ───────────
    let qualifies, excluded;

    if (minYearsRequired > 0) {
        // Pairwise mode: exclude assets below the history threshold
        qualifies = names.filter(a => assetInfo[a].years >= minYearsRequired);
        excluded = names.filter(a => assetInfo[a].years < minYearsRequired);
    } else {
        // Synchronous mode: all assets, but window floored to the latest start
        qualifies = names;
        excluded = [];

        const latestStart = names.reduce((max, a) =>
            (assetInfo[a].firstDate && assetInfo[a].firstDate > max) ? assetInfo[a].firstDate : max,
            startStr
        );

        // Trim dateMaps to the synchronous window and rebuild assetInfo
        names.forEach(a => {
            Object.keys(dateMaps[a]).forEach(d => { if (d < latestStart) delete dateMaps[a][d]; });
            const dates = Object.keys(dateMaps[a]).sort();
            assetInfo[a].dates = dates;
            assetInfo[a].firstDate = dates[0] || null;
            assetInfo[a].years = dates.length > 1
                ? (new Date(dates[dates.length - 1]) - new Date(dates[0])) / (365.25 * 24 * 3600 * 1000)
                : 0;
        });
    }

    // ── Step 4: pre-build shared date array for synchronous mode ──
    let sharedDatesAll = [], sharedN_sync = 0;
    if (minYearsRequired === 0) {
        const all = new Set();
        names.forEach(a => Object.keys(dateMaps[a]).forEach(d => all.add(d)));
        sharedDatesAll = [...all].sort().filter(d => names.every(a => dateMaps[a][d] !== undefined));
        sharedN_sync = sharedDatesAll.length;
    }

    // ── Step 5: title and headers ─────────────────────────────────
    let windowNote = '';
    if (minYearsRequired > 0 && excluded.length > 0) {
        windowNote = ' — excluded (<' + minYearsRequired + 'yr): ' + excluded.join(', ');
    } else if (minYearsRequired === 0) {
        const shortened = names.filter(a => assetInfo[a].firstDate && assetInfo[a].firstDate > startStr);
        if (shortened.length > 0)
            windowNote = ' ⚠ window limited to ' + assetInfo[shortened[0]].firstDate + ' by: ' + shortened.join(', ');
    }

    const titleBg = excluded.length > 0 ? '#f4cccc'
        : windowNote.includes('⚠') ? '#ffe0b2'
            : '#f1c232';

    corrSheet.getRange(titleRow, 2, 1, numAssets)
        .merge()
        .setValue(tableName + windowNote)
        .setBackground(titleBg)
        .setFontWeight('bold')
        .setHorizontalAlignment('center');

    corrSheet.getRange(headerRow, 2, 1, numAssets)
        .setValues([names])
        .setBackground('#4a86e8').setFontColor('#ffffff')
        .setFontWeight('bold').setHorizontalAlignment('center');
    corrSheet.getRange(dataStartRow, 1, numAssets, 1)
        .setValues(names.map(n => [n]));

    // ── Step 6: compute correlation and n matrices ────────────────
    const corrMat = [], nMat = [];

    for (let i = 0; i < numAssets; i++) {
        corrMat.push([]); nMat.push([]);
        for (let j = 0; j < numAssets; j++) {
            const ai = names[i], aj = names[j];
            const iOk = qualifies.includes(ai);
            const jOk = qualifies.includes(aj);

            if (!iOk || !jOk) {
                // At least one asset excluded — mark entire row/col as N/A
                corrMat[i].push('N/A'); nMat[i].push(0);

            } else if (minYearsRequired === 0) {
                // Synchronous: every pair uses the same sharedDatesAll
                const x = sharedDatesAll.map(d => dateMaps[ai][d]);
                const y = sharedDatesAll.map(d => dateMaps[aj][d]);
                corrMat[i].push(x.length > 1 ? calculateCorrelation(x, y) : '');
                nMat[i].push(sharedN_sync);

            } else {
                // Pairwise: intersect dates for this specific pair
                const pairDates = assetInfo[ai].dates.filter(d => dateMaps[aj][d] !== undefined);
                const x = pairDates.map(d => dateMaps[ai][d]);
                const y = pairDates.map(d => dateMaps[aj][d]);
                corrMat[i].push(x.length > 1 ? calculateCorrelation(x, y) : '');
                nMat[i].push(pairDates.length);
            }
        }
    }

    // ── Step 7: write correlation matrix with heatmap ─────────────
    // Cell-by-cell because N/A strings and numbers can't be batch-written together
    for (let i = 0; i < numAssets; i++) {
        for (let j = 0; j < numAssets; j++) {
            const cell = corrSheet.getRange(dataStartRow + i, 2 + j);
            const v = corrMat[i][j];

            if (v === 'N/A') {
                const excl = !qualifies.includes(names[i]) ? names[i] : names[j];
                const yrs = assetInfo[excl].years.toFixed(1);
                cell.setValue('N/A')
                    .setBackground('#e0e0e0').setFontColor('#888888')
                    .setFontStyle('italic').setHorizontalAlignment('center')
                    .setNote('Excluded: ' + excl + ' has only ' + yrs + 'yr of data (min ' + minYearsRequired + 'yr required)');
            } else if (v !== '' && !isNaN(v)) {
                cell.setValue(v).setNumberFormat('0.0000');
                if (minYearsRequired > 0 && i !== j)
                    cell.setNote('n = ' + nMat[i][j] + ' shared dates\n' +
                        assetInfo[names[i]].firstDate + ' to ' + assetInfo[names[j]].dates.slice(-1)[0]);
                if (i === j) { cell.setBackground('#d9ead3').setFontWeight('bold'); }
                else if (v >= 0.7) { cell.setBackground('#93c47d'); }
                else if (v >= 0.4) { cell.setBackground('#b6d7a8'); }
                else if (v >= 0.1) { cell.setBackground('#d9ead3'); }
                else if (v >= -0.1) { cell.setBackground('#ffffff'); }
                else if (v >= -0.4) { cell.setBackground('#f4cccc'); }
                else if (v >= -0.7) { cell.setBackground('#ea9999'); }
                else { cell.setBackground('#e06666').setFontColor('#ffffff'); }
            }
        }
    }

    // ── Step 8: p-value matrix ────────────────────────────────────
    const pMat = [];
    for (let i = 0; i < numAssets; i++) {
        pMat.push([]);
        for (let j = 0; j < numAssets; j++) {
            const c = corrMat[i][j], n = nMat[i][j];
            pMat[i].push((c === 'N/A' || c === '' || isNaN(c)) ? 'N/A' : calculatePValue(c, n));
        }
    }

    const pCol = numAssets + 3;
    const nLabel = minYearsRequired > 0 ? 'P-Values → (pairwise n, see notes)' : 'P-Values → n=' + sharedN_sync;
    corrSheet.getRange(headerRow, pCol).setValue(nLabel).setFontWeight('bold');
    corrSheet.getRange(headerRow, pCol + 1, 1, numAssets)
        .setValues([names])
        .setBackground('#4a86e8').setFontColor('#ffffff')
        .setFontWeight('bold').setHorizontalAlignment('center');
    corrSheet.getRange(dataStartRow, pCol, numAssets, 1).setValues(names.map(n => [n]));

    for (let i = 0; i < numAssets; i++) {
        for (let j = 0; j < numAssets; j++) {
            const cell = corrSheet.getRange(dataStartRow + i, pCol + 1 + j);
            const p = pMat[i][j];
            if (p === 'N/A') {
                cell.setValue('N/A').setBackground('#e0e0e0')
                    .setFontColor('#888888').setFontStyle('italic').setHorizontalAlignment('center');
            } else if (p !== '' && !isNaN(p)) {
                cell.setNumberFormat('0.00000');
                cell.setValue(p < 0.00001 ? 0 : p);
                if (minYearsRequired > 0 && i !== j) cell.setNote('n = ' + nMat[i][j]);
                if (i === j) { cell.setBackground('#cccccc').setValue('N/A'); }
                else if (p < 0.001) { cell.setBackground('#93c47d'); }
                else if (p < 0.01) { cell.setBackground('#b6d7a8'); }
                else if (p < 0.05) { cell.setBackground('#d9ead3'); }
                else { cell.setBackground('#f4cccc'); }
            }
        }
    }

    // ── Step 9: annualised return and volatility ──────────────────
    // Each asset uses its own actual available dates within the window,
    // and annualises over its own actual elapsed years — not the nominal window.
    corrSheet.getRange(returnsRow, 1).setValue('Ann. Return').setFontWeight('bold');
    corrSheet.getRange(volRow, 1).setValue('Ann. Volatility').setFontWeight('bold');

    for (let i = 0; i < numAssets; i++) {
        const a = names[i];
        const retCell = corrSheet.getRange(returnsRow, 2 + i);
        const volCell = corrSheet.getRange(volRow, 2 + i);

        if (!qualifies.includes(a)) {
            retCell.setValue('N/A').setBackground('#e0e0e0').setFontColor('#888888').setFontStyle('italic').setHorizontalAlignment('center');
            volCell.setValue('N/A').setBackground('#e0e0e0').setFontColor('#888888').setFontStyle('italic').setHorizontalAlignment('center');
            continue;
        }

        const r = assetInfo[a].dates.map(d => dateMaps[a][d]);
        if (r.length > 1) {
            let geo = 1;
            r.forEach(v => { geo *= (1 + v); });
            retCell.setValue(Math.pow(geo, 1 / assetInfo[a].years) - 1).setNumberFormat('0.00%');
            const mean = r.reduce((s, v) => s + v, 0) / r.length;
            const variance = r.reduce((s, v) => s + (v - mean) ** 2, 0) / r.length;
            volCell.setValue(Math.sqrt(variance) * Math.sqrt(252)).setNumberFormat('0.00%');
        } else {
            retCell.setValue(''); volCell.setValue('');
        }
    }

    // ── Step 10: observation count row ───────────────────────────
    corrSheet.getRange(volRow + 1, 1)
        .setValue('Obs. / window').setFontStyle('italic').setFontColor('#555555');
    if (minYearsRequired === 0 && sharedDatesAll.length > 0) {
        corrSheet.getRange(volRow + 1, 2).setValue(sharedN_sync).setFontStyle('italic').setFontColor('#555555');
        corrSheet.getRange(volRow + 1, 3)
            .setValue(sharedDatesAll[0] + ' → ' + sharedDatesAll[sharedDatesAll.length - 1])
            .setFontStyle('italic').setFontColor('#555555');
    } else {
        corrSheet.getRange(volRow + 1, 2)
            .setValue('pairwise — see cell notes for each pair\'s n')
            .setFontStyle('italic').setFontColor('#555555');
    }

    Logger.log(tableName + ': mode=' + (minYearsRequired > 0 ? 'pairwise' : 'sync') +
        ' | qualifies=[' + qualifies.join(',') + ']' +
        (excluded.length > 0 ? ' | excluded=[' + excluded.join(',') + ']' : '') +
        (minYearsRequired === 0 ? ' | sharedN=' + sharedN_sync : ''));
}
function findNearestTradingDay(target, dates) {
    let nearest = dates[0], minDiff = Math.abs(target - dates[0]);
    for (let i = 0; i < dates.length; i++) {
        const diff = Math.abs(target - dates[i]);
        if (diff < minDiff) { minDiff = diff; nearest = dates[i]; }
        if (dates[i] > target) {
            if (i > 0)
                nearest = Math.abs(target - dates[i - 1]) < Math.abs(target - dates[i]) ? dates[i - 1] : dates[i];
            break;
        }
    }
    return nearest;
}

function calculateCorrelation(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 2) return '';
    let sumX = 0, sumY = 0;
    for (let i = 0; i < n; i++) { sumX += x[i]; sumY += y[i]; }
    const meanX = sumX / n, meanY = sumY / n;
    let num = 0, sqX = 0, sqY = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - meanX, dy = y[i] - meanY;
        num += dx * dy; sqX += dx * dx; sqY += dy * dy;
    }
    const denom = Math.sqrt(sqX * sqY);
    return denom === 0 ? '' : num / denom;
}

function calculatePValue(r, n) {
    if (n < 3 || Math.abs(r) >= 1) return '';
    const t = r * Math.sqrt(n - 2) / Math.sqrt(1 - r * r);
    return 2 * (1 - tDistCDF(Math.abs(t), n - 2));
}

function tDistCDF(t, df) {
    if (df < 1) return 0.5;
    if (df > 30) return normalCDF(t);
    const x = df / (df + t * t);
    const a = df / 2, b = 0.5;
    let sum = 0;
    for (let i = 0; i < 100; i++) {
        const term = Math.pow(x, a + i) * Math.pow(1 - x, b) / (a + i);
        sum += term / betaFunction(a + i, b);
        if (Math.abs(term) < 1e-10) break;
    }
    return 1 - sum;
}

function normalCDF(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
}

function betaFunction(a, b) {
    return gammaFunction(a) * gammaFunction(b) / gammaFunction(a + b);
}

function gammaFunction(n) {
    if (n < 1) return Infinity;
    if (n === 1 || n === 2) return 1;
    return Math.sqrt(2 * Math.PI / n) * Math.pow(n / Math.E, n);
}
function nearestPSD(matrix) {
    const n = matrix.length;

    // Symmetrise first to guard against tiny float asymmetries
    const C = [];
    for (let i = 0; i < n; i++) {
        C.push([]);
        for (let j = 0; j < n; j++) {
            C[i].push((matrix[i][j] + matrix[j][i]) / 2);
        }
    }

    // Eigendecompose
    const { values, vectors } = jacobiEigen(C, n);

    // Floor negative eigenvalues to a small positive number
    const floored = values.map(v => Math.max(v, 1e-8));

    // Reconstruct: C* = Q * Λ* * Qᵀ
    const Cstar = [];
    for (let i = 0; i < n; i++) {
        Cstar.push(new Array(n).fill(0));
        for (let j = 0; j < n; j++) {
            let sum = 0;
            for (let k = 0; k < n; k++) {
                sum += vectors[i][k] * floored[k] * vectors[j][k];
            }
            Cstar[i][j] = sum;
        }
    }

    // Renormalise diagonal back to 1
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push([]);
        for (let j = 0; j < n; j++) {
            const denom = Math.sqrt(Cstar[i][i] * Cstar[j][j]);
            out[i].push(denom > 0 ? Cstar[i][j] / denom : (i === j ? 1 : 0));
        }
    }

    return out;
}

function jacobiEigen(A, n) {
    // Copy A so the original is not mutated
    const S = A.map(row => [...row]);

    // Initialise eigenvector matrix as identity
    const V = [];
    for (let i = 0; i < n; i++) {
        V.push(new Array(n).fill(0));
        V[i][i] = 1;
    }

    const MAX_ITER = 1000;

    for (let iter = 0; iter < MAX_ITER; iter++) {
        // Find the largest off-diagonal element
        let maxVal = 0, p = 0, q = 1;
        for (let i = 0; i < n - 1; i++) {
            for (let j = i + 1; j < n; j++) {
                if (Math.abs(S[i][j]) > maxVal) {
                    maxVal = Math.abs(S[i][j]); p = i; q = j;
                }
            }
        }

        // Converged when largest off-diagonal is negligible
        if (maxVal < 1e-12) break;

        // Compute Jacobi rotation angle
        const theta = (S[q][q] - S[p][p]) / (2 * S[p][q]);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(1 + theta * theta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;

        // Apply rotation to S
        const Spp = S[p][p], Sqq = S[q][q], Spq = S[p][q];
        S[p][p] = Spp - t * Spq;
        S[q][q] = Sqq + t * Spq;
        S[p][q] = 0;
        S[q][p] = 0;

        for (let i = 0; i < n; i++) {
            if (i !== p && i !== q) {
                const Sip = S[i][p], Siq = S[i][q];
                S[i][p] = S[p][i] = c * Sip - s * Siq;
                S[i][q] = S[q][i] = s * Sip + c * Siq;
            }
            // Accumulate eigenvectors
            const Vip = V[i][p], Viq = V[i][q];
            V[i][p] = c * Vip - s * Viq;
            V[i][q] = s * Vip + c * Viq;
        }
    }

    // Diagonal of S now contains the eigenvalues
    const values = [];
    for (let i = 0; i < n; i++) values.push(S[i][i]);

    return { values, vectors: V };
}


