import {ZONES} from './zones.js';
import {WORLD_CUP_2022} from './tv-history.js';

export const TARGET_SAVES = 2;
export const SHOOTERS = [
  {name:'Максим Соколов', style:'Предпочитает левую сторону', weights:[10,2,1,4,25,7,3,9,27,7,2,3]},
  {name:'Артём Волков', style:'Часто бьёт вправо и выше пояса', weights:[4,2,7,24,4,3,10,24,2,3,8,9]},
  {name:'Денис Миронов', style:'Любит внутренние зоны', weights:[5,7,8,4,5,17,20,4,3,14,10,3]},
  {name:'Лев Беляев', style:'Часто целится под перекладину', weights:[22,5,4,16,15,4,3,13,7,3,2,6]},
  {name:'Роман Ким', style:'Почти всегда бьёт низом', weights:[2,2,1,3,3,5,4,7,20,12,14,27]},
];

export function pickZone(weights, random = Math.random) {
  let ticket = random() * weights.reduce((sum, weight) => sum + weight, 0);
  return weights.findIndex(weight => (ticket -= weight) < 0);
}

const emptyStats = {played:0, won:0, saves:0, best:0};
const training = {key:'penalty-tv-series-v1', label:'Тренировка', shots:SHOOTERS};
const history = {...WORLD_CUP_2022, key:'penalty-tv-world-cup-2022-v1', label:'ЧМ-2022'};
const historicalSaves = history.shots.filter(shot => shot.saved).length;

function loadStats(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    if (Object.keys(emptyStats).every(key => Number.isSafeInteger(value?.[key]) && value[key] >= 0)) return value;
  } catch {}
  return {...emptyStats};
}

export function initSeries() {
  const get = id => document.getElementById(id);
  const modeButton = get('series-mode');
  const cells = ZONES.map(zone => {
    const cell = document.createElement('span');
    cell.setAttribute('aria-label', zone.label);
    return cell;
  });
  get('shot-map').replaceChildren(...cells);
  const directions = [...get('scouting-directions').children];
  let mode = history;
  let stats = loadStats(mode.key);
  let results = [];
  const player = () => mode.shots[results.length];
  const complete = () => results.length === mode.shots.length;
  const saveCount = () => results.filter(Boolean).length;

  function showAttempts(id, outcomes, label) {
    const chips = mode.shots.map((shot, index) => {
      const chip = document.createElement('span');
      const outcome = outcomes[index];
      chip.dataset.outcome = outcome === undefined ? 'pending' : outcome ? 'save' : 'goal';
      chip.textContent = outcome === undefined ? index + 1 : outcome ? '✓' : '×';
      chip.setAttribute('aria-label', `${shot.name} · ${outcome === undefined ? 'ожидается удар' : outcome ? 'сейв' : 'гол'}`);
      return chip;
    });
    if (label) {
      const heading = document.createElement('small');
      heading.textContent = label;
      chips.unshift(heading);
    }
    get(id).replaceChildren(...chips);
  }

  function tally() {
    const saves = saveCount();
    const total = mode.shots.length;
    const historical = mode === history;
    const compare = historical && complete();
    get('series-tally').textContent = historical ? `Твои сейвы · ${saves} из ${total}` : `Сейвы ${saves}/${TARGET_SAVES} · рекорд ${stats.best}/${total}`;
    get('series-history').textContent = stats.played
      ? historical
        ? `Рекорд ${stats.best}/${total} · серий ${stats.played}`
        : `Побед ${stats.won} из ${stats.played} · сейвов ${Math.round(100 * stats.saves / (stats.played * total))}%`
      : 'Статистика появится после первой серии';
    showAttempts('series-attempts', results, compare ? 'Ты' : '');
    get('keeper-attempts').hidden = !compare;
    get('keeper-tally').hidden = !compare;
    if (compare) {
      showAttempts('keeper-attempts', history.shots.map(shot => shot.saved), 'Матч');
      get('keeper-tally').textContent = `${history.keeper} · ${historicalSaves} из ${total}`;
    }
  }

  function preview() {
    if (complete()) return;
    const current = player();
    const historical = mode === history;
    if (modeButton) modeButton.textContent = mode.label;
    get('series-step').textContent = `Удар ${results.length + 1} из ${mode.shots.length}`;
    get('series-context').hidden = !historical;
    get('series-context').textContent = mode.context ?? '';
    get('shooter').textContent = current.name;
    get('shot-map').hidden = historical;
    get('scouting-directions').hidden = !historical;
    get('shot-map-caption').hidden = false;
    if (historical) {
      const sample = current.scouting.reduce((sum, count) => sum + count, 0);
      get('shooter-style').textContent = sample ? 'Пенальти до матча' : 'Нет подтверждённых направлений';
      get('scouting-directions').hidden = !sample;
      directions.forEach((cell, index) => {
        const count = current.scouting[index];
        cell.querySelector('strong').textContent = `${count}/${sample || 1}`;
        cell.style.setProperty('--heat', sample ? count / sample * .64 : 0);
      });
      get('shot-map-caption').textContent = sample
        ? 'Проверенная выборка · вид из ворот'
        : 'Мало данных о прошлых ударах';
      get('series-review').textContent = sample <= 2 && sample > 0 ? 'Малая выборка. Следи за мячом.' : 'Приготовься к свистку.';
    } else {
      get('shooter-style').textContent = current.style;
      get('shot-map-caption').textContent = 'Игровой профиль · вид из ворот';
      get('series-review').textContent = 'Изучи карту и приготовься к свистку.';
      cells.forEach((cell, index) => {
        cell.textContent = `${current.weights[index]}%`;
        cell.style.setProperty('--heat', current.weights[index] / 32);
      });
    }
    tally();
  }

  preview();
  return {
    get complete() { return complete(); },
    nextShot() { return mode === history ? player().target : pickZone(player().weights); },
    preview,
    kick() { get('series-review').textContent = 'Следи за разбегом и мячом.'; },
    switchMode() {
      mode = mode === history ? training : history;
      stats = loadStats(mode.key);
    },
    restart() { results = []; },
    record(saved, zone, defense) {
      if (complete()) return true;
      const current = player();
      results.push(saved);
      if (complete()) {
        const saves = saveCount();
        stats.played++;
        stats.won += Number(mode === history ? saves > historicalSaves : saves >= TARGET_SAVES);
        stats.saves += saves;
        stats.best = Math.max(stats.best, saves);
        try { localStorage.setItem(mode.key, JSON.stringify(stats)); } catch {}
        get('series-step').textContent = 'Серия завершена';
        if (mode === history) {
          get('shooter').textContent = saves === historicalSaves ? 'Наравне с Мартинесом'
            : saves > historicalSaves ? 'Ты отбил больше' : 'Мартинес отбил больше';
        } else {
          get('shooter').textContent = saves >= TARGET_SAVES ? 'Ты выиграл серию' : 'Бьющие выиграли серию';
        }
        get('shooter-style').textContent = 'Опусти руки, затем покажи ладонь на 2 секунды, чтобы сыграть снова.';
        get('shot-map').hidden = true;
        get('scouting-directions').hidden = true;
        get('shot-map-caption').hidden = true;
      }
      const shot = current.direction ?? ZONES[zone]?.label ?? 'в створ';
      if (mode === history) {
        const realResult = current.saved ? 'Мартинес отбил этот удар.' : 'Мартинес пропустил этот удар.';
        get('series-review').textContent = `Удар ${shot}. ${realResult}`;
      } else {
        const choice = ZONES[defense]?.label ?? 'стойка по центру';
        get('series-review').textContent = `Удар — ${shot}. Твой выбор — ${choice}.`;
      }
      tally();
      return complete();
    },
  };
}
