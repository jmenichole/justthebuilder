/**
 * Game management and real-time gameplay
 * 
 * Copyright (c) 2024 Degens Against Decency
 * Licensed under the MIT License
 * See LICENSE file in the project root for full license information.
 */

class GameManager {
  constructor() {
    this.socket = null;
    this.user = null;
    this.gameId = null;
    this.gameState = null;
    this.gameRenderer = null;
    this.isSpectator = false;
    this.init();
  }

  async init() {
    // Get game ID from URL
    const pathParts = window.location.pathname.split('/');
    this.gameId = pathParts[pathParts.length - 1];
    
    // Check if spectator mode
    const urlParams = new URLSearchParams(window.location.search);
    this.isSpectator = urlParams.get('spectate') === 'true';

    await this.loadUser();
    this.setupSocket();
    this.setupEventListeners();
  }

  async loadUser() {
    try {
      const response = await fetch('/api/user');
      if (response.ok) {
        this.user = await response.json();
        this.updateUserDisplay();
      } else {
        // Use guest mode
        this.user = {
          id: 'guest-' + Math.random().toString(36).substr(2, 9),
          username: 'Guest',
          discriminator: '0000',
          avatar: null
        };
        this.updateUserDisplay();
      }
    } catch (error) {
      console.error('Failed to load user:', error);
      this.user = {
        id: 'guest-' + Math.random().toString(36).substr(2, 9),
        username: 'Guest',
        discriminator: '0000',
        avatar: null
      };
      this.updateUserDisplay();
    }
  }

  setupSocket() {
    // Check if socket.io is available
    if (typeof io === 'undefined') {
      console.log('Socket.io not available, running in demo mode');
      this.loadDemoGame();
      return;
    }

    this.socket = io();

    this.socket.on('connect', () => {
      console.log('Connected to server');
      if (this.isSpectator) {
        this.socket.emit('spectate-game', this.gameId);
      } else {
        this.socket.emit('join-game', this.gameId);
      }
    });

    this.socket.on('game-update', (gameState) => {
      this.gameState = gameState;
      this.updateGameDisplay();
    });

    this.socket.on('spectator-mode', (enabled) => {
      if (enabled) {
        this.showSpectatorBadge();
      }
    });

    this.socket.on('chat-message', (message) => {
      this.addChatMessage(message);
    });

    this.socket.on('error', (error) => {
      alert(`Error: ${error}`);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });
  }

  loadDemoGame() {
    // Load a demo game state for demonstration
    this.gameState = {
      type: 'degens-against-decency',
      status: 'waiting',
      currentRound: 1,
      players: [
        { id: this.user.id, username: this.user.username },
        { id: 'bot-1', username: 'Bot Player 1' },
        { id: 'bot-2', username: 'Bot Player 2' }
      ],
      scores: {},
      currentQuestion: {
        text: 'What is the secret to a happy life? _______'
      },
      cardCzar: { id: 'bot-1', username: 'Bot Player 1' },
      currentPlayer: null,
      playerHands: {},
      submissions: [],
      creator: { id: this.user.id }
    };
    this.gameState.scores[this.user.id] = 0;
    this.gameState.scores['bot-1'] = 2;
    this.gameState.scores['bot-2'] = 1;
    
    // Demo hand for the player
    this.gameState.playerHands[this.user.id] = [
      { id: 'card-1', text: 'Unlimited pizza' },
      { id: 'card-2', text: 'A good night\'s sleep' },
      { id: 'card-3', text: 'More money than sense' },
      { id: 'card-4', text: 'A loyal dog' },
      { id: 'card-5', text: 'Avoiding responsibilities' }
    ];

    this.updateGameDisplay();
  }

  showSpectatorBadge() {
    const gameInfo = document.querySelector('.game-info');
    if (gameInfo && !document.querySelector('.spectator-mode-badge')) {
      const badge = document.createElement('div');
      badge.className = 'spectator-mode-badge';
      badge.textContent = 'Spectator Mode';
      gameInfo.appendChild(badge);
    }
    
    // Disable game actions for spectators
    const gameActions = document.getElementById('game-actions');
    if (gameActions) {
      const note = document.createElement('p');
      note.style.color = 'var(--brand-teal)';
      note.style.textAlign = 'center';
      note.style.marginTop = '10px';
      note.textContent = '👁️ You are watching this game as a spectator';
      gameActions.appendChild(note);
    }
  }

  setupEventListeners() {
    // Leave game button
    const leaveBtn = document.getElementById('leave-game');
    if (leaveBtn) {
      leaveBtn.addEventListener('click', () => {
        if (this.socket) {
          this.socket.emit('leave-game');
        }
        window.location.href = '/arena.html';
      });
    }

    // Chat functionality
    const chatInput = document.getElementById('chat-input');
    const sendChat = document.getElementById('send-chat');

    const sendMessage = () => {
      const message = chatInput.value.trim();
      if (message) {
        if (this.socket) {
          this.socket.emit('chat-message', {
            gameId: this.gameId,
            message: message,
            sender: this.user.username
          });
        } else {
          // Demo mode - just add the message locally
          this.addChatMessage({
            sender: this.user.username,
            text: message
          });
        }
        chatInput.value = '';
      }
    };

    if (sendChat) {
      sendChat.addEventListener('click', sendMessage);
    }
    if (chatInput) {
      chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          sendMessage();
        }
      });
    }

    // Modal close
    const modalClose = document.querySelector('.modal-close');
    const modal = document.getElementById('game-modal');
    
    if (modalClose && modal) {
      modalClose.addEventListener('click', () => {
        modal.classList.add('hidden');
      });

      window.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
        }
      });
    }
  }

  updateUserDisplay() {
    const playerName = document.getElementById('player-name');
    const playerAvatar = document.getElementById('player-avatar');

    if (playerName && this.user) {
      playerName.textContent = `${this.user.username}#${this.user.discriminator}`;
    }

    if (playerAvatar && this.user) {
      if (this.user.avatar) {
        playerAvatar.src = `https://cdn.discordapp.com/avatars/${this.user.id}/${this.user.avatar}.png?size=128`;
      } else {
        const defaultAvatarIndex = parseInt(this.user.discriminator) % 5;
        playerAvatar.src = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;
      }
    }
  }

  updateGameDisplay() {
    if (!this.gameState) return;

    // Update game title and meta info
    const gameTitle = document.getElementById('game-title');
    const gameRound = document.getElementById('game-round');
    const gameStatus = document.getElementById('game-status');

    if (gameTitle) gameTitle.textContent = this.formatGameType(this.gameState.type);
    if (gameRound) gameRound.textContent = `Round ${this.gameState.currentRound || 1}`;
    if (gameStatus) gameStatus.textContent = this.formatStatus(this.gameState.status);

    // Update players list
    this.updatePlayersList();

    // Update game-specific content based on game type
    this.initializeGameRenderer();
    if (this.gameRenderer) {
      this.gameRenderer.render(this.gameState);
    }
  }

  initializeGameRenderer() {
    if (this.gameRenderer && this.gameRenderer.gameType === this.gameState.type) {
      return; // Already have the correct renderer
    }

    switch (this.gameState.type) {
      case 'degens-against-decency':
        this.gameRenderer = new DegensGameRenderer(this);
        break;
      default:
        console.error('Unknown game type:', this.gameState.type);
    }
  }

  updatePlayersList() {
    const playersList = document.getElementById('players-list');
    
    if (!playersList) return;

    if (!this.gameState.players) {
      playersList.innerHTML = '<div class="loading">Loading players...</div>';
      return;
    }

    playersList.innerHTML = this.gameState.players.map(player => {
      const score = this.gameState.scores[player.id] || 0;
      const isCurrentPlayer = this.gameState.currentPlayer?.id === player.id;
      
      return `
        <div class="player-item ${isCurrentPlayer ? 'current-player' : ''}">
          <img src="https://cdn.discordapp.com/embed/avatars/${parseInt(player.id.replace(/\D/g, '') || '0') % 5}.png" alt="${player.username}" />
          <div class="player-name">${player.username}</div>
          <div class="player-score">${score}</div>
        </div>
      `;
    }).join('');
  }

  formatGameType(type) {
    const types = {
      'degens-against-decency': 'Degens Against Decency',
      '2-truths-and-a-lie': '2 Truths and a Lie',
      'poker': 'Poker (5-Card Stud)'
    };
    return types[type] || type;
  }

  formatStatus(status) {
    const statuses = {
      'waiting': 'Waiting for Players',
      'playing': 'In Progress',
      'finished': 'Game Finished'
    };
    return statuses[status] || status;
  }

  addChatMessage(message) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;

    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    messageElement.innerHTML = `
      <div class="sender">${message.sender}</div>
      <div class="text">${message.text}</div>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  sendGameAction(action) {
    if (this.socket) {
      this.socket.emit('game-action', action);
    } else {
      // Demo mode - handle locally
      console.log('Game action (demo mode):', action);
      if (action.type === 'submit-card') {
        alert('Card submitted! (Demo mode - no server connection)');
      }
    }
  }
}

// Base game renderer
class BaseGameRenderer {
  constructor(gameManager, gameType) {
    this.gameManager = gameManager;
    this.gameType = gameType;
  }

  render(gameState) {
    // Override in subclasses
  }

  clearGameContent() {
    const gameContent = document.getElementById('game-content');
    const gameActions = document.getElementById('game-actions');
    if (gameContent) gameContent.innerHTML = '';
    if (gameActions) gameActions.innerHTML = '';
  }
}

// Degens Against Decency renderer
class DegensGameRenderer extends BaseGameRenderer {
  constructor(gameManager) {
    super(gameManager, 'degens-against-decency');
  }

  render(gameState) {
    this.clearGameContent();
    
    const gameContent = document.getElementById('game-content');
    const gameActions = document.getElementById('game-actions');

    if (!gameContent || !gameActions) return;

    if (gameState.status === 'waiting') {
      gameContent.innerHTML = `
        <div class="waiting-area">
          <h2>Waiting for Players</h2>
          <p>Need at least 3 players to start</p>
          <p>Current players: ${gameState.players.length}/${gameState.maxPlayers || 6}</p>
        </div>
      `;
      
      if (gameState.creator?.id === this.gameManager.user.id && gameState.players.length >= 2) {
        gameActions.innerHTML = `
          <button class="cta-button" onclick="gameManager.sendGameAction({type: 'start-game'})">
            Start Game
          </button>
        `;
      }
      return;
    }

    // Show current question
    if (gameState.currentQuestion) {
      gameContent.innerHTML = `
        <div class="degens-question">
          ${gameState.currentQuestion.text}
        </div>
      `;
    }

    // Show game phase
    const userId = this.gameManager.user.id;
    const isCardCzar = gameState.cardCzar?.id === userId;
    
    if (isCardCzar) {
      this.renderCardCzarView(gameState);
    } else {
      this.renderPlayerView(gameState);
    }
  }

  renderCardCzarView(gameState) {
    const gameContent = document.getElementById('game-content');

    if (gameState.submissions && gameState.submissions.length > 0) {
      const submissionsHtml = gameState.submissions.map((sub, index) => `
        <div class="submission-card" onclick="gameManager.sendGameAction({type: 'judge-submission', playerId: '${sub.playerId}'})">
          ${sub.card.text}
        </div>
      `).join('');

      gameContent.innerHTML += `
        <div class="submissions-area">
          <h3 style="color: var(--brand-teal); margin-bottom: 15px;">Choose the winning answer:</h3>
          ${submissionsHtml}
        </div>
      `;
    } else {
      gameContent.innerHTML += `
        <div class="waiting-area">
          <h3>You are the Card Czar!</h3>
          <p>Waiting for other players to submit their answers...</p>
        </div>
      `;
    }
  }

  renderPlayerView(gameState) {
    const gameContent = document.getElementById('game-content');
    const userId = this.gameManager.user.id;
    
    // Check if player has submitted
    const hasSubmitted = gameState.submissions?.some(sub => sub.playerId === userId);
    
    if (hasSubmitted) {
      gameContent.innerHTML += `
        <div class="waiting-area">
          <h3>Answer Submitted!</h3>
          <p>Waiting for the Card Czar to choose the winner...</p>
        </div>
      `;
    } else if (gameState.playerHands && gameState.playerHands[userId]) {
      const hand = gameState.playerHands[userId];
      const handHtml = hand.map(card => `
        <div class="answer-card" onclick="gameManager.sendGameAction({type: 'submit-card', cardId: '${card.id}'})">
          ${card.text}
        </div>
      `).join('');

      gameContent.innerHTML += `
        <div class="player-hand-area">
          <h3>Choose your answer:</h3>
          <div class="player-hand">
            ${handHtml}
          </div>
        </div>
      `;
    }
  }
}

// Initialize game manager when page loads
document.addEventListener('DOMContentLoaded', () => {
  window.gameManager = new GameManager();
});
