// Lecture d'un fichier .xlsx cote navigateur (SheetJS) pour l'assistant
// "Ajouter un backtest". Colonnes A/B/C strictes par POSITION (pas par nom
// d'en-tete) : date, resultat, RR. Les colonnes suivantes sont facultatives
// et detectees par nom d'en-tete (tolerant FR/EN), dans l'ordre choisi par
// l'utilisateur - necessite donc une ligne d'en-tete pour etre reconnues.
(() => {
  'use strict';

  const OPTIONAL_HEADERS = {
    open: ['ouverture', 'open', 'heure ouverture', 'open time', 'heure d\'ouverture'],
    close: ['cloture', 'close', 'heure cloture', 'close time', 'heure de cloture'],
    source: ['source', 'signal', 'source du signal'],
    confirmation: ['confirmation', 'confirmations', 'note', 'notes'],
    order: ['ordre', 'order', 'direction', 'sens', 'buy/sell', 'achat/vente', 'type'],
  };
  // Libelles humains pour l'affichage (colonnes reconnues) - reutilise par
  // backtest-view.html pour les en-tetes du journal.
  const FIELD_LABELS = { open: 'Ouverture', close: 'Clôture', source: 'Source', confirmation: 'Confirmation', order: 'Ordre' };

  const ACCENTS = { à: 'a', â: 'a', ä: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e', î: 'i', ï: 'i', ô: 'o', ö: 'o', ù: 'u', û: 'u', ü: 'u', ç: 'c' };
  function normalize(s) {
    return String(s || '').toLowerCase().trim().split('').map((c) => ACCENTS[c] || c).join('');
  }

  function matchOptionalColumn(header) {
    const n = normalize(header);
    for (const field of Object.keys(OPTIONAL_HEADERS)) {
      if (OPTIONAL_HEADERS[field].some((alias) => normalize(alias) === n)) return field;
    }
    return null;
  }

  function looksLikeDate(v) {
    if (v == null || v === '') return false;
    if (v instanceof Date) return !isNaN(v.getTime());
    if (typeof v === 'number') return v > 20000 && v < 80000; // plage plausible de serial Excel
    const d = new Date(v);
    return !isNaN(d.getTime());
  }

  function excelSerialToDate(n) {
    const epoch = Date.UTC(1899, 11, 30); // epoque Excel (inclut son bug historique du 29/02/1900)
    return new Date(epoch + n * 86400000);
  }

  function toIsoDate(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
    if (typeof v === 'number') return excelSerialToDate(v).toISOString();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  /**
   * Parse un fichier Excel (File) -> { trades, errors, hasHeader, optionalColumnsFound, extraLabels }.
   * optionalColumnsFound : champs reconnus (open/close/source/confirmation/order).
   * extraLabels : libelles des colonnes non reconnues, conservees telles
   * quelles (ex. l'IA les nomme "Facultatif" si elle ne sait pas ou les
   * ranger) - la donnee n'est jamais jetee, juste affichee sous son propre
   * intitule plutot que sous un champ connu du site.
   */
  async function parseXlsxFile(file) {
    if (!window.XLSX) throw new Error('Librairie de lecture Excel non chargée.');
    const buf = await file.arrayBuffer();
    const wb = window.XLSX.read(buf, { type: 'array', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });

    if (!rows.length) return { trades: [], errors: ['Le fichier semble vide.'], hasHeader: false, optionalColumnsFound: [], extraLabels: [] };

    let startIdx = 0;
    let hasHeader = false;
    // colMap[idx] = { field: 'open'|...|null, label: en-tete original }
    const colMap = {};
    if (!looksLikeDate(rows[0][0])) {
      hasHeader = true;
      startIdx = 1;
      rows[0].forEach((h, idx) => {
        if (idx < 3) return; // A/B/C sont fixes, jamais detectees par nom
        const label = String(h || '').trim();
        if (!label) return;
        const field = matchOptionalColumn(label);
        colMap[idx] = { field, label: field ? FIELD_LABELS[field] : label };
      });
    }

    const trades = [];
    const errors = [];
    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c) => c === '' || c == null)) continue;
      const rawDate = row[0], rawResult = row[1], rawRr = row[2];

      const iso = toIsoDate(rawDate);
      if (!iso) { errors.push(`Ligne ${i + 1} : date invalide en colonne A ("${rawDate}").`); continue; }
      if (rawResult === '' || rawResult == null) { errors.push(`Ligne ${i + 1} : résultat manquant en colonne B.`); continue; }
      const rr = Number(rawRr);
      if (isNaN(rr)) { errors.push(`Ligne ${i + 1} : RR invalide en colonne C ("${rawRr}").`); continue; }

      const trade = { date: iso, result: String(rawResult).trim(), rr, extra: {} };
      Object.keys(colMap).forEach((idxStr) => {
        const idx = Number(idxStr);
        const v = row[idx];
        if (v === '' || v == null) return;
        const { field, label } = colMap[idx];
        if (field) {
          trade[field] = (field === 'open' || field === 'close') ? (toIsoDate(v) || String(v)) : String(v);
        } else {
          trade.extra[label] = String(v);
        }
      });
      trades.push(trade);
    }

    const found = Object.values(colMap);
    return {
      trades,
      errors,
      hasHeader,
      optionalColumnsFound: [...new Set(found.filter((c) => c.field).map((c) => c.field))],
      extraLabels: [...new Set(found.filter((c) => !c.field).map((c) => c.label))],
    };
  }

  window.CHESTXlsxImport = { parseXlsxFile, FIELD_LABELS };
})();
