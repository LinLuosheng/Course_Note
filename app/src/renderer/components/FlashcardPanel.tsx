import { useEffect, useMemo, useState } from 'react';
import { useFlashcardStore } from '../store/flashcard-store';
import { FlashcardCard } from './FlashcardCard';
import { FlashcardEditModal } from './FlashcardEditModal';
import { Flashcard } from '@shared/types';

interface Props {
  projectDir: string;
  onTimestampClick: (seconds: number) => void;
}

export function FlashcardPanel({ projectDir, onTimestampClick }: Props) {
  const {
    deck, activeView, filterType, reviewQueue, reviewIndex,
    loadDeck, setFilterType, startReview, nextReviewCard, endReview, rateCloze,
    addCard, updateCard, deleteCard, persistDeck,
  } = useFlashcardStore();

  const [editCard, setEditCard] = useState<Flashcard | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => { loadDeck(projectDir); }, [projectDir]);

  const filteredCards = useMemo(() => {
    if (!deck) return [];
    if (!filterType) return deck.cards;
    return deck.cards.filter((c) => c.type === filterType);
  }, [deck, filterType]);

  const dueCount = useMemo(() => {
    if (!deck) return 0;
    const { reviews } = useFlashcardStore.getState();
    const now = Date.now();
    let count = 0;
    for (const card of deck.cards) {
      for (let i = 1; i <= card.clozes.length; i++) {
        const r = reviews.get(`${card.id}::${i}`);
        if (!r || r.nextReview <= now) count++;
      }
    }
    return count;
  }, [deck]);

  const currentItem = reviewQueue[reviewIndex];
  const currentCard = useMemo(() => {
    if (!deck || !currentItem) return null;
    return deck.cards.find((c) => c.id === currentItem.cardId) || null;
  }, [deck, currentItem]);

  const handleSaveCard = async (card: Flashcard) => {
    const existing = deck?.cards.find(c => c.id === card.id);
    if (existing) {
      updateCard(card.id, card);
    } else {
      addCard(card);
    }
    await persistDeck(projectDir);
    setEditCard(null);
    setShowAddModal(false);
  };

  const handleDelete = async (id: string) => {
    deleteCard(id);
    await persistDeck(projectDir);
    setDeleteConfirmId(null);
  };

  if (activeView === 'review') {
    if (!currentItem || !currentCard) {
      return (
        <div className="flashcard-review-complete">
          <div className="flashcard-review-trophy">&#127942;</div>
          <h3>复习完成!</h3>
          <p>已复习 {reviewQueue.length} 个填空</p>
          <button className="btn-primary" onClick={endReview}>返回</button>
        </div>
      );
    }
    return (
      <div className="flashcard-review">
        <div className="flashcard-review-header">
          <span>{reviewIndex + 1} / {reviewQueue.length}</span>
          <button className="btn-ghost" onClick={endReview}>退出</button>
        </div>
        <div className="flashcard-review-card-wrapper">
          <FlashcardCard
            card={currentCard}
            onTimestampClick={onTimestampClick}
            highlightCloze={currentItem.clozeIndex}
          />
        </div>
        <div className="flashcard-review-buttons">
          <button className="review-btn review-btn-again" onClick={() => { rateCloze(currentItem.cardId, currentItem.clozeIndex, 0); nextReviewCard(); }}>
            忘记了
          </button>
          <button className="review-btn review-btn-hard" onClick={() => { rateCloze(currentItem.cardId, currentItem.clozeIndex, 1); nextReviewCard(); }}>
            困难
          </button>
          <button className="review-btn review-btn-good" onClick={() => { rateCloze(currentItem.cardId, currentItem.clozeIndex, 2); nextReviewCard(); }}>
            记住了
          </button>
          <button className="review-btn review-btn-easy" onClick={() => { rateCloze(currentItem.cardId, currentItem.clozeIndex, 3); nextReviewCard(); }}>
            太简单
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flashcard-panel">
      <div className="flashcard-toolbar">
        <div className="flashcard-filters">
          {['全部', 'concept', 'formula', 'number', 'rule'].map((type) => (
            <button
              key={type}
              className={`flashcard-filter-btn ${(filterType === (type === '全部' ? null : type)) ? 'active' : ''}`}
              onClick={() => setFilterType(type === '全部' ? null : type)}
            >
              {type === '全部' ? '全部' : type === 'concept' ? '概念' : type === 'formula' ? '公式' : type === 'number' ? '数字' : '规则'}
            </button>
          ))}
        </div>
        <div className="flashcard-toolbar-actions">
          <button className="btn-ghost" onClick={() => setShowAddModal(true)}>+ 新增</button>
          <button className="btn-primary" onClick={startReview} disabled={dueCount === 0}>
            复习 ({dueCount})
          </button>
        </div>
      </div>

      {!deck || deck.cards.length === 0 ? (
        <div className="flashcard-empty">
          <p>暂无知识卡片</p>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>视频处理完成后将自动生成，或点击「+ 新增」手动添加</p>
        </div>
      ) : (
        <div className="flashcard-grid">
          {filteredCards.map((card) => (
            <FlashcardCard
              key={card.id}
              card={card}
              onTimestampClick={onTimestampClick}
              onEdit={setEditCard}
              onDelete={(id) => setDeleteConfirmId(id)}
            />
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {(showAddModal || editCard) && (
        <FlashcardEditModal
          card={editCard || undefined}
          onSave={handleSaveCard}
          onClose={() => { setShowAddModal(false); setEditCard(null); }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirmId && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 320 }}>
            <h3>确认删除</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>删除后无法恢复，确定要删除这张卡片吗？</p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setDeleteConfirmId(null)}>取消</button>
              <button className="btn-primary" style={{ background: '#ef4444' }} onClick={() => handleDelete(deleteConfirmId)}>删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
