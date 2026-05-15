import cv2
import numpy as np
from pathlib import Path
from PIL import Image
from io_utils import emit


def _save_frame(frame, filepath):
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    Image.fromarray(rgb).save(filepath, quality=90)


PERIODIC_INTERVAL = 20.0  # 每 20 秒定期截图
PERIODIC_DIFF_SKIP = 3.0  # 定期截图时，差异小于此值则跳过
PHASH_SIMILAR_THRESHOLD = 0.90  # 感知哈希相似度超过此值认为是重复


def _compute_phash(gray):
    """Compute perceptual hash (pHash) as a 64-bit integer."""
    resized = cv2.resize(gray, (32, 32))
    dct = cv2.dct(resized.astype(np.float32))
    dct_low = dct[:8, :8].flatten()
    median = np.median(dct_low)
    bits = (dct_low > median).astype(np.uint8)
    hash_val = 0
    for b in bits:
        hash_val = (hash_val << 1) | int(b)
    return hash_val


def _phash_similarity(h1, h2):
    """Hamming distance based similarity: 1.0 = identical, 0.0 = totally different."""
    xor = h1 ^ h2
    diff_bits = bin(xor).count('1')
    return 1.0 - diff_bits / 64.0


def extract_slides(
    video_path: str,
    output_dir: str,
    threshold: float = 8.0,
    min_scene_length: float = 0.8,
) -> dict:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {"status": "error", "error": "Cannot open video"}

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        cap.release()
        return {"status": "error", "error": "Cannot determine video FPS"}

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    total_duration = total_frames / fps if fps > 0 else 0
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    slides = []
    saved_hashes = []  # pHash values of all saved slides
    prev_gray = None
    last_save_gray = None
    last_save_time = -min_scene_length
    last_periodic_time = 0.0

    sample_interval = max(1, int(fps / 3))

    def _is_duplicate(gray):
        """Check if this frame is too similar to any previously saved slide."""
        h = _compute_phash(gray)
        for existing_h in saved_hashes:
            if _phash_similarity(h, existing_h) >= PHASH_SIMILAR_THRESHOLD:
                return True
        return False

    def _save_slide(frame, current_time):
        nonlocal last_save_gray, last_save_time, last_periodic_time
        gray = _to_gray(frame)
        # Skip if too similar to an existing slide
        if _is_duplicate(gray):
            return False
        slide_num = len(slides)
        filename = f"slide_{slide_num:04d}.jpg"
        filepath = str(Path(output_dir) / filename)
        _save_frame(frame, filepath)
        slides.append({
            "timestamp": round(current_time, 2),
            "filePath": filepath,
            "slideNumber": slide_num,
        })
        saved_hashes.append(_compute_phash(gray))
        last_save_gray = gray
        last_save_time = current_time
        return True

    # Save the very first frame
    ret, frame = cap.read()
    if ret:
        _save_slide(frame, 0.0)
        prev_gray = _to_gray(frame)
        last_periodic_time = 0.0

    frame_count = 0
    while True:
        frame_count += sample_interval
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_count)
        ret, frame = cap.read()
        if not ret:
            break

        current_time = frame_count / fps
        gray = _to_gray(frame)

        if prev_gray is not None:
            score = _scene_diff(prev_gray, gray)
            can_save = (current_time - last_save_time) >= min_scene_length

            # Scene change detection
            if score > threshold and can_save:
                saved = _save_slide(frame, current_time)
                if saved:
                    last_periodic_time = current_time

            # Periodic screenshot
            elif (current_time - last_periodic_time) >= PERIODIC_INTERVAL:
                if last_save_gray is not None:
                    periodic_score = _scene_diff(last_save_gray, gray)
                    if periodic_score > PERIODIC_DIFF_SKIP:
                        _save_slide(frame, current_time)
                else:
                    _save_slide(frame, current_time)
                last_periodic_time = current_time

            prev_gray = gray

        if frame_count % (sample_interval * 50) == 0 and total_duration > 0:
            progress = round(current_time / total_duration * 100, 1)
            emit({
                "status": "progress",
                "stage": "extracting_slides",
                "progress": progress,
                "message": f"提取幻灯片 {int(current_time)}s/{int(total_duration)}s ({len(slides)} 张)",
            })

    cap.release()
    return {"status": "success", "data": {"slides": slides, "count": len(slides)}}


def _to_gray(frame):
    small = cv2.resize(frame, (320, 180))
    return cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)


def capture_frames_at_times(
    video_path: str,
    timestamps: list[float],
    output_dir: str,
    start_number: int = 0,
) -> list[dict]:
    """Capture frames from video at specific timestamps.

    Returns list of {timestamp, filePath, slideNumber} for each captured frame.
    """
    if not timestamps:
        return []

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []

    fps = cap.get(cv2.CAP_PROP_FPS)
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    results = []
    slide_num = start_number

    for t in timestamps:
        frame_no = int(t * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_no)
        ret, frame = cap.read()
        if not ret:
            continue

        filename = f"slide_{slide_num:04d}.jpg"
        filepath = str(Path(output_dir) / filename)
        _save_frame(frame, filepath)
        results.append({
            "timestamp": round(t, 2),
            "filePath": filepath,
            "slideNumber": slide_num,
        })
        slide_num += 1

    cap.release()
    return results


def _scene_diff(prev_gray, curr_gray):
    hist_prev = cv2.calcHist([prev_gray], [0], None, [256], [0, 256])
    hist_curr = cv2.calcHist([curr_gray], [0], None, [256], [0, 256])
    cv2.normalize(hist_prev, hist_prev)
    cv2.normalize(hist_curr, hist_curr)
    hist_corr = cv2.compareHist(hist_prev, hist_curr, cv2.HISTCMP_CORREL)
    hist_score = (1.0 - hist_corr) * 100

    diff = np.abs(prev_gray.astype(np.float32) - curr_gray.astype(np.float32))
    pixel_score = np.mean(diff) * 2

    return max(hist_score, pixel_score)
