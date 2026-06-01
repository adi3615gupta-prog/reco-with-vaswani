# Tally XML Structure Reference

## How to Export from Tally

### **Step 1: Open Tally**
- Go to **Gateway of Tally** → **Display** → **Statutory Reports**
- Or navigate to desired **Register** (Journal, Purchase, Sales, etc.)

### **Step 2: Export as XML**
- Press **Alt+E** (Export)
- Select **XML** format
- Choose location & filename
- Click **Export**

### **Result:** UTF-16 LE encoded `.xml` file

---

## Supported XML Structures

### **1. Columnar Registers (Primary - RECOMMENDED)**

**Format:** Flat siblings with DBCFIXED row markers

```xml
<?xml version="1.0" encoding="UTF-16"?>
<ENVELOPE>
  <!-- Company Info (optional) -->
  <DSPCOMPANYNAME>Your Company Name</DSPCOMPANYNAME>
  <DSPREPTITLE>Date Range Info</DSPREPTITLE>
  
  <!-- Column Headers (optional) -->
  <DBCCOLNAME>Purchase - Labour</DBCCOLNAME>
  <DBCCOLNAME>1 CGST @ 9% Input</DBCCOLNAME>
  <DBCCOLNAME>2 SGST @ 9% Input</DBCCOLNAME>
  
  <!-- ROW 1 -->
  <DBCFIXED>
    <DBCDATE>25-Apr-25</DBCDATE>
    <DBCPARTY>Party/Ledger Name</DBCPARTY>
  </DBCFIXED>
  <DBCVCHTYPE>Debit Note</DBCVCHTYPE>
  <DBCVCHNO>1</DBCVCHNO>
  <DBCVCHREF>Reference Number</DBCVCHREF>
  <DBCVCHREFDATE>25-Apr-25</DBCVCHREFDATE>
  <DBCGSTIN>27ABBFG3231F1ZU</DBCGSTIN>
  <DBCAMOUNT>100.00</DBCAMOUNT>
  <DBCADDLCOST>50.00</DBCADDLCOST>
  <DBCGROSSAMT>-97866.00</DBCGROSSAMT>
  <DBCLEDAMT>82937.00</DBCLEDAMT>
  <DBCLEDAMT>7464.33</DBCLEDAMT>
  <DBCLEDAMT>7464.33</DBCLEDAMT>
  <DBCLEDAMT>0.34</DBCLEDAMT>
  <DBCLEDAMT></DBCLEDAMT>
  <DBCLEDAMT></DBCLEDAMT>
  
  <!-- ROW 2 -->
  <DBCFIXED>
    <DBCDATE>26-Apr-25</DBCDATE>
    <DBCPARTY>Another Party</DBCPARTY>
  </DBCFIXED>
  <DBCVCHTYPE>Debit Note</DBCVCHTYPE>
  <DBCVCHNO>2</DBCVCHNO>
  <!-- ... more fields ... -->
  
  <!-- ... more rows ... -->
</ENVELOPE>
```

**✅ Supported Reports:**
- Journal Register
- Debit Note Register  
- Credit Note Register
- Purchase Register
- Sales Register
- Receipt Register
- Payment Register
- Contra Register
- Any other "Columnar Register"

**Field Meanings:**

| Field | Meaning | Example |
|-------|---------|---------|
| DBCDATE | Transaction Date | 25-Apr-25 |
| DBCPARTY | Party/Ledger Name | GREENVELI LANDSCAPE... |
| DBCVCHTYPE | Voucher Type | Debit Note, Invoice, etc. |
| DBCVCHNO | Voucher Number | 2, 3, 4, ... |
| DBCVCHREF | Reference Number | DYP/DB/25-26/28 |
| DBCVCHREFDATE | Reference Date | 25-Apr-25 |
| DBCGSTIN | GSTIN/UIN | 27ABBFG3231F1ZU |
| DBCAMOUNT | Amount | 100.00 |
| DBCADDLCOST | Additional Cost | 50.00 |
| DBCGROSSAMT | Total Amount | -97866.00 |
| DBCLEDAMT | Ledger Column Value | 82937.00, 7464.33, ... |

---

### **2. Daybook Format (Limited Support - Fallback)**

**Format:** VOUCHER elements with nested LEDGERENTRIES

```xml
<?xml version="1.0" encoding="UTF-16"?>
<ENVELOPE>
  <VOUCHER>
    <DATE>25-Apr-25</DATE>
    <VOUCHERTYPENAME>Journal Voucher</VOUCHERTYPENAME>
    <VOUCHERNUMBER>001</VOUCHERNUMBER>
    <NARRATION>Sample narration</NARRATION>
    <PARTYLEDGERNAME>Party Name</PARTYLEDGERNAME>
    
    <LEDGERENTRIES.LIST>
      <LEDGERNAME>Ledger 1</LEDGERNAME>
      <AMOUNT>1000.00</AMOUNT>
    </LEDGERENTRIES.LIST>
    
    <LEDGERENTRIES.LIST>
      <LEDGERNAME>Ledger 2</LEDGERNAME>
      <AMOUNT>-1000.00</AMOUNT>
    </LEDGERENTRIES.LIST>
  </VOUCHER>
  
  <VOUCHER>
    <!-- More vouchers... -->
  </VOUCHER>
</ENVELOPE>
```

**⚠️ Note:** Daybook format works but without dynamic ledger columns

---

## Character Encoding Details

### **Encoding Detection (Automatic)**

The parser checks for these encodings in order:

| Priority | Encoding | BOM | Detected By |
|----------|----------|-----|------------|
| 1 | UTF-16 LE | FF FE | First 2 bytes |
| 2 | UTF-16 BE | FE FF | First 2 bytes |
| 3 | UTF-8 | EF BB BF | First 3 bytes |
| 4 | UTF-8 | None | Default fallback |

**Most Common (Tally 9 & later):** UTF-16 LE (FF FE)

### **Manual Encoding Check in Hex Editor:**

```
UTF-16 LE:   FF FE 3C 00 3F 00 78 00 ...
                  (<?xml in UTF-16 LE)

UTF-16 BE:   FE FF 00 3C 00 3F 00 78 ...
                  (<?xml in UTF-16 BE)

UTF-8:       EF BB BF 3C 3F 78 6D 6C ...
                  (<?xml in UTF-8)

UTF-8 (NoBOM): 3C 3F 78 6D 6C 20 76 65 ...
                  (<?xml in UTF-8, no BOM)
```

---

## XML Validation

### **Valid Tally XML Must Have:**

✅ XML Declaration: `<?xml version="1.0" encoding="UTF-16"?>`
✅ ENVELOPE root: `<ENVELOPE>...</ENVELOPE>`
✅ Data rows: Either `<DBCFIXED>` OR `<VOUCHER>` elements
✅ At least one field per row (Date, Party, Amount, etc.)

### **Common Issues:**

❌ **"Invalid XML format"**
- File is corrupted
- Not saved as XML
- Incomplete export

❌ **"No valid data rows found"**
- Wrong export format (not a register)
- Exported an empty period
- XML structure doesn't match

❌ **"Garbled characters"**
- Rare (auto-detection should handle it)
- File was reencoded incorrectly
- Try exporting again from Tally

---

## Export Type Recommendations

### **Best For This Converter:**

| Use Case | Export Type | Rating |
|----------|------------|--------|
| Debit Note Register | Columnar Register | ⭐⭐⭐⭐⭐ |
| Journal Register | Columnar Register | ⭐⭐⭐⭐⭐ |
| Purchase Register | Columnar Register | ⭐⭐⭐⭐⭐ |
| Sales Register | Columnar Register | ⭐⭐⭐⭐⭐ |
| Party-wise Report | Columnar Register | ⭐⭐⭐⭐ |
| Daybook | Daybook XML | ⭐⭐⭐ |
| Trial Balance | Use Tally's Excel export | ❌ |
| P&L Statement | Use Tally's Excel export | ❌ |
| Balance Sheet | Use Tally's Excel export | ❌ |

---

## Size Limitations

### **Parser Can Handle:**

| Data Volume | Processing Time | File Size |
|------------|-----------------|-----------|
| 5 rows | < 100ms | < 10 KB |
| 100 rows | < 500ms | 50-100 KB |
| 1,000 rows | 1-2 sec | 500 KB - 1 MB |
| 10,000 rows | 10-15 sec | 5-10 MB |
| 100,000 rows | 100-150 sec | 50-100 MB |

### **Excel Sheet Limits:**

- Max rows per sheet: **1,048,576**
- Max columns: **16,384**
- Max cell content: **32,767 characters**

*Parser splits large content if needed*

---

## Tally Version Compatibility

| Tally Version | XML Format | Encoding | Status |
|--------------|-----------|----------|--------|
| Tally 9.0+ | Columnar Register | UTF-16 LE | ✅ Supported |
| Tally 7.0 | Columnar Register | UTF-8 | ✅ Supported |
| Tally 6.0 | Limited XML | UTF-8 | ⚠️ May work |
| OnTally Cloud | Web API | UTF-8 | ❌ Different API |

---

## Example: How to Find Encoding of Your File

### **Windows:**
1. Right-click XML file → **Properties** → check file size
2. Open with Notepad → Check characters (garbled = UTF-16)
3. Use HexDump: `certutil -encodehex file.xml output.txt`

### **Mac/Linux:**
```bash
# Check file encoding
file -b yourfile.xml

# Show first bytes in hex
hexdump -C yourfile.xml | head

# Output examples:
# UTF-16 LE: "ff fe"
# UTF-8: "ef bb bf" (with BOM)
```

---

## Quick Troubleshooting Flowchart

```
Does your XML parse? 
  ├─ NO → Check file is proper XML
  ├─ Check encoding is UTF-8 or UTF-16
  ├─ Try exporting again from Tally
  └─ Check file isn't corrupted

Does it have DBCFIXED tags?
  ├─ NO → Check you exported a "Register" format
  ├─ Try: Display → Statutory Reports → Choose a Register
  └─ Journal Register is safest option

Are columns extracting correctly?
  ├─ NO → Check DBCLEDAMT values exist
  ├─ Sometimes empty columns appear - this is normal
  └─ Check column headers in XML (DBCCOLNAME)

Is output Excel correct?
  ├─ YES → You're done! ✨
  ├─ Missing data? → Check source XML has data
  ├─ Wrong formatting? → Styling applied to all rows
  └─ Too many rows? → Excel has 1M row limit
```

---

## Next Steps

1. **Export** a Columnar Register from Tally as XML
2. **Upload** to the converter
3. **Download** the formatted Excel file
4. **Done!** File is ready for sharing/processing

**For large files (10K+ rows):** Processing may take 10-15 seconds - this is normal.
