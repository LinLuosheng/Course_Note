import json
import re
import time
from openai import OpenAI


GENERATE_QUESTIONS_PROMPT = """你是一位专业的出题老师。根据课程笔记中的例题和知识点，生成同类变式题用于课后练习。

## 课程笔记

{notes}

## 要求

1. 找出笔记中所有例题，为每个例题生成 1-2 道变式题
2. 变式题应保持相同的知识点和解题方法，但改变数字或情境
3. 覆盖不同的难度级别（easy/medium/hard）
4. 优先使用选择题格式（4 个选项），如果是计算题也可以用填空题
5. 题目语言与笔记语言一致

## 输出格式

返回纯 JSON 数组（不要 markdown 代码块）：
[
  {{
    "content": "题目内容",
    "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
    "answer": "A",
    "explanation": "详细解析",
    "difficulty": "easy",
    "knowledgePoints": ["知识点1", "知识点2"],
    "sourceSection": "对应的笔记章节标题",
    "timestamp": 0
  }}
]

- options: 选择题必须有 4 个选项，填空题留空数组
- difficulty: easy / medium / hard
- timestamp: 原始例题在视频中的时间（秒），取笔记中对应的时间戳
- 只输出 JSON 数组，不要其他文字"""


TAG_QUESTIONS_PROMPT = """你是一位专业的题目分类专家。请对以下题目进行知识点分类和难度评估。

## 题目列表

{questions_json}

## 已有知识点分类体系

{existing_points}

## 要求

1. 为每道题目标注 1-3 个最相关的知识点标签
2. 如果题目涉及多个知识领域（组合题），标注所有相关知识点
3. 评估题目难度：easy / medium / hard
4. 尽量使用已有知识点体系中的标签；如果是全新知识点，也可以创建新标签
5. 为每道题写一句简短的解题思路

## 输出格式

返回纯 JSON 数组（不要 markdown 代码块，顺序与输入一致）：
[
  {{
    "index": 0,
    "knowledgePoints": ["知识点1", "知识点2"],
    "difficulty": "easy",
    "explanation": "解题思路简述"
  }}
]

只输出 JSON 数组。"""


def generate_practice_questions(
    notes_md: str,
    llm_config: dict,
    count: int = 10,
) -> dict:
    from summarizer import _call_openai_compatible

    prompt = GENERATE_QUESTIONS_PROMPT.format(notes=notes_md[:15000])

    client = OpenAI(
        api_key=llm_config.get("api_key") or "ollama",
        base_url=llm_config.get("base_url", "https://api.openai.com/v1"),
    )
    model = llm_config.get("model", "gpt-4o")

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "你是题目生成专家，只返回JSON数组，不要其他文字。"},
            {"role": "user", "content": prompt},
        ],
        max_tokens=8000,
        temperature=0.4,
    )

    content = response.choices[0].message.content.strip()
    content = _strip_code_block(content)

    try:
        questions = json.loads(content)
    except json.JSONDecodeError:
        questions = _repair_json_array(content)

    if not isinstance(questions, list):
        return {"status": "error", "error": "LLM did not return a JSON array"}

    now = time.time()
    validated = []
    for i, q in enumerate(questions[:count]):
        validated.append({
            "id": f"q_{i:04d}",
            "content": q.get("content", ""),
            "options": q.get("options", []),
            "answer": q.get("answer", ""),
            "explanation": q.get("explanation", ""),
            "difficulty": q.get("difficulty", "medium"),
            "source": "generated",
            "knowledgePoints": q.get("knowledgePoints", []),
            "sourceSection": q.get("sourceSection", ""),
            "timestamp": q.get("timestamp"),
            "createdAt": now,
        })

    return {"status": "success", "data": {"questions": validated}}


def tag_questions(
    questions: list,
    existing_points: list,
    llm_config: dict,
) -> dict:
    questions_brief = []
    for i, q in enumerate(questions):
        questions_brief.append({
            "index": i,
            "content": q.get("content", q.get("问题", q.get("question", "")))[:300],
            "options": q.get("options", []),
        })

    questions_json = json.dumps(questions_brief, ensure_ascii=False, indent=2)
    points_str = "\n".join(f"- {p}" for p in existing_points) if existing_points else "暂无已有分类，请根据题目内容自行归纳知识点。"

    prompt = TAG_QUESTIONS_PROMPT.format(
        questions_json=questions_json,
        existing_points=points_str,
    )

    client = OpenAI(
        api_key=llm_config.get("api_key") or "ollama",
        base_url=llm_config.get("base_url", "https://api.openai.com/v1"),
    )
    model = llm_config.get("model", "gpt-4o")

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "你是题目分类专家，只返回JSON数组，不要其他文字。"},
            {"role": "user", "content": prompt},
        ],
        max_tokens=4000,
        temperature=0.2,
    )

    content = response.choices[0].message.content.strip()
    content = _strip_code_block(content)

    try:
        tags = json.loads(content)
    except json.JSONDecodeError:
        tags = _repair_json_array(content)

    if not isinstance(tags, list):
        return {"status": "error", "error": "LLM did not return a JSON array"}

    # Merge tags back into questions
    now = time.time()
    tagged = []
    for i, q in enumerate(questions):
        tag = next((t for t in tags if t.get("index") == i), {})
        tagged.append({
            "id": f"q_{i:04d}",
            "content": q.get("content", q.get("问题", q.get("question", ""))),
            "options": q.get("options", []),
            "answer": q.get("answer", q.get("答案", q.get("answer", ""))),
            "explanation": tag.get("explanation", q.get("explanation", q.get("解析", ""))),
            "difficulty": tag.get("difficulty", "medium"),
            "source": "imported",
            "knowledgePoints": tag.get("knowledgePoints", []),
            "createdAt": now,
        })

    return {"status": "success", "data": {"questions": tagged}}


def filter_questions(
    questions: list,
    knowledge_points: list,
    difficulty: str = None,
    mode: str = "any",
) -> list:
    """Filter questions by knowledge points and difficulty.

    mode="any": question matches any of the given knowledge points
    mode="all": question must match all given knowledge points
    """
    result = []
    for q in questions:
        q_points = set(q.get("knowledgePoints", []))
        filter_points = set(knowledge_points)

        if mode == "all":
            if not filter_points.issubset(q_points):
                continue
        else:
            if not q_points.intersection(filter_points):
                continue

        if difficulty and q.get("difficulty") != difficulty:
            continue

        result.append(q)

    return result


def extract_text_from_file(file_path: str) -> str:
    """Extract text from PDF, Word (.docx), TXT, or JSON files."""
    ext = file_path.rsplit('.', 1)[-1].lower()

    if ext == 'pdf':
        from pdf_extractor import extract_pdf
        result = extract_pdf(file_path)
        if result.get("status") == "success":
            return result["data"].get("fullText", "")
        return ""

    elif ext in ('docx', 'doc'):
        from docx import Document
        doc = Document(file_path)
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())

    elif ext in ('txt', 'md'):
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()

    elif ext == 'json':
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()

    return ""


PARSE_DOCUMENT_PROMPT = """你是一位专业的题目识别专家。以下是从文档中提取的文本，请识别出所有题目并结构化。

## 文档内容

{text}

## 要求

1. 识别文档中的每一道题目（选择题、填空题、判断题、计算题、简答题等）
2. 保留题号、题目内容、选项（如有）、答案（如有）
3. 如果文档中有答案/解析部分，请关联到对应题目
4. 忽略非题目内容（页眉、页脚、说明文字等）
5. 如果文本太长无法完整识别，优先识别前面部分

## 输出格式

返回纯 JSON 数组（不要 markdown 代码块）：
[
  {{
    "content": "完整题目内容（包含题号和题干）",
    "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
    "answer": "答案（如文档中有）",
    "explanation": "解析（如文档中有）"
  }}
]

- 选择题必须有 options（4个选项）
- 填空题/计算题 options 留空数组
- 答案和解析如文档中无则留空字符串
- 只输出 JSON 数组，不要其他文字"""


def parse_document_questions(
    file_path: str,
    llm_config: dict,
) -> dict:
    """Extract text from a document file, use AI to identify and structure questions."""
    text = extract_text_from_file(file_path)
    if not text.strip():
        return {"status": "error", "error": "文件为空或无法提取文本"}

    # For JSON files, try direct parsing first
    if file_path.endswith('.json'):
        try:
            data = json.loads(text)
            questions = data if isinstance(data, list) else data.get("questions", [])
            if questions:
                return {"status": "success", "data": {"questions": questions, "raw_text": ""}}
        except json.JSONDecodeError:
            pass

    # Truncate very long documents
    if len(text) > 30000:
        text = text[:30000] + "\n\n[文档内容已截断]"

    prompt = PARSE_DOCUMENT_PROMPT.format(text=text)

    client = OpenAI(
        api_key=llm_config.get("api_key") or "ollama",
        base_url=llm_config.get("base_url", "https://api.openai.com/v1"),
    )
    model = llm_config.get("model", "gpt-4o")

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "你是题目识别专家，只返回JSON数组，不要其他文字。"},
            {"role": "user", "content": prompt},
        ],
        max_tokens=8000,
        temperature=0.2,
    )

    content = response.choices[0].message.content.strip()
    content = _strip_code_block(content)

    try:
        questions = json.loads(content)
    except json.JSONDecodeError:
        questions = _repair_json_array(content)

    if not isinstance(questions, list):
        return {"status": "error", "error": "AI 未能识别出题目"}

    return {"status": "success", "data": {"questions": questions, "raw_text": text[:500]}}
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    return text.strip()


def _repair_json_array(text: str) -> list:
    match = re.search(r'\[.*\]', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    # Try to fix truncated JSON
    bracket_start = text.find('[')
    if bracket_start >= 0:
        fragment = text[bracket_start:]
        if not fragment.rstrip().endswith(']'):
            fragment = fragment.rstrip().rstrip(',') + ']'
        try:
            return json.loads(fragment)
        except json.JSONDecodeError:
            pass

    return []
