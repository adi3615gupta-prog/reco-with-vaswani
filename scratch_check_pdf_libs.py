import sys

for lib in ["pypdf", "pdfplumber", "fitz", "pdfminer", "pypdf2"]:
    try:
        __import__(lib)
        print(f"{lib}: AVAILABLE")
    except ImportError:
        print(f"{lib}: NOT AVAILABLE")
