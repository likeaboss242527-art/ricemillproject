import React, { useEffect, useState } from 'react'
import './styles.css'

export default function App(){
  const [view, setView] = useState('inventory')
  const [user, setUser] = useState(null)

  useEffect(()=>{ /* initial load */ }, [])

  return (
    <div className="app">
      <header>
        <h1>RiceMill</h1>
        <nav>
          <button onClick={()=>setView('inventory')}>Inventory</button>
          <button onClick={()=>setView('transactions')}>Transactions</button>
          <button onClick={()=>setView('weighings')}>Weighings</button>
          <button onClick={()=>setView('reports')}>Reports</button>
          <button onClick={()=>setView('tools')}>Tools</button>
        </nav>
        <AuthPanel user={user} setUser={setUser}/>
      </header>
      <main>
        {view==='inventory' && <Inventory/>}
        {view==='transactions' && <Transactions/>}
        {view==='weighings' && <Weighings/>}
        {view==='reports' && <Reports/>}
        {view==='tools' && <Tools/>}
      </main>
    </div>
  )
}

function AuthPanel({user, setUser}){
  const [u, setU] = useState('admin'); const [p, setP] = useState('admin123')
  async function login(){ const res = await window.api.authLogin({username:u,password:p}); if(res.error) alert(res.error); else setUser(res) }
  async function reg(){ const res = await window.api.authRegister({username:u,password:p}); if(res.error) alert(res.error); else alert('Registered') }
  if(user) return <div className="auth">Hi, {user.username} <button onClick={()=>setUser(null)}>Logout</button></div>
  return <div className="auth"> <input value={u} onChange={e=>setU(e.target.value)}/> <input value={p} onChange={e=>setP(e.target.value)} type="password"/> <button onClick={login}>Login</button> <button onClick={reg}>Register</button></div>
}

/* Simple components (minimal UI for demo) */
function Inventory(){
  const [rows, setRows] = useState([]); const [name, setName]=useState(''); const [unit, setUnit]=useState('kg'); const [qty, setQty]=useState(0)
  useEffect(()=>{ load() },[])
  async function load(){ setRows(await window.api.inventoryList())}
  async function add(){ await window.api.inventoryAdd({name,unit,quantity:parseFloat(qty)||0}); setName(''); setQty(0); load() }
  async function imp(){ const r = await window.api.importInventoryCsv(); if(r.error) alert(r.error); else load() }
  async function exp(){ const r = await window.api.exportCsv({type:'inventory'}); if(r.error) alert(r.error); else alert('Saved: '+r.path) }
  return <section><h2>Inventory</h2>
    <div className="row"><input placeholder="name" value={name} onChange={e=>setName(e.target.value)}/><input value={unit} onChange={e=>setUnit(e.target.value)}/><input type="number" value={qty} onChange={e=>setQty(e.target.value)}/><button onClick={add}>Add</button><button onClick={exp}>Export</button><button onClick={imp}>Import</button></div>
    <table className="table"><thead><tr><th>ID</th><th>Name</th><th>Unit</th><th>Qty</th></tr></thead><tbody>{rows.map(r=> <tr key={r.id}><td>{r.id}</td><td>{r.name}</td><td>{r.unit}</td><td>{r.quantity}</td></tr>)}</tbody></table>
  </section>
}

function Transactions(){
  const [inv, setInv]=useState([]); const [rows,setRows]=useState([]); const [type,setType]=useState('purchase'); const [item,setItem]=useState(''); const [qty,setQty]=useState(0); const [rate,setRate]=useState(0)
  useEffect(()=>{ load() },[])
  async function load(){ setInv(await window.api.inventoryList()); setRows(await window.api.transactionsList()); if(inv[0]) setItem(inv[0].id) }
  async function add(){ const tx={type,item_id:parseInt(item),qty:parseFloat(qty)||0,rate:parseFloat(rate)||0,total:(parseFloat(qty)||0)*(parseFloat(rate)||0),party:''}; await window.api.transactionAdd(tx); load() }
  async function exp(){ const r = await window.api.exportCsv({type:'transactions'}); if(r.error) alert(r.error); else alert('Saved: '+r.path) }
  return <section><h2>Transactions</h2>
    <div className="row"><select onChange={e=>setType(e.target.value)} value={type}><option>purchase</option><option>sale</option></select>
    <select onChange={e=>setItem(e.target.value)} value={item}>{inv.map(i=> <option key={i.id} value={i.id}>{i.name}</option>)}</select>
    <input type="number" value={qty} onChange={e=>setQty(e.target.value)} placeholder="qty"/><input type="number" value={rate} onChange={e=>setRate(e.target.value)} placeholder="rate"/><button onClick={add}>Add</button><button onClick={exp}>Export</button></div>
    <table className="table"><thead><tr><th>ID</th><th>Type</th><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody>{rows.map(r=> <tr key={r.id}><td>{r.id}</td><td>{r.type}</td><td>{r.item_name}</td><td>{r.qty}</td><td>{r.total}</td></tr>)}</tbody></table>
  </section>
}

function Weighings(){
  const [rows,setRows]=useState([]); const [vehicle,setVehicle]=useState(''); const [gross,setGross]=useState(0); const [tare,setTare]=useState(0); const [inv,setInv]=useState([]); const [item,setItem]=useState('')
  useEffect(()=>{ load() },[])
  async function load(){ setInv(await window.api.inventoryList()); setRows(await window.api.weighingsList()); if(inv[0]) setItem(inv[0].id) }
  async function add(){ await window.api.weighingAdd({vehicle_no:vehicle, gross:parseFloat(gross)||0, tare:parseFloat(tare)||0, item_id:parseInt(item), party:''}); load() }
  return <section><h2>Weighings</h2>
    <div className="row"><input placeholder="Vehicle" value={vehicle} onChange={e=>setVehicle(e.target.value)}/><select onChange={e=>setItem(e.target.value)} value={item}>{inv.map(i=> <option key={i.id} value={i.id}>{i.name}</option>)}</select><input type="number" value={gross} onChange={e=>setGross(e.target.value)} placeholder="gross"/><input type="number" value={tare} onChange={e=>setTare(e.target.value)} placeholder="tare"/><button onClick={add}>Add</button></div>
    <table className="table"><thead><tr><th>ID</th><th>Vehicle</th><th>Item</th><th>Gross</th><th>Tare</th><th>Net</th></tr></thead><tbody>{rows.map(r=> <tr key={r.id}><td>{r.id}</td><td>{r.vehicle_no}</td><td>{r.item_name}</td><td>{r.gross}</td><td>{r.tare}</td><td>{r.net}</td></tr>)}</tbody></table>
  </section>
}

function Reports(){
  const [from,setFrom]=useState(''); const [to,setTo]=useState(''); const [rows,setRows]=useState([])
  async function apply(){ const res = await window.api.transactionsList({from,to}); if(res.error) alert(res.error); else setRows(res) }
  return <section><h2>Reports</h2>
    <div className="row">From: <input type="date" value={from} onChange={e=>setFrom(e.target.value)}/> To: <input type="date" value={to} onChange={e=>setTo(e.target.value)}/> <button onClick={apply}>Apply</button></div>
    <table className="table"><thead><tr><th>ID</th><th>Type</th><th>Item</th><th>Qty</th><th>Total</th><th>Date</th></tr></thead><tbody>{rows.map(r=> <tr key={r.id}><td>{r.id}</td><td>{r.type}</td><td>{r.item_name}</td><td>{r.qty}</td><td>{r.total}</td><td>{r.timestamp}</td></tr>)}</tbody></table>
  </section>
}

function Tools(){
  const [text,setText]=useState(''); const [preview,setPreview]=useState('')
  async function qr(){ const r = await window.api.generateQr({text}); if(r.error) alert(r.error); else setPreview(r.dataUrl) }
  async function bar(){ const r = await window.api.generateBarcode({text}); if(r.error) alert(r.error); else setPreview(r.dataUrl) }
  async function backup(){ const r = await window.api.backupDb(); if(r.error) alert(r.error); else alert('Saved: '+r.path) }
  async function restore(){ const r = await window.api.restoreDb(); if(r.error) alert(r.error); else alert('Restored - restart app') }
  async function invoice(){ const id = prompt('Transaction ID'); if(!id) return; const r = await window.api.generateInvoice({transactionId: parseInt(id)}); if(r.error) alert(r.error); else alert('Saved: '+r.path) }
  return <section><h2>Tools</h2>
    <div className="row"><input placeholder="text for QR/barcode" value={text} onChange={e=>setText(e.target.value)}/><button onClick={qr}>Generate QR</button><button onClick={bar}>Generate barcode</button><button onClick={backup}>Backup DB</button><button onClick={restore}>Restore DB</button><button onClick={invoice}>Generate Invoice by TxID</button></div>
    {preview && <div><img src={preview} alt="preview" style={{maxWidth:300}}/></div>}
  </section>
}
