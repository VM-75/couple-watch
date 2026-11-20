const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Раздача статических файлов из папки public
app.use(express.static(path.join(__dirname, 'public')));

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Хранилище активных комнат
const rooms = new Map();

// Обработка WebSocket соединений
io.on('connection', (socket) => {
    console.log('✅ Новое подключение:', socket.id);

    // Создание комнаты
    socket.on('create-room', (roomCode) => {
        console.log('🎬 Создание комнаты:', roomCode);
        
        if (rooms.has(roomCode)) {
            socket.emit('room-exists', roomCode);
            return;
        }

        rooms.set(roomCode, {
            host: socket.id,
            participants: [socket.id]
        });

        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.emit('room-created', roomCode);
        console.log('✅ Комната создана:', roomCode, '| Участник:', socket.id);
    });

    // Присоединение к комнате
    socket.on('join-room', (roomCode) => {
        console.log('🔗 Попытка присоединиться к комнате:', roomCode, '| Пользователь:', socket.id);

        const room = rooms.get(roomCode);

        if (!room) {
            console.log('❌ Комната не найдена:', roomCode);
            socket.emit('room-not-found');
            return;
        }

        if (room.participants.length >= 2) {
            console.log('❌ Комната заполнена:', roomCode);
            socket.emit('room-full');
            return;
        }

        room.participants.push(socket.id);
        socket.join(roomCode);
        socket.roomCode = roomCode;

        console.log('✅ Присоединился к комнате:', roomCode, '| Участники:', room.participants);

        // Уведомляем создателя комнаты о новом участнике
        socket.to(roomCode).emit('user-joined', roomCode);
        socket.emit('room-joined', roomCode);
    });

    // Передача offer
    socket.on('offer', (data) => {
        console.log('📤 Передача offer в комнату:', data.room);
        socket.to(data.room).emit('offer', data.offer);
    });

    // Передача answer
    socket.on('answer', (data) => {
        console.log('📤 Передача answer в комнату:', data.room);
        socket.to(data.room).emit('answer', data.answer);
    });

    // Передача ICE candidate
    socket.on('ice-candidate', (data) => {
        console.log('🧊 Передача ICE candidate в комнату:', data.room);
        socket.to(data.room).emit('ice-candidate', data.candidate);
    });

    // Отключение
    socket.on('disconnect', () => {
        console.log('👋 Отключился:', socket.id);

        if (socket.roomCode) {
            const room = rooms.get(socket.roomCode);
            
            if (room) {
                // Удаляем участника из комнаты
                room.participants = room.participants.filter(id => id !== socket.id);

                // Уведомляем других участников
                socket.to(socket.roomCode).emit('user-disconnected');

                // Если комната пустая — удаляем её
                if (room.participants.length === 0) {
                    rooms.delete(socket.roomCode);
                    console.log('🗑️ Комната удалена:', socket.roomCode);
                } else {
                    console.log('👤 Участников в комнате', socket.roomCode + ':', room.participants.length);
                }
            }
        }
    });
});

// Запуск сервера
server.listen(PORT, () => {
    console.log('🚀 Сервер запущен на порту:', PORT);
    console.log('🌐 Приложение доступно по адресу: http://localhost:' + PORT);
});
