import pathlib
import re
import sys
from collections import Counter, defaultdict

# -------------------------------------------------------------
# File: gst_notice_analysis.py
# -------------------------------------------------------------
# Purpose:
#   For every client folder under the specified GST & VAT directory:
#     • Lists all files (count & extensions)
#     • Detects “notice” and “reply” documents (based on keywords)
#     • Attempts to pair each notice with its reply (by similar base name)
#     • Writes a markdown report (`analysis_report.md`) inside each folder
# -------------------------------------------------------------

# ---------- Configuration ----------
# You can also pass the base directory as the first command‑line argument.
DEFAULT_BASE_DIR = r"E:\software test files\IMS_27AAGCD4105L1ZO_12102026_1\7. SCRUTINY FILES\1. GST & VAT"

# Keywords that usually indicate a **notice** or a **reply**.
NOTICE_KW = ["notice", "drc", "showcause", "order", "audit", "financial", "letter"]
REPLY_KW  = ["reply", "response", "submission", "ack", "acceptance", "authority", "receipt"]

# File extensions we care about (case‑insensitive)
EXTENSIONS = {".pdf", ".docx", ".xlsx", ".xls", ".csv", ".jpeg", ".jpg", ".png", ".txt", ".zip", ".rar"}

# -------------------------------------------------------------
def is_notice(name: str) -> bool:
    lc = name.lower()
    return any(k in lc for k in NOTICE_KW)

def is_reply(name: str) -> bool:
    lc = name.lower()
    return any(k in lc for k in REPLY_KW)

def normalise_name(fname: str) -> str:
    """Strip known notice/reply suffixes and the extension.
    Used to try to match a notice with its reply.
    """
    name = pathlib.Path(fname).stem.lower()
    # Remove common suffixes like "_notice", "-reply", etc.
    name = re.sub(r"(_|[-\s])?(notice|drc|showcause|order|audit|reply|response|submission|acceptance|authority|receipt)$", "", name)
    return name

def analyse_folder(folder: pathlib.Path) -> str:
    """Build a markdown report for *folder* and return the text."""
    # Gather all files (recursive)
    all_files = [p for p in folder.rglob("*") if p.is_file()]
    total_files = len(all_files)
    ext_counter = Counter(p.suffix.lower() for p in all_files)

    # Classify notices & replies
    notices = []
    replies = []
    for f in all_files:
        if f.suffix.lower() not in EXTENSIONS:
            continue
        if is_notice(f.name):
            notices.append(f)
        elif is_reply(f.name):
            replies.append(f)

    # Build a map: normalised base name → list of files
    notice_map = defaultdict(list)
    reply_map  = defaultdict(list)

    for f in notices:
        notice_map[normalise_name(f.name)].append(f)
    for f in replies:
        reply_map[normalise_name(f.name)].append(f)

    # Pairing logic – a pair exists when the same normalised name appears in both maps
    pairs = []
    for key in set(notice_map.keys()) & set(reply_map.keys()):
        for n in notice_map[key]:
            for r in reply_map[key]:
                pairs.append((n, r))

    # ---------- Markdown report ----------
    lines = []
    lines.append(f"# GST & VAT – Notice Analysis – `{folder.name}`")
    lines.append("")
    lines.append(f"**Folder path:** `{folder}`")
    lines.append(f"**Total files:** {total_files}")
    lines.append("")
    lines.append("## File‑type summary")
    lines.append("")
    lines.append("| Extension | Count |")
    lines.append("|-----------|-------|")
    for ext, cnt in sorted(ext_counter.items(), key=lambda x: -x[1]):
        lines.append(f"| `{ext or '[no‑ext]'}` | {cnt} |")
    lines.append("")
    lines.append("## Detected notices")
    lines.append("")
    if notices:
        for f in sorted(notices, key=lambda x: x.name):
            lines.append(f"- `{f.relative_to(folder)}`")
    else:
        lines.append("_No notice‑type files detected._")
    lines.append("")
    lines.append("## Detected replies")
    lines.append("")
    if replies:
        for f in sorted(replies, key=lambda x: x.name):
            lines.append(f"- `{f.relative_to(folder)}`")
    else:
        lines.append("_No reply‑type files detected._")
    lines.append("")
    lines.append("## Notice ↔ Reply pairs (by base name)")
    lines.append("")
    if pairs:
        for n, r in pairs:
            lines.append(f"- **Notice:** `{n.relative_to(folder)}`  ↔  **Reply:** `{r.relative_to(folder)}`")
    else:
        lines.append("_No obvious notice/reply pairs found._")
    lines.append(""")
    lines.append("---")
    lines.append("*Report generated automatically – see `gst_notice_analysis.py` for details.*")
    return "\n".join(lines)

def main():
    # Allow overriding base dir via CLI argument
    base_dir = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(DEFAULT_BASE_DIR)
    if not base_dir.is_dir():
        raise RuntimeError(f"Base directory does not exist: {base_dir}")

    client_folders = [p for p in base_dir.iterdir() if p.is_dir()]
    print(f"Found {len(client_folders)} client folders – generating reports…")

    for folder in client_folders:
        report_text = analyse_folder(folder)
        report_path = folder / "analysis_report.md"
        report_path.write_text(report_text, encoding="utf-8")
        print(f"✔  {report_path}")

if __name__ == "__main__":
    main()
