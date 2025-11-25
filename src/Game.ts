"use strict";

import { Game } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';

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
  zoneDecks: Record<string, StarSystemCard[]>;
  hexBoard: Record<string, HexCell>;
  reverseHexBoard: Record<string, string>;
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

type ItineraryIcon = { name: string, imageSrc: string };

export type Card = StarSystemCard | ItineraryCard;

export type StarSystemCard = {
  title: string;
  subtitle: string;
  imageSrc: string;
  flavorText: string;
  hexCoordinate: string;
  zoneNumber: number;
  radius: {
    unit: string;
    value: number;
  };
  distance: {
    unit: string;
    value: number;
  };
  celestialBodyIcons: CelestialBodyIcon[];
  itineraryIcons: ItineraryIcon[];
};

export type ItineraryCard = {
  name: string;
  fullName: string;
  flavorText: string;
  pointsPerItineraryIcon: number;
  pointsPerMatchingCelestialBodyIcon: number;
  matchingCelestialBodyIcons: CelestialBody[];
  zone1Percentage: number;
  zone2Percentage: number;
  zone3Percentage: number;
  zone4Percentage: number;
};

export type TokenEffects = {
  energyChange: number;
  armorChange: number;
  researchTokensChange: number;
};

export type TokenEffectsConfig = Record<string, TokenEffects>;

type HexCell = {
  cubeCoords: CubeCoords;
  token: CelestialBodyToken | null;
};

type CubeCoords = { q: number; r: number; s: number };

// Module-level variable to store token effects configuration
let tokenEffectsConfig: TokenEffectsConfig;

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
  let hexes: Record<string, HexCell> = {
    "HOME": {
      cubeCoords: { q: 0, r: 0, s: 0 },
      token: null,
    }
  };

  let reverseHexes: Record<string, string> = {
    "0,0,0": "HOME",
  };

  let sectorCurrentHexes: Record<string, HexCell> = {
    "A": { 
      cubeCoords: { q: -1, r: 0, s: 1 },
      token: null,
    },
    "B": { 
      cubeCoords: { q: 0, r: -1, s: 1 },
      token: null,
    },
    "C": { 
      cubeCoords: { q: 1, r: -1, s: 0 },
      token: null,
    },
    "D": { 
      cubeCoords: { q: 1, r: 0, s: -1 },
      token: null,
    },
    "E": { 
      cubeCoords: { q: 0, r: 1, s: -1 },
      token: null,
    },
    "F": { 
      cubeCoords: { q: -1, r: 1, s: 0 },
      token: null,
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

  let newQ = cubeCoords.q + dirOffset.q;
  let newR = cubeCoords.r + dirOffset.r;
  let newS = cubeCoords.s + dirOffset.s;

  // Check if out of bounds (more than 7 hexes from HOME)
  const distanceFromHome = Math.max(Math.abs(newQ), Math.abs(newR), Math.abs(newS));
  if (distanceFromHome > 7) return null;

  return { q: newQ, r: newR, s: newS };
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

export function playCard({ G, playerID }: { G: LightsInTheVoidState, playerID: string }, cardIndex: number) {
  if (
      cardIndex < 0
      || cardIndex >= G.detectedStarSystems.length
      || G.shipStatus.location !== G.detectedStarSystems[cardIndex].hexCoordinate
    ) {
    return INVALID_MOVE;
  }
  
  // Move card to played cards
  let cardToPlay = G.detectedStarSystems.splice(cardIndex, 1)[0];
  G.playedCards.push(cardToPlay);

  // Calculate base points from playing the card
  let points = cardToPlay.zoneNumber * 2 - 1;
  G.playerPoints[playerID] += points;

  // Calculate bonus points from itinerary card-itinerary icon matches
  cardToPlay.itineraryIcons.forEach(itineraryIcon => {
    Object.entries(G.playerItineraryCards).forEach(playerItineraryCard => {
      if (itineraryIcon.name === playerItineraryCard[1].name) {
        G.playerPoints[playerItineraryCard[0]] += playerItineraryCard[1].pointsPerItineraryIcon;
      }
    });
  });

  // Calculate bonus points from itinerary card-celestial body icon matches
  cardToPlay.celestialBodyIcons.forEach(celestialBodyIcon => {
    Object.entries(G.playerItineraryCards).forEach(playerItineraryCard => {
      playerItineraryCard[1].matchingCelestialBodyIcons.forEach(matchingIcon => {
        if (
          celestialBodyIcon.type === matchingIcon.type
          && (
            !("size" in celestialBodyIcon && "size" in matchingIcon)
            || celestialBodyIcon.size === matchingIcon.size
          )
        ) {
          G.playerPoints[playerItineraryCard[0]] += (playerItineraryCard[1].pointsPerMatchingCelestialBodyIcon * celestialBodyIcon.count);
        }
      });
    });
  });

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

  // place token on board
  G.hexBoard[G.shipStatus.location].token = token;
}

export function collectResources({ G }: { G: LightsInTheVoidState }) {
  const currentHex = G.hexBoard[G.shipStatus.location];
  const token = currentHex.token;

  // Return invalid if there's no token on the current hex
  if (!token) {
    return INVALID_MOVE;
  }

  // Build lookup key based on token type and size
  let lookupKey: string;
  if ("size" in token) {
    lookupKey = `${token.type}-${token.size}`;
  } else if (token.type === CelestialBodyType.Wormhole) {
    // Skip wormholes for now - they have special behavior
    return INVALID_MOVE;
  } else {
    lookupKey = token.type;
  }

  // Look up effects in config
  const effects = tokenEffectsConfig[lookupKey];
  if (!effects) {
    // No effects defined for this token type
    return INVALID_MOVE;
  }

  // Apply effects to ship status
  G.shipStatus.energy = Math.min(
    G.shipStatus.maxEnergy,
    G.shipStatus.energy + effects.energyChange
  );
  G.shipStatus.armor = Math.min(
    G.shipStatus.maxArmor,
    G.shipStatus.armor + effects.armorChange
  );
  G.shipStatus.numResearchTokens += effects.researchTokensChange;
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

export function PlayersLose(G: LightsInTheVoidState) {
  return G.shipStatus.armor <= 0 || G.shipStatus.energy <= 0;
}

function initializeTokenEffects(config: TokenEffectsConfig) {
  tokenEffectsConfig = config;
}

export const makeLightsInTheVoidGame = (
  cards: Record<string, StarSystemCard[]>,
  itineraryCards: ItineraryCard[],
  tokenEffectsConfigParam: TokenEffectsConfig
): Game<LightsInTheVoidState> => {
  // Initialize module-level config
  initializeTokenEffects(tokenEffectsConfigParam);

  return {
    setup: ({ ctx }) => {
    const { hexes, reverseHexes } = generateHexes();
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
      playerItineraryCards: Object.fromEntries(
        Array.from({ length: ctx.numPlayers }, (_, i) => [String(i), itineraryCards[i]])
      ),
      detectedStarSystems: Array.from({ length: 5 }, () => cards[1].pop()!),
      playerPoints: Object.fromEntries(
        Array.from({ length: ctx.numPlayers }, (_, i) => [String(i), 0])
      ),
      playedCards: [cards[0].pop()!],
      zoneDecks: cards,
      hexBoard: hexes,
      reverseHexBoard: reverseHexes,
    };
  },

  turn: {
    minMoves: 1,
    maxMoves: 1,
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
  },

  endIf: ({ G, ctx }) => {
    if (PlayersLose(G)) {
      return { players_lose: true };
    }
  },

  // ai: {
  //   enumerate: (G) => {
  //     let moves = [];
  //     for (let i = 0; i < 9; i++) {
  //       if (G.cells[i] === null) {
  //         moves.push({ move: 'clickCell', args: [i] });
  //       }
  //     }
  //     return moves;
  //   },
  // },
  };
};