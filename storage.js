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

  function read(){
    return openDB().then(db=>new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly');
      const req=tx.objectStore(STORE).get(KEY);
      req.onsuccess=()=>resolve(req.result||null);
      req.onerror=()=>reject(req.error);
    }));
  }

  function write(data){
    return openDB().then(db=>new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(data,KEY);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
    }));
  }

  function clear(){
    return openDB().then(db=>new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
    }));
  }

  const FIELD_IDS=[
    'balance','rate','years','months','overpay','dob','targetAge',
    'scenario1','scenario2','scenario3','scenario4',
    'oneOff','oneOffMonth','annualExtra','futureRate','rateChangeMonth'
  ];

  function collectFields(){
    const fields={};
    FIELD_IDS.forEach(id=>{ const el=document.getElementById(id); if(el) fields[id]=el.value; });
    return fields;
  }

  function applyFields(fields){
    if(!fields) return false;
    Object.entries(fields).forEach(([id,value])=>{
      const el=document.getElementById(id);
      if(el && typeof value==='string') el.value=value;
    });
    return true;
  }

  function getData(){
    return {version:2,savedAt:new Date().toISOString(),fields:collectFields(),scenarios:currentScenarios};
  }

  function setStatus(message){
    const el=document.getElementById('saveStatus');
    if(el){ el.textContent=message; el.dataset.state='saved'; }
  }

  let currentScenarios=[];

  function normaliseScenarios(data){
    return Array.isArray(data?.scenarios) ? data.scenarios.filter(s=>s && s.id && s.name && s.fields) : [];
  }

  function renderScenarios(){
    const list=document.getElementById('savedScenarios');
    if(!list) return;
    if(!currentScenarios.length){
      list.innerHTML='<div class="small">No saved scenarios yet.</div>';
      return;
    }
    list.innerHTML=currentScenarios.map(s=>{
      const safeName=String(s.name).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
      const saved=String(s.savedAt||'').slice(0,10);
      return '<div class="scenario-row"><div><strong>'+safeName+'</strong><div class="small">Saved '+saved+'</div></div><div class="actions scenario-actions"><button class="secondary scenario-load" data-id="'+s.id+'" type="button">LOAD</button><button class="secondary scenario-delete" data-id="'+s.id+'" type="button">DELETE</button></div></div>';
    }).join('');
    list.querySelectorAll('.scenario-load').forEach(btn=>btn.addEventListener('click',()=>loadScenario(btn.dataset.id)));
    list.querySelectorAll('.scenario-delete').forEach(btn=>btn.addEventListener('click',()=>deleteScenario(btn.dataset.id)));
  }

  async function save(){
    currentScenarios=normaliseScenarios(await read());
    await write(getData());
    setStatus('Saved on this device');
  }

  async function load(){
    try{
      const data=await read();
      currentScenarios=normaliseScenarios(data);
      if(data && data.fields){
        applyFields(data.fields);
        setStatus('Loaded from this device');
        renderScenarios();
        if(typeof window.calculateMortgage==='function') window.calculateMortgage();
      }else{
        renderScenarios();
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
    try{ currentScenarios=normaliseScenarios(await read()); downloadJSON(getData()); setStatus('Data exported'); }
    catch(e){ setStatus('Export failed'); }
  }

  async function importData(file){
    if(!file) return;
    try{
      const text=await file.text();
      const data=JSON.parse(text);
      if(!data || ![1,2].includes(data.version) || !data.fields) throw new Error('Invalid data file');
      currentScenarios=normaliseScenarios(data);
      applyFields(data.fields);
      await write({version:2,savedAt:new Date().toISOString(),fields:collectFields(),scenarios:currentScenarios});
      renderScenarios();
      if(typeof window.calculateMortgage==='function') window.calculateMortgage();
      setStatus('Data imported');
    }catch(e){ setStatus('Import failed - please choose a valid Mortgage Money Saver JSON file'); }
  }

  async function deleteAll(){
    const confirmed=window.confirm('Delete all saved mortgage data from this device? This cannot be undone.');
    if(!confirmed) return;
    await clear();
    currentScenarios=[];
    FIELD_IDS.forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.value='';
    });
    renderScenarios();
    if(typeof window.calculateMortgage==='function') window.calculateMortgage();
    setStatus('All saved data deleted from this device');
  }

  async function saveScenario(name){
    const cleanName=String(name||'').trim();
    if(!cleanName) return false;
    currentScenarios=normaliseScenarios(await read());
    const scenario={
      id:'scenario-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),
      name:cleanName,
      savedAt:new Date().toISOString(),
      fields:collectFields()
    };
    currentScenarios.unshift(scenario);
    currentScenarios=currentScenarios.slice(0,20);
    await write(getData());
    renderScenarios();
    setStatus('Scenario saved');
    return true;
  }

  async function loadScenario(id){
    const scenario=currentScenarios.find(s=>s.id===id);
    if(!scenario) return;
    applyFields(scenario.fields);
    if(typeof window.calculateMortgage==='function') window.calculateMortgage();
    await write(getData());
    setStatus('Scenario loaded');
  }

  async function deleteScenario(id){
    currentScenarios=currentScenarios.filter(s=>s.id!==id);
    await write(getData());
    renderScenarios();
    setStatus('Scenario deleted');
  }

  window.MortgageStorage={
    load,save,exportData,importData,deleteAll,collect:()=>getData(),
    saveScenario,loadScenario,deleteScenario,renderScenarios
  };
})();
