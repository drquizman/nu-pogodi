import {WORLD_CUP_2022} from './tv-history.js';
import {pickZone} from './tv-series.js';
import {WEB_FORWARDS} from './web-forwards.js';

const goalZones = [[0, 4, 8], [1, 2, 5, 6, 9, 10], [3, 7, 11]];
const directionNames = ['влево', 'по центру', 'вправо'];
const shots = WEB_FORWARDS;
const matchShooters = WORLD_CUP_2022.shots;
const benchmark = matchShooters.map(player => player.saved);
const benchmarkSaves = benchmark.filter(Boolean).length;
const recordKey = 'penalty-web-forwards-best-v1';

export function pickScoutedZone(scouting, random = Math.random) {
  const direction = pickZone(scouting, random);
  const zones = goalZones[direction];
  return zones[Math.floor(random() * zones.length)];
}

export function initWebSeries() {
  const get = id => document.getElementById(id);
  const screen = get('match-screen');
  const map = get('goal-map');
  const bands = [...get('goal-zones').children];
  const final = get('final-score');
  let results = [];
  let best = 0;
  try { best = Number(localStorage.getItem(recordKey)) || 0; } catch {}

  const current = () => shots[results.length];
  const complete = () => results.length === shots.length;

  function attempts(id, roster, outcomes) {
    get(id).replaceChildren(...roster.map((player, index) => {
      const saved = outcomes[index];
      const marker = document.createElement('span');
      marker.dataset.outcome = saved === undefined ? 'pending' : saved ? 'save' : 'goal';
      marker.textContent = saved === undefined ? String(index + 1) : saved ? '✓' : '×';
      marker.setAttribute('aria-label', `${player.name} · ${saved === undefined ? 'ожидается удар' : saved ? 'сейв' : 'гол'}`);
      return marker;
    }));
  }

  function showFinal() {
    const saves = results.filter(Boolean).length;
    get('series-step').textContent = 'Серия завершена';
    get('final-title').textContent = saves > benchmarkSaves ? 'Ты обошёл Мартинеса'
      : saves === benchmarkSaves ? 'На равных с Мартинесом' : 'Мартинес впереди';
    get('player-score').textContent = `${saves}/${shots.length}`;
    get('keeper-score').textContent = `${benchmarkSaves}/${matchShooters.length}`;
    get('best-score').textContent = `Твой рекорд · ${best}/${shots.length}`;
    attempts('player-attempts', shots, results);
    attempts('keeper-attempts', matchShooters, benchmark);
    screen.dataset.stage = 'final';
    final.hidden = false;
  }

  function preview() {
    if (complete()) {
      showFinal();
      return;
    }
    const player = current();
    const index = results.length;
    const count = player.scouting.reduce((sum, weight) => sum + weight, 0);
    get('shooter-shirt').dataset.kit = player.kit;
    get('shooter-shirt').style.setProperty('--kit-ink',player.ink);
    get('shirt-art-number').textContent = String(player.number);
    get('series-step').textContent = `Удар ${index + 1} / ${shots.length}`;
    get('shooter').textContent = player.name;
    get('shooter-number').textContent = `№ ${player.number}`;
    get('shooter-team').textContent = player.team;
    get('goal-sample').textContent = `Выборка · ${count} ударов за сборную`;
    bands.forEach((band, direction) => {
      const hits = player.scouting[direction];
      const chance = hits / count;
      band.querySelector('strong').textContent = `${Math.round(chance * 100)}%`;
      band.querySelector('small').textContent = `${hits} из ${count}`;
      band.style.setProperty('--heat', chance);
    });
    attempts('round-progress', shots, results);
    final.hidden = true;
    map.hidden = false;
    screen.dataset.stage = 'scout';
  }

  preview();
  return {
    get complete() { return complete(); },
    get player() { return current(); },
    nextShot() { return pickScoutedZone(current().scouting); },
    preview,
    kick() {
      map.hidden = true;
      screen.dataset.stage = 'live';
    },
    restart() { results = []; },
    record(saved, zone) {
      if (complete()) return true;
      const direction = goalZones.findIndex(zones => zones.includes(zone));
      if (direction >= 0) get('result-sub').textContent = `Удар ${directionNames[direction]}`;
      results.push(saved);
      attempts('round-progress', shots, results);
      screen.dataset.stage = 'result';
      if (complete()) {
        best = Math.max(best, results.filter(Boolean).length);
        try { localStorage.setItem(recordKey, String(best)); } catch {}
      }
      return complete();
    },
  };
}
