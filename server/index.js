const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const fetch = require('node-fetch');

const { createLobbyManager } = require('./lobbyManager');
const { getNickname } = require('./nickname');

const PORT = process.env.PORT || 4000;
const ORIGIN =
  process.env.CLIENT_ORIGIN || process.env.REACT_APP_SOCKET_URL || '*';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ORIGIN,
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: ORIGIN }));
app.use(express.json());

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', time: new Date().toISOString() })
);

app.get('/api/nickname', async (_req, res) => {
  try {
    const nickname = await getNickname(fetch);
    res.json({ nickname });
  } catch (error) {
    res.status(500).json({ error: 'Unable to generate nickname' });
  }
});

const lobbyManager = createLobbyManager(io, fetch);

io.on('connection', socket => {
  socket.on('createLobby', async (payload, cb) => {
    const response = await lobbyManager.createLobby(socket, payload);
    if (cb) cb(response);
  });

  socket.on('joinLobby', async (payload, cb) => {
    const response = await lobbyManager.joinLobby(socket, payload);
    if (cb) cb(response);
  });

  socket.on('updateSettings', (payload, cb) => {
    const response = lobbyManager.updateSettings(socket, payload);
    if (cb) cb(response);
  });

  socket.on('startGame', async (payload, cb) => {
    const response = await lobbyManager.startGame(socket, payload);
    if (cb) cb(response);
  });

  socket.on('submitAnswer', (payload, cb) => {
    const response = lobbyManager.submitAnswer(socket, payload);
    if (cb) cb(response);
  });

  socket.on('continueAfterBreak', (payload, cb) => {
    const response = lobbyManager.continueAfterBreak(socket, payload);
    if (cb) cb(response);
  });

  socket.on('disconnect', () => {
    lobbyManager.disconnect(socket);
  });
});

server.listen(PORT, () => {
  /* eslint-disable no-console */
  console.log(`Quiz realtime server running on port ${PORT}`);
});
