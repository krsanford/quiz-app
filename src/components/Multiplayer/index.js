import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { io } from 'socket.io-client';
import he from 'he';
import {
  Button,
  Container,
  Divider,
  Form,
  Grid,
  Header,
  Label,
  List,
  Message,
  Segment,
  Statistic,
} from 'semantic-ui-react';

const SOCKET_URL =
  process.env.REACT_APP_SOCKET_URL || 'http://localhost:4000';

const defaultSettings = {
  rounds: 2,
  questionsPerRound: 5,
  secondsBetweenQuestions: 5,
  questionDurationSeconds: 20,
};

const Leaderboard = ({ leaderboard }) => (
  <Segment>
    <Header as="h3">Leaderboard</Header>
    <List divided relaxed>
      {leaderboard.map((player, idx) => (
        <List.Item key={player.id}>
          <Label color={idx === 0 ? 'yellow' : undefined} circular>
            {idx + 1}
          </Label>
          <List.Content>
            <List.Header>{player.name}</List.Header>
            <List.Description>{player.score} points</List.Description>
          </List.Content>
        </List.Item>
      ))}
    </List>
  </Segment>
);

Leaderboard.propTypes = {
  leaderboard: PropTypes.array.isRequired,
};

const Multiplayer = ({ switchToSolo }) => {
  const [socket] = useState(() =>
    io(SOCKET_URL, {
      autoConnect: true,
    })
  );
  const [phase, setPhase] = useState('landing');
  const [clientId, setClientId] = useState(socket.id || '');
  const [hostId, setHostId] = useState(null);
  const [nickname, setNickname] = useState('');
  const [lobbyCode, setLobbyCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [settings, setSettings] = useState(defaultSettings);
  const [players, setPlayers] = useState([]);
  const [question, setQuestion] = useState(null);
  const [roundInfo, setRoundInfo] = useState({ round: 0, totalRounds: 1 });
  const [leaderboard, setLeaderboard] = useState([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [betweenCountdown, setBetweenCountdown] = useState(null);
  const [questionCountdown, setQuestionCountdown] = useState(null);

  const decodedQuestion = useMemo(() => {
    if (!question?.question) return null;
    return {
      ...question,
      question: he.decode(question.question),
      options: question.options.map(o => he.decode(o)),
    };
  }, [question]);

  const requestNickname = async () => {
    try {
      const res = await fetch(`${SOCKET_URL}/api/nickname`);
      const data = await res.json();
      if (data?.nickname) setNickname(data.nickname);
    } catch (e) {
      setNickname(`Player-${Math.floor(Math.random() * 999)}`);
    }
  };

  useEffect(() => {
    requestNickname();
  }, []);

  useEffect(() => {
    const handleLobbyState = payload => {
      setLobbyCode(payload.code);
      setHostId(payload.hostId);
      setIsHost(payload.hostId === socket.id);
      setPlayers(payload.players || []);
      setSettings(payload.settings || defaultSettings);
      setRoundInfo({
        round: payload.round || 0,
        totalRounds: payload.settings?.rounds || settings.rounds,
      });
      if (payload.status === 'lobby') setPhase('lobby');
    };

    const handleQuestionStart = payload => {
      setQuestion({
        ...payload.question,
        expiresAt: payload.expiresAt,
        questionNumber: payload.questionNumber,
        totalQuestions: payload.totalQuestions,
      });
      setBetweenCountdown(null);
      setRoundInfo({
        round: payload.round,
        totalRounds: payload.totalRounds,
      });
      setAnswer(null);
      setPhase('question');
      setLeaderboard([]);
      setStatus('');
    };

    const handleQuestionEnd = payload => {
      setLeaderboard(payload.leaderboard || []);
      setStatus(`Next question in ${payload.nextQuestionIn}s`);
      setBetweenCountdown(payload.nextQuestionIn);
      setPhase('between');
      setQuestionCountdown(null);
    };

    const handleRoundBreak = payload => {
      setLeaderboard(payload.leaderboard || []);
      setStatus(`Round ${payload.round} finished`);
      setPhase('break');
      setQuestionCountdown(null);
    };

    const handleGameEnded = payload => {
      setLeaderboard(payload.leaderboard || []);
      setPhase('ended');
    };

    const handleError = payload => setError(payload?.error || payload);

    const handleConnect = () => setClientId(socket.id);

    socket.on('connect', handleConnect);
    socket.on('lobbyState', handleLobbyState);
    socket.on('questionStarted', handleQuestionStart);
    socket.on('questionEnded', handleQuestionEnd);
    socket.on('roundBreak', handleRoundBreak);
    socket.on('gameEnded', handleGameEnded);
    socket.on('errorMessage', handleError);
    socket.on('connect_error', err => setError(err.message));

    return () => {
      socket.off('connect', handleConnect);
      socket.off('lobbyState', handleLobbyState);
      socket.off('questionStarted', handleQuestionStart);
      socket.off('questionEnded', handleQuestionEnd);
      socket.off('roundBreak', handleRoundBreak);
      socket.off('gameEnded', handleGameEnded);
      socket.off('errorMessage', handleError);
    };
  }, [settings.rounds, socket]);

  useEffect(() => {
    if (!question?.expiresAt || phase !== 'question') return undefined;
    const interval = setInterval(() => {
      const secondsLeft = Math.max(
        0,
        Math.round((question.expiresAt - Date.now()) / 1000)
      );
      setQuestionCountdown(secondsLeft);
    }, 500);
    return () => clearInterval(interval);
  }, [phase, question]);

  useEffect(() => {
    if (phase !== 'between' || betweenCountdown === null) return undefined;
    if (betweenCountdown <= 0) return undefined;
    const timeout = setTimeout(() => {
      setBetweenCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearTimeout(timeout);
  }, [betweenCountdown, phase]);

  const handleCreate = async () => {
    setError(null);
    const payload = {
      nickname,
      settings,
    };

    socket.emit('createLobby', payload, response => {
      if (!response?.ok) {
        setError(response?.error || 'Unable to create lobby');
        return;
      }
      setPhase('lobby');
    });
  };

  const handleJoin = code => {
    setError(null);
    socket.emit(
      'joinLobby',
      { code, nickname },
      response => {
        if (!response?.ok) {
          setError(response?.error || 'Unable to join lobby');
          return;
        }
        setPhase('lobby');
      }
    );
  };

  const handleSettingsChange = (_e, { name, value }) => {
    const numeric = Number(value);
    const next = { ...settings, [name]: numeric };
    setSettings(next);
    if (isHost && lobbyCode) {
      socket.emit('updateSettings', { code: lobbyCode, settings: next });
    }
  };

  const startGame = () => {
    setError(null);
    socket.emit('startGame', { code: lobbyCode }, response => {
      if (!response?.ok) setError(response?.error || 'Unable to start game');
    });
  };

  const submitAnswer = option => {
    setAnswer(option);
    socket.emit('submitAnswer', { code: lobbyCode, answer: option });
  };

  const continueAfterBreak = () => {
    socket.emit('continueAfterBreak', { code: lobbyCode }, response => {
      if (!response?.ok) setError(response?.error || 'Unable to continue');
    });
  };

  const currentView = () => {
    if (phase === 'landing') {
      return (
        <Segment>
          <Header as="h2">Real-time Multiplayer</Header>
          <p>Create a lobby or join one with a code. Each question is timed, and scores update between questions.</p>
          <Divider />
          <Form>
            <Form.Input
              label="Nickname"
              value={nickname}
              onChange={(_e, { value }) => setNickname(value)}
            />
            <Form.Group widths="equal">
              <Form.Input
                label="Lobby Code"
                placeholder="ABCD"
                onChange={(_e, { value }) => setLobbyCode(value.toUpperCase())}
                value={lobbyCode}
              />
              <Form.Button
                primary
                content="Join Lobby"
                onClick={() => handleJoin(lobbyCode)}
                type="button"
              />
            </Form.Group>
          </Form>
          <Divider horizontal>or</Divider>
          <Button primary icon="add" content="Create Lobby" onClick={handleCreate} type="button" />
        </Segment>
      );
    }

    if (phase === 'lobby') {
      return (
        <Segment>
          <Header as="h2">
            Lobby {lobbyCode && <Label color="blue">{lobbyCode}</Label>}
          </Header>
          <p>Share the lobby code with friends. The host controls settings and starts the game.</p>
          {error && (
            <Message error onDismiss={() => setError(null)}>
              {error}
            </Message>
          )}
          <Grid stackable columns={2}>
            <Grid.Column>
              <Header as="h4">Players</Header>
              <List divided relaxed>
                {players.map(player => (
                  <List.Item key={player.id}>
                    {player.id === clientId && <Label size="mini" color="green" horizontal>Your device</Label>}
                    <List.Content>
                      <List.Header>
                        {player.name}{' '}
                        {player.id === hostId && '(Host)'}
                      </List.Header>
                      <List.Description>{player.score || 0} points</List.Description>
                    </List.Content>
                  </List.Item>
                ))}
              </List>
            </Grid.Column>
            <Grid.Column>
              <Header as="h4">Host Settings</Header>
              <Form>
                <Form.Input
                  label="Rounds"
                  name="rounds"
                  type="number"
                  min={1}
                  max={10}
                  value={settings.rounds}
                  onChange={handleSettingsChange}
                  disabled={!isHost}
                />
                <Form.Input
                  label="Questions per round"
                  name="questionsPerRound"
                  type="number"
                  min={3}
                  max={20}
                  value={settings.questionsPerRound}
                  onChange={handleSettingsChange}
                  disabled={!isHost}
                />
                <Form.Input
                  label="Seconds between questions"
                  name="secondsBetweenQuestions"
                  type="number"
                  min={2}
                  max={20}
                  value={settings.secondsBetweenQuestions}
                  onChange={handleSettingsChange}
                  disabled={!isHost}
                />
                <Form.Input
                  label="Seconds to answer each question"
                  name="questionDurationSeconds"
                  type="number"
                  min={8}
                  max={40}
                  value={settings.questionDurationSeconds}
                  onChange={handleSettingsChange}
                  disabled={!isHost}
                />
              </Form>
              {isHost && (
                <Button
                  primary
                  icon="play"
                  content="Start Game"
                  onClick={startGame}
                  style={{ marginTop: '12px' }}
                />
              )}
            </Grid.Column>
          </Grid>
        </Segment>
      );
    }

    if (phase === 'question' && decodedQuestion) {
      return (
        <Segment>
          <Header as="h3">
            Round {roundInfo.round} / {roundInfo.totalRounds}
            <Header.Subheader>
              Question {decodedQuestion.questionNumber} of {decodedQuestion.totalQuestions}
            </Header.Subheader>
          </Header>
          <Message info>
            <Message.Header>{decodedQuestion.question}</Message.Header>
            <p>Pick an answer before the timer runs out.</p>
          </Message>
          <Grid stackable columns={2}>
            <Grid.Column width={10}>
              <Button.Group vertical fluid>
                {decodedQuestion.options.map(option => (
                  <Button
                    key={option}
                    size="large"
                    onClick={() => submitAnswer(option)}
                    primary={answer === option}
                    basic={answer !== option}
                    style={{ marginBottom: '8px' }}
                  >
                    {option}
                  </Button>
                ))}
              </Button.Group>
            </Grid.Column>
            <Grid.Column width={6}>
              <Statistic>
                <Statistic.Label>Seconds left</Statistic.Label>
                <Statistic.Value>{questionCountdown ?? settings.questionDurationSeconds}</Statistic.Value>
              </Statistic>
              <Divider />
              <Leaderboard leaderboard={leaderboard} />
            </Grid.Column>
          </Grid>
        </Segment>
      );
    }

    if (phase === 'between') {
      return (
        <Segment>
          <Header as="h3">Next question coming up</Header>
          <p>{status}</p>
          {betweenCountdown !== null && (
            <Statistic>
              <Statistic.Label>Seconds</Statistic.Label>
              <Statistic.Value>{betweenCountdown}</Statistic.Value>
            </Statistic>
          )}
          <Leaderboard leaderboard={leaderboard} />
        </Segment>
      );
    }

    if (phase === 'break') {
      return (
        <Segment>
          <Header as="h3">Round break</Header>
          <p>Stretch your legs! Host will start the next round.</p>
          <Leaderboard leaderboard={leaderboard} />
          {isHost && (
            <Button primary onClick={continueAfterBreak}>
              Continue to next round
            </Button>
          )}
        </Segment>
      );
    }

    if (phase === 'ended') {
      return (
        <Segment>
          <Header as="h2">Game finished</Header>
          <Leaderboard leaderboard={leaderboard} />
          <Button onClick={() => setPhase('lobby')}>Back to lobby</Button>
        </Segment>
      );
    }

    return null;
  };

  return (
    <Container>
      <Segment basic textAlign="right">
        <Button icon="home" onClick={switchToSolo} content="Back to Solo" />
      </Segment>
      {error && (
        <Message error onDismiss={() => setError(null)}>
          {error}
        </Message>
      )}
      {currentView()}
    </Container>
  );
};

Multiplayer.propTypes = {
  switchToSolo: PropTypes.func.isRequired,
};

export default Multiplayer;
