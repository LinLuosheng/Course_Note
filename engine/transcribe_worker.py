"""Subprocess worker for transcription - isolated from main process.

If CTranslate2/CUDA crashes here, the main process survives and reads
the result from the output file.
"""
import os
import sys
import json


def _emit(progress: int, message: str):
    print(json.dumps({"status": "progress", "progress": progress, "message": message}, flush=True)


def _fmt_time(seconds: float) -> str:
    m = int(seconds) // 60
    s = int(seconds) % 60
    return f"{m}:{s:02d}"


def _get_audio_duration(audio_path: str) -> float:
    try:
        import soundfile as sf
        info = sf.info(audio_path)
        return info.duration
    except Exception:
        pass
    try:
        import subprocess
        result = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
             '-of', 'default=noprint_wrappers=1:nokey=1', audio_path],
            stdin=subprocess.DEVNULL,
            capture_output=True, text=True, timeout=10
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0


def run(params_file: str, result_file: str):
    with open(params_file, "r", encoding="utf-8") as f:
        params = json.load(f)

    audio_path = params["audio_path"]
    model_size = params.get("model_size", "large-v3")
    language = params.get("language")

    total_duration = _get_audio_duration(audio_path)

    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"

    try:
        from faster_whisper import WhisperModel
        compute = "int8_float16" if device == "cuda" else "int8"
        _emit(2, f"加载 faster-whisper (设备: {device}, 精度: {compute})...")
        model = WhisperModel(model_size, device=device, compute_type=compute)
    except ImportError:
        import whisper
        _emit(2, f"加载 whisper 模型 (设备: {device})...")
        model = whisper.load_model(model_size, device=device)
        # Use original whisper API
        kwargs = {}
        if language and language != "auto":
            kwargs["language"] = language
        result = model.transcribe(audio_path, **kwargs)
        segments = [
            {"start": round(s["start"], 2), "end": round(s["end"], 2), "text": s["text"].strip()}
            for s in result["segments"]
        ]
        out = {"segments": segments, "text": result["text"].strip(), "language": result.get("language", "unknown")}
        _write_result(result_file, out)
        return

    _emit(10, "模型就绪，正在分析音频...")

    kwargs = {}
    if language and language != "auto":
        kwargs["language"] = language

    segments_iter, info = model.transcribe(audio_path, **kwargs)

    segments = []
    last_pct = 10
    for seg in segments_iter:
        segments.append({
            "start": round(seg.start, 2),
            "end": round(seg.end, 2),
            "text": seg.text.strip(),
        })
        if total_duration > 0:
            elapsed = seg.end
            pct = min(int(10 + (elapsed / total_duration) * 80), 89)
            if pct > last_pct:
                last_pct = pct
                _emit(pct, f"正在转录 {_fmt_time(elapsed)} / {_fmt_time(total_duration)}")
        elif len(segments) % 5 == 0:
            pct = min(10 + len(segments), 89)
            if pct > last_pct:
                last_pct = pct
                _emit(pct, f"正在转录... 已处理 {len(segments)} 个片段")

    _emit(92, f"转录完成，共 {len(segments)} 个片段，正在整理...")

    # Write result to file IMMEDIATELY - don't wait for cleanup
    result = {
        "segments": segments,
        "text": " ".join(s["text"] for s in segments),
        "language": info.language if hasattr(info, 'language') else "unknown",
    }
    _write_result(result_file, result)
    _emit(95, "整理完成")


def _write_result(result_file: str, result: dict):
    """Write result atomically via temp file."""
    tmp = result_file + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    os.replace(tmp, result_file)


if __name__ == "__main__":
    params_file = sys.argv[1]
    result_file = sys.argv[2]
    try:
        run(params_file, result_file)
    except Exception as e:
        _emit(0, f"转录失败: {e}")
        # Still try to write error info
        try:
            _write_result(result_file, {"error": str(e), "segments": [], "text": "", "language": "unknown"})
        except Exception:
            pass
