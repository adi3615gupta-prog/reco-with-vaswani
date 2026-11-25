import pathlib
import re
import sys
from collections import Counter, defaultdict

# -------------------------------------------------------------
# File: generate_gst_notice_crux.py
# -------------------------------------------------------------
# Purpose:
#   Walk every client folder under a GST & VAT directory and produce a
#   *crux* markdown (`crux_summary.md`) that lists, for each client,
#   the notices (and optionally replies) found.
#   Individual per‑client reports can still be generated if desired.
# -------------------------------------------------------------

# ---------- Configuration ----------
# By default it points to the location you mentioned. Override with a
# command‑line argument: `python generate_gst_notice_crux.py "C:\path\to\GST & VAT"`
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
    name = re.sub(r"(_|[-\s])?(notice|drc|showcause|order|audit|reply|response|submission|acceptance|authority|receipt)$", "", name)
    return name

def analyse_folder(folder: pathlib.Path):
    """Return a dict with counts and file‑name lists for a client folder."""
    all_files = [p for p in folder.rglob("*") if p.is_file()]
    notices = []
    replies = []
    for f in all_files:
        if f.suffix.lower() not in EXTENSIONS:
            continue
        if is_notice(f.name):
            notices.append(f.relative_to(folder).as_posix())
        elif is_reply(f.name):
            replies.append(f.relative_to(folder).as_posix())
    return {
        "client": folder.name,
        "notice_count": len(notices),
        "reply_count": len(replies),
        "notices": notices,
        "replies": replies,
    }

def main():
    base_dir = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(DEFAULT_BASE_DIR)
    if not base_dir.is_dir():
        raise RuntimeError(f"Base directory does not exist: {base_dir}")

    client_folders = [p for p in base_dir.iterdir() if p.is_dir()]
    print(f"Scanning {len(client_folders)} client folders…")

    crux_entries = []
    for folder in client_folders:
        crux_entries.append(analyse_folder(folder))

    # Write consolidated crux summary in the base directory
    crux_path = base_dir / "crux_summary.md"
    with crux_path.open("w", encoding="utf-8") as out:
        out.write("# GST & VAT – Crux Summary of All Clients\n\n")
        for entry in crux_entries:
            out.write(f"## Client: `{entry['client']}`\n")
            out.write(f"- Notices found: {entry['notice_count']}\n")
            out.write(f"- Replies found: {entry['reply_count']}\n")
            if entry['notice_count']:
                out.write("- Notice files:\n")
                for n in entry['notices']:
                    out.write(f"  - `{n}`\n")
            if entry['reply_count']:
                out.write("- Reply files:\n")
                for r in entry['replies']:
                    out.write(f"  - `{r}`\n")
            out.write("\n")
    print(f"✅ Crux summary written to {crux_path}")

if __name__ == "__main__":
    main()
