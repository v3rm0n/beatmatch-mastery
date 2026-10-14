export const DECK_IDS = ["A", "B"] as const;
export type DeckId = (typeof DECK_IDS)[number];
