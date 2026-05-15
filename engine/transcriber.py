import os
import sys
import json
import subprocess
from io_utils import emit

_BUNDLE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'model', 'whisper-large-v3')


def _find_model_dir() -> str | None:
    search_dirs = []
    env_root = os.environ.get('RESOURCES_ROOT')
    if env_root:
        search_dirs.append(os.path.join(env_root, 'model', 'whisper-large-v3'))
    search_dirs.append(os.path.abspath(_BUNDLE_DIR))
    for d in search_dirs:
        if os.path.isdir(d):
            return d
    return None


def _emit_progress(progress: int, message: str):
    emit({"status": "progress", "stage": "transcribing", "progress": progress, "message": message})


def _get_audio_duration(audio_path: str) -> float:
    try:
        import soundfile as sf
        info = sf.info(audio_path)
        return info.duration
    except Exception:
        pass
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
             '-of', 'default=noprint_wrappers=1:nokey=1', audio_path],
            stdin=subprocess.DEVNULL,
            capture_output=True, text=True, timeout=10
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0


def _fmt_time(seconds: float) -> str:
    m = int(seconds) // 60
    s = int(seconds) % 60
    return f"{m}:{s:02d}"


def transcribe(audio_path: str, model_size: str = "large-v3", language: str = None) -> dict:
    try:
        from faster_whisper import WhisperModel
        return _transcribe_faster(audio_path, model_size, language, WhisperModel)
    except ImportError:
        _emit_progress(3, "faster-whisper 未安装，使用原版 whisper...")
        return _transcribe_original(audio_path, model_size, language)
    except Exception as e:
        _emit_progress(3, f"faster-whisper 出错: {e}，回退原版 whisper...")
        return _transcribe_original(audio_path, model_size, language)


def _transcribe_faster(audio_path: str, model_size: str, language: str | None, WhisperModel) -> dict:
    import torch

    total_duration = _get_audio_duration(audio_path)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute = "int8_float16" if device == "cuda" else "int8"
    _emit_progress(2, f"加载 faster-whisper 模型 (设备: {device}, 精度: {compute})...")

    model = WhisperModel(model_size, device=device, compute_type=compute)
    _emit_progress(10, "模型就绪，正在分析音频...")

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
                _emit_progress(pct, f"正在转录 {_fmt_time(elapsed)} / {_fmt_time(total_duration)}")
        elif len(segments) % 5 == 0:
            pct = min(10 + len(segments), 89)
            if pct > last_pct:
                last_pct = pct
                _emit_progress(pct, f"正在转录... 已处理 {len(segments)} 个片段")

    _emit_progress(92, f"转录完成，共 {len(segments)} 个片段，正在整理...")

    # Sync CUDA before touching result data
    if torch.cuda.is_available():
        try:
            torch.cuda.synchronize()
        except Exception:
            pass

    result = {
        "segments": segments,
        "text": " ".join(s["text"] for s in segments),
        "language": info.language if hasattr(info, 'language') else "unknown",
    }

    # Write result to file IMMEDIATELY - before any cleanup that might crash
    import json as _json
    result_path = audio_path.replace(".wav", ".transcript.json")
    try:
        with open(result_path, "w", encoding="utf-8") as f:
            _json.dump(result, f, ensure_ascii=False)
        _emit_progress(95, "整理完成")
    except Exception as e:
        _emit_progress(95, f"保存结果失败: {e}")

    return {"transcript_file": result_path, "segment_count": len(segments), "language": result.get("language", "unknown")}


def _transcribe_original(audio_path: str, model_size: str, language: str | None) -> dict:
    import whisper
    import torch

    total_duration = _get_audio_duration(audio_path)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    _emit_progress(2, f"加载 whisper 模型 (设备: {device})...")

    model = whisper.load_model(model_size, device=device)
    dur_msg = f" ({_fmt_time(total_duration)})" if total_duration > 0 else ""
    _emit_progress(10, f"模型就绪，开始转录{dur_msg}...")

    kwargs = {}
    if language and language != "auto":
        kwargs["language"] = language

    result = model.transcribe(audio_path, **kwargs)

    segments = [
        {"start": round(s["start"], 2), "end": round(s["end"], 2), "text": s["text"].strip()}
        for s in result["segments"]
    ]

    _emit_progress(92, f"转录完成，共 {len(segments)} 个片段，正在整理...")

    out = {
        "segments": segments,
        "text": result["text"].strip(),
        "language": result.get("language", "unknown"),
    }

    import json as _json
    result_path = audio_path.replace(".wav", ".transcript.json")
    try:
        with open(result_path, "w", encoding="utf-8") as f:
            _json.dump(out, f, ensure_ascii=False)
        _emit_progress(95, "整理完成")
    except Exception as e:
        _emit_progress(95, f"保存结果失败: {e}")

    return {"transcript_file": result_path, "segment_count": len(segments), "language": out.get("language", "unknown")}
