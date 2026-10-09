//+------------------------------------------------------------------+
//| CHESTLive.mq5                                                     |
//| CHEST - pousse en direct l'etat du compte vers accounts-bridge :  |
//| solde, equity, P&L flottant, positions ouvertes (toutes les       |
//| PushSeconds secondes) et, a chaque deal, l'evenement "position    |
//| prise" / "position cloturee" (OnTradeTransaction, natif).         |
//|                                                                    |
//| Remplace Myfxbook pour le suivi en direct : Myfxbook ne se        |
//| resynchronise qu'a ses propres moments, parfois des heures apres. |
//|                                                                    |
//| LECTURE SEULE : aucune fonction de trading (OrderSend, etc.) -    |
//| seulement des lectures (Account*, Position*, HistoryDeal*) et     |
//| WebRequest() pour notifier notre serveur.                          |
//+------------------------------------------------------------------+
#property copyright "CHEST"
#property version   "2.00"

// A regler dans les proprietes de l'EA (onglet Entrees) ou via le fichier .set - jamais en dur :
// pas de secret commite, pas de recompilation pour changer d'URL. Voir mt5-terminal/README.md.
input string PushUrl     = "https://accounts-bridge-production.up.railway.app/mt5/ea-push";
input string EaSecret    = "";
input int    PushSeconds = 5;

// ENUM_DEAL_ENTRY / ENUM_DEAL_TYPE / ENUM_DEAL_REASON (doc officielle MQL5)
#define CHEST_ENTRY_IN      0
#define CHEST_ENTRY_OUT     1
#define CHEST_ENTRY_INOUT   2
#define CHEST_ENTRY_OUT_BY  3
#define CHEST_DEAL_BUY      0
#define CHEST_DEAL_SELL     1
#define CHEST_DEAL_BALANCE  2
#define CHEST_DEAL_CREDIT   3

long   g_balanceOpAt = 0;     // epoch (s, UTC) de la derniere operation de solde (depot/retrait)
int    g_failCount   = 0;
bool   g_okLogged    = false;
ulong  g_lastEventDeal = 0;   // garde-fou memoire ; la vraie dedup est cote serveur (mt5_ea_events)

// Prototype : OnInit() appelle cette fonction, definie plus bas.
void ScanBalanceOps();

//+------------------------------------------------------------------+
int OnInit()
  {
   if(EaSecret == "")
      Print("CHESTLive: EaSecret vide - accounts-bridge refusera les envois (401). Renseigne-le dans les entrees de l'EA.");
   ScanBalanceOps();
   EventSetTimer(MathMax(2, PushSeconds));
   Print("CHESTLive: demarre, compte ", (long)AccountInfoInteger(ACCOUNT_LOGIN), " sur ", AccountInfoString(ACCOUNT_SERVER));
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
  }

//+------------------------------------------------------------------+
// Les horodatages MT5 sont en HEURE SERVEUR du broker (souvent UTC+2/+3) : on les convertit en UTC
// pour que le Dashboard puisse les comparer a Date.now().
long ToGmt(long serverTime)
  {
   return serverTime - (long)(TimeCurrent() - TimeGMT());
  }

// Echappe guillemets / antislash / retours a la ligne : une chaine externe ne doit jamais casser le JSON.
string JsonEscape(string s)
  {
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   StringReplace(s, "\n", "\\n");
   StringReplace(s, "\r", "");
   return s;
  }

// Derniere operation de solde (depot/retrait/credit) des 3 derniers jours : le Dashboard s'en sert pour
// ne pas confondre un depot/retrait non encore vu par Myfxbook avec un gain de trading.
void ScanBalanceOps()
  {
   datetime to = TimeCurrent();
   if(!HistorySelect(to - 3 * 86400, to + 60))
      return;
   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;
      long type = HistoryDealGetInteger(t, DEAL_TYPE);
      if(type == CHEST_DEAL_BALANCE || type == CHEST_DEAL_CREDIT)
        {
         long when = ToGmt(HistoryDealGetInteger(t, DEAL_TIME));
         if(when > g_balanceOpAt) g_balanceOpAt = when;
        }
     }
  }

string PositionsJson()
  {
   string out = "[";
   int total = PositionsTotal();
   bool first = true;
   for(int i = 0; i < total; i++)
     {
      ulong ticket = PositionGetTicket(i);   // selectionne aussi la position
      if(ticket == 0) continue;
      string sym = PositionGetString(POSITION_SYMBOL);
      int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      long ptype = PositionGetInteger(POSITION_TYPE);   // 0 = achat, 1 = vente
      string item = StringFormat(
         "{\"ticket\":%I64u,\"symbol\":\"%s\",\"side\":\"%s\",\"volume\":%s,\"open\":%s,\"current\":%s,"
         "\"sl\":%s,\"tp\":%s,\"profit\":%s,\"swap\":%s,\"time\":%I64d}",
         ticket, JsonEscape(sym), (ptype == POSITION_TYPE_BUY ? "BUY" : "SELL"),
         DoubleToString(PositionGetDouble(POSITION_VOLUME), 2),
         DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN), digits),
         DoubleToString(PositionGetDouble(POSITION_PRICE_CURRENT), digits),
         DoubleToString(PositionGetDouble(POSITION_SL), digits),
         DoubleToString(PositionGetDouble(POSITION_TP), digits),
         DoubleToString(PositionGetDouble(POSITION_PROFIT), 2),
         DoubleToString(PositionGetDouble(POSITION_SWAP), 2),
         ToGmt((long)PositionGetInteger(POSITION_TIME)));
      if(!first) out += ",";
      out += item;
      first = false;
     }
   return out + "]";
  }

// Evenement lie a un deal (ouverture ou cloture) - "" si le deal n'est ni l'un ni l'autre.
string EventJson(ulong dealTicket)
  {
   datetime to = TimeCurrent();
   HistorySelect(to - 2 * 86400, to + 60);
   if(!HistoryDealSelect(dealTicket))
      return "";

   long entry = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
   long dtype = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
   if(dtype != CHEST_DEAL_BUY && dtype != CHEST_DEAL_SELL)
     {
      if(dtype == CHEST_DEAL_BALANCE || dtype == CHEST_DEAL_CREDIT)
         g_balanceOpAt = ToGmt(HistoryDealGetInteger(dealTicket, DEAL_TIME));
      return "";
     }

   string sym = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
   long posId = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
   double vol = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
   int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   string price = DoubleToString(HistoryDealGetDouble(dealTicket, DEAL_PRICE), digits);

   if(entry == CHEST_ENTRY_IN || entry == CHEST_ENTRY_INOUT)
     {
      string side = (dtype == CHEST_DEAL_BUY ? "BUY" : "SELL");
      return StringFormat(
         "{\"kind\":\"open\",\"ticket\":%I64u,\"positionId\":%I64d,\"symbol\":\"%s\",\"side\":\"%s\",\"volume\":%s,\"price\":%s}",
         dealTicket, posId, JsonEscape(sym), side, DoubleToString(vol, 2), price);
     }

   if(entry == CHEST_ENTRY_OUT || entry == CHEST_ENTRY_OUT_BY)
     {
      // Un deal de cloture "vend" pour fermer un achat : le sens de la POSITION est l'inverse du deal.
      string side = (dtype == CHEST_DEAL_SELL ? "BUY" : "SELL");
      long reason = HistoryDealGetInteger(dealTicket, DEAL_REASON);
      double net = HistoryDealGetDouble(dealTicket, DEAL_PROFIT) + HistoryDealGetDouble(dealTicket, DEAL_COMMISSION)
                 + HistoryDealGetDouble(dealTicket, DEAL_SWAP) + HistoryDealGetDouble(dealTicket, DEAL_FEE);

      // Cloture complete d'une position qui n'a eu qu'UN deal de sortie : on y ajoute les frais pris a
      // l'ouverture (commission du deal d'entree) pour avoir le vrai net, comme sur le releve du broker.
      if(HistorySelectByPosition(posId))
        {
         int n = HistoryDealsTotal(), outs = 0;
         double entryCosts = 0.0;
         for(int i = 0; i < n; i++)
           {
            ulong t = HistoryDealGetTicket(i);
            if(t == 0) continue;
            long e = HistoryDealGetInteger(t, DEAL_ENTRY);
            if(e == CHEST_ENTRY_OUT || e == CHEST_ENTRY_OUT_BY) outs++;
            else if(e == CHEST_ENTRY_IN)
               entryCosts += HistoryDealGetDouble(t, DEAL_COMMISSION) + HistoryDealGetDouble(t, DEAL_FEE);
           }
         if(outs == 1) net += entryCosts;
        }
      return StringFormat(
         "{\"kind\":\"close\",\"ticket\":%I64u,\"positionId\":%I64d,\"symbol\":\"%s\",\"side\":\"%s\",\"volume\":%s,"
         "\"price\":%s,\"profit\":%s,\"reason\":%d}",
         dealTicket, posId, JsonEscape(sym), side, DoubleToString(vol, 2), price, DoubleToString(net, 2), (int)reason);
     }
   return "";
  }

//+------------------------------------------------------------------+
void Push(string eventJson)
  {
   long login = (long)AccountInfoInteger(ACCOUNT_LOGIN);
   bool connected = (login != 0 && TerminalInfoInteger(TERMINAL_CONNECTED) != 0);
   string body;
   if(!connected)
     {
      // Pas (encore) connecte a un compte : aucun solde a pousser (il ecraserait le dernier vrai instantane
      // avec des zeros). On envoie juste un "heartbeat", qui valide l'URL autorisee + le secret sans rien stocker.
      body = "{\"login\":\"0\",\"heartbeat\":true}";
     }
   else
     {
      body = StringFormat(
         "{\"login\":\"%I64d\",\"server\":\"%s\",\"currency\":\"%s\",\"balance\":%s,\"equity\":%s,\"margin\":%s,"
         "\"floating\":%s,\"balanceOpAt\":%I64d,\"ts\":%I64d,\"positions\":%s",
         login, JsonEscape(AccountInfoString(ACCOUNT_SERVER)),
         JsonEscape(AccountInfoString(ACCOUNT_CURRENCY)),
         DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2), DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2),
         DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN), 2), DoubleToString(AccountInfoDouble(ACCOUNT_PROFIT), 2),
         g_balanceOpAt, (long)TimeGMT(), PositionsJson());
      if(eventJson != "")
         body += ",\"event\":" + eventJson;
      body += "}";
     }

   char data[];
   int len = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8) - 1;   // -1 : retire le \0 final
   if(len > 0) ArrayResize(data, len);

   char result[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\nX-EA-Secret: " + EaSecret + "\r\n";

   ResetLastError();
   int status = WebRequest("POST", PushUrl, headers, 4000, data, result, resultHeaders);
   if(status == 200)
     {
      g_failCount = 0;
      if(!g_okLogged)
        {
         g_okLogged = true;
         Print("CHESTLive: premier envoi reussi (HTTP 200)", (connected ? "" : " - heartbeat, aucun compte connecte pour l'instant"));
        }
      return;
     }
   // Journal limite : une erreur toutes les ~12 tentatives au plus, pour ne pas inonder les logs.
   g_failCount++;
   if(g_failCount == 1 || g_failCount % 12 == 0)
     {
      if(status == -1)
         Print("CHESTLive: WebRequest a echoue (erreur ", GetLastError(), "). Si 4060 : ajoute l'URL dans Outils > Options > Expert Advisors > 'Autoriser WebRequest pour les URL suivantes'.");
      else
         Print("CHESTLive: accounts-bridge a repondu ", status, " - ", CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8));
     }
  }

void OnTimer()
  {
   Push("");
  }

void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
  {
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD)
      return;
   if(trans.deal == g_lastEventDeal)
      return;
   g_lastEventDeal = trans.deal;
   Push(EventJson(trans.deal));   // instantane + evenement immediat, sans attendre le prochain tick du timer
  }
//+------------------------------------------------------------------+
