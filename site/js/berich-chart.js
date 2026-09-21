// CHEST · BERICH — exécute le VRAI script Pine "BE FR€E" (pas une recréation)
// via PineTS (transpileur/runtime Pine -> JS, github.com/LuxAlgo/PineTS) et le
// dessine avec Vela (moteur de rendu du même éditeur), sur des données XAU/USD
// réelles (Twelve Data). Scope volontairement limité à XAU/USD pour l'instant.
//
// Le tableau de tendance multi-timeframe (1m/5m/15m/30m/1H/4H/1D/1W) est
// désactivé ci-dessous : purement cosmétique dans le script d'origine (jamais
// lu par la logique wolfBuy/wolfSell), mais ses 8 appels request.security vers
// des timeframes plus courts que la base font largement dépasser 15s de calcul
// — testé en direct, ce n'est pas request.security en général qui est lent,
// seulement les requêtes vers un timeframe plus fin que le graphique.
//
// La vraie détection de trade reste le webhook TradingView (berich-store.js) —
// ce graphique est un rendu visuel fidèle, pas la source de vérité du signal.
(() => {
  'use strict';

  const SYMBOL_TWELVEDATA = 'XAU/USD';
  const SYMBOL_DISPLAY = 'XAUUSD';
  const BASE_INTERVAL = '5'; // 5min — la MA500 tourne alors sur "15" (M15), cf. tfHTF dans le script
  const TWELVEDATA_INTERVAL = '5min';
  const VELA_TIMEFRAME = '5m'; // format attendu par l'option `timeframe` de Vela (ex. "5m") — different du code interne BASE_INTERVAL ('5' seul) ; meme bug/fix que scanner-chart.js (2026-09-14)

  const PINE_SOURCE = `//@version=5
indicator("BE FR€E",
     overlay=true,
     max_boxes_count=500,
     max_lines_count=500,
     max_labels_count=500,
     dynamic_requests=true)

grLBL = "Etiquettes"
grIND = "Indicateur"
grEMA = "EMA"
grVIS = "Visuelle"
grBT  = "Backtesting"

useArrows = input.bool(false, "Remplacer les etiquettes par des fleches", group=grLBL)

showPivots   = input.bool(true, "Pivots HH / LL", group=grIND, inline="pv")
pivotHighCol = input.color(color.new(#00ffa9, 0), "", group=grIND, inline="pv")
pivotLowCol  = input.color(color.new(#00ffa9, 0), "", group=grIND, inline="pv")

showClouds = input.bool(true, "Ruban EMA (Wolf Clouds)", group=grEMA, inline="rb")
ribBullCol = input.color(color.new(#ffffff, 95), "", group=grEMA, inline="rb")
ribBearCol = input.color(color.new(#00ffa9, 95), "", group=grEMA, inline="rb")

showDash    = input.bool(false, "Tableau tendance", group=grVIS, inline="dh")
dashBullCol = input.color(color.white, "", group=grVIS, inline="dh")
dashBearCol = input.color(color.new(#00ffa9, 0), "", group=grVIS, inline="dh")

showLastTrade = input.bool(true, "Affichage des positions", group=grVIS)
tradeMode     = input.string("Derniere position", "Trades affiches", options=["Derniere position", "Positions en cours", "Toutes les positions"], group=grVIS)

showJournal = input.bool(false, "Journal de backtesting", group=grBT)
statDays    = input.int(90, "Periode du tableau (jours)", minval=1, maxval=365, group=grBT)

slBandCol = input.color(color.new(#f23645, 80), "Bande SL", group=grBT, inline="jb")
tpBandCol = input.color(color.new(#0daf4b, 80), "Bande TP", group=grBT, inline="jb")

winTxtCol  = input.color(color.new(#0daf4b, 0), "Resultat TP", group=grBT, inline="jt")
lossTxtCol = input.color(color.new(#f23645, 0), "Resultat SL", group=grBT, inline="jt")

color wlfBuyCol  = color.new(#00d9ff, 0)
color wlfSellCol = color.new(#1e2ceb, 0)
color lblTxtCol  = color.white

int C1_FAST = 34
int C1_SLOW = 50
int C2_FAST = 72
int C2_SLOW = 89

float W_KEY = 15.0
int   W_ATR = 5

float ADX_THRESH  = 15.0
int   ADX_LEN     = 14
int   WOLF_MINGAP = 30

int PS_L = 35
int PS_R = 40

int JR_BUF_TICKS  = 200
int JR_HALF_TICKS = 4000

float RR = 3.0

f_sigLabel(_isBuy, _txt, _col) =>
    if useArrows
        label.new(bar_index, _isBuy ? low : high, _isBuy ? "▲" : "▼",
          style     = label.style_none,
          color     = color.new(color.black, 100),
          textcolor = _col,
          size      = size.huge)
    else
        label.new(bar_index, _isBuy ? low : high, _txt,
          style     = _isBuy ? label.style_label_up : label.style_label_down,
          color     = _col,
          textcolor = lblTxtCol,
          size      = size.small)

f_symbolLabel(_x, _y, _txt, _tc) =>
    label.new(_x, _y, _txt,
      style     = label.style_none,
      color     = color.new(color.black, 100),
      textcolor = _tc,
      size      = size.huge)

var string tfHTF = ""
if timeframe.period == "1"
    tfHTF := "5"
else if timeframe.period == "5"
    tfHTF := "15"
else if timeframe.period == "15"
    tfHTF := "30"
else if timeframe.period == "30"
    tfHTF := "60"
else if timeframe.period == "60"
    tfHTF := "240"
else if timeframe.period == "240"
    tfHTF := "D"
else if timeframe.period == "D"
    tfHTF := "W"

ph_PS = ta.pivothigh(high, PS_L, PS_R)
pl_PS = ta.pivotlow(low,  PS_L, PS_R)

liveHighNow_PS = high >= ta.highest(high[1], PS_L)
liveLowNow_PS  = low  <= ta.lowest(low[1],  PS_L)

var label liveHigh_PS = na
var label liveLow_PS  = na
var float lastLiveHighPrice_PS = na
var float lastLiveLowPrice_PS  = na

if liveHighNow_PS
    if not na(liveHigh_PS)
        label.delete(liveHigh_PS)
    if showPivots
        liveHigh_PS := f_symbolLabel(bar_index, high, "✵", pivotHighCol)
    lastLiveHighPrice_PS := high

if liveLowNow_PS
    if not na(liveLow_PS)
        label.delete(liveLow_PS)
    if showPivots
        liveLow_PS := f_symbolLabel(bar_index, low, "✵", pivotLowCol)
    lastLiveLowPrice_PS := low

if not na(ph_PS)
    if showPivots
        f_symbolLabel(bar_index - PS_R, ph_PS, "✵", pivotHighCol)
    if not na(liveHigh_PS)
        label.delete(liveHigh_PS)
        liveHigh_PS := na

if not na(pl_PS)
    if showPivots
        f_symbolLabel(bar_index - PS_R, pl_PS, "✵", pivotLowCol)
    if not na(liveLow_PS)
        label.delete(liveLow_PS)
        liveLow_PS := na

srcHTF = tfHTF != "" ? request.security(syminfo.tickerid, tfHTF, close, barmerge.gaps_off, barmerge.lookahead_off) : close
ma500  = ta.ema(srcHTF, 500)

c1F = ta.ema(close, C1_FAST)
c1S = ta.ema(close, C1_SLOW)
c2F = ta.ema(close, C2_FAST)
c2S = ta.ema(close, C2_SLOW)

color c1Col = c1F >= c1S ? ribBullCol : ribBearCol
color c2Col = c2F >= c2S ? ribBullCol : ribBearCol

p1F = plot(showClouds ? c1F : na, "Nuage 1 rapide", color=c1Col, linewidth=1)
p1S = plot(showClouds ? c1S : na, "Nuage 1 lente",  color=c1Col, linewidth=1)
fill(p1F, p1S, color=showClouds ? c1Col : na, title="Nuage 1")

p2F = plot(showClouds ? c2F : na, "Nuage 2 rapide", color=c2Col, linewidth=1)
p2S = plot(showClouds ? c2S : na, "Nuage 2 lente",  color=c2Col, linewidth=1)
fill(p2F, p2S, color=showClouds ? c2Col : na, title="Nuage 2")

ribBull = c1F >= c1S and c2F >= c2S
ribBear = c1F <  c1S and c2F <  c2S

var int ribDir = 0
int prevRibDir = ribDir
if ribBull
    ribDir := 1
if ribBear
    ribDir := -1

ribFlipBull = ribDir == 1  and prevRibDir != 1
ribFlipBear = ribDir == -1 and prevRibDir != -1

wATR   = ta.atr(W_ATR)
wNLoss = W_KEY * wATR

var float wStop = na
float wPrev = nz(wStop[1], 0.0)

wStop :=
     (close > wPrev and close[1] > wPrev) ? math.max(wPrev, close - wNLoss) :
     (close < wPrev and close[1] < wPrev) ? math.min(wPrev, close + wNLoss) :
     (close > wPrev) ? (close - wNLoss) : (close + wNLoss)

var int wPos = 0
wPos :=
     (close[1] < wPrev and close > wPrev) ? 1 :
     (close[1] > wPrev and close < wPrev) ? -1 :
     nz(wPos[1], 0)

f_ribTrend() =>
    f1 = ta.ema(close, C1_FAST) >= ta.ema(close, C1_SLOW)
    f2 = ta.ema(close, C2_FAST) >= ta.ema(close, C2_SLOW)
    f1 and f2 ? 1 : (not f1 and not f2) ? -1 : 0

st1m = 0 // desactive (perf, tableau cosmetique)
st5m = 0 // desactive (perf, tableau cosmetique)
st15m = 0 // desactive (perf, tableau cosmetique)
st30m = 0 // desactive (perf, tableau cosmetique)
st1H = 0 // desactive (perf, tableau cosmetique)
st4H = 0 // desactive (perf, tableau cosmetique)
st1D = 0 // desactive (perf, tableau cosmetique)
st1W = 0 // desactive (perf, tableau cosmetique)

trendCellCol(_st) =>
    _st == 1 ? dashBullCol : _st == -1 ? dashBearCol : color.new(color.gray, 40)

var table dashT = table.new(position.top_right, 8, 1, border_width=1, border_color=color.new(color.white, 20))

if barstate.islast and showDash
    table.cell(dashT, 0, 0, "1m",  bgcolor=trendCellCol(st1m),  text_color=color.black, text_size=size.small)
    table.cell(dashT, 1, 0, "5m",  bgcolor=trendCellCol(st5m),  text_color=color.black, text_size=size.small)
    table.cell(dashT, 2, 0, "15m", bgcolor=trendCellCol(st15m), text_color=color.black, text_size=size.small)
    table.cell(dashT, 3, 0, "30m", bgcolor=trendCellCol(st30m), text_color=color.black, text_size=size.small)
    table.cell(dashT, 4, 0, "1H",  bgcolor=trendCellCol(st1H),  text_color=color.black, text_size=size.small)
    table.cell(dashT, 5, 0, "4H",  bgcolor=trendCellCol(st4H),  text_color=color.black, text_size=size.small)
    table.cell(dashT, 6, 0, "1D",  bgcolor=trendCellCol(st1D),  text_color=color.black, text_size=size.small)
    table.cell(dashT, 7, 0, "1W",  bgcolor=trendCellCol(st1W),  text_color=color.black, text_size=size.small)

ma500Bull = not na(ma500) and close > ma500
ma500Bear = not na(ma500) and close < ma500

wolfBuyB  = ribFlipBull and ma500Bull and wPos == 1
wolfSellB = ribFlipBear and ma500Bear and wPos == -1

[diPlus, diMinus, adxVal] = ta.dmi(ADX_LEN, ADX_LEN)
bool adxOk = adxVal >= ADX_THRESH

var int wolfLastSigBar = na
bool wolfGapOk = na(wolfLastSigBar) or (bar_index - wolfLastSigBar >= WOLF_MINGAP)

wolfBuy  = wolfBuyB  and adxOk and wolfGapOk
wolfSell = wolfSellB and adxOk and wolfGapOk

if wolfBuy or wolfSell
    wolfLastSigBar := bar_index

alertcondition(wolfBuy,             "WolfX BUY",  "BE FR€E - WolfX BUY")
alertcondition(wolfSell,            "WolfX SELL", "BE FR€E - WolfX SELL")
alertcondition(wolfBuy or wolfSell, "WolfX BUY/SELL", "BE FR€E - nouveau signal WolfX")

if wolfBuy
    f_sigLabel(true,  "BUY",  wlfBuyCol)
if wolfSell
    f_sigLabel(false, "SELL", wlfSellCol)

atrPos = ta.atr(14)

f_compute_trade(_isBuy, _pivot) =>
    float entry     = close
    float distPiv   = na(_pivot) ? atrPos * 2.0 : math.abs(entry - _pivot)
    distPiv        := distPiv <= syminfo.mintick ? atrPos * 2.0 : distPiv
    float distTicks = syminfo.mintick > 0 ? distPiv / syminfo.mintick : na
    bool  isShortSL = not na(distTicks) and distTicks < JR_HALF_TICKS
    float slDist    = isShortSL ? distPiv : distPiv * 0.5
    float buf       = isShortSL ? JR_BUF_TICKS * syminfo.mintick : 0.0
    float sl        = _isBuy ? entry - slDist - buf : entry + slDist + buf
    float dist      = math.abs(entry - sl)
    float tp        = _isBuy ? entry + dist * RR : entry - dist * RR
    [entry, sl, tp]

f_json_open(_id, _sig, _entry, _sl) =>
    '{"id":"' + _id + '","pair":"' + syminfo.ticker + '","signal":"' + _sig + '","entry":' +
     str.tostring(_entry, "#.#####") + ',"sl":' + str.tostring(_sl, "#.#####") + '}'

f_json_close(_id, _result) =>
    '{"id":"' + _id + '","result":"' + _result + '"}'

var array<int>    tDir   = array.new_int()
var array<int>    tStart = array.new_int()
var array<string> tId    = array.new_string()
var array<float>  tPEv   = array.new_float()
var array<float>  tSLv   = array.new_float()
var array<float>  tTPv   = array.new_float()
var array<float>  tAnch  = array.new_float()
var array<box>    tBSL   = array.new_box()
var array<box>    tBTP   = array.new_box()
var array<label>  tLPE   = array.new_label()
var array<label>  tLSL   = array.new_label()
var array<label>  tLTP   = array.new_label()

var array<int> jRes  = array.new_int()
var array<int> jTime = array.new_int()

var box   fzBSL = na
var box   fzBTP = na
var label fzLPE = na
var label fzLSL = na
var label fzLTP = na

f_delVisuals(_i) =>
    box.delete(tBSL.get(_i))
    box.delete(tBTP.get(_i))
    label.delete(tLPE.get(_i))
    label.delete(tLSL.get(_i))
    label.delete(tLTP.get(_i))
    tBSL.set(_i, box(na))
    tBTP.set(_i, box(na))
    tLPE.set(_i, label(na))
    tLSL.set(_i, label(na))
    tLTP.set(_i, label(na))

f_removeEntry(_i) =>
    tDir.remove(_i)
    tStart.remove(_i)
    tId.remove(_i)
    tPEv.remove(_i)
    tSLv.remove(_i)
    tTPv.remove(_i)
    tAnch.remove(_i)
    tBSL.remove(_i)
    tBTP.remove(_i)
    tLPE.remove(_i)
    tLSL.remove(_i)
    tLTP.remove(_i)

if wolfBuy or wolfSell
    bool isBuy = wolfBuy
    [e, s, t] = f_compute_trade(isBuy, isBuy ? lastLiveLowPrice_PS : lastLiveHighPrice_PS)
    string id = str.tostring(time)
    alert(f_json_open(id, isBuy ? "BUY" : "SELL", e, s), alert.freq_once_per_bar_close)

    if showLastTrade and tradeMode == "Derniere position"
        if tDir.size() > 0
            for i = tDir.size() - 1 to 0
                f_delVisuals(i)
        box.delete(fzBSL)
        box.delete(fzBTP)
        label.delete(fzLPE)
        label.delete(fzLSL)
        label.delete(fzLTP)
        fzBSL := na
        fzBTP := na
        fzLPE := na
        fzLSL := na
        fzLTP := na

    tDir.push(isBuy ? 1 : -1)
    tStart.push(bar_index)
    tId.push(id)
    tPEv.push(e)
    tSLv.push(s)
    tTPv.push(t)
    tAnch.push(high)

    bool drawB = showLastTrade
    tBSL.push(drawB ? box.new(bar_index, math.max(e, s), bar_index, math.min(e, s), border_color=color.new(#f23645, 50), bgcolor=slBandCol) : box(na))
    tBTP.push(drawB ? box.new(bar_index, math.max(e, t), bar_index, math.min(e, t), border_color=color.new(#0daf4b, 60), bgcolor=tpBandCol) : box(na))
    tLPE.push(drawB ? label.new(bar_index + 1, e, "PE " + str.tostring(e, format.mintick), style=label.style_label_left, textcolor=color.white,           color=color.new(color.black, 80), size=size.small) : label(na))
    tLSL.push(drawB ? label.new(bar_index + 1, s, "SL " + str.tostring(s, format.mintick), style=label.style_label_left, textcolor=color.new(#f23645, 0), color=color.new(color.black, 80), size=size.small) : label(na))
    tLTP.push(drawB ? label.new(bar_index + 1, t, "TP " + str.tostring(t, format.mintick), style=label.style_label_left, textcolor=color.new(#0daf4b, 0), color=color.new(color.black, 80), size=size.small) : label(na))

if tDir.size() > 0
    for i = tDir.size() - 1 to 0
        if not na(tBSL.get(i))
            box.set_right(tBSL.get(i), bar_index)
        if not na(tBTP.get(i))
            box.set_right(tBTP.get(i), bar_index)
        if not na(tLPE.get(i))
            label.set_x(tLPE.get(i), bar_index + 1)
        if not na(tLSL.get(i))
            label.set_x(tLSL.get(i), bar_index + 1)
        if not na(tLTP.get(i))
            label.set_x(tLTP.get(i), bar_index + 1)

        bool   closed = false
        string result = ""

        if bar_index > tStart.get(i)
            int   d   = tDir.get(i)
            float sl_ = tSLv.get(i)
            float tp_ = tTPv.get(i)

            if d == 1
                if low <= sl_
                    closed := true
                    result := "SL"
                else if high >= tp_
                    closed := true
                    result := "TP"
            else
                if high >= sl_
                    closed := true
                    result := "SL"
                else if low <= tp_
                    closed := true
                    result := "TP"

        if closed
            alert(f_json_close(tId.get(i), result), alert.freq_once_per_bar_close)

            if showJournal
                bool  win   = result == "TP"
                float pe_   = tPEv.get(i)
                float hit_  = win ? tTPv.get(i) : tSLv.get(i)
                float distP = math.abs(hit_ - pe_)
                string resTxt = result + " " + (win ? "+3R" : "-1R") + " (" + str.tostring(distP, format.mintick) + ")"
                label.new(tStart.get(i), tAnch.get(i), resTxt,
                     style=label.style_label_down,
                     color=color.new(win ? #0daf4b : #f23645, 20),
                     textcolor=color.white, size=size.small)
                jRes.push(win ? 1 : 0)
                jTime.push(time)

            if showLastTrade and tradeMode == "Positions en cours"
                f_delVisuals(i)
            else if showLastTrade and tradeMode == "Derniere position"
                box.delete(fzBSL)
                box.delete(fzBTP)
                label.delete(fzLPE)
                label.delete(fzLSL)
                label.delete(fzLTP)
                fzBSL := tBSL.get(i)
                fzBTP := tBTP.get(i)
                fzLPE := tLPE.get(i)
                fzLSL := tLSL.get(i)
                fzLTP := tLTP.get(i)

            f_removeEntry(i)

var table jTbl = table.new(position.bottom_right, 2, 4, border_width=1, border_color=color.new(color.white, 20))

if barstate.islast and showJournal
    int cutoff = time - statDays * 86400000
    int nSL = 0
    int nTP = 0
    if jRes.size() > 0
        for i = 0 to jRes.size() - 1
            if jTime.get(i) >= cutoff
                if jRes.get(i) == 1
                    nTP += 1
                else
                    nSL += 1
    int   tot = nSL + nTP
    float wr  = tot > 0 ? 100.0 * nTP / tot : na

    color bgH = color.new(color.black, 20)
    color bgC = color.new(color.black, 45)

    table.cell(jTbl, 0, 0, "Journal " + str.tostring(statDays) + "j", bgcolor=bgH, text_color=color.white,  text_size=size.small)
    table.cell(jTbl, 1, 0, syminfo.ticker,                            bgcolor=bgH, text_color=color.silver, text_size=size.small)
    table.cell(jTbl, 0, 1, "TP",    bgcolor=bgC, text_color=winTxtCol,    text_size=size.small)
    table.cell(jTbl, 1, 1, str.tostring(nTP),  bgcolor=bgC, text_color=color.white, text_size=size.small)
    table.cell(jTbl, 0, 2, "SL",    bgcolor=bgC, text_color=lossTxtCol,   text_size=size.small)
    table.cell(jTbl, 1, 2, str.tostring(nSL),  bgcolor=bgC, text_color=color.white, text_size=size.small)
    table.cell(jTbl, 0, 3, "% TP",  bgcolor=bgC, text_color=color.silver, text_size=size.small)
    table.cell(jTbl, 1, 3, na(wr) ? "—" : str.tostring(wr, "#.#") + "%", bgcolor=bgC, text_color=na(wr) ? color.white : (wr >= 43 ? winTxtCol : lossTxtCol), text_size=size.small)
`;

  // PAS de filtre "bougie aberrante au redemarrage du marche" ici : une
  // ancienne version retirait les bougies dont le range depassait 8x la
  // mediane, cense corriger un artefact rare de Twelve Data. Teste en direct
  // le 2026-09-14 : sur un vrai dataset avec une periode calme (weekend/heures
  // creuses), la mediane s'ecrase vers ces valeurs quasi-nulles et le filtre
  // retire ~1/3 des bougies REELLES (celles avec un vrai mouvement) - creant
  // les trous temporels qui cassaient le rendu Vela (bougies ecrasees sur une
  // portion du graphique, reste vide). Mieux vaut afficher un artefact rare
  // que corrompre systematiquement les vraies donnees.
  async function fetchXauCandles() {
    const key = window.CHEST_CONFIG && window.CHEST_CONFIG.twelveDataApiKey;
    if (!key) throw new Error('Clé Twelve Data manquante — voir js/config.local.example.js');
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(SYMBOL_TWELVEDATA)}&interval=${TWELVEDATA_INTERVAL}&outputsize=1000&apikey=${key}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status === 'error' || (json.code && json.code >= 400)) throw new Error(json.message || 'Erreur Twelve Data');
    const candles = json.values
      .map((v) => ({
        time: Math.floor(new Date(v.datetime.replace(' ', 'T') + 'Z').getTime() / 1000) * 1000,
        open: parseFloat(v.open), high: parseFloat(v.high), low: parseFloat(v.low), close: parseFloat(v.close), volume: 0,
      }))
      .sort((a, b) => a.time - b.time);
    return candles;
  }

  async function render(containerId) {
    const container = document.getElementById(containerId);
    const key = window.CHEST_CONFIG && window.CHEST_CONFIG.twelveDataApiKey;
    if (!key) {
      container.innerHTML = '<div class="scanner-empty">Clé Twelve Data manquante — voir <code>js/config.local.example.js</code>.</div>';
      return;
    }

    container.innerHTML = '<div class="scanner-empty">Chargement des données XAU/USD et de ton scanner…</div>';

    let candles;
    try {
      candles = await fetchXauCandles();
    } catch (e) {
      container.innerHTML = `<div class="scanner-empty">Erreur Twelve Data : ${e.message}</div>`;
      return;
    }

    container.innerHTML = '';

    const [{ Vela }, { PineEngine }] = await Promise.all([
      import('https://esm.sh/@luxalgo/vela@0.6.21'),
      import('https://esm.sh/@luxalgo/vela-pinets@0.2.10?deps=@luxalgo/vela@0.6.21'),
    ]);

    const chart = new Vela(container, {
      symbol: SYMBOL_DISPLAY,
      timeframe: VELA_TIMEFRAME,
      data: candles,
      theme: 'dark', // le thème clair inverse la page entière
    });

    chart.registerEngine('pine', new PineEngine());
    await chart.addIndicator(PINE_SOURCE);

    // Couleurs de bougies personnalisables. Appliqué en dernier et sans
    // bloquer le reste : un souci ici ne doit pas empêcher le scanner de s'afficher.
    try {
      chart.renderer.applyConfig({
        candles: { upColor: '#089981', downColor: '#ffffff', wickUpColor: '#089981', wickDownColor: '#ffffff' },
      });
    } catch (e) {
      console.warn('BERICH: couleurs de bougies non appliquées', e);
    }
  }

  window.CHESTBerichChart = { render };
})();
