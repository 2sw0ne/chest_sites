//+------------------------------------------------------------------+
//|                                           CHESTAccountPush.mq5   |
//|   Envoie à CHEST, toutes les N secondes :                         |
//|     - un instantané : solde, équité, marge, positions ouvertes ;  |
//|     - les positions CLÔTURÉES (historique), pour que CHEST        |
//|       calcule profit, winrate, R:R et courbe comme avec Myfxbook. |
//|                                                                    |
//|   Ne passe JAMAIS d'ordre, ne modifie rien : lecture seule. Un    |
//|   mot de passe INVESTISSEUR suffit pour le compte connecté.       |
//|                                                                    |
//|   Installation : CHEST -> Connecter un compte -> Pro · VPS.       |
//+------------------------------------------------------------------+
#property copyright "CHEST"
#property version   "1.11"
#property strict

// Identifiant généré par CHEST (Connecter un compte -> Pro · VPS). Il joue le rôle de mot de passe
// pour cet EA : ne le partage avec personne.
input string PushId = "";

// Ne change cette adresse que si CHEST te le demande explicitement.
input string ServerUrl = "https://accounts-bridge-production.up.railway.app";

// Fréquence d'envoi de l'instantané (secondes). 30 s suffit largement.
input int PushIntervalSeconds = 30;

// Profondeur de l'historique renvoyé en entier (jours) au démarrage puis toutes les 30 min.
input int HistoryDays = 365;

input int MaxPositions = 50;
input int MaxDeals = 1500;

#define EA_VERSION "1.11"
#define FULL_SYNC_SECONDS 1800
#define RECENT_DAYS 2

datetime g_lastFullSync = 0;

//+------------------------------------------------------------------+
string JsonEscape(string s)
  {
   string out = "";
   int len = StringLen(s);
   for(int i = 0; i < len; i++)
     {
      ushort c = StringGetCharacter(s, i);
      switch(c)
        {
         case '"':  out += "\\\""; break;
         case '\\': out += "\\\\"; break;
         case '\n': out += "\\n";  break;
         case '\r': out += "\\r";  break;
         case '\t': out += "\\t";  break;
         default:   out += StringSubstr(s, i, 1); break;
        }
     }
   return out;
  }

// Nombre -> texte JSON avec point décimal (le séparateur Windows peut être une virgule).
string JsonNum(double v, int digits = 2)
  {
   string s = DoubleToString(v, digits);
   StringReplace(s, ",", ".");
   return s;
  }

// Décalage heure du serveur du broker -> UTC, arrondi au quart d'heure (les heures de l'historique
// MT5 sont en heure du serveur ; CHEST attend de l'UTC).
long ServerOffsetSeconds()
  {
   long off = (long)(TimeTradeServer() - TimeGMT());
   return (long)MathRound(off / 900.0) * 900;
  }

//+------------------------------------------------------------------+
string PositionJson(ulong ticket)
  {
   if(!PositionSelectByTicket(ticket))
      return "";
   long type = PositionGetInteger(POSITION_TYPE);
   string j = "{";
   j += "\"symbol\":\"" + JsonEscape(PositionGetString(POSITION_SYMBOL)) + "\",";
   j += "\"side\":\"" + ((type == POSITION_TYPE_BUY) ? "buy" : "sell") + "\",";
   j += "\"volume\":" + JsonNum(PositionGetDouble(POSITION_VOLUME)) + ",";
   j += "\"priceOpen\":" + JsonNum(PositionGetDouble(POSITION_PRICE_OPEN), 5) + ",";
   j += "\"sl\":" + JsonNum(PositionGetDouble(POSITION_SL), 5) + ",";
   j += "\"tp\":" + JsonNum(PositionGetDouble(POSITION_TP), 5) + ",";
   j += "\"profit\":" + JsonNum(PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP));
   j += "}";
   return j;
  }

//+------------------------------------------------------------------+
//| Positions clôturées depuis `fromTime` (heure serveur).            |
//| Une ligne par transaction de sortie (une clôture partielle = une  |
//| ligne), avec l'ouverture retrouvée via l'identifiant de position. |
//| Calcule aussi dépôts / retraits si `withCash` (historique entier).|
//+------------------------------------------------------------------+
string DealsJson(datetime fromTime, bool withCash, double &deposits, double &withdrawals, int &count)
  {
   count = 0;
   deposits = 0;
   withdrawals = 0;
   if(!HistorySelect(fromTime, TimeCurrent() + 86400))
      return "";
   int total = HistoryDealsTotal();
   long off = ServerOffsetSeconds();

   // 1er passage : transactions d'entrée (ouverture de chaque position) + mouvements de trésorerie.
   long     inPos[];
   datetime inTime[];
   double   inPrice[], inSl[], inTp[];
   int n = 0;
   ArrayResize(inPos, total); ArrayResize(inTime, total); ArrayResize(inPrice, total); ArrayResize(inSl, total); ArrayResize(inTp, total);
   for(int i = 0; i < total; i++)
     {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;
      long dtype = HistoryDealGetInteger(t, DEAL_TYPE);
      if(dtype == DEAL_TYPE_BALANCE)
        {
         double amount = HistoryDealGetDouble(t, DEAL_PROFIT);
         if(amount >= 0) deposits += amount; else withdrawals += -amount;
         continue;
        }
      if(HistoryDealGetInteger(t, DEAL_ENTRY) == DEAL_ENTRY_IN)
        {
         inPos[n]   = HistoryDealGetInteger(t, DEAL_POSITION_ID);
         inTime[n]  = (datetime)HistoryDealGetInteger(t, DEAL_TIME);
         inPrice[n] = HistoryDealGetDouble(t, DEAL_PRICE);
         inSl[n]    = HistoryDealGetDouble(t, DEAL_SL);
         inTp[n]    = HistoryDealGetDouble(t, DEAL_TP);
         n++;
        }
     }

   // 2e passage : transactions de sortie = positions (ou parties de position) clôturées, de la plus
   // récente à la plus ancienne : si MaxDeals est atteint, ce sont les plus anciennes qui sautent.
   string out = "";
   for(int i = total - 1; i >= 0 && count < MaxDeals; i--)
     {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;
      long entry = HistoryDealGetInteger(t, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY && entry != DEAL_ENTRY_INOUT) continue;
      long dtype = HistoryDealGetInteger(t, DEAL_TYPE);
      if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL) continue;

      long pos = HistoryDealGetInteger(t, DEAL_POSITION_ID);
      datetime openT = 0;
      double openP = 0, sl = 0, tp = 0;
      for(int k = 0; k < n; k++)
         if(inPos[k] == pos) { openT = inTime[k]; openP = inPrice[k]; sl = inSl[k]; tp = inTp[k]; break; }

      // Une sortie VENDEUSE clôture une position ACHETEUSE, et inversement.
      string side = (dtype == DEAL_TYPE_SELL) ? "buy" : "sell";
      double profit = HistoryDealGetDouble(t, DEAL_PROFIT);
      double swap = HistoryDealGetDouble(t, DEAL_SWAP);
      double commission = HistoryDealGetDouble(t, DEAL_COMMISSION);
      long closeUtc = (long)HistoryDealGetInteger(t, DEAL_TIME) - off;
      long openUtc = openT > 0 ? (long)openT - off : 0;

      if(count > 0) out += ",";
      out += "{";
      out += "\"ticket\":" + IntegerToString((long)t) + ",";
      out += "\"position\":" + IntegerToString(pos) + ",";
      out += "\"symbol\":\"" + JsonEscape(HistoryDealGetString(t, DEAL_SYMBOL)) + "\",";
      out += "\"side\":\"" + side + "\",";
      out += "\"volume\":" + JsonNum(HistoryDealGetDouble(t, DEAL_VOLUME)) + ",";
      out += "\"openTime\":" + IntegerToString(openUtc) + ",";
      out += "\"closeTime\":" + IntegerToString(closeUtc) + ",";
      out += "\"openPrice\":" + JsonNum(openP, 5) + ",";
      out += "\"closePrice\":" + JsonNum(HistoryDealGetDouble(t, DEAL_PRICE), 5) + ",";
      out += "\"sl\":" + JsonNum(sl, 5) + ",";
      out += "\"tp\":" + JsonNum(tp, 5) + ",";
      out += "\"profit\":" + JsonNum(profit + swap + commission) + ",";
      out += "\"swap\":" + JsonNum(swap) + ",";
      out += "\"commission\":" + JsonNum(commission);
      out += "}";
      count++;
     }
   return out;
  }

//+------------------------------------------------------------------+
void PushSnapshot()
  {
   if(StringLen(PushId) == 0)
     {
      Print("CHESTAccountPush : PushId vide - propriétés de l'EA, onglet Inputs : colle ton identifiant CHEST.");
      return;
     }

   string positionsJson = "";
   int total = PositionsTotal(), sent = 0;
   for(int i = 0; i < total && sent < MaxPositions; i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      string pj = PositionJson(ticket);
      if(StringLen(pj) == 0) continue;
      if(sent > 0) positionsJson += ",";
      positionsJson += pj;
      sent++;
     }

   // Historique : complet (HistoryDays) au démarrage puis toutes les 30 min, sinon seulement les
   // 2 derniers jours - CHEST déduplique par ticket, un renvoi ne crée jamais de doublon.
   bool full = (g_lastFullSync == 0 || TimeCurrent() - g_lastFullSync >= FULL_SYNC_SECONDS);
   datetime fromTime = full ? (datetime)0 : TimeCurrent() - RECENT_DAYS * 86400;
   double deposits = 0, withdrawals = 0;
   int dealCount = 0;
   string dealsJson = DealsJson(fromTime, full, deposits, withdrawals, dealCount);
   if(full && HistoryDays > 0)
     {
      // Dépôts/retraits sur TOUT l'historique (capital de départ), positions sur HistoryDays seulement.
      double d2 = 0, w2 = 0;
      int c2 = 0;
      dealsJson = DealsJson(TimeCurrent() - HistoryDays * 86400, false, d2, w2, c2);
      dealCount = c2;
     }

   string body = "{";
   body += "\"eaVersion\":\"" + EA_VERSION + "\",";
   body += "\"balance\":" + JsonNum(AccountInfoDouble(ACCOUNT_BALANCE)) + ",";
   body += "\"equity\":" + JsonNum(AccountInfoDouble(ACCOUNT_EQUITY)) + ",";
   body += "\"margin\":" + JsonNum(AccountInfoDouble(ACCOUNT_MARGIN)) + ",";
   body += "\"marginFree\":" + JsonNum(AccountInfoDouble(ACCOUNT_MARGIN_FREE)) + ",";
   body += "\"currency\":\"" + JsonEscape(AccountInfoString(ACCOUNT_CURRENCY)) + "\",";
   body += "\"login\":" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ",";
   body += "\"server\":\"" + JsonEscape(AccountInfoString(ACCOUNT_SERVER)) + "\",";
   if(full)
     {
      body += "\"deposits\":" + JsonNum(deposits) + ",";
      body += "\"withdrawals\":" + JsonNum(withdrawals) + ",";
     }
   body += "\"positions\":[" + positionsJson + "],";
   body += "\"deals\":[" + dealsJson + "]";
   body += "}";

   string url = ServerUrl + "/vps/push/" + PushId;
   char postData[];
   int bodyLen = StringToCharArray(body, postData, 0, -1, CP_UTF8) - 1;
   ArrayResize(postData, bodyLen);
   char result[];
   string resultHeaders;

   ResetLastError();
   int status = WebRequest("POST", url, "Content-Type: application/json\r\n", 15000, postData, result, resultHeaders);
   if(status == -1)
     {
      int err = GetLastError();
      if(err == 4060)
         Print("CHESTAccountPush : URL non autorisée - Outils > Options > Expert Advisors > \"Allow WebRequest for listed URL\" : ajoute ", ServerUrl);
      else
         Print("CHESTAccountPush : échec d'envoi (erreur ", err, ") - nouvel essai dans ", PushIntervalSeconds, " s.");
      return;
     }
   if(status != 200)
     {
      Print("CHESTAccountPush : réponse inattendue du serveur (code ", status, ").");
      return;
     }
   if(full)
     {
      g_lastFullSync = TimeCurrent();
      Print("CHESTAccountPush : synchro complète envoyée (", dealCount, " positions clôturées).");
     }
  }

//+------------------------------------------------------------------+
int OnInit()
  {
   EventSetTimer(PushIntervalSeconds < 5 ? 5 : PushIntervalSeconds);
   PushSnapshot();
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason) { EventKillTimer(); }

void OnTimer() { PushSnapshot(); }
//+------------------------------------------------------------------+
