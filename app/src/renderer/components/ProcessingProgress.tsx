import { ProcessingProgress as ProgressData, ProjectStatus } from '@shared/types';

const STAGES: { key: ProjectStatus; label: string }[] = [
  { key: 'extracting_audio', label: '提取音频' },
  { key: 'extracting_slides', label: '提取幻灯片' },
  { key: 'transcribing', label: '语音转录' },
  { key: 'generating_summary', label: '生成总结' },
  { key: 'generating_flashcards', label: '生成知识卡片' },
];

interface Props {
  progress: ProgressData | null;
}

export function ProcessingProgress({ progress }: Props) {
  const isComplete = progress?.stage === 'completed';
  const currentIdx = progress ? STAGES.findIndex((s) => s.key === progress.stage) : -1;

  return (
    <div className="progress-panel">
      <div className="progress-header">
        <h3>{isComplete ? '处理完成' : '正在处理'}</h3>
        {!isComplete && progress?.message && (
          <span className="progress-header-detail">{progress.message}</span>
        )}
      </div>

      {/* Overall progress bar */}
      <div className="progress-bar-track">
        <div
          className="progress-bar-fill"
          style={{ width: `${isComplete ? 100 : (progress?.progress ?? 0)}%` }}
        />
        <span className="progress-bar-label">
          {isComplete ? '100%' : `${progress?.progress ?? 0}%`}
        </span>
      </div>

      {/* Stage steps */}
      <div className="progress-steps">
        {STAGES.map((stage, idx) => {
          const isDone = isComplete || (currentIdx >= 0 && idx < currentIdx);
          const isActive = !isDone && idx === currentIdx;
          const stepClass = isDone ? 'done' : isActive ? 'active' : 'pending';

          return (
            <div key={stage.key} className={`progress-step-item ${stepClass}`}>
              <div className={`progress-step-icon ${stepClass}`}>
                {isDone ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : isActive ? (
                  <span className="progress-spinner" />
                ) : (
                  <span className="progress-step-number">{idx + 1}</span>
                )}
              </div>
              <span className="progress-step-text">{stage.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
