/**
 * Stable bidirectional mapping between game moves and integer action IDs.
 *
 * Action Space Layout (198 total actions):
 *
 * 0-168:    moveShip to hex index N (169 hexes sorted alphabetically)
 *           - Masked invalid if hex is >speed distance from current position
 *           - Decoder computes direction sequence to reach target hex
 *
 * 169-188:  playCard (slot 0-4) × (token 0-3) = 20 combinations
 *           - Plays card from hand slot with token option index
 *           - Masked invalid if slot empty or token option doesn't exist
 *
 * 189:      drawCard zone 1 (no discard needed)
 *           - Only valid if hand size < 5
 *
 * 190-194:  drawCard zone 1 + discard slot 0-4
 *           - Only valid if hand size = 5
 *
 * 195-196:  collectResources from token at current hex (0-1)
 *           - 0 = first token, 1 = second token (HOME only)
 *           - Masked invalid if no token at current hex
 *
 * 197:      pass
 *           - Always available
 */

// Direction type and values (must match Game.ts Direction enum)
type Direction = 'W' | 'NW' | 'NE' | 'E' | 'SE' | 'SW';

const DIRECTIONS = {
  W:  { q: -1, r: 0, s: 1 },
  NW: { q: 0, r: -1, s: 1 },
  NE: { q: 1, r: -1, s: 0 },
  E:  { q: 1, r: 0, s: -1 },
  SE: { q: 0, r: 1, s: -1 },
  SW: { q: -1, r: 1, s: 0 },
} as const;

type CubeCoords = { q: number; r: number; s: number };

interface GameState {
  G: {
    hexBoard: Record<string, HexCell>;
    reverseHexBoard: Record<string, string>;
    shipStatus: {
      location: string;
      energy: number;
      speed: number;
    };
    detectedStarSystems: StarSystemCard[];
    zoneDecks: any[];
    currentTurnMoves: number;
    currentTurnMoveShipCalled: boolean;
    playerRoleCards?: Record<string, any>;
  };
  ctx: any;
}

interface HexCell {
  cubeCoords: CubeCoords;
  celestialBodyToken: any | null;
  celestialBodyToken2?: any | null;
  numResearchTokens: number;
}

interface StarSystemCard {
  title: string;
  hexCoordinate: string;
  zoneNumber: number;
  celestialBodyIcons: CelestialBodyIcon[];
}

interface CelestialBodyIcon {
  type: string;
  size?: string;
  count: number;
}

/**
 * ActionEncoder handles bidirectional conversion between game moves and integer action IDs.
 */
export class ActionEncoder {
  private hexKeys: string[];
  private readonly ACTION_SPACE_SIZE = 198;

  // Action range boundaries
  private readonly MOVE_SHIP_START = 0;
  private readonly MOVE_SHIP_END = 168;
  private readonly PLAY_CARD_START = 169;
  private readonly PLAY_CARD_END = 188;
  private readonly DRAW_CARD_NO_DISCARD = 189;
  private readonly DRAW_CARD_DISCARD_START = 190;
  private readonly DRAW_CARD_DISCARD_END = 194;
  private readonly COLLECT_RESOURCES_START = 195;
  private readonly COLLECT_RESOURCES_END = 196;
  private readonly PASS_ACTION = 197;

  /**
   * Initialize encoder with stable hex ordering.
   * @param hexBoard - The hex board from game state (used to extract and sort hex keys)
   */
  constructor(hexBoard: Record<string, HexCell>) {
    // Extract all hex keys and sort alphabetically for stable ordering
    // Create new array to avoid modifying a frozen array
    this.hexKeys = [...Object.keys(hexBoard)].sort();

    if (this.hexKeys.length !== 169) {
      throw new Error(`Expected 169 hexes, got ${this.hexKeys.length}`);
    }
  }

  /**
   * Encode a game move into an integer action ID.
   * @param move - Move name (e.g., 'moveShip', 'playCard', 'drawCard', 'collectResources', 'pass')
   * @param args - Move arguments
   * @param state - Current game state (needed for moveShip encoding)
   * @returns Action ID (0-197)
   */
  encodeAction(move: string, args: any[], state: GameState): number {
    switch (move) {
      case 'moveShip': {
        // args is array of Direction values that lead to target hex
        // We need to compute the target hex from current position + directions
        const currentHex = state.G.shipStatus.location;
        const currentCoords = state.G.hexBoard[currentHex].cubeCoords;

        // Apply all directions to get final position
        let finalCoords = { ...currentCoords };
        for (const dir of args) {
          const offset = DIRECTIONS[dir as keyof typeof DIRECTIONS];
          finalCoords = {
            q: finalCoords.q + offset.q,
            r: finalCoords.r + offset.r,
            s: finalCoords.s + offset.s,
          };
        }

        // Look up hex key for final position
        const coordKey = `${finalCoords.q},${finalCoords.r},${finalCoords.s}`;
        const targetHex = state.G.reverseHexBoard[coordKey];

        if (!targetHex) {
          throw new Error(`Invalid moveShip: target coords ${coordKey} not found`);
        }

        // Find index of target hex in sorted keys
        const hexIndex = this.hexKeys.indexOf(targetHex);
        if (hexIndex === -1) {
          throw new Error(`Invalid moveShip: hex ${targetHex} not in hex keys`);
        }

        return this.MOVE_SHIP_START + hexIndex;
      }

      case 'playCard': {
        // args: [cardTitle: string, tokenKey: string]
        // Find card index in hand
        const cardTitle = args[0];
        const cardIndex = state.G.detectedStarSystems.findIndex(c => c.title === cardTitle);

        if (cardIndex === -1 || cardIndex >= 5) {
          throw new Error(`Invalid playCard: card "${cardTitle}" not found in hand`);
        }

        // Find token option index for this card
        const card = state.G.detectedStarSystems[cardIndex];
        const tokenKey = args[1];
        const tokenIndex = this.findTokenOptionIndex(card, tokenKey);

        if (tokenIndex === -1 || tokenIndex >= 4) {
          throw new Error(`Invalid playCard: token "${tokenKey}" not found in card icons`);
        }

        // Encode as (cardIndex * 4) + tokenIndex
        return this.PLAY_CARD_START + (cardIndex * 4) + tokenIndex;
      }

      case 'drawCard': {
        // args: [zoneNumber: number, cardToDiscard?: string]
        const zoneNumber = args[0];
        const cardToDiscard = args[1];

        if (zoneNumber !== 1) {
          throw new Error(`Invalid drawCard: only zone 1 supported in POC, got ${zoneNumber}`);
        }

        if (!cardToDiscard) {
          // No discard needed (hand size < 5)
          return this.DRAW_CARD_NO_DISCARD;
        } else {
          // Find discard card index
          const discardIndex = state.G.detectedStarSystems.findIndex(c => c.title === cardToDiscard);

          if (discardIndex === -1 || discardIndex >= 5) {
            throw new Error(`Invalid drawCard: discard card "${cardToDiscard}" not found in hand`);
          }

          return this.DRAW_CARD_DISCARD_START + discardIndex;
        }
      }

      case 'collectResources': {
        // args: [tokenKey: string]
        const tokenKey = args[0];
        const currentHex = state.G.hexBoard[state.G.shipStatus.location];

        // Determine which token slot this is (0 or 1)
        const token1Key = this.lookupKey(currentHex.celestialBodyToken);

        if (token1Key === tokenKey) {
          return this.COLLECT_RESOURCES_START; // Token slot 0
        }

        // Check second token (HOME only)
        if ('celestialBodyToken2' in currentHex) {
          const token2Key = this.lookupKey((currentHex as any).celestialBodyToken2);
          if (token2Key === tokenKey) {
            return this.COLLECT_RESOURCES_START + 1; // Token slot 1
          }
        }

        throw new Error(`Invalid collectResources: token "${tokenKey}" not at current hex`);
      }

      case 'pass': {
        return this.PASS_ACTION;
      }

      default:
        throw new Error(`Unknown move: ${move}`);
    }
  }

  /**
   * Decode an action ID into a game move and args.
   * @param actionId - Action ID (0-197)
   * @param state - Current game state (needed for moveShip pathfinding)
   * @returns Object with move name and args
   */
  decodeAction(actionId: number, state: GameState): { move: string; args: any[] } {
    if (actionId < 0 || actionId >= this.ACTION_SPACE_SIZE) {
      throw new Error(`Invalid action ID: ${actionId}`);
    }

    // moveShip (0-168)
    if (actionId <= this.MOVE_SHIP_END) {
      const hexIndex = actionId - this.MOVE_SHIP_START;
      const targetHex = this.hexKeys[hexIndex];
      const targetCoords = state.G.hexBoard[targetHex].cubeCoords;
      const currentHex = state.G.shipStatus.location;
      const currentCoords = state.G.hexBoard[currentHex].cubeCoords;

      // Compute direction sequence to reach target
      const directions = this.findPath(currentCoords, targetCoords, state.G.shipStatus.speed);

      return { move: 'moveShip', args: directions };
    }

    // playCard (169-188)
    if (actionId >= this.PLAY_CARD_START && actionId <= this.PLAY_CARD_END) {
      const offset = actionId - this.PLAY_CARD_START;
      const cardIndex = Math.floor(offset / 4);
      const tokenIndex = offset % 4;

      // Get card from hand
      const card = state.G.detectedStarSystems[cardIndex];
      if (!card) {
        throw new Error(`Invalid playCard action: no card at slot ${cardIndex}`);
      }

      // Get token key for this token option index
      const tokenKey = this.getTokenKeyByIndex(card, tokenIndex);

      return { move: 'playCard', args: [card.title, tokenKey] };
    }

    // drawCard no discard (189)
    if (actionId === this.DRAW_CARD_NO_DISCARD) {
      return { move: 'drawCard', args: [1] }; // Zone 1 only for POC
    }

    // drawCard with discard (190-194)
    if (actionId >= this.DRAW_CARD_DISCARD_START && actionId <= this.DRAW_CARD_DISCARD_END) {
      const discardIndex = actionId - this.DRAW_CARD_DISCARD_START;
      const cardToDiscard = state.G.detectedStarSystems[discardIndex];

      if (!cardToDiscard) {
        throw new Error(`Invalid drawCard action: no card at discard slot ${discardIndex}`);
      }

      return { move: 'drawCard', args: [1, cardToDiscard.title] };
    }

    // collectResources (195-196)
    if (actionId >= this.COLLECT_RESOURCES_START && actionId <= this.COLLECT_RESOURCES_END) {
      const tokenSlot = actionId - this.COLLECT_RESOURCES_START;
      const currentHex = state.G.hexBoard[state.G.shipStatus.location];

      let tokenKey: string;
      if (tokenSlot === 0) {
        tokenKey = this.lookupKey(currentHex.celestialBodyToken);
      } else {
        // Second token (HOME only)
        if ('celestialBodyToken2' in currentHex) {
          tokenKey = this.lookupKey((currentHex as any).celestialBodyToken2);
        } else {
          throw new Error(`Invalid collectResources action: no second token at current hex`);
        }
      }

      return { move: 'collectResources', args: [tokenKey] };
    }

    // pass (197)
    if (actionId === this.PASS_ACTION) {
      return { move: 'pass', args: [] };
    }

    throw new Error(`Invalid action ID: ${actionId}`);
  }

  /**
   * Get a boolean mask indicating which actions are valid in the current state.
   * @param state - Current game state
   * @returns Boolean array of length ACTION_SPACE_SIZE
   */
  getValidActionMask(state: GameState): boolean[] {
    const mask = new Array(this.ACTION_SPACE_SIZE).fill(false);

    const currentHex = state.G.shipStatus.location;
    const currentCoords = state.G.hexBoard[currentHex].cubeCoords;
    const hasBonusMoveShip = state.G.playerRoleCards?.['0']?.affectedAction === 'moveShip';
    const mustMoveShipOrPass = hasBonusMoveShip && state.G.currentTurnMoves >= 3 && !state.G.currentTurnMoveShipCalled;

    // 1. moveShip actions (0-168)
    if (state.G.shipStatus.energy > 1) {
      for (let i = 0; i < this.hexKeys.length; i++) {
        const targetHex = this.hexKeys[i];
        const targetCoords = state.G.hexBoard[targetHex].cubeCoords;
        const distance = this.getDistance(currentCoords, targetCoords);

        // Valid if within speed distance and not current location
        if (distance > 0 && distance <= state.G.shipStatus.speed) {
          mask[this.MOVE_SHIP_START + i] = true;
        }
      }
    }

    if (!mustMoveShipOrPass) {
      // 2. playCard actions (169-188)
      for (let cardIdx = 0; cardIdx < Math.min(5, state.G.detectedStarSystems.length); cardIdx++) {
        const card = state.G.detectedStarSystems[cardIdx];

        // Can only play if ship is at card's hex
        if (card.hexCoordinate === state.G.shipStatus.location) {
          const numTokenOptions = this.getNumTokenOptions(card);
          for (let tokenIdx = 0; tokenIdx < numTokenOptions; tokenIdx++) {
            mask[this.PLAY_CARD_START + (cardIdx * 4) + tokenIdx] = true;
          }
        }
      }

      // 3. drawCard actions (189-194)
      const zone1Deck = state.G.zoneDecks[1];
      if (zone1Deck && !zone1Deck.isLocked && zone1Deck.cards.length > 0) {
        const handSize = state.G.detectedStarSystems.length;

        if (handSize < 5) {
          // No discard needed
          mask[this.DRAW_CARD_NO_DISCARD] = true;
        } else if (handSize === 5) {
          // Must discard - all 5 slots are valid discard targets
          for (let i = 0; i < 5; i++) {
            mask[this.DRAW_CARD_DISCARD_START + i] = true;
          }
        }
      }

      // 4. collectResources actions (195-196)
      const hexCell = state.G.hexBoard[state.G.shipStatus.location];
      if (hexCell.celestialBodyToken !== null && hexCell.celestialBodyToken !== undefined) {
        mask[this.COLLECT_RESOURCES_START] = true; // First token
      }
      if ('celestialBodyToken2' in hexCell) {
        const token2 = (hexCell as any).celestialBodyToken2;
        if (token2 !== null && token2 !== undefined) {
          mask[this.COLLECT_RESOURCES_START + 1] = true; // Second token (HOME only)
        }
      }
    }

    // 5. pass action (197) - always valid
    mask[this.PASS_ACTION] = true;

    return mask;
  }

  /**
   * Get array of valid action IDs (convenience method).
   * @param state - Current game state
   * @returns Array of valid action IDs
   */
  getValidActions(state: GameState): number[] {
    const mask = this.getValidActionMask(state);
    const validActions: number[] = [];

    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        validActions.push(i);
      }
    }

    return validActions;
  }

  /**
   * Get total size of action space.
   */
  getActionSpaceSize(): number {
    return this.ACTION_SPACE_SIZE;
  }

  // ===== Private Helper Methods =====

  /**
   * Compute Manhattan distance between two cube coordinates.
   */
  private getDistance(from: CubeCoords, to: CubeCoords): number {
    return Math.max(
      Math.abs(from.q - to.q),
      Math.abs(from.r - to.r),
      Math.abs(from.s - to.s)
    );
  }

  /**
   * Find a valid path from current position to target position.
   * Uses greedy pathfinding (pick direction that minimizes distance at each step).
   * @param from - Starting cube coordinates
   * @param to - Target cube coordinates
   * @param maxSteps - Maximum path length (ship speed)
   * @returns Array of Direction values
   */
  private findPath(from: CubeCoords, to: CubeCoords, maxSteps: number): Direction[] {
    const path: Direction[] = [];
    let current = { ...from };
    const distance = this.getDistance(from, to);
    const actualSteps = Math.min(distance, maxSteps);

    while (path.length < actualSteps) {
      let bestDir: Direction | null = null;
      let bestDist = Infinity;

      // Try all 6 directions
      for (const [dirName, offset] of Object.entries(DIRECTIONS)) {
        const next = {
          q: current.q + offset.q,
          r: current.r + offset.r,
          s: current.s + offset.s,
        };

        const distToTarget = this.getDistance(next, to);
        if (distToTarget < bestDist) {
          bestDist = distToTarget;
          bestDir = dirName as Direction;
        }
      }

      if (bestDir === null) {
        throw new Error('Failed to find path - should not happen');
      }

      path.push(bestDir);
      const offset = DIRECTIONS[bestDir];
      current = {
        q: current.q + offset.q,
        r: current.r + offset.r,
        s: current.s + offset.s,
      };
    }

    return path;
  }

  /**
   * Find the index of a token option in a card's celestial body icons.
   * @param card - Star system card
   * @param tokenKey - Token key string (e.g., "red-normal", "planet")
   * @returns Token option index (0-3), or -1 if not found
   */
  private findTokenOptionIndex(card: StarSystemCard, tokenKey: string): number {
    const tokenOptions = this.getCardTokenOptions(card);
    return tokenOptions.indexOf(tokenKey);
  }

  /**
   * Get token key by index for a card.
   * @param card - Star system card
   * @param index - Token option index (0-3)
   * @returns Token key string
   */
  private getTokenKeyByIndex(card: StarSystemCard, index: number): string {
    const tokenOptions = this.getCardTokenOptions(card);

    if (index < 0 || index >= tokenOptions.length) {
      throw new Error(`Invalid token index ${index} for card "${card.title}"`);
    }

    return tokenOptions[index];
  }

  /**
   * Get all token key options for a card (expanded from celestial body icons).
   * Handles "any" icons by expanding to concrete types.
   * @param card - Star system card
   * @returns Array of token key strings (up to 4)
   */
  private getCardTokenOptions(card: StarSystemCard): string[] {
    const options: string[] = [];

    for (const icon of card.celestialBodyIcons) {
      if (icon.type === 'any') {
        // "any" expands to 5 concrete star types
        const concreteTypes = ['red', 'orange', 'yellow', 'white', 'blue'];
        for (const type of concreteTypes) {
          const key = `${type}-normal`; // "any" always means normal size
          if (!options.includes(key)) {
            options.push(key);
          }
        }
      } else {
        const key = this.makeTokenKeyFromIcon(icon);
        if (!options.includes(key)) {
          options.push(key);
        }
      }
    }

    return options.slice(0, 4); // Max 4 token options per encoding
  }

  /**
   * Get number of unique token options for a card.
   */
  private getNumTokenOptions(card: StarSystemCard): number {
    return this.getCardTokenOptions(card).length;
  }

  /**
   * Make token key from icon (matches lookupKey in Game.ts).
   */
  private makeTokenKeyFromIcon(icon: CelestialBodyIcon): string {
    if ('size' in icon && icon.size) {
      return `${icon.type}-${icon.size}`;
    } else {
      return icon.type;
    }
  }

  /**
   * Make token key from token object (matches lookupKey in Game.ts).
   */
  private lookupKey(token: any): string {
    if (!token || token === null || token === undefined) {
      throw new Error('Cannot lookup key for null/undefined token');
    }

    if ('size' in token && token.size) {
      return `${token.type}-${token.size}`;
    } else {
      return token.type;
    }
  }
}
