import {cloud, ensureSession} from './cloud.js';

const queueKey = 'penalty-pending-stats-v1';
const maxAge = 24 * 60 * 60 * 1000;
const number = new Intl.NumberFormat('ru-RU');
const fields = ['series', 'saves', 'goals'];

export function initGlobalStats() {
  const template = document.getElementById('penalty-totals-template');
  const displays = [...document.querySelectorAll('[data-penalty-totals]')];
  for (const display of displays) display.append(template.content.cloneNode(true));
  const status = displays.map(display => display.querySelector('[data-totals-status]'));
  let room, totals, pending = [], sending = false, loading = false;
  const recent = entry => entry && Date.now() - entry.at < maxAge;
  try {
    const stored = JSON.parse(localStorage.getItem(queueKey));
    if (Array.isArray(stored)) pending = stored.filter(recent);
  } catch {}

  function render(data) {
    if (!fields.every(field => Number.isSafeInteger(data?.[field]) && data[field] >= 0)) return;
    if (totals && data.series < totals.series) return;
    totals = data;
    for (const display of displays) {
      for (const field of fields) display.querySelector(`[data-total="${field}"]`).textContent = number.format(data[field]);
    }
    for (const label of status) label.hidden = true;
  }

  function saveQueue() {
    try { localStorage.setItem(queueKey, JSON.stringify(pending)); } catch {}
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    try {
      const {data, error} = await cloud.rpc('np_get_penalty_stats');
      if (error) throw error;
      render(data);
    } catch {
      if (!totals) for (const label of status) label.textContent = 'Общая статистика пока недоступна';
    } finally { loading = false; }
  }

  async function flush() {
    if (sending || !pending.length) return;
    sending = true;
    try {
      await ensureSession();
      while (pending.length) {
        const entry = pending[0];
        if (recent(entry)) {
          const {data, error} = await cloud.rpc('np_report_penalty_series', entry.report);
          if (error && error.code !== '22023') break;
          if (!error) render(data);
        }
        pending.shift();
        saveQueue();
      }
    } catch {} finally { sending = false; }
  }

  function sync() {
    void flush();
    if (!document.hidden) void refresh();
  }
  window.addEventListener('online', sync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  setInterval(sync, 15000);
  sync();

  return {
    setRoom(seat) { room = seat; },
    record(saves) {
      if (!room) return;
      pending.push({at:Date.now(), report:{
        p_series_id:crypto.randomUUID(), p_room_id:room.id, p_host_key:room.hostKey, p_saves:saves,
      }});
      saveQueue();
      void flush();
    },
  };
}
