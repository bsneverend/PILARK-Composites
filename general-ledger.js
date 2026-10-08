(() => {
  const state={accounts:[],rows:[],selectedAccount:'',loaded:false};
  const $=id=>document.getElementById(id);
  const client=()=>window.PILARK_CMS?.client;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v||0));
  const dateText=v=>v?new Date(v+'T00:00:00').toLocaleDateString('id-ID'):'—';

  async function paged(table,columns,configure){
    const out=[];let from=0;
    while(true){
      let q=client().from(table).select(columns);
      q=configure(q);
      const {data,error}=await q.range(from,from+999);
      if(error)throw error;
      out.push(...(data||[]));
      if(!data||data.length<1000)break;
      from+=1000;
    }
    return out;
  }

  function setDefaults(){
    const now=new Date(), first=new Date(now.getFullYear(),now.getMonth(),1);
    const iso=d=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day};
    if($('generalLedgerFrom')&&!$('generalLedgerFrom').value)$('generalLedgerFrom').value=iso(first);
    if($('generalLedgerTo')&&!$('generalLedgerTo').value)$('generalLedgerTo').value=iso(now);
  }

  async function loadAccounts(){
    const {data,error}=await client().from('accounting_accounts').select('id,code,name,account_type,is_group,is_active').eq('is_active',true).eq('is_group',false).order('code');
    if(error)throw error;
    state.accounts=data||[];
    $('generalLedgerAccount').innerHTML='<option value="">Select account…</option>'+state.accounts.map(a=>'<option value="'+a.id+'">'+esc(a.code)+' — '+esc(a.name)+'</option>').join('');
  }

  async function load(){
    if(!client())return;
    setDefaults();
    const accountId=$('generalLedgerAccount')?.value||state.selectedAccount;
    if(!accountId){
      await loadAccounts();
      state.loaded=true;
      $('generalLedgerBody').innerHTML='<tr><td colspan="9" class="accounting-empty">Select an account to view its General Ledger.</td></tr>';
      $('generalLedgerSummary').innerHTML='';
      return;
    }
    state.selectedAccount=accountId;
    const from=$('generalLedgerFrom')?.value||'0001-01-01',to=$('generalLedgerTo')?.value||'9999-12-31';
    const lines=await paged('accounting_lines','id,entry_id,account_id,partner_id,description,debit,credit,reconciled,accounting_partners(name)',q=>q.eq('account_id',accountId).order('created_at',{ascending:true}));
    const entryIds=[...new Set(lines.map(x=>x.entry_id).filter(Boolean))];
    let entries=[];
    for(let i=0;i<entryIds.length;i+=500){
      const ids=entryIds.slice(i,i+500);
      const {data,error}=await client().from('accounting_entries').select('id,entry_no,entry_date,reference,memo,status,journal_id,partner_id,accounting_journals(code,name),accounting_partners(name)').in('id',ids);
      if(error)throw error;
      entries.push(...(data||[]));
    }
    const byId=new Map(entries.map(e=>[e.id,e]));
    const allPosted=lines.map(l=>({l,e:byId.get(l.entry_id)})).filter(x=>x.e?.status==='posted');
    const account=state.accounts.find(a=>a.id===accountId);
    const normal=['asset_receivable','asset_cash','asset_current','asset_non_current','asset_prepayments','asset_fixed','expense','expense_other','expense_depreciation','expense_direct_cost'].includes(account?.account_type);
    const opening=allPosted.filter(x=>x.e.entry_date<from).reduce((s,x)=>s+(normal?Number(x.l.debit||0)-Number(x.l.credit||0):Number(x.l.credit||0)-Number(x.l.debit||0)),0);
    const qtxt=($('generalLedgerSearch')?.value||'').trim().toLowerCase();
    const recon=$('generalLedgerRecon')?.value||'';
    let rows=allPosted.filter(x=>x.e.entry_date>=from&&x.e.entry_date<=to)
      .filter(x=>!qtxt||[x.e.entry_no,x.e.reference,x.e.memo,x.e.accounting_partners?.name,x.l.description,x.l.accounting_partners?.name].some(v=>String(v||'').toLowerCase().includes(qtxt)))
      .filter(x=>!recon||(recon==='reconciled'&&x.l.reconciled)||(recon==='unreconciled'&&!x.l.reconciled))
      .sort((a,b)=>String(a.e.entry_date).localeCompare(String(b.e.entry_date))||String(a.e.entry_no).localeCompare(String(b.e.entry_no)));
    let running=opening,totalD=0,totalC=0;
    rows=rows.map(x=>{const d=Number(x.l.debit||0),c=Number(x.l.credit||0);totalD+=d;totalC+=c;running+=normal?d-c:c-d;return {...x,balance:running}});
    state.rows=rows;
    const title=account?account.code+' — '+account.name:'General Ledger';
    $('generalLedgerHeading').textContent=title;
    $('generalLedgerSubheading').textContent='Posted transactions · '+dateText(from)+' to '+dateText(to);
    $('generalLedgerSummary').innerHTML=[
      ['Opening Balance',money(opening),'Balance before selected period'],
      ['Total Debit',money(totalD),'Selected period'],
      ['Total Credit',money(totalC),'Selected period'],
      ['Ending Balance',money(running),'After selected period']
    ].map(x=>'<div class="accounting-metric"><span>'+x[0]+'</span><b>'+x[1]+'</b><small>'+x[2]+'</small></div>').join('');
    $('generalLedgerBody').innerHTML=rows.map(x=>'<tr><td>'+dateText(x.e.entry_date)+'</td><td><button type="button" class="entry-link general-ledger-entry" data-entry-id="'+x.e.id+'"><b>'+esc(x.e.entry_no)+'</b></button></td><td>'+esc(x.e.accounting_journals?.code||'—')+' — '+esc(x.e.accounting_journals?.name||'')+'</td><td>'+esc(x.e.reference||'—')+'</td><td>'+esc(x.e.accounting_partners?.name||x.l.accounting_partners?.name||'—')+'</td><td>'+esc(x.l.description||x.e.memo||'—')+'</td><td class="num">'+(Number(x.l.debit)?money(x.l.debit):'—')+'</td><td class="num">'+(Number(x.l.credit)?money(x.l.credit):'—')+'</td><td class="num"><b>'+money(x.balance)+'</b></td></tr>').join('')||'<tr><td colspan="9" class="accounting-empty">No posted transactions match the selected filters.</td></tr>';
    document.querySelectorAll('.general-ledger-entry').forEach(b=>b.onclick=()=>showDetail(b.dataset.entryId));
    state.loaded=true;
  }

  async function showDetail(id){
    const box=$('generalLedgerDetail');if(!box)return;
    const entryRows=state.rows.filter(x=>x.e.id===id);
    const entry=entryRows[0]?.e;
    if(!entry){box.hidden=true;return}
    let lines=[];
    const {data,error}=await client().from('accounting_lines').select('id,account_id,description,debit,credit,partner_id,accounting_accounts(code,name),accounting_partners(name)').eq('entry_id',id).order('created_at',{ascending:true});
    if(error){box.hidden=false;box.innerHTML='<div class="content-status">'+esc(error.message)+'</div>';return}
    lines=data||[];
    box.hidden=false;
    box.innerHTML='<div class="panel-head"><div><h2>'+esc(entry.entry_no)+' · Journal Detail</h2><p>'+dateText(entry.entry_date)+' · '+esc(entry.reference||entry.memo||'')+'</p></div><button type="button" class="accounting-small-btn" id="generalLedgerCloseDetail">Close</button></div><div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Account</th><th>Description</th><th>Partner</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>'+lines.map(l=>'<tr><td><b>'+esc(l.accounting_accounts?.code||'')+'</b> — '+esc(l.accounting_accounts?.name||'')+'</td><td>'+esc(l.description||'—')+'</td><td>'+esc(l.accounting_partners?.name||'—')+'</td><td class="num">'+(Number(l.debit)?money(l.debit):'—')+'</td><td class="num">'+(Number(l.credit)?money(l.credit):'—')+'</td></tr>').join('')+'</tbody></table></div>';
    $('generalLedgerCloseDetail').onclick=()=>box.hidden=true;
    box.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function exportCsv(){
    if(!state.rows.length)return alert('No ledger data to export.');
    const header=['Date','Journal Entry','Journal','Reference','Partner','Description','Debit','Credit','Running Balance'];
    const lines=[header,...state.rows.map(x=>[x.e.entry_date,x.e.entry_no,x.e.accounting_journals?.code||'',x.e.reference||'',x.e.accounting_partners?.name||x.l.accounting_partners?.name||'',x.l.description||x.e.memo||'',x.l.debit||0,x.l.credit||0,x.balance])];
    const csv=lines.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='general-ledger.csv';a.click();URL.revokeObjectURL(url);
  }

  let initialized=false;
  function init(){
    if(initialized){load().catch(e=>console.warn('General Ledger:',e));return}
    initialized=true;setDefaults();
    $('generalLedgerApply')?.addEventListener('click',()=>load().catch(e=>alert(e.message)));
    $('generalLedgerRefresh')?.addEventListener('click',()=>load().catch(e=>alert(e.message)));
    $('generalLedgerAccount')?.addEventListener('change',()=>{state.selectedAccount=$('generalLedgerAccount').value;load().catch(e=>alert(e.message))});
    $('generalLedgerExport')?.addEventListener('click',exportCsv);
    ['generalLedgerFrom','generalLedgerTo','generalLedgerSearch','generalLedgerRecon'].forEach(id=>$(id)?.addEventListener('change',()=>{if(state.selectedAccount)load().catch(e=>console.warn(e))}));
    $('generalLedgerSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&state.selectedAccount)load().catch(err=>alert(err.message))});
    load().catch(e=>console.warn('General Ledger:',e));
  }
  window.initGeneralLedger=init;
  window.addEventListener('pilark:refresh-view',e=>{if(e.detail?.view==='general-ledger'){load().then(()=>e.detail?.done?.()).catch(err=>e.detail?.done?.(err))}});
  window.addEventListener('pilark:view-changed',e=>{if(e.detail?.view==='general-ledger')init()});
})();