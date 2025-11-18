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
  justDrawnCards: Card[];
  detectedStarSystems: Card[];
  shipLocation: string
  zoneDecks: Record<string, Card[]>;
  hexBoard: Record<string, HexCell>;
  reverseHexBoard: Record<string, string>;
}

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

type ItineraryIcon = { name: string, imageSrc: string };

export type Card = {
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

type HexCell = {
  cubeCoords: CubeCoords;
  token: any | null;
};

type CubeCoords = { q: number; r: number; s: number };

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
  let newCoords = getNeighborCoords(G.hexBoard[G.shipLocation].cubeCoords, dir);
  if (newCoords === null) {
    return INVALID_MOVE;
  }

  // use hexBoardReverse to get the new hex key
  let newHexKey = G.reverseHexBoard[`${newCoords.q},${newCoords.r},${newCoords.s}`];

  // Update the ship location to the new hex
  G.shipLocation = newHexKey;
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
  G.justDrawnCards = [drawnCard];
  if (G.detectedStarSystems.length < 5) {
    G.detectedStarSystems.push(drawnCard);
  } else {
    //TODO: implement setStage("discardDetectedStarSystem");
  }
}

export const makeLightsInTheVoidGame = (cards: Record<string, Card[]>): Game<LightsInTheVoidState> => ({
  setup: () => {
    const { hexes, reverseHexes } = generateHexes();
    return {
      shipLocation: "HOME",
      justDrawnCards: [],
      detectedStarSystems: Array.from({ length: 5 }, () => cards[1].pop()!),
      zoneDecks: cards,
      hexBoard: hexes,
      reverseHexBoard: reverseHexes,
    };
  },

  turn: {
    minMoves: 1,
    maxMoves: 1,
  },

  moves: {
    moveShip,
    drawCard,
  },

  // endIf: ({ G, ctx }) => {
  //   if (IsVictory(G.cells)) {
  //     return { winner: ctx.currentPlayer };
  //   }
  //   if (IsDraw(G.cells)) {
  //     return { draw: true };
  //   }
  // },

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
});