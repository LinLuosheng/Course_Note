"""
批量 OCR 管道 - SiliconFlow Qwen3-VL
用法:
  python ocr_pipeline.py                    # 全部处理
  python ocr_pipeline.py --pdf 常识          # 只处理常识
  python ocr_pipeline.py --ocr-only          # 只做 OCR
  python ocr_pipeline.py --parse-only        # 只做 AI 解析
  python ocr_pipeline.py --match-only        # 只做答案匹配
"""
import os, sys, json, time, base64, re, argparse, urllib.request
from pathlib import Path
from datetime import datetime

# === Config ===
SF_URL = "https://api.siliconflow.cn/v1/chat/completions"
SF_KEY = os.environ.get("SILICONFLOW_API_KEY", "")
SF_MODEL = "Qwen/Qwen3-VL-32B-Instruct"

MM_URL = "https://api.minimaxi.com/v1/chat/completions"
MM_KEY = os.environ.get("MINIMAX_API_KEY", "")
MM_MODEL = "MiniMax-M2.5-highspeed"

BASE_DIR = Path(r"E:\share\project\mypro\课程总结\2026半月谈行测\半月谈最新版本\半月谈2026行测6000题")
OUT_DIR = Path(r"E:\share\project\mypro\课程总结\2026半月谈行测\pipeline_output")

PDF_PAIRS = [
    {"q": "常识题本.pdf", "a": "常识解析.pdf", "name": "常识判断", "slug": "changshi"},
    {"q": "言语题本.pdf", "a": "言语解析.pdf", "name": "言语理解", "slug": "yanyu"},
    {"q": "数量题本.pdf", "a": "数量解析.pdf", "name": "数量关系", "slug": "shuliang"},
    {"q": "判断题本.pdf", "a": "判断解析.pdf", "name": "判断推理", "slug": "panduan"},
    {"q": "资料题本.pdf", "a": "资料解析.pdf", "name": "资料分析", "slug": "ziliao"},
]

# === API helpers ===
def sf_call(img_b64, prompt, retries=3):
    payload = {
        "model": SF_MODEL,
        "messages": [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
            {"type": "text", "text": prompt},
        ]}],
        "max_tokens": 4096,
    }
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {SF_KEY}"}
    for i in range(retries):
        try:
            req = urllib.request.Request(SF_URL, data=json.dumps(payload).encode("utf-8"), headers=headers)
            with urllib.request.urlopen(req, timeout=180) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return {"ok": True, "content": data["choices"][0]["message"]["content"], "usage": data.get("usage", {})}
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            if e.code == 429:
                wait = 10 * (i + 1)
                print(f"    429 rate limited, wait {wait}s...")
                time.sleep(wait)
                continue
            return {"ok": False, "error": f"HTTP {e.code}: {body[:200]}"}
        except Exception as e:
            if i < retries - 1:
                time.sleep(5)
                continue
            return {"ok": False, "error": str(e)}
    return {"ok": False, "error": "max retries"}

def mm_call(prompt, system="", retries=2):
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    payload = {"model": MM_MODEL, "messages": messages, "max_tokens": 8000}
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {MM_KEY}"}
    for i in range(retries):
        try:
            req = urllib.request.Request(MM_URL, data=json.dumps(payload).encode("utf-8"), headers=headers)
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return {"ok": True, "content": data["choices"][0]["message"]["content"]}
        except:
            if i < retries - 1:
                time.sleep(3)
    return {"ok": False, "error": "mm call failed"}

# === PDF helpers ===
def pdf_page_b64(pdf_path, page_num, dpi=150):
    import fitz
    doc = fitz.open(pdf_path)
    page = doc[page_num]
    pix = page.get_pixmap(dpi=dpi)
    # Cap at 3000px width
    if pix.width > 3000:
        scale = 3000 / pix.width
        pix = page.get_pixmap(dpi=int(dpi * scale))
    jpg = pix.tobytes("jpeg")
    doc.close()
    return base64.b64encode(jpg).decode("utf-8")

def pdf_total_pages(pdf_path):
    import fitz
    doc = fitz.open(pdf_path)
    n = len(doc)
    doc.close()
    return n

# === Step 1: OCR ===
def ocr_pdf(pdf_path, output_path, skip_first=0):
    """OCR a PDF page by page, save to JSON with resume."""
    import fitz
    total = pdf_total_pages(pdf_path)

    results = []
    if os.path.exists(output_path):
        with open(output_path, "r", encoding="utf-8") as f:
            results = json.load(f)
        print(f"  Resume: {len(results)}/{total} pages done")

    start = max(skip_first, len(results))
    if start >= total:
        print(f"  Already complete ({total} pages)")
        return results

    for pn in range(start, total):
        try:
            img = pdf_page_b64(pdf_path, pn, dpi=150)
            if len(img) > 5_000_000:
                img = pdf_page_b64(pdf_path, pn, dpi=100)

            r = sf_call(img, "请完整识别图片中的所有文字，逐字不要遗漏不要编造，只输出文字。")

            if r["ok"]:
                results.append({"page": pn, "text": r["content"], "tokens": r["usage"].get("completion_tokens", 0)})
                t = r["usage"].get("completion_tokens", "?")
                print(f"  p{pn+1}/{total} OK ({t}tok)")
            else:
                results.append({"page": pn, "text": "", "error": r.get("error", "")[:200]})
                print(f"  p{pn+1}/{total} ERR: {r.get('error','')[:80]}")

            # Save every 3 pages
            if (pn + 1) % 3 == 0 or pn == total - 1:
                with open(output_path, "w", encoding="utf-8") as f:
                    json.dump(results, f, ensure_ascii=False, indent=2)

            time.sleep(0.3)

        except KeyboardInterrupt:
            print("\n  Interrupted! Progress saved.")
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
            break

    print(f"  Done: {len(results)} pages saved")
    return results

# === Step 2: AI Parse ===
PARSE_PROMPT = """将以下考试题OCR文本解析为结构化JSON。

要求：
1. 每道题一个对象，包含 content, options, answer(留空), explanation(留空), difficulty, knowledgePoints, sourceSection
2. 选择题 options 格式: ["A. ...", "B. ...", "C. ...", "D. ..."]
3. difficulty: easy/medium/hard 根据内容判断
4. knowledgePoints: 1-3个知识点标签
5. sourceSection: 所属专练名称(如"专练一")
6. OCR乱码或无法识别的题目跳过
7. 只输出JSON数组，不要其他文字

OCR文本:
{text}"""

def parse_pages(ocr_file, output_file, batch_size=3):
    """Parse OCR text into structured questions using AI."""
    with open(ocr_file, "r", encoding="utf-8") as f:
        pages = json.load(f)

    valid = [p for p in pages if p.get("text") and len(p["text"]) > 50 and not p.get("error")]
    print(f"  {len(valid)} valid pages to parse")

    all_questions = []
    if os.path.exists(output_file):
        with open(output_file, "r", encoding="utf-8") as f:
            all_questions = json.load(f)

    # Calculate how many batches already done
    done_batches = len(all_questions) // 5  # rough estimate
    start_batch = max(0, done_batches)

    for i in range(start_batch, len(valid), batch_size):
        batch = valid[i:i+batch_size]
        text = "\n\n---\n\n".join(f"[第{p['page']+1}页]\n{p['text']}" for p in batch)

        r = mm_call(PARSE_PROMPT.format(text=text[:6000]), "你是题目结构化专家。")

        if r["ok"]:
            content = r["content"]
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            try:
                qs = json.loads(content.strip())
                for q in qs:
                    q["id"] = f"q_{len(all_questions):04d}"
                    q["source"] = "imported"
                    q["createdAt"] = int(time.time() * 1000)
                    if "answer" not in q: q["answer"] = ""
                    if "explanation" not in q: q["explanation"] = ""
                all_questions.extend(qs)
                print(f"  Batch {i//batch_size+1}: +{len(qs)} questions (total: {len(all_questions)})")
            except json.JSONDecodeError:
                print(f"  Batch {i//batch_size+1}: JSON parse error, skipping")
        else:
            print(f"  Batch {i//batch_size+1}: API error")

        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(all_questions, f, ensure_ascii=False, indent=2)
        time.sleep(1)

    print(f"  Total: {len(all_questions)} questions")
    return all_questions

# === Step 3: Match Answers ===
MATCH_PROMPT = """根据解析册文本，为以下题目填入正确答案和解析。

题目列表：
{questions}

解析册文本：
{answers}

输出JSON数组（与题目顺序一致）：
[{{"index": 0, "answer": "A", "explanation": "..."}}]

找不到答案的题 answer 留空。只输出JSON数组。"""

def match_answers(question_file, answer_ocr_file, output_file, batch_size=30):
    with open(question_file, "r", encoding="utf-8") as f:
        questions = json.load(f)
    with open(answer_ocr_file, "r", encoding="utf-8") as f:
        answer_pages = json.load(f)

    answer_text = "\n".join(p["text"] for p in answer_pages if p.get("text"))

    matched = 0
    for i in range(0, len(questions), batch_size):
        batch = questions[i:i+batch_size]
        q_text = json.dumps([{"idx": j, "content": q["content"][:80]} for j, q in enumerate(batch)],
                           ensure_ascii=False)

        r = mm_call(MATCH_PROMPT.format(questions=q_text, answers=answer_text[i*300:(i+5)*300]))

        if r["ok"]:
            content = r["content"]
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            try:
                answers = json.loads(content.strip())
                for a in answers:
                    idx = a.get("index", -1)
                    if 0 <= idx < len(batch):
                        batch[idx]["answer"] = a.get("answer", "")
                        batch[idx]["explanation"] = a.get("explanation", "")
                        if a.get("answer"):
                            matched += 1
            except:
                pass

        print(f"  Matched {i}-{i+len(batch)}/{len(questions)}, running total: {matched}")
        time.sleep(0.5)

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)
    print(f"  Final: {matched}/{len(questions)} answers matched")
    return questions

# === Main ===
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", help="Filter by name (e.g. 常识)")
    parser.add_argument("--ocr-only", action="store_true")
    parser.add_argument("--parse-only", action="store_true")
    parser.add_argument("--match-only", action="store_true")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pairs = PDF_PAIRS
    if args.pdf:
        pairs = [p for p in pairs if args.pdf in p["name"] or args.pdf in p["q"]]
        if not pairs:
            print(f"No match for '{args.pdf}'"); return

    for pair in pairs:
        slug = pair["slug"]
        q_pdf = BASE_DIR / pair["q"]
        a_pdf = BASE_DIR / pair["a"]
        q_ocr = OUT_DIR / f"{slug}_q_ocr.json"
        a_ocr = OUT_DIR / f"{slug}_a_ocr.json"
        q_parsed = OUT_DIR / f"{slug}_questions.json"
        final = OUT_DIR / f"{slug}_final.json"

        print(f"\n{'='*50}")
        print(f"  {pair['name']} ({pair['q']})")
        print(f"{'='*50}")

        # Step 1: OCR
        if not args.parse_only and not args.match_only:
            if q_pdf.exists():
                print(f"\n[OCR 题本]")
                ocr_pdf(str(q_pdf), str(q_ocr), skip_first=6)
            if a_pdf.exists():
                print(f"\n[OCR 解析]")
                ocr_pdf(str(a_pdf), str(a_ocr), skip_first=6)

        if args.ocr_only:
            continue

        # Step 2: Parse
        if not args.match_only:
            if q_ocr.exists():
                print(f"\n[AI 解析]")
                parse_pages(str(q_ocr), str(q_parsed))

        if args.parse_only:
            continue

        # Step 3: Match
        if q_parsed.exists() and a_ocr.exists():
            print(f"\n[匹配答案]")
            import shutil
            shutil.copy(str(q_parsed), str(final))
            match_answers(str(final), str(a_ocr), str(final))

    print("\n\nAll done! Output:", OUT_DIR)

if __name__ == "__main__":
    main()
