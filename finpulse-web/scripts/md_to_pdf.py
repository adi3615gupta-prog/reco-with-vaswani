#!/usr/bin/env python
# -------------------------------------------------------------
# File: md_to_pdf.py
# -------------------------------------------------------------
# Purpose:
#   Convert a markdown file (e.g. crux_summary.md) to a PDF.
#   Uses `markdown` → HTML → WeasyPrint (HTML → PDF).
# -------------------------------------------------------------
import pathlib
import sys

import markdown
from weasyprint import HTML, CSS

def md_to_pdf(md_path: pathlib.Path, pdf_path: pathlib.Path) -> None:
    """Read *md_path*, render to HTML, then write PDF to *pdf_path*."""
    # 1️⃣ Read markdown text
    md_text = md_path.read_text(encoding="utf-8")

    # 2️⃣ Convert to HTML (GitHub‑flavored extensions are optional)
    html = markdown.markdown(
        md_text,
        extensions=[
            "extra",          # tables, definition lists, etc.
            "toc",            # optional table‑of‑contents
            "smarty",         # nicer quotes, dashes
        ],
    )

    # 3️⃣ Add a tiny style block for nicer PDF layout
    style = """
    @page { size: A4; margin: 1.5cm; }
    body { font-family: "Segoe UI", "Helvetica", "Arial", sans-serif; line-height: 1.4; }
    h1, h2, h3 { color: #2e5c8a; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #bbb; padding: 4px 8px; }
    th { background:#f0f0f0; }
    """
    html_with_style = f"<style>{style}</style>{html}"

    # 4️⃣ Render PDF
    HTML(string=html_with_style, base_url=md_path.parent.as_uri()).write_pdf(
        pdf_path,
        stylesheets=[CSS(string=style)],
    )

def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python md_to_pdf.py <markdown_file> [output_pdf]")
        sys.exit(1)

    md_path = pathlib.Path(sys.argv[1]).resolve()
    if not md_path.is_file():
        raise FileNotFoundError(f"Markdown file not found: {md_path}")

    # Default output name = same base, .pdf extension
    pdf_path = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else md_path.with_suffix('.pdf')

    md_to_pdf(md_path, pdf_path)
    print(f"✅ PDF written to {pdf_path}")

if __name__ == "__main__":
    main()
