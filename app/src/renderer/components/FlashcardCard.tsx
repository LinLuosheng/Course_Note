import { useState, type ReactNode } from 'react';
import { Flashcard } from '@shared/types';

interface Props {
  card: Flashcard;
  onTimestampClick?: (seconds: number) => void;
  highlightCloze?: number | null;
  onEdit?: (card: Flashcard) => void;
  onDelete?: (id: string) => void;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  concept: { label: '概念', color: '#3b82f6' },
  formula: { label: '公式', color: '#a855f7' },
  number: { label: '数字', color: '#22c55e' },
  rule: { label: '规则', color: '#d4a853' },
};

function renderClozeText(
  text: string,
  revealed: Set<number>,
  onReveal: (idx: number) => void,
  highlightCloze?: number | null,
) {
  const parts: ReactNode[] = [];
  const regex = /\{\{c(\d+)::([^}]+)\}\}/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    const clozeIdx = parseInt(match[1]);
    const answer = match[2];

    if (revealed.has(clozeIdx)) {
      parts.push(
        <span key={key++} className="cloze-revealed">{answer}</span>
      );
    } else {
      const isHighlighted = highlightCloze != null && clozeIdx === highlightCloze;
      parts.push(
        <span
          key={key++}
          className={`cloze-blank${isHighlighted ? ' cloze-highlighted' : ''}`}
          onClick={(e) => { e.stopPropagation(); onReveal(clozeIdx); }}
        >
          {'__'.repeat(Math.min(Math.ceil(answer.length / 2), 6))}
        </span>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(<span key={key}>{text.slice(lastIndex)}</span>);
  }
  return parts;
}

export function FlashcardCard({ card, onTimestampClick, highlightCloze, onEdit, onDelete }: Props) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const info = TYPE_LABELS[card.type] || TYPE_LABELS.concept;

  const handleReveal = (idx: number) => {
    setRevealed(prev => new Set(prev).add(idx));
  };

  const revealAll = () => {
    setRevealed(new Set(card.clozes.map((_, i) => i + 1)));
  };

  const allRevealed = card.clozes.every((_, i) => revealed.has(i + 1));

  return (
    <div className="flashcard-card">
      {(onEdit || onDelete) && (
        <div className="flashcard-card-actions">
          {onEdit && (
            <button className="flashcard-action-btn" title="编辑" onClick={(e) => { e.stopPropagation(); onEdit(card); }}>✎</button>
          )}
          {onDelete && (
            <button className="flashcard-action-btn flashcard-action-delete" title="删除" onClick={(e) => { e.stopPropagation(); onDelete(card.id); }}>✕</button>
          )}
        </div>
      )}
      <div className="flashcard-card-content">
        <div className="flashcard-header">
          <span className="flashcard-type-badge" style={{ background: info.color + '22', color: info.color }}>
            {info.label}
          </span>
          {!allRevealed && (
            <button className="cloze-reveal-all-btn" onClick={revealAll}>
              显示全部
            </button>
          )}
        </div>
        <div className="flashcard-cloze-text">
          {renderClozeText(card.text, revealed, handleReveal, highlightCloze)}
        </div>
      </div>
      {card.timestamp != null && onTimestampClick && (
        <button
          className="flashcard-timestamp-btn"
          onClick={(e) => { e.stopPropagation(); onTimestampClick(card.timestamp!); }}
        >
          ▶ {formatTime(card.timestamp)}
        </button>
      )}
    </div>
  );
}

function formatTime(s: number): string {
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}
