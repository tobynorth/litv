import { Client } from 'boardgame.io/client';
import { Step } from 'boardgame.io/ai';
import { DeterminizedMCTSBot } from './ai/DeterminizedMCTSBot';
import { makeLightsInTheVoidGame } from './Game';
import { CardLoader } from './data/CardLoader';
import * as fs from 'fs';
import { Worker } from 'worker_threads';
import * as os from 'os';
import * as path from 'path';

interface CalibrationConfig {
  numPlayers: number;
  numPhases: number;
  winThreshold: number;
  numTrials?: number;
  mctsIterations?: number;
  playoutDepth?: number;
  parallelMode?: boolean;
  workerPoolSize?: number;
}

interface CalibrationResults {
  numPlayers: number;
  numPhases: number;
  winThreshold: number;
  scores: number[];
  winRate: number;
  stats: {
    min: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    max: number;
    mean: number;
    stddev: number;
  };
  thresholds: {
    easy: number;
    medium: number;
    hard: number;
    expert: number;
  };
}

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

// Helper: Calculate statistics
function calculateStats(scores: number[]) {
  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;

  const mean = sorted.reduce((sum, s) => sum + s, 0) / n;
  const variance = sorted.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / n;
  const stddev = Math.sqrt(variance);

  return {
    min: sorted[0],
    p10: sorted[Math.floor(n * 0.10)],
    p25: sorted[Math.floor(n * 0.25)],
    p50: sorted[Math.floor(n * 0.50)],
    p75: sorted[Math.floor(n * 0.75)],
    p90: sorted[Math.floor(n * 0.90)],
    max: sorted[n - 1],
    mean,
    stddev,
  };
}

async function calibrateDifficultyParallel(
  config: CalibrationConfig
): Promise<CalibrationResults> {
  const {
    numPlayers,
    numPhases,
    winThreshold,
    numTrials = 1,
    mctsIterations = 500,
    playoutDepth = 50,
    workerPoolSize = os.cpus().length,
  } = config;

  console.log(`\nCalibrating (PARALLEL) ${numPlayers}P, ${numPhases} phase(s), ${winThreshold} win threshold...`);
  console.log(`  Using ${Math.min(numTrials, workerPoolSize)} worker threads`);

  const workerPath = path.join(__dirname, 'calibrate-worker.ts');
  console.log(`  Worker path: ${workerPath}`);
  const workers: Worker[] = [];
  const taskQueue = Array.from({ length: numTrials }, (_, i) => i + 1);
  const results: WorkerResult[] = [];
  let completedCount = 0;

  try {
    // Spawn workers
    const numWorkers = Math.min(numTrials, workerPoolSize);
    for (let i = 0; i < numWorkers; i++) {
      const worker = new Worker(workerPath, {
        execArgv: ['--require', 'tsx/cjs'],
        stdout: true,
        stderr: true,
      });

      // Pipe worker output to main process
      worker.stdout?.on('data', (data) => {
        process.stdout.write(data);
      });
      worker.stderr?.on('data', (data) => {
        process.stderr.write(data);
      });

      workers.push(worker);

      worker.on('message', (message: any) => {
        // Handle progress messages
        if (message.type === 'progress') {
          console.log(`  [Trial ${message.trialNumber}] ${message.message}`);
          return;
        }

        // Handle result messages
        const result = message as WorkerResult;
        results.push(result);
        completedCount++;

        if (result.error) {
          console.log(`  Trial ${result.trialNumber}: ERROR - ${result.error}`);
        } else {
          console.log(`  Trial ${result.trialNumber}: score ${result.score} (${completedCount}/${numTrials})`);
        }

        // Assign next trial if queue not empty
        const nextTrial = taskQueue.shift();
        if (nextTrial !== undefined) {
          const task: WorkerTask = {
            trialNumber: nextTrial,
            numPlayers,
            numPhases,
            winThreshold,
            mctsIterations,
            playoutDepth,
            reshuffleEveryN: 20,
          };
          worker.postMessage(task);
        }
      });

      worker.on('error', (error) => {
        console.error(`  Worker error: ${error.message}`);
      });

      // Start first trial for this worker
      const firstTrial = taskQueue.shift();
      if (firstTrial !== undefined) {
        const task: WorkerTask = {
          trialNumber: firstTrial,
          numPlayers,
          numPhases,
          winThreshold,
          mctsIterations,
          playoutDepth,
          reshuffleEveryN: 20,
        };
        console.log(`  Assigning trial ${firstTrial} to worker ${i + 1}`);
        worker.postMessage(task);
      }
    }

    // Wait for all trials to complete
    await new Promise<void>((resolve) => {
      const checkComplete = setInterval(() => {
        if (completedCount >= numTrials) {
          clearInterval(checkComplete);
          resolve();
        }
      }, 100);
    });

    // Filter out failed trials
    const successfulResults = results.filter(r => !r.error);
    const failedResults = results.filter(r => r.error);

    if (failedResults.length > 0) {
      console.log(`\n⚠️  ${failedResults.length} trial(s) failed`);
    }

    // Extract scores from successful trials
    const scores = successfulResults.map(r => r.score);

    if (scores.length === 0) {
      throw new Error('All trials failed - cannot calculate statistics');
    }

    // Calculate statistics
    const stats = calculateStats(scores);
    const wins = scores.filter(score => score >= winThreshold).length;
    const winRate = (wins / scores.length) * 100;

    return {
      numPlayers,
      numPhases,
      winThreshold,
      scores,
      winRate,
      stats,
      thresholds: {
        easy: stats.p25,
        medium: stats.p50,
        hard: stats.p75,
        expert: stats.p90,
      },
    };
  } finally {
    // Cleanup: terminate all workers
    await Promise.all(workers.map(w => w.terminate()));
  }
}

async function calibrateDifficulty(
  config: CalibrationConfig
): Promise<CalibrationResults> {
  // Route to parallel implementation if enabled
  if (config.parallelMode) {
    return calibrateDifficultyParallel(config);
  }

  const {
    numPlayers,
    numPhases,
    winThreshold,
    numTrials = 1,
    mctsIterations = 500,
    playoutDepth = 50,
  } = config;

  console.log(`\nCalibrating ${numPlayers}P, ${numPhases} phase(s), ${winThreshold} win threshold...`);

  // Load initial card data
  const [baseStarSystemCards, roleCards, itineraryCards, tokenEffects, researchTopics] =
    await Promise.all([
      CardLoader.loadStarSystemCards(),
      CardLoader.loadRoleCards(numPlayers),
      CardLoader.loadItineraryCards(numPlayers),
      CardLoader.loadTokenEffects(),
      CardLoader.loadResearchTopics(),
    ]);

  const scores: number[] = [];

  for (let trial = 1; trial <= numTrials; trial++) {
    // Create fresh copy of decks for each trial (game setup mutates them)
    const starSystemCards = JSON.parse(JSON.stringify(baseStarSystemCards));

    // Create game instance
    const game = makeLightsInTheVoidGame(
      starSystemCards,
      roleCards,
      itineraryCards,
      tokenEffects,
      researchTopics,
      numPlayers,
      numPhases,
      winThreshold
    );

    // Create determinized MCTS bot
    const bot = new DeterminizedMCTSBot({
      game,
      enumerate: game.ai!.enumerate,
      seed: trial,
      iterations: mctsIterations,
      playoutDepth,
      reshuffleEveryN: 20,  // Reshuffle every 20 iterations for 10 different deck views
    });

    // Create local client for state management
    const client = Client({
      game,
      numPlayers,
      debug: false,
    });

    client.start();

    // Play full game with bot using boardgame.io's Step function
    while (true) {
      const state = client.getState();

      if (state === null) break;
      if (state.ctx.gameover !== undefined) break;

      const action = await Step(client, bot);
      if (!action) break;
      console.log(`    Turn ${state.ctx.turn}: Player ${action.payload.playerID} took action ${action.payload.type} ${JSON.stringify(action.payload.args)}`);
    }

    // Extract final score
    const finalState = client.getState();
    const finalScore = finalState?.ctx.gameover?.finalScore || 0;

    scores.push(finalScore);

    console.log(`  Trial ${trial}: score ${finalScore}`);

    client.stop();
  }

  // Calculate statistics
  const stats = calculateStats(scores);

  // Calculate win rate (percentage of trials that met or exceeded win threshold)
  const wins = scores.filter(score => score >= winThreshold).length;
  const winRate = (wins / numTrials) * 100;

  return {
    numPlayers,
    numPhases,
    winThreshold,
    scores,
    winRate,
    stats,
    thresholds: {
      easy: stats.p25,
      medium: stats.p50,
      hard: stats.p75,
      expert: stats.p90,
    },
  };
}

export async function runFullCalibration() {
  const configs: CalibrationConfig[] = [
    { numPlayers: 2, numPhases: 1, winThreshold: 10 },
    // { numPlayers: 2, numPhases: 1, winThreshold: 40 },
    // { numPlayers: 2, numPhases: 1, winThreshold: 60 },
    // { numPlayers: 2, numPhases: 2, winThreshold: 80 },
    // { numPlayers: 2, numPhases: 3, winThreshold: 120 },
    // { numPlayers: 3, numPhases: 1, winThreshold: 60 },
    // { numPlayers: 3, numPhases: 2, winThreshold: 120 },
    // { numPlayers: 4, numPhases: 1, winThreshold: 80 },
  ];

  const allResults: Record<string, CalibrationResults> = {};

  for (const config of configs) {
    const key = `${config.numPlayers}P_${config.numPhases}Ph`;
    console.log(`\n=== Calibrating ${key} ===`);

    allResults[key] = await calibrateDifficulty(config);

    const result = allResults[key];
    console.log(`\nResults for ${key}:`);
    console.log(`  Win rate: ${result.winRate.toFixed(1)}% (threshold: ${result.winThreshold})`);
    console.log(`  Mean score: ${result.stats.mean.toFixed(1)}`);
    console.log(`  Std dev: ${result.stats.stddev.toFixed(1)}`);
    console.log(`\nSuggested thresholds:`);
    console.log(`  Easy:   ${result.thresholds.easy}`);
    console.log(`  Medium: ${result.thresholds.medium}`);
    console.log(`  Hard:   ${result.thresholds.hard}`);
    console.log(`  Expert: ${result.thresholds.expert}`);
  }

  // Save results
  fs.writeFileSync(
    'difficulty_calibration.json',
    JSON.stringify(allResults, null, 2)
  );

  console.log('\n✅ Results saved to difficulty_calibration.json');

  return allResults;
}

// Run calibration if this file is executed directly
if (require.main === module) {
  runFullCalibration().catch(console.error);
}
