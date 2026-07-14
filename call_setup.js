fetch('http://localhost:3001/api/setup-admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin' })
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
