/**
 * Arena management and game lobby
 * 
 * Copyright (c) 2024 Degens Against Decency
 * Licensed under the MIT License
 * See LICENSE file in the project root for full license information.
 */

class ArenaManager {
  constructor() {
    this.socket = null;
    this.user = null;
    this.games = [];
    this.autoRefreshInterval = null;
    this.timerUpdateInterval = null;
    this.lastUpdateTime = Date.now();
    this.init();
  }

  async init() {
    await this.loadUser();
    this.setupSocket();
    this.setupEventListeners();
    this.checkOnboarding();
    this.startAutoRefresh();
  }

  async loadUser() {
    try {
      const response = await fetch('/api/user');
      if (response.ok) {
        this.user = await response.json();
        this.updateUserDisplay();
      } else {
        // Use guest mode if not authenticated
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
      // Use guest mode on error
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
      this.renderDemoGames();
      return;
    }

    this.socket = io();

    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.socket.emit('join-lobby', this.user.id);
    });

    this.socket.on('lobby-games', (games) => {
      this.games = games;
      this.lastUpdateTime = Date.now();
      this.renderGames();
      this.showRefreshIndicator();
    });

    this.socket.on('game-created', (game) => {
      // Redirect to the new game
      window.location.href = `/game/${game.id}`;
    });

    this.socket.on('error', (error) => {
      alert(`Error: ${error}`);
    });
  }

  setupEventListeners() {
    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try {
          await fetch('/auth/logout');
          window.location.href = '/';
        } catch (error) {
          console.error('Logout failed:', error);
        }
      });
    }

    // Create game form
    const createGameForm = document.getElementById('create-game-form');
    if (createGameForm) {
      createGameForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.createGame();
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
    const userName = document.getElementById('user-name');
    const userAvatar = document.getElementById('user-avatar');

    if (userName && this.user) {
      userName.textContent = `${this.user.username}#${this.user.discriminator}`;
    }

    if (userAvatar && this.user) {
      if (this.user.avatar) {
        userAvatar.src = `https://cdn.discordapp.com/avatars/${this.user.id}/${this.user.avatar}.png?size=128`;
      } else {
        const defaultAvatarIndex = parseInt(this.user.discriminator) % 5;
        userAvatar.src = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;
      }
    }
  }

  renderDemoGames() {
    // Render demo games for demonstration purposes
    this.games = [
      {
        id: 'demo-1',
        type: 'degens-against-decency',
        currentPlayers: 4,
        maxPlayers: 6,
        status: 'waiting',
        creator: 'DemoHost',
        startTime: null
      },
      {
        id: 'demo-2',
        type: 'degens-against-decency',
        currentPlayers: 6,
        maxPlayers: 6,
        status: 'playing',
        creator: 'GameMaster',
        startTime: new Date(Date.now() - 300000).toISOString()
      }
    ];
    this.renderGames();
  }

  renderGames() {
    const gamesList = document.getElementById('games-list');
    
    if (!gamesList) return;

    if (this.games.length === 0) {
      gamesList.innerHTML = '<div class="loading">No active games. Create one to get started!</div>';
      this.updateLobbyStats(0, 0);
      return;
    }

    // Calculate statistics
    let totalPlayers = 0;
    this.games.forEach(game => {
      totalPlayers += game.currentPlayers;
    });

    this.updateLobbyStats(this.games.length, totalPlayers);

    gamesList.innerHTML = this.games.map(game => {
      const isLive = game.status === 'playing';
      const isFull = game.currentPlayers >= game.maxPlayers;
      const canJoin = !isFull && game.status === 'waiting';
      const canSpectate = isLive;
      
      return `
        <div class="game-item ${game.status} ${isFull ? 'full' : ''} ${isLive ? 'live' : ''}" 
             data-game-id="${game.id}">
          ${isLive ? '<div class="live-badge">🔴 LIVE</div>' : ''}
          <div class="game-type">${this.formatGameType(game.type)}</div>
          <div class="game-players">
            <span class="player-status-badge ${isLive ? 'in-game' : 'active'}">
              ${game.currentPlayers}/${game.maxPlayers} players
            </span>
            ${game.startTime ? `<span class="game-timer">${this.getGameDuration(game.startTime)}</span>` : ''}
          </div>
          <div class="game-meta">
            <span>Created by ${game.creator}</span>
            <span class="game-status ${game.status}">${this.formatStatus(game.status)}</span>
          </div>
          <div class="game-actions-row" onclick="event.stopPropagation()">
            ${canJoin ? `<button class="game-action-btn" onclick="arenaManager.joinGame('${game.id}')">Join Game</button>` : ''}
            ${canSpectate ? `<button class="game-action-btn spectate" onclick="arenaManager.spectateGame('${game.id}')">Watch Live</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  updateLobbyStats(activeGames, playersOnline) {
    const activeGamesCount = document.getElementById('active-games-count');
    const playersOnlineCount = document.getElementById('players-online-count');
    
    if (activeGamesCount) {
      activeGamesCount.textContent = activeGames;
    }
    
    if (playersOnlineCount) {
      playersOnlineCount.textContent = playersOnline;
    }
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
      'finished': 'Finished'
    };
    return statuses[status] || status;
  }

  async createGame() {
    const form = document.getElementById('create-game-form');
    const formData = new FormData(form);
    
    const gameData = {
      gameType: formData.get('gameType'),
      maxPlayers: parseInt(formData.get('maxPlayers')),
      isPrivate: formData.get('isPrivate') === 'on'
    };

    try {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(gameData)
      });

      if (response.ok) {
        const game = await response.json();
        
        // If it's a private game, show the invite link
        if (game.isPrivate && game.inviteLink) {
          const shareInvite = confirm(`Private game created! Click OK to copy the invite link to share with friends.\n\nInvite Link: ${game.inviteLink}`);
          if (shareInvite) {
            navigator.clipboard.writeText(game.inviteLink).then(() => {
              alert('Invite link copied to clipboard!');
            }).catch(() => {
              // Fallback if clipboard API fails
              prompt('Copy this invite link:', game.inviteLink);
            });
          }
        }
        
        // Redirect to the new game
        window.location.href = `/game/${game.id}`;
      } else {
        const error = await response.text();
        alert(`Failed to create game: ${error}`);
      }
    } catch (error) {
      console.error('Failed to create game:', error);
      alert('Game creation is not available in demo mode.');
    }
  }

  joinGame(gameId) {
    const game = this.games.find(g => g.id === gameId);
    if (!game) return;

    if (game.currentPlayers >= game.maxPlayers) {
      alert('This game is full!');
      return;
    }

    // Redirect to game page
    window.location.href = `/game/${gameId}`;
  }

  spectateGame(gameId) {
    const game = this.games.find(g => g.id === gameId);
    if (!game) return;

    if (game.status !== 'playing') {
      alert('This game is not currently in progress.');
      return;
    }

    // Redirect to game page with spectator flag
    window.location.href = `/game/${gameId}?spectate=true`;
  }

  getGameDuration(startTime) {
    if (!startTime) return '';
    
    const now = Date.now();
    const duration = Math.floor((now - new Date(startTime).getTime()) / 1000);
    
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  startAutoRefresh() {
    // Auto-refresh game list every 5 seconds
    this.autoRefreshInterval = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('request-lobby-update');
      }
    }, 5000);
    
    // Update timers every second for smooth display
    this.timerUpdateInterval = setInterval(() => {
      this.updateTimers();
    }, 1000);
  }
  
  updateTimers() {
    // Update all visible game timers without re-rendering the entire list
    const gameItems = document.querySelectorAll('.game-item');
    gameItems.forEach(item => {
      const gameId = item.dataset.gameId;
      const game = this.games.find(g => g.id === gameId);
      
      if (game && game.startTime) {
        const timerElement = item.querySelector('.game-timer');
        if (timerElement) {
          timerElement.textContent = this.getGameDuration(game.startTime);
        }
      }
    });
  }

  showRefreshIndicator() {
    // Show a brief indicator that the list was updated
    let indicator = document.getElementById('auto-refresh-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'auto-refresh-indicator';
      indicator.className = 'auto-refresh-indicator';
      indicator.innerHTML = '<div class="spinner"></div><span>Updated</span>';
      document.body.appendChild(indicator);
    }
    
    indicator.classList.add('show');
    setTimeout(() => {
      indicator.classList.remove('show');
    }, 2000);
  }

  checkOnboarding() {
    // Check if user has completed onboarding
    const hasCompletedOnboarding = localStorage.getItem('onboarding_completed');
    
    if (!hasCompletedOnboarding) {
      this.showOnboarding();
    }
  }

  showOnboarding() {
    const onboardingModal = document.getElementById('onboarding-modal');
    if (onboardingModal) {
      onboardingModal.classList.remove('hidden');
      onboardingModal.classList.add('show');
    }
  }

  nextOnboardingStep() {
    const steps = document.querySelectorAll('.onboarding-step');
    let currentStep = 0;
    
    steps.forEach((step, index) => {
      if (step.classList.contains('active')) {
        currentStep = index;
        step.classList.remove('active');
      }
    });
    
    if (currentStep < steps.length - 1) {
      steps[currentStep + 1].classList.add('active');
    }
  }

  prevOnboardingStep() {
    const steps = document.querySelectorAll('.onboarding-step');
    let currentStep = 0;
    
    steps.forEach((step, index) => {
      if (step.classList.contains('active')) {
        currentStep = index;
        step.classList.remove('active');
      }
    });
    
    if (currentStep > 0) {
      steps[currentStep - 1].classList.add('active');
    }
  }

  completeOnboarding() {
    localStorage.setItem('onboarding_completed', 'true');
    const onboardingModal = document.getElementById('onboarding-modal');
    if (onboardingModal) {
      onboardingModal.classList.add('hidden');
      onboardingModal.classList.remove('show');
    }
  }
  
  cleanup() {
    // Clean up intervals when leaving the page
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
    if (this.timerUpdateInterval) {
      clearInterval(this.timerUpdateInterval);
      this.timerUpdateInterval = null;
    }
  }
}

// Initialize arena manager when page loads
document.addEventListener('DOMContentLoaded', () => {
  window.arenaManager = new ArenaManager();
  
  // Clean up intervals when navigating away
  window.addEventListener('beforeunload', () => {
    if (window.arenaManager) {
      window.arenaManager.cleanup();
    }
  });
});
