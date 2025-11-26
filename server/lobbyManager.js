const { getNickname } = require('./nickname');

const DEFAULT_SETTINGS = {
  rounds: 2,
  questionsPerRound: 5,
  secondsBetweenQuestions: 5,
  questionDurationSeconds: 20,
};

const FALLBACK_BLOCKLIST = ['fuck', 'shit', 'bitch', 'cunt', 'dick'];

const generateCode = () =>
  Math.random()
    .toString(36)
    .replace(/[^a-z]+/g, '')
    .substring(0, 5)
    .toUpperCase();

const shuffle = array => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const normalizeSettings = settings => {
  const clean = {
    rounds: Number(settings?.rounds || DEFAULT_SETTINGS.rounds),
    questionsPerRound: Number(
      settings?.questionsPerRound || DEFAULT_SETTINGS.questionsPerRound
    ),
    secondsBetweenQuestions: Number(
      settings?.secondsBetweenQuestions || DEFAULT_SETTINGS.secondsBetweenQuestions
    ),
    questionDurationSeconds: Number(
      settings?.questionDurationSeconds || DEFAULT_SETTINGS.questionDurationSeconds
    ),
  };

  clean.rounds = Math.min(Math.max(clean.rounds, 1), 10);
  clean.questionsPerRound = Math.min(Math.max(clean.questionsPerRound, 3), 20);
  clean.secondsBetweenQuestions = Math.min(
    Math.max(clean.secondsBetweenQuestions, 2),
    20
  );
  clean.questionDurationSeconds = Math.min(
    Math.max(clean.questionDurationSeconds, 8),
    40
  );

  return clean;
};

const hasProfanity = nickname => {
  if (!nickname) return false;
  const lower = nickname.toLowerCase();
  return FALLBACK_BLOCKLIST.some(word => lower.includes(word));
};

const checkProfanityRemote = async (nickname, fetcher) => {
  const url = `https://www.purgomalum.com/service/containsprofanity?text=${encodeURIComponent(
    nickname
  )}`;
  const res = await fetcher(url);
  if (!res.ok) throw new Error('Profanity API unavailable');
  const text = await res.text();
  return text.trim() === 'true';
};

const sanitizeNickname = async (nickname, fetcher) => {
  const trimmed = (nickname || '').trim();
  if (!trimmed) return getNickname(fetcher);

  try {
    const flagged = await checkProfanityRemote(trimmed, fetcher);
    if (flagged) return getNickname(fetcher);
  } catch (error) {
    if (hasProfanity(trimmed)) return getNickname(fetcher);
  }

  return trimmed.slice(0, 24);
};

const leaderboardFrom = players =>
  [...players.values()]
    .map(p => ({ id: p.id, name: p.name, score: p.score || 0 }))
    .sort((a, b) => b.score - a.score);

const prepareQuestion = (rawQuestion, index) => {
  const options = shuffle([
    rawQuestion.correct_answer,
    ...rawQuestion.incorrect_answers,
  ]);

  return {
    id: `${Date.now()}-${index}-${Math.random()}`,
    question: rawQuestion.question,
    options,
    correctAnswer: rawQuestion.correct_answer,
  };
};

const fetchQuestions = async (fetcher, amount) => {
  const url = `https://opentdb.com/api.php?amount=${amount}&type=multiple`;
  const res = await fetcher(url);
  if (!res.ok) throw new Error('Failed to fetch questions');
  const data = await res.json();
  if (!data.results?.length) throw new Error('No questions available');
  return data.results.map((q, index) => prepareQuestion(q, index));
};

const createLobbyManager = (io, fetcher) => {
  const lobbies = new Map();

  const getLobby = code => lobbies.get(String(code || '').toUpperCase());

  const emitLobbyState = lobby => {
    const state = {
      code: lobby.code,
      hostId: lobby.hostId,
      status: lobby.status,
      settings: lobby.settings,
      players: leaderboardFrom(lobby.players),
      round: lobby.round,
    };
    io.to(lobby.code).emit('lobbyState', state);
  };

  const endTimers = lobby => {
    if (lobby.timers.question) {
      clearTimeout(lobby.timers.question);
      lobby.timers.question = null;
    }
    if (lobby.timers.next) {
      clearTimeout(lobby.timers.next);
      lobby.timers.next = null;
    }
  };

  const endGame = lobby => {
    endTimers(lobby);
    lobby.status = 'ended';
    io.to(lobby.code).emit('gameEnded', {
      leaderboard: leaderboardFrom(lobby.players),
    });
    emitLobbyState(lobby);
  };

  const advanceQuestion = lobby => {
    endTimers(lobby);
    lobby.currentQuestionIndex += 1;

    if (lobby.currentQuestionIndex >= lobby.settings.questionsPerRound) {
      lobby.status = 'roundBreak';
      io.to(lobby.code).emit('roundBreak', {
        round: lobby.round,
        totalRounds: lobby.settings.rounds,
        leaderboard: leaderboardFrom(lobby.players),
      });
      return;
    }

    const currentQuestion =
      lobby.roundQuestions[lobby.round - 1][lobby.currentQuestionIndex];
    lobby.activeQuestion = currentQuestion;
    lobby.answers = new Map();
    lobby.status = 'question';

    const expiresAt =
      Date.now() + lobby.settings.questionDurationSeconds * 1000;

    io.to(lobby.code).emit('questionStarted', {
      questionNumber: lobby.currentQuestionIndex + 1,
      totalQuestions: lobby.settings.questionsPerRound,
      round: lobby.round,
      totalRounds: lobby.settings.rounds,
      expiresAt,
      question: {
        id: currentQuestion.id,
        question: currentQuestion.question,
        options: currentQuestion.options,
      },
    });

    lobby.timers.question = setTimeout(() => {
      finishQuestion(lobby);
    }, lobby.settings.questionDurationSeconds * 1000);
  };

  const finishQuestion = lobby => {
    endTimers(lobby);
    const { correctAnswer } = lobby.activeQuestion;

    lobby.answers.forEach((answer, playerId) => {
      if (answer === correctAnswer) {
        const player = [...lobby.players.values()].find(p => p.id === playerId);
        if (player) player.score += 1;
      }
    });

    const leaderboard = leaderboardFrom(lobby.players);
    lobby.status = 'betweenQuestions';

    io.to(lobby.code).emit('questionEnded', {
      correctAnswer,
      leaderboard,
      nextQuestionIn: lobby.settings.secondsBetweenQuestions,
    });

    lobby.timers.next = setTimeout(() => {
      advanceQuestion(lobby);
    }, lobby.settings.secondsBetweenQuestions * 1000);
  };

  const startRound = lobby => {
    lobby.round += 1;
    lobby.currentQuestionIndex = -1;
    advanceQuestion(lobby);
  };

  const createLobby = async (socket, payload) => {
    const nickname = await sanitizeNickname(payload?.nickname, fetcher);
    const settings = normalizeSettings(payload?.settings || {});
    const code = generateCode();
    const lobby = {
      code,
      hostId: socket.id,
      status: 'lobby',
      settings,
      players: new Map(),
      round: 0,
      currentQuestionIndex: -1,
      activeQuestion: null,
      answers: new Map(),
      timers: {},
      roundQuestions: [],
    };

    socket.join(code);
    lobby.players.set(socket.id, {
      id: socket.id,
      name: nickname || 'Host',
      score: 0,
    });

    lobbies.set(code, lobby);
    emitLobbyState(lobby);

    return { ok: true, code, host: true };
  };

  const joinLobby = async (socket, payload) => {
    const lobby = getLobby(payload?.code);
    if (!lobby) return { ok: false, error: 'Lobby not found' };
    socket.join(lobby.code);

    const nickname = await sanitizeNickname(payload?.nickname, fetcher);

    lobby.players.set(socket.id, {
      id: socket.id,
      name: nickname || 'Player',
      score: 0,
    });
    emitLobbyState(lobby);
    return { ok: true, code: lobby.code, host: false };
  };

  const updateSettings = (socket, payload) => {
    const lobby = getLobby(payload?.code);
    if (!lobby) return { ok: false, error: 'Lobby not found' };
    if (lobby.hostId !== socket.id) {
      return { ok: false, error: 'Only host can update settings' };
    }
    lobby.settings = normalizeSettings(payload?.settings || {});
    emitLobbyState(lobby);
    return { ok: true };
  };

  const startGame = async (socket, payload) => {
    const lobby = getLobby(payload?.code);
    if (!lobby) return { ok: false, error: 'Lobby not found' };
    if (lobby.hostId !== socket.id) {
      return { ok: false, error: 'Only host can start the game' };
    }

    lobby.status = 'loading';
    emitLobbyState(lobby);

    try {
      lobby.roundQuestions = [];
      for (let i = 0; i < lobby.settings.rounds; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const roundQs = await fetchQuestions(
          fetcher,
          lobby.settings.questionsPerRound
        );
        lobby.roundQuestions.push(roundQs);
      }

      lobby.players.forEach(p => {
        // reset scores if restarting
        // eslint-disable-next-line no-param-reassign
        p.score = 0;
      });

      lobby.round = 0;
      startRound(lobby);
      return { ok: true };
    } catch (error) {
      lobby.status = 'lobby';
      emitLobbyState(lobby);
      return { ok: false, error: 'Could not load questions' };
    }
  };

  const submitAnswer = (socket, payload) => {
    const lobby = getLobby(payload?.code);
    if (!lobby || lobby.status !== 'question') return { ok: false };
    if (!lobby.players.has(socket.id)) return { ok: false };
    if (lobby.answers.has(socket.id)) return { ok: true }; // already answered
    const choice = payload?.answer;
    lobby.answers.set(socket.id, choice);
    return { ok: true };
  };

  const continueAfterBreak = (socket, payload) => {
    const lobby = getLobby(payload?.code);
    if (!lobby) return { ok: false, error: 'Lobby not found' };
    if (lobby.hostId !== socket.id) {
      return { ok: false, error: 'Only host can continue' };
    }
    if (lobby.status !== 'roundBreak') return { ok: false };

    if (lobby.round >= lobby.settings.rounds) {
      endGame(lobby);
      return { ok: true };
    }

    startRound(lobby);
    return { ok: true };
  };

  const disconnect = socket => {
    lobbies.forEach((lobby, code) => {
      if (lobby.players.has(socket.id)) {
        lobby.players.delete(socket.id);

        if (lobby.hostId === socket.id) {
          const nextHost = lobby.players.keys().next().value;
          lobby.hostId = nextHost || null;
        }

        if (lobby.players.size === 0) {
          endTimers(lobby);
          lobbies.delete(code);
        } else {
          emitLobbyState(lobby);
        }
      }
    });
  };

  return {
    createLobby,
    joinLobby,
    updateSettings,
    startGame,
    submitAnswer,
    continueAfterBreak,
    disconnect,
  };
};

module.exports = { createLobbyManager };
