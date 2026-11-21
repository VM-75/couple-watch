const socket = io();

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const statusDiv = document.getElementById('status');
const roomCodeDiv = document.getElementById('roomCode');
const startButton = document.getElementById('startButton');
const joinButton = document.getElementById('joinButton');
const shareScreenButton = document.getElementById('shareScreenButton');
const roomCodeInput = document.getElementById('roomCodeInput');
const setupDiv = document.getElementById('setup');
const videoContainer = document.getElementById('videoContainer');

let localStream;
let peerConnection;
let roomId;
let isScreenSharing = false;

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
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

console.log('🚀 Приложение запущено');
console.log('🔧 Конфигурация ICE:', configuration);

async function startLocalStream() {
    try {
        console.log('📹 Попытка получить доступ к камере...');
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        localVideo.srcObject = localStream;
        console.log('✅ Камера и микрофон подключены');
        return true;
    } catch (err) {
        console.warn('⚠️ Не удалось получить камеру:', err);
        console.log('🎬 Создаём пустой поток для работы без камеры');
        // Создаём пустой поток
        localStream = new MediaStream();
        localVideo.srcObject = localStream;
        return false;
    }
}

startButton.onclick = async () => {
    console.log('🎬 Создание комнаты...');
    statusDiv.textContent = '⏳ Создание комнаты...';
    
    await startLocalStream();
    
    roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    console.log('🆔 Сгенерирован код комнаты:', roomId);
    
    socket.emit('create-room', roomId);
    
    roomCodeDiv.textContent = `Код комнаты: ${roomId}`;
    statusDiv.textContent = '🎬 Комната создана! Поделитесь кодом с партнёром.';
    setupDiv.style.display = 'none';
    videoContainer.style.display = 'block';
    shareScreenButton.style.display = 'block';
    
    console.log('✅ Комната создана, ожидание партнёра...');
};

joinButton.onclick = async () => {
    roomId = roomCodeInput.value.trim().toUpperCase();
    
    if (!roomId) {
        alert('Введите код комнаты');
        return;
    }
    
    console.log('🚪 Подключение к комнате:', roomId);
    statusDiv.textContent = '⏳ Подключение...';
    
    await startLocalStream();
    
    socket.emit('join-room', roomId);
    
    setupDiv.style.display = 'none';
    videoContainer.style.display = 'block';
    shareScreenButton.style.display = 'block';
    
    console.log('📡 Запрос на присоединение отправлен');
};

shareScreenButton.onclick = async () => {
    if (isScreenSharing) {
        console.log('⏹️ Остановка демонстрации экрана');
        isScreenSharing = false;
        shareScreenButton.textContent = '🖥️ Показать экран';
        
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) videoTrack.stop();
        
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            const newVideoTrack = newStream.getVideoTracks()[0];
            
            if (peerConnection) {
                const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) {
                    await sender.replaceTrack(newVideoTrack);
                }
            }
            
            localStream.removeTrack(videoTrack);
            localStream.addTrack(newVideoTrack);
            localVideo.srcObject = localStream;
            
            console.log('✅ Вернулись к камере');
        } catch (err) {
            console.error('❌ Ошибка возврата к камере:', err);
        }
    } else {
        try {
            console.log('🖥️ Запуск демонстрации экрана...');
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
                video: true,
                audio: true 
            });
            
            const screenTrack = screenStream.getVideoTracks()[0];
            const videoTrack = localStream.getVideoTracks()[0];
            
            if (videoTrack) {
                localStream.removeTrack(videoTrack);
                videoTrack.stop();
            }
            
            localStream.addTrack(screenTrack);
            localVideo.srcObject = localStream;
            
            if (peerConnection) {
                const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) {
                    await sender.replaceTrack(screenTrack);
                    console.log('✅ Видеодорожка заменена на демонстрацию экрана');
                }
            }
            
            isScreenSharing = true;
            shareScreenButton.textContent = '⏹️ Остановить показ';
            statusDiv.textContent = '🖥️ Демонстрация экрана включена';
            
            screenTrack.onended = () => {
                console.log('🛑 Демонстрация экрана остановлена пользователем');
                isScreenSharing = false;
                shareScreenButton.textContent = '🖥️ Показать экран';
                statusDiv.textContent = '✅ Соединение установлено';
            };
            
            console.log('✅ Демонстрация экрана запущена');
        } catch (err) {
            console.error('❌ Ошибка при демонстрации экрана:', err);
            statusDiv.textContent = '❌ Не удалось включить демонстрацию экрана';
        }
    }
};

socket.on('room-created', (room) => {
    console.log('✅ Комната создана на сервере:', room);
    statusDiv.textContent = '✅ Ожидание партнёра...';
});

socket.on('room-joined', (room) => {
    console.log('✅ Успешно присоединились к комнате:', room);
    roomCodeDiv.textContent = `Код комнаты: ${room}`;
    statusDiv.textContent = '✅ Подключено к комнате';
});

socket.on('room-full', () => {
    console.error('❌ Комната заполнена');
    alert('Комната уже заполнена');
    location.reload();
});

socket.on('start-call', async () => {
    console.log('📞 Начало звонка (создание offer)...');
    statusDiv.textContent = '📞 Установка соединения...';
    
    peerConnection = new RTCPeerConnection(configuration);
    console.log('🔧 RTCPeerConnection создан');
    
    localStream.getTracks().forEach(track => {
        console.log('➕ Добавление трека:', track.kind);
        peerConnection.addTrack(track, localStream);
    });
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('🧊 ICE кандидат найден:', event.candidate.type);
            socket.emit('ice-candidate', roomId, event.candidate);
        } else {
            console.log('✅ Все ICE кандидаты собраны');
        }
    };
    
    peerConnection.ontrack = (event) => {
        console.log('📥 Получен удалённый трек:', event.track.kind);
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            console.log('✅ Удалённое видео подключено');
            statusDiv.textContent = '✅ Соединение установлено';
        }
    };
    
    peerConnection.oniceconnectionstatechange = () => {
        console.log('🔄 ICE состояние:', peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'connected') {
            statusDiv.textContent = '✅ Соединение установлено';
        } else if (peerConnection.iceConnectionState === 'failed') {
            statusDiv.textContent = '❌ Не удалось установить соединение';
        }
    };
    
    const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
    });
    await peerConnection.setLocalDescription(offer);
    console.log('📤 Offer создан и отправлен');
    
    socket.emit('offer', roomId, offer);
});

socket.on('offer', async (offer) => {
    console.log('📥 Получен offer');
    statusDiv.textContent = '📞 Установка соединения...';
    
    peerConnection = new RTCPeerConnection(configuration);
    console.log('🔧 RTCPeerConnection создан');
    
    localStream.getTracks().forEach(track => {
        console.log('➕ Добавление трека:', track.kind);
        peerConnection.addTrack(track, localStream);
    });
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('🧊 ICE кандидат найден:', event.candidate.type);
            socket.emit('ice-candidate', roomId, event.candidate);
        } else {
            console.log('✅ Все ICE кандидаты собраны');
        }
    };
    
    peerConnection.ontrack = (event) => {
        console.log('📥 Получен удалённый трек:', event.track.kind);
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            console.log('✅ Удалённое видео подключено');
            statusDiv.textContent = '✅ Соединение установлено';
        }
    };
    
    peerConnection.oniceconnectionstatechange = () => {
        console.log('🔄 ICE состояние:', peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'connected') {
            statusDiv.textContent = '✅ Соединение установлено';
        } else if (peerConnection.iceConnectionState === 'failed') {
            statusDiv.textContent = '❌ Не удалось установить соединение';
        }
    };
    
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    console.log('✅ Remote description установлен');
    
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    console.log('📤 Answer создан и отправлен');
    
    socket.emit('answer', roomId, answer);
    statusDiv.textContent = '✅ Отправлен ответ...';
});

socket.on('answer', async (answer) => {
    console.log('📥 Получен answer');
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    console.log('✅ Remote description установлен (answer)');
});

socket.on('ice-candidate', async (candidate) => {
    try {
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('✅ ICE кандидат добавлен');
        }
    } catch (err) {
        console.error('❌ Ошибка добавления ICE кандидата:', err);
    }
});

socket.on('user-disconnected', () => {
    console.log('👋 Партнёр отключился');
    statusDiv.textContent = '👋 Партнёр отключился';
    remoteVideo.srcObject = null;
    if (peerConnection) {
        peerConnection.close();
    }
});

console.log('✅ Все обработчики событий установлены');
