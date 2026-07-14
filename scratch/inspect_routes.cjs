const express = require('express');
const setupTaxRoutes = require('../tax_routes.js').default;

const app = express();
const db = {
  serialize: (cb) => cb(),
  run: () => {},
  get: () => {},
  all: () => {}
};

// Register dummy to initialize router
app.get('/dummy', (req, res) => {});

setupTaxRoutes(app, db);

console.log('Registered Routes:');
app._router.stack.forEach((r) => {
  if (r.route && r.route.path) {
    console.log(Object.keys(r.route.methods).join(', ').toUpperCase(), r.route.path);
  }
});
