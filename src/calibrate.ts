import { Client } from 'boardgame.io/client';
import { Step } from 'boardgame.io/ai';
import { DeterminizedMCTSBot } from './ai/DeterminizedMCTSBot';
import { makeLightsInTheVoidGame } from './Game';
import { CardLoader } from './data/CardLoader';
import * as fs from 'fs';

interface CalibrationConfig {
  numPlayers: number;
  numPhases: number;
  winThreshold: number;
  numTrials?: number;
  mctsIterations?: number;
  playoutDepth?: number;
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

async function calibrateDifficulty(
  config: CalibrationConfig
): Promise<CalibrationResults> {
  const {
    numPlayers,
    numPhases,
    winThreshold,
    numTrials = 1,
    mctsIterations = 500,
    playoutDepth = 30,
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
