const express = require('express');
const { HANDLERS, dispatchLicenseRequest } = require('./handlers');

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'vaswani-license-gateway' }));

for (const action of [...Object.keys(HANDLERS), 'superAdmin']) {
  app.all(`/${action}`, (req, res) => dispatchLicenseRequest(action, req, res));
}

const PORT = process.env.PORT || 8787;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Vaswani Free License Gateway listening on port ${PORT}`);
});

