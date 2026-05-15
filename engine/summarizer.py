import base64
import json
import re
from pathlib import Path
from openai import OpenAI


SYSTEM_PROMPT = """你是一位专业的课程笔记整理助手。根据视频转录文本和幻灯片信息，生成结构清晰、内容准确的 Markdown 课程笔记。

## 输出要求

1. 使用 `##` 作为大标题，`###` 作为小标题
2. 在每个知识点开头插入时间戳链接：`[MM:SS](#tSECONDS)`
3. **每个章节、知识点、例题都必须插入对应的幻灯片截图** `![](notes-images/slide_XXXX.jpg)`
4. 用 **加粗** 标记关键术语
5. 用无序列表列出要点
6. 用 `> 引用块` 标注重要结论或口诀
7. 末尾添加 `## 要点总结` 章节
8. 使用与转录文本相同的语言

## 截图插入规则（必须严格遵守）

"Extracted Slide Information" 部分列出了所有可用的幻灯片截图及其时间。

- **每个章节标题后**必须紧跟该时间段内最近的截图
- **每个例题**必须插入对应的题目截图（通常在例题开始前后的时间点）
- 插入方式：直接复制 Slide Information 中的 `![](notes-images/slide_XXXX.jpg)` 到笔记中
- 如果某个时间段有多张截图，全部插入（代表内容在变化）
- 不要遗漏任何有截图的章节

## 时间戳规则（必须严格遵守）

笔记中每个知识点开头必须插入时间戳：`[MM:SS](#tSECONDS)`

**时间戳必须精确引用转录文本中已有的时间，禁止自己编造或估算。**
具体做法：
1. 找到该知识点对应的转录片段
2. 使用该片段的 [MM:SS] 时间作为时间戳
3. SECONDS = 转录文本中括号内的秒数，直接抄过来
4. 一个章节/知识点只用一个时间戳，取该部分第一个转录片段的时间

错误示例（编造时间）：笔记在 05:30 附近的内容，但转录文本中该位置实际是 [05:27]
正确示例（引用时间）：找到 "鸡兔同笼问题" 对应的转录片段 [05:27]，写入 [05:27](#t327)

## 转录纠错

转录文本由语音识别生成，可能包含同音字错误。你必须根据上下文语义自动修正明显的错误，例如：
- "素算技巧" → "速算技巧"
- "尾数法" → "尾数法"（如果上下文正确则保留）
- "鸡兔同龙" → "鸡兔同笼"
- 专有名词、术语、人名等应根据上下文推断正确用字

## 严格禁止

- 不要输出你的思考过程、推理过程、猜测过程
- 不要写"推测"、"可能"、"待确认"、"重新核对"、"视频中实际"、"不对"等不确定内容
- 不要在笔记中自我对话或自问自答
- 不要添加笔记中没有的内容
- **例题和计算**：只记录转录文本中明确提到的数字和结果。如果听不清具体计算过程，只记录题目和最终答案，不要自己脑补中间步骤。宁可省略不确定的细节，也不要编造。

## 风格

- 语言简洁、结构化，像一份优质的课堂笔记
- 只整理视频中实际讲授的内容，不发散、不脑补
- 公式和数字必须准确，直接引用转录文本中的内容
"""

OUTLINE_PROMPT = """你是一位专业的课程结构分析助手。根据视频转录文本，将课程内容按逻辑分章。

## 输出格式

返回纯 JSON 数组（不要 markdown 代码块），每个元素是一个章节：
[
  {
    "title": "章节标题",
    "startSegment": 0,
    "endSegment": 100,
    "summary": "1-2句话概述本节内容"
  }
]

## 规则

- startSegment/endSegment 是转录片段的索引号（从0开始）
- 按内容逻辑分章，不要按时间均匀切分
- 一般课程分为 6-15 个章节
- 章节之间不要有间隔，endSegment 应等于下一章的 startSegment
- 最后一章的 endSegment 应等于总片段数
"""

SECTION_SYSTEM_PROMPT = SYSTEM_PROMPT + """

## 额外说明

你正在处理课程的某一个章节。请只整理本章节范围内的转录内容，不要添加其他章节的内容。
"""

TWO_STAGE_THRESHOLD = 40000  # chars — below this, use single-stage


def generate_summary(
    transcript_segments: list,
    slides: list,
    llm_config: dict,
    pdf_content: str = "",
    on_progress=None,
) -> dict:
    transcript_text = _format_transcript(transcript_segments)

    # Short transcript: single-stage (backward compatible)
    if len(transcript_text) < TWO_STAGE_THRESHOLD:
        return _generate_single_stage(
            transcript_segments, transcript_text, slides, llm_config, pdf_content, on_progress
        )

    # Long transcript: two-stage
    return _generate_two_stage(
        transcript_segments, transcript_text, slides, llm_config, pdf_content, on_progress
    )


def _generate_single_stage(
    segments, transcript_text, slides, llm_config, pdf_content, on_progress
):
    if on_progress:
        on_progress("generating_summary", 0, "生成课程总结中...")

    provider = llm_config.get("provider", "openai")
    slide_refs = _format_slide_references(slides)
    pdf_section = f"\n## Course Material (PDF)\n{pdf_content}" if pdf_content else ""

    user_prompt = f"""## Video Transcript (with timestamps)

{transcript_text}

## Extracted Slide Information

{slide_refs}
{pdf_section}

---

Please generate a comprehensive course summary in Markdown format."""

    result = _call_llm(user_prompt, slides, llm_config, SYSTEM_PROMPT)

    if on_progress:
        on_progress("generating_summary", 100, "总结完成")

    if result["status"] == "success":
        result["data"]["markdown"] = _fix_timestamps(result["data"]["markdown"])

    return result


def _generate_two_stage(
    segments, transcript_text, slides, llm_config, pdf_content, on_progress
):
    provider = llm_config.get("provider", "openai")

    # Stage 1: Generate outline
    if on_progress:
        on_progress("generating_outline", 0, "生成课程大纲中...")

    outline = _generate_outline(segments, transcript_text, llm_config)

    if not outline:
        # Fallback to single-stage if outline fails
        return _generate_single_stage(
            segments, transcript_text, slides, llm_config, pdf_content, on_progress
        )

    if on_progress:
        on_progress("generating_outline", 100, f"大纲生成完成，共 {len(outline)} 个章节")

    # Stage 2: Generate per-section notes
    all_sections = []
    total_sections = len(outline)

    for i, section in enumerate(outline):
        start = section["startSegment"]
        end = section["endSegment"]
        section_segs = segments[start:end]

        if not section_segs:
            continue

        if on_progress:
            pct = int(10 + (i / total_sections) * 85)
            on_progress(
                "generating_section",
                pct,
                f"生成章节笔记 ({i+1}/{total_sections}): {section['title']}",
            )

        section_text = _format_transcript(section_segs)
        section_slides = _get_slides_in_range(slides, start, end, segments)

        pdf_section = f"\n## Course Material (PDF)\n{pdf_content}" if pdf_content else ""
        outline_context = "\n".join(
            f"- {s['title']}: {s['summary']}" for s in outline
        )

        user_prompt = f"""## 课程大纲

{outline_context}

## 当前章节: {section['title']}

{section['summary']}

## 当前章节转录文本 (片段 {start}-{end})

{section_text}

## 相关幻灯片

{_format_slide_references(section_slides)}
{pdf_section}

---

请为「{section['title']}」这一章节生成详细的 Markdown 笔记。保持时间戳连续（基于原始视频时间）。"""

        result = _call_llm(user_prompt, section_slides, llm_config, SECTION_SYSTEM_PROMPT)
        if result["status"] == "success":
            all_sections.append(_fix_timestamps(result["data"]["markdown"]))

    if on_progress:
        on_progress("generating_summary", 95, "合并笔记中...")

    full_markdown = _fix_timestamps("\n\n".join(all_sections))
    return {
        "status": "success",
        "data": {
            "markdown": full_markdown,
            "outline": outline,
            "token_usage": {"prompt": 0, "completion": 0},
        },
    }


def _generate_outline(segments, transcript_text, llm_config):
    user_prompt = f"""## Video Transcript (with timestamps, {len(segments)} segments)

{transcript_text}

---

请分析上述转录文本，将课程按内容逻辑分章。返回 JSON 数组。"""

    result = _call_llm(user_prompt, [], llm_config, OUTLINE_PROMPT)

    if result["status"] != "success":
        return []

    content = result["data"]["markdown"]

    # Parse JSON from response (handle markdown code blocks)
    content = re.sub(r'^```json\s*', '', content)
    content = re.sub(r'\s*```$', '', content)
    content = content.strip()

    try:
        outline = json.loads(content)
    except json.JSONDecodeError:
        # Try to extract JSON array from text
        match = re.search(r'\[.*\]', content, re.DOTALL)
        if match:
            try:
                outline = json.loads(match.group())
            except json.JSONDecodeError:
                return []
        else:
            return []

    if not isinstance(outline, list) or len(outline) == 0:
        return []

    # Validate and fix outline
    n = len(segments)
    for section in outline:
        section.setdefault("startSegment", 0)
        section.setdefault("endSegment", n)
        section.setdefault("title", "未命名章节")
        section.setdefault("summary", "")
        section["startSegment"] = max(0, min(section["startSegment"], n - 1))
        section["endSegment"] = max(section["startSegment"] + 1, min(section["endSegment"], n))

    # Ensure coverage
    if outline[0]["startSegment"] > 0:
        outline[0]["startSegment"] = 0
    if outline[-1]["endSegment"] < n:
        outline[-1]["endSegment"] = n

    return outline


def _get_slides_in_range(slides, start_seg, end_seg, segments):
    if not slides or not segments:
        return []

    start_time = segments[start_seg]["start"] if start_seg < len(segments) else 0
    end_time = segments[min(end_seg, len(segments)) - 1]["end"] if end_seg <= len(segments) else 99999

    return [s for s in slides if start_time <= s["timestamp"] <= end_time]


def _call_llm(user_prompt, slides, config, system_prompt):
    provider = config.get("provider", "openai")

    if provider == "claude":
        return _call_claude(user_prompt, slides, config, system_prompt)
    elif provider in ("deepseek",):
        return _call_openai_compatible(
            user_prompt, slides, {**config, "send_images": False}, system_prompt
        )
    else:
        return _call_openai_compatible(user_prompt, slides, config, system_prompt)


def _call_openai_compatible(user_prompt, slides, config, system_prompt=None) -> dict:
    client = OpenAI(
        api_key=config.get("api_key") or "ollama",
        base_url=config.get("base_url", "https://api.openai.com/v1"),
    )
    model = config.get("model", "gpt-4o")
    messages = _build_messages(user_prompt, slides, config, system_prompt)

    response = client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=16000,
        temperature=0.3,
    )

    markdown_content = response.choices[0].message.content
    return {
        "status": "success",
        "data": {
            "markdown": markdown_content,
            "token_usage": {
                "prompt": response.usage.prompt_tokens if response.usage else 0,
                "completion": response.usage.completion_tokens if response.usage else 0,
            },
        },
    }


def _call_claude(user_prompt, slides, config, system_prompt=None) -> dict:
    import anthropic

    client = anthropic.Anthropic(api_key=config.get("api_key", ""))
    model = config.get("model", "claude-sonnet-4-20250514")

    content = [{"type": "text", "text": user_prompt}]

    if config.get("send_images", True):
        for slide in slides[:20]:
            try:
                img_data = base64.b64encode(Path(slide["filePath"]).read_bytes()).decode()
                content.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": img_data,
                    },
                })
            except Exception:
                pass

    response = client.messages.create(
        model=model,
        max_tokens=16000,
        system=system_prompt or SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
    )

    markdown_content = response.content[0].text
    return {
        "status": "success",
        "data": {
            "markdown": markdown_content,
            "token_usage": {
                "prompt": response.usage.input_tokens,
                "completion": response.usage.output_tokens,
            },
        },
    }


def _format_transcript(segments, max_chars=80000):
    lines = []
    total = 0
    for seg in segments:
        mm = int(seg["start"]) // 60
        ss = int(seg["start"]) % 60
        secs = int(seg["start"])
        line = f"[{mm:02d}:{ss:02d} ({secs}s)] {seg['text']}"
        if total + len(line) > max_chars:
            break
        lines.append(line)
        total += len(line) + 1
    return "\n".join(lines)


def _fix_timestamps(markdown: str) -> str:
    """验证并修正 Markdown 中的时间戳：确保 #tSECONDS 与 MM:SS 一致"""
    def replacer(match):
        mm, ss, secs = int(match.group(1)), int(match.group(2)), int(match.group(3))
        expected = mm * 60 + ss
        if abs(secs - expected) <= 1:
            return match.group(0)
        return f"[{mm:02d}:{ss:02d}](#t{expected})"

    return re.sub(
        r'\[(\d{1,2}):(\d{2})\]\(#t(\d+)\)',
        replacer,
        markdown,
    )


def _format_slide_references(slides):
    lines = []
    for slide in slides:
        mm = int(slide["timestamp"]) // 60
        ss = int(slide["timestamp"]) % 60
        fname = Path(slide["filePath"]).name
        lines.append(f"- [{mm:02d}:{ss:02d}] `![](notes-images/{fname})`")
    return "\n".join(lines)


def _build_messages(user_prompt, slides, config, system_prompt=None):
    messages = [{"role": "system", "content": system_prompt or SYSTEM_PROMPT}]

    if config.get("send_images", True) and slides:
        content = [{"type": "text", "text": user_prompt}]
        for slide in slides[:20]:
            try:
                img_data = base64.b64encode(Path(slide["filePath"]).read_bytes()).decode()
                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{img_data}", "detail": "low"},
                })
            except Exception:
                pass
        messages.append({"role": "user", "content": content})
    else:
        messages.append({"role": "user", "content": user_prompt})

    return messages
