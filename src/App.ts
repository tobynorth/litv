import { Client } from 'boardgame.io/client';
import { StarSystemCard, ItineraryCard, TokenEffectsConfig, makeLightsInTheVoidGame, ResearchTopicsConfig } from './Game';
import { CardLoader } from './data/CardLoader';

const NUM_PLAYERS = 2;
const NUM_PHASES = 1;
const WIN_THRESHOLD = 25 * NUM_PLAYERS * NUM_PHASES;

class LightsInTheVoidClient {
  client: ReturnType<typeof Client>;
  constructor(
    starSystemCards: Record<string, StarSystemCard[]>,
    itineraryCards: ItineraryCard[],
    tokenEffectsConfig: TokenEffectsConfig,
    researchTopics: ResearchTopicsConfig,
  ) {
    const litv = makeLightsInTheVoidGame(
      starSystemCards,
      itineraryCards,
      tokenEffectsConfig,
      researchTopics,
      NUM_PLAYERS,
      NUM_PHASES,
      WIN_THRESHOLD,
    );
    this.client = Client({ game: litv, numPlayers: NUM_PLAYERS });
    this.client.start();
  }
}

Promise.all([
  CardLoader.loadStarSystemCards(),
  CardLoader.loadItineraryCards(NUM_PLAYERS),
  CardLoader.loadTokenEffects(),
  CardLoader.loadResearchTopics(),
]).then(([starSystemCards, itineraryCards, tokenEffectsConfig, researchTopics]) => {
  const app = new LightsInTheVoidClient(starSystemCards, itineraryCards, tokenEffectsConfig, researchTopics);
});
