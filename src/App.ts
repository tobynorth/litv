import { Client } from 'boardgame.io/client';
import { StarSystemCard, ItineraryCard, TokenEffectsConfig, makeLightsInTheVoidGame } from './Game';
import { CardLoader } from './data/CardLoader';

class LightsInTheVoidClient {
  client: ReturnType<typeof Client>;
  constructor(
    starSystemCards: Record<string, StarSystemCard[]>,
    itineraryCards: ItineraryCard[],
    tokenEffectsConfig: TokenEffectsConfig
  ) {
    const litv = makeLightsInTheVoidGame(starSystemCards, itineraryCards, tokenEffectsConfig);
    this.client = Client({ game: litv, numPlayers: 2 });
    this.client.start();
  }
}

Promise.all([
  CardLoader.loadStarSystemCards(),
  CardLoader.loadItineraryCards(2),
  CardLoader.loadTokenEffects()
]).then(([starSystemCards, itineraryCards, tokenEffectsConfig]) => {
  const app = new LightsInTheVoidClient(starSystemCards, itineraryCards, tokenEffectsConfig);
});
