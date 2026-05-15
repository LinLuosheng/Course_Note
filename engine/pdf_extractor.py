import base64
from pathlib import Path


def extract_pdf(pdf_path: str) -> dict:
    try:
        import fitz
    except ImportError:
        return {"status": "error", "error": "PyMuPDF not installed. Run: pip install PyMuPDF"}

    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        return {"status": "error", "error": f"Failed to open PDF: {e}"}

    pages = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text")

        pages.append({
            "pageNumber": page_num + 1,
            "text": text.strip(),
        })

    doc.close()

    full_text = "\n\n".join(
        f"--- 第 {p['pageNumber']} 页 ---\n{p['text']}"
        for p in pages if p["text"]
    )

    return {
        "status": "success",
        "data": {
            "pages": pages,
            "pageCount": len(pages),
            "fullText": full_text,
        },
    }
