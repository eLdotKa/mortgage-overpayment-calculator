/* Mortgage Money Saver - local data layer
   All mortgage data is stored locally in the browser using IndexedDB.
   No mortgage profile data is sent to a server by this app.
*/
(function(){
  const DB_NAME='mortgage-money-saver';
  const DB_VERSION=1;
  const STORE='app';
  const KEY='user-data';

  function openDB(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }

  async function read(){
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly');
      const req=tx.objectStore(STORE).get(KEY);
      req.onsuccess=()=>resolve(req.result||null);
      req.onerror=()=>reject(req.error);
    });
  }

  async function write(data){
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(data,KEY);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
    });
  }

  async function clear(){
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
    });
  }

  function collect(){
    const ids=[
      'balance','rate','years','months','overpay','dob','targetAge',
      'scenario1','scenario2','scenario3','scenario4',
      'oneOff','oneOffMonth','annualExtra','futureRate','rateChangeMonth'
    ];
    const fields={};
    ids.forEach(id=>{ const el=document.getElementById(id); if(el) fields[id]=el.value; });
    return {version:1,savedAt:new Date().toISOString(),fields};
  }

  function apply(data){
    if(!data || !data.fields) return false;
    Object.entries(data.fields).forEach(([id,value])=>{
      const el=document.getElementById(id);
      if(el && typeof value==='string') el.value=value;
    });
    return true;
  }

  async function save(){
    await write(collect());
    setStatus('Saved on this device');
  }

  function setStatus(message){
    const el=document.getElementById('saveStatus');
    if(el){ el.textContent=message; el.dataset.state='saved'; }
  }

  async function load(){
    try{
      const data=await read();
      if(data && apply(data)){
        setStatus('Loaded from this device');
        if(typeof window.calculateMortgage==='function') window.calculateMortgage();
      } else {
        setStatus('Not saved yet');
      }
    }catch(e){
      setStatus('Local storage is unavailable in this browser');
    }
  }

  function downloadJSON(data){
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download='mortgage-money-saver-data.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  async function exportData(){
    try{ downloadJSON(collect()); setStatus('Data exported'); }
    catch(e){ setStatus('Export failed'); }
  }

  async function importData(file){
    if(!file) return;
    try{
      const text=await file.text();
      const data=JSON.parse(text);
      if(!data || data.version!==1 || !data.fields) throw new Error('Invalid data file');
      apply(data);
      await write(data);
      if(typeof window.calculateMortgage==='function') window.calculateMortgage();
      setStatus('Data imported');
    }catch(e){ setStatus('Import failed - please choose a valid Mortgage Money Saver JSON file'); }
  }

  async function deleteAll(){
    const confirmed=window.confirm('Delete all saved mortgage data from this device? This cannot be undone.');
    if(!confirmed) return;
    await clear();
    const ids=[
      'balance','rate','years','months','overpay','dob','targetAge',
      'scenario1','scenario2','scenario3','scenario4',
      'oneOff','oneOffMonth','annualExtra','futureRate','rateChangeMonth'
    ];
    ids.forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.value=el.type==='date' ? '' : '';
    });
    if(typeof window.calculateMortgage==='function') window.calculateMortgage();
    setStatus('All saved data deleted from this device');
  }

  window.MortgageStorage={load,save,exportData,importData,deleteAll,collect};
})();