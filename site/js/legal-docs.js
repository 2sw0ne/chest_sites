// CHEST — Documents légaux (2026-10-30). Rendus par legal.html (/legal/<doc>), liés depuis le pied de chaque page,
// l'inscription (case à cocher), la page Offres (avant le paiement) et l'espace éducateur.
// ⚠️ À COMPLÉTER une seule fois : l'objet COMPANY ci-dessous (identité de la société, médiateur…). Tant qu'un champ
// vaut null, il apparaît surligné « à compléter » sur la page. Changer LEGAL_VERSION (et TERMS_VERSION côté serveur,
// accounts-bridge/server.py) redemande l'accord de chaque membre à sa prochaine visite.
// Textes rédigés pour la plateforme telle qu'elle fonctionne au 30 octobre 2026 : à faire relire par un avocat avant
// la commercialisation (voir CLAUDE.md, « Documents légaux »).
(() => {
  'use strict';
  const LEGAL_VERSION = '2026-10-30';
  const COMPANY = {
    name: null,            // raison sociale, ex. « CHEST SAS »
    form: null,            // forme juridique et capital, ex. « SAS au capital de 1 000 € »
    rcs: null,             // ex. « RCS Paris 912 345 678 »
    siret: null,
    vat: null,             // n° de TVA intracommunautaire (ou « TVA non applicable, art. 293 B du CGI »)
    address: null,         // siège social
    director: null,        // directeur de la publication (nom, prénom)
    email: null,           // adresse de contact, ex. contact@ch3st.app
    phone: null,
    mediator: null,        // médiateur de la consommation (nom + site), obligatoire pour vendre à des particuliers
    city: null,            // ville du tribunal compétent pour les professionnels
  };
  const SITE = 'ch3st.app';

  const C = (k) => (COMPANY[k] ? esc(COMPANY[k]) : `<mark class="lg-todo">${{ name: 'raison sociale', form: 'forme juridique et capital', rcs: 'immatriculation RCS', siret: 'SIRET', vat: 'n° de TVA', address: 'adresse du siège', director: 'directeur de la publication', email: 'e-mail de contact', phone: 'téléphone', mediator: 'médiateur de la consommation', city: 'ville' }[k]} à compléter</mark>`);
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const L = (slug, txt) => `<a href="/legal/${slug}">${txt}</a>`;
  const MAIL = () => (COMPANY.email ? `<a href="mailto:${esc(COMPANY.email)}">${esc(COMPANY.email)}</a>` : C('email'));
  const WHO = () => `${C('name')} (« CHEST »)`;

  const DOCS = [
    // ------------------------------------------------------------------------------------------------ Mentions légales
    { slug: 'mentions-legales', title: 'Mentions légales', short: 'Mentions légales', html: () => `
      <h2>Éditeur</h2>
      <p>Le site ${SITE} et l'application CHEST sont édités par ${C('name')}, ${C('form')}, immatriculée sous le n° ${C('rcs')} (SIRET ${C('siret')}), dont le siège est situé ${C('address')}.</p>
      <p>TVA : ${C('vat')}. Contact : ${MAIL()} · ${C('phone')}.</p>
      <p>Directeur de la publication : ${C('director')}.</p>
      <h2>Hébergement</h2>
      <p>Site : Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis — vercel.com.</p>
      <p>Serveurs et base de données : Railway Corporation, 548 Market Street PMB 68956, San Francisco, CA 94104, États-Unis — railway.com.</p>
      <p>Paiements : Stripe Payments Europe Ltd, 1 Grand Canal Street Lower, Grand Canal Dock, Dublin, D02 H210, Irlande — stripe.com.</p>
      <h2>Activité</h2>
      <p>CHEST est une plateforme d'outils et de formation au trading (journal, backtests, calendrier, scanners, formation School, suivi par un éducateur, BERICH). CHEST <b>n'est pas un prestataire de services d'investissement</b> ni un conseiller en investissements financiers : elle ne fournit aucun conseil personnalisé, ne gère aucun compte pour le compte de ses membres et ne reçoit pas de fonds destinés à être investis. Voir l'${L('risques', 'Avertissement sur les risques')}.</p>
      <h2>Propriété intellectuelle</h2>
      <p>La marque CHEST, les logos (dont BERICH), les textes, cours, vidéos, algorithmes, backtests, interfaces et le code de la plateforme sont la propriété de ${C('name')} ou de ses partenaires. Toute reproduction ou diffusion sans autorisation écrite est interdite.</p>
      <h2>Signaler un contenu</h2>
      <p>Pour signaler un contenu illicite ou une atteinte à tes droits : ${MAIL()}, en précisant l'adresse de la page et le motif.</p>` },

    // ------------------------------------------------------------------------------------------------ CGU
    { slug: 'cgu', title: 'Conditions générales d’utilisation', short: 'Conditions d’utilisation', html: () => `
      <p class="lg-lead">Ces conditions s'appliquent à toute personne qui crée un compte CHEST. Les cocher à l'inscription vaut accord. Les conditions de paiement sont dans les ${L('cgv', 'Conditions générales de vente')}.</p>
      <h2>1. Objet</h2>
      <p>${WHO()} met à disposition une plateforme en ligne d'outils de trading et de formation : tableau de bord et comptes, journal de trading, backtests, stratégies, calendrier économique, scanners, formation School (cours écrits et vidéo, espace de suivi avec un éducateur), et BERICH (signaux sur l'or, plan de gestion du risque, automatisation sur ton propre compte via un VPS). Les fonctions disponibles dépendent de ton offre (Essai, Essentiel, Premium).</p>
      <h2>2. Ce que CHEST n'est pas</h2>
      <p>CHEST est un service d'information générale et de formation. <b>Rien sur la plateforme n'est un conseil en investissement personnalisé</b>, une recommandation d'acheter ou de vendre, ni une promesse de gain. Les signaux, les plans BERICH, les simulations et les backtests sont des outils : <b>chaque décision de trading, chaque réglage de risque et chaque position restent les tiens</b>, sur un compte ouvert à ton nom chez un courtier ou une propfirm de ton choix. Lis l'${L('risques', 'Avertissement sur les risques')} avant d'utiliser BERICH.</p>
      <h2>3. Compte</h2>
      <ul>
        <li>Tu dois avoir <b>18 ans ou plus</b> et la capacité de contracter.</li>
        <li>Un compte est personnel : un compte par personne, identifiants à garder secrets, partage ou revente interdits. Tu es responsable de ce qui est fait avec ton compte.</li>
        <li>Les informations que tu donnes (nom, e-mail) doivent être exactes.</li>
        <li>Si tu t'inscris avec le code d'un éducateur, ton compte est rattaché à son espace : il voit ton nom, ton e-mail, ton offre et sa date de fin, ton activité sur CHEST, ton questionnaire de départ, ton plan BERICH et votre suivi commun. Il ne voit jamais ton mot de passe CHEST ni ton journal de trading.</li>
      </ul>
      <h2>4. Bon usage</h2>
      <p>Il est interdit de : copier, revendre ou republier les cours, signaux, backtests ou outils ; extraire les données de la plateforme de façon automatisée ; contourner les limites d'accès ; nuire au service (attaques, surcharge) ; publier dans les espaces partagés un contenu illicite, haineux ou trompeur ; se faire passer pour un membre de l'équipe CHEST.</p>
      <h2>5. Connexions à des services tiers</h2>
      <p>Tu peux relier à CHEST des comptes ouverts chez des tiers (courtier ou propfirm via MetaTrader 5 et un VPS, Myfxbook, TradingView). Ces services ont leurs propres conditions ; CHEST n'en est ni responsable ni partenaire, et ne garantit ni leur disponibilité ni leur exactitude. Les identifiants Myfxbook restent sur ton appareil. Pour la connexion BERICH « clé en main » (Premium III), tu confies à ton éducateur l'accès MT5 de ton compte, chiffré sur nos serveurs, uniquement pour installer ton VPS ; nous te conseillons de changer ce mot de passe une fois l'installation faite.</p>
      <h2>6. BERICH et automatisation</h2>
      <p>BERICH envoie des signaux générés par des algorithmes et, si tu le choisis, les applique sur <b>ton</b> compte via un VPS, avec le niveau de risque de <b>ton</b> plan. Le plan proposé par le quiz est une simulation statistique tirée de l'historique, pas une prévision. Tu peux à tout moment modifier ton plan, couper l'automatisation ou fermer tes positions depuis ton courtier. Une coupure (VPS, internet, courtier, plateforme) peut empêcher l'ouverture ou la fermeture d'une position : CHEST ne peut pas en être tenue responsable.</p>
      <h2>7. Disponibilité</h2>
      <p>CHEST fait de son mieux pour que la plateforme soit accessible en continu, sans pouvoir le garantir : maintenance, mises à jour et incidents peuvent l'interrompre. Les données de marché (prix, calendrier, scanners) proviennent de tiers et peuvent être retardées ou inexactes.</p>
      <h2>8. Contenus et données</h2>
      <p>Tu restes propriétaire de tes données (journal, backtests importés, notes). Tu autorises CHEST à les héberger et à les traiter pour te fournir le service, comme décrit dans la ${L('confidentialite', 'Politique de confidentialité')}. Tu peux supprimer ton compte à tout moment depuis la page Compte.</p>
      <h2>9. Suspension et fin</h2>
      <p>CHEST peut suspendre ou fermer un compte en cas de manquement grave à ces conditions (partage d'accès, revente de contenus, fraude au paiement, comportement abusif), après t'en avoir informé sauf urgence. Tu peux arrêter d'utiliser CHEST et supprimer ton compte quand tu veux ; un accès déjà payé n'est pas remboursé dans ce cas (voir la ${L('remboursement', 'Politique de remboursement')}).</p>
      <h2>10. Responsabilité</h2>
      <p>CHEST est responsable de la bonne exécution de ses services dans les limites prévues par la loi. Elle n'est pas responsable des pertes de trading, des décisions que tu prends, du fonctionnement de ton courtier, de ta propfirm ou de ton VPS, ni d'un usage du service contraire à ces conditions. Rien dans ces conditions ne limite les droits que la loi te reconnaît en tant que consommateur.</p>
      <h2>11. Modifications</h2>
      <p>Ces conditions peuvent évoluer. La nouvelle version t'est présentée à ta prochaine connexion et doit être acceptée pour continuer ; une modification ne change jamais le prix ni la durée d'un accès déjà payé.</p>
      <h2>12. Droit applicable</h2>
      <p>Droit français. En cas de litige, écris d'abord à ${MAIL()} : nous répondons sous 30 jours. Tu peux ensuite saisir gratuitement le médiateur de la consommation : ${C('mediator')}, ou la plateforme européenne de règlement en ligne des litiges (ec.europa.eu/consumers/odr). À défaut d'accord, les tribunaux compétents sont ceux prévus par la loi ; pour un consommateur, celui de son domicile.</p>` },

    // ------------------------------------------------------------------------------------------------ CGV
    { slug: 'cgv', title: 'Conditions générales de vente', short: 'Conditions de vente', html: () => `
      <p class="lg-lead">Ces conditions s'appliquent à tout achat d'un accès CHEST. Elles sont acceptées en cochant la case prévue juste avant le paiement, avec les ${L('cgu', 'Conditions d’utilisation')}.</p>
      <h2>1. Vendeur</h2>
      <p>${WHO()}, ${C('form')}, ${C('rcs')}, ${C('address')}. Contact : ${MAIL()}.</p>
      <h2>2. Offres</h2>
      <ul>
        <li><b>Essai</b> : 3 jours gratuits, sans moyen de paiement, avec les fonctions d'Essentiel ; tes données restent sur ton appareil.</li>
        <li><b>Essentiel I, II, III</b> : toute la plateforme sauf School et BERICH, pendant 3, 6 ou 12 mois.</li>
        <li><b>Premium I, II, III</b> : toute la plateforme, School, BERICH et le suivi par un éducateur, pendant 3, 6 ou 12 mois ; Premium III comprend en plus la connexion BERICH « clé en main » installée par ton éducateur.</li>
      </ul>
      <p>Le contenu exact de chaque offre et son prix sont ceux affichés sur la page Offres au moment de l'achat.</p>
      <h2>3. Prix et paiement</h2>
      <p>Les prix sont en euros, toutes taxes comprises. L'accès est <b>payé en une fois</b> pour toute sa durée et <b>ne se renouvelle pas automatiquement</b> : à la fin, tu choisis librement de continuer ou non. Le paiement se fait par carte (ou autre moyen proposé) sur la page sécurisée de Stripe ; CHEST ne reçoit ni ne conserve tes données bancaires. Une facture est disponible sur demande à ${MAIL()}.</p>
      <p>Les anciens abonnements mensuels ou annuels encore en cours se renouvellent à chaque échéance jusqu'à leur résiliation, possible à tout moment depuis la page Compte, avec effet à la fin de la période payée.</p>
      <h2>4. Accès</h2>
      <p>L'accès s'ouvre dès la confirmation du paiement, pour la durée achetée, à compter de cette date. Un changement d'offre en cours d'accès se fait sur la page Offres ; la nouvelle durée court à partir du nouveau paiement.</p>
      <h2>5. Droit de rétractation</h2>
      <p>En principe, un consommateur dispose de 14 jours pour se rétracter d'un achat à distance. Pour un contenu numérique fourni sans support matériel, ce droit ne s'applique plus <b>lorsque l'exécution a commencé avec ton accord exprès et ta reconnaissance de la perte de ce droit</b> (article L221-28, 13° du Code de la consommation). Avant le paiement, une case te demande cet accord : en la cochant, tu demandes l'accès immédiat à CHEST et tu reconnais renoncer à ton droit de rétractation dès l'ouverture de l'accès. La confirmation de cet accord t'est conservée et peut t'être transmise sur demande.</p>
      <h2>6. Remboursement</h2>
      <p>Les cas de remboursement sont décrits dans la ${L('remboursement', 'Politique de remboursement')}.</p>
      <h2>7. Garanties</h2>
      <p>Tu bénéficies de la garantie légale de conformité des contenus et services numériques (articles L224-25-12 et suivants du Code de la consommation). CHEST ne garantit aucun résultat de trading, aucun gain, aucun pourcentage de réussite à un challenge de propfirm, et aucun montant de commission pour un éducateur.</p>
      <h2>8. Litiges</h2>
      <p>Droit français. Réclamation : ${MAIL()}. Médiation gratuite : ${C('mediator')}. Plateforme européenne : ec.europa.eu/consumers/odr. Pour un professionnel, tribunal de commerce de ${C('city')}.</p>` },

    // ------------------------------------------------------------------------------------------------ Remboursement
    { slug: 'remboursement', title: 'Politique de remboursement', short: 'Remboursement', html: () => `
      <p class="lg-lead">Un accès CHEST est un contenu numérique ouvert immédiatement après le paiement, à ta demande. Il n'est donc pas remboursable par principe, sauf dans les cas ci-dessous.</p>
      <h2>Tu es remboursé intégralement si</h2>
      <ul>
        <li>tu as été <b>débité deux fois</b> pour le même achat, ou débité sans que ton accès ne s'ouvre (erreur technique) ;</li>
        <li>le paiement a été fait <b>sans ton autorisation</b> (fraude) — signale-le aussi à ta banque ;</li>
        <li>la loi l'impose (défaut de conformité non corrigé, par exemple).</li>
      </ul>
      <h2>Tu peux être remboursé au prorata si</h2>
      <ul>
        <li>la plateforme a été <b>indisponible plus de 72 heures d'affilée</b> par la faute de CHEST : remboursement ou prolongation de ton accès, au choix, pour la durée perdue ;</li>
        <li>CHEST supprime une fonction majeure de ton offre en cours d'accès (BERICH ou School pour Premium).</li>
      </ul>
      <h2>Pas de remboursement</h2>
      <ul>
        <li>pour des <b>pertes de trading</b>, un échec à un challenge de propfirm, ou des résultats différents des simulations et backtests ;</li>
        <li>si tu arrêtes d'utiliser CHEST ou supprimes ton compte en cours d'accès ;</li>
        <li>en cas de fermeture du compte pour manquement grave aux ${L('cgu', 'Conditions d’utilisation')} ;</li>
        <li>pour une coupure d'un service tiers (courtier, propfirm, VPS, Myfxbook, TradingView).</li>
      </ul>
      <h2>Comment demander</h2>
      <p>Écris à ${MAIL()} avec l'e-mail de ton compte, la date du paiement et le motif, dans les 30 jours. Réponse sous 14 jours ; un remboursement accepté est fait sur le moyen de paiement d'origine via Stripe, sous 14 jours. Avant une contestation bancaire, contacte-nous : une contestation suspend l'accès le temps de la traiter.</p>` },

    // ------------------------------------------------------------------------------------------------ Confidentialité
    { slug: 'confidentialite', title: 'Politique de confidentialité', short: 'Confidentialité', html: () => `
      <p class="lg-lead">Ce que CHEST collecte, pourquoi, combien de temps, et tes droits, au sens du Règlement général sur la protection des données (RGPD) et de la loi Informatique et Libertés.</p>
      <h2>1. Responsable</h2>
      <p>${WHO()}, ${C('address')}. Pour toute question ou demande : ${MAIL()}.</p>
      <h2>2. Données traitées et finalités</h2>
      <table class="lg-table"><thead><tr><th>Données</th><th>Pourquoi</th><th>Base légale</th></tr></thead><tbody>
        <tr><td>Nom, prénom, e-mail, mot de passe (chiffré, illisible même pour nous)</td><td>Créer et sécuriser ton compte</td><td>Contrat</td></tr>
        <tr><td>Offre, dates d'accès, paiements (montant, date, référence Stripe — jamais ta carte)</td><td>Ouvrir ton accès, facturer, comptabilité</td><td>Contrat, obligation légale</td></tr>
        <tr><td>Journal, comptes, backtests, stratégies, réglages, notes que tu saisis</td><td>Te fournir les outils et les synchroniser entre tes appareils</td><td>Contrat</td></tr>
        <tr><td>Données de ton compte de trading relié par VPS (solde, positions, historique)</td><td>Afficher ton compte et appliquer BERICH</td><td>Contrat</td></tr>
        <tr><td>Accès MT5 confiés pour la connexion « clé en main » (Premium III), chiffrés</td><td>Permettre à ton éducateur d'installer ton VPS</td><td>Contrat</td></tr>
        <tr><td>Questionnaire de départ, plan BERICH, suivi (rendez-vous, missions, notes partagées, fichiers)</td><td>Adapter l'offre et le suivi avec ton éducateur</td><td>Contrat</td></tr>
        <tr><td>Pages consultées par jour, dernière connexion</td><td>Suivi par ton éducateur, amélioration du service</td><td>Intérêt légitime</td></tr>
        <tr><td>Adresse IP, navigateur, journal de connexion</td><td>Sécurité, limite d'essais, preuve de tes consentements</td><td>Intérêt légitime, obligation légale</td></tr>
        <tr><td>Abonnement aux notifications</td><td>T'envoyer les alertes que tu as choisies</td><td>Consentement (retirable à tout moment)</td></tr>
        <tr><td>Éducateurs : coordonnées de versement (IBAN ou adresse crypto), ventes et commissions</td><td>Verser les commissions</td><td>Contrat, obligation légale</td></tr>
      </tbody></table>
      <p>Les identifiants Myfxbook et les mots de passe de comptes externes saisis dans le Journal <b>restent sur ton appareil</b> et ne sont jamais envoyés à nos serveurs.</p>
      <h2>3. Qui y a accès</h2>
      <ul>
        <li>l'équipe CHEST habilitée (administration, support) ;</li>
        <li>ton éducateur, si tu t'es inscrit avec son code, pour les seules données listées dans les ${L('cgu', 'Conditions d’utilisation')} (article 3) ; ses notes personnelles sur toi restent les siennes ;</li>
        <li>nos sous-traitants techniques : Vercel (hébergement du site), Railway (serveurs et base de données), Stripe (paiement), services de notification des navigateurs (envoi des notifications), Google Fonts (affichage de la police : ton adresse IP est transmise à Google au chargement). Certains sont situés aux États-Unis : les transferts sont encadrés par les clauses contractuelles types de la Commission européenne ou le Data Privacy Framework.</li>
      </ul>
      <p>CHEST ne vend ni ne loue tes données, et n'utilise aucun cookie publicitaire.</p>
      <h2>4. Durées de conservation</h2>
      <ul>
        <li>Compte et données d'utilisation : tant que ton compte existe ; supprimés à ta demande ou après 3 ans sans connexion (tu es prévenu avant).</li>
        <li>Accès MT5 confiés : jusqu'à ce que la connexion clé en main ne soit plus nécessaire ou que tu demandes leur suppression.</li>
        <li>Paiements et factures : 10 ans (obligation comptable).</li>
        <li>Preuves de consentement (CGU, CGV, renonciation à la rétractation) : 5 ans après la fin de la relation.</li>
        <li>Journaux de sécurité : 12 mois.</li>
      </ul>
      <h2>5. Tes droits</h2>
      <p>Tu peux accéder à tes données, les corriger, les effacer, en limiter l'usage, t'opposer à un traitement fondé sur l'intérêt légitime, en obtenir une copie dans un format lisible (portabilité), et donner des directives sur leur sort après ton décès. Ton compte se supprime directement depuis la page <b>Compte</b> ; pour le reste, écris à ${MAIL()} (réponse sous un mois). Tu peux aussi saisir la CNIL (cnil.fr).</p>
      <h2>6. Stockage sur ton appareil</h2>
      <p>CHEST enregistre dans ton navigateur (stockage local) ta session de connexion, tes préférences d'affichage et certaines données de travail. Ce stockage est strictement nécessaire au service : il ne sert ni à la publicité ni à la mesure d'audience, et ne demande donc pas de bandeau de consentement. L'effacer te déconnecte.</p>
      <h2>7. Sécurité</h2>
      <p>Connexions chiffrées (HTTPS), mots de passe hachés, accès MT5 chiffrés avec une clé gardée hors de la base, limite d'essais de connexion, accès de l'équipe restreint. En cas de violation de données présentant un risque, tu seras informé dans les délais légaux.</p>
      <h2>8. Mineurs</h2>
      <p>CHEST est réservée aux personnes de 18 ans et plus.</p>` },

    // ------------------------------------------------------------------------------------------------ Risques
    { slug: 'risques', title: 'Avertissement sur les risques', short: 'Risques', html: () => `
      <p class="lg-lead"><b>Le trading de produits à effet de levier (CFD, forex, or, indices, crypto-actifs) comporte un risque élevé de perte rapide de capital.</b> Une large majorité des comptes de particuliers perdent de l'argent en négociant des CFD. N'utilise que de l'argent que tu peux te permettre de perdre.</p>
      <h2>1. CHEST n'est pas un conseiller</h2>
      <p>CHEST n'est ni un prestataire de services d'investissement, ni un conseiller en investissements financiers, ni un gestionnaire de portefeuille. Les cours, signaux, plans, simulations, backtests, scanners et échanges avec ton éducateur sont des informations générales et pédagogiques, <b>non adaptées à ta situation personnelle</b>. Ils ne sont pas une incitation à investir. Avant toute décision, évalue ta situation financière, tes objectifs et ta tolérance au risque, et demande si besoin l'avis d'un professionnel agréé.</p>
      <h2>2. Les performances passées ne préjugent pas des performances futures</h2>
      <p>Les résultats de BERICH, des backtests et des stratégies portent sur le passé. Un backtest est <b>hypothétique</b> : il ne tient pas toujours compte des frais, du spread, du glissement, des swaps ni des conditions réelles d'exécution, et peut surestimer une méthode ajustée à l'historique. Les « futurs simulés » du plan BERICH sont des tirages statistiques tirés de cet historique : une probabilité affichée n'est pas une promesse.</p>
      <h2>3. Risques de l'automatisation</h2>
      <p>Un algorithme peut enchaîner les pertes ; le marché peut évoluer d'une façon que l'historique ne contient pas. L'exécution automatique dépend de ton VPS, de ta connexion, de MetaTrader et de ton courtier : une panne, un décalage de prix, un écart à l'ouverture ou une annonce économique peuvent produire une perte supérieure à celle prévue. Tu restes responsable de surveiller ton compte et de couper l'automatisation si nécessaire.</p>
      <h2>4. Propfirms</h2>
      <p>Les propfirms sont des sociétés indépendantes de CHEST, avec leurs propres règles qui changent souvent. Les simulations et règles affichées dans CHEST sont indicatives : le site de la propfirm fait foi. Le prix d'un challenge peut être perdu en totalité.</p>
      <h2>5. Aucune garantie</h2>
      <p>CHEST ne garantit aucun gain, aucun rendement, aucun « multiplicateur » de capital et aucune réussite à un challenge. Toute affirmation contraire faite par un tiers, y compris un éducateur, n'engage pas CHEST : signale-la à ${MAIL()}.</p>
      <h2>6. Fiscalité</h2>
      <p>Les gains de trading sont imposables. Il t'appartient de les déclarer selon ta situation.</p>` },

    // ------------------------------------------------------------------------------------------------ Charte de l'éducateur
    // (2026-10-30) Règles du programme et déclaration sur les revenus réunies en un seul document : un seul lien en bas
    // de page. Les anciennes adresses /legal/programme-educateur et /legal/revenus-educateurs y mènent (legal.html).
    { slug: 'charte-educateur', title: 'Charte de l’éducateur', short: 'Charte de l’éducateur', html: () => `
      <p class="lg-lead">Cette charte s'applique à toute personne ayant le rôle Éducateur. Elle est acceptée à l'ouverture de l'espace éducateur et complètent les ${L('cgu', 'Conditions d’utilisation')}.</p>
      <h2>1. Rôle</h2>
      <p>L'éducateur accompagne les membres inscrits avec son code : rendez-vous, missions, notes, ressources, installation du VPS pour la connexion BERICH clé en main (Premium III). Il agit comme <b>indépendant</b> : il n'est ni salarié, ni mandataire, ni représentant de ${C('name')} et ne peut pas l'engager.</p>
      <h2>2. Statut et fiscalité</h2>
      <p>Pour recevoir des commissions, l'éducateur doit exercer sous un statut lui permettant de facturer (micro-entreprise ou société) et déclarer ses revenus. CHEST peut demander un justificatif (SIRET, attestation) avant tout versement.</p>
      <h2>3. Code et lien d'invitation</h2>
      <p>Le code de référent est choisi une fois et définitif. Le lien officiel d'inscription (${SITE}/rejoindre/CODE) est le seul à utiliser : il rattache le membre à ton espace. Il est interdit d'inscrire des personnes à leur insu, de créer de faux comptes ou de t'inscrire toi-même avec ton propre code.</p>
      <h2>4. Commissions</h2>
      <ul>
        <li>Calculées sur les sommes <b>effectivement encaissées</b> par CHEST pour les accès de tes membres, hors taxes reversées, essais gratuits, remboursements, impayés et contestations bancaires.</li>
        <li>Taux affiché dans ton espace ; CHEST peut le faire évoluer pour l'avenir, après t'en avoir informé.</li>
        <li>Une commission liée à un paiement remboursé ou contesté est retirée de ton solde, y compris après versement (déduite des commissions suivantes).</li>
        <li>Retrait à partir de 50 €, après vérification, par virement SEPA ou sur une adresse crypto que tu indiques ; une erreur d'adresse crypto n'est pas récupérable.</li>
      </ul>
      <h3 id="portefeuille">Le portefeuille : un affichage indicatif</h3>
      <p>Le portefeuille de ton espace éducateur n'est <b>ni un compte bancaire, ni un compte de paiement, ni de la monnaie électronique</b>. Aucune somme n'y est déposée ni conservée pour toi : les montants affichés sont une <b>estimation</b> des commissions que tu pourrais percevoir, à partir des paiements encaissés par CHEST auprès de tes membres. Ce solde ne constitue pas une créance tant que la demande de retrait n'a pas été vérifiée et acceptée ; seul le versement effectif fait foi.</p>
      <h3 id="retraits">Demandes de retrait</h3>
      <p>Tu enregistres d'abord tes coordonnées (IBAN ou adresse crypto). Chaque demande est vérifiée : paiements bien encaissés, absence de remboursement ou de litige, cohérence des coordonnées. Une fois acceptée, la somme est versée par virement SEPA ou sur le portefeuille crypto indiqué, dans un délai indicatif de quelques jours ouvrés. Une demande peut être refusée ou ajustée en cas d'erreur, de fraude ou de remboursement d'un membre. CHEST peut te demander un numéro SIRET ou une facture avant un versement.</p>
      <h2>5. Ce qui est interdit</h2>
      <ul>
        <li><b>Promettre des gains</b>, un rendement, un « ×2 », un taux de réussite, ou présenter les résultats de BERICH ou des backtests comme garantis.</li>
        <li>Donner un <b>conseil en investissement personnalisé</b> (« achète ceci », « mets tant sur ton compte »), gérer le compte d'un membre ou trader à sa place.</li>
        <li>Montrer ses propres revenus ou un train de vie comme résultat attendu de CHEST.</li>
        <li>Démarcher des mineurs ou des personnes vulnérables, faire pression pour un achat, inventer une urgence ou une rareté.</li>
        <li>Spam (messages non sollicités, commentaires en masse), achat de faux abonnés, faux avis.</li>
        <li>Utiliser la marque CHEST ou BERICH dans un nom de compte, un nom de domaine ou une publicité payante sans accord écrit.</li>
        <li>Utiliser les données d'un membre (e-mail, téléphone) pour autre chose que son suivi CHEST, ou les transmettre à un tiers.</li>
      </ul>
      <h2>6. Réseaux sociaux et publicité</h2>
      <ul>
        <li>Toute publication qui fait la promotion de CHEST en échange d'une commission est une <b>communication commerciale</b> : indique-le clairement et de façon visible (« Publicité » ou « Collaboration commerciale »), comme l'exige la loi n° 2023-451 du 9 juin 2023 sur l'influence commerciale.</li>
        <li>Présente CHEST pour ce qu'elle est : des outils et une formation au trading. Toute mention de performance doit être accompagnée de l'avertissement : « Le trading comporte un risque de perte en capital. Les performances passées ne préjugent pas des performances futures. »</li>
        <li>Ne publie pas de captures de résultats sans préciser qu'il s'agit du passé, ni de résultats de membres sans leur accord.</li>
        <li>Respecte les règles de chaque réseau sur la promotion de produits financiers.</li>
      </ul>
      <h2>7. Confidentialité</h2>
      <p>Les informations des membres auxquelles tu accèdes (identité, offre, activité, questionnaire, accès MT5 confiés, suivi) sont confidentielles et ne servent qu'à leur accompagnement. Les accès MT5 ne doivent jamais être copiés ailleurs que dans leur VPS. Tes notes personnelles sur un membre ne sont visibles que par toi.</p>
      <p id="donnees">Tes propres coordonnées de versement (IBAN, adresse crypto) servent uniquement à te verser tes commissions. Elles ne sont visibles que par toi (en partie masquées) et par CHEST, et sont conservées le temps du programme puis la durée légale de conservation des pièces comptables. Tu peux les consulter, les corriger ou demander leur suppression en écrivant à ${MAIL()}.</p>
      <h2>8. Manquements</h2>
      <p>En cas de manquement, CHEST peut, selon la gravité : t'avertir, suspendre tes commissions, retirer ton rôle d'éducateur, et réclamer les commissions obtenues de façon irrégulière. Tes membres restent membres de CHEST.</p>
      <h2>9. Fin</h2>
      <p>Tu peux quitter le programme à tout moment en écrivant à ${MAIL()}. Les commissions dues sur des paiements encaissés avant ton départ te sont versées selon les règles ci-dessus.</p>
      <h2 id="revenus">10. Revenus : déclaration</h2>
      <p><b>Devenir éducateur CHEST ne garantit aucun revenu.</b> Ce que tu gagnes dépend uniquement des accès payés par les membres que tu as accompagnés, et du temps que tu y consacres.</p>
      <h3>Comment la commission est calculée</h3>
      <p>Commission = montant encaissé par CHEST pour l'accès d'un de tes membres × ton taux (affiché dans ton espace). Exemple, avec un taux d'un tiers : un membre qui paie un accès de 1 500 € génère 500 € de commission, une seule fois, pour toute la durée de cet accès. S'il ne renouvelle pas, il ne génère plus rien.</p>
      <h3>Ce qu'il faut savoir</h3>
      <ul>
        <li>Une grande partie des éducateurs d'un programme de ce type gagnent peu ou rien. CHEST publiera ici la répartition réelle des commissions versées dès qu'elle portera sur une période et un nombre d'éducateurs suffisants pour être représentative.</li>
        <li>Les commissions sont des revenus imposables et soumis à cotisations ; les frais que tu engages (temps, publicité, matériel) restent à ta charge.</li>
        <li>Les revenus d'un éducateur ne proviennent pas du trading : ils ne disent rien des gains que peut faire un membre.</li>
        <li>Toute présentation de revenus « faciles », « passifs » ou « garantis » est contraire à cette charte.</li>
      </ul>` },
  ];

  window.CHESTLegal = { DOCS, COMPANY, LEGAL_VERSION, SITE };
})();
