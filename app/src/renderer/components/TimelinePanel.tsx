import { useState, useEffect } from 'react';
import { ExtractedSlide } from '@shared/types';

interface TimelinePanelProps {
  duration: number;
  currentTime: number;
  slides: ExtractedSlide[];
  onSeek: (seconds: number) => void;
}

export function TimelinePanel({ duration, currentTime, slides, onSeek }: TimelinePanelProps) {
  const [slideUrls, setSlideUrls] = useState<Record<number, string>>({});

  useEffect(() => {
    const loadUrls = async () => {
      const entries = await Promise.all(
        slides.map(async (slide) => {
          const url = await window.electronAPI?.getMediaUrl(slide.filePath);
          return [slide.slideNumber, url || ''] as const;
        })
      );
      setSlideUrls(Object.fromEntries(entries));
    };
    if (slides.length > 0) loadUrls();
  }, [slides]);

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    onSeek(pct * duration);
  };

  return (
    <div className="timeline-container">
      <div style={{ position: 'relative', height: 20, marginBottom: 6 }}>
        {slides.map((slide) => {
          const left = duration > 0 ? (slide.timestamp / duration) * 100 : 0;
          const url = slideUrls[slide.slideNumber];
          return (
            <button
              key={slide.slideNumber}
              className="timeline-slide-marker"
              style={{ left: `${left}%` }}
              onClick={() => onSeek(slide.timestamp)}
              title={`Slide ${slide.slideNumber}`}
            >
              {url && (
                <img
                  src={url}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="timeline-track" onClick={handleBarClick}>
        <div className="timeline-track-bg" />
        <div
          className="timeline-track-fill"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
}
