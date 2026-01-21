import { Client } from 'boardgame.io/client';
import { StarSystemCard, RoleCard, ItineraryCard, TokenEffectsConfig, makeLightsInTheVoidGame, ResearchTopicsConfig, ZoneDeck } from './Game';
import { CardLoader } from './data/CardLoader';

const NUM_PLAYERS = 2;
const NUM_PHASES = 1;
const WIN_THRESHOLD = 10 * NUM_PLAYERS * NUM_PHASES;

class LightsInTheVoidClient {
  client: ReturnType<typeof Client>;
  constructor(
    starSystemCards: ZoneDeck[],
    roleCards: RoleCard[],
    itineraryCards: ItineraryCard[],
    tokenEffectsConfig: TokenEffectsConfig,
    researchTopics: ResearchTopicsConfig,
  ) {
    const litv = makeLightsInTheVoidGame(
      starSystemCards,
      roleCards,
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
  CardLoader.loadRoleCards(NUM_PLAYERS),
  CardLoader.loadItineraryCards(NUM_PLAYERS),
  CardLoader.loadTokenEffects(),
  CardLoader.loadResearchTopics(),
]).then(([starSystemCards, roleCards, itineraryCards, tokenEffectsConfig, researchTopics]) => {
  const app = new LightsInTheVoidClient(starSystemCards, roleCards, itineraryCards, tokenEffectsConfig, researchTopics);
});
