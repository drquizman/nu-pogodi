import { setText } from './ui';
import { Connection } from './connection';
import { BasketTracker, OcclusionTracker, type Body, type Point } from './core/pose';
import type { Lane } from './core/game';
import { cameraConstraints, widestView } from './camera';
import { HoldStart } from './core/hold-start';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const names = ['Слева вверху', 'Слева внизу', 'Справа вверху', 'Справа внизу'];
export function mountPhone() {
    const params = new URLSearchParams(location.hash.slice(1)), room = params.get('room'), key = params.get('key');
    document.getElementById('app')!.innerHTML = `<main class="phone"><header><a class="brand" href="./"><span class="brand-icon">✳</span><span>НУ, ПОГОДИ!<span class="brand-sub">КОНТРОЛЛЕР ДВИЖЕНИЯ</span></span></a><span class="phone-online" id="phone-online">Подключение…</span></header><div class="phone-heading"><div class="eyebrow">ТВОИ РУКИ — КОРЗИНА</div><h1 id="phone-title">Встань в кадр.</h1><p id="phone-instruction">Поставь телефон у экрана. В камере должны быть видны пояс и обе руки.</p></div><div class="camera-box"><video id="video" autoplay muted playsinline></video><canvas id="skeleton"></canvas><div class="camera-placeholder" id="camera-placeholder"><span>◎</span><p>Камера видит движения.<br>Видео остаётся на телефоне.</p></div><div class="camera-badge" id="camera-badge">Камера выключена</div></div><div class="motion-positions" aria-label="Положение корзины">${names.map((name, i) => `<div id="lane-${i}" class="position">${['↖', '↙', '↗', '↘'][i]}<span>${name}</span></div>`).join('')}</div><div class="phone-message" id="phone-message" role="status">Разреши доступ к камере, чтобы начать.</div><button class="primary" id="camera-start">Включить камеру</button><button class="primary" id="calibrate" hidden>Настроить положение рук</button><button class="primary" id="phone-play" hidden>Начать игру на экране</button><div class="phone-actions"><button class="small-button" id="phone-pause" hidden>Пауза</button><button class="text-button" id="camera-stop" hidden>Выключить камеру</button></div><p class="phone-note">Не блокируй телефон во время игры.<br>Держи обе руки перед собой, как будто держишь корзину.</p></main>`;
    if (!room || !key) {
        setText($('phone-message'), 'Сканируй QR-код на экране игры. В этой ссылке нет комнаты.');
        $('camera-start').setAttribute('disabled', '');
        return;
    }
    $('camera-start').insertAdjacentHTML('beforebegin', '<p id="delivery-status" class="delivery-status" role="status">Проверка связи с игрой…</p><details class="camera-settings"><summary>Камера и угол обзора</summary><label>Камера<select id="camera-choice" disabled><option value="">Фронтальная камера</option></select></label><button id="wide-view" class="small-button" disabled>Максимальный обзор</button><p id="camera-info">После разрешения камеры здесь появятся доступные объективы. Широкоугольная камера доступна не на всех телефонах и не во всех браузерах.</p><p>Попробуй поставить телефон горизонтально: по сторонам будет больше места для рук.</p></details>');
    const tracker = new BasketTracker();
    let conn: Connection, online = false, host = false, stream: MediaStream | undefined, worker: Worker | undefined, ready = false, busy = false, tracked = false, calibrated = false, latest: Body | null = null, lane: Lane = 0, lastResult = 0, phase = 'ready', calibrationAt = 0, samples: Body[] = [], training = -1, holdAt = 0, lastFrame = 0, stopped = false, wake: WakeLockSentinel | undefined, finishedCalibration = false;
    const holdStart = new HoldStart();
    const occlusion = new OcclusionTracker();
    $('camera-start').insertAdjacentHTML('beforebegin', '<label class="hands-free"><input id="auto-start" type="checkbox" checked> Старт без касания: держи корзину перед собой 3 секунды</label><p id="hold-status" class="delivery-status" role="status">Включи камеру, отойди и держи руки перед собой. Игра начнётся сама.</p>');
    const settings = document.querySelector('.camera-settings')!;
    setText(settings.querySelector('summary')!, 'Настроить камеру');
    settings.append($('calibrate'), $('camera-stop'));
    setText($('phone-instruction'), 'Включи камеру, отойди и держи корзину перед собой 3 секунды.');
    setText($('camera-start'), 'Включить камеру и играть');
    const cameraBox = document.querySelector('.camera-box')!;
    cameraBox.before($('camera-start'), $('hold-status'));
    let seq = 0, ackSeq = 0, ackAt = 0, ackLane = 0, hostInput = 'motion', cameraBusy = false;
    const video = $<HTMLVideoElement>('video'), canvas = $<HTMLCanvasElement>('skeleton'), ctx = canvas.getContext('2d')!;
    let cameraGeneration = 0;
    conn = new Connection({ room, role: 'phone', key }, msg => {
        if (msg.type === 'host') {
            host = msg.connected;
        }
        if (msg.type === 'state') {
            phase = msg.phase;
            hostInput = msg.input || 'motion';
            if (msg.poseSeq > ackSeq) {
                ackSeq = msg.poseSeq;
                ackAt = performance.now();
                ackLane = msg.lane;
            }
            setText($('phone-pause'), phase === 'paused' ? 'Продолжить' : 'Пауза');
            $('phone-pause').hidden = !['playing', 'paused', 'countdown'].includes(phase);
            if (phase === 'over') {
                setText($('phone-title'), `Поймано: ${msg.score}`);
                setText($('phone-play'), 'Сыграть ещё раз');
            }
            else if (['playing', 'countdown'].includes(phase)) {
                $('phone-play').hidden = true;
                setText($('phone-title'), 'Лови яйца!');
            }
        }
        if (msg.type === 'fatal') {
            setText($('phone-message'), msg.message);
            stopCamera();
            $('camera-start').setAttribute('disabled', '');
        }
    }, value => { online = value; setText($('phone-online'), value ? 'На связи' : 'Нет связи'); });
    async function keepAwake() { try {
        wake = await navigator.wakeLock?.request('screen');
    }
    catch { } }
    function sendPose() { const fresh = performance.now() - lastResult < 800; conn.send({ type: 'pose', seq: ++seq, lane, tracked: tracked && fresh && !document.hidden && !!stream, calibrated }); }
    const heartbeat = window.setInterval(() => {
        sendPose();
        if (!host && online)
            setText($('phone-online'), 'Экран отключён');
        else if (online)
            setText($('phone-online'), 'На связи');
        const fresh = performance.now() - lastResult < 800;
        setText($('delivery-status'), !online ? 'Нет соединения с сервером' : !host ? 'Экран игры отключён — открой его на компьютере' : hostInput === 'keyboard' ? 'На экране выбран режим «Только клавиатура»' : performance.now() - ackAt < 1800 && ackSeq > 0 ? (tracked && fresh ? `Экран получает движения: ${names[ackLane]?.toLowerCase() || 'корзина'}` : 'Связь с экраном есть. Нужны обе руки и пояс в кадре.') : 'Ждём подтверждения от экрана. Открой вкладку игры на компьютере.');
        $('phone-play').hidden = !ready || !['ready', 'over'].includes(phase) || calibrationAt > 0 || (training >= 0 && training < 4);
        $('phone-play').toggleAttribute('disabled', !host || !online);
        setText($('phone-play'), tracked && fresh ? 'Начать сейчас' : 'Начать, когда встану в кадр');
        const canHold = ready && !!stream && online && host && hostInput === 'motion' && performance.now() - ackAt < 1800 && !document.hidden && calibrationAt === 0 && !(training >= 0 && training < 4) && $<HTMLInputElement>('auto-start').checked;
        const hold = holdStart.update(tracked && fresh && latest?.quality === 'both' ? latest : null, tracker.center, phase, canHold, performance.now());
        $('hold-status').hidden = !['ready', 'over'].includes(phase);
        setText($('hold-status'), !$<HTMLInputElement>('auto-start').checked ? 'Старт жестом выключен.' : !canHold ? 'Включи камеру и держи открытым экран игры.' : hold.release ? 'Для новой игры опусти руки, затем снова возьми корзину перед собой.' : hold.progress > 0 ? `Не двигай корзину: старт через ${Math.max(1, Math.ceil(3 * (1 - hold.progress)))}…` : 'Держи корзину перед собой спокойно 3 секунды — игра начнётся сама.');
        if (hold.start) {
            sendPose();
            conn.send({ type: 'action', action: 'start' });
            setText($('hold-status'), 'Начинаем! Смотри на большой экран.');
        }
    }, 100);
    function stopCamera() { occlusion.reset(); cameraGeneration++; stopped = true; stream?.getTracks().forEach(t => t.stop()); stream = undefined; worker?.terminate(); worker = undefined; ready = false; busy = false; tracked = false; calibrated = false; calibrationAt = 0; training = -1; finishedCalibration = false; tracker.center = { x: 0, y: .55, confidence: 1 }; void wake?.release(); sendPose(); video.srcObject = null; $('camera-start').hidden = false; $('camera-start').removeAttribute('disabled'); setText($('camera-start'), 'Включить камеру'); $('camera-stop').hidden = true; $('calibrate').hidden = true; $('phone-play').hidden = true; $('wide-view').setAttribute('disabled', ''); $('camera-placeholder').hidden = false; setText($('camera-badge'), 'Камера выключена'); ctx.clearRect(0, 0, canvas.width, canvas.height); }
    async function configureCamera(track: MediaStreamTrack) {
        setText($('camera-info'), await widestView(track));
        const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
        const select = $<HTMLSelectElement>('camera-choice');
        select.replaceChildren();
        cameras.forEach((d, i) => select.add(new Option(d.label || `Камера ${i + 1}`, d.deviceId)));
        select.value = track.getSettings().deviceId || '';
        select.disabled = cameras.length < 2;
        $('wide-view').removeAttribute('disabled');
    }
    async function startCamera(deviceId?: string) {
        if (cameraBusy)
            return;
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            setText($('phone-message'), 'Для камеры нужна HTTPS-ссылка. Открой QR-код из игры, запущенной через «Играть.bat».');
            return;
        }
        cameraBusy = true;
        if (stream)
            stopCamera();
        $('camera-choice').setAttribute('disabled', '');
        $('camera-start').setAttribute('disabled', '');
        setText($('camera-start'), 'Загружаем камеру…');
        setText($('phone-message'), 'Разреши камеру в запросе браузера.');
        stopped = false;
        const generation = ++cameraGeneration;
        try {
            const acquired = await navigator.mediaDevices.getUserMedia({ video: cameraConstraints(deviceId), audio: false });
            if (generation !== cameraGeneration) {
                acquired.getTracks().forEach(t => t.stop());
                return;
            }
            stream = acquired;
            video.srcObject = stream;
            await video.play();
            await configureCamera(acquired.getVideoTracks()[0]);
            if (generation !== cameraGeneration)
                return;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            video.parentElement!.style.aspectRatio = `${video.videoWidth}/${video.videoHeight}`;
            $('camera-placeholder').hidden = true;
            $('camera-start').hidden = true;
            $('camera-stop').hidden = false;
            setText($('phone-message'), 'Загружаем распознавание движений…');
            worker = new Worker(new URL('./pose-worker.ts', import.meta.url));
            worker.onmessage = e => {
                if (generation !== cameraGeneration)
                    return;
                if (e.data.type === 'ready') {
                    ready = true;
                    $('calibrate').hidden = false;
                    setText($('phone-message'), 'Всё готово. Смотри на большой экран!');
                }
                if (e.data.type === 'pose') {
                    busy = false;
                    processPose(e.data.points);
                }
                if (e.data.type === 'error') {
                    stopCamera();
                    setText($('phone-message'), 'Не удалось запустить распознавание. Проверь интернет и попробуй снова.');
                }
            };
            worker.onerror = () => { if (generation !== cameraGeneration)
                return; stopCamera(); setText($('phone-message'), 'Распознавание недоступно в этом браузере. Попробуй актуальный Chrome.'); };
            worker.postMessage({ type: 'init' });
            void keepAwake();
            requestAnimationFrame(now => capture(now, generation));
        }
        catch (e) {
            if (generation !== cameraGeneration)
                return;
            stopCamera();
            setText($('phone-message'), e instanceof DOMException && e.name === 'NotAllowedError' ? 'Камера не разрешена. Разреши её в настройках сайта и нажми ещё раз.' : 'Не удалось открыть эту камеру. Выбери другую камеру или повтори попытку.');
        }
        finally {
            cameraBusy = false;
            if ($<HTMLSelectElement>('camera-choice').options.length > 1)
                $('camera-choice').removeAttribute('disabled');
        }
    }
    async function capture(now: number, generation: number) {
        if (stopped || generation !== cameraGeneration)
            return;
        if (ready && !busy && !document.hidden && video.readyState >= 2 && now - lastFrame > 66) {
            busy = true;
            lastFrame = now;
            try {
                const width = video.videoWidth, height = video.videoHeight;
                if (canvas.width !== width || canvas.height !== height) {
                    canvas.width = width;
                    canvas.height = height;
                    video.parentElement!.style.aspectRatio = `${width}/${height}`;
                }
                const scale = Math.min(1, 640 / Math.max(width, height));
                const frame = await createImageBitmap(video, { resizeWidth: Math.round(width * scale), resizeHeight: Math.round(height * scale) });
                if (generation !== cameraGeneration || !worker) {
                    frame.close();
                    return;
                }
                worker.postMessage({ type: 'frame', frame, at: now }, [frame]);
            }
            catch {
                busy = false;
            }
        }
        if (generation === cameraGeneration)
            requestAnimationFrame(next => capture(next, generation));
    }
    function drawPoints(points: Point[]) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#f6ca79';
        ctx.fillStyle = '#f6ca79';
        ctx.lineWidth = 4;
        for (const [a, b] of [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24]]) {
            if ((points[a]?.visibility || 0) < .55 || (points[b]?.visibility || 0) < .55)
                continue;
            ctx.beginPath();
            ctx.moveTo(points[a].x * canvas.width, points[a].y * canvas.height);
            ctx.lineTo(points[b].x * canvas.width, points[b].y * canvas.height);
            ctx.stroke();
        }
        for (const i of [11, 12, 13, 14, 15, 16, 23, 24]) {
            const p = points[i];
            if (!p || (p.visibility || 0) < .55)
                continue;
            ctx.beginPath();
            ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, Math.PI * 2);
            ctx.fill();
        }
        if (tracked && latest) {
            const sx = (points[11].x + points[12].x) / 2, sy = (points[11].y + points[12].y) / 2, torso = (points[23].y + points[24].y) / 2 - sy;
            const x = (sx - latest.x * torso) * canvas.width, y = (sy + latest.y * torso) * canvas.height;
            ctx.fillStyle = '#f6ca7977';
            ctx.beginPath();
            ctx.moveTo(x - 32, y);
            ctx.lineTo(x + 32, y);
            ctx.lineTo(x + 23, y + 24);
            ctx.lineTo(x - 23, y + 24);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
    }
    function processPose(points: Point[]) {
        lastResult = performance.now();
        latest = occlusion.update(points, lastResult);
        tracked = !!latest;
        drawPoints(points);
        setText($('camera-badge'), latest?.quality === 'single' ? 'Рука перекрыта — продолжаем по видимой' : latest?.quality === 'held' ? 'Руки перекрылись — сохраняем корзину' : tracked ? 'Корпус и руки видны' : 'Покажи пояс и обе руки');
        $('camera-badge').classList.toggle('good', tracked);
        $('calibrate').toggleAttribute('disabled', latest?.quality !== 'both');
        if (!latest) {
            if (calibrationAt) {
                calibrationAt = 0;
                samples = [];
                setText($('phone-message'), 'Руки пропали из кадра. Встань по пояс и повтори настройку.');
            }
            holdAt = 0;
            return;
        }
        lane = tracker.update(latest);
        for (let i = 0; i < 4; i++)
            $(`lane-${i}`).classList.toggle('selected', i === lane);
        if (latest.quality !== 'both') {
            if (calibrationAt) {
                calibrationAt = 0;
                samples = [];
                setText($('phone-message'), 'Для настройки покажи обе руки и повтори попытку.');
            }
            holdAt = 0;
            return;
        }
        if (calibrationAt) {
            samples.push(latest);
            const left = Math.ceil(3 - (performance.now() - calibrationAt) / 1000);
            setText($('phone-message'), `Держи корзину перед собой спокойно: ${Math.max(1, left)}`);
            if (left <= 0) {
                calibrationAt = 0;
                if (tracker.calibrate(samples)) {
                    training = 0;
                    holdAt = 0;
                    $('calibrate').hidden = true;
                }
                else {
                    setText($('phone-message'), 'Слишком много движения. Нажми настройку и замри на 3 секунды.');
                }
            }
        }
        if (training >= 0 && training < 4) {
            setText($('phone-message'), `Перемести обе руки: ${names[training].toLowerCase()}. Удержи корзину.`);
            setText($('phone-title'), `Настройка ${training + 1} / 4`);
            if (lane === training) {
                if (!holdAt)
                    holdAt = performance.now();
                if (performance.now() - holdAt > 650) {
                    training++;
                    holdAt = 0;
                }
            }
            else
                holdAt = 0;
            if (training === 4) {
                calibrated = true;
                finishedCalibration = true;
                setText($('phone-message'), 'Все четыре положения готовы. Смотри на большой экран!');
                setText($('phone-title'), 'Можно играть.');
                $('phone-play').hidden = false;
                $('calibrate').hidden = false;
                setText($('calibrate'), 'Настроить заново');
            }
        }
        if (finishedCalibration && ['ready', 'over'].includes(phase))
            $('phone-play').hidden = false;
    }
    $('camera-start').onclick = () => void startCamera($<HTMLSelectElement>('camera-choice').value || undefined);
    $('camera-stop').onclick = () => { stopCamera(); setText($('phone-message'), 'Камера выключена. Можно включить её снова.'); };
    $('camera-choice').onchange = () => void startCamera($<HTMLSelectElement>('camera-choice').value);
    $('wide-view').onclick = async () => { const track = stream?.getVideoTracks()[0]; if (track)
        setText($('camera-info'), await widestView(track)); };
    $('calibrate').onclick = () => { if (!latest)
        return; calibrated = false; finishedCalibration = false; training = -1; samples = []; calibrationAt = performance.now(); $('phone-play').hidden = true; };
    $('phone-play').onclick = () => { if (!host || !online) {
        setText($('phone-message'), 'Сначала открой экран игры на компьютере.');
        return;
    } if (!tracked || performance.now() - lastResult >= 800) {
        $<HTMLInputElement>('auto-start').checked = true;
        setText($('phone-message'), 'Теперь отойди и держи корзину перед собой 3 секунды. Нажимать больше ничего не нужно.');
        return;
    } sendPose(); conn.send({ type: 'action', action: 'start' }); };
    $('phone-pause').onclick = () => conn.send({ type: 'action', action: phase === 'paused' ? 'resume' : 'pause' });
    document.addEventListener('visibilitychange', () => { if (document.hidden) {
        tracked = false;
        sendPose();
    }
    else if (stream)
        void keepAwake(); });
    window.addEventListener('pagehide', () => { clearInterval(heartbeat); stopCamera(); conn.close(); });
}
