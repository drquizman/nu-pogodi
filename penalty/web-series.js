import {KEEPER_BENCHMARKS} from './tv-history.js';
import {WEB_FORWARDS} from './web-forwards.js';

const goalZones = [[0, 4, 8], [1, 2, 5, 6, 9, 10], [3, 7, 11]];
const directionNames = ['влево', 'по центру', 'вправо'];
const seriesSize = 5;
const recordKey = 'penalty-career-v1';
const oldRecordKey = 'penalty-web-forwards-best-v1';
const outcomes = {
  pending:['·','ожидается удар'],
  save:['✓','сейв'],
  goal:['×','гол'],
  miss:['–','мимо'],
};

function loadCareer() {
  const empty = {rounds:0, saves:0, best:0, directions:goalZones.map(() => [0,0])};
  const natural = n => Number.isSafeInteger(n) && n >= 0;
  try {
    const saved = JSON.parse(localStorage.getItem(recordKey));
    if (natural(saved?.rounds) && natural(saved.saves) && natural(saved.best)
        && saved.saves <= saved.rounds * seriesSize && saved.best <= seriesSize
        && Array.isArray(saved.directions) && saved.directions.length === goalZones.length
        && saved.directions.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(natural) && pair[0] <= pair[1])) return saved;
    const oldBest = Number(localStorage.getItem(oldRecordKey));
    if (natural(oldBest) && oldBest <= seriesSize) empty.best = oldBest;
  } catch {}
  return empty;
}

export function pickScoutedZone(scouting, random = Math.random) {
  let ticket = random() * scouting.reduce((sum, weight) => sum + weight, 0);
  const direction = scouting.findIndex(weight => (ticket -= weight) < 0);
  const zones = goalZones[direction];
  return zones[Math.floor(random() * zones.length)];
}

export function initWebSeries({onComplete} = {}) {
  const get = id => document.getElementById(id);
  const screen = get('match-screen');
  const map = get('goal-map');
  const bands = [...get('goal-zones').children];
  const final = get('final-score');
  const career = loadCareer();
  let results = [];
  let shots, keeper;

  function chooseSeries() {
    const offset = (career.rounds % WEB_FORWARDS.length) * seriesSize;
    shots = Array.from({length:seriesSize}, (_, index) => WEB_FORWARDS[(offset + index) % WEB_FORWARDS.length]);
    keeper = KEEPER_BENCHMARKS[career.rounds % KEEPER_BENCHMARKS.length];
    const saves = keeper.shots.filter(([, outcome]) => outcome === 'save').length;
    get('series-target').textContent = `${keeper.name.split(' ').at(-1).toUpperCase()} · ${saves}/${keeper.shots.length}`;
  }

  const current = () => shots[results.length];
  const complete = () => results.length === shots.length;

  function attempts(id, kicks) {
    get(id).replaceChildren(...kicks.map(([name, outcome]) => {
      const marker = document.createElement('span');
      marker.dataset.outcome = outcome;
      marker.textContent = outcomes[outcome][0];
      marker.setAttribute('aria-label', `${name} · ${outcomes[outcome][1]}`);
      return marker;
    }));
  }

  function playerAttempts(id) {
    attempts(id, shots.map((player, index) => [player.name, results[index]?.outcome ?? 'pending']));
  }

  function showFinal() {
    const saves = results.filter(result => result.outcome === 'save').length;
    const keeperSaves = keeper.shots.filter(([, outcome]) => outcome === 'save').length;
    get('series-step').textContent = 'Серия завершена';
    get('final-title').textContent = saves > keeperSaves ? 'Ты превзошёл результат'
      : saves === keeperSaves ? 'На равных' : 'Вратарь впереди';
    get('player-score').textContent = `${saves}/${shots.length}`;
    get('keeper-name').textContent = keeper.name;
    get('keeper-match').textContent = keeper.match;
    get('keeper-score').textContent = `${keeperSaves}/${keeper.shots.length}`;
    get('keeper-portrait').hidden = keeper.id !== 'martinez';
    get('career-rounds').textContent = career.rounds;
    get('career-rate').textContent = `${Math.round(career.saves * 100 / (career.rounds * seriesSize))}%`;
    get('best-score').textContent = `${career.best}/${seriesSize}`;
    [...get('career-directions').querySelectorAll('b')].forEach((value, direction) => {
      const [saved, total] = career.directions[direction];
      value.textContent = total ? `${saved}/${total}` : '—';
    });
    playerAttempts('player-attempts');
    attempts('keeper-attempts', keeper.shots);
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
    const count = player.scouting?.reduce((sum, weight) => sum + weight, 0);
    const archiveDirection = player.direction ?? goalZones.findIndex(zones => zones.includes(player.target));
    get('shooter-shirt').dataset.kit = player.kit;
    get('shooter-shirt').style.setProperty('--kit-ink',player.ink);
    get('shirt-art-number').textContent = String(player.number);
    get('series-step').textContent = `Удар ${index + 1} / ${shots.length}`;
    get('shooter').textContent = player.name;
    get('shooter-number').textContent = `№ ${player.number}`;
    get('shooter-team').textContent = player.team;
    get('goal-heading').textContent = count ? 'Прошлые пенальти' : 'Архивный пенальти';
    get('goal-sample').textContent = count ? `Выборка · ${count} ударов за сборную` : player.archive;
    bands.forEach((band, direction) => {
      const hits = player.scouting?.[direction];
      const chance = count ? hits / count : Number(direction === archiveDirection);
      band.querySelector('strong').textContent = count ? `${Math.round(chance * 100)}%` : chance ? '●' : '—';
      band.querySelector('small').textContent = count ? `${hits} из ${count}` : chance ? 'Удар' : '';
      band.style.setProperty('--heat', chance);
    });
    playerAttempts('round-progress');
    final.hidden = true;
    map.hidden = false;
    screen.dataset.stage = 'scout';
  }

  get('roster-count').textContent = WEB_FORWARDS.length;
  chooseSeries();
  preview();
  return {
    get complete() { return complete(); },
    get player() { return current(); },
    nextShot() {
      const player = current();
      if (player.scouting) return pickScoutedZone(player.scouting);
      const zones = goalZones[player.direction];
      return player.target ?? zones[Math.floor(Math.random() * zones.length)];
    },
    preview,
    kick() {
      map.hidden = true;
      screen.dataset.stage = 'live';
    },
    restart() { results = []; chooseSeries(); },
    record(saved, zone) {
      if (complete()) return;
      const direction = goalZones.findIndex(zones => zones.includes(zone));
      if (direction >= 0) get('result-sub').textContent = `Удар ${directionNames[direction]}`;
      results.push({outcome:saved ? 'save' : 'goal', direction});
      playerAttempts('round-progress');
      screen.dataset.stage = 'result';
      if (complete()) {
        let saves = 0;
        for (const result of results) {
          const saved = Number(result.outcome === 'save');
          saves += saved;
          if (result.direction < 0) continue;
          career.directions[result.direction][0] += saved;
          career.directions[result.direction][1]++;
        }
        career.rounds++;
        career.saves += saves;
        career.best = Math.max(career.best, saves);
        try { localStorage.setItem(recordKey, JSON.stringify(career)); } catch {}
        onComplete?.(saves);
      }
    },
  };
}
