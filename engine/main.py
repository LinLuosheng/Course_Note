import sys
import json
import threading
from io_utils import emit

# Pre-load heavy modules in main thread BEFORE any threading.
# This avoids import-lock deadlock when two threads try to import
# torch/cv2 simultaneously.
emit({"status": "progress", "stage": "initializing", "progress": 0, "message": "正在加载引擎..."})

import cv2  # noqa: F401 — slide_extractor dependency
import torch  # noqa: F401 — whisper dependency

emit({"status": "progress", "stage": "initialized", "progress": 0, "message": "引擎就绪"})


def handle_extract_audio(params: dict) -> dict:
    from audio_extractor import extract_audio
    return extract_audio(params["video_path"], params["output_path"])


def handle_transcribe(params: dict) -> dict:
    from transcriber import transcribe
    result = transcribe(
        params["audio_path"],
        model_size=params.get("model_size", "large-v3"),
        language=params.get("language"),
    )
    return {"status": "success", "data": result}


def handle_extract_slides(params: dict) -> dict:
    from slide_extractor import extract_slides
    return extract_slides(
        params["video_path"],
        params["output_dir"],
        threshold=params.get("threshold", 30.0),
        min_scene_length=params.get("min_scene_length", 2.0),
    )


def handle_generate_summary(params: dict) -> dict:
    from summarizer import generate_summary

    def on_progress(stage, pct, message):
        emit({"status": "progress", "stage": stage, "progress": pct, "message": message})

    return generate_summary(
        params["transcript_segments"],
        params["slides"],
        params["llm_config"],
        pdf_content=params.get("pdf_content", ""),
        on_progress=on_progress,
    )


def handle_extract_knowledge_points(params: dict) -> dict:
    from flashcard_generator import extract_knowledge_points
    return extract_knowledge_points(
        params["transcript_segments"],
        params["summary_markdown"],
        params["llm_config"],
    )


def handle_tts_synthesize(params: dict) -> dict:
    from tts_engine import tts_synthesize
    return tts_synthesize(
        params["text"],
        params["model_dir"],
        params["output_path"],
        params.get("cfg_value", 2.0),
        params.get("inference_timesteps", 10),
        params.get("reference_wav_path"),
    )


def handle_tts_stream(params: dict) -> dict:
    from tts_engine import tts_stream_chunk
    return tts_stream_chunk(
        params["text"],
        params["model_dir"],
        params["output_dir"],
    )


def handle_check_voxcpm(params: dict) -> dict:
    from tts_engine import check_voxcpm_available
    return check_voxcpm_available(params["model_dir"])


def handle_release_voxcpm(params: dict) -> dict:
    from tts_engine import release_voxcpm
    return release_voxcpm()


def handle_extract_pdf(params: dict) -> dict:
    from pdf_extractor import extract_pdf
    return extract_pdf(params["pdf_path"])


def handle_fill_missing_slides(params: dict) -> dict:
    """Scan notes for examples without screenshots, capture frames at those timestamps."""
    from slide_extractor import capture_frames_at_times
    import re

    notes_md = params["notes_md"]
    video_path = params["video_path"]
    output_dir = params["output_dir"]
    existing_count = params.get("existing_slide_count", 0)

    # Parse notes: find sections with "例题" that have timestamps but no images nearby
    lines = notes_md.split("\n")
    missing_timestamps = []

    for i, line in enumerate(lines):
        # Look for example/problem markers
        is_example = bool(re.search(r'(例题|题目|真题|练习|Example)', line, re.IGNORECASE))
        if not is_example:
            continue

        # Check next ~5 lines for timestamp and whether there's an image
        block = "\n".join(lines[i:i + 6])
        has_image = bool(re.search(r'!\[.*?\]\(notes-images/', block))

        if has_image:
            continue

        # Extract timestamp from the block
        ts_match = re.search(r'\[(\d{1,2}):(\d{2})\]\(#t(\d+)\)', block)
        if ts_match:
            seconds = int(ts_match.group(3))
            missing_timestamps.append(float(seconds))

    if not missing_timestamps:
        return {"status": "success", "data": {"captures": [], "count": 0}}

    emit({"status": "progress", "stage": "filling_slides", "progress": 50,
          "message": f"补截 {len(missing_timestamps)} 张例题截图..."})

    new_slides = capture_frames_at_times(
        video_path, missing_timestamps, output_dir,
        start_number=existing_count,
    )

    # Insert image references into notes
    lines_new = lines.copy()
    for slide in new_slides:
        t = slide["timestamp"]
        fname = Path(slide["filePath"]).name
        mm = int(t) // 60
        ss = int(t) % 60
        ts_tag = f"[{mm:02d}:{ss:02d}](#t{int(t)})"

        # Find the line with matching timestamp and insert image after it
        for j, ln in enumerate(lines_new):
            if ts_tag in ln:
                # Insert image on next line
                img_line = f"\n![](notes-images/{fname})"
                lines_new[j] = ln + img_line
                break

    return {
        "status": "success",
        "data": {
            "captures": new_slides,
            "count": len(new_slides),
            "updated_notes": "\n".join(lines_new),
        },
    }


def handle_generate_questions(params: dict) -> dict:
    from question_engine import generate_practice_questions
    return generate_practice_questions(
        params["notes_md"],
        params["llm_config"],
        params.get("count", 10),
    )


def handle_tag_questions(params: dict) -> dict:
    from question_engine import tag_questions
    return tag_questions(
        params["questions"],
        params.get("existing_points", []),
        params["llm_config"],
    )


def handle_parse_document_questions(params: dict) -> dict:
    from question_engine import parse_document_questions
    return parse_document_questions(
        params["file_path"],
        params["llm_config"],
    )


HANDLERS = {
    "extract_audio": handle_extract_audio,
    "transcribe": handle_transcribe,
    "extract_slides": handle_extract_slides,
    "generate_summary": handle_generate_summary,
    "extract_knowledge_points": handle_extract_knowledge_points,
    "tts_synthesize": handle_tts_synthesize,
    "tts_stream": handle_tts_stream,
    "check_voxcpm": handle_check_voxcpm,
    "release_voxcpm": handle_release_voxcpm,
    "extract_pdf": handle_extract_pdf,
    "fill_missing_slides": handle_fill_missing_slides,
    "generate_questions": handle_generate_questions,
    "tag_questions": handle_tag_questions,
    "parse_document_questions": handle_parse_document_questions,
}


def _dispatch(cmd_id: str, action: str, params: dict):
    handler = HANDLERS.get(action)
    if not handler:
        emit({"id": cmd_id, "status": "error", "error": f"Unknown action: {action}"})
        return
    try:
        result = handler(params)
        result["id"] = cmd_id
        emit(result)
    except Exception as e:
        emit({"id": cmd_id, "status": "error", "error": str(e)})


def main():
    pool = []
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
        except json.JSONDecodeError as e:
            emit({"status": "error", "error": f"Invalid JSON: {e}"})
            continue

        action = cmd.get("action", "")
        params = cmd.get("params", {})
        cmd_id = cmd.get("id", "")

        t = threading.Thread(target=_dispatch, args=(cmd_id, action, params), daemon=True)
        t.start()
        pool.append(t)

        # Cleanup finished threads periodically
        if len(pool) > 10:
            pool[:] = [t for t in pool if t.is_alive()]


if __name__ == "__main__":
    main()
