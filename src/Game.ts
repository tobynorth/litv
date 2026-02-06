"use strict";

import { AiEnumerate, Game } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';

const ROUNDS_PER_PHASE = 5;

enum Direction {
  W = "W",
  NW = "NW",
  NE = "NE",
  E = "E",
  SE = "SE",
  SW = "SW",
}

enum CelestialBodyType {
  Red = "red",
  Orange = "orange",
  Yellow = "yellow",
  White = "white",
  Blue = "blue",
  Planet = "planet",
  WhiteDwarf = "whitedwarf",
  BrownDwarf = "browndwarf",
  Nebula = "nebula",
  NeutronStar = "neutronstar",
  BlackHole = "blackhole",
  Wormhole = "wormhole",
  Any = "any",
}

enum CelestialBodySize {
  Normal = "normal",
  Giant = "giant",
  Supergiant = "supergiant",
}

const DIRECTIONS = {
  [Direction.W]:  { q: -1, r: 0, s: 1 },
  [Direction.NW]:  { q: 0, r: -1, s: 1 },
  [Direction.NE]: { q: 1, r: -1, s: 0 },
  [Direction.E]:  { q: 1, r: 0, s: -1 },
  [Direction.SE]: { q: 0, r: 1, s: -1 },
  [Direction.SW]:  { q: -1, r: 1, s: 0 },
} as const satisfies Record<Direction, CubeCoords>; 

interface LightsInTheVoidState {
  playerRoleCards: Record<string, RoleCard>;
  playerItineraryCards: Record<string, ItineraryCard>;
  detectedStarSystems: StarSystemCard[];
  shipStatus: ShipStatus;
  playerPoints: Record<string, number>;
  playedCards: StarSystemCard[];
  playerSubIconCollections: Record<string, Record<string, string[]>>;
  researchedCount: Record<string, number>;
  zoneDecks: ZoneDeck[];
  hexBoard: Record<string, HexCell>;
  reverseHexBoard: Record<string, string>;
  phasePointTotals: number[];
  currentTurnMoves: number;
  currentTurnMoveShipCalled: boolean;
}

export type ZoneDeck = {
  cards: StarSystemCard[];
  isLocked: boolean;
}

type ShipStatus = {
  location: string;
  energy: number;
  maxEnergy: number;
  armor: number;
  maxArmor: number;
  numResearchTokens: number;
  speed: number;
};

type CelestialBody = 
    {
      type: CelestialBodyType.Red |
            CelestialBodyType.Orange |
            CelestialBodyType.Yellow |
            CelestialBodyType.White |
            CelestialBodyType.Blue |
            CelestialBodyType.Nebula |
            CelestialBodyType.BlackHole,
      size: CelestialBodySize
    } 
  | { type: CelestialBodyType.Planet }
  | { type: CelestialBodyType.WhiteDwarf }
  | { type: CelestialBodyType.BrownDwarf }
  | { type: CelestialBodyType.NeutronStar };
type CelestialBodyToken = CelestialBody | { type: CelestialBodyType.Wormhole, destinationHex: string };
type CelestialBodyIcon = (CelestialBody | { type: CelestialBodyType.Any}) & {count: number};

type AllowedAnyIconType = CelestialBodyType.Red |
        CelestialBodyType.Orange |
        CelestialBodyType.Yellow |
        CelestialBodyType.White |
        CelestialBodyType.Blue;

export type Card = StarSystemCard | RoleCard | ItineraryCard;

export type StarSystemCard = {
  title: string;
  hexCoordinate: string;
  zoneNumber: number;
  celestialBodyIcons: CelestialBodyIcon[];
  itineraryIcons: ItineraryIcon[];
};

export type ItineraryIcon = {
  name: string;
  subicon?: string;
}

export type RoleCard = {
  name: string;
  affectedAction: string;
  bonusResourceType?: string;
}

export type ItineraryCard = {
  name: string;
  pointsPerItineraryIcon: number;
  pointsPerMatchingCelestialBodyIcon: number;
  matchingCelestialBodyIcons: CelestialBody[];
  minimumNumberCelestialBodyIcons?: number;
  pointsPerMatchingCelestialBodyIcon2?: number;
  matchingCelestialBodyIcons2?: CelestialBody[];
  zone1Percentage: number;
  zone2Percentage: number;
  zone3Percentage: number;
  zone4Percentage: number;

  // For constellation/continent tracking mechanics
  subicons?: string[];
  subIconStrategy?: 'incremental' | 'set-completion';
  pointsPerSubIconSet?: number;
  setSize?: number;
};

export type TokenEffects = {
  energyChange: number;
  armorChange: number;
  numResearchTokens: number;
};

export type TokenEffectsConfig = Record<string, TokenEffects>;

export type ResearchTopic = {
  cost: number;
  costIncrease?: number;
  maxEnergyChange: number;
  maxArmorChange: number;
  speedChange: number;
  unlocksDeck: boolean;
}

export type ResearchTopicsConfig = Record<string, ResearchTopic>;

type HexCell = {
  cubeCoords: CubeCoords;
  celestialBodyToken: CelestialBodyToken | null;
  numResearchTokens: number;
};

type DoubleTokenHexCell = HexCell & {
  celestialBodyToken2: CelestialBodyToken | null;
}

type CubeCoords = { q: number; r: number; s: number };

// Define type & module-level variable to store game configuration
// TODO: replace with built-in boardgame.io config that's only used with client-server games
type GameConfig = {
  tokenEffects: TokenEffectsConfig | null,
  researchTopics: ResearchTopicsConfig | null,
  numPhases: number | null,
  winThreshold: number | null,
  maxTurns: number | null,
}

const config: GameConfig = {
  tokenEffects: null,
  researchTopics: null,
  numPhases: null,
  winThreshold: null,
  maxTurns: null,
}

// Return true if `cells` is in a winning configuration.
// function IsVictory(cells: (string | null)[]) {
//   const positions = [
//     [0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6],
//     [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]
//   ];

//   const isRowComplete = (row: number[]) => {
//     const symbols = row.map(i => cells[i]);
//     return symbols.every(i => i !== null && i === symbols[0]);
//   };

//   return positions.map(isRowComplete).some(i => i === true);
// }

// // Return true if all `cells` are occupied.
// function IsDraw(cells: (string | null)[]) {
//   return cells.filter(c => c === null).length === 0;
// }

function generateHexes() {
  // Add the HOME hex
  let homeHexCell: DoubleTokenHexCell = {
    cubeCoords: { q: 0, r: 0, s: 0 },
    numResearchTokens: 0,
    celestialBodyToken: null,
    celestialBodyToken2: null,
  }
  let hexes: Record<string, HexCell> = {
    "HOME": homeHexCell
  };

  let reverseHexes: Record<string, string> = {
    "0,0,0": "HOME",
  };

  let sectorCurrentHexes: Record<string, HexCell> = {
    "A": { 
      cubeCoords: { q: -1, r: 0, s: 1 },
      celestialBodyToken: null,
      numResearchTokens: 0,
    },
    "B": { 
      cubeCoords: { q: 0, r: -1, s: 1 },
      celestialBodyToken: null,
      numResearchTokens: 0,
    },
    "C": { 
      cubeCoords: { q: 1, r: -1, s: 0 },
      celestialBodyToken: null,
      numResearchTokens: 0,
    },
    "D": { 
      cubeCoords: { q: 1, r: 0, s: -1 },
      celestialBodyToken: null,
      numResearchTokens: 0,
    },
    "E": { 
      cubeCoords: { q: 0, r: 1, s: -1 },
      celestialBodyToken: null,
      numResearchTokens: 0,
    },
    "F": { 
      cubeCoords: { q: -1, r: 1, s: 0 },
      celestialBodyToken: null,
      numResearchTokens: 0,
    },
  };

  // Add hexes A1 to F28
  let direction = -1;
  for (let c = "A".charCodeAt(0); c <= "F".charCodeAt(0); c++) {
    const letter = String.fromCharCode(c);
    let currHex = sectorCurrentHexes[letter];
    let currCoords = currHex.cubeCoords;
    let posC: keyof CubeCoords = currCoords.q > 0 ? "q" : (currCoords.r > 0 ? "r" : "s"),
          negC: keyof CubeCoords = currCoords.q < 0 ? "q" : (currCoords.r < 0 ? "r" : "s"),
          zeroC: keyof CubeCoords = currCoords.q === 0 ? "q" : (currCoords.r === 0 ? "r" : "s");

    for (let i = 1; i <= 28; i++) {
      const key = `${letter}${i}`;
      hexes[key] = structuredClone(currHex);
      reverseHexes[`${currCoords.q},${currCoords.r},${currCoords.s}`] = key;

      // Update currCoords for next hex
      if (direction === 1) {
        if (currCoords[posC] > 1) {
          currCoords[posC] -= 1;
          currCoords[zeroC] += 1;
        } else {
          currCoords[negC] -= 1;
          currCoords[posC] = currCoords[negC] * -1;
          currCoords[zeroC] = 0;
        }
      } else {
        if (currCoords[negC] < -1) {
          currCoords[negC] += 1;
          currCoords[zeroC] -= 1;
        } else {
          currCoords[posC] += 1;
          currCoords[negC] = currCoords[posC] * -1;
          currCoords[zeroC] = 0;
        }
      }
    }
    direction *= -1;
  }

  return { hexes, reverseHexes };
}

function getNeighborCoords(cubeCoords: CubeCoords, direction: Direction): CubeCoords | null {
  const dirOffset = DIRECTIONS[direction];

  let newCoords = {"q": cubeCoords.q + dirOffset.q, "r": cubeCoords.r + dirOffset.r, "s": cubeCoords.s + dirOffset.s };

  // Check if out of bounds (more than 7 hexes from HOME)
  const distanceFromHome = getDistance({"q": 0, "r": 0, "s": 0}, newCoords);
  if (distanceFromHome > 7) return null;

  return newCoords;
}

function getDistance(currCoords: CubeCoords, newCoords: CubeCoords) {
  return Math.max(Math.abs(currCoords.q - newCoords.q), Math.abs(currCoords.r - newCoords.r), Math.abs(currCoords.s - newCoords.s));
}

export function moveShip({ G }: { G: LightsInTheVoidState }, ...dirs: Direction[]) {
  if (dirs.length > G.shipStatus.speed) {
    return INVALID_MOVE;
  }
  let currCoords = G.hexBoard[G.shipStatus.location].cubeCoords;
  for (const currDir of dirs) {
    let newCoords = getNeighborCoords(currCoords, currDir);
    if (newCoords === null) {
      return INVALID_MOVE;
    }
    currCoords = newCoords;
  }

  // use hexBoardReverse to get the new hex key
  let newHexKey = G.reverseHexBoard[`${currCoords.q},${currCoords.r},${currCoords.s}`];

  // Update the ship location to the new hex
  G.shipStatus.location = newHexKey;
  G.shipStatus.energy -= 1;
  G.currentTurnMoves += 1;
  G.currentTurnMoveShipCalled = true;
};

export function drawCard({ G }: { G: LightsInTheVoidState }, zoneNumber: number, cardToDiscard: string | null = null) {
  // Player with bonus moveShip who already took 3 non-moveShip actions can only take moveShip or pass
  if (G.currentTurnMoves === 3 && !G.currentTurnMoveShipCalled) {
    return INVALID_MOVE;
  }

  if (zoneNumber < 1 || zoneNumber > Object.keys(G.zoneDecks).length) {
    return INVALID_MOVE;
  }
  const zoneDeck = G.zoneDecks[zoneNumber];
  if (zoneDeck.isLocked || zoneDeck.cards.length === 0) {
    return INVALID_MOVE;
  }
  if (G.detectedStarSystems.length >= 5) {
    if (cardToDiscard) {
      let discardIndex = G.detectedStarSystems.findIndex(c => c.title === cardToDiscard);
      if (discardIndex === -1) {
        return INVALID_MOVE;
      }
      G.detectedStarSystems.splice(discardIndex, 1);
    } else {
      return INVALID_MOVE;
    }
  }
  let drawnCard = zoneDeck.cards.pop()!;
  G.detectedStarSystems.push(drawnCard);
  G.currentTurnMoves += 1;
}

export function playCard({ G, playerID }: { G: LightsInTheVoidState, playerID: string }, cardTitle: string, tokenToPlayKey: string) {
  // Player with bonus moveShip who already took 3 non-moveShip actions can only take moveShip or pass
  if (G.currentTurnMoves === 3 && !G.currentTurnMoveShipCalled) {
    return INVALID_MOVE;
  }

  let cardToPlayIndex = G.detectedStarSystems.findIndex(c => c.title === cardTitle);
  if (
      cardToPlayIndex === -1
      || G.shipStatus.location !== G.detectedStarSystems[cardToPlayIndex].hexCoordinate
      || !tokenToPlayKey
    ) {
    return INVALID_MOVE;
  }

  // Reconstruct the token from the key
  const tokenToPlay = reconstructTokenFromKey(tokenToPlayKey);
  if (!tokenToPlay) {
    return INVALID_MOVE;
  }

  let foundMatch = false;
  for (let icon of G.detectedStarSystems[cardToPlayIndex].celestialBodyIcons) {
    if (icon.type === tokenToPlay.type && (!("size" in icon) || !("size" in tokenToPlay) || icon.size! === tokenToPlay.size)) {
      foundMatch = true;
      break;
    } else if (icon.type === CelestialBodyType.Any) {
      const concreteTypes: AllowedAnyIconType[] = [
        CelestialBodyType.Red,
        CelestialBodyType.Orange,
        CelestialBodyType.Yellow,
        CelestialBodyType.White,
        CelestialBodyType.Blue,
      ];
      if (concreteTypes.includes(tokenToPlay.type as AllowedAnyIconType) && (!("size" in tokenToPlay) || tokenToPlay.size === CelestialBodySize.Normal)) {
        foundMatch = true;
        break;
      }
    }
  }
  if (!foundMatch) {
    return INVALID_MOVE;
  }

  // Move card to played cards
  let cardToPlay = G.detectedStarSystems.splice(cardToPlayIndex, 1)[0];
  G.playedCards.push(cardToPlay);

  // Calculate and apply points for all players
  applyCardPoints(cardToPlay, playerID, G);

  // place celestial body token + any research tokens on board
  let currHex = G.hexBoard[G.shipStatus.location];
  currHex.celestialBodyToken = tokenToPlay;
  currHex.numResearchTokens = config.tokenEffects![tokenToPlayKey].numResearchTokens;
  G.currentTurnMoves += 1;
}

export function collectResources({ G, ctx }: { G: LightsInTheVoidState, ctx: any }, tokenToCollectFromKey: string) {
  // Player with bonus moveShip who already took 3 non-moveShip actions can only take moveShip or pass
  if (G.currentTurnMoves === 3 && !G.currentTurnMoveShipCalled) {
    return INVALID_MOVE;
  }

  const currentHex = G.hexBoard[G.shipStatus.location];
  let key = lookupKey(currentHex.celestialBodyToken!);
  let key2 = "celestialBodyToken2" in currentHex ? lookupKey((currentHex as DoubleTokenHexCell).celestialBodyToken2!) : null;

  // Return invalid if there's no token on the current hex
  if (key !== tokenToCollectFromKey && key2 !== tokenToCollectFromKey) {
    return INVALID_MOVE;
  }


  // Look up effects in config
  const effects = config.tokenEffects![tokenToCollectFromKey];
  if (!effects) {
    // No effects defined for this token type
    return INVALID_MOVE;
  }

  // Check if player has energy or armor bonuses from role cards
  const currentPlayerRole = G.playerRoleCards[ctx.currentPlayer];
  const hasEnergyBonus = currentPlayerRole?.affectedAction === 'collectResources'
    && currentPlayerRole?.bonusResourceType === 'energy';
  const hasArmorBonus = currentPlayerRole?.affectedAction === 'collectResources'
    && currentPlayerRole?.bonusResourceType === 'armor';

  // Apply energy & armor effects to ship status
  let status = G.shipStatus;

  let energyIncrease = effects.energyChange;
  if (hasEnergyBonus && energyIncrease > 0) {
    energyIncrease += 2;
  }

  let armorChange = effects.armorChange;
  if (hasArmorBonus && armorChange !== 0) {
    armorChange += 1;
  }

  status.energy = Math.min(
    status.maxEnergy,
    status.energy + energyIncrease
  );
  status.armor = Math.min(
    status.maxArmor,
    status.armor + armorChange
  );

  // collect any research tokens on the hex
  status.numResearchTokens += G.hexBoard[status.location].numResearchTokens;
  G.hexBoard[status.location].numResearchTokens = 0;
  G.currentTurnMoves += 1;
}

export function doResearch({ G }: { G: LightsInTheVoidState }, researchTopicName: string) {
  // Player with bonus moveShip who already took 3 non-moveShip actions can only take moveShip or pass
  if (G.currentTurnMoves === 3 && !G.currentTurnMoveShipCalled) {
    return INVALID_MOVE;
  }

  let researchTopic = config.researchTopics?.[researchTopicName];
  if (!researchTopic) {
    return INVALID_MOVE;
  }
  
  if (!G.researchedCount[researchTopicName]) {
    G.researchedCount[researchTopicName] = 0;
  }
  const costIncrease = researchTopic.costIncrease ? G.researchedCount[researchTopicName] * researchTopic.costIncrease : 0;
  const actualCost = researchTopic.cost + costIncrease;
  let status = G.shipStatus;
  if (status.numResearchTokens < actualCost) {
    return INVALID_MOVE;
  }
  if (researchTopic.unlocksDeck) {
    const deckToUnlock = G.zoneDecks.find(d => d.isLocked);
    if (!deckToUnlock) {
      return INVALID_MOVE;
    }
    deckToUnlock.isLocked = false;
  }
  status.numResearchTokens -= actualCost;
  status.maxEnergy += researchTopic.maxEnergyChange;
  status.maxArmor += researchTopic.maxArmorChange;
  status.speed += researchTopic.speedChange;

  G.researchedCount[researchTopicName]++;
  G.currentTurnMoves += 1;
}

export function pass({ G }: { G: LightsInTheVoidState }) {
  // Pass/noop action. Currently only used for ending a pilot's turn after 3 actions if they chose not to moveShip at all
}

function lookupKey(token: CelestialBodyToken): string {
  // Build lookup key based on token type and size
  if ("size" in token) {
    return `${token.type}-${token.size}`;
  } else {
    return token.type;
  }
}

function reconstructTokenFromKey(key: string): CelestialBodyToken | null {
  // Reverse of lookupKey - reconstruct token from key string
  const parts = key.split('-');
  switch (parts[0]) {
    case CelestialBodyType.Red:
    case CelestialBodyType.Orange:
    case CelestialBodyType.Yellow:
    case CelestialBodyType.White:
    case CelestialBodyType.Blue:
    case CelestialBodyType.Nebula:
    case CelestialBodyType.BlackHole:
      if (parts.length >= 2) {
        const size = parts[1] as CelestialBodySize;
        return { type: parts[0], size: size };
      }
      return null;
    case CelestialBodyType.Planet:
    case CelestialBodyType.WhiteDwarf:
    case CelestialBodyType.BrownDwarf:
    case CelestialBodyType.NeutronStar:
      return { type: parts[0] };
    case CelestialBodyType.Wormhole:
    default:
      return null;
  }
}

// Pure function: Calculate per-player points for playing a card WITHOUT modifying game state
function calculateCardPointsPerPlayer(
  card: StarSystemCard,
  currentPlayerID: string,
  playerItineraryCards: Record<string, ItineraryCard>,
  playerSubIconCollections: Record<string, Record<string, string[]>>
): Record<string, number> {
  const pointsPerPlayer: Record<string, number> = {};

  // Initialize all players to 0 points
  Object.keys(playerItineraryCards).forEach(pID => {
    pointsPerPlayer[pID] = 0;
  });

  // Base points: only awarded to the player who played the card
  pointsPerPlayer[currentPlayerID] = card.zoneNumber * 2 - 1;

  // Calculate bonus points for itinerary icon matches
  card.itineraryIcons.forEach(itineraryIcon => {
    Object.entries(playerItineraryCards).forEach(([pID, itineraryCard]) => {
      if (itineraryIcon.name === itineraryCard.name) {
        pointsPerPlayer[pID] += itineraryCard.pointsPerItineraryIcon;

        // Handle subicon bonuses
        if (itineraryIcon.subicon && itineraryCard.subicons && itineraryCard.subIconStrategy) {
          const subicon = itineraryIcon.subicon;

          if (subicon && itineraryCard.subicons.includes(subicon)) {
            // Get current collection (or empty array if doesn't exist)
            const currentCollection = playerSubIconCollections[pID]?.[itineraryCard.name] || [];

            if (itineraryCard.subIconStrategy === 'incremental') {
              // Famous Constellations: Award +1 bonus point for each matching subicon already collected
              const bonus = currentCollection.filter(s => s === subicon).length;
              pointsPerPlayer[pID] += bonus;
            } else if (itineraryCard.subIconStrategy === 'set-completion' && itineraryCard.setSize && itineraryCard.pointsPerSubIconSet) {
              // Travel the World: Award bonus if adding this subicon completes a new set
              // Simulate adding the new subicon
              const simulatedCollection = [...currentCollection, subicon];
              const uniqueSubicons = new Set(simulatedCollection);

              // Check if this would complete a new set
              if (uniqueSubicons.size % itineraryCard.setSize === 0) {
                pointsPerPlayer[pID] += itineraryCard.pointsPerSubIconSet;
              }
            }
          }
        }
      }
    });
  });

  // Calculate bonus points for celestial body icon matches
  Object.entries(playerItineraryCards).forEach(([pID, itineraryCard]) => {
    if (itineraryCard.matchingCelestialBodyIcons.length === 0) {
      return;
    }

    // Handle 1st set of matching icons
    let numMatchingIcons = 0;
    let minimumMatchingIcons = itineraryCard.minimumNumberCelestialBodyIcons ?? 1;
    card.celestialBodyIcons.forEach(celestialBodyIcon => {
      itineraryCard.matchingCelestialBodyIcons.forEach(matchingIcon => {
        if (
          celestialBodyIcon.type === matchingIcon.type
          && (
            !("size" in celestialBodyIcon && "size" in matchingIcon)
            || celestialBodyIcon.size === matchingIcon.size
          )
        ) {
          numMatchingIcons += celestialBodyIcon.count;
        }
      });
    });
    if (numMatchingIcons >= minimumMatchingIcons) {
      pointsPerPlayer[pID] += (itineraryCard.pointsPerMatchingCelestialBodyIcon * numMatchingIcons);
    }

    // Handle 2nd set of matching icons (with different # of points)
    if (itineraryCard.matchingCelestialBodyIcons2 && itineraryCard.pointsPerMatchingCelestialBodyIcon2) {
      numMatchingIcons = 0;
      card.celestialBodyIcons.forEach(celestialBodyIcon => {
        itineraryCard.matchingCelestialBodyIcons2!.forEach(matchingIcon => {
          if (
            celestialBodyIcon.type === matchingIcon.type
            && (
              !("size" in celestialBodyIcon && "size" in matchingIcon)
              || celestialBodyIcon.size === matchingIcon.size
            )
          ) {
            numMatchingIcons += celestialBodyIcon.count;
          }
        });
      });
      if (numMatchingIcons >= minimumMatchingIcons) {
        pointsPerPlayer[pID] += (itineraryCard.pointsPerMatchingCelestialBodyIcon2 * numMatchingIcons);
      }
    }
  });

  return pointsPerPlayer;
}

// Stateful function: Apply point calculations to game state and handle side effects
function applyCardPoints(
  card: StarSystemCard,
  currentPlayerID: string,
  G: LightsInTheVoidState
): void {
  // Calculate points using pure function
  const pointsPerPlayer = calculateCardPointsPerPlayer(
    card,
    currentPlayerID,
    G.playerItineraryCards,
    G.playerSubIconCollections
  );

  // Apply points to game state
  Object.entries(pointsPerPlayer).forEach(([pID, points]) => {
    if (!pID) {
      return;
    }
    G.playerPoints[pID] += points;
  });

  // Handle side effects: Update playerSubIconCollections
  card.itineraryIcons.forEach(itineraryIcon => {
    if (!itineraryIcon.subicon) {
      return;
    }
    Object.entries(G.playerItineraryCards).forEach(([pID, itineraryCard]) => {
      if (itineraryCard.name === itineraryIcon.name) {
        const subicon = itineraryIcon.subicon!;
        if (itineraryCard.subicons!.includes(subicon)) {
          // Initialize tracking if not exists
          if (!G.playerSubIconCollections[pID]) {
            G.playerSubIconCollections[pID] = {};
          }
          if (!G.playerSubIconCollections[pID][itineraryCard.name]) {
            G.playerSubIconCollections[pID][itineraryCard.name] = [];
          }

          // Track this subicon
          G.playerSubIconCollections[pID][itineraryCard.name].push(subicon);
        }
      }
    });
  });
}

// Calculate total points a card would award to ALL players collectively
function calculateTotalCardPoints(
  card: StarSystemCard,
  G: LightsInTheVoidState
): number {
  // Use the pure function to calculate per-player points
  // Pass player "0" as the one who plays the card (arbitrary choice for calculation purposes)
  const pointsPerPlayer = calculateCardPointsPerPlayer(
    card,
    "0",
    G.playerItineraryCards,
    G.playerSubIconCollections
  );

  // Sum all points across all players
  return Object.values(pointsPerPlayer).reduce((sum, points) => sum + points, 0);
}

function completeCurrentPhase(G: LightsInTheVoidState) {
  // 1. Sum all player points
  const phaseTotal = Object.values(G.playerPoints).reduce((sum, points) => sum + points, 0);
  G.phasePointTotals.push(phaseTotal);

  // 2. Reset individual player scores
  Object.keys(G.playerPoints).forEach(playerID => {
    G.playerPoints[playerID] = 0;
  });

  // 3. Replenish research tokens on hexes
  Object.values(G.hexBoard).forEach(hex => {
    if (hex.celestialBodyToken) {
      const key = lookupKey(hex.celestialBodyToken);
      const effects = config.tokenEffects![key];
      if (effects && effects.numResearchTokens > 0) {
        hex.numResearchTokens = effects.numResearchTokens;
      }
    }
  });
}

// TODO: implement card selection for discard. something like below, maybe...
// export function discardDetectedStarSystem({ G, events }: { G: LightsInTheVoidState, events: any }, cardToDiscardIndex: number) {
//   if (cardToDiscardIndex < 0 || cardToDiscardIndex >= G.detectedStarSystems.length) {
//     return INVALID_MOVE;
//   }
//   G.detectedStarSystems[cardToDiscardIndex] = G.justDrawnCards[0];
//   G.justDrawnCards = [];
//   events.endStage();
// }

export function ShipDestroyed(G: LightsInTheVoidState) {
  return G.shipStatus.armor <= 0 || G.shipStatus.energy <= 0;
}

// Check if a card has celestial body icons that award research tokens
function hasResearchTokenIcons(card: StarSystemCard): boolean {
  const researchTokenTypes = [
    CelestialBodyType.BrownDwarf,
    CelestialBodyType.WhiteDwarf,
    CelestialBodyType.Nebula,
    CelestialBodyType.NeutronStar,
    CelestialBodyType.BlackHole,
  ];

  return card.celestialBodyIcons.some(icon => researchTokenTypes.includes(icon.type));
}

// Find highest-value target cards from detectedStarSystems
function findHighestValueTargets(G: LightsInTheVoidState): StarSystemCard[] {
  const cards = G.detectedStarSystems;
  if (cards.length === 0) return [];

  // Calculate points for each card
  const cardScores = cards.map(card => ({
    card,
    points: calculateTotalCardPoints(card, G),
    hasResearch: hasResearchTokenIcons(card)
  }));

  // Find max points
  const maxPoints = Math.max(...cardScores.map(cs => cs.points));

  // Return cards with max points OR cards with research tokens
  return cardScores
    .filter(cs => cs.points === maxPoints || cs.hasResearch)
    .map(cs => cs.card);
}

function findLowestValueTarget(G: LightsInTheVoidState): StarSystemCard | null {
  const cards = G.detectedStarSystems;
  if (cards.length === 0) return null;
  // Calculate points for each card
  const cardScores = cards.map(card => ({
    card,
    points: calculateTotalCardPoints(card, G),
  }));
  // Find min points
  const minPoints = Math.min(...cardScores.map(cs => cs.points));
  // Return cards with min points
  const currCoords = G.hexBoard[G.shipStatus.location].cubeCoords;
  return cardScores
    .filter(cs => cs.points === minPoints)
    .sort((a, b) => getDistance(currCoords, G.hexBoard[b.card.hexCoordinate].cubeCoords) - getDistance(currCoords, G.hexBoard[a.card.hexCoordinate].cubeCoords))
    .slice(0, 1)
    .map(cs => cs.card)[0];
}

// Check if cardA is "on the way" to cardB (within 2 extra moves)
function isOnTheWay(
  currentCoords: CubeCoords,
  cardACoords: CubeCoords,
  cardBCoords: CubeCoords,
  shipSpeed: number
): boolean {
  const distCurrentToA = getDistance(currentCoords, cardACoords);
  const distCurrentToB = getDistance(currentCoords, cardBCoords);
  const distAToB = getDistance(cardACoords, cardBCoords);

  return (distCurrentToA + distAToB) <= (distCurrentToB + 2 * shipSpeed);
}

// Check if we can reach a card without energy going to 0
// (Simplified: just checks if we have enough energy for the distance)
function canReachSafely(
  currentCoords: CubeCoords,
  targetCoords: CubeCoords,
  G: LightsInTheVoidState
): boolean {
  const distance = getDistance(currentCoords, targetCoords);
  // Each move costs 1 energy, need at least 1 energy remaining
  return (G.shipStatus.energy - 1) * G.shipStatus.speed >= distance;
}

// Helper function to check if a path endpoint is strategically valid
function isPathValid(
  G: LightsInTheVoidState,
  currentCoords: CubeCoords,
  endpointCoords: CubeCoords,
  ignoredSystemCoords: Set<string>
): boolean {
  // Check if endpoint is closer to at least one detected star system (excluding ignored ones)
  for (const system of G.detectedStarSystems) {
    const systemCoords = G.hexBoard[system.hexCoordinate].cubeCoords;
    const coordsKey = `${systemCoords.q},${systemCoords.r},${systemCoords.s}`;

    // Skip systems we're ignoring
    if (ignoredSystemCoords.has(coordsKey)) {
      continue;
    }

    const distCurrentToSystem = getDistance(currentCoords, systemCoords);
    const distEndpointToSystem = getDistance(endpointCoords, systemCoords);

    if (distEndpointToSystem < distCurrentToSystem) {
      return true;
    }
  }

  return false;
}

// Generate paths to unique endpoints using BFS (one path per destination)
function generatePaths(currentCoords: CubeCoords, maxLength: number): Direction[][] {
  // Map from endpoint key to path that reaches it
  const endpointPaths = new Map<string, Direction[]>();

  // Queue: [currentCoords, pathSoFar]
  const queue: Array<[CubeCoords, Direction[]]> = [[currentCoords, []]];

  while (queue.length > 0) {
    const [coords, path] = queue.shift()!;

    // Stop if we've reached max length
    if (path.length >= maxLength) {
      continue;
    }

    // Try all 6 directions - endpoint deduplication handles redundancy
    for (const dir of Object.values(Direction)) {
      const nextCoords = getNeighborCoords(coords, dir);
      if (nextCoords === null) continue;

      const newPath = [...path, dir];
      const endpointKey = `${nextCoords.q},${nextCoords.r},${nextCoords.s}`;

      // Only add if we haven't seen this endpoint before
      // BFS ensures we find shortest path first
      if (!endpointPaths.has(endpointKey)) {
        endpointPaths.set(endpointKey, newPath);
        queue.push([nextCoords, newPath]);
      }
    }
  }

  return Array.from(endpointPaths.values());
}

export const makeLightsInTheVoidGame = (
  decks: ZoneDeck[],
  roleCards: RoleCard[],
  itineraryCards: ItineraryCard[],
  tokenEffects: TokenEffectsConfig,
  researchTopics: ResearchTopicsConfig,
  numPlayers: number,
  numPhases: number,
  winThreshold: number,
): Game<LightsInTheVoidState> => {
  // Initialize module-level config
  // TODO: make this typesafe
  Object.assign(config, {
    numPhases: numPhases,
    winThreshold: winThreshold,
    maxTurns: ROUNDS_PER_PHASE * numPhases * numPlayers,
    tokenEffects: tokenEffects,
    researchTopics: researchTopics,
  });

  return {
    setup: ({ ctx }) => {
    const { hexes, reverseHexes } = generateHexes();

    // Extract Zone 0 card for initial play
    const zone0Card = decks[0].cards.pop()!;

    // Place two tokens on HOME hex based on Zone 0 card icons
    const homeHex = hexes["HOME"] as DoubleTokenHexCell;
    // Cast to CelestialBody since Zone 0 card never has 'any' type icons
    const icon1 = zone0Card.celestialBodyIcons[0] as CelestialBody;
    const icon2 = zone0Card.celestialBodyIcons[1] as CelestialBody;

    // Create token from first icon
    let token1: CelestialBodyToken;
    if ("size" in icon1) {
      token1 = { type: icon1.type, size: icon1.size };
    } else {
      token1 = { type: icon1.type };
    }

    // Create token from second icon
    let token2: CelestialBodyToken;
    if ("size" in icon2) {
      token2 = { type: icon2.type, size: icon2.size };
    } else {
      token2 = { type: icon2.type };
    }

    homeHex.celestialBodyToken = token1;
    homeHex.celestialBodyToken2 = token2;

    // Build initial game state
    const initialState: LightsInTheVoidState = {
      shipStatus: {
        location: "HOME",
        energy: 5,
        maxEnergy: 5,
        armor: 5,
        maxArmor: 5,
        numResearchTokens: 0,
        speed: 2,
      },
      playerRoleCards: Object.fromEntries(
        Array.from({ length: ctx.numPlayers }, (_, i) => [String(i), roleCards[i]])
      ),
      playerItineraryCards: Object.fromEntries(
        Array.from({ length: ctx.numPlayers }, (_, i) => [String(i), itineraryCards[i]])
      ),
      detectedStarSystems: Array.from({ length: 5 }, () => decks[1].cards.pop()!),
      playerPoints: Object.fromEntries(
        Array.from({ length: ctx.numPlayers }, (_, i) => [String(i), 0])
      ),
      playedCards: [zone0Card],
      zoneDecks: decks,
      hexBoard: hexes,
      reverseHexBoard: reverseHexes,
      phasePointTotals: [],
      playerSubIconCollections: {},
      researchedCount: {"Upgrade Sensors": 0},
      currentTurnMoves: 0,
      currentTurnMoveShipCalled: false,
    };

    // Award bonus points for Zone 0 card matches (no base points since no one played it)
    applyCardPoints(zone0Card, "", initialState);

    return initialState;
  },

  turn: {
    minMoves: 1,
    maxMoves: 4,
    onBegin: ({ G }) => {
      G.currentTurnMoves = 0;
      G.currentTurnMoveShipCalled = false;
    },
    onMove: ({ G, ctx, events }) => {
      // Check if turn should end based on role card
      const currentPlayerRole = G.playerRoleCards[ctx.currentPlayer];
      const hasBonusMoveShipAction = currentPlayerRole?.affectedAction === 'moveShip';
      const maxMoves = hasBonusMoveShipAction ? 4 : 3;
      if (G.currentTurnMoves >= maxMoves) {
        events.endTurn();
      }
    },
    onEnd: ({ G, ctx, events }) => {
      // Check if round is complete
      const currRoundCompleted = ctx.turn % ctx.numPlayers === 0;
      if (currRoundCompleted) {
        // award passive research token(s)
        G.shipStatus.numResearchTokens += Math.floor((ctx.numPlayers + 1) / 2);
      }

      // Check if phase is complete
      const roundsCompleted = Math.floor(ctx.turn / ctx.numPlayers);
      if (roundsCompleted > 0 && roundsCompleted % ROUNDS_PER_PHASE === 0) {
        completeCurrentPhase(G);
      }

      // Check if game is complete
      if (ctx.turn >= config.maxTurns!) {
        // Calculate cumulative points
        const cumulativePoints = G.phasePointTotals.reduce((sum, total) => sum + total, 0);
        if (cumulativePoints >= winThreshold) {
          events.endGame({ playersWin: true, winner: "0", finalScore: cumulativePoints });
        } else {
          events.endGame({ playersLose: true, winner: null, finalScore: cumulativePoints });
        }
      }
    },
    // stages: {
    //   discardDetectedStarSystem: {
    //     moves: {
    //       discardDetectedStarSystem
    //     },
    //   },
    // }
  },

  moves: {
    moveShip,
    drawCard,
    playCard,
    collectResources,
    doResearch,
    pass,
  },

  endIf: ({ G, ctx }) => {
    // Check for early loss condition (ship destroyed)
    if (ShipDestroyed(G)) {
      const cumulativePoints = G.phasePointTotals.reduce((sum, total) => sum + total, 0);
      return { playersLose: true, winner: null, finalScore: cumulativePoints };
    }
  },

  ai: {
    enumerate: (G, ctx) => {
      let moves: AiEnumerate = [];

      // Check if current player has reached their action limit
      const currentPlayerRole = G.playerRoleCards[ctx.currentPlayer];
      const hasBonusMoveShip = currentPlayerRole?.affectedAction === 'moveShip';

      // Check if player has already taken 3 non-moveShip actions -- if so, they must moveShip or pass
      const mustMoveShipOrPass = hasBonusMoveShip && G.currentTurnMoves >= 3 && !G.currentTurnMoveShipCalled;

      // 1. Enumerate playCard moves (highest priority)
      if (!mustMoveShipOrPass) {
        G.detectedStarSystems.forEach((card) => {
          if (G.shipStatus.location === card.hexCoordinate) {
            card.celestialBodyIcons.forEach((icon) => {
              if (icon.type === CelestialBodyType.Any) {
                const concreteTypes: AllowedAnyIconType[] = [
                  CelestialBodyType.Red,
                  CelestialBodyType.Orange,
                  CelestialBodyType.Yellow,
                  CelestialBodyType.White,
                  CelestialBodyType.Blue,
                ];
                for (const concreteType of concreteTypes) {
                  let token: CelestialBodyToken = { type: concreteType, size: CelestialBodySize.Normal };
                  moves.push({ move: 'playCard', args: [card.title, lookupKey(token)] } );
                }
              } else {
                let token: CelestialBodyToken;
                if ("size" in icon) {
                  token = { type: icon.type, size: icon.size };
                } else {
                  token = { type: icon.type };
                }
                moves.push({ move: 'playCard', args: [card.title, lookupKey(token)] } );
              }
            });
          }
        });

        // remove duplicate playCard moves (from 'any' icon handling)
        moves = moves.filter((move, index, self) =>
          index === self.findIndex(m =>
            'args' in m && 'args' in move &&
            m.args![0] === move.args![0] && m.args![1] === move.args![1]
          )
        );

        // If a card can be played right now, that's objectively better than vitually anything else, so don't consider any other move
        if (moves.length > 0) {
          return moves;
        }
      }

      // 2. Enumerate moveShip moves
      const currentLocation = G.hexBoard[G.shipStatus.location];

      if (G.shipStatus.energy > 1) {
        const currentCoords = currentLocation.cubeCoords;

        // Find highest-value target cards (max points OR research tokens)
        const highValueTargets = findHighestValueTargets(G);

        // Filter out targets we can't reach safely (energy would go to 0)
        const safeTargets = highValueTargets.filter(card => {
          const targetCoords = G.hexBoard[card.hexCoordinate].cubeCoords;
          return canReachSafely(currentCoords, targetCoords, G);
        });

        if (safeTargets.length === 0) {
          // No safe targets, skip moveShip enumeration
          // (Fall through to other move types like drawCard, collectResources, etc.)
        } else {
          // Caveat 1: Check for cards "on the way" to high-value targets (within 2 extra moves)
          const onTheWayCards: StarSystemCard[] = [];
          G.detectedStarSystems.forEach(card => {
            const cardCoords = G.hexBoard[card.hexCoordinate].cubeCoords;
            // Check if this card is on the way to any safe target
            const isOnWay = safeTargets.some(target => {
              const targetCoords = G.hexBoard[target.hexCoordinate].cubeCoords;
              return isOnTheWay(currentCoords, cardCoords, targetCoords, G.shipStatus.speed);
            });
            if (isOnWay && !safeTargets.includes(card)) {
              onTheWayCards.push(card);
            }
          });

          // Prioritize on-the-way cards if they exist, otherwise use safe high-value targets
          const finalTargets = onTheWayCards.length > 0 ? onTheWayCards : safeTargets;

          // Generate moves toward each final target
          finalTargets.forEach(targetCard => {
            const targetCoords = G.hexBoard[targetCard.hexCoordinate].cubeCoords;
            const distance = getDistance(currentCoords, targetCoords);
            const actualDistance = Math.min(distance, G.shipStatus.speed);

            const path: Direction[] = [];
            let currentPos = { ...currentCoords };

            // Greedily build path by picking best direction at each step
            while (path.length < actualDistance) {
              let bestDir: Direction | null = null;
              let bestDist = Infinity;

              for (const [dirName, _] of Object.entries(DIRECTIONS)) {
                const nextCoords = getNeighborCoords(currentPos, dirName as Direction);
                if (nextCoords === null) continue;

                const distToTarget = getDistance(nextCoords, targetCoords);
                if (distToTarget < bestDist) {
                  bestDist = distToTarget;
                  bestDir = dirName as Direction;
                }
              }

              if (bestDir === null) break; // Should never happen
              path.push(bestDir);
              currentPos = getNeighborCoords(currentPos, bestDir)!;

              // Only add if we successfully built a complete path
              if (path.length === actualDistance) {
                moves.push({ move: 'moveShip', args: path });
                return; // Move to next finalTarget
              }
            }
          });

          // Remove duplicate moveShip moves (same path might reach multiple targets)
          moves = moves.filter((move, index, self) =>
            index === self.findIndex(m =>
              'args' in m && 'args' in move &&
              m.move === 'moveShip' && move.move === 'moveShip' &&
              JSON.stringify(m.args) === JSON.stringify(move.args)
            )
          );
        }
      }


      // 3. Enumerate drawCard moves
      if (!mustMoveShipOrPass) {
        Object.keys(G.zoneDecks).forEach(zoneNumStr => {
          const zoneNum = parseInt(zoneNumStr);
          if (!G.zoneDecks[zoneNum].isLocked && G.zoneDecks[zoneNum].cards.length > 0) {
            if (G.detectedStarSystems.length < 5) {
              moves.push({ move: 'drawCard', args: [zoneNum] });
            } else {
              // If there are already 5 detected star systems, must specify a card to discard
              const minValueTarget = findLowestValueTarget(G);
              moves.push({ move: 'drawCard', args: [zoneNum, minValueTarget!.title] });
            }
          }
        });
      }

      // 4. Enumerate collectResources moves
      if (!mustMoveShipOrPass) {
        if (currentLocation.celestialBodyToken) {
          const key = lookupKey(currentLocation.celestialBodyToken);
          if (config.tokenEffects && config.tokenEffects[key]) {
            let effects = config.tokenEffects[key];
            const hasArmorBonus = currentPlayerRole?.affectedAction === 'collectResources' && currentPlayerRole?.bonusResourceType === 'armor' && effects.armorChange !== 0;
            if (
              (G.shipStatus.armor < G.shipStatus.maxArmor && effects.armorChange > 0)
              || (G.shipStatus.energy < G.shipStatus.maxEnergy && effects.energyChange > 0 && G.shipStatus.armor + effects.armorChange + (hasArmorBonus ? 1 : 0) >= 1)
              || effects.numResearchTokens > 0
            ) {
              moves.push({ move: 'collectResources', args: [key] });
            }
          }
        }

        if ("celestialBodyToken2" in currentLocation) {
          const doubleHex = currentLocation as DoubleTokenHexCell;
          const key = lookupKey(doubleHex.celestialBodyToken2!);
          if (config.tokenEffects && config.tokenEffects[key]) {
            let effects = config.tokenEffects[key];
            if (
              (G.shipStatus.armor < G.shipStatus.maxArmor && effects.armorChange > 0)
              || (G.shipStatus.energy < G.shipStatus.maxEnergy && effects.energyChange > 0 && G.shipStatus.armor + effects.armorChange >= 1)
              || effects.numResearchTokens > 0
            ) {
              moves.push({ move: 'collectResources', args: [key] });
            }
          }
        }
      }

      // 5. Enumerate doResearch moves
      if (!mustMoveShipOrPass) {
        Object.keys(config.researchTopics!).forEach(topicName => {
          const topic = config.researchTopics![topicName];
          const costIncrease = topic.costIncrease ? G.researchedCount[topicName] * topic.costIncrease : 0;
          const actualCost = topic.cost + costIncrease;
          if (G.shipStatus.numResearchTokens >= actualCost && (!topic.unlocksDeck || G.zoneDecks.find(d => d.isLocked))) {
            moves.push({ move: 'doResearch', args: [topicName] });
          }
        });
      }

      if (mustMoveShipOrPass) {
        moves.push({ move: 'pass', args: [] });
      }

      return moves;
    },
  },
  };
};