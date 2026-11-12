(() => {
  const get=id=>document.getElementById(id);
  const panel=get('compare');
  const copy=(en,pl)=>isPolish()?pl:en;
  const options=['A','B'];
  const field=(id,en,pl,step,min,max)=>`<label for="${id}" data-en="${en}" data-pl="${pl}"></label><input id="${id}" type="number" required step="${step}" min="${min}" max="${max}">`;
  panel.innerHTML=`<div class="card"><h2 class="title" data-en="Compare two mortgage deals" data-pl="Porównaj dwie oferty kredytu"></h2>
    <p class="subtitle" data-en="Compare repayment mortgages for the same loan amount. Rates stay fixed throughout and fees are paid upfront. Interest is estimated monthly. Overpayments are excluded." data-pl="Podaj tę samą kwotę kredytu dla obu ofert. Obliczenia zakładają stałe oprocentowanie przez cały okres, opłatę płatną z góry i spłatę bez nadpłat. Odsetki szacujemy miesięcznie."></p>
    ${field('loan','Loan amount (£)','Kwota kredytu (£)','any',0.01,1e10)}
    <div class="offers">${options.map(key=>`<fieldset><legend data-en="Deal ${key}" data-pl="Oferta ${key}"></legend>
      ${field('apr'+key,'Annual interest (%)','Oprocentowanie roczne (%)','any',0,100)}
      ${field('term'+key,'Term (months)','Okres (miesiące)',1,1,1200)}
      ${field('fee'+key,'Upfront fee (£)','Opłata początkowa (£)','any',0,1e10)}</fieldset>`).join('')}</div>
    <label for="horizon" data-en="Compare over" data-pl="Okres porównania"></label>
    <select id="horizon"><option value="full" data-en="Full term" data-pl="Cały okres"></option><option value="24" data-en="2 years" data-pl="2 lata"></option><option value="60" data-en="5 years" data-pl="5 lat"></option></select>
    <p class="small" id="dealStatus" role="status"></p>
    <div id="comparisonResults" aria-live="polite"></div></div>`;
  let initialized=false;
  const storageKey='mortgage-deal-comparison-v1';
  const fields=['loan','aprA','aprB','termA','termB','feeA','feeB','horizon'];
  let savedAt='', saveFailed=false;
  function snapshot(){
    if(!initialized) return null;
    return {savedAt,fields:Object.fromEntries(fields.map(id=>[id,get(id).value]))};
  }
  function restore(data){
    if(!data) return;
    if(!fields.every(id=>typeof data.fields?.[id]==='string') ||
       !['full','24','60'].includes(data.fields.horizon)) throw Error('Invalid comparison');
    for(const id of fields) get(id).value=data.fields[id];
    savedAt=data.savedAt||'';
    initialized=true;
  }
  function persist(){
    const timestamp=new Date().toISOString();
    try{
      localStorage.setItem(storageKey,JSON.stringify({...snapshot(),savedAt:timestamp}));
      savedAt=timestamp;
      saveFailed=false;
    }catch{saveFailed=true;}
  }
  function reset(){
    localStorage.removeItem(storageKey);
    initialized=false;
    savedAt='';
    saveFailed=false;
    for(const id of fields) get(id).value=id==='horizon'?'full':'';
    get('comparisonResults').textContent='';
    openPage(!panel.hidden);
    render();
  }
  window.DealComparison={snapshot,reset,importData(data){
    if(!data){reset();return;}
    restore(data);
    persist();
    render();
  }};
  try{restore(JSON.parse(localStorage.getItem(storageKey)));}catch{saveFailed=true;}
  function openPage(compare){
    get('calculator').hidden=compare;
    panel.hidden=!compare;
    get('openCompare').setAttribute('aria-pressed',String(compare));
    get('openCalc').setAttribute('aria-pressed',String(!compare));
    if(compare && !initialized){
      get('loan').value=get('balance').value;
      for(const key of options){
        get('apr'+key).value=get('rate').value;
        get('term'+key).value=Number(get('years').value)*12+Number(get('months').value);
        get('fee'+key).value=0;
      }
      initialized=true;
      render();
    }
  }
  function render(){
    panel.querySelectorAll('[data-en]').forEach(el=>el.textContent=copy(el.dataset.en,el.dataset.pl));
    const output=get('comparisonResults');
    const time=new Date(savedAt);
    get('dealStatus').textContent=saveFailed?copy('Local save unavailable','Zapis lokalny niedostępny'):
      Number.isFinite(time.getTime())?copy('Saved on this device · ','Zapisano na urządzeniu · ')+time.toLocaleString(locale()):'';
    if(!initialized) return;
    if(Array.from(panel.querySelectorAll('input')).some(input=>!input.validity.valid)){
      output.textContent=copy('Enter a valid amount, rate, term and fee for both deals.','Podaj prawidłową kwotę, oprocentowanie, okres i opłatę dla obu ofert.');
      return;
    }
    const loan=get('loan').valueAsNumber;
    const deals=options.map(key=>{
      const rate=get('apr'+key).valueAsNumber/1200;
      const months=get('term'+key).valueAsNumber;
      const fee=get('fee'+key).valueAsNumber;
      const payment=rate ? loan*rate/-Math.expm1(-months*Math.log1p(rate)) : loan/months;
      const horizon=get('horizon').value;
      const elapsed=horizon==='full'?months:Math.min(Number(horizon),months);
      const remaining=months-elapsed;
      const balance=rate?payment*(-Math.expm1(-remaining*Math.log1p(rate)))/rate:payment*remaining;
      const interest=Math.max(0,payment*elapsed-(loan-balance));
      return {payment,interest,fee,balance,cost:interest+fee,total:payment*elapsed+fee};
    });
    const money=new Intl.NumberFormat(locale(),{style:'currency',currency:'GBP'});
    const delta=Math.round(deals[0].cost*100)/100-Math.round(deals[1].cost*100)/100;
    const winner=delta<0?'A':'B';
    const saving=money.format(Math.abs(delta));
    const summary=Math.abs(delta)<0.005 ? copy('Both deals have the same total cost.','Obie oferty mają taki sam koszt całkowity.') :
      copy(`Deal ${winner} costs ${saving} less over the selected period.`,`Oferta ${winner} jest tańsza o ${saving} w wybranym okresie.`);
    const rows=[['payment',copy('Monthly payment','Rata miesięczna')],['interest',copy('Total interest','Suma odsetek')],['fee',copy('Upfront fee','Opłata początkowa')],['cost',copy('Interest + fee','Odsetki + opłata')],['total',copy('Payments incl. fee','Wpłaty z opłatą')],['balance',copy('Remaining balance','Pozostałe saldo')]];
    output.innerHTML=`<p class="note"><strong>${summary}</strong></p><table><thead><tr><th scope="col">${copy('Estimate','Szacunek')}</th>${options.map(key=>`<th scope="col">${copy('Deal','Oferta')} ${key}</th>`).join('')}</tr></thead><tbody>
      ${rows.map(([key,label])=>`<tr><th scope="row">${label}</th>${deals.map(deal=>`<td>${money.format(deal[key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  panel.addEventListener('input',()=>{persist();render();});
  get('openCalc').addEventListener('click',()=>openPage(false));
  get('openCompare').addEventListener('click',()=>openPage(true));
  window.addEventListener('languagechangeapp',render);
  render();
})();
