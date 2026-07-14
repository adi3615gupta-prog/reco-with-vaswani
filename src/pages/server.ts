import express from 'express';
import cors from 'cors';
import { executeOutputReconciliation } from '../lib/outputReconciliationService.ts';

const app = express();
const port = 3001; // You can change this port if needed

// --- Middleware Setup ---
// Enable Cross-Origin Resource Sharing so your React app can talk to this server
app.use(cors());
// Enable the server to parse JSON request bodies
app.use(express.json({ limit: '50mb' })); // Increased limit for large file data

// --- API Route ---
// This is where you paste the provided code.
app.post('/api/reconcile-output', (req, res) => {
  try {
    const { booksSales, booksReturns, portalB2B, portalExport, portalB2C, portalB2CL, portalCN, portalNil } = req.body;

    // Execute engine
    const excelBuffer = executeOutputReconciliation({
      booksSales, booksReturns, portalB2B, portalExport, portalB2C, portalB2CL, portalCN, portalNil
    });

    // Send downloadable Excel file back to React Client
    res.setHeader('Content-Disposition', 'attachment; filename="GSTR1_Reconciliation_Output.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(excelBuffer);

  } catch (error: any) {
    console.error('Reconciliation API Error:', error);
    res.status(500).json({ error: 'Reconciliation generation failed', message: error.message });
  }
});

app.listen(port, () => {
  console.log(`✅ RECO WITH VASWANI backend server listening on http://localhost:${port}`);
});