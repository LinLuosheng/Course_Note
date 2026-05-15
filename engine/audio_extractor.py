import os
import subprocess
import sys


def _find_ffmpeg() -> str:
    """Locate ffmpeg executable, prioritizing the bundled copy."""
    # 1. Environment variable injected by Electron
    env_root = os.environ.get('RESOURCES_ROOT')
    if env_root:
        bundled = os.path.join(env_root, 'bin', 'ffmpeg.exe')
        if os.path.isfile(bundled):
            return bundled
    # 2. Relative to engine dir (dev environment)
    engine_dir = os.path.dirname(os.path.abspath(__file__))
    bundled = os.path.join(engine_dir, "..", "bin", "ffmpeg.exe")
    if os.path.isfile(bundled):
        return os.path.abspath(bundled)
    # 3. System PATH
    for candidate in ["ffmpeg", "ffmpeg.exe"]:
        try:
            result = subprocess.run(
                ["where" if sys.platform == "win32" else "which", candidate],
                stdin=subprocess.DEVNULL,
                capture_output=True, text=True,
            )
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip().splitlines()[0]
        except Exception:
            pass
    return "ffmpeg"


def extract_audio(video_path: str, output_path: str) -> dict:
    try:
        ffmpeg_path = _find_ffmpeg()
        result = subprocess.run(
            [ffmpeg_path, "-y", "-i", video_path,
             "-ac", "1", "-ar", "16000", "-f", "wav", "-acodec", "pcm_s16le",
             output_path],
            stdin=subprocess.DEVNULL,
            capture_output=True, text=True,
            timeout=600,
        )
        if result.returncode == 0:
            return {"status": "success", "data": {"audio_path": output_path}}
        return {"status": "error", "error": result.stderr[:500] or f"ffmpeg exit code {result.returncode}"}
    except subprocess.TimeoutExpired:
        return {"status": "error", "error": "ffmpeg timed out (600s)"}
    except Exception as e:
        return {"status": "error", "error": str(e)}
