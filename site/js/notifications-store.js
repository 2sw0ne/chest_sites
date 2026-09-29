// CHEST · Notifications internes (2026-09-29, demande utilisateur : "il faut ajouter en haut a
// droite une petite cloche a notification qui tient compte lorsque chest a ce genre de reaction" +
// "une petite 1 en rouge comme dans newsletter s'affiche a droite du menu Journal") — cloche du
// topbar + badge rouge sur l'entrée "Journal" de la sidebar (app.html uniquement, la seule page qui
// porte la vraie sidebar/topbar du shell — voir js/shell.js). Stockage 100% local (pas de vraie
// notification push telephone ici : ça reste un chantier serveur séparé, voir CLAUDE.md "Déclencheurs
// de notifications push" pour le mécanisme déjà en place pour BERICH/calendrier/nouveaux membres).
(() => {
  'use strict';

  const KEY = 'chest_notifications';
  const MAX = 100;

  function list() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function persist(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX))); } catch (e) { /* tant pis */ }
  }
  // type: 'phase_validated' | 'payout_detected' | 'account_blown' — data.journalAccountId pilote le
  // badge du menu Journal et le clic (navigue vers ce journal).
  function add(type, title, body, data) {
    const items = list();
    const rec = {
      id: 'ntf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type, title, body, data: data || {}, read: false, createdAt: new Date().toISOString(),
    };
    items.unshift(rec);
    persist(items);
    return rec;
  }
  function markRead(id) {
    const items = list();
    const idx = items.findIndex((n) => n.id === id);
    if (idx === -1) return;
    items[idx] = Object.assign({}, items[idx], { read: true });
    persist(items);
  }
  function markAllRead() {
    persist(list().map((n) => Object.assign({}, n, { read: true })));
  }
  function remove(id) {
    persist(list().filter((n) => n.id !== id));
  }
  function unreadCount() { return list().filter((n) => !n.read).length; }
  function unreadCountForJournal(journalAccountId) {
    return list().filter((n) => !n.read && n.data && n.data.journalAccountId === journalAccountId).length;
  }
  function hasUnreadJournal() {
    return list().some((n) => !n.read && n.data && n.data.journalAccountId);
  }

  window.CHESTNotifications = {
    list, add, markRead, markAllRead, remove, unreadCount, unreadCountForJournal, hasUnreadJournal,
  };
})();
