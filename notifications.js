/* =====================================================
   Hanverse Notification System
   Interactive · Child-Friendly · Dope Animations
   ===================================================== */

// Idempotent guard: avoid re-defining Notify if script is loaded twice
if (!window.Notify || typeof window.Notify.toast !== 'function') {

  const Notify = (() => {
    /* ─────────────── CONFIG ─────────────── */
    const TYPE = {
      success:  { emoji: '✅', label: 'Success' },
      warn:     { emoji: '⚠️', label: 'Heads up!' },
      info:     { emoji: '💡', label: 'Heads up!' },
      error:    { emoji: '❌', label: 'Oops!' },
      star:     { emoji: '⭐', label: 'Star!' },
      xp:       { emoji: '✨', label: '+XP' },
      streak:   { emoji: '🔥', label: 'Streak!' },
      streak2:  { emoji: '💖', label: '7 Day Streak!' },
      lock:     { emoji: '🔒', label: 'Unlock!' },
      heart:    { emoji: '💜', label: 'Great Job!' },
    };

    /* ─────────────── NOTIFICATION HISTORY ─────────────── */
    const HN_HISTORY_KEY  = 'hanverse_notification_history';
    const MAX_HISTORY     = 200;

    function loadHistory() {
      try { return JSON.parse(localStorage.getItem(HN_HISTORY_KEY) || '[]'); }
      catch { return []; }
    }

    function saveHistoryRaw(entries) {
      const trimmed = (entries || []).slice(-MAX_HISTORY);
      localStorage.setItem(HN_HISTORY_KEY, JSON.stringify(trimmed));
    }

    function addHistoryEntry(entry) {
      const history = loadHistory();
      const ts      = entry.ts || Date.now();
      const id      = String(entry.id || entry.title || ts);

      // dedupe within ±10s window
      const isRecentDup = history.some(h => {
        const hTs = h.ts || 0;
        return Math.abs(hTs - ts) < 10_000 && (h.id === id || h.title === (entry.title || ''));
      });
      if (isRecentDup) return;

      if (entry.sts === undefined) {
        const d   = (ts instanceof Date) ? ts : new Date(ts);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) {
          entry.sts = d.toLocaleTimeString('en', { timeZoneName: 'long' });
        } else {
          entry.sts = d.toLocaleString('en', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'long' });
        }
      }

      history.push({ ...entry, ts, id });
      saveHistoryRaw(history);
    }

    /* ─────────────── TOAST ─────────────── */
    let activeToasts = [];
    let gsapCount = 0;

    function injectHost() {
      const host = document.createElement('div');
      host.id = 'n-host';
      Object.assign(host.style, {
        position: 'fixed', bottom: '20px', right: '20px',
        zIndex: '99999', display: 'flex',
        flexDirection: 'column-reverse', gap: '10px',
        pointerEvents: 'none',
      });
      document.body.appendChild(host);

      const style = document.createElement('style');
      style.textContent = NOTIFY_CSS;
      document.head.appendChild(style);

      initBell();
    }

    function toast(msg, type = 'info', duration = 3000) {
      const cfg  = TYPE[type] || TYPE.info;
      const ts   = Date.now();
      const id   = `${type}_${ts}`;

      const el = document.createElement('div');
      el.className = 'n-toast n-toast--' + type;
      el.innerHTML = `
        <span class="n-emoji">${cfg.emoji}</span>
        <div class="n-body">
          <span class="n-type">${cfg.label}</span>
          <span class="n-msg">${msg}</span>
        </div>
        <button class="n-close" aria-label="Close">&times;</button>
      `;

      addHistoryEntry({ id, ts, title: cfg.label, message: msg, type });

      document.getElementById('n-host') || injectHost();
      document.getElementById('n-host').appendChild(el);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => el.classList.add('show'));
      });

      el.querySelector('.n-close').onclick = () => dismiss(el);
      const timer = setTimeout(() => dismiss(el), duration);
      el._timer = timer;

      activeToasts.push(el);
      gsapCount++;
      return el;
    }

    function dismiss(el) {
      clearTimeout(el._timer);
      if (!el.parentNode) return;
      el.classList.remove('show');
      setTimeout(() => { el.remove(); }, 420);
      activeToasts = activeToasts.filter(e => e !== el);
    }

    function hideAll() { activeToasts.forEach(dismiss); }

    /* ─────────────── CONFETTI ─────────────── */
    let confettiActive = false;

    function confetti(opts = {}) {
      const {
        particleCount = 120,
        duration      = 2200,
        spread        = 360,
        colors        = ['#E63946','#F4D35E','#4EA8DE','#74C69D','#FF6B6B','#7BC7F4','#FFE66D'],
        originY       = 0.55,
      } = opts;

      if (confettiActive) return;
      confettiActive = true;

      const canvas = document.createElement('canvas');
      canvas.id = 'n-confetti';
      Object.assign(canvas.style, {
        position:'fixed', top:0, left:0, width:'100%', height:'100%',
        pointerEvents:'none', zIndex:'9999',
      });
      document.body.appendChild(canvas);

      const ctx = canvas.getContext('2d');
      let W, H, particles = [], raf;

      function resize() {
        W = canvas.width  = window.innerWidth;
        H = canvas.height = window.innerHeight;
      }
      resize();
      window.addEventListener('resize', resize);

      for (let i = 0; i < particleCount; i++) {
        particles.push({
          color:      colors[i % colors.length],
          x:          W / 2,
          y:          H * originY,
          radius:     Math.random() * 6 + 3,
          theta:      (Math.random() - 0.5) * (spread * Math.PI / 180),
          velocity:   Math.random() * 9 + 4,
          gravity:    Math.random() * 0.35 + 0.15,
          wind:       (Math.random() - 0.5) * 2,
          spin:       (Math.random() - 0.5) * 0.3,
          shape:      Math.random() > 0.55 ? 'rect' : 'circle',
          alpha:      1,
          life:       duration / 1000,
        });
      }

      const startTime = performance.now();
      function frame(now) {
        ctx.clearRect(0, 0, W, H);
        let alive = false;

        for (const p of particles) {
          const elapsed = (now - startTime) / 1000;
          p.alpha = Math.max(0, 1 - elapsed / p.life);
          if (p.alpha <= 0) continue;

          const vx = Math.sin(p.theta) * p.velocity + p.wind;
          const vy = -p.velocity * 0.6;
          p.x += vx;
          p.y += vy + p.gravity * elapsed * 40;
          p.velocity *= 0.985;
          p.theta  += p.spin;

          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle   = p.color;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.theta);

          if (p.shape === 'circle') {
            ctx.beginPath();
            ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillRect(-p.radius * 1.4, -p.radius * 0.6, p.radius * 2.8, p.radius * 1.2);
          }
          ctx.restore();
          alive = true;
        }

        if (alive) raf = requestAnimationFrame(frame);
        else { cancelAnimationFrame(raf); finish(); }
      }

      function finish() {
        confettiActive = false;
        canvas.remove();
        window.removeEventListener('resize', resize);
      }

      raf = requestAnimationFrame(frame);
    }

    function miniConfetti() { confetti({ particleCount: 60, duration: 1200 }); }

    /* ─────────────── XP ANIMATION ─────────────── */
    function showXP(xp, x, y, container) {
      const el = document.createElement('div');
      el.className = 'n-xp-pop';
      el.innerHTML = `<span>+${xp}</span><small>XP</small>`;

      if (x !== undefined && y !== undefined) {
        el.style.left = x + 'px';
        el.style.top  = y + 'px';
        el.classList.add('n-xp-pop--fixed');
      }

      if (container) container.appendChild(el);
      else document.getElementById('n-host') || injectHost();

      document.getElementById('n-host').appendChild(el);

      requestAnimationFrame(() => { requestAnimationFrame(() => el.classList.add('show')); });
      setTimeout(() => {
        if (!el.parentNode) return;
        el.classList.remove('show');
        setTimeout(() => el.remove(), 600);
      }, 1800);
    }

    /* ─────────────── STREAK FIRE ─────────────── */
    function streakFire(days) {
      toast(
        days >= 7 ? ` ${days}-Day Streak! You are on FIRE 🔥🔥🔥` : `${days}-Day Streak! Keep it up! 🔥`,
        'streak2', 4000
      );
      miniConfetti();
    }

    /* ─────────────── ACH/LEVEL (minimal, keep API) ─────────────── */
    const ACHIEVEMENTS = [
      { emoji: '🎯',        text: 'First Lesson Done!',   desc: 'You completed your very first lesson.' },
      { emoji: '🔥',        text: '3-Day Streak!',        desc: 'Learning 3 days in a row!' },
      { emoji: '💖',        text: '7-Day Streak!',        desc: 'You are on FIRE this week!' },
      { emoji: '🏆',        text: 'Level 5 Reached!',     desc: 'Your Mandarin is growing!' },
    ];

    let _seenMap = null;
    function _loadSeen(){
      const raw = localStorage.getItem('hanverse_notify_seen');
      _seenMap = raw ? new Set(JSON.parse(raw)) : new Set();
    }
    function _markSeen(key){
      if(!_seenMap) _loadSeen();
      _seenMap.add(String(key));
      localStorage.setItem('hanverse_notify_seen', JSON.stringify([..._seenMap]));
    }

    function achievementUnlock(idx, key) {
      const id = key !== undefined ? String(key) : ('ach_' + idx);
      if(!_seenMap) _loadSeen();
      if(_seenMap.has(id)) return;
      _markSeen(id);

      const a = ACHIEVEMENTS[idx % ACHIEVEMENTS.length];
      const overlay = document.createElement('div');
      overlay.className = 'n-ach-overlay';
      overlay.innerHTML = `
        <div class="n-ach-card" role="dialog" aria-modal="true">
          <div class="n-ach-glow"></div>
          <div class="n-ach-ring">◆</div>
          <div class="n-ach-emoji">${a.emoji}</div>
          <div class="n-ach-title">Achievement Unlocked!</div>
          <div class="n-ach-name">${a.text}</div>
          <div class="n-ach-desc">${a.desc}</div>
          <button class="n-ach-btn">Awesome!</button>
        </div>
      `;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('show'));
      overlay.querySelector('.n-ach-btn').onclick = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 400);
      };
      confetti({ particleCount: 80, duration: 1800 });
    }

    function levelUp(newLevel, key) {
      const id = key !== undefined ? String(key) : ('lvl_' + newLevel);
      if(!_seenMap) _loadSeen();
      if(_seenMap.has(id)) return;
      _markSeen(id);

      const overlay = document.createElement('div');
      overlay.className = 'n-ach-overlay';
      overlay.innerHTML = `
        <div class="n-lv-card" role="dialog" aria-modal="true">
          <div class="n-lv-glow"></div>
          <div class="n-lv-rings"><span>⭐</span><span>🌟</span><span>💫</span><span>⭐</span></div>
          <div class="n-lv-icon">⬆️</div>
          <div class="n-lv-title">LEVEL UP!</div>
          <div class="n-lv-num">Level ${newLevel}</div>
          <div class="n-lv-sub">You are getting really good! Keep going!</div>
          <button class="n-ach-btn">Yay!</button>
        </div>
      `;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('show'));
      overlay.querySelector('.n-ach-btn').onclick = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 400);
      };
      confetti({ particleCount: 150, duration: 2500 });
    }

    /* ─────────────── BELL (minimal, keep API used by pages) ─────────────── */
    function getUnreadCount() {
      const history = loadHistory();
      return history.filter(n => !n.read).length;
    }

    function markAllRead(skipSync) {
      const history = loadHistory().map(n => ({ ...n, read: true }));
      saveHistoryRaw(history);
      if (!skipSync) renderBellList();
      updateBellBadge(0);
    }

    function clearAllHistory() {
      saveHistoryRaw([]);
      renderBellList();
      updateBellBadge(0);
    }

    function initBell() {
      injectBellCSS();
      injectBellHTML();
      updateBellBadge(getUnreadCount());
    }

    function injectBellCSS() {
      if (document.getElementById('hn-bell-css')) return;
      const css = document.createElement('style');
      css.id   = 'hn-bell-css';
      css.textContent = `
        .hn-nb-wrap{position:fixed;top:10px;right:12px;z-index:20000;display:flex;flex-direction:column;align-items:flex-end;gap:8px;}
        .hn-bell-btn{position:relative;border:none;background:var(--n-surface,#fff);border-radius:50%;width:38px;height:38px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:17px;box-shadow:0 4px 14px rgba(0,0,0,.12);border:1px solid var(--n-border,#E5E7EB);transition:transform .18s;z-index:20001;}
        .hn-bell-btn:active{transform:scale(.9);}
        .hn-bell-badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#E63946;color:#fff;font-weight:900;font-size:11px;display:none;align-items:center;justify-content:center;z-index:20002;}
        .hn-bell-badge.show{display:flex;}
        .hn-notif-panel{position:absolute;top:46px;right:0;width:320px;max-width:calc(100vw - 20px);max-height:420px;background:#fff;border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,.18);border:1px solid #E5E7EB;z-index:20000;display:none;flex-direction:column;overflow:hidden;animation:hn-pop .2s ease-out;}
        .hn-notif-panel.open{display:flex;}
        @keyframes hn-pop{from{opacity:0;transform:translateY(-6px) scale(.95);}to{opacity:1;transform:translateY(0) scale(1);}}
        .hn-notif-head{padding:14px 16px;border-bottom:1px solid #E5E7EB;display:flex;align-items:center;gap:8px;background:linear-gradient(135deg,#FFFDF7,#fff);cursor:pointer;}
        .hn-notif-head-title{font-weight:800;font-size:15px;flex:1;color:#1A1A2E;}
        .hn-notif-head-row{display:flex;align-items:center;gap:6px;}
        .hn-notif-count{background:#F4D35E;color:#333;font-weight:800;font-size:11px;padding:2px 8px;border-radius:999px;}
        .hn-notif-clear{background:none;border:none;color:#6B7280;font-size:11px;cursor:pointer;font-weight:600;}
        .hn-notif-clear:hover{color:#E63946;}
        .hn-notif-list{overflow-y:auto;flex:1;padding:8px 0;}
        .hn-notif-empty{padding:30px 16px;text-align:center;color:#9CA3AF;font-size:.85rem;}
        .hn-notif-del{background:none;border:none;cursor:pointer;font-size:14px;color:#bbb;padding:0 4px;line-height:1;transition:color .2s;flex-shrink:0;}
        .hn-notif-del:hover{color:#E63946;}
        .hn-notif-item{display:flex;gap:10px;align-items:flex-start;padding:10px 16px;transition:background .15s;cursor:default;}
        .hn-notif-item:hover{background:#F9FAFB;}
        .hn-notif-item + .hn-notif-item{border-top:1px solid #F3F4F6;}
        .hn-notif-item-dot{width:8px;height:8px;border-radius:50%;background:#4EA8DE;flex-shrink:0;margin-top:7px;}
        .hn-notif-item.unread .hn-notif-item-dot{background:#E63946;}
        .hn-notif-body{flex:1;min-width:0;}
        .hn-notif-body-title{font-weight:700;font-size:13px;color:#1A1A2E;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .hn-notif-body-msg{font-size:12px;color:#6B7280;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
        .hn-notif-body-time{font-size:11px;color:#9CA3AF;margin-top:3px;}
      `;
      document.head.appendChild(css);
    }

    function injectBellHTML() {
      if (document.getElementById('hn-bn-panel')) return;

      const wrap = document.createElement('div');
      wrap.className = 'hn-nb-wrap';
      wrap.id        = 'hn-nb-root';
      wrap.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
          <button id="hn-bell-btn" class="hn-bell-btn" aria-label="Notifications" title="Notifications">
            🔔
            <span id="hn-bell-badge" class="hn-bell-badge" aria-live="polite" aria-atomic="true">0</span>
          </button>
        </div>
        <div id="hn-bn-panel" class="hn-notif-panel" role="menu">
          <div class="hn-notif-head" id="hn-notif-head" role="button" tabindex="0" aria-label="Show all notifications">
            <span class="hn-notif-head-title">🔔&nbsp;Notifications</span>
            <div class="hn-notif-head-row">
              <span id="hn-bell-count-pill" class="hn-notif-count" aria-hidden="true">0</span>
              <button class="hn-notif-clear" id="hn-clear-all" aria-label="Mark all read">Mark all read</button>
              <button class="hn-notif-del" id="hn-dismiss-all" aria-label="Dismiss all" title="Dismiss all">✕</button>
            </div>
          </div>
          <div class="hn-notif-list" id="hn-notif-list" role="log"></div>
        </div>
      `;
      document.body.appendChild(wrap);

      const btn    = document.getElementById('hn-bell-btn');
      const panel  = document.getElementById('hn-bn-panel');
      const head   = document.getElementById('hn-notif-head');
      let _open = false;

      function togglePanel() {
        _open = !_open;
        panel.classList.toggle('open', _open);
        if (_open) renderBellList();
      }
      function closePanel() { _open = false; panel.classList.remove('open'); }

      btn.addEventListener('click', e => { e.stopPropagation(); togglePanel(); });
      head.addEventListener('click', e => { e.stopPropagation(); togglePanel(); });
      document.addEventListener('click', () => { if (_open) closePanel(); });
      panel.addEventListener('click', e => e.stopPropagation());

      document.getElementById('hn-clear-all').addEventListener('click', e => {
        e.stopPropagation();
        markAllRead(true);
        closePanel();
      });
      document.getElementById('hn-dismiss-all').addEventListener('click', e => {
        e.stopPropagation();
        clearAllHistory();
        closePanel();
      });
    }

    function updateBellBadge(count) {
      injectBellCSS();
      injectBellHTML();
      const badge = document.getElementById('hn-bell-badge');
      const pill  = document.getElementById('hn-bell-count-pill');
      const str = String(count > 99 ? '99+' : count);
      if (badge) { badge.textContent = str; badge.classList.toggle('show', count > 0); }
      if (pill)  { pill.textContent  = str; }
    }

    function renderBellList() {
      const list = document.getElementById('hn-notif-list');
      if (!list) return;

      const history = loadHistory().slice(-50).reverse();
      if (!history.length) {
        list.innerHTML = '<div class="hn-notif-empty">No notifications yet.<br>Keep learning!</div>';
        return;
      }

      const typeLabel = { success: '✅', warn: '⚠️', info: '💡', error: '❌', star: '⭐', xp: '✨', streak: '🔥', streak2: '💖', lock: '🔒', heart: '💜' };

      list.innerHTML = history.map((n, i) => {
        if (!n.sts && n.ts) {
          const d = new Date(n.ts);
          const now = new Date();
          n.sts = (d.toDateString() === now.toDateString())
            ? d.toLocaleTimeString('en', { timeZoneName: 'long' })
            : d.toLocaleString('en', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'long' });
        }
        const isUnread = !n.read;
        const emoji = typeLabel[n.type] || (n.emoji || '🔔');
        return `<div class="hn-notif-item${isUnread ? ' unread' : ''}" data-idx="${i}">
          <div class="hn-notif-item-dot"></div>
          <div class="hn-notif-body">
            <div class="hn-notif-body-title">${esc(n.title || 'Notification')}</div>
            ${n.message ? `<div class="hn-notif-body-msg">${esc(n.message)}</div>` : ''}
            <div class="hn-notif-body-time">${n.sts || n.ts_str || ''}</div>
          </div>
          <button class="hn-notif-del" data-dismiss="${i}" aria-label="Dismiss">&times;</button>
        </div>`;
      }).join('');

      list.querySelectorAll('.hn-notif-del').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const idx  = parseInt(btn.dataset.dismiss, 10);
          const hist = loadHistory();
          hist.splice(hist.length - 1 - idx, 1);
          saveHistoryRaw(hist);
          renderBellList();
          updateBellBadge(getUnreadCount());
        });
      });
    }

    function esc(s) {
      try { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'<').replace(/>/g,'>').replace(/"/g,'"'); }
      catch { return ''; }
    }

    /* ─────────────── public API ─────────────── */
    return {
      toast,
      dismiss,
      hideAll,
      confetti,
      miniConfetti,
      showXP,
      achievementUnlock,
      levelUp,
      streakFire,
      initBell,
      markAllRead,
      clearAllHistory,
      getUnreadCount,
      history: {
        load: loadHistory,
        save: saveHistoryRaw,
        add: addHistoryEntry,
      },
      esc,
    };
  })();

  // make available globally
  window.Notify = Notify;
}

/* ──────────────────── GLOBAL CSS ──────────────────── */
const NOTIFY_CSS = `
/* ── Toast ── */
.n-toast{
  display:flex;align-items:center;gap:12px;
  padding:14px 16px;
  background:#fff;
  border-radius:18px;
  box-shadow:0 12px 36px rgba(0,0,0,.16);
  pointer-events:all;
  min-width:260px;
  max-width:360px;
  transform:translateX(120%) translateY(0) scale(.85);
  transition:transform .4s cubic-bezier(.34,1.56,.64,1),
             opacity .35s ease .05s;
  opacity:0;
  border-left:5px solid #4EA8DE;
}
.n-toast.show{
  transform:translateX(0) translateY(0) scale(1);
  opacity:1;
}
.n-toast--success{  border-left-color:#74C69D; }
.n-toast--warn     { border-left-color:#F4D35E; }
.n-toast--info     { border-left-color:#4EA8DE; }
.n-toast--error    { border-left-color:#E63946; }
.n-toast--star     { border-left-color:#F4D35E; }
.n-toast--xp       { border-left-color:#74C69D; }
.n-toast--streak   { border-left-color:#FF6B6B; }
.n-toast--streak2  { border-left-color:#E63946; background:unset; }
.n-toast--lock     { border-left-color:#4EA8DE; }

.n-emoji{font-size:1.6rem;flex-shrink:0;animation:bounce .6s ease infinite alternate;}
.n-body{flex:1;min-width:0;}
.n-type{display:block;font-size:.65rem;font-weight:700;letter-spacing:.06em;
       text-transform:uppercase;margin-bottom:2px;opacity:.7;}
.n-msg{display:block;font-size:.9rem;font-weight:600;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.n-close{
  flex-shrink:0;border:none;background:none;cursor:pointer;
  font-size:1.1rem;color:#999;padding:0 4px;line-height:1;
  transition:color .2s;
}
.n-close:hover{color:#E63946;}

@keyframes bounce{
  0%{transform:translateY(0) scale(1);}
  100%{transform:translateY(-5px) scale(1.1);}
}

/* XP Popup */
.n-xp-pop{
  position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
  background:linear-gradient(135deg,#74C69D,#4EA8DE);
  color:#fff;padding:12px 28px;border-radius:30px;
  font-size:1.1rem;font-weight:800;
  pointer-events:none;opacity:0;transform:translateX(-50%) translateY(20px) scale(.5);
  transition:all .55s cubic-bezier(.34,1.56,.64,1);
  box-shadow:0 8px 28px rgba(116,198,157,.45);
  z-index:99998;
}
.n-xp-pop.show{opacity:1;transform:translateX(-50%) translateY(0) scale(1);}
.n-xp-pop small{display:block;font-size:.65rem;font-weight:500;opacity:.9;letter-spacing:.1em;}
.n-xp-pop--fixed{position:fixed;}

/* Confetti/badge/modal keyframes (minimal) */
.n-ach-overlay{
  position:fixed;inset:0;
  background:rgba(0,0,0,.55);
  backdrop-filter:blur(8px);
  -webkit-backdrop-filter:blur(8px);
  display:flex;align-items:center;justify-content:center;
  z-index:100000;
  opacity:0;pointer-events:none;
  transition:opacity .3s ease;
}
.n-ach-overlay.show{opacity:1;pointer-events:all;}
.n-ach-card,.n-lv-card{background:linear-gradient(160deg,#FFF8F0,#FFFDE7,#F0F9FF);border-radius:36px;padding:50px 40px 36px;text-align:center;min-width:310px;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.2);transform:scale(.7) translateY(40px);transition:transform .5s cubic-bezier(.34,1.56,.64,1);}
.n-ach-overlay.show .n-ach-card,.n-ach-overlay.show .n-lv-card{transform:scale(1) translateY(0);}
.n-ach-glow{position:absolute;inset:0;border-radius:36px;background:radial-gradient(ellipse at 50% 30%,rgba(244,211,94,.4) 0%,transparent 65%);pointer-events:none;}
.n-ach-btn{background:linear-gradient(135deg,#E63946,#FF6B6B);color:#fff;border:none;padding:13px 44px;border-radius:30px;font-size:1rem;font-weight:700;cursor:pointer;}
`;

// Auto-init (safe if bell functions not present yet)
(function autoInit(){
  try {
    if (window.Notify && typeof window.Notify.initBell === 'function') {
      window.Notify.initBell();
    }
  } catch(e) {}
})();

