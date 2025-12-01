import { Card, StarSystemCard, ItineraryCard, TokenEffectsConfig, ResearchTopicsConfig } from '../Game';
import starSystemData from './star_system_cards.json';
import itineraryData from './itinerary_cards.json';
import tokenEffectsData from './celestial_body_token_types.json';
import researchTopicData from './research_topics.json'
const CDN_URL = "CDN_URL"; // TODO: set CDN URL

export class CardLoader {
  // Note: this is async in ancticipation of future fetching from CDN if local json file load fails
  // TODO: implement CDN fetch fallback
  static async loadStarSystemCards(): Promise<Record<string, StarSystemCard[]>> {
    let cardData = starSystemData.cards as StarSystemCard[];
    const zoneDecks: Record<string, StarSystemCard[]> = {};
    cardData.forEach(card => {
      const zone = card.zoneNumber;
      if (!zoneDecks[zone]) {
        zoneDecks[zone] = [];
      }
      zoneDecks[zone].push(card);
    });

    // Shuffle the cards in each zone
    Object.keys(zoneDecks).forEach(zone => {
      zoneDecks[zone] = this.shuffleArray(zoneDecks[zone]) as StarSystemCard[];
    });

    return zoneDecks;
  }

  static async loadItineraryCards(numPlayers: number): Promise<ItineraryCard[]> {
    let cardData = itineraryData.cards as ItineraryCard[];
    const shuffledCards = this.shuffleArray(cardData);
    return shuffledCards.slice(0, numPlayers) as ItineraryCard[];
  }

  static async loadTokenEffects(): Promise<TokenEffectsConfig> {
    return tokenEffectsData as TokenEffectsConfig;
  }

  static async loadResearchTopics(): Promise<ResearchTopicsConfig> {
    return researchTopicData as ResearchTopicsConfig;
  }

  private static shuffleArray(array: Card[]): Card[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}