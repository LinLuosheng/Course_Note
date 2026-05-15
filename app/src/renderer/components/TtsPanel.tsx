import { useState, useRef, useEffect } from 'react';

interface Props {
  projectDir: string;
  notesContent: string;
}

export function TtsPanel({ projectDir, notesContent }: Props) {
  const [text, setText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [error, setError] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    return () => {
      if (audioSrc) URL.revokeObjectURL(audioSrc);
    };
  }, [audioSrc]);

  const handleSynthesize = async () => {
    if (!text.trim()) return;
    setIsGenerating(true);
    setError('');
    try {
      const result = await window.electronAPI.ttsSynthesize({
        text: text.trim(),
        projectDir,
      });
      if (result.error) {
        setError(result.error);
      } else if (result.audioPath) {
        // Electron can serve local files via file:// protocol in some configs,
        // but for safety we use a custom protocol or direct path
        if (audioSrc) URL.revokeObjectURL(audioSrc);
        setAudioSrc(`file:///${result.audioPath.replace(/\\/g, '/')}`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSynthesizeSelection = () => {
    const selection = window.getSelection()?.toString().trim();
    if (selection) {
      setText(selection);
    }
  };

  const handlePlay = () => {
    audioRef.current?.play();
  };

  return (
    <div className="tts-panel">
      <div className="tts-toolbar">
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>语音合成</h3>
        <span className="tts-badge">VoxCPM2</span>
      </div>

      <div className="tts-content">
        <textarea
          className="tts-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="输入要合成的文本，或从笔记中选取内容..."
          rows={6}
        />

        <div className="tts-actions">
          <button
            className="btn-primary"
            onClick={handleSynthesize}
            disabled={isGenerating || !text.trim()}
          >
            {isGenerating ? '合成中...' : '合成语音'}
          </button>
          {notesContent && (
            <button
              className="btn-ghost"
              onClick={handleSynthesizeSelection}
              title="从笔记中选取选中文本"
            >
              从选区导入
            </button>
          )}
        </div>

        {error && (
          <div className="tts-error">{error}</div>
        )}

        {audioSrc && (
          <div className="tts-player">
            <audio ref={audioRef} src={audioSrc} controls style={{ width: '100%' }} />
          </div>
        )}
      </div>
    </div>
  );
}
