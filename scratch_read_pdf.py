import fitz  # PyMuPDF

pdf_path = "public/Project Report Builder — CMA Data & Bank Project Reports.pdf"
doc = fitz.open(pdf_path)

with open("scratch_pdf_text.txt", "w", encoding="utf-8") as f:
    f.write(f"Total Pages: {len(doc)}\n\n")
    for i in range(len(doc)):
        f.write(f"=== PAGE {i+1} ===\n")
        f.write(doc[i].get_text())
        f.write("\n\n")

print("PDF text extracted to scratch_pdf_text.txt successfully!")
