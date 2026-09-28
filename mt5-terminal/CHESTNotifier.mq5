//+------------------------------------------------------------------+
//| CHESTNotifier.mq5                                                 |
//| CHEST - notifie accounts-bridge en direct a chaque cloture de     |
//| position (OnTradeTransaction, evenement natif du terminal - pas   |
//| un sondage externe). Remplace l'ancien mecanisme de sondage RPyC  |
//| de mt5-notify-bridge (2026-09-28, voir CLAUDE.md "Plan EA").      |
//|                                                                    |
//| Lecture seule : ce script n'appelle JAMAIS de fonction de trading |
//| (OrderSend, etc.) - seulement HistoryDealGet*() pour lire les     |
//| deals deja executes, et WebRequest() pour notifier notre serveur. |
//+------------------------------------------------------------------+
#property copyright "CHEST"
#property version   "1.00"
#property strict

// A regler dans les parametres de l'EA (clic droit sur le graphique > Expert Advisors > proprietes,
// ou dans le fichier .set) - PAS en dur ici, pour ne jamais committer de secret ni recompiler pour
// changer d'URL. Voir mt5-terminal/README.md pour la valeur exacte a mettre.
input string NotifyUrl = "https://accounts-bridge-production.up.railway.app/mt5/ea-notify";
input string EaSecret  = "";

// ENUM_DEAL_ENTRY / ENUM_DEAL_REASON (doc officielle MQL5, jamais devine) :
// https://www.mql5.com/en/docs/constants/tradingconstants/dealproperties
#define CHEST_DEAL_ENTRY_OUT     1
#define CHEST_DEAL_ENTRY_OUT_BY  3

// Garde-fou en memoire (session en cours uniquement) : evite un WebRequest inutile si
// OnTradeTransaction se declenchait deux fois pour le meme deal. La vraie deduplication - fiable
// meme apres un redemarrage/rattachement de l'EA - se fait cote serveur (accounts-bridge, table
// mt5_ea_last_ticket), ceci n'est qu'une optimisation, pas la source de verite.
ulong g_lastSentDeal = 0;

int OnInit()
  {
   if(EaSecret == "")
      Print("CHESTNotifier: EaSecret vide - les notifications seront refusees (401) par accounts-bridge. Renseigne-le dans les proprietes de l'EA.");
   Print("CHESTNotifier: demarre, compte connecte = ", (long)AccountInfoInteger(ACCOUNT_LOGIN));
   return(INIT_SUCCEEDED);
  }

// Echappe guillemets/antislash/retours a la ligne pour ne jamais casser le JSON envoye - un nom de
// symbole ne devrait jamais en contenir, mais on ne fait jamais confiance a une chaine externe sans
// l'echapper (meme principe applique cote Python de ce projet, voir mt5-notify-bridge/server.py).
string JsonEscape(string s)
  {
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   StringReplace(s, "\n", "\\n");
   StringReplace(s, "\r", "");
   return s;
  }

void SendDealNotification(ulong dealTicket)
  {
   if(!HistoryDealSelect(dealTicket))
      return;

   long entry = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
   if(entry != CHEST_DEAL_ENTRY_OUT && entry != CHEST_DEAL_ENTRY_OUT_BY)
      return; // ouverture, pas une cloture - rien a notifier

   string symbol     = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
   long   dealType   = HistoryDealGetInteger(dealTicket, DEAL_TYPE);   // 0 = achat, 1 = vente
   long   reason     = HistoryDealGetInteger(dealTicket, DEAL_REASON);
   double profit     = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
   double commission = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
   double swap       = HistoryDealGetDouble(dealTicket, DEAL_SWAP);
   long   login      = AccountInfoInteger(ACCOUNT_LOGIN);

   string json = StringFormat(
      "{\"login\":\"%I64d\",\"ticket\":%I64u,\"symbol\":\"%s\",\"type\":%d,"
      "\"profit\":%.2f,\"commission\":%.2f,\"swap\":%.2f,\"reason\":%d}",
      login, dealTicket, JsonEscape(symbol), (int)dealType, profit, commission, swap, (int)reason
   );

   char data[];
   int len = StringToCharArray(json, data, 0, WHOLE_ARRAY, CP_UTF8) - 1; // -1 : retire le \0 final
   if(len > 0)
      ArrayResize(data, len);

   char result[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\nX-EA-Secret: " + EaSecret + "\r\n";

   ResetLastError();
   int status = WebRequest("POST", NotifyUrl, headers, 5000, data, result, resultHeaders);
   if(status == -1)
     {
      int err = GetLastError();
      Print("CHESTNotifier: WebRequest a echoue (erreur ", err, ") pour le deal ", dealTicket,
            " - verifie que l'URL est dans Outils > Options > Expert Advisors > 'Autoriser WebRequest pour les URL suivantes'.");
      return; // pas de mise a jour de g_lastSentDeal - on retentera si un autre evenement arrive
     }
   if(status != 200)
     {
      Print("CHESTNotifier: accounts-bridge a repondu ", status, " pour le deal ", dealTicket,
            " - reponse : ", CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8));
      return;
     }

   g_lastSentDeal = dealTicket;
   Print("CHESTNotifier: deal ", dealTicket, " (", symbol, ", ", DoubleToString(profit + commission + swap, 2), "$) notifie.");
  }

void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest      &request,
                        const MqlTradeResult       &result)
  {
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD)
      return;
   if(trans.deal == g_lastSentDeal)
      return; // meme deal deja traite cette session (voir commentaire sur g_lastSentDeal)
   SendDealNotification(trans.deal);
  }
//+------------------------------------------------------------------+
