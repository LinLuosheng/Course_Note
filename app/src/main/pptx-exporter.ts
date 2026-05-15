import PptxGenJS from 'pptxgenjs';
import * as fs from 'fs';
import * as path from 'path';

interface SlideContent {
  title: string;
  body: string[];
  images: { filename: string; alt: string }[];
  speakerNotes: string[];
}

function parseMarkdownToSlides(md: string): SlideContent[] {
  const slides: SlideContent[] = [];
  const lines = md.split('\n');
  let current: SlideContent | null = null;

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)/);
    if (h2Match) {
      if (current) slides.push(current);
      current = {
        title: h2Match[1].trim(),
        body: [],
        images: [],
        speakerNotes: [],
      };
      continue;
    }

    if (!current) {
      // Content before first ## — create a title slide
      if (line.trim()) {
        current = {
          title: line.replace(/^#+\s*/, '').trim() || '课程笔记',
          body: [],
          images: [],
          speakerNotes: [],
        };
      }
      continue;
    }

    // Image
    const imgMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    if (imgMatch) {
      current.images.push({ alt: imgMatch[1], filename: imgMatch[2] });
      continue;
    }

    // Quote block → speaker note
    const quoteMatch = line.match(/^>\s*(.*)/);
    if (quoteMatch) {
      current.speakerNotes.push(quoteMatch[1]);
      continue;
    }

    // Body content (skip ### sub-headings, treat as content)
    if (line.trim()) {
      current.body.push(line);
    }
  }

  if (current) slides.push(current);
  return slides;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/{{c\d+::([^}]+)}}/g, '$1')
    .replace(/\[([0-9:]+)\]\([^)]+\)/g, '$1');
}

export async function exportNotesToPptx(
  notesMd: string,
  notesImagesDir: string,
  projectName: string,
  outputPath: string,
): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'CourseNote';
  pptx.subject = projectName;

  const slides = parseMarkdownToSlides(notesMd);

  for (const slide of slides) {
    const pptSlide = pptx.addSlide();

    // Title
    pptSlide.addText(stripMarkdown(slide.title), {
      x: 0.6,
      y: 0.3,
      w: 8.8,
      h: 0.7,
      fontSize: 22,
      bold: true,
      color: '1a1a2e',
      fontFace: 'Microsoft YaHei',
    });

    let yPos = 1.2;

    // Images
    for (const img of slide.images) {
      const imgPath = path.join(notesImagesDir, path.basename(img.filename));
      if (fs.existsSync(imgPath)) {
        const imgData = fs.readFileSync(imgPath);
        const b64 = imgData.toString('base64');
        const ext = path.extname(imgPath).replace('.', '');
        pptSlide.addImage({
          data: `image/${ext === 'jpg' ? 'jpeg' : ext};base64,${b64}`,
          x: 0.6,
          y: yPos,
          w: 8.8,
          h: 3.5,
          sizing: { type: 'contain', w: 8.8, h: 3.5 },
        });
        yPos += 3.7;
      }
    }

    // Body text
    if (slide.body.length > 0 && yPos < 6.5) {
      const textItems: PptxGenJS.TextProps[] = [];
      for (const line of slide.body) {
        const cleaned = stripMarkdown(line);
        if (!cleaned.trim()) continue;

        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
          textItems.push({
            text: cleaned.replace(/^[-*]\s+/, ''),
            options: { bullet: { type: 'bullet' }, fontSize: 14, color: '333333', breakLine: true },
          });
        } else if (/^###\s/.test(line)) {
          textItems.push({
            text: cleaned.replace(/^#+\s+/, ''),
            options: { fontSize: 16, bold: true, color: '1a1a2e', breakLine: true },
          });
        } else {
          textItems.push({
            text: cleaned,
            options: { fontSize: 14, color: '333333', breakLine: true },
          });
        }
      }

      const availableHeight = 7.0 - yPos;
      if (textItems.length > 0 && availableHeight > 0.5) {
        pptSlide.addText(textItems, {
          x: 0.6,
          y: yPos,
          w: 8.8,
          h: Math.min(availableHeight, 5.0),
          valign: 'top',
          fontFace: 'Microsoft YaHei',
        });
      }
    }

    // Speaker notes
    if (slide.speakerNotes.length > 0) {
      pptSlide.addNotes(slide.speakerNotes.join('\n'));
    }
  }

  await pptx.writeFile({ fileName: outputPath });
}
