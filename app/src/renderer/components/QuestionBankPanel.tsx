import { useState, useEffect, useCallback } from 'react';
import { useQuestionStore } from '../store/question-store';
import { useAppStore } from '../store/app-store';
import type { Question } from '@shared/types';

type SubTab = 'practice' | 'manage' | 'import';

export function QuestionBankPanel({ projectDir, notesContent, onTimestampClick }: {
  projectDir: string;
  notesContent: string;
  onTimestampClick?: (seconds: number) => void;
}) {
  const [subTab, setSubTab] = useState<SubTab>('practice');
  const {
    bank, isGenerating, isTagging, allKnowledgePoints,
    selectedPoints, selectedDifficulty,
    loadBank, generateQuestions, importAndTag,
    setSelectedPoints, setSelectedDifficulty,
  } = useQuestionStore();

  useEffect(() => {
    loadBank(projectDir);
  }, [projectDir]);

  const settings = useAppStore(s => s.settings);
  const llmConfig = {
    provider: settings.llmProvider,
    api_key: settings.llmApiKey,
    base_url: settings.llmBaseUrl,
    model: settings.llmModel,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-tab header */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', padding: '0 8px' }}>
        {(['practice', 'manage', 'import'] as SubTab[]).map(tab => (
          <button
            key={tab}
            className={`tab-btn ${subTab === tab ? 'active' : ''}`}
            onClick={() => setSubTab(tab)}
            style={{ fontSize: '12px' }}
          >
            {{ practice: '练习', manage: '题库管理', import: '导入题目' }[tab]}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            className="btn-ghost"
            disabled={isGenerating || !notesContent}
            onClick={() => generateQuestions(projectDir, notesContent, llmConfig)}
            style={{ fontSize: '11px', padding: '2px 8px' }}
          >
            {isGenerating ? '生成中...' : 'AI 生成题目'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {subTab === 'practice' && <PracticeTab onTimestampClick={onTimestampClick} />}
        {subTab === 'manage' && <ManageTab />}
        {subTab === 'import' && (
          <ImportTab
            projectDir={projectDir}
            llmConfig={llmConfig}
            isTagging={isTagging}
            onImport={importAndTag}
          />
        )}
      </div>
    </div>
  );
}

// --- Practice Tab ---
function PracticeTab({ onTimestampClick }: { onTimestampClick?: (s: number) => void }) {
  const {
    practice, bank, allKnowledgePoints, selectedPoints, selectedDifficulty,
    setSelectedPoints, setSelectedDifficulty, startPractice, submitAnswer,
    nextQuestion, endPractice,
  } = useQuestionStore();

  const isInPractice = practice.queue.length > 0;

  if (!bank || bank.questions.length === 0) {
    return <EmptyState message="暂无题目，请先点击「AI 生成题目」或导入题库" />;
  }

  if (!isInPractice) {
    return (
      <div>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
            选择知识点（多选）
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            <button
              className={`kp-tag ${selectedPoints.length === 0 ? 'active' : ''}`}
              onClick={() => setSelectedPoints([])}
            >
              全部
            </button>
            {allKnowledgePoints.map(p => (
              <button
                key={p}
                className={`kp-tag ${selectedPoints.includes(p) ? 'active' : ''}`}
                onClick={() => {
                  setSelectedPoints(
                    selectedPoints.includes(p)
                      ? selectedPoints.filter(x => x !== p)
                      : [...selectedPoints, p]
                  );
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
            难度
          </label>
          <div style={{ display: 'flex', gap: '4px' }}>
            {[null, 'easy', 'medium', 'hard'].map(d => (
              <button
                key={d ?? 'all'}
                className={`kp-tag ${selectedDifficulty === d ? 'active' : ''}`}
                onClick={() => setSelectedDifficulty(d)}
              >
                {{ 'null': '全部', easy: '简单', medium: '中等', hard: '困难' }[d ?? 'null' as string]}
              </button>
            ))}
          </div>
        </div>

        <button className="btn-primary" onClick={startPractice} style={{ width: '100%' }}>
          开始练习
        </button>
      </div>
    );
  }

  // Practice in progress
  const current = practice.queue[practice.currentIndex];
  if (!current) {
    // Practice complete
    const correct = practice.answers.filter(a => a.isCorrect).length;
    const total = practice.answers.length;
    return (
      <div style={{ textAlign: 'center', padding: '24px' }}>
        <div style={{ fontSize: '36px', fontWeight: 700, color: 'var(--accent)' }}>
          {total > 0 ? Math.round((correct / total) * 100) : 0}%
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '8px 0' }}>
          答对 {correct}/{total} 题
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '16px' }}>
          <button className="btn-ghost" onClick={endPractice}>返回</button>
          <button className="btn-primary" onClick={startPractice}>再练一次</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
        <span>第 {practice.currentIndex + 1} / {practice.queue.length} 题</span>
        <span>
          {practice.answers.filter(a => a.isCorrect).length}/{practice.answers.length} 正确
        </span>
      </div>

      <QuestionCard
        question={current}
        selectedAnswer={practice.selectedAnswer}
        showResult={practice.showResult}
        onAnswer={submitAnswer}
        onTimestampClick={onTimestampClick}
      />

      {practice.showResult && (
        <button
          className="btn-primary"
          onClick={practice.currentIndex < practice.queue.length - 1 ? nextQuestion : endPractice}
          style={{ width: '100%', marginTop: '12px' }}
        >
          {practice.currentIndex < practice.queue.length - 1 ? '下一题' : '查看结果'}
        </button>
      )}
    </div>
  );
}

// --- Question Card ---
function QuestionCard({ question, selectedAnswer, showResult, onAnswer, onTimestampClick }: {
  question: Question;
  selectedAnswer: string;
  showResult: boolean;
  onAnswer: (a: string) => void;
  onTimestampClick?: (s: number) => void;
}) {
  const isCorrect = showResult && selectedAnswer.toUpperCase() === question.answer.toUpperCase();
  const isChoice = question.options && question.options.length > 0;

  return (
    <div className="question-card">
      {/* Knowledge points + difficulty */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
        {question.knowledgePoints.map(p => (
          <span key={p} className="kp-tag active" style={{ cursor: 'default' }}>{p}</span>
        ))}
        <span className={`difficulty-badge ${question.difficulty}`}>
          {{ easy: '简单', medium: '中等', hard: '困难' }[question.difficulty]}
        </span>
        {question.timestamp != null && onTimestampClick && (
          <button
            className="kp-tag"
            style={{ cursor: 'pointer' }}
            onClick={() => onTimestampClick(question.timestamp!)}
          >
            {formatTimestamp(question.timestamp)}
          </button>
        )}
      </div>

      {/* Question content */}
      <div style={{ fontSize: '14px', lineHeight: 1.6, marginBottom: '12px', whiteSpace: 'pre-wrap' }}>
        {question.content}
      </div>

      {/* Options */}
      {isChoice && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {question.options!.map((opt, i) => {
            const letter = String.fromCharCode(65 + i);
            const isSelected = selectedAnswer === letter;
            const isCorrectOption = question.answer.toUpperCase() === letter;
            let bg = 'var(--bg-base)';
            if (showResult) {
              if (isCorrectOption) bg = 'var(--success-bg, #d4edda)';
              else if (isSelected && !isCorrectOption) bg = 'var(--error-bg, #f8d7da)';
            } else if (isSelected) {
              bg = 'var(--accent-bg, rgba(99,102,241,0.1))';
            }

            return (
              <button
                key={i}
                disabled={showResult}
                onClick={() => !showResult && onAnswer(letter)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '8px',
                  padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)',
                  background: bg, cursor: showResult ? 'default' : 'pointer',
                  textAlign: 'left', fontSize: '13px', lineHeight: 1.5,
                  opacity: showResult && !isCorrectOption && !isSelected ? 0.6 : 1,
                }}
              >
                <span style={{ fontWeight: 600, minWidth: '18px' }}>{letter}.</span>
                <span>{opt.replace(/^[A-D][.、]\s*/, '')}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Fill-in answer (no options) */}
      {!isChoice && !showResult && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            placeholder="输入答案..."
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const val = (e.target as HTMLInputElement).value;
                if (val) onAnswer(val);
              }
            }}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: '6px',
              border: '1px solid var(--border-default)', background: 'var(--bg-base)',
              fontSize: '13px', outline: 'none', color: 'var(--text-primary)',
            }}
            id="fill-answer"
          />
          <button className="btn-primary" style={{ padding: '8px 16px' }} onClick={() => {
            const input = document.getElementById('fill-answer') as HTMLInputElement;
            if (input?.value) onAnswer(input.value);
          }}>
            提交
          </button>
        </div>
      )}

      {/* Result */}
      {showResult && (
        <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '6px', background: isCorrect ? 'var(--success-bg, #d4edda)' : 'var(--error-bg, #f8d7da)' }}>
          <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>
            {isCorrect ? '正确' : `错误，正确答案: ${question.answer}`}
          </div>
          {question.explanation && (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {question.explanation}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Manage Tab ---
function ManageTab() {
  const { bank, allKnowledgePoints } = useQuestionStore();
  const [expandedPoint, setExpandedPoint] = useState<string | null>(null);

  if (!bank || bank.questions.length === 0) {
    return <EmptyState message="暂无题目" />;
  }

  const questionsByPoint: Record<string, Question[]> = {};
  for (const q of bank.questions) {
    for (const p of q.knowledgePoints) {
      if (!questionsByPoint[p]) questionsByPoint[p] = [];
      questionsByPoint[p].push(q);
    }
  }

  // Questions with no points
  const uncategorized = bank.questions.filter(q => q.knowledgePoints.length === 0);

  return (
    <div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
        共 {bank.questions.length} 题 · {allKnowledgePoints.length} 个知识点
      </div>

      {allKnowledgePoints.map(point => {
        const qs = questionsByPoint[point] || [];
        const isExpanded = expandedPoint === point;
        return (
          <div key={point} style={{ marginBottom: '4px' }}>
            <button
              onClick={() => setExpandedPoint(isExpanded ? null : point)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '8px 10px', borderRadius: '6px',
                border: '1px solid var(--border-default)', background: 'var(--bg-base)',
                cursor: 'pointer', fontSize: '13px',
              }}
            >
              <span style={{ fontWeight: 500 }}>{point}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{qs.length} 题</span>
            </button>
            {isExpanded && (
              <div style={{ paddingLeft: '12px', paddingTop: '4px' }}>
                {qs.map(q => (
                  <div key={q.id} style={{ padding: '6px 8px', fontSize: '12px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <span className={`difficulty-badge ${q.difficulty}`} style={{ fontSize: '10px' }}>
                        {{ easy: '简', medium: '中', hard: '难' }[q.difficulty]}
                      </span>
                      <span style={{ color: 'var(--text-secondary)' }}>{q.content.substring(0, 60)}...</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {uncategorized.length > 0 && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
          {uncategorized.length} 题未分类
        </div>
      )}
    </div>
  );
}

// --- Import Tab ---

async function handleDownloadTemplate() {
  const template = {
    "_说明": "题库 JSON 模板 — 将题目整理为此格式后导入",
    "_图片用法": "把图片放在 JSON 同目录的 images/ 文件夹中，题目里用 images/xxx.png 引用",
    "questions": [
      {
        "content": "选择题示例：某公司上半年财务费用累计值如下：1~6月162万元，1~7月213万元。7月财务费用为多少万元？",
        "options": ["A. 41", "B. 51", "C. 61", "D. 71"],
        "answer": "B",
        "explanation": "7月 = 1~7月 - 1~6月 = 213 - 162 = 51万元"
      },
      {
        "content": "带图题目示例：如图所示三角形ABC中，AB=5, AC=12, 求BC的长度。![三角形](images/triangle.png)",
        "options": ["A. 10", "B. 11", "C. 12", "D. 13"],
        "answer": "D",
        "explanation": "直角三角形，BC = √(5²+12²) = 13"
      },
      {
        "content": "填空题示例：已知等差数列{an}中，a3=7, a7=15，则公差d = __。",
        "options": [],
        "answer": "2",
        "explanation": "d = (a7-a3)/(7-3) = (15-7)/4 = 2"
      },
      {
        "content": "计算题示例：解方程 2x² - 5x + 2 = 0",
        "options": [],
        "answer": "x = 2 或 x = 1/2",
        "explanation": "因式分解 (2x-1)(x-2) = 0"
      }
    ]
  };

  const content = JSON.stringify(template, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'question-template.json';
  a.click();
  URL.revokeObjectURL(url);
}

function ImportTab({ projectDir, llmConfig, isTagging, onImport }: {
  projectDir: string;
  llmConfig: any;
  isTagging: boolean;
  onImport: (projectDir: string, questions: any[], llmConfig: any) => Promise<void>;
}) {
  const parseAndImport = useQuestionStore(s => s.parseAndImport);
  const [importedRaw, setImportedRaw] = useState<any[] | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const handleSelectFile = useCallback(async () => {
    setError('');
    setImportedRaw(null);
    setSelectedFile(null);
    const filePath = await window.electronAPI?.selectQuestionFile();
    if (!filePath) return;

    setSelectedFile(filePath);

    // For JSON/TXT, try to parse locally first for preview
    if (filePath.endsWith('.json')) {
      try {
        const content = await window.electronAPI?.readTextFile(filePath);
        if (!content) { setError('文件为空'); return; }
        const parsed = JSON.parse(content);
        const questions = Array.isArray(parsed) ? parsed : parsed.questions || [];
        if (questions.length === 0) { setError('未找到题目数据'); return; }

        // Replace images/ references with notes-images/ in content
        for (const q of questions) {
          if (q.content) q.content = q.content.replace(/images\//g, 'notes-images/');
        }

        // Copy images from JSON's images/ folder to project's notes-images/
        const jsonDir = filePath.replace(/[/\\][^/\\]+$/, '');
        const copied = await window.electronAPI?.copyImagesToProject(jsonDir, projectDir);
        const imgMsg = copied > 0 ? `，已复制 ${copied} 张图片` : '';

        setImportedRaw(questions);
        setStatus(`已加载 ${questions.length} 道题目${imgMsg}`);
      } catch (e: any) {
        setError(`JSON 解析失败: ${e.message}`);
      }
    } else if (filePath.endsWith('.txt')) {
      try {
        const content = await window.electronAPI?.readTextFile(filePath);
        if (!content) { setError('文件为空'); return; }
        const lines = content.split('\n').filter(l => l.trim());
        const questions = lines.map(line => ({ content: line.trim(), answer: '', options: [] }));
        setImportedRaw(questions);
        setStatus(`已加载 ${questions.length} 行文本`);
      } catch (e: any) {
        setError(`读取失败: ${e.message}`);
      }
    } else {
      // PDF / Word — will be parsed by AI
      const ext = filePath.split('.').pop()?.toUpperCase() || '文件';
      setStatus(`${ext} 文件已选择，点击下方按钮让 AI 识别题目并导入`);
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (selectedFile && !selectedFile.endsWith('.json') && !selectedFile.endsWith('.txt')) {
      // PDF / Word: parse + tag in one step
      const result = await parseAndImport(projectDir, selectedFile, llmConfig);
      if (result?.error) {
        setError(result.error);
      } else {
        setSelectedFile(null);
        setStatus('');
        setImportedRaw(null);
      }
    } else if (importedRaw) {
      // JSON / TXT: tag the already parsed questions
      await onImport(projectDir, importedRaw, llmConfig);
      setImportedRaw(null);
      setSelectedFile(null);
      setStatus('');
    }
  }, [selectedFile, importedRaw, projectDir, llmConfig, onImport, parseAndImport]);

  return (
    <div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
        支持 JSON 格式题库，题目配图放在同目录的 images 文件夹中
      </div>

      <button
        className="btn-ghost"
        onClick={handleDownloadTemplate}
        style={{ width: '100%', marginBottom: '8px', fontSize: '12px' }}
      >
        下载模板文件
      </button>

      <button
        className="btn-primary"
        onClick={handleSelectFile}
        style={{ width: '100%', marginBottom: '12px' }}
      >
        选择题库文件
      </button>

      {error && <div style={{ color: 'var(--error, red)', fontSize: '12px', marginBottom: '8px' }}>{error}</div>}

      {selectedFile && (
        <div style={{ marginBottom: '12px', padding: '8px 10px', borderRadius: '6px', background: 'var(--bg-inset)', fontSize: '12px' }}>
          <div style={{ fontWeight: 500, marginBottom: '4px' }}>
            {selectedFile.split(/[/\\]/).pop()}
          </div>
          <div style={{ color: 'var(--text-muted)' }}>{status}</div>
        </div>
      )}

      {importedRaw && (
        <div style={{ maxHeight: '200px', overflow: 'auto', marginBottom: '12px', padding: '8px', background: 'var(--bg-inset)', borderRadius: '6px', fontSize: '12px' }}>
          {importedRaw.slice(0, 10).map((q, i) => (
            <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              {q.content || q['问题'] || q.question || JSON.stringify(q).substring(0, 80)}
            </div>
          ))}
          {importedRaw.length > 10 && (
            <div style={{ color: 'var(--text-muted)', padding: '4px 0' }}>
              ... 还有 {importedRaw.length - 10} 题
            </div>
          )}
        </div>
      )}

      {selectedFile && (
        <button
          className="btn-primary"
          onClick={handleImport}
          disabled={isTagging}
          style={{ width: '100%' }}
        >
          {isTagging ? 'AI 识别并分类中...' : 'AI 识别题目并导入'}
        </button>
      )}
    </div>
  );
}

// --- Helpers ---

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '13px' }}>
      {message}
    </div>
  );
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
