import express, { Request, Response } from 'express';
import cors from 'cors';
import { GameSession } from './GameSession';
import { createSimplifiedGame } from './SimplifiedGame';

const PORT = 3001;

const app = express();
app.use(cors());
app.use(express.json());

// Global game session (single session for POC)
let gameSession: GameSession | null = null;

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

    // Return initial state (placeholder encodings for now)
    res.json({
      state: Array(128).fill(0), // Placeholder: Phase 3 will implement state encoding
      validActions: [197],        // Placeholder: Phase 2 will implement action enumeration (197 = pass)
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

    const { action } = req.body;
    if (typeof action !== 'number') {
      res.status(400).json({ error: 'action must be a number' });
      return;
    }

    // Get state before action
    const prevReward = gameSession.getReward();

    // Execute action (placeholder: always pass for now)
    // Phase 2 will decode action ID to actual move + args
    let success = false;
    if (action === 197) {
      // Action 197 = pass
      success = gameSession.step('pass', []);
    } else {
      // Invalid action for now (Phase 2 will implement full decoding)
      res.status(400).json({
        error: `Invalid action: ${action}. Only action 197 (pass) is supported in Phase 1.`
      });
      return;
    }

    if (!success) {
      res.status(400).json({ error: 'Invalid move' });
      return;
    }

    // Get state after action
    const done = gameSession.isDone();
    const newReward = gameSession.getReward();
    const reward = newReward - prevReward; // Reward is change in score
    const info = gameSession.getInfo();

    // Check for death penalty
    let finalReward = reward;
    if (done && info.gameover?.playersLose) {
      finalReward -= 50; // Death penalty
    }

    res.json({
      state: Array(128).fill(0),  // Placeholder: Phase 3 will implement state encoding
      reward: finalReward,
      done,
      validActions: done ? [] : [197], // Placeholder: Phase 2 will implement action enumeration
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

    const done = gameSession.isDone();
    const info = gameSession.getInfo();
    const rawState = gameSession.getState();

    res.json({
      state: Array(128).fill(0),  // Placeholder: Phase 3 will implement state encoding
      validActions: done ? [] : [197], // Placeholder: Phase 2 will implement action enumeration
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
