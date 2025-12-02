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
  WhiteDwarf = "white-dwarf",
  BrownDwarf = "brown-dwarf",
  Nebula = "nebula",
  NeutronStar = "neutron-star",
  BlackHole = "black-hole",
  Wormhole = "wormhole",
  Any = "any",
}

enum CelestialBodySize {
  Normal = "normal",
  Giant = "giant",
  Supergiant = "super-giant",
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
  playerItineraryCards: Record<string, ItineraryCard>;
  detectedStarSystems: StarSystemCard[];
  shipStatus: ShipStatus;
  playerPoints: Record<string, number>;
  playedCards: StarSystemCard[];
  playerSubIconCollections: Record<string, Record<string, string[]>>;
  zoneDecks: Record<string, StarSystemCard[]>;
  hexBoard: Record<string, HexCell>;
  reverseHexBoard: Record<string, string>;
  phasePointTotals: number[];
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

export type Card = StarSystemCard | ItineraryCard;

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
  maxEnergyChange: number;
  maxArmorChange: number;
  speedChange: number;
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

export function moveShip({ G }: { G: LightsInTheVoidState }, dir: Direction) {
  let newCoords = getNeighborCoords(G.hexBoard[G.shipStatus.location].cubeCoords, dir);
  if (newCoords === null) {
    return INVALID_MOVE;
  }

  // use hexBoardReverse to get the new hex key
  let newHexKey = G.reverseHexBoard[`${newCoords.q},${newCoords.r},${newCoords.s}`];

  // Update the ship location to the new hex
  G.shipStatus.location = newHexKey;
  G.shipStatus.energy -= 1;
};

export function drawCard({ G }: { G: LightsInTheVoidState }, zoneNumber: number) {
  if (zoneNumber < 1 || zoneNumber > Object.keys(G.zoneDecks).length) {
    return INVALID_MOVE;
  }
  const zoneDeck = G.zoneDecks[zoneNumber];
  if (zoneDeck.length === 0) {
    return INVALID_MOVE;
  }
  let drawnCard = zoneDeck.pop()!;
  if (G.detectedStarSystems.length >= 5) {
    // just auto-discard the oldest detected star system
    // TODO: replace with proper discard logic later
    G.detectedStarSystems.shift();
  }
  G.detectedStarSystems.push(drawnCard);
}

export function playCard({ G, playerID }: { G: LightsInTheVoidState, playerID: string }, cardTitle: string) {
  let cardToPlayIndex = G.detectedStarSystems.findIndex(c => c.title === cardTitle);
  if (
      cardToPlayIndex === -1
      || G.shipStatus.location !== G.detectedStarSystems[cardToPlayIndex].hexCoordinate
    ) {
    return INVALID_MOVE;
  }
  
  // Move card to played cards
  let cardToPlay = G.detectedStarSystems.splice(cardToPlayIndex, 1)[0];
  G.playedCards.push(cardToPlay);

  // Calculate base points from playing the card
  let points = cardToPlay.zoneNumber * 2 - 1;
  G.playerPoints[playerID] += points;

  // Calculate bonus points from itinerary matches
  awardItineraryBonusPoints(cardToPlay, G.playerItineraryCards, G.playerPoints, G.playerSubIconCollections);

  // Randomly choose icon to play as token based on card's celestialBodyIcons
  // TODO: allow player to choose which icon to play instead of random
  let iconIndex = Math.floor(Math.random() * cardToPlay.celestialBodyIcons.length);
  let selectedIcon = cardToPlay.celestialBodyIcons[iconIndex];

  // If selectedIcon is of type 'any', randomly choose a concrete type. Otherwise, just place a token of that type.
  let tokenType;
  let token: CelestialBodyToken;
  if (selectedIcon.type === CelestialBodyType.Any) {
    const concreteTypes: AllowedAnyIconType[] = [
      CelestialBodyType.Red,
      CelestialBodyType.Orange,
      CelestialBodyType.Yellow,
      CelestialBodyType.White,
      CelestialBodyType.Blue,
    ];
    tokenType = concreteTypes[Math.floor(Math.random() * concreteTypes.length)];
    token = { type: tokenType, size: CelestialBodySize.Normal };
  } else if ("size" in selectedIcon) {
    token = { type: selectedIcon.type, size: selectedIcon.size };
  } else {
    token = { type: selectedIcon.type };
  }

  // place celestial body token + any research tokens on board
  let currHex = G.hexBoard[G.shipStatus.location];
  currHex.celestialBodyToken = token;
  currHex.numResearchTokens = config.tokenEffects![lookupKey(token)].numResearchTokens;
}

export function collectResources({ G }: { G: LightsInTheVoidState }, tokenToCollectFromKey: string) {
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

  // Apply energy & armor effects to ship status
  let status = G.shipStatus;
  status.energy = Math.min(
    status.maxEnergy,
    status.energy + effects.energyChange
  );
  status.armor = Math.min(
    status.maxArmor,
    status.armor + effects.armorChange
  );

  // collect any research tokens on the hex
  status.numResearchTokens += G.hexBoard[status.location].numResearchTokens;
  G.hexBoard[status.location].numResearchTokens = 0;
}

export function doResearch({ G }: { G: LightsInTheVoidState }, researchTopicName: string) {
  let researchTopic = config.researchTopics?.[researchTopicName];
  let status = G.shipStatus;
  if (!researchTopic || status.numResearchTokens < researchTopic.cost) {
    return INVALID_MOVE;
  }
  status.numResearchTokens -= researchTopic.cost;
  status.maxEnergy += researchTopic.maxEnergyChange;
  status.maxArmor += researchTopic.maxArmorChange;
  status.speed += researchTopic.speedChange;
}

function lookupKey(token: CelestialBodyToken): string {
  // Build lookup key based on token type and size
  if ("size" in token) {
    return `${token.type}-${token.size}`;
  } else {
    return token.type;
  }
}

// Helper function to award bonus points based on itinerary card matches
function awardItineraryBonusPoints(
  card: StarSystemCard,
  playerItineraryCards: Record<string, ItineraryCard>,
  playerPoints: Record<string, number>,
  playerSubIconCollections: Record<string, Record<string, string[]>>
) {
  // Award bonus points for itinerary icon matches
  card.itineraryIcons.forEach(itineraryIcon => {
    Object.entries(playerItineraryCards).forEach(([playerID, itineraryCard]) => {
      if (itineraryIcon.name === itineraryCard.name) {
        playerPoints[playerID] += itineraryCard.pointsPerItineraryIcon;

        if (itineraryIcon.subicon && itineraryCard.subicons && itineraryCard.subIconStrategy) {
          const subicon = itineraryIcon.subicon;

          if (subicon && itineraryCard.subicons.includes(subicon)) {
            // Initialize tracking if not exists
            if (!playerSubIconCollections[playerID]) {
              playerSubIconCollections[playerID] = {};
            }
            if (!playerSubIconCollections[playerID][itineraryCard.name]) {
              playerSubIconCollections[playerID][itineraryCard.name] = [];
            }

            let collection = playerSubIconCollections[playerID][itineraryCard.name];

            if (itineraryCard.subIconStrategy === 'incremental') {
              // Famous Constellations: Award +1 bonus point for each matching subicon already collected
              const bonus = collection.filter(s => s === subicon).length;
              playerPoints[playerID] += bonus;
              // Track this subicon
              collection.push(subicon);
            } else if (itineraryCard.subIconStrategy === 'set-completion' && itineraryCard.setSize && itineraryCard.pointsPerSubIconSet) {
              // Travel the World: Award bonus for each completed set of 6
              // First add the new subicon
              collection.push(subicon);

              // Check if we have enough unique subicons and if this card completed a new set
              const uniqueSubicons = new Set(collection);
              if (uniqueSubicons.size % itineraryCard.setSize === 0) {
                playerPoints[playerID] += itineraryCard.pointsPerSubIconSet;
              }
            }
          }
        }
      }
    });
  });

  // Award bonus points for celestial body icon matches
  Object.entries(playerItineraryCards).forEach(([playerID, itineraryCard]) => {
    if (itineraryCard.matchingCelestialBodyIcons.length === 0) {
      return;
    }

    // handle 1st set of matching icons
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
          numMatchingIcons += celestialBodyIcon.count
        }
      });
    });
    if (numMatchingIcons >= minimumMatchingIcons) {
      playerPoints[playerID] += (itineraryCard.pointsPerMatchingCelestialBodyIcon * numMatchingIcons);
    }

    // handle 2nd set of matching icons (with different # of points)
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
            numMatchingIcons += celestialBodyIcon.count
          }
        });
      });
      if (numMatchingIcons >= minimumMatchingIcons) {
        playerPoints[playerID] += (itineraryCard.pointsPerMatchingCelestialBodyIcon2 * numMatchingIcons);
      }
    }
  });
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

export const makeLightsInTheVoidGame = (
  cards: Record<string, StarSystemCard[]>,
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
    const zone0Card = cards[0].pop()!;

    // Initialize player itinerary cards
    const playerItineraryCards = Object.fromEntries(
      Array.from({ length: ctx.numPlayers }, (_, i) => [String(i), itineraryCards[i]])
    );

    // Initialize player points to 0
    const playerPoints: Record<string, number> = Object.fromEntries(
      Array.from({ length: ctx.numPlayers }, (_, i) => [String(i), 0])
    );

    // Initialize player subicon collections
    const playerSubIconCollections: Record<string, Record<string, string[]>> = {};

    // Award bonus points for Zone 0 card matches (no base points since no one played it)
    awardItineraryBonusPoints(zone0Card, playerItineraryCards, playerPoints, playerSubIconCollections);

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

    return {
      shipStatus: {
        location: "HOME",
        energy: 5,
        maxEnergy: 5,
        armor: 5,
        maxArmor: 5,
        numResearchTokens: 0,
        speed: 1,
      },
      playerItineraryCards: playerItineraryCards,
      detectedStarSystems: Array.from({ length: 5 }, () => cards[1].pop()!),
      playerPoints: playerPoints,
      playedCards: [zone0Card],
      zoneDecks: cards,
      hexBoard: hexes,
      reverseHexBoard: reverseHexes,
      phasePointTotals: [],
      playerSubIconCollections: playerSubIconCollections,
    };
  },

  turn: {
    minMoves: 1,
    maxMoves: 3,
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
          events.endGame({ playersWin: true, score: cumulativePoints });
        } else {
          events.endGame({ playersLose: true, score: cumulativePoints });
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
  },

  endIf: ({ G, ctx }) => {
    // Check for early loss condition (ship destroyed)
    if (ShipDestroyed(G)) {
      const cumulativePoints = G.phasePointTotals.reduce((sum, total) => sum + total, 0);
      return { playersLose: true, score: cumulativePoints };
    }
  },

  ai: {
    enumerate: (G) => {
      let moves: AiEnumerate = [];

      // 1. Enumerate moveShip moves
      const currentLocation = G.hexBoard[G.shipStatus.location];

      if (G.shipStatus.energy > 1) {
        const currentCoords = currentLocation.cubeCoords;
        Object.values(Direction).forEach(dir => {
          const neighborCoords = getNeighborCoords(currentCoords, dir);
          if (neighborCoords !== null) {
            // Only allow AI to move to current neighbor cell if it moves the ship closer to a detected star system card
            let closerNeighborFound = false;
            for (const detectedStarSystem of G.detectedStarSystems) {
              let currHexDist = getDistance(G.hexBoard[G.shipStatus.location].cubeCoords, neighborCoords);
              let neighborHexDist = getDistance(G.hexBoard[detectedStarSystem.hexCoordinate].cubeCoords, neighborCoords);
              if (neighborHexDist < currHexDist) {
                closerNeighborFound = true;
                break;
              }
            }
            if (closerNeighborFound) {
              moves.push({ move: 'moveShip', args: [dir] });
            }
          }
        });
      }

      // 2. Enumerate playCard moves
      G.detectedStarSystems.forEach((card) => {
        if (G.shipStatus.location === card.hexCoordinate) {
          moves.push({ move: 'playCard', args: [card.title] });
        }
      });

      // 3. Enumerate drawCard moves
      Object.keys(G.zoneDecks).forEach(zoneNumStr => {
        const zoneNum = parseInt(zoneNumStr);
        if (G.zoneDecks[zoneNum].length > 0) {
          moves.push({ move: 'drawCard', args: [zoneNum] });
        }
      });

      // 4. Enumerate collectResources moves
      if (currentLocation.celestialBodyToken) {
        const key = lookupKey(currentLocation.celestialBodyToken);
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

      // 5. Enumerate doResearch moves
      Object.keys(config.researchTopics!).forEach(topicName => {
        const topic = config.researchTopics![topicName];
        if (G.shipStatus.numResearchTokens >= topic.cost) {
          moves.push({ move: 'doResearch', args: [topicName] });
        }
      });
      return moves;
    },
  },
  };
};