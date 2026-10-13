//+------------------------------------------------------------------+
//|                                           CHESTAccountPush.mq5   |
//|   Pousse un instantané (solde / équité / marge / positions       |
//|   ouvertes) de CE compte MT5 vers CHEST, toutes les N secondes.  |
//|                                                                    |
//|   Ne fait JAMAIS de trade, ne lit ni ne modifie aucun ordre -     |
//|   lecture seule, un mot de passe INVESTISSEUR suffit amplement   |
//|   pour le compte connecté à ce terminal.                         |
//|                                                                    |
//|   Installation complète : voir le guide "Connexion VPS" dans      |
//|   CHEST (Compte -> Connexion -> VPS personnel).                   |
//+------------------------------------------------------------------+
#property copyright "CHEST"
#property version   "1.00"
#property strict

// Identifiant généré par CHEST (Compte -> Connexion -> VPS personnel -> "Générer mon
// identifiant") - colle-le ici tel quel. Il joue le rôle de mot de passe pour cet EA :
// ne le partage avec personne, il permet d'écrire les chiffres affichés sur TON compte CHEST.
input string PushId = "";

// Ne change cette adresse que si CHEST te demande explicitement de le faire.
input string ServerUrl = "https://accounts-bridge-production.up.railway.app";

// Fréquence d'envoi. 30s est largement suffisant (CHEST ne fait que de l'affichage, pas
// du trading automatique sur cette base) - inutile de descendre plus bas.
input int PushIntervalSeconds = 30;

// Combien de positions ouvertes envoyer au maximum (CHEST n'affiche de toute façon qu'un
// aperçu) - évite une requête énorme si des dizaines de positions sont ouvertes en même temps.
input int MaxPositions = 50;

//+------------------------------------------------------------------+
//| Échappe une chaîne pour l'insérer telle quelle dans une valeur    |
//| JSON entre guillemets (antislash, guillemet, retour à la ligne). |
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

//+------------------------------------------------------------------+
//| Nombre -> texte JSON (point décimal, jamais de virgule - le      |
//| séparateur dépend de la langue de Windows, forcé ici en "C").    |
//+------------------------------------------------------------------+
string JsonNum(double v)
  {
   string s = DoubleToString(v, 2);
   StringReplace(s, ",", ".");
   return s;
  }

//+------------------------------------------------------------------+
//| Construit le JSON d'une position ouverte.                        |
//+------------------------------------------------------------------+
string PositionJson(ulong ticket)
  {
   if(!PositionSelectByTicket(ticket))
      return "";
   string symbol = PositionGetString(POSITION_SYMBOL);
   long   type    = PositionGetInteger(POSITION_TYPE);
   double volume  = PositionGetDouble(POSITION_VOLUME);
   double priceOpen = PositionGetDouble(POSITION_PRICE_OPEN);
   double sl = PositionGetDouble(POSITION_SL);
   double tp = PositionGetDouble(POSITION_TP);
   double profit = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
   string side = (type == POSITION_TYPE_BUY) ? "buy" : "sell";

   string j = "{";
   j += "\"symbol\":\"" + JsonEscape(symbol) + "\",";
   j += "\"side\":\"" + side + "\",";
   j += "\"volume\":" + JsonNum(volume) + ",";
   j += "\"priceOpen\":" + JsonNum(priceOpen) + ",";
   j += "\"sl\":" + JsonNum(sl) + ",";
   j += "\"tp\":" + JsonNum(tp) + ",";
   j += "\"profit\":" + JsonNum(profit);
   j += "}";
   return j;
  }

//+------------------------------------------------------------------+
//| Construit le JSON complet de l'instantané et l'envoie.           |
//+------------------------------------------------------------------+
void PushSnapshot()
  {
   if(StringLen(PushId) == 0)
     {
      Print("CHESTAccountPush : PushId vide - va dans les propriétés de l'EA (onglet Inputs) et colle ton identifiant CHEST.");
      return;
     }

   double balance    = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity     = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin     = AccountInfoDouble(ACCOUNT_MARGIN);
   double marginFree = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   string currency   = AccountInfoString(ACCOUNT_CURRENCY);
   long   login      = AccountInfoInteger(ACCOUNT_LOGIN);
   string server     = AccountInfoString(ACCOUNT_SERVER);

   string positionsJson = "";
   int total = PositionsTotal();
   int sent = 0;
   for(int i = 0; i < total && sent < MaxPositions; i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;
      string pj = PositionJson(ticket);
      if(StringLen(pj) == 0)
         continue;
      if(sent > 0)
         positionsJson += ",";
      positionsJson += pj;
      sent++;
     }

   string body = "{";
   body += "\"balance\":" + JsonNum(balance) + ",";
   body += "\"equity\":" + JsonNum(equity) + ",";
   body += "\"margin\":" + JsonNum(margin) + ",";
   body += "\"marginFree\":" + JsonNum(marginFree) + ",";
   body += "\"currency\":\"" + JsonEscape(currency) + "\",";
   body += "\"login\":" + IntegerToString(login) + ",";
   body += "\"server\":\"" + JsonEscape(server) + "\",";
   body += "\"positions\":[" + positionsJson + "]";
   body += "}";

   string url = ServerUrl + "/vps/push/" + PushId;
   char postData[];
   int bodyLen = StringToCharArray(body, postData, 0, StringLen(body), CP_UTF8) - 1;
   ArrayResize(postData, bodyLen);

   char result[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\n";
   int timeoutMs = 8000;

   ResetLastError();
   int status = WebRequest("POST", url, headers, timeoutMs, postData, result, resultHeaders);
   if(status == -1)
     {
      int err = GetLastError();
      if(err == 4060)
         Print("CHESTAccountPush : l'URL n'est pas autorisée - Outils > Options > Expert Advisors > coche ",
               "\"Allow WebRequest for listed URL\" et ajoute : ", ServerUrl);
      else
         Print("CHESTAccountPush : échec d'envoi (erreur ", err, ") - nouvelle tentative dans ", PushIntervalSeconds, "s.");
      return;
     }
   if(status != 200)
      Print("CHESTAccountPush : réponse inattendue du serveur (code ", status, ").");
  }

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
  {
   int interval = (PushIntervalSeconds < 5) ? 5 : PushIntervalSeconds;
   EventSetTimer(interval);
   PushSnapshot(); // premier envoi immédiat, sans attendre le premier tic du minuteur
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
  }

//+------------------------------------------------------------------+
//| Timer function                                                   |
//+------------------------------------------------------------------+
void OnTimer()
  {
   PushSnapshot();
  }
//+------------------------------------------------------------------+
