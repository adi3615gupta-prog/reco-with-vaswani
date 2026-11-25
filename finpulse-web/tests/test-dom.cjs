const { DOMParser } = require('xmldom');
const xml = `<PARENT>Duties &amp; Taxes</PARENT>`;
const parser = new DOMParser();
const doc = parser.parseFromString(xml, 'text/xml');
console.log(doc.documentElement.textContent);
