const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const rooms = new Map();

wss.on('connection', (ws) => {
  console.log('Новое WebSocket соединение');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Получено сообщение:', data.type);

      switch (data.type) {
        case 'create-room':
          handleCreateRoom(ws, data);
          break;
        case 'join-room':
          handleJoinRoom(ws, data);
          break;
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          handleSignaling(ws, data);
          break;
        case 'leave-room':
          handleLeaveRoom(ws, data);
          break;
      }
    } catch (error) {
      console.error('Ошибка обработки сообщения:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket соединение закрыто');
    handleDisconnect(ws);
  });
});

function handleCreateRoom(ws, data) {
  const roomCode = generateRoomCode();
  rooms.set(roomCode, {
    host: ws,
    guest: null,
    hostId: data.userId
  });
  ws.roomCode = roomCode;
  ws.isHost = true;
  ws.userId = data.userId;
  
  ws.send(JSON.stringify({
    type: 'room-created',
    roomCode: roomCode
  }));
  console.log(`Комната создана: ${roomCode}`);
}

function handleJoinRoom(ws, data) {
  const room = rooms.get(data.roomCode);
  
  if (!room) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Комната не найдена'
    }));
    return;
  }
  
  if (room.guest) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Комната заполнена'
    }));
    return;
  }
  
  room.guest = ws;
  ws.roomCode = data.roomCode;
  ws.isHost = false;
  ws.userId = data.userId;
  
  ws.send(JSON.stringify({
    type: 'room-joined',
    roomCode: data.roomCode
  }));
  
  // Notify host about new guest
  if (room.host.readyState === WebSocket.OPEN) {
    room.host.send(JSON.stringify({
      type: 'peer-joined',
      userId: data.userId
    }));
  }
  
  console.log(`Пользователь присоединился к комнате: ${data.roomCode}`);
}

function handleSignaling(ws, data) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;
  
  const targetWs = ws.isHost ? room.guest : room.host;
  
  if (targetWs && targetWs.readyState === WebSocket.OPEN) {
    targetWs.send(JSON.stringify(data));
  }
}

function handleLeaveRoom(ws, data) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;
  
  const otherWs = ws.isHost ? room.guest : room.host;
  
  if (otherWs && otherWs.readyState === WebSocket.OPEN) {
    otherWs.send(JSON.stringify({
      type: 'peer-left'
    }));
  }
  
  if (ws.isHost) {
    rooms.delete(ws.roomCode);
    console.log(`Комната удалена: ${ws.roomCode}`);
  } else {
    room.guest = null;
  }
}

function handleDisconnect(ws) {
  if (ws.roomCode) {
    handleLeaveRoom(ws, {});
  }
}

function generateRoomCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}

server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Откройте приложение: http://localhost:${PORT}`);
});
