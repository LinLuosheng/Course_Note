import * as fs from 'fs';
import * as path from 'path';
import { PythonBridge } from './python-bridge';
import { BrowserWindow } from 'electron';

function ts(): string {
  return new Date().toISOString().substring(11, 19);
}

function sendProgress(win: BrowserWindow, data: any) {
  console.log(`[${ts()}] [Pipeline] progress: stage=${data.stage} pct=${data.progress}% ${data.message}`);
  win.webContents.send('pipeline:progress', data);
}

export async function runFullPipeline(
  win: BrowserWindow,
  bridge: PythonBridge,
  params: { videoPath: string; projectDir: string; settings: any; pdfPaths?: string[] },
) {
  const { videoPath, projectDir, settings } = params;

  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'slides'), { recursive: true });

  // Update project.json with video path
  const metaPath = path.join(projectDir, 'project.json');
  let meta: any = {};
  if (fs.existsSync(metaPath)) {
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch {}
  }
  meta.videoPath = videoPath;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  // Step 1: Extract audio
  sendProgress(win, { stage: 'extracting_audio', progress: 0, message: '提取音频中...' });
  console.log(`[${ts()}] [Pipeline] Step 1: extract_audio start`);
  const audioResult = await bridge.send('extract_audio', {
    video_path: videoPath,
    output_path: path.join(projectDir, 'audio.wav'),
  });
  if (audioResult.status === 'error') throw new Error(audioResult.error);
  console.log(`[${ts()}] [Pipeline] Step 1: extract_audio done`);

  // Step 2: Extract slides first
  sendProgress(win, { stage: 'extracting_slides', progress: 0, message: '提取幻灯片中...' });
  console.log(`[${ts()}] [Pipeline] Step 2: extract_slides start`);
  const slidesResult = await bridge.send('extract_slides', {
    video_path: videoPath,
    output_dir: path.join(projectDir, 'slides'),
    threshold: settings.sceneThreshold || 8,
    min_scene_length: 1.5,
  });
  if (slidesResult.status === 'error') throw new Error(slidesResult.error);
  fs.writeFileSync(path.join(projectDir, 'slides-metadata.json'), JSON.stringify(slidesResult.data, null, 2));
  console.log(`[${ts()}] [Pipeline] Step 2: extract_slides done (${slidesResult.data.slides?.length || 0} slides)`);

  // Step 3: Transcribe audio
  sendProgress(win, { stage: 'transcribing', progress: 0, message: '语音转录中...' });
  console.log(`[${ts()}] [Pipeline] Step 3: transcribe start`);

  const transcriptFilePath = path.join(projectDir, 'audio.transcript.json');
  let transcriptData: any = null;

  try {
    const transcriptResult = await bridge.send('transcribe', {
      audio_path: path.join(projectDir, 'audio.wav'),
      model_size: settings.whisperModel,
      language: settings.whisperLanguage,
    });
    if (transcriptResult.status === 'error') throw new Error(transcriptResult.error);

    // Read from file path returned by Python
    const resultFile = transcriptResult.data?.transcript_file || transcriptFilePath;
    if (fs.existsSync(resultFile)) {
      transcriptData = JSON.parse(fs.readFileSync(resultFile, 'utf-8'));
    } else {
      transcriptData = transcriptResult.data;
    }
  } catch (err: any) {
    // Python likely crashed after writing transcript file — read from disk
    console.log(`[${ts()}] [Pipeline] Transcribe step error (likely CUDA crash): ${err.message}`);
    if (fs.existsSync(transcriptFilePath)) {
      console.log(`[${ts()}] [Pipeline] Recovering transcript from file`);
      transcriptData = JSON.parse(fs.readFileSync(transcriptFilePath, 'utf-8'));
    } else {
      throw new Error('Transcription failed and no result file found');
    }
  }

  // Save as transcript.json
  fs.writeFileSync(path.join(projectDir, 'transcript.json'), JSON.stringify(transcriptData, null, 2));
  console.log(`[${ts()}] [Pipeline] Step 3: transcribe done (${transcriptData.segments?.length || 0} segments)`);

  // Step 3.5: Extract PDF content (if provided)
  let pdfContent = '';
  if (params.pdfPaths && params.pdfPaths.length > 0) {
    console.log(`[${ts()}] [Pipeline] Step 3.5: extract_pdf start (${params.pdfPaths.length} files)`);
    sendProgress(win, { stage: 'extracting_slides', progress: 90, message: '提取课件内容...' });
    for (const pdfPath of params.pdfPaths) {
      try {
        const result = await bridge.send('extract_pdf', { pdf_path: pdfPath });
        if (result.status === 'success' && result.data.fullText) {
          pdfContent += result.data.fullText + '\n\n';
        }
      } catch (err: any) {
        console.warn(`[Pipeline] PDF extraction failed for ${pdfPath}: ${err.message}`);
      }
    }
    // Truncate to avoid overwhelming LLM
    if (pdfContent.length > 50000) {
      pdfContent = pdfContent.substring(0, 50000) + '\n\n[课件内容已截断]';
    }
    console.log(`[${ts()}] [Pipeline] Step 3.5: extract_pdf done (${pdfContent.length} chars)`);
  }

  // Step 4: Generate summary
  sendProgress(win, { stage: 'generating_summary', progress: 0, message: '生成课程总结中...' });
  console.log(`[${ts()}] [Pipeline] Step 4: generate_summary start`);
  const summaryResult = await bridge.send('generate_summary', {
    transcript_segments: transcriptData.segments,
    slides: slidesResult.data.slides,
    pdf_content: pdfContent,
    llm_config: {
      provider: settings.llmProvider,
      api_key: settings.llmApiKey,
      base_url: settings.llmBaseUrl,
      model: settings.llmModel,
      send_images: true,
    },
  });
  if (summaryResult.status === 'error') throw new Error(summaryResult.error);
  console.log(`[${ts()}] [Pipeline] Step 4: generate_summary done`);

  // Write notes
  const notesPath = path.join(projectDir, 'notes.md');
  fs.writeFileSync(notesPath, summaryResult.data.markdown);

  // Copy slide images to notes-images/
  const notesImagesDir = path.join(projectDir, 'notes-images');
  fs.mkdirSync(notesImagesDir, { recursive: true });
  for (const slide of slidesResult.data.slides) {
    const src = slide.filePath;
    if (fs.existsSync(src)) {
      const dst = path.join(notesImagesDir, path.basename(src));
      fs.copyFileSync(src, dst);
    }
  }

  // Step 4.5: Fill missing example screenshots
  try {
    console.log(`[${ts()}] [Pipeline] Step 4.5: fill_missing_slides start`);
    const fillResult = await bridge.send('fill_missing_slides', {
      notes_md: summaryResult.data.markdown,
      video_path: videoPath,
      output_dir: path.join(projectDir, 'slides'),
      existing_slide_count: slidesResult.data.slides?.length || 0,
    });

    if (fillResult.status === 'success' && fillResult.data.count > 0) {
      console.log(`[${ts()}] [Pipeline] Step 4.5: captured ${fillResult.data.count} missing slides`);

      // Copy new slide images to notes-images/
      for (const capture of fillResult.data.captures) {
        const src = capture.filePath;
        if (fs.existsSync(src)) {
          const dst = path.join(notesImagesDir, path.basename(src));
          fs.copyFileSync(src, dst);
        }
      }

      // Update notes with inserted image references
      if (fillResult.data.updated_notes) {
        fs.writeFileSync(notesPath, fillResult.data.updated_notes);
      }

      // Update slides metadata
      const allSlides = [...slidesResult.data.slides, ...fillResult.data.captures];
      fs.writeFileSync(
        path.join(projectDir, 'slides-metadata.json'),
        JSON.stringify({ slides: allSlides, count: allSlides.length }, null, 2),
      );
    } else {
      console.log(`[${ts()}] [Pipeline] Step 4.5: no missing slides to fill`);
    }
  } catch (err: any) {
    console.warn(`[Pipeline] Fill missing slides failed (non-fatal): ${err.message}`);
  }

  // Step 5: Extract knowledge points
  if (settings.flashcardAutoGenerate !== false) {
    console.log(`[${ts()}] [Pipeline] Step 5: extract_knowledge_points start`);
    sendProgress(win, { stage: 'generating_flashcards', progress: 0, message: '提取知识点...' });
    const flashcardResult = await bridge.send('extract_knowledge_points', {
      transcript_segments: transcriptData.segments,
      summary_markdown: summaryResult.data.markdown,
      llm_config: {
        provider: settings.llmProvider,
        api_key: settings.llmApiKey,
        base_url: settings.llmBaseUrl,
        model: settings.llmModel,
      },
    });

    if (flashcardResult.status === 'error') {
      console.warn('Flashcard generation failed:', flashcardResult.error);
    } else {
      const cards = flashcardResult.data.cards;
      const deck = {
        projectId: path.basename(projectDir),
        cards,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      fs.writeFileSync(path.join(projectDir, 'flashcards.json'), JSON.stringify(deck, null, 2));
    }
  }

  sendProgress(win, { stage: 'completed', progress: 100, message: '处理完成!' });
  return { notesPath };
}
