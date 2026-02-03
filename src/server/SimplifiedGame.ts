import { Game } from 'boardgame.io';
import { makeLightsInTheVoidGame, ZoneDeck, StarSystemCard, RoleCard, ItineraryCard } from '../Game';
import { CardLoader } from '../data/CardLoader';

export type TokenEffectsConfig = Record<string, { energyChange: number; armorChange: number; numResearchTokens: number }>;
export type ResearchTopicsConfig = Record<string, { name: string; description: string }>;

/**
 * Creates a simplified game variant for POC RL testing:
 * - 1 player
 * - 1 phase (5 rounds = 15 actions)
 * - Zone 1 cards only
 * - No role cards, no itinerary cards, no research topics
 * - Win threshold: 10 points (must survive and score)
 */
export async function createSimplifiedGame(): Promise<Game> {
  // Load star system cards (returns ZoneDeck[] organized by zone)
  const zoneDecks = await CardLoader.loadStarSystemCards();

  // Validate we have the required cards
  if (!zoneDecks[0] || zoneDecks[0].cards.length === 0) {
    throw new Error('No zone 0 cards found - cannot initialize game');
  }
  if (!zoneDecks[1] || zoneDecks[1].cards.length < 5) {
    throw new Error(`Not enough zone 1 cards (need at least 5, found ${zoneDecks[1]?.cards.length || 0})`);
  }

  // Validate zone 0 card has celestial body icons
  const zone0Card = zoneDecks[0].cards[zoneDecks[0].cards.length - 1]; // peek at last card (will be popped in setup)
  if (!zone0Card.celestialBodyIcons || zone0Card.celestialBodyIcons.length < 2) {
    throw new Error('Zone 0 card must have at least 2 celestial body icons');
  }

  // Create simplified decks (only zones 0 and 1 for POC)
  const decks: ZoneDeck[] = [
    { cards: [...zoneDecks[0].cards], isLocked: false },
    { cards: [...zoneDecks[1].cards], isLocked: false },
    { cards: [], isLocked: true }, // zone 2 - empty/locked
    { cards: [], isLocked: true }, // zone 3 - empty/locked
    { cards: [], isLocked: true }, // zone 4 - empty/locked
  ];

  // Empty role and itinerary cards for single player
  const roleCards: RoleCard[] = [
    { name: 'No Role', affectedAction: '' }
  ];

  const itineraryCards: ItineraryCard[] = [
    {
      name: 'No Itinerary',
      pointsPerItineraryIcon: 0,
      pointsPerMatchingCelestialBodyIcon: 0,
      matchingCelestialBodyIcons: [],
      zone1Percentage: 100,
      zone2Percentage: 0,
      zone3Percentage: 0,
      zone4Percentage: 0,
    }
  ];

  // Empty token effects and research topics
  const tokenEffects: TokenEffectsConfig = {};
  const researchTopics: ResearchTopicsConfig = {};

  // Create game with simplified config
  return makeLightsInTheVoidGame(
    decks,
    roleCards,
    itineraryCards,
    tokenEffects,
    researchTopics,
    1,  // numPlayers
    1,  // numPhases
    10  // winThreshold
  );
}
