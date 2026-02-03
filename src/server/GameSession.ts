import { Client } from 'boardgame.io/client';
import { Game } from 'boardgame.io';

/**
 * Wraps a boardgame.io Client for a single game session.
 * Provides simple interface for RL environment:
 * - reset(): Start new game
 * - step(move, args): Execute action
 * - getState(): Get current state
 * - isDone(): Check if game is over
 */
export class GameSession {
  private client: ReturnType<typeof Client> | null = null;
  private game: Game;

  constructor(game: Game) {
    this.game = game;
  }

  /**
   * Reset the game to initial state
   */
  reset(): void {
    // Create new client
    this.client = Client({
      game: this.game,
      numPlayers: 1,
      debug: false,
    });

    this.client.start();
  }

  /**
   * Execute a game move
   * @param moveName - Name of the move (e.g., 'moveShip', 'drawCard')
   * @param args - Arguments for the move
   * @returns true if move was valid and executed, false if invalid
   */
  step(moveName: string, args: any[]): boolean {
    if (!this.client) {
      throw new Error('Game not initialized. Call reset() first.');
    }

    const state = this.client.getState();
    if (!state || state.ctx.gameover !== undefined) {
      return false;
    }

    // Execute move
    const moveFunc = (this.client as any).moves[moveName];
    if (!moveFunc) {
      return false;
    }

    try {
      moveFunc(...args);
      return true;
    } catch (e) {
      // Invalid move
      return false;
    }
  }

  /**
   * Get current game state
   */
  getState(): any {
    if (!this.client) {
      throw new Error('Game not initialized. Call reset() first.');
    }

    return this.client.getState();
  }

  /**
   * Check if game is over
   */
  isDone(): boolean {
    if (!this.client) {
      return true;
    }

    const state = this.client.getState();
    return !state || state.ctx.gameover !== undefined;
  }

  /**
   * Get reward for current state
   * For now, returns current score. Later phases will implement more sophisticated reward shaping.
   */
  getReward(): number {
    if (!this.client) {
      return 0;
    }

    const state = this.client.getState();
    if (!state) {
      return 0;
    }

    // Get player 0's score
    const score = state.G.playerPoints['0'] || 0;
    return score;
  }

  /**
   * Get info dict for current state
   */
  getInfo(): any {
    if (!this.client) {
      return {};
    }

    const state = this.client.getState();
    if (!state) {
      return {};
    }

    return {
      turn: state.ctx.turn,
      currentPlayer: state.ctx.currentPlayer,
      gameover: state.ctx.gameover,
      energy: state.G.shipStatus.energy,
      armor: state.G.shipStatus.armor,
      handSize: state.G.detectedStarSystems.length,
      score: state.G.playerPoints['0'] || 0,
    };
  }
}
