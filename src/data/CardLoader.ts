import { Card } from '../Game';
import data from './star_system_cards.json';
const CDN_URL = "CDN_URL"; // TODO: set CDN URL

export class CardLoader {
  // Note: this is async in ancticipation of future fetching from CDN if local json file load fails
  // TODO: implement CDN fetch fallback
  static async loadCards(): Promise<Record<string, Card[]>> {
    let cardData = data.cards as Card[];
    const zoneDecks: Record<string, Card[]> = {};
    cardData.forEach(card => {
      const zone = card.zoneNumber;
      if (!zoneDecks[zone]) {
        zoneDecks[zone] = [];
      }
      zoneDecks[zone].push(card);
    });

    // Shuffle the cards in each zone
    Object.keys(zoneDecks).forEach(zone => {
      zoneDecks[zone] = this.shuffleArray(zoneDecks[zone]);
    });

    return zoneDecks;
  }

  private static shuffleArray(array: Card[]): Card[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}