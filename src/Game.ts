"use strict";

import { Game } from 'boardgame.io';

interface LightsInTheVoidState {
  cells: Array<string | null>;
}

export const LightsInTheVoid: Game<LightsInTheVoidState> = {
  setup: () => ({ cells: Array(9).fill(null) }),

  moves: {
    clickCell: ({ G, playerID }, id) => {
      G.cells[id] = playerID;
    },
  },
};