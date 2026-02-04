import express, { Request, Response } from 'express';
import cors from 'cors';
import { GameSession } from './GameSession';
import { createSimplifiedGame } from './SimplifiedGame';
import { ActionEncoder } from './ActionEncoder';
import { StateEncoder } from './StateEncoder';
import * as fs from 'fs';
import * as path from 'path';

const PORT = 3001;

const app = express();
app.use(cors());
app.use(express.json());

// Load token effects configuration
const tokenEffectsPath = path.join(__dirname, '..', 'data', 'celestial_body_token_types.json');
const tokenEffectsConfig = JSON.parse(fs.readFileSync(tokenEffectsPath, 'utf-8'));

// Global game session and encoders (single session for POC)
let gameSession: GameSession | null = null;
let actionEncoder: ActionEncoder | null = null;
let stateEncoder: StateEncoder | null = null;

/**
 * POST /reset
 * Creates new game session and returns initial state
 *
 * Response:
 * {
 *   state: number[],       // Encoded state vector (128 features) - placeholder for Phase 3
 *   validActions: number[], // Valid action IDs - placeholder for Phase 2
 *   done: false
 * }
 */
app.post('/reset', async (req: Request, res: Response) => {
  try {
    // Create game if not exists
    if (!gameSession) {
      const game = await createSimplifiedGame();
      gameSession = new GameSession(game);
    }

    // Reset to initial state
    gameSession.reset();

    // Get initial state
    const state = gameSession.getState();
    if (!state) {
      res.status(500).json({ error: 'Failed to initialize game' });
      return;
    }

    // Initialize encoders
    actionEncoder = new ActionEncoder(state.G.hexBoard);
    stateEncoder = new StateEncoder(tokenEffectsConfig);

    // Get valid actions and encoded state
    const validActions = actionEncoder.getValidActions(state);
    const encodedState = stateEncoder.encodeState(state);

    // Return initial state
    res.json({
      state: encodedState,
      validActions,
      done: false,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /step
 * Executes an action and returns new state + reward + done
 *
 * Body:
 * {
 *   action: number  // Action ID (decoded to move + args in Phase 2)
 * }
 *
 * Response:
 * {
 *   state: number[],        // Encoded state vector
 *   reward: number,         // Reward for this transition
 *   done: boolean,          // Whether game is over
 *   validActions: number[], // Valid action IDs for new state
 *   info: object           // Debug info (turn, score, etc.)
 * }
 */
app.post('/step', async (req: Request, res: Response) => {
  try {
    if (!gameSession) {
      res.status(400).json({ error: 'Game not initialized. Call /reset first.' });
      return;
    }

    if (!actionEncoder) {
      res.status(400).json({ error: 'Action encoder not initialized. Call /reset first.' });
      return;
    }

    if (!stateEncoder) {
      res.status(400).json({ error: 'State encoder not initialized. Call /reset first.' });
      return;
    }

    const { action } = req.body;
    if (typeof action !== 'number') {
      res.status(400).json({ error: 'action must be a number' });
      return;
    }

    // Get state before action
    const stateBefore = gameSession.getState();
    if (!stateBefore) {
      res.status(500).json({ error: 'Failed to get game state' });
      return;
    }

    const prevReward = gameSession.getReward();

    // Decode action ID to move + args
    let decoded;
    try {
      decoded = actionEncoder.decodeAction(action, stateBefore);
    } catch (error: any) {
      res.status(400).json({ error: `Invalid action: ${error.message}` });
      return;
    }

    // Execute move
    const success = gameSession.step(decoded.move, decoded.args);

    if (!success) {
      res.status(400).json({ error: 'Invalid move (game rejected it)' });
      return;
    }

    // Get state after action
    const stateAfter = gameSession.getState();
    const done = gameSession.isDone();
    const newReward = gameSession.getReward();
    const reward = newReward - prevReward; // Reward is change in score
    const info = gameSession.getInfo();

    // Check for death penalty
    let finalReward = reward;
    if (done && info.gameover?.playersLose) {
      finalReward -= 50; // Death penalty
    }

    // Get valid actions and encoded state for new state
    const validActions = done ? [] : actionEncoder.getValidActions(stateAfter);
    const encodedState = stateEncoder.encodeState(stateAfter);

    res.json({
      state: encodedState,
      reward: finalReward,
      done,
      validActions,
      info,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /state
 * Returns current game state (for debugging)
 *
 * Response:
 * {
 *   state: number[],        // Encoded state vector
 *   validActions: number[], // Valid action IDs
 *   done: boolean,
 *   info: object           // Raw game state for debugging
 * }
 */
app.get('/state', (req: Request, res: Response) => {
  try {
    if (!gameSession) {
      res.status(400).json({ error: 'Game not initialized. Call /reset first.' });
      return;
    }

    if (!actionEncoder) {
      res.status(400).json({ error: 'Action encoder not initialized. Call /reset first.' });
      return;
    }

    if (!stateEncoder) {
      res.status(400).json({ error: 'State encoder not initialized. Call /reset first.' });
      return;
    }

    const done = gameSession.isDone();
    const info = gameSession.getInfo();
    const rawState = gameSession.getState();

    // Get valid actions and encoded state
    const validActions = done ? [] : actionEncoder.getValidActions(rawState);
    const encodedState = stateEncoder.encodeState(rawState);

    res.json({
      state: encodedState,
      validActions,
      done,
      info,
      rawState, // Include raw boardgame.io state for debugging
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
  console.log(`RL server listening on port ${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  POST http://localhost:${PORT}/reset`);
  console.log(`  POST http://localhost:${PORT}/step`);
  console.log(`  GET  http://localhost:${PORT}/state`);
  console.log(`  GET  http://localhost:${PORT}/health`);
});
