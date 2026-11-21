const homeScreen = document.getElementById('homeScreen');
const roomScreen = document.getElementById('roomScreen');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const waitingMessage = document.getElementById('waitingMessage');
const statusMessage = document.getElementById('statusMessage');
const toggleVideoBtn = document.getElementById('toggleVideoBtn');
const toggleAudioBtn = document.getElementById('toggleAudioBtn');
const shareScreenBtn = document.getElementById('shareScreenBtn');

let ws = null;
let peerConnection = null;
let localStream = null;
let currentRoomCode = null;
let userId = generateUserId();
let isHost = false;

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Определяем WebSocket URL
const WS_URL = window.location.protocol === 'https:' 
    ? `wss://${window.location.host}` 
    : `ws://${window.location.host}`;

function generateUserId() {
    return Math.random().toString(36).substring(2, 15);
}

function connectWebSocket() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        console.log('WebSocket подключен');
        showStatus('Подключено к серверу', 'success');
    };

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('Получено сообщение:', data.type);

        switch (data.type) {
            case 'room-created':
                handleRoomCreated(data);
                break;
            case 'room-joined':
                handleRoomJoined(data);
                break;
            case 'peer-joined':
                handlePeerJoined(data);
                break;
            case 'offer':
                handleOffer(data);
                break;
            case 'answer':
                handleAnswer(data);
                break;
            case 'ice-candidate':
                handleIceCandidate(data);
                break;
            case 'peer-left':
                handlePeerLeft();
                break;
            case 'error':
                showStatus(data.message, 'error');
                break;
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket ошибка:', error);
        showStatus('Ошибка подключения к серверу', 'error');
    };

    ws.onclose = () => {
        console.log('WebSocket отключен');
        showStatus('Соединение с сервером потеряно', 'error');
    };
}

function showStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    setTimeout(() => {
        statusMessage.textContent = '';
        statusMessage.className = 'status-message';
    }, 3000);
}

async function getMediaStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        localVideo.srcObject = localStream;
        return true;
    } catch (error) {
        console.error('Ошибка доступа к камере/микрофону:', error);
        showStatus('Не удалось получить доступ к камере/микрофону', 'error');
        return false;
    }
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(ICE_SERVERS);

    // Добавляем локальные треки
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Обработка входящих треков
    peerConnection.ontrack = (event) => {
        console.log('Получен удалённый трек');
        remoteVideo.srcObject = event.streams[0];
        waitingMessage.style.display = 'none';
    };

    // Обработка ICE кандидатов
    peerConnection.onicecandidate = (event) => {
        if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'ice-candidate',
                candidate: event.candidate
            }));
        }
    };

    // Обработка изменения состояния соединения
    peerConnection.onconnectionstatechange = () => {
        console.log('Состояние соединения:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            showStatus('Соединение установлено!', 'success');
        } else if (peerConnection.connectionState === 'disconnected') {
            showStatus('Соединение потеряно', 'error');
        }
    };
}

createRoomBtn.addEventListener('click', async () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        connectWebSocket();
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const hasMedia = await getMediaStream();
    if (!hasMedia) return;

    isHost = true;
    ws.send(JSON.stringify({
        type: 'create-room',
        userId: userId
    }));
});

joinRoomBtn.addEventListener('click', async () => {
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    if (!roomCode) {
        showStatus('Введите код комнаты', 'error');
        return;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        connectWebSocket();
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const hasMedia = await getMediaStream();
    if (!hasMedia) return;

    isHost = false;
    ws.send(JSON.stringify({
        type: 'join-room',
        roomCode: roomCode,
        userId: userId
    }));
});

leaveRoomBtn.addEventListener('click', () => {
    leaveRoom();
});

function handleRoomCreated(data) {
    currentRoomCode = data.roomCode;
    roomCodeDisplay.textContent = data.roomCode;
    homeScreen.classList.remove('active');
    roomScreen.classList.add('active');
    showStatus('Комната создана! Ждём партнёра...', 'success');
}

function handleRoomJoined(data) {
    currentRoomCode = data.roomCode;
    roomCodeDisplay.textContent = data.roomCode;
    homeScreen.classList.remove('active');
    roomScreen.classList.add('active');
    showStatus('Подключение к комнате...', 'info');
    
    // Гость инициирует соединение
    createPeerConnection();
    createOffer();
}

async function handlePeerJoined(data) {
    showStatus('Партнёр присоединился!', 'success');
    createPeerConnection();
}

async function createOffer() {
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        ws.send(JSON.stringify({
            type: 'offer',
            offer: offer
        }));
    } catch (error) {
        console.error('Ошибка создания offer:', error);
    }
}

async function handleOffer(data) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        ws.send(JSON.stringify({
            type: 'answer',
            answer: answer
        }));
    } catch (error) {
        console.error('Ошибка обработки offer:', error);
    }
}

async function handleAnswer(data) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } catch (error) {
        console.error('Ошибка обработки answer:', error);
    }
}

async function handleIceCandidate(data) {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
        console.error('Ошибка добавления ICE кандидата:', error);
    }
}

function handlePeerLeft() {
    showStatus('Партнёр отключился', 'info');
    waitingMessage.style.display = 'block';
    remoteVideo.srcObject = null;
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
}

function leaveRoom() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'leave-room'
        }));
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    currentRoomCode = null;
    
    roomScreen.classList.remove('active');
    homeScreen.classList.add('active');
    roomCodeInput.value = '';
}

// Управление видео
toggleVideoBtn.addEventListener('click', () => {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        videoTrack.enabled = !videoTrack.enabled;
        toggleVideoBtn.textContent = videoTrack.enabled ? '📹' : '📹❌';
        toggleVideoBtn.classList.toggle('active');
    }
});

// Управление аудио
toggleAudioBtn.addEventListener('click', () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        toggleAudioBtn.textContent = audioTrack.enabled ? '🎤' : '🎤❌';
        toggleAudioBtn.classList.toggle('active');
    }
});

// Демонстрация экрана
shareScreenBtn.addEventListener('click', async () => {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });

        const screenTrack = screenStream.getVideoTracks()[0];
        
        if (peerConnection) {
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(screenTrack);
            }
        }

        localVideo.srcObject = screenStream;
        shareScreenBtn.classList.add('active');
        showStatus('Демонстрация экрана началась', 'success');

        screenTrack.onended = () => {
            if (localStream) {
                const videoTrack = localStream.getVideoTracks()[0];
                if (peerConnection) {
                    const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
                    if (sender) {
                        sender.replaceTrack(videoTrack);
                    }
                }
                localVideo.srcObject = localStream;
                shareScreenBtn.classList.remove('active');
                showStatus('Демонстрация экрана завершена', 'info');
            }
        };
    } catch (error) {
        console.error('Ошибка демонстрации экрана:', error);
        showStatus('Не удалось начать демонстрацию экрана', 'error');
    }
});

// Инициализация при загрузке
window.addEventListener('load', () => {
    connectWebSocket();
});
