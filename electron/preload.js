const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  authLogin: (u) => ipcRenderer.invoke('auth-login', u),
  authRegister: (u) => ipcRenderer.invoke('auth-register', u),
  inventoryList: () => ipcRenderer.invoke('inventory-list'),
  inventoryAdd: (i) => ipcRenderer.invoke('inventory-add', i),
  inventoryUpdate: (i) => ipcRenderer.invoke('inventory-update', i),
  transactionsList: (f) => ipcRenderer.invoke('transactions-list', f),
  transactionAdd: (t) => ipcRenderer.invoke('transaction-add', t),
  weighingsList: () => ipcRenderer.invoke('weighings-list'),
  weighingAdd: (w) => ipcRenderer.invoke('weighing-add', w),
  exportCsv: (opts) => ipcRenderer.invoke('export-csv', opts),
  importInventoryCsv: () => ipcRenderer.invoke('import-inventory-csv'),
  generateInvoice: (opts) => ipcRenderer.invoke('generate-invoice', opts),
  backupDb: () => ipcRenderer.invoke('backup-db'),
  restoreDb: () => ipcRenderer.invoke('restore-db'),
  generateQr: (opts) => ipcRenderer.invoke('generate-qr', opts),
  generateBarcode: (opts) => ipcRenderer.invoke('generate-barcode', opts),
  appDbPath: () => ipcRenderer.invoke('app-db-path')
});
