import { Card, StarSystemCard, RoleCard, ItineraryCard, ZoneDeck, TokenEffectsConfig, ResearchTopicsConfig } from '../Game';
import starSystemData from './star_system_cards.json';
import roleData from './role_cards.json';
import itineraryData from './itinerary_cards.json';
import tokenEffectsData from './celestial_body_token_types.json';
import researchTopicData from './research_topics.json'
const CDN_URL = "CDN_URL"; // TODO: set CDN URL

export class CardLoader {
  // Note: this is async in ancticipation of future fetching from CDN if local json file load fails
  // TODO: implement CDN fetch fallback
  static async loadStarSystemCards(): Promise<ZoneDeck[]> {
    let cardData = starSystemData.cards as StarSystemCard[];
    const zoneDecks: ZoneDeck[] = [];
    cardData.forEach(card => {
      const zone = card.zoneNumber;
      if (!zoneDecks[zone]) {
        zoneDecks[zone] = {"cards": [], "isLocked": zone > 1};
      }
      zoneDecks[zone].cards.push(card);
    });

    // Shuffle the cards in each zone
    for (const zoneDeck of zoneDecks) {
      zoneDeck.cards = this.shuffleArray(zoneDeck.cards) as StarSystemCard[];
    }

    // temporarily put the following cards on top of zone 1: Noquisi, Lalande 21185, Capella, Algol, and Gacrux
    const specialCardsTitles = ["Noquisi", "Lalande 21185", "Capella", "Algol", "Gacrux"];
    const specialCards: StarSystemCard[] = [];
    zoneDecks[1].cards = zoneDecks[1].cards.filter(card => {
      if (specialCardsTitles.includes(card.title)) {
        specialCards.push(card);
        return false;
      }
      return true;
    });
    // Place them in the desired order on top of the deck
    specialCards.forEach(card => {
      zoneDecks[1].cards.push(card);
    });

    return zoneDecks;
  }

  static async loadRoleCards(numPlayers: number): Promise<RoleCard[]> {
    let cardData = roleData.cards as RoleCard[];
    const shuffledCards = this.shuffleArray(cardData);
    return shuffledCards.slice(0, numPlayers) as RoleCard[];
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