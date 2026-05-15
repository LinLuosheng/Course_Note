import { useBatchStore } from '../store/batch-store';

const STATUS_LABELS: Record<string, string> = {
  pending: '等待中',
  processing: '处理中',
  completed: '已完成',
  error: '失败',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--text-muted)',
  processing: 'var(--accent)',
  completed: 'var(--success)',
  error: 'var(--error)',
};

const STAGE_LABELS: Record<string, string> = {
  extracting_audio: '提取音频',
  extracting_slides: '提取幻灯片',
  transcribing: '语音转录',
  generating_summary: '生成总结',
  generating_flashcards: '提取知识点',
  completed: '完成',
};

export function BatchQueuePanel() {
  const { items, isRunning, clearCompleted } = useBatchStore();

  if (items.length === 0) return null;

  const completedCount = items.filter((i) => i.status === 'completed').length;
  const errorCount = items.filter((i) => i.status === 'error').length;
  const overallProgress = items.length > 0
    ? Math.round(items.reduce((sum, i) => sum + i.progress, 0) / items.length)
    : 0;

  return (
    <div className="batch-panel">
      <div className="batch-header">
        <div className="batch-header-left">
          <span className="batch-title">
            批量队列 ({completedCount}/{items.length})
          </span>
          {errorCount > 0 && (
            <span style={{ color: 'var(--error)', fontSize: '12px', marginLeft: '8px' }}>
              {errorCount} 个失败
            </span>
          )}
        </div>
        <div className="batch-header-right">
          {isRunning && (
            <div className="batch-overall-progress">
              <div className="batch-overall-bar" style={{ width: `${overallProgress}%` }} />
            </div>
          )}
          {!isRunning && items.some((i) => i.status === 'completed' || i.status === 'error') && (
            <button className="btn-ghost batch-action-btn" onClick={clearCompleted}>
              清空已完成
            </button>
          )}
        </div>
      </div>

      <div className="batch-list">
        {items.map((item) => (
          <div key={item.projectDir} className={`batch-item batch-item--${item.status}`}>
            <div className="batch-item-info">
              <span className="batch-item-name">{item.projectName}</span>
              <span
                className="batch-item-status"
                style={{ color: STATUS_COLORS[item.status] }}
              >
                {item.status === 'processing' && (
                  <span className="batch-spinner" />
                )}
                {STATUS_LABELS[item.status]}
                {item.status === 'processing' && item.stage && (
                  <span style={{ marginLeft: '4px', opacity: 0.7 }}>
                    · {STAGE_LABELS[item.stage] || item.stage}
                  </span>
                )}
              </span>
            </div>
            {item.status === 'processing' && (
              <div className="batch-item-progress">
                <div className="batch-item-bar" style={{ width: `${item.progress}%` }} />
              </div>
            )}
            {item.status === 'error' && item.errorMessage && (
              <div className="batch-item-error">{item.errorMessage}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
