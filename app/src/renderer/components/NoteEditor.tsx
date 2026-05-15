import { useEffect, useRef, useCallback } from 'react';
import Vditor from 'vditor';
import 'vditor/dist/index.css';

interface NoteEditorProps {
  content: string;
  onContentChange: (markdown: string) => void;
  onTimestampClick: (seconds: number) => void;
  projectDir: string;
}

async function toLocalUrl(md: string, projectDir: string): Promise<string> {
  const matches = [...md.matchAll(/!\[([^\]]*)\]\((notes-images\/[^)]+)\)/g)];
  if (matches.length === 0) return md;

  const replacements = await Promise.all(
    matches.map(async (m) => {
      const abs = projectDir + '\\' + m[2].replace(/\//g, '\\');
      const url = await window.electronAPI?.getMediaUrl(abs);
      return { original: m[0], replacement: `![${m[1]}](${url})` };
    })
  );

  let result = md;
  for (const { original, replacement } of replacements) {
    result = result.replace(original, replacement);
  }
  return result;
}

export function NoteEditor({ content, onContentChange, onTimestampClick, projectDir }: NoteEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vditorRef = useRef<Vditor | null>(null);
  const isInternalUpdate = useRef(false);

  const handleEditorClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (href && href.startsWith('#t')) {
      e.preventDefault();
      e.stopPropagation();
      const seconds = parseInt(href.slice(2), 10);
      if (!isNaN(seconds) && seconds >= 0) {
        onTimestampClick(seconds);
      }
    }
  }, [onTimestampClick]);

  useEffect(() => {
    if (!containerRef.current) return;

    const vditor = new Vditor(containerRef.current, {
      height: '100%',
      mode: 'wysiwyg',
      toolbar: [
        'headings', 'bold', 'italic', '|',
        'list', 'ordered-list', '|',
        'quote', 'code', 'table', '|',
        'link', 'upload', '|',
        'undo', 'redo',
      ],
      cache: { enable: false },
      value: '',
      input: (value) => {
        if (!isInternalUpdate.current) {
          onContentChange(value);
        }
      },
      after: async () => {
        vditorRef.current = vditor;
        const editorEl = containerRef.current?.querySelector('.vditor-wysiwyg');
        if (editorEl) {
          editorEl.addEventListener('click', handleEditorClick, true);
        }
        if (content && projectDir) {
          try {
            const converted = await toLocalUrl(content, projectDir);
            vditor.setValue(converted);
          } catch (e) {
            vditor.setValue(content);
          }
        }
      },
    });

    return () => {
      const editorEl = containerRef.current?.querySelector('.vditor-wysiwyg');
      editorEl?.removeEventListener('click', handleEditorClick, true);
      try { vditor.destroy(); } catch {}
      vditorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (vditorRef.current && content && projectDir) {
      toLocalUrl(content, projectDir).then((converted) => {
        isInternalUpdate.current = true;
        vditorRef.current?.setValue(converted);
        isInternalUpdate.current = false;
      }).catch(() => {
        isInternalUpdate.current = true;
        vditorRef.current?.setValue(content);
        isInternalUpdate.current = false;
      });
    }
  }, [content, projectDir]);

  return (
    <div ref={containerRef} className="h-full w-full" />
  );
}
