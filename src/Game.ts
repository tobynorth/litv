"use strict";

import { Game } from 'boardgame.io';
//import { INVALID_MOVE } from 'boardgame.io/core';

interface LightsInTheVoidState {
  hexBoard: Record<string, HexCell>;
}

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
  var hexes: Record<string, HexCell> = {
    "HOME": {
      cubeCoords: { q: 0, r: 0, s: 0 },
      token: null,
    }
  };

  var sectorCurrentHexes: Record<string, HexCell> = {
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
  var direction = -1;
  for (let c = "A".charCodeAt(0); c <= "F".charCodeAt(0); c++) {
    const letter = String.fromCharCode(c);
    var currHex = sectorCurrentHexes[letter];
    var currCoords = currHex.cubeCoords;
    var posC: keyof CubeCoords = currCoords.q > 0 ? "q" : (currCoords.r > 0 ? "r" : "s"),
          negC: keyof CubeCoords = currCoords.q < 0 ? "q" : (currCoords.r < 0 ? "r" : "s"),
          zeroC: keyof CubeCoords = currCoords.q === 0 ? "q" : (currCoords.r === 0 ? "r" : "s");

    for (let i = 1; i <= 28; i++) {
      const key = `${letter}${i}`;
      hexes[key] = structuredClone(currHex);

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

  return hexes;
}

export const LightsInTheVoid: Game<LightsInTheVoidState> = {
  setup: () => ({
    hexBoard: generateHexes(),
  }),

  turn: {
    minMoves: 1,
    maxMoves: 1,
  },

  // moves: {
  //   clickCell: ({ G, playerID }, id) => {
  //     if (G.cells[id] !== null) {
  //       return INVALID_MOVE;
  //     }
  //     G.cells[id] = playerID;
  //   },
  // },

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
};