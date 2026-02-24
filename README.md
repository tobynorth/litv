# litv

Automated playtesting engine for an original board game about space exploration. Implements the full game headlessly with [boardgame.io](https://boardgame.io/), and runs parallel simulated games using determinized Monte Carlo Tree Search to calibrate difficulty.

## About

<img width="1500" height="842" alt="Lights in the Void: Coronal Loop" src="https://github.com/user-attachments/assets/0a6e5b57-dbd9-4a8e-874d-258f9af045b4" />

My wife and I are designing a physical board game, tentatively titled Lights in the Void: Coronal
Loop. Players work together to navigate a ship across the Milky Way, drawing from 200 unique cards representing real-life stars, planets, and other celestial bodies, and mapping them on the board as they go. This repo is currently a headless prototype of that game, built exclusively for automated playtesting.

## Status

WIP. The current MCTS implementation can score roughly 2/3 of what I as one of the game designers can score under the same starting conditions, which isn't yet reliable enough for difficulty calibration. Adding additional hand-crafted node selection heuristics to MCTS is time-consuming and increasingly risks overly biasing the AI toward my prior preconception of strategic play. Therefore, the next step is experimenting with a reinforcement learning approach (PPO) or evolutionary algorithm approach to see if these can more readily achieve higher scores.

Further down the road, another major potential improvement is creating a GUI to allow online play by people, not just automated testing by bots.

## Technical Highlights

- **MCTS AI** using custom node selection heuristics and handling hidden information through determinization sampling, inspired by [this research paper](https://studenttheses.uu.nl/bitstream/handle/20.500.12932/37736/Thesis_draft.pdf).
- **Parallel calibration tooling** using Node.js worker threads to run difficulty calibration simulations across multiple iterations
- **Hexagonal grid system** with two-way mapping between [cube coordinates](https://www.redblobgames.com/grids/hexagons/#coordinates-cube) and human-friendly coordinates

## Tech Stack

TypeScript, Node.js, Parcel, boardgame.io

## Getting Started

### Installation

```bash
npm install
```

### Starting the Dev Server

```bash
npm start
```

This launches the Parcel dev server and starts a new game in the browser. While there's no GUI for the game itself, boardgame.io automatically generates a debug panel that can be used to inspect raw game state, test game actions, and view a real-time MCTS visualization.

### Running AI Calibration

```bash
npm run calibrate
```

Executes parallel game simulations to calibrate difficulty by estimating a likely scoring range.

## Project Structure

```
src/
├── Game.ts                      # Core game state and moves (boardgame.io)
├── App.ts                       # Client setup
├── ai/
│   └── DeterminizedMCTSBot.ts  # MCTS AI with determinization
├── data/
│   └── CardLoader.ts           # Card data loading and deck management
├── calibrate.ts                # Parallel calibration script entry point
├── calibrate-worker.ts         # Worker thread for simulation tasks
└── calibrate-cli.ts            # CLI interface for calibration tool
```

## License

AGPL-3.0-or-later
