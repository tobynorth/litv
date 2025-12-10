import { MCTSBot } from 'boardgame.io/ai';
import { State } from 'boardgame.io';

export class DeterminizedMCTSBot extends MCTSBot {
  private reshuffleEveryN: number;
  private deterministicState: State | null = null;
  private lastReshuffleIteration: number = -1;

  constructor(options: any) {
    super(options);
    // Reshuffle all decks every N iterations
    this.reshuffleEveryN = options.reshuffleEveryN ?? 20;
  }

  /**
   * Override playout to use determinized state when needed
   */
  playout(node: any): any {
    // Check if we need to reshuffle
    const currentIteration = this.iterationCounter ?? 0;
    if (currentIteration % this.reshuffleEveryN === 0 &&
        currentIteration !== this.lastReshuffleIteration) {
      // Generate new determinized state for next batch of iterations
      this.deterministicState = this.determinizeState(
        node.state,
        this.generateIterationSeed(currentIteration)
      );
      this.lastReshuffleIteration = currentIteration;
    }

    // Use determinized state if available, otherwise use node's state
    const playoutNode = this.deterministicState
      ? { ...node, state: this.deterministicState }
      : node;

    return super.playout(playoutNode);
  }

  /**
   * Generate unique seed for current iteration batch
   */
  private generateIterationSeed(iteration: number): number {
    const baseSeed = Date.now();
    return baseSeed + Math.floor(iteration / this.reshuffleEveryN) * 10000;
  }

  /**
   * Shuffle array using bot's built-in random function
   */
  private shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];

    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }

  /**
   * Determinize hidden information in game state
   */
  private determinizeState(state: State, seed: number): State {
    // Deep clone state to avoid mutations
    const newState = structuredClone(state);

    // Reshuffle each zone deck using bot's random function
    // We're replacing the cards array entirely, so frozen state doesn't matter
    if (newState.G.zoneDecks) {
      newState.G.zoneDecks = newState.G.zoneDecks.map((zoneDeck: any) => {
        if (!zoneDeck || zoneDeck.isLocked) {
          return zoneDeck;
        }

        return {
          ...zoneDeck,
          cards: this.shuffle(zoneDeck.cards),
        };
      });
    }

    return newState;
  }
}
