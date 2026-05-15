import json
import re
import time
from openai import OpenAI


EXTRACT_PROMPT = """你是一个课程知识提取专家，专门为间隔重复记忆系统设计填空卡片。

根据以下课程转录文本和总结，提取适合填空记忆的核心知识点。

要求：
1. 每个知识点生成一张填空卡片，包含以下字段：
   - type: "concept"(概念定义), "formula"(公式), "number"(关键数字/百分数), "rule"(规则/口诀/方法)
   - text: 包含填空标记的完整文本。用 {{c1::答案}} 标记需要记忆的内容。一张卡片可以有1-3个填空(c1, c2, c3)。
     示例："高位叠加法的口诀是{{c1::层层错位相加}}，只保留前{{c2::三}}位"
   - clozes: 填空答案的数组，按 c 编号顺序排列，如 ["层层错位相加", "三"]
   - source_section: 来自总结的哪个章节
   - timestamp: 相关视频时间点（秒），如果有的话

2. 提取 10-20 个最核心的知识点
3. 优先提取：
   - 关键公式和常数（如百化分: 1/7≈14.3%）
   - 核心概念定义
   - 方法和口诀
   - 易错规则和注意事项
4. text 用课程原始语言撰写
5. 每个填空应该是需要主动回忆的关键信息，而不是装饰性内容
6. 返回 JSON 数组

课程总结：
{summary}

课程转录片段：
{transcript}
"""


def extract_knowledge_points(
    transcript_segments: list,
    summary_markdown: str,
    llm_config: dict,
) -> dict:
    transcript_text = _format_transcript(transcript_segments, max_chars=40000)

    prompt = EXTRACT_PROMPT.format(
        summary=summary_markdown[:10000],
        transcript=transcript_text[:30000],
    )

    try:
        client = OpenAI(
            api_key=llm_config.get("api_key") or "ollama",
            base_url=llm_config.get("base_url", "https://api.openai.com/v1"),
        )
        model = llm_config.get("model", "gpt-4o")

        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "你是知识提取专家，只返回JSON数组，不要其他文字。"},
                {"role": "user", "content": prompt},
            ],
            max_tokens=8000,
            temperature=0.3,
        )

        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]

        try:
            cards = json.loads(content)
        except json.JSONDecodeError:
            cards = _repair_json_array(content)

        validated = []
        now = time.time()
        for i, card in enumerate(cards[:20]):
            card = _validate_clozes(card)
            validated.append({
                "id": f"card_{i:04d}",
                "type": card.get("type", "concept"),
                "text": card.get("text", ""),
                "clozes": card.get("clozes", []),
                "sourceSection": card.get("source_section", ""),
                "timestamp": card.get("timestamp"),
                "createdAt": now,
            })

        return {"status": "success", "data": {"cards": validated}}

    except Exception as e:
        return {"status": "error", "error": str(e)}


def _validate_clozes(card: dict) -> dict:
    """Ensure cloze syntax is consistent: text has {{cN::...}} matching clozes array."""
    text = card.get("text", "")
    found = re.findall(r'\{\{c(\d+)::([^}]+)\}\}', text)
    if not found and card.get("clozes"):
        for i, answer in enumerate(card["clozes"]):
            text = text.replace(answer, f"{{{{c{i+1}::{answer}}}}}", 1)
        card["text"] = text
    elif found and not card.get("clozes"):
        card["clozes"] = [ans for _, ans in sorted(found, key=lambda x: int(x[0]))]
    return card


def _repair_json_array(content: str) -> list:
    """Try to repair a truncated JSON array by finding complete objects."""
    objects = []
    depth = 0
    start = None
    in_string = False
    escape = False

    for i, ch in enumerate(content):
        if escape:
            escape = False
            continue
        if ch == '\\' and in_string:
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == '{':
            if depth == 0:
                start = i
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0 and start is not None:
                try:
                    obj = json.loads(content[start:i+1])
                    objects.append(obj)
                except json.JSONDecodeError:
                    pass
                start = None

    if not objects:
        raise json.JSONDecodeError("Could not repair JSON", content, 0)
    return objects


def _format_transcript(segments: list, max_chars: int = 40000) -> str:
    lines = []
    total = 0
    for seg in segments:
        mm = int(seg["start"]) // 60
        ss = int(seg["start"]) % 60
        line = f"[{mm:02d}:{ss:02d}] {seg['text']}"
        if total + len(line) > max_chars:
            break
        lines.append(line)
        total += len(line) + 1
    return "\n".join(lines)
