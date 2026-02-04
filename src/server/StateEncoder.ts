/**
 * Encodes game state as fixed-size normalized vector (128 features) for neural network input.
 *
 * Feature Vector Layout (128 features):
 *
 * [0-7]:    Global state - 8 features
 *           - round (0-4, normalized to [0,1] by /4)
 *           - actions_this_turn (0-3, normalized by /3)
 *           - energy (normalized by /maxEnergy)
 *           - armor (normalized by /maxArmor)
 *           - ship q (normalized by /7, range [-1,1])
 *           - ship r (normalized by /7, range [-1,1])
 *           - ship s (normalized by /7, range [-1,1])
 *           - points (normalized by /20, arbitrary scale)
 *
 * [8-57]:   Hand cards (5 slots × 10 features) - 50 features
 *           Per-slot features:
 *           - exists (0 or 1)
 *           - hex q/r/s (normalized coords of card's target hex, /7 → [-1,1])
 *           - distance (from ship to card's hex, /14 → [0,1])
 *           - base_points (zone×2 - 1, /7 → [0,1] since max zone is 4)
 *           - token_type_0..3 (normalized token type indices, /24 → [0,1])
 *
 * [58-81]:  Token distances (24 token types × 1 feature) - 24 features
 *           Distance to nearest token of each type (normalized by /14)
 *           0 = no token of this type exists on board
 *
 * [82-85]:  Current hex state - 4 features
 *           - has_token (0 or 1)
 *           - energy_effect (normalized by /12, range [-1,1])
 *           - armor_effect (normalized by /10, range [-1,1])
 *           - has_second_token (0 or 1, HOME only)
 *
 * [86-127]: Padding (zeros) - 42 features
 */

// Token type indices (must match celestial_body_token_types.json keys, sorted alphabetically)
const TOKEN_TYPE_ORDER = [
  'blackhole-giant',
  'blackhole-normal',
  'blue-giant',
  'blue-normal',
  'blue-supergiant',
  'browndwarf',
  'nebula-giant',
  'nebula-normal',
  'nebula-supergiant',
  'neutronstar',
  'orange-giant',
  'orange-normal',
  'orange-supergiant',
  'planet',
  'red-giant',
  'red-normal',
  'red-supergiant',
  'white-giant',
  'white-normal',
  'white-supergiant',
  'whitedwarf',
  'yellow-giant',
  'yellow-normal',
  'yellow-supergiant',
] as const;

type CubeCoords = { q: number; r: number; s: number };

interface GameState {
  G: {
    hexBoard: Record<string, HexCell>;
    reverseHexBoard: Record<string, string>;
    shipStatus: {
      location: string;
      energy: number;
      maxEnergy: number;
      armor: number;
      maxArmor: number;
      speed: number;
    };
    detectedStarSystems: StarSystemCard[];
    playerPoints: Record<string, number>;
    currentTurnMoves: number;
  };
  ctx: {
    turn: number;
  };
}

interface HexCell {
  cubeCoords: CubeCoords;
  celestialBodyToken: CelestialBodyToken | null;
  celestialBodyToken2?: CelestialBodyToken | null;
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

interface CelestialBodyToken {
  type: string;
  size?: string;
}

/**
 * StateEncoder handles conversion from game state to fixed-size feature vector.
 */
export class StateEncoder {
  private readonly FEATURE_SIZE = 128;
  private readonly HAND_SIZE = 5;
  private readonly FEATURES_PER_CARD = 10;
  private readonly NUM_TOKEN_TYPES = 24;
  private readonly MAX_BOARD_DISTANCE = 14; // Max distance on hex grid (7 in each direction)
  private readonly MAX_ZONE = 4;
  private readonly MAX_ENERGY_EFFECT = 12; // From blue-supergiant
  private readonly MAX_ARMOR_EFFECT = 10; // From neutronstar

  private tokenTypeIndex: Map<string, number>;
  private tokenEffects: Map<string, { energyChange: number; armorChange: number }>;

  /**
   * Initialize encoder with token type mapping and effects.
   * @param tokenEffectsConfig - Token effects from celestial_body_token_types.json
   */
  constructor(tokenEffectsConfig: Record<string, { energyChange: number; armorChange: number; numResearchTokens: number }>) {
    // Build token type index map
    this.tokenTypeIndex = new Map();
    TOKEN_TYPE_ORDER.forEach((type, idx) => {
      this.tokenTypeIndex.set(type, idx + 1); // 1-indexed, 0 = empty
    });

    // Build token effects map
    this.tokenEffects = new Map();
    for (const [key, value] of Object.entries(tokenEffectsConfig)) {
      this.tokenEffects.set(key, {
        energyChange: value.energyChange,
        armorChange: value.armorChange,
      });
    }
  }

  /**
   * Encode game state into fixed-size feature vector.
   * @param state - Current game state
   * @returns Array of 128 floats in range [-1, 1]
   */
  encodeState(state: GameState): number[] {
    const features = new Array(this.FEATURE_SIZE).fill(0);
    let idx = 0;

    // [0-6]: Global state (7 features)
    const round = state.ctx.turn;
    const actionsThisTurn = state.G.currentTurnMoves;
    const energy = state.G.shipStatus.energy;
    const maxEnergy = state.G.shipStatus.maxEnergy;
    const armor = state.G.shipStatus.armor;
    const maxArmor = state.G.shipStatus.maxArmor;
    const shipCoords = state.G.hexBoard[state.G.shipStatus.location].cubeCoords;
    const points = state.G.playerPoints['0'] || 0;

    features[idx++] = round / 4; // Normalize round (0-4)
    features[idx++] = actionsThisTurn / 3; // Normalize actions (0-3)
    features[idx++] = energy / maxEnergy; // Normalize energy
    features[idx++] = armor / maxArmor; // Normalize armor
    features[idx++] = shipCoords.q / 7; // Normalize q coord
    features[idx++] = shipCoords.r / 7; // Normalize r coord
    features[idx++] = shipCoords.s / 7; // Normalize s coord
    features[idx++] = points / 20; // Normalize points (arbitrary scale)

    // [8-57]: Hand cards (5 slots × 10 features) - 50 features
    for (let slotIdx = 0; slotIdx < this.HAND_SIZE; slotIdx++) {
      const card = state.G.detectedStarSystems[slotIdx];

      if (!card) {
        // Empty slot - all zeros
        idx += this.FEATURES_PER_CARD;
        continue;
      }

      // Card exists
      features[idx++] = 1; // exists flag

      // Card hex coordinates
      const cardHex = state.G.hexBoard[card.hexCoordinate];
      if (cardHex) {
        features[idx++] = cardHex.cubeCoords.q / 7;
        features[idx++] = cardHex.cubeCoords.r / 7;
        features[idx++] = cardHex.cubeCoords.s / 7;

        // Distance from ship to card hex
        const distance = this.getDistance(shipCoords, cardHex.cubeCoords);
        features[idx++] = distance / this.MAX_BOARD_DISTANCE;
      } else {
        // Invalid hex coordinate (shouldn't happen)
        idx += 4; // Skip coords and distance
      }

      // Base points for this card
      const basePoints = card.zoneNumber * 2 - 1;
      features[idx++] = basePoints / 7; // Max base points is 7 (zone 4)

      // Token type options (up to 4)
      const tokenOptions = this.getCardTokenOptions(card);
      for (let tokenIdx = 0; tokenIdx < 4; tokenIdx++) {
        if (tokenIdx < tokenOptions.length) {
          const tokenTypeIdx = this.tokenTypeIndex.get(tokenOptions[tokenIdx]) || 0;
          features[idx++] = tokenTypeIdx / this.NUM_TOKEN_TYPES;
        } else {
          features[idx++] = 0; // Empty token slot
        }
      }
    }

    // [58-81]: Token distances (24 token types) - 24 features
    const tokenDistances = this.computeTokenDistances(state);
    for (const tokenType of TOKEN_TYPE_ORDER) {
      const distance = tokenDistances.get(tokenType) || 0;
      features[idx++] = distance / this.MAX_BOARD_DISTANCE;
    }

    // [82-85]: Current hex state - 4 features
    const currentHex = state.G.hexBoard[state.G.shipStatus.location];
    const hasToken = currentHex.celestialBodyToken !== null ? 1 : 0;
    features[idx++] = hasToken;

    // Energy and armor effects of current hex token
    let energyEffect = 0;
    let armorEffect = 0;
    if (currentHex.celestialBodyToken) {
      const tokenKey = this.makeTokenKey(currentHex.celestialBodyToken);
      const effects = this.tokenEffects.get(tokenKey);
      if (effects) {
        energyEffect = effects.energyChange;
        armorEffect = effects.armorChange;
      }
    }
    features[idx++] = energyEffect / this.MAX_ENERGY_EFFECT;
    features[idx++] = armorEffect / this.MAX_ARMOR_EFFECT;

    // Second token (HOME only)
    const hasSecondToken = 'celestialBodyToken2' in currentHex &&
      (currentHex as any).celestialBodyToken2 !== null ? 1 : 0;
    features[idx++] = hasSecondToken;

    // [86-127]: Padding (zeros) - 42 features
    // (already filled with zeros from initialization)

    return features;
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
   * Get all token key options for a card (expanded from celestial body icons).
   * Handles "any" icons by expanding to concrete types.
   * @param card - Star system card
   * @returns Array of token key strings (up to 4)
   */
  private getCardTokenOptions(card: StarSystemCard): string[] {
    const options: string[] = [];

    for (const icon of card.celestialBodyIcons) {
      if (icon.type === 'any') {
        // "any" expands to 5 concrete star types (normal size only)
        const concreteTypes = ['red-normal', 'orange-normal', 'yellow-normal', 'white-normal', 'blue-normal'];
        for (const type of concreteTypes) {
          if (!options.includes(type)) {
            options.push(type);
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
   * Make token key from token object.
   */
  private makeTokenKey(token: CelestialBodyToken): string {
    if ('size' in token && token.size) {
      return `${token.type}-${token.size}`;
    } else {
      return token.type;
    }
  }

  /**
   * Compute distance from ship to nearest token of each type on the board.
   * @param state - Current game state
   * @returns Map from token type to distance (0 if not found)
   */
  private computeTokenDistances(state: GameState): Map<string, number> {
    const shipCoords = state.G.hexBoard[state.G.shipStatus.location].cubeCoords;
    const distances = new Map<string, number>();

    // Initialize all token types to 0 (not found)
    for (const tokenType of TOKEN_TYPE_ORDER) {
      distances.set(tokenType, 0);
    }

    // Scan all hexes for tokens
    for (const hexKey of Object.keys(state.G.hexBoard)) {
      const hex = state.G.hexBoard[hexKey];

      // Check first token
      if (hex.celestialBodyToken) {
        const tokenKey = this.makeTokenKey(hex.celestialBodyToken);
        const distance = this.getDistance(shipCoords, hex.cubeCoords);

        const currentDist = distances.get(tokenKey) || 0;
        if (currentDist === 0 || distance < currentDist) {
          distances.set(tokenKey, distance);
        }
      }

      // Check second token (HOME only)
      if ('celestialBodyToken2' in hex) {
        const token2 = (hex as any).celestialBodyToken2;
        if (token2) {
          const tokenKey = this.makeTokenKey(token2);
          const distance = this.getDistance(shipCoords, hex.cubeCoords);

          const currentDist = distances.get(tokenKey) || 0;
          if (currentDist === 0 || distance < currentDist) {
            distances.set(tokenKey, distance);
          }
        }
      }
    }

    return distances;
  }
}
