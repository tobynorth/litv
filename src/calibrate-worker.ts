import { parentPort } from 'worker_threads';
import { Client } from 'boardgame.io/client';
import { Step } from 'boardgame.io/ai';
import { DeterminizedMCTSBot } from './ai/DeterminizedMCTSBot';
import { makeLightsInTheVoidGame } from './Game';
import { CardLoader } from './data/CardLoader';

interface WorkerTask {
  trialNumber: number;
  numPlayers: number;
  numPhases: number;
  winThreshold: number;
  mctsIterations: number;
  playoutDepth: number;
  reshuffleEveryN: number;
}

interface WorkerResult {
  trialNumber: number;
  score: number;
  error?: string;
}

type WorkerMessage = WorkerResult | { type: 'progress'; trialNumber: number; message: string };

async function runTrial(task: WorkerTask): Promise<WorkerResult> {
  try {
    parentPort?.postMessage({ type: 'progress', trialNumber: task.trialNumber, message: 'Loading cards...' });

    // Load card data
    const [baseStarSystemCards, roleCards, itineraryCards, tokenEffects, researchTopics] =
      await Promise.all([
        CardLoader.loadStarSystemCards(),
        CardLoader.loadRoleCards(task.numPlayers),
        CardLoader.loadItineraryCards(task.numPlayers),
        CardLoader.loadTokenEffects(),
        CardLoader.loadResearchTopics(),
      ]);

    // Deep clone star system cards (game setup mutates them)
    const starSystemCards = JSON.parse(JSON.stringify(baseStarSystemCards));

    parentPort?.postMessage({ type: 'progress', trialNumber: task.trialNumber, message: 'Creating game...' });

    // Create game instance
    const game = makeLightsInTheVoidGame(
      starSystemCards,
      roleCards,
      itineraryCards,
      tokenEffects,
      researchTopics,
      task.numPlayers,
      task.numPhases,
      task.winThreshold
    );

    // Create bot
    const bot = new DeterminizedMCTSBot({
      game,
      enumerate: game.ai!.enumerate,
      iterations: task.mctsIterations,
      playoutDepth: task.playoutDepth,
      reshuffleEveryN: task.reshuffleEveryN,
    });

    // Create client
    const client = Client({
      game,
      numPlayers: task.numPlayers,
      debug: false,
    });

    client.start();

    parentPort?.postMessage({ type: 'progress', trialNumber: task.trialNumber, message: 'Running simulation...' });

    // Run game simulation
    let turnCount = 0;
    while (true) {
      const state = client.getState();
      if (state === null) break;
      if (state.ctx.gameover !== undefined) break;

      const action = await Step(client, bot);
      parentPort?.postMessage({ type: 'progress', trialNumber: task.trialNumber, message: `    Turn ${state.ctx.turn}: Player ${action.payload.playerID} took action ${action.payload.type} ${JSON.stringify(action.payload.args)}` });

      if (!action) break;

      turnCount++;
      // if (turnCount % 10 === 0) {
      //   parentPort?.postMessage({ type: 'progress', trialNumber: task.trialNumber, message: `Turn ${turnCount}` });
      // }
    }

    parentPort?.postMessage({ type: 'progress', trialNumber: task.trialNumber, message: 'Game complete!' });

    // Extract final score
    const finalState = client.getState();
    const finalScore = finalState?.ctx.gameover?.finalScore || 0;

    client.stop();

    return {
      trialNumber: task.trialNumber,
      score: finalScore,
    };
  } catch (error) {
    return {
      trialNumber: task.trialNumber,
      score: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Listen for messages from main thread
parentPort?.on('message', async (task: WorkerTask) => {
  try {
    const result = await runTrial(task);
    parentPort?.postMessage(result);
  } catch (error) {
    parentPort?.postMessage({
      trialNumber: task.trialNumber,
      score: 0,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
