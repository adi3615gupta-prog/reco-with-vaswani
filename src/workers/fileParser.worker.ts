import * as XLSX from 'xlsx';

export interface FileParserWorkerMessage {
  type: 'PARSE_FILE';
  buffer: ArrayBuffer;
  fileName: string;
  options?: { findHeader?: boolean; raw?: boolean };
}

export type FileParserWorkerResponse =
  | { type: 'PROGRESS'; stage: string; percent: number }
  | { type: 'SUCCESS'; data: { headers: string[]; rows: Record<string, unknown>[] } }
  | { type: 'ERROR'; error: string };

self.onmessage = (event: MessageEvent<FileParserWorkerMessage>) => {
  const { type, buffer, fileName, options } = event.data;

  if (type === 'PARSE_FILE') {
    try {
      self.postMessage({ type: 'PROGRESS', stage: `Reading ${fileName}...`, percent: 20 });

      const data = new Uint8Array(buffer);
      const wb = XLSX.read(data, { type: 'array', cellDates: false });

      self.postMessage({ type: 'PROGRESS', stage: 'Extracting worksheet data...', percent: 60 });

      const sheet = wb.Sheets[wb.SheetNames[0]];

      let range = 0;
      if (options?.findHeader) {
        const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
        const headerKeywords = [
          'date', 'particulars', 'party name', 'ledger name', 'pan', 'section',
          'voucher type', 'voucher no', 'voucher number', 'deductee pan', 'deductee name',
          'amount paid', 'tds deposited', 'tds deducted'
        ];

        for (let r = 0; r < Math.min(rawData.length, 30); r++) {
          const row = rawData[r];
          if (Array.isArray(row)) {
            const matchCount = row.filter((cell) => {
              const s = String(cell || '').toLowerCase().trim();
              return headerKeywords.some((kw) => s === kw || s.includes(kw));
            }).length;

            if (matchCount >= 2) {
              range = r;
              break;
            }
          }
        }
      }

      self.postMessage({ type: 'PROGRESS', stage: 'Normalizing rows and headers...', percent: 85 });

      const rawOption = options?.raw !== undefined ? options.raw : false;
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range, defval: '', raw: rawOption });

      if (json.length === 0) {
        self.postMessage({ type: 'SUCCESS', data: { headers: [], rows: [] } });
        return;
      }

      const headers = Object.keys(json[0]);

      self.postMessage({
        type: 'SUCCESS',
        data: { headers, rows: json }
      });
    } catch (err: any) {
      self.postMessage({ type: 'ERROR', error: err?.message || 'Failed to parse file in Web Worker' });
    }
  }
};
