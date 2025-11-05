import { Client } from 'boardgame.io/client';
import { LightsInTheVoid } from './Game';

class LightsInTheVoidClient {
  client: ReturnType<typeof Client>;
  constructor() {
    this.client = Client({ game: LightsInTheVoid });
    this.client.start();
  }
}

const app = new LightsInTheVoidClient();