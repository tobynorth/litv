import { Client } from 'boardgame.io/client';
import { StarSystemCard, ItineraryCard, makeLightsInTheVoidGame } from './Game';
import { CardLoader } from './data/CardLoader';

class LightsInTheVoidClient {
  client: ReturnType<typeof Client>;
  constructor(starSystemCards: Record<string, StarSystemCard[]>, itineraryCards: ItineraryCard[]) {
    const litv = makeLightsInTheVoidGame(starSystemCards, itineraryCards);
    this.client = Client({ game: litv, numPlayers: 2 });
    this.client.start();
  }
}

Promise.all([
  CardLoader.loadStarSystemCards(),
  CardLoader.loadItineraryCards(2)
]).then(([starSystemCards, itineraryCards]) => {
  const app = new LightsInTheVoidClient(starSystemCards, itineraryCards);
});
