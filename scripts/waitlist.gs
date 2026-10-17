// Waiting-list backend: Google Apps Script bound to a Google Sheet (Extensions > Apps Script).
// Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone. Put the /exec URL in
// _data/tournament.yml registration.waitlist_endpoint. Export with File > Download > CSV.

const HEADERS = ['Timestamp', 'Name', 'Event', 'Mobile', 'Email'];
const LIMITS = { name: 80, event: 60, mobile: 20, email: 120 };

function doPost(e) {
  const p = (e && e.parameter) || {};
  if (p.website) return json({ ok: true }); // honeypot filled in: silently drop bots

  const row = {};
  for (const k in LIMITS) {
    const v = String(p[k] || '').trim();
    if (!v || v.length > LIMITS[k]) return json({ ok: false, error: 'invalid ' + k });
    row[k] = v;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return json({ ok: false, error: 'invalid email' });
  if (!/^[0-9 +()\-]{8,20}$/.test(row.mobile)) return json({ ok: false, error: 'invalid mobile' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
    const ts = Utilities.formatDate(new Date(), 'Australia/Sydney', "yyyy-MM-dd HH:mm:ss");
    sheet.appendRow([ts, row.name, row.event, row.mobile, row.email].map(asText));
  } finally {
    lock.releaseLock();
  }
  return json({ ok: true });
}

// Leading apostrophe stores the value as text in Sheets; a second one survives CSV export so Excel
// won't evaluate values starting with = + - @ as formulas.
function asText(v) {
  return "'" + (/^[=+\-@]/.test(v) ? "'" + v : v);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
