const API_KEY = 'MeeJ21vD6Gio1a3ncwEMTC4Mu44DbXkc';
const BASE_URL = 'https://api-redemet.decea.mil.br';

// State
let icaos = new Set(['SBGR']); // Default example
let checkInterval = null;
let customAudioUrl = null;
let isAlarmPlaying = false;
let audioObj = new Audio();
let defaultBeepInterval = null;

// DOM Elements
const zuluTimeEl = document.getElementById('zulu-time-display');
const icaoInput = document.getElementById('icao-input');
const icaoTagsList = document.getElementById('icao-tags');
const metarContainer = document.getElementById('metar-container');
const tafContainer = document.getElementById('taf-container');
const avisosContainer = document.getElementById('avisos-container');
const timerAvisosEl = document.getElementById('timer-avisos');
const timerTafEl = document.getElementById('timer-taf');
const apiStatusEl = document.getElementById('api-status');

// Settings Elements
const textSizeSlider = document.getElementById('text-size');
const volumeSlider = document.getElementById('volume');
const audioFileInput = document.getElementById('audio-file');
const chkMissingMetar = document.getElementById('chk-missing-metar-alarm');
const chkAvisoAlarm = document.getElementById('chk-aviso-alarm');
const toleranceMinutes = document.getElementById('tolerance-minutes');

// Modals
const visualAlert = document.getElementById('visual-alert');
const alertMessage = document.getElementById('alert-message');
const btnDismissAlert = document.getElementById('btn-dismiss-alert');
const btnTestAlarm = document.getElementById('btn-test-alarm');
const btnRequestNotif = document.getElementById('btn-request-notifications');
const btnRefreshManual = document.getElementById('btn-refresh-manual');

// --- Initialization ---
function init() {
    updateZuluTime();
    setInterval(updateZuluTime, 1000);
    
    renderTags();
    setupEventListeners();
    
    // Initial fetch
    fetchData();
    // 60 seconds interval for fetch
    setInterval(fetchData, 60000);
    startTimers();
    
    registerServiceWorker();
}

function updateZuluTime() {
    const now = new Date();
    const h = String(now.getUTCHours()).padStart(2, '0');
    const m = String(now.getUTCMinutes()).padStart(2, '0');
    const s = String(now.getUTCSeconds()).padStart(2, '0');
    zuluTimeEl.textContent = `${h}:${m}:${s} Z`;
    
    // Check missing METAR on minute change
    if (now.getUTCSeconds() === 0) {
        checkMissingMetarLogic();
    }
}

// --- Dynamic Background Effect ---
function updateDynamicBackground() {
    const hour = new Date().getHours();
    const root = document.documentElement;

    if (hour >= 6 && hour < 17) {
        // Dia: Azul celeste claro
        root.style.setProperty('--bg-top', '#bae6fd');
        root.style.setProperty('--bg-bottom', '#f8fafc');
    } else if (hour >= 17 && hour < 19) {
        // Entardecer: Tons mais quentes e suaves
        root.style.setProperty('--bg-top', '#fed7aa');
        root.style.setProperty('--bg-bottom', '#fef3c7');
    } else {
        // Noite: Azul meia-noite
        root.style.setProperty('--bg-top', '#1e1b4b');
        root.style.setProperty('--bg-bottom', '#0f172a');
    }
}
updateDynamicBackground();
setInterval(updateDynamicBackground, 60000);

// --- Event Listeners ---
function setupEventListeners() {
    const icaoForm = document.getElementById('icao-form');
    icaoForm.addEventListener('submit', (e) => {
        e.preventDefault(); // Prevent page reload
        const val = icaoInput.value.trim().toUpperCase();
        if (val.length === 4) {
            icaos.add(val);
            icaoInput.value = '';
            renderTags();
            fetchData();
        }
    });

    textSizeSlider.addEventListener('input', (e) => {
        document.documentElement.style.setProperty('--font-base', `${e.target.value}px`);
    });

    volumeSlider.addEventListener('input', (e) => {
        audioObj.volume = e.target.value;
    });

    audioFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (customAudioUrl) URL.revokeObjectURL(customAudioUrl);
            customAudioUrl = URL.createObjectURL(file);
            audioObj.src = customAudioUrl;
        }
    });

    btnDismissAlert.addEventListener('click', stopAlarm);
    btnTestAlarm.addEventListener('click', () => triggerAlarm("Teste de Alarme", ["TEST"]));
    btnRefreshManual.addEventListener('click', () => {
        fetchData();
        tAviso = 60;
        tTaf = 60;
        timerAvisosEl.textContent = tAviso;
        timerTafEl.textContent = tTaf;
    });
    btnRequestNotif.addEventListener('click', () => {
        Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
                btnRequestNotif.textContent = "Notificações Ativas";
                btnRequestNotif.classList.add('secondary');
            }
        });
    });
}

// --- Tags Handling ---
function renderTags() {
    icaoTagsList.innerHTML = '';
    icaos.forEach(icao => {
        const li = document.createElement('li');
        li.className = 'tag';
        li.textContent = icao;
        const btn = document.createElement('button');
        btn.className = 'tag-remove';
        btn.textContent = 'x';
        btn.onclick = () => {
            icaos.delete(icao);
            renderTags();
        };
        li.appendChild(btn);
        icaoTagsList.appendChild(li);
    });
}

// --- API Fetching ---
async function fetchData() {
    if (icaos.size === 0) return;
    const icaoStr = Array.from(icaos).join(',');
    apiStatusEl.textContent = "Atualizando...";
    apiStatusEl.className = "status-indicator";

    try {
        const [metarRes, tafRes, avisoRes] = await Promise.all([
            fetchRedemet(`/mensagens/metar/${icaoStr}`),
            fetchRedemet(`/mensagens/taf/${icaoStr}`),
            fetchRedemet(`/mensagens/aviso_aerodromo/${icaoStr}`) // Might be empty if no endpoint, but we handle it
        ]);

        renderData(metarRes, metarContainer, 'METAR');
        renderData(tafRes, tafContainer, 'TAF');
        renderData(avisoRes, avisosContainer, 'Avisos');
        
        checkNewAvisosLogic(avisoRes);
        
        apiStatusEl.textContent = "Atualizado (OK)";
        lastMetarData = metarRes; // Store for logic check
    } catch (e) {
        console.error(e);
        apiStatusEl.textContent = "Erro na API";
        apiStatusEl.className = "status-indicator error";
    }
}

async function fetchRedemet(endpoint) {
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            headers: { 'X-Api-Key': API_KEY }
        });
        if (!response.ok) return { data: { data: [] } };
        return await response.json();
    } catch(e) {
        return { data: { data: [] } }; // Graceful fail
    }
}

function renderData(apiResponse, container, type) {
    container.innerHTML = '';
    const items = apiResponse?.data?.data || [];
    
    if (!items || items.length === 0) {
        container.innerHTML = `<p class="placeholder-text">Sem dados para ${type}</p>`;
        return;
    }

    // items usually array of objects with id_localidade, validade_inicial, mens
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'data-card';
        card.innerHTML = `
            <div class="data-card-header">
                <span class="icao-label">${item.id_localidade || 'N/A'}</span>
                <span class="time-label">${item.validade_inicial || item.data_hora || ''}</span>
            </div>
            <div class="data-content">${item.mens || 'Sem mensagem'}</div>
        `;
        container.appendChild(card);
    });
}

// --- Timers ---
let tAviso = 60, tTaf = 60;
function startTimers() {
    setInterval(() => {
        tAviso--; tTaf--;
        if(tAviso <= 0) tAviso = 60;
        if(tTaf <= 0) tTaf = 60;
        timerAvisosEl.textContent = tAviso;
        timerTafEl.textContent = tTaf;
    }, 1000);
}

// --- Alarms & Notifications ---
let lastMetarData = null;
let knownAvisos = new Set();
let isFirstAvisoCheck = true;

function checkMissingMetarLogic() {
    if (!chkMissingMetar.checked || icaos.size === 0) return;
    
    const now = new Date();
    const m = now.getUTCMinutes();
    const tol = parseInt(toleranceMinutes.value) || 10;
    
    // Basic logic: if current minute > tolerance, we expect a METAR for the current hour.
    // If not found in lastMetarData, trigger alarm.
    if (m >= tol && m < tol + 2) { 
        // Trigger only once around the tolerance window
        const missingIcaos = [];
        icaos.forEach(icao => {
            // Very simplified check: see if we have data for this ICAO
            // In real life, we should parse the day/hour from the METAR message 
            // e.g. "METAR SBGR 291200Z ..."
            const hasRecent = (lastMetarData?.data?.data || []).some(d => d.id_localidade === icao);
            if (!hasRecent) missingIcaos.push(icao);
        });

        if (missingIcaos.length > 0) {
            triggerAlarm("METAR em Falta", missingIcaos);
        }
    }
}

function checkNewAvisosLogic(avisoRes) {
    if (!chkAvisoAlarm.checked) return;
    
    const items = avisoRes?.data?.data || [];

    let hasNew = false;
    const currentAvisosIds = [];

    items.forEach(item => {
        const avisoId = `${item.id_localidade}_${item.validade_inicial || item.data_hora || item.mens}`;
        currentAvisosIds.push(avisoId);
        
        if (!knownAvisos.has(avisoId)) {
            hasNew = true;
            knownAvisos.add(avisoId);
        }
    });

    knownAvisos.forEach(id => {
        if (!currentAvisosIds.includes(id)) {
            knownAvisos.delete(id);
        }
    });

    if (hasNew && !isFirstAvisoCheck) {
        const icaosWithWarnings = [...new Set(items.map(item => item.id_localidade))];
        triggerAlarm("Novo Aviso de Aeródromo", icaosWithWarnings);
    }
    
    isFirstAvisoCheck = false;
}

function triggerAlarm(title, icaoList) {
    const msg = `Localidades: ${icaoList.join(', ')}`;
    
    // Foreground Visual
    alertMessage.textContent = msg;
    visualAlert.classList.remove('hidden');
    
    // Audio
    if (document.getElementById('chk-repeat-alarm').checked) {
        audioObj.loop = true;
    } else {
        audioObj.loop = false;
    }
    
    // Default beep if no custom audio
    if (!customAudioUrl) {
        playDefaultBeep();
    } else {
        audioObj.play().catch(e => console.log('Audio play blocked:', e));
    }

    // Background Push / Notification
    if (Notification.permission === 'granted') {
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'SHOW_NOTIFICATION',
                title: title,
                options: {
                    body: msg,
                    icon: 'icon.png', // Assuming we will have an icon or ignore
                    vibrate: [200, 100, 200]
                }
            });
        } else {
            new Notification(title, { body: msg });
        }
    }
}

function playDefaultBeep() {
    const playSingleBeep = () => {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(volumeSlider.value, ctx.currentTime);
        osc.start();
        setTimeout(() => osc.stop(), 500);
    };

    playSingleBeep();

    if (document.getElementById('chk-repeat-alarm').checked) {
        if (!defaultBeepInterval) {
            defaultBeepInterval = setInterval(playSingleBeep, 1000);
        }
    }
}

function stopAlarm() {
    visualAlert.classList.add('hidden');
    audioObj.pause();
    audioObj.currentTime = 0;
    if (defaultBeepInterval) {
        clearInterval(defaultBeepInterval);
        defaultBeepInterval = null;
    }
}

// --- Service Worker ---
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('SW Registered:', reg.scope))
                .catch(err => console.log('SW Reg failed:', err));
        });
    }
}

init();
