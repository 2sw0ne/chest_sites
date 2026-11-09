//+------------------------------------------------------------------+
//|                                               CHEST_BERICH.mq5    |
//|                                                     CHEST · BERICH |
//+------------------------------------------------------------------+
// BERICH en automatique, 24 h / 24, sur ton VPS.
//
// L'EA lit toutes les quelques secondes, sur CHEST, les ordres de TON plan BERICH
// (celui calculé par le questionnaire de la page BERICH) :
//   - les signaux ouverts de ton ou tes algorithmes (BERICH I, BERICH II) ;
//   - le risque de chaque position, en % du solde, réduit après une série de stops
//     si ton plan le prévoit ;
//   - les positions à fermer avant leur objectif (clôture « BE » de BERICH II).
// Il calcule le lot sur le VRAI solde de ce compte et place l'ordre avec son stop et
// son objectif. Changer de plan sur CHEST suffit : l'EA suit tout seul.
//
// Ton identifiant CHEST (PushId) est le même que celui de CHESTAccountPush : garde-le
// pour toi. Aucun mot de passe ne sort de ton terminal.
//
// A tester d'abord sur un compte DEMO.
//+------------------------------------------------------------------+
#property copyright "CHEST"
#property link      "https://ch3st.app"
#property version   "2.00"
#property strict

#include <Trade\Trade.mqh>

input group "=== Ton compte CHEST ==="
input string InpPushId       = "";                                                    // Identifiant CHEST (page Connexion du compte)
input string InpChestUrl     = "https://accounts-bridge-production.up.railway.app";    // Adresse du serveur CHEST (a autoriser dans WebRequest)
input int    InpPollSeconds  = 5;                                                     // Lecture du plan toutes les N secondes

input group "=== Securite ==="
input double InpMaxLot       = 5.0;     // Plafond de lot, quel que soit le calcul
input double InpMaxGap       = 4.0;     // Ecart max (en $) entre le prix et l'entree du signal, sinon le signal est ignore
input ulong  InpMagicNumber  = 20261109;

CTrade trade;
string g_plan = "";
datetime g_lastWarn = 0;

//+------------------------------------------------------------------+
int OnInit()
{
   if(StringLen(InpPushId) < 16)
   {
      Alert("CHEST BERICH : colle ton identifiant CHEST dans l'onglet Inputs (PushId).");
      return(INIT_PARAMETERS_INCORRECT);
   }
   if(!MQLInfoInteger(MQL_TRADE_ALLOWED))
      Alert("CHEST BERICH : active \"Algo Trading\" dans la barre d'outils MT5.");
   trade.SetExpertMagicNumber(InpMagicNumber);
   EventSetTimer(MathMax(2, InpPollSeconds));
   Comment("CHEST BERICH : connexion a ton plan...");
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   Comment("");
}

//+------------------------------------------------------------------+
void OnTimer()
{
   string url = InpChestUrl + "/vps/berich/" + InpPushId;
   char post[], result[];
   string headers;
   ResetLastError();
   int code = WebRequest("GET", url, "", 8000, post, result, headers);
   if(code == -1)
   {
      if(TimeCurrent() - g_lastWarn > 600)
      {
         Print("CHEST BERICH : WebRequest bloque - ajoute ", InpChestUrl, " dans Outils > Options > Expert Advisors.");
         g_lastWarn = TimeCurrent();
      }
      Comment("CHEST BERICH : autorise l'adresse du serveur CHEST dans WebRequest.");
      return;
   }
   string body = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   string lines[];
   int n = StringSplit(body, '\n', lines);
   for(int i = 0; i < n; i++)
   {
      string f[];
      int k = StringSplit(lines[i], '|', f);
      if(k < 2) continue;
      if(f[0] == "ERROR") { Comment("CHEST BERICH : ", f[1]); return; }
      if(f[0] == "PLAN")  { g_plan = f[1]; continue; }
      if(f[0] == "OPEN" && k >= 8) OpenSignal(f[1], f[3], StringToDouble(f[4]), StringToDouble(f[5]), StringToDouble(f[6]), StringToDouble(f[7]));
      if(f[0] == "CLOSE") CloseSignal(f[1]);
   }
   Comment("CHEST BERICH actif - plan : ", g_plan, "\nDerniere lecture : ", TimeToString(TimeCurrent(), TIME_SECONDS));
}

//+------------------------------------------------------------------+
//| Un signal = une seule position, jamais rejouee                      |
//+------------------------------------------------------------------+
string Key(const string id) { return "CHEST_BR_" + id; }

void OpenSignal(const string id, const string side, double entry, double sl, double tp, double riskPct)
{
   if(GlobalVariableCheck(Key(id))) return;           // deja pris ou ignore
   string sym = _Symbol;
   double price = (side == "SELL") ? SymbolInfoDouble(sym, SYMBOL_BID) : SymbolInfoDouble(sym, SYMBOL_ASK);
   if(price <= 0) return;
   if(MathAbs(price - entry) > InpMaxGap)
   {
      Print("CHEST BERICH : signal ", id, " ignore, le prix s'est eloigne de l'entree (", DoubleToString(price, 2), " / ", DoubleToString(entry, 2), ").");
      GlobalVariableSet(Key(id), -1);
      return;
   }
   double lot = ComputeLot(sym, price, sl, riskPct);
   if(lot <= 0)
   {
      Print("CHEST BERICH : lot impossible a calculer pour le signal ", id, ".");
      GlobalVariableSet(Key(id), -1);
      return;
   }
   string comment = "BR" + id;
   bool ok = (side == "SELL") ? trade.Sell(lot, sym, 0.0, sl, tp, comment) : trade.Buy(lot, sym, 0.0, sl, tp, comment);
   if(ok)
   {
      GlobalVariableSet(Key(id), 1);
      Print("CHEST BERICH : ", side, " ", DoubleToString(lot, 2), " lot ", sym, " (risque ", DoubleToString(riskPct, 2), " %)");
   }
   else
      Print("CHEST BERICH : echec de l'ordre (", trade.ResultRetcodeDescription(), "), nouvel essai a la prochaine lecture.");
}

void CloseSignal(const string id)
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)InpMagicNumber) continue;
      if(PositionGetString(POSITION_COMMENT) != "BR" + id) continue;
      if(trade.PositionClose(ticket))
         Print("CHEST BERICH : position ", id, " fermee a l'equilibre.");
   }
}

//+------------------------------------------------------------------+
//| Lot sur le VRAI solde du compte et le risque de ton plan            |
//+------------------------------------------------------------------+
double ComputeLot(const string symbol, double entry, double sl, double riskPct)
{
   double tickValue = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize  = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickValue <= 0 || tickSize <= 0 || riskPct <= 0) return 0.0;
   double stopDistance = MathAbs(entry - sl);
   if(stopDistance <= 0) return 0.0;
   double moneyPerLot = (stopDistance / tickSize) * tickValue;
   if(moneyPerLot <= 0) return 0.0;
   double lot = AccountInfoDouble(ACCOUNT_BALANCE) * riskPct / 100.0 / moneyPerLot;
   double lotStep = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   double lotMin  = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double lotMax  = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   if(lotStep <= 0) lotStep = 0.01;
   lot = MathFloor(lot / lotStep) * lotStep;
   if(lot < lotMin) return 0.0;   // le risque du plan est trop petit pour ce compte : on ne force pas un lot plus gros
   lot = MathMin(lot, MathMin(lotMax, InpMaxLot));
   return NormalizeDouble(lot, 2);
}
//+------------------------------------------------------------------+
