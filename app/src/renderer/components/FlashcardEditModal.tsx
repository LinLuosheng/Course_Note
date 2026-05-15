import { useState, useCallback } from 'react';
import { Flashcard, FlashcardType } from '@shared/types';
import { nanoid } from 'nanoid';

interface Props {
  card?: Flashcard; // undefined = new card, defined = edit
  onSave: (card: Flashcard) => void;
  onClose: () => void;
}

const TYPE_OPTIONS: { value: FlashcardType; label: string }[] = [
  { value: 'concept', label: '概念' },
  { value: 'formula', label: '公式' },
  { value: 'number', label: '数字' },
  { value: 'rule', label: '规则' },
];

function extractClozes(text: string): string[] {
  const regex = /\{\{c(\d+)::([^}]+)\}\}/g;
  const clozes: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const idx = parseInt(match[1]) - 1;
    if (idx >= 0) {
      while (clozes.length <= idx) clozes.push('');
      clozes[idx] = match[2];
    }
  }
  return clozes;
}

export function FlashcardEditModal({ card, onSave, onClose }: Props) {
  const [type, setType] = useState<FlashcardType>(card?.type || 'concept');
  const [text, setText] = useState(card?.text || '');
  const [sourceSection, setSourceSection] = useState(card?.sourceSection || '');

  const handleSave = useCallback(() => {
    const clozes = extractClozes(text);
    if (clozes.length === 0) {
      // No cloze syntax found, wrap entire text as a single cloze
      const wrappedText = `{{c1::${text}}}`;
      onSave({
        id: card?.id || nanoid(),
        type,
        text: wrappedText,
        clozes: [text],
        sourceSection,
        timestamp: card?.timestamp ?? null,
        createdAt: card?.createdAt || Date.now(),
      });
    } else {
      onSave({
        id: card?.id || nanoid(),
        type,
        text,
        clozes,
        sourceSection,
        timestamp: card?.timestamp ?? null,
        createdAt: card?.createdAt || Date.now(),
      });
    }
  }, [card, type, text, sourceSection, onSave]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3>{card ? '编辑卡片' : '新增卡片'}</h3>

        <div className="modal-field">
          <label>类型</label>
          <div className="modal-type-select">
            {TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`modal-type-btn ${type === opt.value ? 'active' : ''}`}
                onClick={() => setType(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-field">
          <label>内容</label>
          <textarea
            className="modal-textarea"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="输入卡片内容，使用 {{c1::答案}} 创建填空&#10;例：中国的首都是{{c1::北京}}"
            rows={5}
            autoFocus
          />
          <div className="modal-hint">
            用 <code>{'{{c1::答案}}'}</code> 创建填空，可多个：{'{{c1::答案1}} {{c2::答案2}}'}
          </div>
        </div>

        <div className="modal-field">
          <label>来源章节（可选）</label>
          <input
            className="modal-input"
            value={sourceSection}
            onChange={e => setSourceSection(e.target.value)}
            placeholder="如：专练一"
          />
        </div>

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={handleSave} disabled={!text.trim()}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
