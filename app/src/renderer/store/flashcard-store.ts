import { create } from 'zustand';
import { FlashcardDeck, ClozeReviewData, Flashcard } from '@shared/types';

interface ReviewItem {
  cardId: string;
  clozeIndex: number;
}

interface FlashcardState {
  deck: FlashcardDeck | null;
  reviews: Map<string, ClozeReviewData>;
  activeView: 'grid' | 'review';
  reviewQueue: ReviewItem[];
  reviewIndex: number;
  filterType: string | null;

  loadDeck: (projectDir: string) => Promise<void>;
  setDeck: (deck: FlashcardDeck) => void;
  setView: (view: 'grid' | 'review') => void;
  setFilterType: (type: string | null) => void;
  startReview: () => void;
  nextReviewCard: () => void;
  endReview: () => void;
  rateCloze: (cardId: string, clozeIndex: number, rating: number) => void;
  addCard: (card: Flashcard) => void;
  updateCard: (id: string, updates: Partial<Flashcard>) => void;
  deleteCard: (id: string) => void;
  persistDeck: (projectDir: string) => Promise<void>;
}

function migrateLegacyCard(old: any): Flashcard {
  return {
    id: old.id,
    type: old.type === 'timeline' ? 'rule' : old.type === 'qa' ? 'concept' : old.type || 'concept',
    text: `${old.front || ''}：{{c1::${old.back || ''}}}`,
    clozes: [old.back || ''],
    sourceSection: old.sourceSection || '',
    timestamp: old.timestamp || null,
    createdAt: old.createdAt || Date.now(),
  };
}

const SM2_DEFAULT: Omit<ClozeReviewData, 'cardId' | 'clozeIndex'> = {
  easeFactor: 2.5,
  interval: 0,
  repetitions: 0,
  nextReview: 0,
  lastReview: null,
};

export const useFlashcardStore = create<FlashcardState>()((set, get) => ({
  deck: null,
  reviews: new Map(),
  activeView: 'grid',
  reviewQueue: [],
  reviewIndex: 0,
  filterType: null,

  loadDeck: async (projectDir: string) => {
    const result = await window.electronAPI.loadFlashcards(projectDir);
    const reviewsMap = new Map<string, ClozeReviewData>();
    if (result.reviews) {
      for (const r of result.reviews) {
        const key = r.cardId + '::' + (r.clozeIndex ?? 1);
        reviewsMap.set(key, r);
      }
    }
    let deck = result.deck;
    if (deck && deck.cards?.length && (deck.cards[0] as any).front) {
      deck = { ...deck, cards: deck.cards.map(migrateLegacyCard) };
    }
    set({ deck, reviews: reviewsMap });
  },

  setDeck: (deck) => set({ deck }),

  setView: (view) => set({ activeView: view }),

  setFilterType: (type) => set({ filterType: type }),

  startReview: () => {
    const { deck, reviews } = get();
    if (!deck) return;
    const now = Date.now();
    const due: ReviewItem[] = [];
    for (const card of deck.cards) {
      for (let i = 1; i <= card.clozes.length; i++) {
        const key = `${card.id}::${i}`;
        const r = reviews.get(key);
        if (!r || r.nextReview <= now) {
          due.push({ cardId: card.id, clozeIndex: i });
        }
      }
    }
    set({ reviewQueue: due, reviewIndex: 0, activeView: 'review' });
  },

  nextReviewCard: () => set((s) => ({ reviewIndex: s.reviewIndex + 1 })),

  endReview: () => set({ activeView: 'grid', reviewQueue: [], reviewIndex: 0 }),

  rateCloze: (cardId, clozeIndex, rating) => {
    const { reviews } = get();
    const key = `${cardId}::${clozeIndex}`;
    const existing = reviews.get(key) || { ...SM2_DEFAULT, cardId, clozeIndex };
    const updated = sm2(existing, rating);
    const newReviews = new Map(reviews);
    newReviews.set(key, updated);
    set({ reviews: newReviews });
  },

  addCard: (card) => {
    const { deck } = get();
    if (!deck) return;
    set({ deck: { ...deck, cards: [...deck.cards, card], updatedAt: Date.now() } });
  },

  updateCard: (id, updates) => {
    const { deck } = get();
    if (!deck) return;
    set({
      deck: {
        ...deck,
        cards: deck.cards.map(c => c.id === id ? { ...c, ...updates } : c),
        updatedAt: Date.now(),
      },
    });
  },

  deleteCard: (id) => {
    const { deck } = get();
    if (!deck) return;
    set({
      deck: {
        ...deck,
        cards: deck.cards.filter(c => c.id !== id),
        updatedAt: Date.now(),
      },
    });
  },

  persistDeck: async (projectDir) => {
    const { deck } = get();
    if (!deck) return;
    await window.electronAPI?.saveFlashcards(projectDir, deck);
  },
}));

function sm2(data: ClozeReviewData, rating: number): ClozeReviewData {
  const now = Date.now();
  let { easeFactor, interval, repetitions } = data;

  if (rating < 2) {
    repetitions = 0;
    interval = 0;
  } else {
    repetitions += 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 3;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    if (rating === 3) {
      easeFactor = Math.max(1.3, easeFactor + 0.15);
    }
  }

  return {
    ...data,
    easeFactor,
    interval,
    repetitions,
    nextReview: now + interval * 86400000,
    lastReview: now,
  };
}
