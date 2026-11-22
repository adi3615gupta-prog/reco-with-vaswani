#!/usr/bin/env python3
import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--txt", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--voice", default="en-US-ChristopherNeural")
    args = parser.parse_args()

    txt_path = Path(args.txt)
    out_path = Path(args.out)

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_mp3:
        tmp_mp3_path = tmp_mp3.name

    try:
        # Run edge-tts
        cmd_tts = [
            sys.executable, "-m", "edge_tts",
            "--voice", args.voice,
            "-f", str(txt_path),
            "--write-media", tmp_mp3_path
        ]
        r1 = subprocess.run(cmd_tts, capture_output=True, text=True)
        if r1.returncode != 0:
            sys.exit(f"edge-tts failed: {r1.stderr}")

        # Convert to wav
        cmd_ffmpeg = [
            "ffmpeg", "-y", "-v", "error",
            "-i", tmp_mp3_path,
            "-ar", "48000", "-ac", "1",
            str(out_path)
        ]
        r2 = subprocess.run(cmd_ffmpeg, capture_output=True, text=True)
        if r2.returncode != 0:
            sys.exit(f"ffmpeg conversion failed: {r2.stderr}")
    finally:
        try:
            Path(tmp_mp3_path).unlink(missing_ok=True)
        except Exception:
            pass

if __name__ == "__main__":
    main()
