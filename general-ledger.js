(() => {
  const state={accounts:[],rows:[],selectedAccount:'',loaded:false,lastData:null};
  const $=id=>document.getElementById(id);
  const FUNCTION_URL='https://seelqcgjfuuwurslwtgf.supabase.co/functions/v1/odoo-director-dashboard';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v||0));
  const dateText=v=>v?new Date(v+'T00:00:00').toLocaleDateString('id-ID'):'—';
  const m2o=v=>Array.isArray(v)?(v[1]||String(v[0]||'')):String(v||'');
  const api=async(path)=>{
    const session=await window.PILARK_CMS?.client?.auth?.getSession();
    const token=session?.data?.session?.access_token;
    if(!token)throw new Error('Your PILARK session has expired. Please sign in again.');
    const r=await fetch(FUNCTION_URL+path,{headers:{Authorization:'Bearer '+token,apikey:window.PILARK_CMS?.client?.supabaseKey||''}});
    const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={error:text}};
    if(!r.ok||data?.ok===false)throw new Error(data?.error||'Unable to load Odoo data.');
    return data;
  };

  function setDefaults(){
    const now=new Date(),first=new Date(now.getFullYear(),now.getMonth(),1);
    const iso=d=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day};
    if($('generalLedgerFrom')&&!$('generalLedgerFrom').value)$('generalLedgerFrom').value=iso(first);
    if($('generalLedgerTo')&&!$('generalLedgerTo').value)$('generalLedgerTo').value=iso(now);
  }

  async function loadAccounts(){
    const data=await api('?detail=ledger_accounts');
    state.accounts=(data.accounts||[]).filter(a=>!a.deprecated).sort((a,b)=>String(a.code||'').localeCompare(String(b.code||''),undefined,{numeric:true}));
    $('generalLedgerAccount').innerHTML='<option value="">All accounts</option>'+state.accounts.map(a=>'<option value="'+a.id+'">'+esc(a.code)+' — '+esc(a.name)+'</option>').join('');
    if(state.selectedAccount){
      $('generalLedgerAccount').value=state.selectedAccount;
    }
  }

  async function load(){
    if(!window.PILARK_CMS?.client)return;
    setDefaults();
    if(!state.accounts.length)await loadAccounts();
    const accountId=$('generalLedgerAccount')?.value||state.selectedAccount||'';
    state.selectedAccount=String(accountId);
    const from=$('generalLedgerFrom')?.value||'',to=$('generalLedgerTo')?.value||'';
    const params={detail:'ledger',start:from,end:to};
    if(accountId)params.id=String(accountId);
    const q=new URLSearchParams(params);
    const data=await api('?'+q.toString());
    state.lastData=data;
    const account=state.accounts.find(a=>String(a.id)===String(accountId));
    const qtxt=($('generalLedgerSearch')?.value||'').trim().toLowerCase();
    const recon=$('generalLedgerRecon')?.value||'';
    let rows=(data.rows||[]).filter(x=>{
      const text=[x.name,x.ref,m2o(x.partner_id),m2o(x.move_id),m2o(x.journal_id)].join(' ').toLowerCase();
      return (!qtxt||text.includes(qtxt))&&(!recon||(recon==='reconciled'&&x.reconciled)||(recon==='unreconciled'&&!x.reconciled));
    });
    state.rows=rows;
    const opening=Number(data.opening_balance||0);
    const ending=Number(data.ending_balance||opening);
    const debit=rows.reduce((s,x)=>s+Number(x.debit||0),0);
    const credit=rows.reduce((s,x)=>s+Number(x.credit||0),0);
    $('generalLedgerHeading').textContent=accountId?((account?.code||'')+' — '+(account?.name||'General Ledger')):'All Accounts — General Ledger';
    $('generalLedgerSubheading').textContent='Odoo Accounting · All posted transactions'+(accountId?' for the selected account':' across all accounts')+' · '+dateText(from)+' to '+dateText(to);
    $('generalLedgerSummary').innerHTML=[
      ['Opening Balance',money(opening),'Odoo balance before selected period'],
      ['Total Debit',money(debit),'Selected Odoo lines'],
      ['Total Credit',money(credit),'Selected Odoo lines'],
      ['Ending Balance',money(ending),'Odoo running balance']
    ].map(x=>'<div class="accounting-metric"><span>'+x[0]+'</span><b>'+x[1]+'</b><small>'+x[2]+'</small></div>').join('');
    $('generalLedgerBody').innerHTML=rows.map(x=>'<tr><td>'+dateText(x.date)+'</td><td>'+esc(m2o(x.account_id)||'—')+'</td><td><button type="button" class="entry-link general-ledger-entry" data-move-id="'+esc(Array.isArray(x.move_id)?x.move_id[0]:'')+'"><b>'+esc(m2o(x.move_id))+'</b></button></td><td>'+esc(m2o(x.journal_id))+'</td><td>'+esc(x.ref||'—')+'</td><td>'+esc(m2o(x.partner_id)||'—')+'</td><td>'+esc(x.name||'—')+'</td><td class="num">'+(Number(x.debit)?money(x.debit):'—')+'</td><td class="num">'+(Number(x.credit)?money(x.credit):'—')+'</td><td class="num"><b>'+money(x.running_balance)+'</b></td></tr>').join('')||'<tr><td colspan="9" class="accounting-empty">'+(data.rows?.length===0 && data.diagnostics?.account_posted_lines ? `No posted Odoo transactions in this period. This account has ${data.diagnostics.account_posted_lines.toLocaleString("id-ID")} posted line(s) in Odoo. Try a wider date range.` : 'No Odoo posted transactions match the selected filters.')+'</td></tr>';
    document.querySelectorAll('.general-ledger-entry').forEach(b=>b.onclick=()=>showMoveDetail(b.dataset.moveId));
    if(data.diagnostics?.limited)console.warn('Odoo General Ledger reached the 20,000-line API safety limit.',data.diagnostics);
    state.loaded=true;
  }

  async function showMoveDetail(id){
    const box=$('generalLedgerDetail');if(!box||!id)return;
    box.hidden=false;box.innerHTML='<div class="content-status">Loading transaction from Odoo…</div>';
    try{
      const data=await api('?detail=move&id='+encodeURIComponent(id));
      const m=data.move||{},lines=data.lines||[];
      box.innerHTML='<div class="panel-head"><div><h2>'+esc(m.name||'Journal Entry')+' · Odoo Transaction</h2><p>'+dateText(m.date)+' · '+esc(m2o(m.journal_id))+' · '+esc(m2o(m.partner_id)||'No partner')+'</p></div><button type="button" class="accounting-small-btn" id="generalLedgerCloseDetail">Close</button></div><div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Account</th><th>Description</th><th>Partner</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>'+lines.map(l=>'<tr><td><b>'+esc(m2o(l.account_id))+'</b></td><td>'+esc(l.name||'—')+'</td><td>'+esc(m2o(l.partner_id)||'—')+'</td><td class="num">'+(Number(l.debit)?money(l.debit):'—')+'</td><td class="num">'+(Number(l.credit)?money(l.credit):'—')+'</td></tr>').join('')+'</tbody></table></div>';
      $('generalLedgerCloseDetail').onclick=()=>box.hidden=true;
      box.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){box.innerHTML='<div class="content-status">'+esc(e.message)+'</div>'}
  }

  function exportCsv(){
    if(!state.rows.length)return alert('No Odoo ledger data to export.');
    const header=['Date','Account','Journal Entry','Journal','Reference','Partner','Description','Debit','Credit','Running Balance'];
    const lines=[header,...state.rows.map(x=>[x.date,m2o(x.account_id),m2o(x.move_id),m2o(x.journal_id),x.ref||'',m2o(x.partner_id),x.name||'',x.debit||0,x.credit||0,x.running_balance||0])];
    const csv=lines.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='odoo-general-ledger.csv';a.click();URL.revokeObjectURL(url);
  }

  let initialized=false;
  function init(){
    if(initialized){load().catch(e=>console.warn('Odoo General Ledger:',e));return}
    initialized=true;setDefaults();
    $('generalLedgerApply')?.addEventListener('click',()=>load().catch(e=>alert(e.message)));
    $('generalLedgerRefresh')?.addEventListener('click',()=>load().catch(e=>alert(e.message)));
    $('generalLedgerAccount')?.addEventListener('change',()=>{state.selectedAccount=$('generalLedgerAccount').value;load().catch(e=>alert(e.message))});
    $('generalLedgerExport')?.addEventListener('click',exportCsv);
    ['generalLedgerFrom','generalLedgerTo','generalLedgerSearch','generalLedgerRecon'].forEach(id=>$(id)?.addEventListener('change',()=>{if(state.selectedAccount)load().catch(e=>console.warn(e))}));
    $('generalLedgerSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&state.selectedAccount)load().catch(err=>alert(err.message))});
    load().catch(e=>console.warn('Odoo General Ledger:',e));
  }
  window.initGeneralLedger=init;
  window.addEventListener('pilark:refresh-view',e=>{if(e.detail?.view==='general-ledger'){load().then(()=>e.detail?.done?.()).catch(err=>e.detail?.done?.(err))}});
})();