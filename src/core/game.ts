export type Lane = 0 | 1 | 2 | 3;
export type Phase = 'ready' | 'countdown' | 'playing' | 'paused' | 'over';
export interface Egg { id: number; lane: Lane; progress: number }
export interface GameState { phase: Phase; score: number; misses: number; basket: Lane; eggs: Egg[]; time: number; countdown: number; level: number; event: 'catch' | 'miss' | ''; eventId: number }
/** Platform-independent: no DOM, networking, clocks, audio, or storage. */
export class Game {
  state: GameState = this.initial();
  private spawnIn = 1;
  private id = 0;
  constructor(private random: () => number = Math.random) {}
  private initial(): GameState { return { phase: 'ready', score: 0, misses: 0, basket: 0, eggs: [], time: 0, countdown: 3, level: 1, event: '', eventId: 0 }; }
  start() { this.state = this.initial(); this.state.phase = 'countdown'; this.spawnIn = .8; this.id = 0; }
  pause() { if (this.state.phase === 'playing' || this.state.phase === 'countdown') this.state.phase = 'paused'; }
  resume() { if (this.state.phase === 'paused') { this.state.phase = 'countdown'; this.state.countdown = 3; } }
  move(lane: Lane) { this.state.basket = lane; }
  step(dt: number) {
    const s = this.state; dt = Math.max(0, Math.min(dt, .1));
    if (s.phase === 'countdown') { s.countdown -= dt; if (s.countdown <= 0) s.phase = 'playing'; return; }
    if (s.phase !== 'playing') return;
    s.time += dt; s.level = 1 + Math.floor(s.score / 10);
    const travel = Math.max(1.65, 4.2 - (s.level - 1) * .27);
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) { s.eggs.push({ id: ++this.id, lane: Math.floor(this.random() * 4) as Lane, progress: 0 }); this.spawnIn = Math.max(.8, 2.1 - (s.level - 1) * .12); }
    for (const egg of s.eggs) {
      egg.progress += dt / travel;
      if (egg.progress >= 1) { s.eventId++; if (egg.lane === s.basket) { s.score++; s.event = 'catch'; } else { s.misses++; s.event = 'miss'; } }
    }
    s.eggs = s.eggs.filter(e => e.progress < 1);
    if (s.misses >= 3) { s.misses = 3; s.phase = 'over'; }
  }
}
