import { Client } from 'boardgame.io/client';
import { Card, makeLightsInTheVoidGame } from './Game';
import { CardLoader } from './data/CardLoader';

class LightsInTheVoidClient {
  client: ReturnType<typeof Client>;
  constructor(cards: Record<string, Card[]>) {
    const litv = makeLightsInTheVoidGame(cards);
    this.client = Client({ game: litv });
    this.client.start();
  }
}

let cards = CardLoader.loadCards().then((loadedCards) => {
  const app = new LightsInTheVoidClient(loadedCards);
});
