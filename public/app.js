const socket = io();

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const createRoomBtn = document.getElementById('createRoom');
const joinRoomBtn = document.getElementById('joinRoom');
const shareScreenBtn = document.getElementById('shareScreen');
const stopShareBtn = document.getElementById('stopShare');
const roomCodeInput = document.getElementById('roomCode');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const statusDiv = document.getElementById('status');
const landingPage = document.getElementById('landingPage');
const videoContainer = document.getElementById('videoContainer');

let localStream;
let remoteStream;
let peerConnection;
let currentRoom;
let isScreenSharing = false;

const configuration = {
    iceServers: [
        { 
            urls: 'stun:stun.l.google.com:19302' 
        },
        { 
            urls: 'stun:stun1.l.google.com:19302' 
        },
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ],
    iceCandidatePoolSize: 10
};

// Запуск локального видеопотока (опционально - не блокирует если камеры нет)
async function startLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        localVideo.srcObject = localStream;
        console.log('✅ Локальный видеопоток запущен');
        updateStatus('✅ Камера и микрофон подключены');
        return true;
    } catch (error) {
        console.warn('⚠️ Камера недоступна:', error.message);
        updateStatus('⚠️ Камера недоступна. Используйте "Показать экран"');
        // Создаём пустой поток, чтобы приложение работало
        localStream = new MediaStream();
        return false;
    }
}

// Создание комнаты
createRoomBtn.addEventListener('click', async () => {
    const hasCamera = await startLocalStream();
    
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    currentRoom = roomCode;
    
    socket.emit('create-room', roomCode);
    
    landingPage.style.display = 'none';
    videoContainer.style.display = 'flex';
    roomCodeDisplay.textContent = `Код комнаты: ${roomCode}`;
    
    if (hasCamera) {
        updateStatus('🎬 Комната создана! Поделитесь кодом с партнёром.');
    } else {
        updateStatus('🎬 Комната создана! Нажмите "Показать экран" для трансляции.');
    }
});

// Присоединение к комнате
joinRoomBtn.addEventListener('click', async () => {
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    if (!roomCode) {
        alert('Введите код комнаты!');
        return;
    }
    
    const hasCamera = await startLocalStream();
    currentRoom = roomCode;
    
    socket.emit('join-room', roomCode);
    
    landingPage.style.display = 'none';
    videoContainer.style.display = 'flex';
    roomCodeDisplay.textContent = `Код комнаты: ${roomCode}`;
    updateStatus('🔗 Подключаемся к комнате...');
});

// Обработчики сокетов
socket.on('room-created', (roomCode) => {
    console.log('✅ Комната создана:', roomCode);
});

socket.on('room-joined', async (roomCode) => {
    console.log('✅ Присоединились к комнате:', roomCode);
    updateStatus('🔗 Установка соединения...');
    await createPeerConnection();
    await createOffer();
});

socket.on('user-joined', async (roomCode) => {
    console.log('👤 Партнёр присоединился:', roomCode);
    updateStatus('👤 Партнёр подключился! Устанавливаем связь...');
    await createPeerConnection();
});

socket.on('offer', async (offer) => {
    console.log('📩 Получен offer');
    updateStatus('📩 Получен запрос на соединение...');
    if (!peerConnection) {
        await createPeerConnection();
    }
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', { room: currentRoom, answer });
        updateStatus('📤 Отправлен ответ...');
    } catch (error) {
        console.error('❌ Ошибка обработки offer:', error);
        updateStatus('❌ Ошибка установки соединения');
    }
});

socket.on('answer', async (answer) => {
    console.log('📩 Получен answer');
    updateStatus('📩 Получен ответ...');
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        updateStatus('✅ Соединение установлено!');
    } catch (error) {
        console.error('❌ Ошибка обработки answer:', error);
        updateStatus('❌ Ошибка установки соединения');
    }
});

socket.on('ice-candidate', async (candidate) => {
    console.log('🧊 Получен ICE candidate');
    if (peerConnection) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('❌ Ошибка добавления ICE candidate:', error);
        }
    }
});

socket.on('user-disconnected', () => {
    console.log('👋 Партнёр отключился');
    updateStatus('👋 Партнёр отключился');
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
});

socket.on('room-full', () => {
    alert('❌ Комната заполнена! Максимум 2 участника.');
    location.reload();
});

socket.on('room-not-found', () => {
    alert('❌ Комната не найдена! Проверьте код.');
    location.reload();
});

// Создание peer connection
async function createPeerConnection() {
    console.log('🔧 Создание peer connection...');
    peerConnection = new RTCPeerConnection(configuration);
    
    // Добавляем локальные треки (если есть)
    if (localStream && localStream.getTracks().length > 0) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
            console.log('➕ Добавлен локальный трек:', track.kind);
        });
    } else {
        console.log('⚠️ Нет локальных треков для отправки');
    }
    
    // Обработка входящих треков
    peerConnection.ontrack = (event) => {
        console.log('📺 Получен удалённый трек:', event.track.kind);
        if (!remoteStream) {
            remoteStream = new MediaStream();
            remoteVideo.srcObject = remoteStream;
        }
        remoteStream.addTrack(event.track);
        updateStatus('🎥 Видеосвязь установлена!');
    };
    
    // ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('🧊 Отправка ICE candidate');
            socket.emit('ice-candidate', { room: currentRoom, candidate: event.candidate });
        }
    };
    
    // Отслеживание состояния
    peerConnection.onconnectionstatechange = () => {
        console.log('🔄 Состояние соединения:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            updateStatus('✅ Соединение установлено!');
        } else if (peerConnection.connectionState === 'disconnected') {
            updateStatus('⚠️ Соединение потеряно');
        } else if (peerConnection.connectionState === 'failed') {
            updateStatus('❌ Не удалось установить соединение');
        } else if (peerConnection.connectionState === 'connecting') {
            updateStatus('🔗 Устанавливается соединение...');
        }
    };
    
    peerConnection.oniceconnectionstatechange = () => {
        console.log('🧊 ICE состояние:', peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'checking') {
            updateStatus('🔍 Поиск лучшего соединения...');
        } else if (peerConnection.iceConnectionState === 'connected' || peerConnection.iceConnectionState === 'completed') {
            updateStatus('✅ Соединение установлено!');
        } else if (peerConnection.iceConnectionState === 'failed') {
            updateStatus('❌ Не удалось установить соединение. Проверьте интернет.');
        }
    };
}

// Создание offer
async function createOffer() {
    console.log('📤 Создание offer...');
    try {
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', { room: currentRoom, offer });
        updateStatus('📤 Отправлен запрос на соединение...');
    } catch (error) {
        console.error('❌ Ошибка создания offer:', error);
        updateStatus('❌ Ошибка создания соединения');
    }
}

// Демонстрация экрана
shareScreenBtn.addEventListener('click', async () => {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
            video: {
                cursor: "always"
            },
            audio: true
        });
        
        const screenTrack = screenStream.getVideoTracks()[0];
        
        // Если есть peer connection, заменяем видео трек
        if (peerConnection) {
            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(screenTrack);
                console.log('✅ Видео трек заменён на демонстрацию экрана');
            } else {
                // Добавляем новый трек
                peerConnection.addTrack(screenTrack, screenStream);
                console.log('✅ Добавлен трек демонстрации экрана');
            }
        }
        
        // Сохраняем старый stream для восстановления
        const oldStream = localStream;
        localStream = screenStream;
        localVideo.srcObject = screenStream;
        
        isScreenSharing = true;
        shareScreenBtn.style.display = 'none';
        stopShareBtn.style.display = 'inline-block';
        updateStatus('🖥️ Демонстрация экрана включена');
        
        // Обработка остановки демонстрации
        screenTrack.onended = () => {
            stopScreenShare(oldStream);
        };
    } catch (error) {
        console.error('❌ Ошибка демонстрации экрана:', error);
        updateStatus('❌ Не удалось включить демонстрацию экрана');
    }
});

// Остановка демонстрации экрана
stopShareBtn.addEventListener('click', () => {
    stopScreenShare();
});

function stopScreenShare(oldStream) {
    // Останавливаем демонстрацию экрана
    if (localStream && isScreenSharing) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    // Возвращаемся к камере или пустому потоку
    if (oldStream && oldStream.getTracks().length > 0) {
        localStream = oldStream;
        localVideo.srcObject = localStream;
        
        // Заменяем трек обратно на камеру
        if (peerConnection) {
            const videoTrack = localStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender && videoTrack) {
                sender.replaceTrack(videoTrack);
            }
        }
        updateStatus('📹 Вернулись к видео с камеры');
    } else {
        localStream = new MediaStream();
        localVideo.srcObject = null;
        updateStatus('📹 Демонстрация экрана остановлена');
    }
    
    isScreenSharing = false;
    shareScreenBtn.style.display = 'inline-block';
    stopShareBtn.style.display = 'none';
}

// Обновление статуса
function updateStatus(message) {
    statusDiv.textContent = message;
    console.log('📢', message);
}

// Очистка при закрытии страницы
window.addEventListener('beforeunload', () => {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
        peerConnection.close();
    }
    socket.disconnect();
});
