# SPEC: RL POC (Phase 0) - Proof of Concept for RL Feasibility

**ID:** 001
**Status:** Draft
**Created:** 2026-02-02
**PRD:** ./001_use_rl_PRD.md
**Execution Mode:** human-in-the-loop
**New Agent Per Phase:** yes
**Max Review Attempts:** 3

## Context

We need to validate that RL can learn this game before investing in the full calibration system. The POC uses the simplest possible configuration: 1 player, 1 phase, zone 1 cards only, no roles/itineraries/research.

**Existing infrastructure**:
- `src/Game.ts` - boardgame.io game with all moves and state definitions
- `src/calibrate.ts` - demonstrates headless execution pattern using `Client({ game })`
- `game.ai.enumerate(G, ctx)` - returns valid moves (but heuristic-filtered, not exhaustive)

**Key game mechanics for POC**:
- Ship starts at HOME with energy=5, armor=5, speed=2
- 3 actions per turn, 5 rounds per phase = 15 actions total
- Moves: moveShip (costs 1 energy), drawCard, playCard (scores points), collectResources, pass
- Game over if energy or armor reaches 0

## Approach

1. Create Express HTTP server wrapping boardgame.io headless Client
2. Implement stable action encoding (integer IDs) with exhaustive enumeration
3. Implement fixed-size state vector encoding (128 features)
4. Build Python Gymnasium environment with action masking
5. Train MaskablePPO and compare to random baseline

**Architecture**: Node.js server ←HTTP→ Python Gymnasium ←→ stable-baselines3 MaskablePPO

## Phases

---

### Phase 1: Headless HTTP Server

**Goal:** Create Express server exposing game logic via HTTP API for Python integration.

**Tasks:**

- [x] Add express dependency to package.json
- [x] Create `src/server/index.ts` - Express server entry point (port 3001)
- [x] Create `src/server/GameSession.ts` - Wraps boardgame.io Client for single game
- [x] Create `src/server/SimplifiedGame.ts` - POC variant: 1 player, 1 phase, no roles/itineraries/research
- [x] Implement `POST /reset` - Creates new game, returns initial state
- [x] Implement `POST /step` - Executes action, returns new state + reward + done
- [x] Implement `GET /state` - Returns current state (for debugging)
- [x] Add `npm run server` script to package.json

**API Specification:**
```
POST /reset
  Response: { state: number[], validActions: number[], done: false }

POST /step
  Body: { action: number }
  Response: { state: number[], reward: number, done: boolean, validActions: number[], info: object }

GET /state
  Response: { state: number[], validActions: number[], done: boolean }
```

**Verification:**

- [x] `npm run server` starts without errors
- [x] `curl -X POST http://localhost:3001/reset` returns valid JSON
- [x] `curl -X POST http://localhost:3001/step -d '{"action":0}'` executes action
- [x] Server handles invalid actions gracefully (returns error, doesn't crash)
- [x] Codebase builds without TypeScript errors

**Commit:** `[001][P1] Feature: Add headless HTTP server for RL integration`

**Notes:**

Key files to reference:
- `src/calibrate.ts:40-80` - headless Client pattern
- `src/Game.ts:LightsInTheVoidState` - state interface
- `src/Game.ts:makeLightsInTheVoidGame` - game factory function

---

### Phase 2: Action Encoding System

**Goal:** Create stable bidirectional mapping between game moves and integer action IDs.

**Tasks:**

- [x] Create `src/server/ActionEncoder.ts` with ActionEncoder class
- [x] Define static action space (~198 actions total):
  - moveShip to each hex (indexed 0-168 by hex key, masked by distance)
  - playCard for each hand slot × token slot combination (20)
  - drawCard (with optional discard slot if hand full) (6)
  - collectResources for each token slot at current hex (2)
  - pass (always available) (1)
- [x] Implement `encodeAction(move: string, args: any[]): number`
- [x] Implement `decodeAction(actionId: number, state: GameState): {move, args}`
- [x] Implement `getValidActionMask(state: GameState): boolean[]`
- [x] Implement exhaustive action enumeration (all legal moves, not heuristic-filtered)
- [x] Integrate ActionEncoder into server endpoints

**Action Space Layout (example):**
```
0-168:    moveShip to hex index N (hexes sorted by key alphabetically)
          - Action masked as invalid if hex is >speed distance from current position
          - Decoder computes direction sequence to reach target hex
169-188:  playCard (slot 0-4) × (token 0-3) = 20 combinations
189:      drawCard zone 1 (no discard needed)
190-194:  drawCard zone 1 + discard slot 0-4
195-196:  collectResources from token at current hex (0-1, 2 at HOME)
197:      pass
```

**Design Decision: Target Hex vs Direction Sequences**

We use **target hex** encoding for moveShip actions (not direction sequences) because:
1. **No redundant actions**: Multiple direction sequences can reach the same hex (e.g., [W, NW] vs [NW, W]). Target hex eliminates this redundancy.
2. **Cleaner learning signal**: Agent learns "where to be" not "how to get there"
3. **Energy cost is per-call**: `moveShip` costs 1 energy regardless of path length (Game.ts:339)
4. **MaskablePPO handles large masked spaces well**: ~169 hex IDs with ~7-19 valid at any time

**Decoder implementation**: When converting action ID → game move, compute any valid direction sequence from current position to target hex using simple greedy pathfinding (no obstacles in this game). This is already implemented as part of ai.enumerate in Game.ts, so that code can be refactored as needed.

**Design Decision: Slot-based playCard Actions**

playCard actions map to (hand_slot, token_slot) tuples, not specific cards/tokens. This is the standard pattern for RL with hands/inventories:
- **State** encodes what's in each slot (card features: position, distance, points)
- **Action** says "play from slot N with token M"
- Neural network learns to correlate slot contents (state) with slot selection (action)
- No need for stable card identity - only stable slot indexing matters

**Verification:**

- [x] Every valid move at any state encodes to unique integer
- [x] Every encoded integer decodes back to same move + args
- [x] Action mask has exactly `actionSpaceSize` elements (198)
- [x] Action mask[i] = true IFF action i is legal in current state
- [x] `/reset` and `/step` return correct `validActions` array
- [x] An integer ID for "moveShip to X hex" that is encoded and decoded returns the original ID for all reachable positions, where "encode" means convert into a sequence of directions that Game.ts/moveShip can take as input, and "decode" means do the reverse

**Commit:** `[001][P2] Feature: Add action encoding system for RL`

**Notes:**

Use stable hex ordering (sort by key alphabetically) to ensure action IDs are consistent across sessions.

---

### Phase 3: State Encoding System

**Goal:** Encode game state as fixed-size normalized vector (128 features) for neural network input.

**Tasks:**

- [x] Create `src/server/StateEncoder.ts` with StateEncoder class
- [x] Define feature layout (document indices in comments):
  - Global: round, actions_this_turn, energy, armor, ship_position (q,r,s), points (8 features)
  - Hand cards: 5 slots × 10 features (exists, hex q/r/s, distance, base_points, token_type_0-3) (50 features)
  - Board tokens: distance to nearest of each token type (24 types)
  - Current hex: token presence and effects
  - Padding to 128 features
- [x] Implement `encodeState(state: GameState): number[]`
- [x] Normalize all features to [0,1] or [-1,1] range
- [x] Handle edge cases: empty hand slots, no tokens on board
- [x] Integrate StateEncoder into server endpoints

**Feature Vector Layout (128 features):**
```
[0-6]:    Global state (round, actions, energy, armor, ship q/r/s, points) - 7 features
[7-56]:   Hand cards (5 slots × 10 features) - 50 features
          Per-slot features:
          - exists (0 or 1)
          - hex q/r/s (normalized coords of card's target hex)
          - distance (from ship to card's hex, normalized)
          - base_points (zone×2 - 1, normalized)
          - token_type_0..3 (token type indices for this card's 1-4 options, 0=empty)
[57-78]:  Token distances (22 token types × 1 feature) - 22 features
[79-82]:  Current hex state (has_token, energy_effect, armor_effect, has_second_token) - 4 features
[83-127]: Padding (zeros) - 45 features
```

**Token type encoding for cards:**
Each card can place 1-4 different token types. We encode these as 4 normalized indices (token_type_0..3):
- 0 = empty slot (card has fewer than this many token options)
- 1-22 = token type index (normalized to [0,1] range as index/22)
This lets the agent know which playCard(slot, token_option) actions are valid.

**Removed features (redundant/irrelevant):**
- `hand_size`: Redundant with 5 "exists" features (sum of exists = hand_size)
- `zone`: Redundant with `base_points` (points = zone×2 - 1, zone doesn't affect other mechanics)
- `deck_remaining`: Irrelevant for POC gameplay decisions

**Verification:**

- [x] `encodeState()` always returns exactly 128 floats
- [x] All values in range [-1, 1]
- [x] Initial state encodes without errors
- [x] State changes appropriately after actions (energy decreases after moveShip, etc.)
- [x] Same game state always produces same encoding

**Commit:** `[001][P3] Feature: Add state encoding system for RL`

**Notes:**

Normalization ranges:
- Coordinates: q,r,s each in [-7, 7] → normalize by /7
- Energy/armor: [0, max] → normalize by /max
- Distances: [0, 14] → normalize by /14 (max board distance)

**Implementation notes:**
- Actual feature layout: [0-7] global (8 features), [8-57] hand (50 features), [58-81] tokens (24 features), [82-85] current hex (4 features), [86-127] padding (42 features)
- Token type count corrected from 22 to 24 (actual count from celestial_body_token_types.json)
- Global features count corrected from 7 to 8 (q, r, s are separate features)

---

### Phase 4: Python Gymnasium Environment

**Goal:** Create Python environment conforming to Gymnasium interface with action masking.

**Tasks:**

- [ ] Create `python/` directory structure
- [ ] Create `python/requirements.txt` with dependencies
- [ ] Create `python/litv_env/__init__.py` - package init
- [ ] Create `python/litv_env/api_client.py` - HTTP client for Node.js server
- [ ] Create `python/litv_env/litv_env.py` - Gymnasium environment class
- [ ] Implement `reset(seed=None)` → (observation, info)
- [ ] Implement `step(action)` → (observation, reward, terminated, truncated, info)
- [ ] Implement `action_masks()` → boolean array for MaskablePPO
- [ ] Implement reward function: points_gained - death_penalty - step_cost
- [ ] Create `python/test_env.py` - manual test script

**Environment Specification:**
```python
observation_space = Box(low=-1, high=1, shape=(128,), dtype=np.float32)
action_space = Discrete(198)  # Match server action space size (169 hexes + 20 playCard + 6 drawCard + 2 collectResources + 1 pass)

def step(action) -> (obs, reward, terminated, truncated, info):
    # reward = points_gained
    # if death: reward -= 50
    # reward -= 0.01 (step cost)
```

**Verification:**

- [ ] Environment passes `gymnasium.utils.env_checker.check_env()`
- [ ] `env.reset()` returns valid observation shape (128,)
- [ ] `env.step(valid_action)` returns 5-tuple with correct types
- [ ] `env.action_masks()` returns boolean array matching action space
- [ ] Random agent can complete 10 full games without crashes

**Commit:** `[001][P4] Feature: Add Python Gymnasium environment`

**Notes:**

Dependencies (requirements.txt):
```
gymnasium>=0.29.0
numpy>=1.24.0
requests>=2.31.0
```

---

### Phase 5: Training and Evaluation

**Goal:** Train MaskablePPO agent and demonstrate learning vs random baseline.

**Tasks:**

- [ ] Add stable-baselines3 and sb3-contrib to requirements.txt
- [ ] Create `python/train.py` - training script with MaskablePPO
- [ ] Create `python/evaluate.py` - evaluation script (survival rate, avg score)
- [ ] Create `python/random_baseline.py` - random agent for comparison
- [ ] Configure PPO hyperparameters (lr=3e-4, batch=64, net=[64,64])
- [ ] Add TensorBoard logging for training curves
- [ ] Implement checkpoint saving every 25K timesteps
- [ ] Run training for 100K timesteps
- [ ] Generate comparison report: trained vs random

**Training Configuration:**
```python
MaskablePPO(
    "MlpPolicy",
    env,
    learning_rate=3e-4,
    n_steps=2048,
    batch_size=64,
    n_epochs=10,
    gamma=0.99,
    ent_coef=0.01,
    policy_kwargs={"net_arch": [64, 64]},
    tensorboard_log="./logs/",
    verbose=1
)
```

**Verification:**

- [ ] Training runs for 100K timesteps without crashes
- [ ] TensorBoard shows learning curve (reward increasing over time)
- [ ] Trained agent survives >50% of 100 test games (random: ~10-20%)
- [ ] Trained agent scores >2 avg points over 100 games (random: ~0-1)
- [ ] Model checkpoint saved to `models/poc_100k.zip`

**Commit:** `[001][P5] Feature: Add PPO training and evaluation scripts`

**Notes:**

Run commands:
```bash
# Terminal 1: Start server
npm run server

# Terminal 2: Train
cd python && pip install -r requirements.txt
python train.py --timesteps 100000

# Evaluate
python evaluate.py --model models/poc_100k.zip --episodes 100
python random_baseline.py --episodes 100
```

---

## Final Verification

- [ ] All phases complete
- [ ] POC success criteria met:
  - [ ] Agent survives >50% of games
  - [ ] Agent scores >2 points average
  - [ ] Training shows improvement within 100K timesteps
- [ ] Server + Python environment work end-to-end
- [ ] Comparison report shows trained agent beats random baseline

## Execution Log

| Phase | Status | Commit | Notes |
|-------|--------|--------|-------|

## Retrospective

[Fill in after completion]

### What worked well?

### What was harder than expected?

### What would we do differently next time?
