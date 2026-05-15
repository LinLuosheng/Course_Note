import { useState } from 'react';
import { useAppStore } from '../store/app-store';
import { LLM_PRESETS } from '@shared/llm-presets';
import { AppSettings } from '@shared/types';

export function SettingsDialog() {
  const { settings, isSettingsOpen, setSettingsOpen, updateSettings } = useAppStore();
  const [models, setModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState('');

  if (!isSettingsOpen) return null;

  const handleProviderChange = (provider: string) => {
    const preset = LLM_PRESETS[provider];
    updateSettings({
      llmProvider: provider as AppSettings['llmProvider'],
      llmBaseUrl: preset?.baseUrl || '',
      llmModel: preset?.defaultModel || '',
    });
    setModels([]);
    setModelsError('');
  };

  const handleFetchModels = async () => {
    setIsLoadingModels(true);
    setModelsError('');
    try {
      const result = await window.electronAPI.fetchModels({
        provider: settings.llmProvider,
        baseUrl: settings.llmBaseUrl,
        apiKey: settings.llmApiKey,
      });
      if (result.error) {
        setModelsError(result.error);
        setModels([]);
      } else {
        setModels(result.models || []);
        if (result.models?.length > 0 && !result.models.includes(settings.llmModel)) {
          updateSettings({ llmModel: result.models[0] });
        }
      }
    } catch (e: any) {
      setModelsError(e.message);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const save = () => {
    window.electronAPI.saveSettings(settings);
    setSettingsOpen(false);
  };

  const showApiKey = LLM_PRESETS[settings.llmProvider]?.requiresApiKey;
  const hasModels = models.length > 0;

  return (
    <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>设置</h2>
          <button className="settings-close" onClick={() => setSettingsOpen(false)}>
            &times;
          </button>
        </div>

        <div className="settings-body">
          {/* ASR Settings */}
          <section className="settings-section">
            <h3>语音识别</h3>
            <label className="settings-field">
              <span>Whisper 模型</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Large — 固定使用最准确模型</span>
            </label>
            <label className="settings-field">
              <span>语言</span>
              <select
                value={settings.whisperLanguage}
                onChange={(e) => updateSettings({ whisperLanguage: e.target.value })}
              >
                <option value="auto">自动检测</option>
                <option value="zh">中文</option>
                <option value="en">English</option>
                <option value="ja">日本語</option>
                <option value="ko">한국어</option>
              </select>
            </label>
          </section>

          {/* LLM Settings */}
          <section className="settings-section">
            <h3>大语言模型</h3>
            <label className="settings-field">
              <span>提供商</span>
              <select
                value={settings.llmProvider}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                {Object.entries(LLM_PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>{preset.name}</option>
                ))}
              </select>
            </label>
            {showApiKey && (
              <label className="settings-field">
                <span>API Key</span>
                <input
                  type="password"
                  value={settings.llmApiKey}
                  onChange={(e) => {
                    updateSettings({ llmApiKey: e.target.value });
                    setModels([]);
                    setModelsError('');
                  }}
                  placeholder="sk-..."
                />
              </label>
            )}
            <label className="settings-field">
              <span>Base URL</span>
              <input
                type="text"
                value={settings.llmBaseUrl}
                onChange={(e) => {
                  updateSettings({ llmBaseUrl: e.target.value });
                  setModels([]);
                }}
              />
            </label>
            <label className="settings-field">
              <span>模型</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {hasModels ? (
                  <select
                    value={settings.llmModel}
                    onChange={(e) => updateSettings({ llmModel: e.target.value })}
                    style={{ flex: 1 }}
                  >
                    {models.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={settings.llmModel}
                    onChange={(e) => updateSettings({ llmModel: e.target.value })}
                    placeholder="模型名称或点击刷新获取列表"
                    style={{ flex: 1 }}
                  />
                )}
                <button
                  className="btn-ghost"
                  onClick={handleFetchModels}
                  disabled={isLoadingModels}
                  style={{
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {isLoadingModels ? (
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>↻</span>
                  ) : (
                    '↻'
                  )}
                  刷新
                </button>
              </div>
              {modelsError && (
                <span style={{ fontSize: 11, color: 'var(--error)', marginTop: 4, display: 'block' }}>
                  {modelsError}
                </span>
              )}
            </label>
          </section>

          {/* Video Processing */}
          <section className="settings-section">
            <h3>视频处理</h3>
            <label className="settings-field">
              <span>场景检测阈值: {settings.sceneThreshold}</span>
              <input
                type="range"
                min="10"
                max="100"
                value={settings.sceneThreshold}
                onChange={(e) => updateSettings({ sceneThreshold: Number(e.target.value) })}
              />
            </label>
          </section>

          {/* Flashcard Settings */}
          <section className="settings-section">
            <h3>知识卡片</h3>
            <label className="settings-field">
              <span>自动生成卡片</span>
              <select
                value={settings.flashcardAutoGenerate ? 'yes' : 'no'}
                onChange={(e) => updateSettings({ flashcardAutoGenerate: e.target.value === 'yes' })}
              >
                <option value="yes">是</option>
                <option value="no">否</option>
              </select>
            </label>
          </section>

          {/* TTS Settings */}
          <section className="settings-section">
            <h3>语音合成</h3>
            <label className="settings-field">
              <span>启用 VoxCPM2 语音合成</span>
              <select
                value={settings.ttsEnabled ? 'yes' : 'no'}
                onChange={(e) => updateSettings({ ttsEnabled: e.target.value === 'yes' })}
              >
                <option value="no">关闭</option>
                <option value="yes">开启</option>
              </select>
            </label>
          </section>

          <div className="settings-footer">
            <button className="btn-ghost" onClick={() => setSettingsOpen(false)}>
              取消
            </button>
            <button className="btn-primary" onClick={save}>
              保存设置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
