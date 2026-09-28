import {hostConfig,createRoom,controllerUrl} from './backend';
import { setText } from './ui';
import QRCode from 'qrcode';
import { Game, type Lane } from './core/game';
import { Renderer } from './renderer';
import { Connection } from './connection';
import { Sound } from './audio';
const laneNames = ['Слева вверху', 'Слева внизу', 'Справа вверху', 'Справа внизу'];
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export async function mountHost() {
    document.getElementById('app')!.innerHTML = `
<main class="desktop simple-game"><header><a class="brand" href="./">Ну, погоди!<span class="brand-sub">ЛОВИ ЯЙЦА РУКАМИ</span></a><div class="header-right"><span class="record">Рекорд <strong id="record">0</strong></span><button class="icon-button" id="sound">Звук: вкл. ♪</button></div></header>
<div class="play-layout"><section class="console" aria-label="Игровое поле"><div class="screen-wrap"><canvas id="game" aria-label="Волк ловит яйца на четырёх дорожках"></canvas><div class="screen-overlay" id="overlay"><div class="overlay-panel"><h2 id="overlay-title">Корзину в руки!</h2><p id="overlay-text">Подключи телефон по QR-коду.</p><button class="primary" id="overlay-action">Попробовать на клавиатуре</button></div></div></div><div class="console-bottom"><span id="game-status">Готовы ловить?</span><div class="console-actions"><button id="pause" class="small-button" disabled>Пауза</button><button id="fullscreen" class="small-button">Во весь экран ⛶</button></div></div></section>
<div class="connect-card pairing-center" id="pairing-center"><h2 id="connect-title">Подключи телефон</h2><div id="pairing-setup"><p>Сканируй QR-код</p><div class="qr-wrap"><canvas id="qr" aria-label="QR-код подключения телефона"></canvas></div><button class="text-button" id="copy">Скопировать ссылку</button></div><div class="connection-status" id="connection"><span class="dot"></span><span id="connection-text">Подключаемся…</span></div><p class="helper" id="link-help">Включи камеру, отойди и держи корзину перед собой 3 секунды.</p><div class="paired-info" id="paired-info" hidden><div class="ready-illustration" aria-hidden="true">↖ 🧺 ↗</div><strong id="tracking-label">Встань в кадр</strong><p>Держи корзину 3 секунды.<br>Начнём без касания!</p><p id="received-motion" hidden></p></div></div></div><p class="keyboard-hint">Без телефона: Q / A — слева, E / D — справа · Пробел — пауза</p></main>`;
    // Pairing lives over the centre of the game, never beside it.
    document.querySelector('.screen-wrap')!.append($('pairing-center'));
    $('pairing-center').insertAdjacentHTML('beforeend', '<p id="audio-hint" class="audio-hint">Для звука коснись экрана игры.</p><button id="pairing-keyboard" class="text-button">Попробовать на клавиатуре</button>');
    const game = new Game(), renderer = new Renderer($('game')), sound = new Sound();
    // Try autoplay where allowed; any local gesture unlocks it elsewhere.
    sound.unlock();
    const unlockAudio = () => { if (sound.enabled && !sound.ready) sound.unlock(); };
    window.addEventListener('pointerdown', unlockAudio, {capture:true});
    window.addEventListener('keydown', unlockAudio, {capture:true});
    let mode: 'keyboard' | 'motion' = 'keyboard', connection: Connection | undefined, peer = false, online = false, tracked = false, calibrated = false, lastPose = 0, reason = '', manualPause = false, trackingSince = 0, link = '', lastPhase = '', lastEvent = 0, best = 0, lastBroadcast = 0, previous = performance.now(), retryFatal = false;
    let forceKeyboard = false, poseSeq = 0, remoteLane: Lane = 0;
    try {
        best = Number(localStorage.getItem('np-record') || 0);
    }
    catch { }
    setText($('record'), String(best).padStart(3, '0'));
    const active = () => ['playing', 'countdown'].includes(game.state.phase);
    function start(nextMode: 'keyboard' | 'motion') { if (nextMode === 'motion' && (!peer || !online || !tracked))
        return; sound.unlock(); mode = nextMode; manualPause = false; reason = ''; lastEvent = 0; game.start(); if (mode === 'motion')
        game.move(remoteLane); }
    function togglePause() { sound.unlock(); if (active()) {
        manualPause = true;
        reason = 'Можно перевести дух.';
        game.pause();
    }
    else if (game.state.phase === 'paused' && (mode === 'keyboard' || (tracked && peer && online))) {
        manualPause = false;
        reason = '';
        game.resume();
    } }
    $('overlay-action').onclick = () => game.state.phase === 'paused' ? togglePause() : start(mode);
    $('pause').onclick = togglePause;
    $('sound').onclick = () => { sound.enabled = !sound.enabled; if (sound.enabled) sound.unlock(); };
    $('pairing-keyboard').onclick = () => start('keyboard');
    $('fullscreen').onclick = () => { const p = document.fullscreenElement ? document.exitFullscreen() : document.querySelector('.console')!.requestFullscreen(); void p.catch(() => { setText($('fullscreen'), 'Полный экран недоступен'); }); };
    $('copy').onclick = async () => { try {
        await navigator.clipboard.writeText(link);
        setText($('copy'), 'Ссылка скопирована ✓');
    }
    catch {
        setText($('link-help'), link || 'Комната ещё создаётся.');
    } };
    window.addEventListener('keydown', e => { if (e.repeat)
        return; const lanes: Record<string, Lane> = { KeyQ: 0, KeyA: 1, KeyE: 2, KeyD: 3, Numpad7: 0, Numpad1: 1, Numpad9: 2, Numpad3: 3 }; if (e.code in lanes && mode === 'keyboard')
        game.move(lanes[e.code]); if (e.code === 'Space') {
        e.preventDefault();
        togglePause();
    } if (e.code === 'Enter' && ['ready', 'over'].includes(game.state.phase))
        start(mode); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && active()) {
        manualPause = true;
        reason = 'Экран игры был свёрнут.';
        game.pause();
    } });
    function receive(msg: any) {
        if (msg.type === 'peer') {
            peer = msg.connected;
            if (peer) {
                $('paired-info').hidden = false;
                if (!forceKeyboard)
                    mode = 'motion';
            }
        }
        if (msg.type === 'pose') {
            lastPose = performance.now();
            tracked = msg.tracked;
            calibrated = msg.calibrated;
            poseSeq = msg.seq || 0;
            remoteLane = msg.lane;
            if (!forceKeyboard)
                mode = 'motion';
            if (mode === 'motion' && tracked)
                game.move(remoteLane);
        }
        if (msg.type === 'action') {
            if (msg.action === 'start') {
                forceKeyboard = false;
                start('motion');
            }
            if (msg.action === 'pause' && active())
                togglePause();
            if (msg.action === 'resume' && game.state.phase === 'paused')
                togglePause();
        }
        if (msg.type === 'fatal') {
            retryFatal = true;
            setText($('connection-text'), msg.message);
            try {
                sessionStorage.removeItem('np-room');
            }
            catch { }
            setText($('copy'), 'Создать новую комнату');
            $('copy').onclick = () => location.reload();
        }
    }
    async function connect() {
        try {
            const config = await hostConfig();
            let seat: {
                id: string;
                hostKey: string;
                joinKey: string;
            } | null = null;
            try {
                seat = JSON.parse(sessionStorage.getItem('np-room') || 'null');
            }
            catch { }
            // A fresh host tab creates an independent room; reload can resume an existing one.
            if (!seat) {
                seat = await createRoom();
                try {
                    sessionStorage.setItem('np-room', JSON.stringify(seat));
                }
                catch { }
            }
            const origin = config.publicOrigin || location.origin;
            link = controllerUrl(origin,seat!.id,seat!.joinKey);
            const controllerLink = document.createElement('a');
            controllerLink.href = link;
            setText(controllerLink, 'Открыть пульт');
            controllerLink.target = '_blank';
            controllerLink.rel = 'noopener';
            controllerLink.className = 'text-button controller-link';
            $('copy').after(controllerLink);
            await QRCode.toCanvas($<HTMLCanvasElement>('qr'), link, { width: 208, margin: 1, color: { dark: '#192f31', light: '#ffffff' } });
            if (origin.startsWith('http:')) {
                setText($('link-help'), 'Для камеры телефона запусти «Играть.bat»: он создаст защищённую ссылку. Здесь уже можно играть на клавиатуре.');
            }
            connection = new Connection({ room: seat!.id, role: 'host', key: seat!.hostKey }, receive, value => online = value);
        }
        catch (e) {
            setText($('connection-text'), e instanceof Error ? e.message : 'Нет соединения');
            setText($('copy'), 'Повторить подключение');
            $('copy').onclick = () => void connect();
        }
    }
    void connect();
    function updateUi() {
        const s = game.state;
        sound.update(s);
        setText($('sound'), sound.enabled ? 'Звук: вкл. ♪' : 'Звук: выкл.');
        $('sound').setAttribute('aria-label', sound.enabled ? 'Выключить звук' : 'Включить звук');
        const fresh = performance.now() - lastPose < 900;
        tracked = tracked && fresh;
        $('pairing-setup').hidden = peer;
        $('pairing-center').hidden = peer || (mode === 'keyboard' && s.phase !== 'ready');
        $('audio-hint').hidden = sound.ready || !sound.enabled;
        setText($('connect-title'), peer ? 'Ты управляешь!' : 'Подключи телефон');
        setText($('tracking-label'), !peer ? 'Телефон отключён' : tracked ? 'Отлично, руки видны!' : 'Встань в кадр: обе руки и пояс');
        setText($('received-motion'), !lastPose ? 'Ждём движения…' : !fresh ? 'Движения не поступают' : !tracked ? 'Данные приходят, но руки или пояс не видны' : `${forceKeyboard ? 'Камера не выбрана' : 'Корзина'}: ${laneNames[remoteLane].toLowerCase()}`);
        if (!retryFatal)
            setText($('connection-text'), !online ? 'Восстанавливаем соединение…' : peer ? 'Телефон подключён' : 'Ждём подключения телефона');
        $('connection').classList.toggle('connected', peer && online);
        if (mode === 'motion' && active() && (!peer || !online || !tracked)) {
            reason = !online || !peer ? 'Соединение с телефоном потеряно.' : 'Нужны обе руки и корпус в кадре.';
            manualPause = false;
            trackingSince = 0;
            game.pause();
        }
        if (mode === 'motion' && s.phase === 'paused' && !manualPause && peer && online && tracked && !document.hidden) {
            if (!trackingSince)
                trackingSince = performance.now();
            if (performance.now() - trackingSince > 700) {
                reason = '';
                game.resume();
            }
        }
        else
            trackingSince = 0;
        $('pause').toggleAttribute('disabled', ['ready', 'over'].includes(s.phase));
        setText($('pause'), s.phase === 'paused' ? 'Продолжить' : 'Пауза');
        setText($('game-status'), s.phase === 'playing' ? `${mode === 'motion' ? 'КАМЕРА' : 'КЛАВИАТУРА'} · ТЕМП ${s.level}` : s.phase === 'paused' ? 'ПАУЗА' : s.phase === 'over' ? 'ИГРА ОКОНЧЕНА' : s.phase === 'countdown' ? 'ПРИГОТОВЬСЯ' : 'ГОТОВА К ИГРЕ');
        $('overlay').hidden = s.phase === 'playing' || !$('pairing-center').hidden;
        $('overlay').classList.toggle('motion-preview', s.phase === 'ready');
        if (s.phase === 'ready') {
            setText($('overlay-title'), mode === 'motion' ? 'Держи корзину 3 секунды' : 'Корзину в руки!');
            setText($('overlay-text'), mode === 'motion' ? (tracked ? 'Замри с корзиной перед собой — игра начнётся сама.' : 'Включи камеру на телефоне и встань по пояс в кадр.') : 'Подключи телефон или попробуй игру на клавиатуре.');
            $('overlay-action').hidden = mode === 'motion';
            setText($('overlay-action'), 'Попробовать на клавиатуре');
            $('overlay-action').toggleAttribute('disabled', mode === 'motion' && (!tracked || !peer || !online));
        }
        else
            $('overlay-action').removeAttribute('disabled');
        if (s.phase === 'countdown') {
            setText($('overlay-title'), String(Math.max(1, Math.ceil(s.countdown))));
            setText($('overlay-text'), 'Приготовь корзину');
            $('overlay-action').hidden = true;
        }
        else if (s.phase === 'paused') {
            setText($('overlay-title'), 'Пауза');
            setText($('overlay-text'), reason);
            $('overlay-action').hidden = !manualPause;
            setText($('overlay-action'), 'Продолжить');
        }
        else if (s.phase === 'over') {
            setText($('overlay-title'), `Поймано: ${s.score}`);
            setText($('overlay-text'), s.score >= best && s.score > 0 ? 'Рекорд! Опусти руки и снова держи корзину 3 секунды.' : 'Опусти руки, затем держи корзину перед собой 3 секунды.');
            $('overlay-action').hidden = false;
            setText($('overlay-action'), 'Ещё раз ↵');
        }
        if (s.score > best) {
            best = s.score;
            setText($('record'), String(best).padStart(3, '0'));
            try {
                localStorage.setItem('np-record', String(best));
            }
            catch { }
        }
        if (s.phase !== lastPhase || performance.now() - lastBroadcast > 250) {
            connection?.send({ type: 'state', phase: s.phase, score: s.score, misses: s.misses, reason, input: mode, lane: s.basket, poseSeq });
            lastPhase = s.phase;
            lastBroadcast = performance.now();
        }
    }
    function loop(now: number) { game.step((now - previous) / 1000); previous = now; updateUi(); renderer.draw(game.state); requestAnimationFrame(loop); }
    requestAnimationFrame(loop);
}
