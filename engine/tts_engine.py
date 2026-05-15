"""VoxCPM2 TTS engine for text-to-speech synthesis."""

import os
import sys
import json

_voxcpm_model = None


def _load_voxcpm(model_dir: str):
    global _voxcpm_model
    if _voxcpm_model is not None:
        return

    from voxcpm import VoxCPM

    print(json.dumps({"status": "progress", "message": "加载 VoxCPM2 语音模型..."}), flush=True)
    _voxcpm_model = VoxCPM.from_pretrained(model_dir, load_denoiser=False)


def tts_synthesize(
    text: str,
    model_dir: str,
    output_path: str,
    cfg_value: float = 2.0,
    inference_timesteps: int = 10,
    reference_wav_path: str | None = None,
) -> dict:
    """Synthesize speech from text using VoxCPM2."""
    try:
        _load_voxcpm(model_dir)

        import soundfile as sf

        kwargs: dict = {
            "text": text,
            "cfg_value": cfg_value,
            "inference_timesteps": inference_timesteps,
        }
        if reference_wav_path and os.path.isfile(reference_wav_path):
            kwargs["reference_wav_path"] = reference_wav_path

        wav = _voxcpm_model.generate(**kwargs)

        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        sf.write(output_path, wav, _voxcpm_model.tts_model.sample_rate)

        return {"status": "success", "data": {"audioPath": output_path}}

    except Exception as e:
        return {"status": "error", "error": str(e)}


def tts_stream_chunk(text: str, model_dir: str, output_dir: str) -> dict:
    """Synthesize speech in chunks for streaming playback."""
    try:
        _load_voxcpm(model_dir)

        import soundfile as sf
        import numpy as np

        os.makedirs(output_dir, exist_ok=True)

        chunks = []
        for i, chunk in enumerate(_voxcpm_model.generate_streaming(
            text=text,
            cfg_value=2.0,
            inference_timesteps=10,
        )):
            chunk_path = os.path.join(output_dir, f"chunk_{i:04d}.wav")
            sf.write(chunk_path, chunk, _voxcpm_model.tts_model.sample_rate)
            chunks.append(chunk_path)

        # Concatenate all chunks into one file
        all_audio = []
        for cp in chunks:
            data, _ = sf.read(cp)
            all_audio.append(data)
            os.remove(cp)

        if all_audio:
            full_path = os.path.join(output_dir, "full.wav")
            full_audio = np.concatenate(all_audio)
            sf.write(full_path, full_audio, _voxcpm_model.tts_model.sample_rate)
            return {"status": "success", "data": {"audioPath": full_path}}

        return {"status": "error", "error": "No audio generated"}

    except Exception as e:
        return {"status": "error", "error": str(e)}


def check_voxcpm_available(model_dir: str) -> dict:
    """Check if VoxCPM2 model weights exist."""
    model_path = os.path.abspath(model_dir)
    if not os.path.isdir(model_path):
        return {"status": "success", "data": {"available": False, "modelPath": model_path}}

    has_weights = os.path.isfile(os.path.join(model_path, "model.safetensors"))
    has_vae = os.path.isfile(os.path.join(model_path, "audiovae.pth"))
    return {
        "status": "success",
        "data": {
            "available": has_weights and has_vae,
            "modelPath": model_path,
        },
    }


def release_voxcpm() -> dict:
    """Release VoxCPM2 model from GPU memory."""
    global _voxcpm_model
    try:
        import torch
        if _voxcpm_model is not None:
            del _voxcpm_model
            _voxcpm_model = None
            torch.cuda.empty_cache()
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "error": str(e)}
