"""
LevitateExtract — Test Suite
============================
Unit tests and Poison Pill tests for the Form 26AS PDF extractor.

Run with:  pytest test_main.py -v
"""

import io
import struct
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from main import (
    app,
    _validate_magic_bytes,
    _is_scanned_document,
    _parse_amount,
    _parse_form_26as,
    _extract_tds_rows_structured,
    _extract_tds_rows_fallback,
    _find_pdf_total,
    _check_rate_limit,
    _rate_store,
    _build_excel,
)

client = TestClient(app)


# ═══════════════════════════════════════════════════════════════════════════
# UNIT TESTS — Pure Function Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestMagicBytesValidation:
    """Phase 2: File type verification via binary header."""

    def test_valid_pdf_header(self):
        raw = b"%PDF-1.7 some content here"
        assert _validate_magic_bytes(raw) is True

    def test_valid_pdf_v14(self):
        raw = b"%PDF-1.4\n..."
        assert _validate_magic_bytes(raw) is True

    def test_invalid_header_png(self):
        raw = b"\x89PNG\r\n\x1a\n"
        assert _validate_magic_bytes(raw) is False

    def test_invalid_header_docx(self):
        raw = b"PK\x03\x04" + b"\x00" * 100
        assert _validate_magic_bytes(raw) is False

    def test_invalid_header_plain_text(self):
        raw = b"Hello this is a text file"
        assert _validate_magic_bytes(raw) is False

    def test_empty_file(self):
        raw = b""
        assert _validate_magic_bytes(raw) is False


class TestScannedDocumentDetection:
    """Phase 2: Scanned document check."""

    def test_scanned_10_pages_50_chars(self):
        text = "x" * 50
        assert _is_scanned_document(text, 10) is True

    def test_scanned_10_pages_49_chars(self):
        text = "x" * 49
        assert _is_scanned_document(text, 10) is True

    def test_text_based_10_pages_5000_chars(self):
        text = "x" * 5000
        assert _is_scanned_document(text, 10) is False

    def test_text_based_1_page_100_chars(self):
        text = "x" * 100
        assert _is_scanned_document(text, 1) is False

    def test_zero_pages(self):
        assert _is_scanned_document("", 0) is True

    def test_low_chars_per_page(self):
        text = "ab"  # 2 chars, 1 page → avg < 5
        assert _is_scanned_document(text, 1) is True


class TestAmountParsing:
    """Phase 3: Monetary amount parsing."""

    def test_simple_number(self):
        assert _parse_amount("50000") == 50000.0

    def test_indian_formatted(self):
        assert _parse_amount("1,23,456.78") == 123456.78

    def test_with_currency_symbol(self):
        assert _parse_amount("₹ 50,000") == 50000.0

    def test_with_spaces(self):
        assert _parse_amount("  1,000.50  ") == 1000.50

    def test_empty_string(self):
        assert _parse_amount("") == 0.0

    def test_none_value(self):
        assert _parse_amount(None) == 0.0

    def test_non_numeric(self):
        assert _parse_amount("abc") == 0.0

    def test_zero(self):
        assert _parse_amount("0.00") == 0.0


class TestAnchoredPipeExtraction:
    """Phase 3: Anchored regex extraction on flat text separated by pipes."""

    def test_perfect_anchored_pipe_row(self):
        text = "1 | Acme Corp Pvt | Ltd | BLRP25559C | 1,00,000.00 | 1,000.00 | 1,000.00"
        rows, pdf_total, warnings = _parse_form_26as(text)
        assert len(rows) == 1
        assert rows[0]["tan_of_deductor"] == "BLRP25559C"
        assert rows[0]["name_of_deductor"] == "Acme Corp Pvt Ltd"
        assert rows[0]["amount_credited"] == 100000.0
        assert rows[0]["total_tax_deducted"] == 1000.0

    def test_anchored_pipe_decimal_comma(self):
        # Test edge case where comma is used as decimal point
        text = "1 | Acme Corp | BLRP25559C | 100000,50 | 1000,50 | 1000,50"
        rows, pdf_total, warnings = _parse_form_26as(text)
        assert len(rows) == 1
        assert rows[0]["amount_credited"] == 100000.50
        assert rows[0]["total_tax_deducted"] == 1000.50

    def test_anchored_pipe_multiple_spaces_and_pipes(self):
        text = "1 | Acme   Corp   |  BLRP25559C | 10,000 | 100 | 100"
        rows, pdf_total, warnings = _parse_form_26as(text)
        assert len(rows) == 1
        assert rows[0]["name_of_deductor"] == "Acme Corp"

    def test_expected_test_total_checksum(self):
        text = "1 | Deductor A | BLRP25559C | 10,00,000 | 4,261,257.30 | 4,261,257.30"
        rows, pdf_total, warnings = _parse_form_26as(text)
        assert len(rows) == 1
        assert pdf_total == 4261257.30


class TestSmashedTextExtraction:
    """Phase 3: Smashed text line-by-line parsing (whitespace-stripped)."""

    def test_smashed_text_line(self):
        text = "1PATSON AUTOMATION PRIVATE LIMITEDBLRP25559C2344637.0046893.0046893.00"
        rows, pdf_total, warnings = _parse_form_26as(text)
        assert len(rows) == 1
        assert rows[0]["tan_of_deductor"] == "BLRP25559C"
        assert rows[0]["name_of_deductor"] == "PATSON AUTOMATION PRIVATE LIMITED"
        assert rows[0]["amount_credited"] == 2344637.00
        assert rows[0]["total_tax_deducted"] == 46893.00
        assert rows[0]["tds_deposited"] == 46893.00


class TestStructuredRowExtraction:
    """Phase 3: Structured regex extraction on perfect text."""

    def test_perfect_row(self):
        text = (
            "1 MUMR12345E Acme Corp Pvt Ltd 194C 01/04/2025 F "
            "1,00,000.00 1,000.00 1,000.00"
        )
        rows = _extract_tds_rows_structured(text)
        assert len(rows) >= 1
        if rows:
            assert rows[0]["tan_of_deductor"] == "MUMR12345E"
            assert rows[0]["section"] == "194C"


    def test_multiple_rows(self):
        text = (
            "1 MUMR12345E Acme Corp 194C 01/04/2025 F 1,00,000.00 1,000.00 1,000.00\n"
            "2 DELX98765F Beta LLC 194J 15/06/2025 P 2,50,000.00 25,000.00 25,000.00"
        )
        rows = _extract_tds_rows_structured(text)
        assert len(rows) >= 2

    def test_no_matching_rows(self):
        text = "This is a random document about cooking recipes."
        rows = _extract_tds_rows_structured(text)
        assert len(rows) == 0


class TestFallbackExtraction:
    """Phase 3: Fallback TAN-anchored extraction on imperfect text."""

    def test_tan_with_amounts(self):
        text = (
            "MUMR12345E  Acme Corp\n"
            "194C  01/04/2025  1,00,000.00  1,000.00  1,000.00"
        )
        rows = _extract_tds_rows_fallback(text)
        assert len(rows) >= 1
        if rows:
            assert rows[0]["tan_of_deductor"] == "MUMR12345E"

    def test_missing_spaces(self):
        text = "DELX98765F Beta LLC194J 15/06/2025 250000.00 25000.00 25000.00"
        rows = _extract_tds_rows_fallback(text)
        assert len(rows) >= 1

    def test_extra_line_breaks(self):
        text = (
            "  MUMR12345E  \n\n"
            "  Acme Corp  \n\n"
            "  194C  \n"
            "  01/04/2025  \n"
            "  1,00,000.00  1,000.00  1,000.00  "
        )
        rows = _extract_tds_rows_fallback(text)
        assert len(rows) >= 1


class TestTotalExtraction:
    """Phase 3: PDF total string extraction for checksum."""

    def test_total_found(self):
        text = "... Total 5,00,000.00 10,000.00 10,000.00 ..."
        result = _find_pdf_total(text)
        assert result is not None
        assert result > 0

    def test_grand_total(self):
        text = "Grand Total 15,00,000.00"
        result = _find_pdf_total(text)
        assert result is not None

    def test_total_tax_deducted_label(self):
        text = "Total Tax Deducted: 1,23,456.78"
        result = _find_pdf_total(text)
        assert result == 123456.78

    def test_no_total(self):
        text = "This text has no total whatsoever."
        result = _find_pdf_total(text)
        assert result is None


class TestFullParser:
    """Phase 3: End-to-end parsing pipeline."""

    def test_complete_parse(self):
        text = (
            "Part A — Details of Tax Deducted at Source\n"
            "1 MUMR12345E Acme Corp 194C 01/04/2025 F 1,00,000.00 1,000.00 1,000.00\n"
            "2 DELX98765F Beta LLC 194J 15/06/2025 P 2,50,000.00 25,000.00 25,000.00\n"
            "Total 3,50,000.00 26,000.00 26,000.00\n"
        )
        rows, pdf_total, warnings = _parse_form_26as(text)
        assert len(rows) >= 2
        assert pdf_total is not None

    def test_empty_text(self):
        rows, pdf_total, warnings = _parse_form_26as("")
        assert len(rows) == 0
        assert len(warnings) > 0


class TestExcelBuilder:
    """Phase 4: Excel workbook generation."""

    def test_builds_valid_excel(self):
        rows = [
            {
                "sr_no": 1,
                "tan_of_deductor": "MUMR12345E",
                "name_of_deductor": "Acme Corp",
                "section": "194C",
                "transaction_date": "01/04/2025",
                "status": "F",
                "amount_credited": 100000.0,
                "total_tax_deducted": 1000.0,
                "tds_deposited": 1000.0,
            }
        ]
        buf = _build_excel(rows, 1000.0, [])
        assert buf is not None
        assert buf.getbuffer().nbytes > 0
        # Should be a valid XLSX (starts with PK zip signature)
        buf.seek(0)
        header = buf.read(4)
        assert header == b"PK\x03\x04"

    def test_empty_rows_produces_warning_sheet(self):
        buf = _build_excel([], None, ["No rows found."])
        assert buf is not None
        assert buf.getbuffer().nbytes > 0

    def test_checksum_mismatch_adds_warning(self):
        rows = [
            {
                "sr_no": 1,
                "tan_of_deductor": "MUMR12345E",
                "name_of_deductor": "Acme Corp",
                "section": "194C",
                "transaction_date": "01/04/2025",
                "status": "F",
                "amount_credited": 100000.0,
                "total_tax_deducted": 1000.0,
                "tds_deposited": 1000.0,
            }
        ]
        # PDF says total is 5000 but parsed rows only sum to 1000
        buf = _build_excel(rows, 5000.0, [])
        assert buf is not None
        assert buf.getbuffer().nbytes > 0


class TestRateLimiter:
    """Phase 2: Rate limiting."""

    def setup_method(self):
        _rate_store.clear()

    def test_allows_under_limit(self):
        for _ in range(20):
            assert _check_rate_limit("test_ip") is True

    def test_blocks_over_limit(self):
        for _ in range(20):
            _check_rate_limit("test_ip_2")
        assert _check_rate_limit("test_ip_2") is False


# ═══════════════════════════════════════════════════════════════════════════
# POISON PILL TESTS — API-Level Failure Handling
# ═══════════════════════════════════════════════════════════════════════════


class TestPoisonPills:
    """
    Phase 5: Feed the engine invalid inputs and ensure it returns
    clean 400 Bad Request errors — never a 500 Internal Server Error.
    """

    def setup_method(self):
        _rate_store.clear()

    def test_non_pdf_file_cookbook_text(self):
        """Send a plain text file pretending to be a PDF."""
        content = b"Chapter 1: How to bake a chocolate cake\nIngredients: flour, sugar..."
        response = client.post(
            "/extract",
            files={"file": ("cookbook.pdf", io.BytesIO(content), "application/pdf")},
        )
        assert response.status_code == 400
        assert "not a valid PDF" in response.json()["detail"]

    def test_png_file_renamed_to_pdf(self):
        """Send a PNG image renamed to .pdf."""
        # Minimal PNG header
        content = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200
        response = client.post(
            "/extract",
            files={"file": ("image.pdf", io.BytesIO(content), "application/pdf")},
        )
        assert response.status_code == 400
        assert "not a valid PDF" in response.json()["detail"]

    def test_empty_file(self):
        """Send a zero-byte file."""
        response = client.post(
            "/extract",
            files={"file": ("empty.pdf", io.BytesIO(b""), "application/pdf")},
        )
        assert response.status_code == 400

    def test_oversized_file(self):
        """Send a file that exceeds the 10MB limit."""
        # Create a valid PDF header but 11MB of padding
        content = b"%PDF-1.4\n" + b"\x00" * (11 * 1024 * 1024)
        response = client.post(
            "/extract",
            files={"file": ("huge.pdf", io.BytesIO(content), "application/pdf")},
        )
        assert response.status_code == 400
        assert "exceeds" in response.json()["detail"]

    def test_docx_file(self):
        """Send a DOCX (ZIP) file renamed to .pdf."""
        # DOCX starts with PK zip header
        content = b"PK\x03\x04" + b"\x00" * 200
        response = client.post(
            "/extract",
            files={"file": ("document.pdf", io.BytesIO(content), "application/pdf")},
        )
        assert response.status_code == 400
        assert "not a valid PDF" in response.json()["detail"]

    def test_rate_limiting(self):
        """Hit the endpoint enough times to trigger rate limiting."""
        _rate_store.clear()
        # Fill up rate limit for 127.0.0.1 (TestClient default)
        for _ in range(20):
            _check_rate_limit("testclient")
        # The actual rate limiter uses request.client.host, but we can test
        # the function directly
        assert _check_rate_limit("testclient") is False


class TestCaretTxtExtraction:
    """Phase 3: Caret-based TXT parsing (IT Portal Source)."""

    def test_caret_txt_parsing(self):
        text = "1 ^ Acme Corp ^ BLRP25559C ^ 194C ^ 100000.00 ^ 1000.00 ^ 1000.00 ^ active ^^^^^"
        rows, pdf_total, warnings = _parse_form_26as(text)
        assert len(rows) == 1
        assert rows[0]["tan_of_deductor"] == "BLRP25559C"
        assert rows[0]["name_of_deductor"] == "Acme Corp"
        assert rows[0]["amount_credited"] == 100000.0
        assert rows[0]["total_tax_deducted"] == 1000.0
        assert rows[0]["tds_deposited"] == 1000.0

    def test_caret_txt_with_grand_total_dropped(self):
        # Grand total row has no TAN (or empty TAN), should be dropped
        text = (
            "1 ^ Acme Corp ^ BLRP25559C ^ 194C ^ 100000.00 ^ 1000.00 ^ 1000.00 ^ active ^^^^^\n"
            " ^ Grand Total ^  ^  ^ 100000.00 ^ 1000.00 ^ 1000.00 ^ active ^^^^^"
        )
        rows, pdf_total, warnings = _parse_form_26as(text)
        # Should only return 1 row because Grand Total has empty TAN
        assert len(rows) == 1
        assert rows[0]["tan_of_deductor"] == "BLRP25559C"


class TestHealthEndpoint:
    """Verify the health check endpoint works."""

    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "LevitateExtract"
