/* =====================================================
   Hanverse Notification Client
   Reads / writes notification history in localStorage.
   Bell widget is created by notifications.js (loaded first).
   ===================================================== */

(function () {
  const HN_HISTORY_KEY = 'hanverse_notification_history';
  const STORAGE_KEY    = 'hanverse_notifications_dismissed';
  const LS_USER_KEY    = 'hanverse_user';

  /* ── helpers ──────────────────────────────────────────────────────────── */
  function safeJsonParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  /* ── history (shared with notifications.js) ─────────────────────────────── */
  function getHistory() {
    try { return JSON.parse(localStorage.getItem(HN_HISTORY_KEY) || '[]'); }
    catch { return []; }
  }
  function saveHistory(entries) {
    localStorage.setItem(HN_HISTORY_KEY, JSON.stringify((entries || []).slice(-200)));
  }

  /* ── DB dismissed-set ──────────────────────────────────────────────────── */
  function getDismissedSet() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = safeJsonParse(raw, []);
    return new Set(Array.isArray(arr) ? arr : []);
  }

  /* ── time formatter ────────────────────────────────────────────────────── */
  function fmtTime(ts) {
    if (!ts) return '';
    const d   = new Date(ts);
    const diff = Date.now() - d.getTime();
    const m  = Math.floor(diff / 60000);
    if (m < 1)      return 'just now';
    if (m < 60)     return `${m} min ago`;
    const h  = Math.floor(m / 60);
    if (h < 24)     return `${h} hours ago`;
    const dd = Math.floor(h / 24);
    return `${dd} day${dd === 1 ? '' : 's'} ago`;
  }

  /* ── fetch from DB ─────────────────────────────────────────────────────── */
  function getLoggedInUser() {
    try { return JSON.parse(localStorage.getItem(LS_USER_KEY) || '{}'); }
    catch { return {}; }
  }

  async function fetchNotifsFromDB() {
    const user = getLoggedInUser();
    const uid  = user.user_id || user.userId;
    if (!uid) return [];
    try {
      const resp = await fetch(`/api/user/${uid}`);
      const data = await resp.json();
      return Array.isArray(data?.notifications) ? data.notifications.slice(0, 20) : [];
    } catch { return []; }
  }

  /* ── render history dropdown panel ────────────────────────────────────── */
  let cachedNotifs = [];

  function ensurePanel() {
    if (document.getElementById('hn-bn-panel')) return;
    // panel is created by notifications.js initBell()
  }

  async function renderBellList() {
    ensurePanel();
    const list  = document.getElementById('hn-notif-list');
    const count = document.getElementById('hn-bell-count-pill');
    if (!list) return;

    const history  = getHistory().slice(-50).reverse();
    const unread   = history.filter(n => !n.read).length;

    if (count) { count.textContent = unread > 99 ? '99+' : String(unread); }

    if (!history.length) {
      list.innerHTML = '<div class="hn-notif-empty">No notifications yet.<br>Keep learning!</div>';
      return;
    }

    list.innerHTML = history.map((n, i) => `
      <div class="hn-notif-item ${n.read ? '' : 'unread'}" data-hi="${i}">
        <div class="hn-notif-item-dot"></div>
        <div style="flex:1;min-width:0">
          <div class="hn-notif-body-title">${esc(n.title || 'Notification')}</div>
          ${n.message ? `<div class="hn-notif-body-msg">${esc(n.message)}</div>` : ''}
          <div class="hn-notif-body-time">${n.sts || fmtTime(n.ts) || ''}</div>
        </div>
        <button class="hn-notif-del" data-dismiss="${i}" aria-label="Dismiss">&times;</button>
      </div>
    `).join('');

    list.querySelectorAll('.hn-notif-del').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const idx  = +btn.dataset.dismiss;
        removeFromHistory(idx);
        renderBellList();
        refreshBadge();
      };
    });
  }

  function refreshBadge() {
    const badge = document.getElementById('hn-bell-badge');
    const pill  = document.getElementById('hn-bell-count-pill');
    const unread = (getHistory() || []).filter(n => !n.read).length;
    if (badge) { badge.textContent = unread > 99 ? '99+' : String(unread); badge.classList.toggle('show', unread > 0); }
    if (pill)  { pill.textContent  = unread > 99 ? '99+' : String(unread); }
  }

  function markAllRead() {
    saveHistory((getHistory() || []).map(n => ({ ...n, read: true })));
    renderBellList();
    refreshBadge();
  }

  function clearAll() {
    saveHistory([]);
    renderBellList();
    refreshBadge();
  }

  function removeFromHistory(idx) {
    const all = getHistory();
    all.splice(all.length - 1 - idx, 1);
    saveHistory(all);
  }

  /* ── esc ──────────────────────────────────────────────────────────────── */
  function esc(s) {
    try { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
    catch { return ''; }
  }

  /* ── init ─────────────────────────────────────────────────────────────── */
  function init() {
    ensurePanel();
    refreshBadge();
    // wire up mark-all & clear in the bell panel
    const markAllBtn = document.getElementById('hn-clear-all');
    const clearBtn   = document.getElementById('hn-dismiss-all');
    if (markAllBtn) markAllBtn.addEventListener('click', e => { e.stopPropagation(); markAllRead(); });
    if (clearBtn)   clearBtn.addEventListener('click',   e => { e.stopPropagation(); clearAll();   });
  }

  window.HanverseNotifClient = {
    init,
    renderBellList,
    refreshBadge,
    markAllRead,
    clearAll,
    getHistory,
    saveHistory,
    getLoggedInUser,
    fetchNotifsFromDB,
    esc,
    fmtTime,
  };

})();
