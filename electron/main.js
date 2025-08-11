const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const { parse } = require('csv-parse/sync');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const bwipjs = require('bwip-js');

let db;
function initDB() {
  const dbPath = path.join(app.getPath('userData'), 'ricemill.db');
  const firstInit = !fs.existsSync(dbPath);
  db = new Database(dbPath);

  db.prepare(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user'
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT,
    quantity REAL DEFAULT 0
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY,
    type TEXT CHECK(type IN ('purchase','sale')) NOT NULL,
    item_id INTEGER NOT NULL,
    qty REAL NOT NULL,
    rate REAL,
    total REAL,
    party TEXT,
    notes TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(item_id) REFERENCES inventory(id)
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS weighings (
    id INTEGER PRIMARY KEY,
    vehicle_no TEXT,
    gross REAL,
    tare REAL,
    net REAL,
    item_id INTEGER,
    party TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();

  if (firstInit) {
    const hash = bcrypt.hashSync('admin123', 8);
    try {
      db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', hash, 'admin');
    } catch (e) {}
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  initDB();
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC - Auth
ipcMain.handle('auth-login', (e, {username, password}) => {
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row) return { error: 'Invalid credentials' };
  const ok = bcrypt.compareSync(password, row.password);
  if (!ok) return { error: 'Invalid credentials' };
  return { id: row.id, username: row.username, role: row.role };
});
ipcMain.handle('auth-register', (e, {username, password}) => {
  const hash = bcrypt.hashSync(password, 8);
  try {
    const info = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hash);
    return { id: info.lastInsertRowid };
  } catch (err) {
    return { error: err.message };
  }
});

// Inventory
ipcMain.handle('inventory-list', () => {
  return db.prepare('SELECT * FROM inventory ORDER BY id DESC').all();
});
ipcMain.handle('inventory-add', (e, item) => {
  const info = db.prepare('INSERT INTO inventory (name, unit, quantity) VALUES (?, ?, ?)').run(item.name, item.unit, item.quantity || 0);
  return { id: info.lastInsertRowid };
});
ipcMain.handle('inventory-update', (e, item) => {
  const info = db.prepare('UPDATE inventory SET name = ?, unit = ?, quantity = ? WHERE id = ?').run(item.name, item.unit, item.quantity, item.id);
  return { changes: info.changes };
});

// Transactions + reports
ipcMain.handle('transaction-add', (e, tx) => {
  const info = db.prepare('INSERT INTO transactions (type, item_id, qty, rate, total, party, notes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(tx.type, tx.item_id, tx.qty, tx.rate, tx.total, tx.party, tx.notes);
  const inv = db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(tx.item_id);
  if (inv) {
    let newQty = inv.quantity + (tx.type === 'purchase' ? tx.qty : -tx.qty);
    db.prepare('UPDATE inventory SET quantity = ? WHERE id = ?').run(newQty, tx.item_id);
  }
  return { id: info.lastInsertRowid };
});
ipcMain.handle('transactions-list', (e, filter) => {
  let q = 'SELECT t.*, i.name as item_name FROM transactions t LEFT JOIN inventory i ON t.item_id = i.id';
  const params = [];
  const clauses = [];
  if (filter) {
    if (filter.type) { clauses.push('t.type = ?'); params.push(filter.type); }
    if (filter.from) { clauses.push('date(t.timestamp) >= date(?)'); params.push(filter.from); }
    if (filter.to) { clauses.push('date(t.timestamp) <= date(?)'); params.push(filter.to); }
  }
  if (clauses.length) q += ' WHERE ' + clauses.join(' AND ');
  q += ' ORDER BY t.timestamp DESC';
  return db.prepare(q).all(...params);
});

// Weighings
ipcMain.handle('weighing-add', (e, w) => {
  const net = (w.gross || 0) - (w.tare || 0);
  const info = db.prepare('INSERT INTO weighings (vehicle_no, gross, tare, net, item_id, party) VALUES (?, ?, ?, ?, ?, ?)').run(w.vehicle_no, w.gross, w.tare, net, w.item_id, w.party);
  return { id: info.lastInsertRowid, net };
});
ipcMain.handle('weighings-list', () => {
  return db.prepare('SELECT w.*, i.name as item_name FROM weighings w LEFT JOIN inventory i ON w.item_id = i.id ORDER BY w.timestamp DESC').all();
});

// CSV export & import
ipcMain.handle('export-csv', async (e, {type}) => {
  try {
    let rows = [];
    let defaultName = 'export.csv';
    if (type === 'inventory') { rows = db.prepare('SELECT * FROM inventory').all(); defaultName = 'inventory.csv'; }
    else { rows = db.prepare('SELECT * FROM transactions').all(); defaultName = 'transactions.csv'; }
    const { filePath } = await dialog.showSaveDialog({ defaultPath: defaultName });
    if (!filePath) return { canceled: true };
    const header = Object.keys(rows[0] || {}).map(k => ({id:k, title:k}));
    const csvWriter = createCsvWriter({ path: filePath, header: header });
    await csvWriter.writeRecords(rows);
    return { saved: true, path: filePath };
  } catch (err) { return { error: err.message }; }
});
ipcMain.handle('import-inventory-csv', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters:[{name:'CSV', extensions:['csv']}]});
    if (canceled || !filePaths.length) return { canceled: true };
    const content = fs.readFileSync(filePaths[0]);
    const records = parse(content, { columns: true, trim: true });
    records.forEach(r => {
      const qty = parseFloat(r.quantity || r.qty || 0) || 0;
      db.prepare('INSERT INTO inventory (name, unit, quantity) VALUES (?, ?, ?)').run(r.name || r.item || 'Unknown', r.unit || '', qty);
    });
    return { imported: true };
  } catch (err) { return { error: err.message }; }
});

// PDF invoice
ipcMain.handle('generate-invoice', async (e, {transactionId}) => {
  try {
    const tx = db.prepare('SELECT t.*, i.name as item_name FROM transactions t LEFT JOIN inventory i ON t.item_id = i.id WHERE t.id = ?').get(transactionId);
    if (!tx) return { error: 'Transaction not found' };
    const { filePath } = await dialog.showSaveDialog({ defaultPath: `invoice-${transactionId}.pdf` });
    if (!filePath) return { canceled: true };
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    doc.fontSize(20).text('RiceMill Invoice', {align:'center'});
    doc.moveDown();
    doc.fontSize(12).text(`Invoice for Transaction ID: ${tx.id}`);
    doc.text(`Type: ${tx.type}`);
    doc.text(`Item: ${tx.item_name}`);
    doc.text(`Qty: ${tx.qty}`);
    doc.text(`Rate: ${tx.rate}`);
    doc.text(`Total: ${tx.total}`);
    doc.text(`Party: ${tx.party || ''}`);
    doc.text(`Date: ${tx.timestamp}`);
    doc.end();
    await new Promise(res => stream.on('finish', res));
    return { saved: true, path: filePath };
  } catch (err) { return { error: err.message }; }
});

// Backup & restore
ipcMain.handle('backup-db', async () => {
  try {
    const dbPath = path.join(app.getPath('userData'), 'ricemill.db');
    if (!fs.existsSync(dbPath)) return { error: 'DB not found' };
    const { filePath } = await dialog.showSaveDialog({ defaultPath: 'ricemill-backup.db' });
    if (!filePath) return { canceled: true };
    fs.copyFileSync(dbPath, filePath);
    return { saved: true, path: filePath };
  } catch (err) { return { error: err.message }; }
});
ipcMain.handle('restore-db', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters:[{name:'DB', extensions:['db']}]});
    if (canceled || !filePaths.length) return { canceled: true };
    const dbPath = path.join(app.getPath('userData'), 'ricemill.db');
    try { db.close(); } catch(e){}
    fs.copyFileSync(filePaths[0], dbPath);
    db = new Database(dbPath);
    return { restored: true, path: dbPath };
  } catch (err) { return { error: err.message }; }
});

// QR & barcode
ipcMain.handle('generate-qr', async (e, {text}) => {
  try {
    const dataUrl = await QRCode.toDataURL(text || '');
    return { dataUrl };
  } catch (err) { return { error: err.message }; }
});
ipcMain.handle('generate-barcode', async (e, {text}) => {
  try {
    const png = await bwipjs.toBuffer({ bcid: 'code128', text: text || '', scale: 3, height: 10, includetext: true, textxalign: 'center' });
    return { dataUrl: 'data:image/png;base64,' + png.toString('base64') };
  } catch (err) { return { error: err.message }; }
});

// Expose DB path
ipcMain.handle('app-db-path', () => ({ path: path.join(app.getPath('userData'), 'ricemill.db') }));
