(() => {
  const state = { aiMessages: [], accounts: [], partners: [], journals: [], entries: [], entryLines: [], reconLines: [], selectedLedgerAccount: '', selectedReconcileLines: new Set(), accountPickerTarget: '', accountPickerPage: 0, accountPickerQuery: '', invoices: [], bills: [], payments: [], allocations: [], sends: [], periods: [], quotations: [], inventoryBalances: [], tab: 'overview', reportFrom: '', reportTo: '' };
  const el = id => document.getElementById(id);
  const client = () => window.PILARK_CMS?.client;
  const ready = () => !!window.PILARK_CMS?.ready && !!client();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const money = value => new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', maximumFractionDigits:0 }).format(Number(value||0));
  const dateText = value => value ? new Date(value+'T00:00:00').toLocaleDateString('id-ID') : '-';
  const today = () => new Date().toISOString().slice(0,10);
  const monthStart = () => { const d=new Date(); d.setDate(1); return d.toISOString().slice(0,10); };
  const typeLabel = type => ({asset_receivable:'Piutang',asset_cash:'Bank & Kas',asset_current:'Aktiva Lancar',asset_non_current:'Aktiva Tidak Lancar',asset_prepayments:'Biaya Dibayar Dimuka',asset_fixed:'Aset Tetap',liability_payable:'Hutang',liability_credit_card:'Kartu Kredit',liability_current:'Pasiva Terkini',liability_non_current:'Pasiva Tidak Lancar',equity:'Ekuitas',equity_unaffected:'Laba Tahun Berjalan',income:'Pendapatan',income_other:'Pendapatan Lainnya',expense:'Pengeluaran',expense_other:'Pengeluaran Lainnya',expense_depreciation:'Penyusutan',expense_direct_cost:'Harga Pokok Penjualan',off_balance:'Off-balance'}[type]||type);
  const statusClass = s => 'accounting-status '+esc(s);
  const docOutstanding = d => Math.max(0, Number(d.total_amount||0)-Number(d.amount_paid||0));

  async function load() {
    if(!ready()) return;
    const c=client();
    const [a,p,j,e,i,b,py,al,se,ib,pe,lines,recons,q] = await Promise.all([
      c.from('accounting_accounts').select('*').order('code'),
      c.from('accounting_partners').select('*').order('name'),
      c.from('accounting_journals').select('*').order('code'),
      c.from('accounting_entries').select('id,entry_no,entry_date,reference,memo,status,created_at,posted_at,journal_id,partner_id,accounting_journals(code,name),accounting_partners(name)').order('entry_date',{ascending:false}).order('created_at',{ascending:false}).limit(300),
      c.from('accounting_documents').select('*,accounting_partners(name),accounting_journals(code,name)').eq('document_type','customer_invoice').order('document_date',{ascending:false}).limit(300),
      c.from('accounting_documents').select('*,accounting_partners(name),accounting_journals(code,name)').eq('document_type','vendor_bill').order('document_date',{ascending:false}).limit(300),
      c.from('accounting_payments').select('*,accounting_partners(name),accounting_journals(code,name)').order('payment_date',{ascending:false}).limit(300),
      c.from('accounting_payment_allocations').select('*,accounting_payments(payment_no,payment_date,payment_type,status,amount),accounting_documents(document_no,document_type)').order('created_at',{ascending:false}).limit(500),
      c.from('accounting_document_sends').select('*').order('sent_at',{ascending:false}).limit(500),
      c.from('inventory_balances').select('product_id,location_id,quantity,average_cost,stock_value'),
      c.from('accounting_periods').select('*').order('date_start',{ascending:false}),
      c.from('accounting_lines').select('id,entry_id,account_id,partner_id,description,debit,credit,due_date,reconciled,accounting_accounts(code,name,account_type),accounting_partners(name)').order('created_at'),
      c.from('accounting_reconciliation_lines').select('line_id,amount,accounting_reconciliations!inner(id,status)').eq('accounting_reconciliations.status','reconciled'),
      c.from('sales_quotations').select('*,accounting_partners(name,email,address,phone)').order('quotation_date',{ascending:false}).order('created_at',{ascending:false}).limit(300)
    ]);
    for(const x of [a,p,j,e,i,b,py,al,se,ib,pe,lines,recons,q]) if(x.error) throw x.error;
    state.accounts=a.data||[]; state.partners=p.data||[]; state.journals=j.data||[]; state.entries=e.data||[]; state.entryLines=lines.data||[];state.reconLines=recons.data||[]; state.invoices=i.data||[]; state.bills=b.data||[]; state.payments=py.data||[]; state.allocations=al.data||[]; state.sends=se.data||[]; state.inventoryBalances=ib.data||[]; state.periods=pe.data||[]; state.quotations=q.data||[];
    render();
  }

  async function postedLines(fromDate=null,toDate=null) {
    // The initial accounting load already fetches all journal lines with their
    // account metadata. Reuse that authoritative in-memory dataset here instead
    // of issuing a second query that can be affected by RLS/session timing.
    const postedIds=new Set(
      state.entries
        .filter(x=>x.status==='posted')
        .filter(x=>!fromDate||x.entry_date>=fromDate)
        .filter(x=>!toDate||x.entry_date<=toDate)
        .map(x=>x.id)
    );
    if(!postedIds.size) return [];
    return state.entryLines
      .filter(l=>postedIds.has(l.entry_id))
      .map(l=>({
        entry_id:l.entry_id,
        account_id:l.account_id,
        debit:l.debit,
        credit:l.credit,
        accounting_accounts:l.accounting_accounts
      }));
  }
  function balanceForAccount(lines,a) {
    // Accept either an account object or an account id. Overview dashboards
    // pass the id, while other reports pass the full account object.
    const accountId=typeof a==='string'?a:a?.id;
    const accountType=typeof a==='string'
      ? state.accounts.find(x=>x.id===accountId)?.account_type
      : a?.account_type;
    const rows=lines.filter(x=>x.account_id===accountId);
    const d=rows.reduce((s,x)=>s+Number(x.debit||0),0);
    const c=rows.reduce((s,x)=>s+Number(x.credit||0),0);
    const debitNormal=['asset_receivable','asset_cash','asset_current','asset_non_current','asset_prepayments','asset_fixed','expense','expense_other','expense_depreciation','expense_direct_cost'].includes(accountType);
    return debitNormal?d-c:c-d;
  }

  async function renderOverview() {
    const lines=await postedLines();
    const balances=state.accounts.map(a=>({account:a,balance:balanceForAccount(lines,a.id)}));
    const sumType=types=>balances.filter(x=>types.includes(x.account.account_type)).reduce((s,x)=>s+x.balance,0);
    const cash=sumType(['asset_cash']), ar=sumType(['asset_receivable']), ap=sumType(['liability_payable']), revenue=sumType(['income','income_other']), expenses=sumType(['expense','expense_other','expense_depreciation','expense_direct_cost']);
    const inventory=state.inventoryBalances.reduce((s,x)=>s+Number(x.stock_value||0),0);
    const mStart=monthStart(), now=today();
    const salesMTD=state.invoices.filter(d=>d.status!=='cancelled'&&d.document_date>=mStart&&d.document_date<=now).reduce((s,d)=>s+Number(d.total_amount||0),0);
    const purchasesMTD=state.bills.filter(d=>d.status!=='cancelled'&&d.document_date>=mStart&&d.document_date<=now).reduce((s,d)=>s+Number(d.total_amount||0),0);
    el('accountingCards').innerHTML=[['Sales MTD',salesMTD,'Customer invoices'],['Purchases MTD',purchasesMTD,'Vendor bills'],['Receivables',ar,'Posted AR balance'],['Payables',ap,'Posted AP balance'],['Cash & Bank',cash,'Posted cash balance'],['Inventory',inventory,'Current stock value']].map(([n,v,s])=>'<div class="accounting-metric"><span>'+n+'</span><b>'+money(v)+'</b><small>'+s+'</small></div>').join('');
    el('accountingProfit').textContent=money(revenue-expenses);
    el('accountingEntryCount').textContent=state.entries.filter(x=>x.status==='posted').length;
    const open=[...state.invoices,...state.bills].filter(x=>['posted','partially_paid'].includes(x.status)&&docOutstanding(x)>0.005).sort((a,b)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))).slice(0,15);
    el('accountingOpenDocs').innerHTML=open.length?open.map(d=>'<tr><td>'+ (d.document_type==='customer_invoice'?'Invoice':'Bill')+'</td><td><b>'+esc(d.document_no)+'</b></td><td>'+esc(d.accounting_partners?.name||'—')+'</td><td>'+dateText(d.due_date)+'</td><td class="num">'+money(docOutstanding(d))+'</td></tr>').join(''):'<tr><td colspan="5" class="accounting-empty">No open receivables or payables.</td></tr>';
    const buckets={AR:state.invoices.filter(d=>['posted','partially_paid'].includes(d.status)).reduce((s,d)=>s+docOutstanding(d),0),AP:state.bills.filter(d=>['posted','partially_paid'].includes(d.status)).reduce((s,d)=>s+docOutstanding(d),0)};
    el('dashboardExposure').innerHTML='<div class="exposure-row"><span>Accounts Receivable</span><b>'+money(buckets.AR)+'</b></div><div class="exposure-row"><span>Accounts Payable</span><b>'+money(buckets.AP)+'</b></div><div class="exposure-net"><span>Net exposure</span><b>'+money(buckets.AR-buckets.AP)+'</b></div>';
    const months=[]; const base=new Date(); base.setDate(1); for(let i=5;i>=0;i--){const d=new Date(base);d.setMonth(d.getMonth()-i);const key=d.toISOString().slice(0,7);months.push({key,label:d.toLocaleDateString('en-US',{month:'short'}),sales:state.invoices.filter(x=>x.status!=='cancelled'&&x.document_date?.slice(0,7)===key).reduce((s,x)=>s+Number(x.total_amount||0),0),purchases:state.bills.filter(x=>x.status!=='cancelled'&&x.document_date?.slice(0,7)===key).reduce((s,x)=>s+Number(x.total_amount||0),0)});}
    const max=Math.max(1,...months.flatMap(x=>[x.sales,x.purchases])); el('dashboardMonthly').innerHTML=months.map(m=>'<div class="dashboard-bar-group"><span>'+m.label+'</span><div class="dashboard-bar-track"><i style="width:'+Math.round(m.sales/max*100)+'%" title="Sales '+money(m.sales)+'"></i><em style="width:'+Math.round(m.purchases/max*100)+'%" title="Purchases '+money(m.purchases)+'"></em></div><small>'+money(m.sales)+'</small></div>').join('');
    const activity=[...state.invoices.map(x=>({...x,_activity:'Customer Invoice',_date:x.document_date})),...state.bills.map(x=>({...x,_activity:'Vendor Bill',_date:x.document_date})),...state.payments.filter(x=>x.status==='posted').map(x=>({...x,_activity:x.payment_type==='receive'?'Payment Received':'Payment Made',_date:x.payment_date}))].sort((a,b)=>String(b._date).localeCompare(String(a._date))).slice(0,8);
    el('dashboardActivity').innerHTML=activity.length?activity.map(x=>'<div class="activity-row"><span class="activity-dot"></span><div><b>'+esc(x._activity)+'</b><span>'+esc(x.document_no||x.payment_no||'—')+' · '+esc(x.accounting_partners?.name||'')+'</span></div><strong>'+money(x.total_amount??x.amount??0)+'</strong></div>').join(''):'<div class="accounting-empty">No accounting activity yet.</div>';
  }

  function accountOptions(selected='',filter='all') {
    const ok=a=>a.is_active&&(filter==='all'||(filter==='revenue'&&['income','income_other'].includes(a.account_type))||(filter==='expense'&&['expense','expense_other','expense_depreciation','expense_direct_cost','asset_current'].includes(a.account_type)));
    return '<option value="">Select account…</option>'+state.accounts.filter(ok).map(a=>`<option value="${a.id}" ${a.id===selected?'selected':''}>${esc(a.code)} — ${esc(a.name)}</option>`).join('');
  }
  function partnerOptions(selected='',type='all') {
    const ok=p=>p.is_active&&(type==='all'||type==='both'||p.partner_type===type||p.partner_type==='both');
    return '<option value="">Select partner…</option>'+state.partners.filter(ok).map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join('');
  }
  function journalOptions(selected='',types=null) {
    return state.journals.filter(j=>j.is_active&&(!types||types.includes(j.journal_type))).map(j=>`<option value="${j.id}" ${j.id===selected?'selected':''}>${esc(j.code)} — ${esc(j.name)}</option>`).join('');
  }

  function renderPeriods(){
    const body=el('accountingPeriodsBody'); if(!body)return;
    body.innerHTML=state.periods.map(p=>{
      const status=p.status==='open'?'<span class="accounting-status posted">Open</span>':'<span class="accounting-status">Closed</span>';
      const action=p.status==='open'?'<button class="accounting-small-btn close-period-btn" data-period-id="'+p.id+'">Close</button>':'<button class="accounting-small-btn reopen-period-btn" data-period-id="'+p.id+'">Reopen</button>';
      return '<tr><td><b>'+esc(p.name)+'</b></td><td>'+dateText(p.date_start)+'</td><td>'+dateText(p.date_end)+'</td><td>'+status+'</td><td>'+dateText(p.closed_at?p.closed_at.slice(0,10):null)+'</td><td>'+action+'</td></tr>';
    }).join('')||'<tr><td colspan="6" class="accounting-empty">No accounting periods configured.</td></tr>';
    document.querySelectorAll('.close-period-btn').forEach(b=>b.onclick=()=>closePeriod(b.dataset.periodId));
    document.querySelectorAll('.reopen-period-btn').forEach(b=>b.onclick=()=>reopenPeriod(b.dataset.periodId));
    const current=state.periods.find(p=>today()>=p.date_start&&today()<=p.date_end);
    const banner=el('accountingPeriodStatus');
    if(banner) banner.innerHTML=current?(current.status==='open'?'<span class="period-dot open"></span><b>'+esc(current.name)+'</b> is open for posting.':'<span class="period-dot closed"></span><b>'+esc(current.name)+'</b> is closed. New postings are blocked.'):'<span class="period-dot closed"></span>No open accounting period covers today.';
  }
  async function createPeriod(e){
    e.preventDefault();
    const name=el('periodName').value.trim(), start=el('periodStart').value, end=el('periodEnd').value;
    if(!name||!start||!end)return alert('Complete period name, start date and end date.');
    if(end<start)return alert('End date must be on or after start date.');
    const {error}=await client().from('accounting_periods').insert({name,date_start:start,date_end:end,status:'open',created_by:window.PILARK_CMS?.user?.id||null});
    if(error)return alert(error.message);
    e.target.reset();await load();showTab('periods');
  }
  async function closePeriod(id){
    if(!confirm('Close this accounting period? New postings dated inside it will be blocked.'))return;
    const {error}=await client().rpc('close_accounting_period',{p_period_id:id});
    if(error)return alert(error.message); await load();showTab('periods');
  }
  async function reopenPeriod(id){
    if(!confirm('Reopen this accounting period? Posting will be allowed again for its date range.'))return;
    const {error}=await client().rpc('reopen_accounting_period',{p_period_id:id});
    if(error)return alert(error.message); await load();showTab('periods');
  }

  function renderAccounts() {
    const byParent={};state.accounts.forEach(a=>(byParent[a.parent_id||'root']??=[]).push(a));
    Object.values(byParent).forEach(list=>list.sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true})));
    const walk=(parent,depth=0)=> (byParent[parent]||[]).flatMap(a=>[a,...walk(a.id,depth+1).map(x=>({...x,_depth:x._depth+1}))].map(x=>x));
    const rows=walk('root');
    el('accountingAccountsBody').innerHTML=rows.map(a=>`<tr class="${a.is_group?'account-group-row':'account-leaf-row'}" data-account-id="${a.id}"><td><b>${esc(a.code)}</b></td><td><span class="account-tree-name" style="--depth:${a._depth||0}">${a._depth?'↳ ':''}<b>${esc(a.name)}</b></span></td><td>${esc(typeLabel(a.account_type))}</td><td>${a.reconcile?'Yes':'—'}</td><td>${a.is_active?'Active':'Inactive'}</td></tr>`).join('');
    document.querySelectorAll('.account-leaf-row').forEach(row=>row.onclick=()=>openGeneralLedger(row.dataset.accountId));
    const types=['asset_receivable','asset_cash','asset_current','asset_non_current','asset_prepayments','asset_fixed','liability_payable','liability_credit_card','liability_current','liability_non_current','equity','equity_unaffected','income','income_other','expense','expense_other','expense_depreciation','expense_direct_cost','off_balance'];
    const opts='<option value="">Select type…</option>'+types.map(t=>`<option value="${t}">${esc(typeLabel(t))}</option>`).join('');
    if(el('accountType'))el('accountType').innerHTML=opts;
    if(el('accountParent'))el('accountParent').innerHTML='<option value="">No parent — top level</option>'+state.accounts.filter(a=>a.is_active&&a.is_group).map(a=>`<option value="${a.id}">${esc(a.code)} — ${esc(a.name)}</option>`).join('');
  }
  function accountPickerRows(){
    const q=state.accountPickerQuery.toLowerCase();
    return state.accounts.filter(a=>a.is_active&&!a.is_group&&(!q||String(a.code+' '+a.name+' '+typeLabel(a.account_type)).toLowerCase().includes(q))).sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true}));
  }
  function renderAccountPicker(){
    const rows=accountPickerRows(), size=80, pages=Math.max(1,Math.ceil(rows.length/size));state.accountPickerPage=Math.min(state.accountPickerPage,pages-1);
    const from=state.accountPickerPage*size, pageRows=rows.slice(from,from+size);
    el('accountPickerRange').textContent=rows.length?`${from+1}–${Math.min(from+size,rows.length)} / ${rows.length}`:'0 / 0';
    el('accountPickerPrev').disabled=state.accountPickerPage===0;el('accountPickerNext').disabled=state.accountPickerPage>=pages-1;
    el('accountPickerBody').innerHTML=pageRows.map(a=>`<tr class="account-picker-row" data-account-id="${a.id}"><td>${esc(a.code)}</td><td><b>${esc(a.name)}</b></td><td>${esc(typeLabel(a.account_type))}</td><td><span class="reconcile-toggle ${a.reconcile?'on':''}"><i></i></span></td></tr>`).join('')||'<tr><td colspan="4" class="accounting-empty">Tidak ada akun yang cocok.</td></tr>';
    document.querySelectorAll('.account-picker-row').forEach(row=>row.onclick=()=>selectAccountForPicker(row.dataset.accountId));
  }
  function openAccountPicker(target){
    state.accountPickerTarget=target;state.accountPickerPage=0;state.accountPickerQuery='';if(el('accountPickerSearch'))el('accountPickerSearch').value='';renderAccountPicker();el('accountPickerModal').hidden=false;setTimeout(()=>el('accountPickerSearch')?.focus(),30);
  }
  function selectAccountForPicker(id){
    const a=state.accounts.find(x=>x.id===id);if(!a)return;const target=el(state.accountPickerTarget);if(target)target.value=a.id;
    const btn=document.querySelector(`.account-picker-trigger[data-account-target="${state.accountPickerTarget}"]`);if(btn)btn.querySelector('span').textContent=a.code+' — '+a.name;
    el('accountPickerModal').hidden=true;
  }
  function closeAccountPicker(){el('accountPickerModal').hidden=true;state.accountPickerTarget='';}
  function updateReconcileControls(){
    const ids=[...state.selectedReconcileLines],lines=state.entryLines.filter(l=>ids.includes(l.id)),d=lines.reduce((s,l)=>s+Number(l.debit||0),0),c=lines.reduce((s,l)=>s+Number(l.credit||0),0);
    const suggested=Math.min(d,c),amount=Number(el('ledgerReconcileAmount')?.value||0),ok=lines.length>=2&&amount>0&&amount<=suggested+0.01;
    if(el('ledgerReconcileCount'))el('ledgerReconcileCount').textContent=ids.length+' selected';
    if(el('ledgerReconcileHint'))el('ledgerReconcileHint').textContent=ids.length?' · Debit '+money(d)+' / Credit '+money(c)+' · Suggested '+money(suggested):' Select lines and enter the reconciliation amount.';
    if(el('ledgerReconcileBtn'))el('ledgerReconcileBtn').disabled=!ok;
  }
  function remainingForLine(l){const allocated=state.reconLines.filter(r=>r.line_id===l.id).reduce((s,r)=>s+Number(r.amount||0),0);return Math.max(0,Number(l.debit||l.credit||0)-allocated);}
  function setSuggestedReconcileAmount(){const lines=state.entryLines.filter(l=>state.selectedReconcileLines.has(l.id));const d=lines.filter(l=>Number(l.debit)>0).reduce((s,l)=>s+remainingForLine(l),0),c=lines.filter(l=>Number(l.credit)>0).reduce((s,l)=>s+remainingForLine(l),0);if(el('ledgerReconcileAmount'))el('ledgerReconcileAmount').value=Math.min(d,c).toFixed(2);updateReconcileControls();}

  async function reconcileSelectedLines(){const ids=[...state.selectedReconcileLines],amount=Number(el('ledgerReconcileAmount')?.value||0);if(ids.length<2||!amount)return;const lines=state.entryLines.filter(l=>ids.includes(l.id));const d=lines.filter(l=>Number(l.debit)>0),c=lines.filter(l=>Number(l.credit)>0);let rem=amount;const allocations=[];for(const l of d){const x=Math.min(remainingForLine(l),rem);if(x>0){allocations.push({line_id:l.id,amount:x});rem-=x;}if(rem<=.01)break;}rem=amount;for(const l of c){const x=Math.min(remainingForLine(l),rem);if(x>0){allocations.push({line_id:l.id,amount:x});rem-=x;}if(rem<=.01)break;}if(rem>.01)return alert('Selected lines do not have enough remaining balance.');const {error}=await client().rpc('reconcile_account_lines_partial',{p_allocations:allocations});if(error)return alert(error.message);state.selectedReconcileLines.clear();el('ledgerReconcileAmount').value='';await load();if(state.selectedLedgerAccount)renderGeneralLedger();}
async function autoMatchReconcile(){const lines=state.entryLines.filter(l=>{const e=state.entries.find(x=>x.id===l.entry_id);return e?.status==='posted'&&!l.reconciled&&remainingForLine(l)>0&&l.account_id===state.selectedLedgerAccount;});const pairs=[];for(const d of lines.filter(l=>Number(l.debit)>0)){const match=lines.find(c=>Number(c.credit)>0&&c.id!==d.id&&c.account_id===d.account_id&&c.partner_id===d.partner_id&&Math.abs(remainingForLine(c)-remainingForLine(d))<.01);if(match)pairs.push([{line_id:d.id,amount:remainingForLine(d)},{line_id:match.id,amount:remainingForLine(match)}]);}if(!pairs.length)return alert('No exact unreconciled matches found for this account.');for(const p of pairs){const {error}=await client().rpc('reconcile_account_lines_partial',{p_allocations:p});if(error)return alert(error.message);}await load();if(state.selectedLedgerAccount)renderGeneralLedger();}
  function openGeneralLedger(id){state.selectedLedgerAccount=id;state.selectedReconcileLines.clear();const a=state.accounts.find(x=>x.id===id);if(!a||a.is_group)return;el('accountLedgerTitle').textContent='General Ledger — '+a.code+' · '+a.name;el('accountLedgerSubtitle').textContent='Posted transactions for this account.';el('accountLedgerClose').hidden=false;renderGeneralLedger();}
  function renderGeneralLedger(){
    const id=state.selectedLedgerAccount;if(!id)return;const a=state.accounts.find(x=>x.id===id);if(!a)return;
    const from=el('ledgerFrom')?.value||'',to=el('ledgerTo')?.value||'',q=(el('ledgerSearch')?.value||'').toLowerCase(),recon=el('ledgerReconcileFilter')?.value||'all';state.selectedReconcileLines=new Set([...state.selectedReconcileLines].filter(id=>state.entryLines.some(l=>l.id===id)));
    const normal=['asset_receivable','asset_cash','asset_current','asset_non_current','asset_prepayments','asset_fixed','expense','expense_other','expense_depreciation','expense_direct_cost'].includes(a.account_type);
    let rows=state.entryLines.filter(l=>l.account_id===id).map(l=>{const e=state.entries.find(x=>x.id===l.entry_id);return e?{l,e}:null}).filter(Boolean).filter(x=>x.e.status==='posted'&&(!from||x.e.entry_date>=from)&&(!to||x.e.entry_date<=to)&&(!q||[x.e.entry_no,x.e.reference,x.e.memo,x.e.accounting_partners?.name,x.l.description].some(v=>String(v||'').toLowerCase().includes(q)))).filter(x=>recon==='all'||(recon==='unreconciled'&&!x.l.reconciled)||(recon==='reconciled'&&x.l.reconciled)).sort((x,y)=>String(x.e.entry_date).localeCompare(String(y.e.entry_date))||String(x.e.entry_no).localeCompare(String(y.e.entry_no)));
    let running=0,totalD=0,totalC=0;rows=rows.map(x=>{const d=Number(x.l.debit||0),c=Number(x.l.credit||0);totalD+=d;totalC+=c;running+=normal?d-c:c-d;return {...x,balance:running};});
    const current=balanceForAccount(state.entryLines.filter(l=>{const e=state.entries.find(x=>x.id===l.entry_id);return e?.status==='posted';}),a);
    el('accountLedgerSummary').innerHTML=[['Opening / Current Balance',money(current),a.reconcile?'Reconciled account':'Posted balance'],['Total Debit',money(totalD),'Selected period'],['Total Credit',money(totalC),'Selected period']].map(x=>'<div class="accounting-metric"><span>'+x[0]+'</span><b>'+x[1]+'</b><small>'+x[2]+'</small></div>').join('');
    el('accountLedgerBody').innerHTML=rows.map(x=>'<tr class="'+(x.l.reconciled?'is-reconciled':'')+'"><td class="reconcile-col">'+(x.l.reconciled?'✓':'<input class="ledger-reconcile-check" type="checkbox" data-line-id="'+x.l.id+'" '+(state.selectedReconcileLines.has(x.l.id)?'checked':'')+'>')+'</td><td>'+dateText(x.e.entry_date)+'</td><td><button class="entry-link ledger-entry-link" data-entry-id="'+x.e.id+'"><b>'+esc(x.e.entry_no)+'</b></button></td><td>'+esc(x.e.reference||'—')+'</td><td>'+esc(x.e.accounting_partners?.name||'—')+'</td><td>'+esc(x.l.description||x.e.memo||'—')+'</td><td class="num">'+(Number(x.l.debit||0)?money(x.l.debit):'—')+'</td><td class="num">'+(Number(x.l.credit||0)?money(x.l.credit):'—')+'</td><td class="num"><b>'+money(x.balance)+'</b></td></tr>').join('')||'<tr><td colspan="9" class="accounting-empty">No posted transactions for this account.</td></tr>';
    document.querySelectorAll('.ledger-entry-link').forEach(b=>b.onclick=()=>showEntryDetail(b.dataset.entryId));document.querySelectorAll('.ledger-reconcile-check').forEach(c=>c.onchange=()=>{c.checked?state.selectedReconcileLines.add(c.dataset.lineId):state.selectedReconcileLines.delete(c.dataset.lineId);setSuggestedReconcileAmount();});updateReconcileControls();
  }

  function renderPartners() {
    el('accountingPartnersBody').innerHTML=state.partners.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.partner_type)}</td><td>${esc(p.email||'—')}</td><td>${esc(p.phone||'—')}</td><td>${esc(p.tax_id||'—')}</td></tr>`).join('')||'<tr><td colspan="5" class="accounting-empty">No contacts yet.</td></tr>';
  }
  function renderEntries() {
    const q=(el('entrySearch')?.value||'').trim().toLowerCase(), journal=el('entryJournalFilter')?.value||'', status=el('entryStatusFilter')?.value||'', from=el('entryFrom')?.value||'', to=el('entryTo')?.value||'';
    const rows=state.entries.filter(e=>(!q||[e.entry_no,e.reference,e.memo,e.accounting_journals?.code,e.accounting_journals?.name,e.accounting_partners?.name].some(v=>String(v||'').toLowerCase().includes(q)))&&(!journal||e.journal_id===journal)&&(!status||e.status===status)&&(!from||e.entry_date>=from)&&(!to||e.entry_date<=to));
    const totals=rows.reduce((x,e)=>{state.entryLines.filter(l=>l.entry_id===e.id).forEach(l=>{x.debit+=Number(l.debit||0);x.credit+=Number(l.credit||0)});return x},{debit:0,credit:0});
    if(el('entryFilteredCount'))el('entryFilteredCount').textContent=rows.length;
    if(el('entryDebitTotal'))el('entryDebitTotal').textContent=money(totals.debit);
    if(el('entryCreditTotal'))el('entryCreditTotal').textContent=money(totals.credit);
    el('accountingEntriesBody').innerHTML=rows.map(e=>{const lines=state.entryLines.filter(l=>l.entry_id===e.id),debit=lines.reduce((x,l)=>x+Number(l.debit||0),0),credit=lines.reduce((x,l)=>x+Number(l.credit||0),0);const actions='<button class="accounting-small-btn view-entry-btn" data-entry-id="'+e.id+'">View</button>'+(e.status==='draft'?'<button class="accounting-small-btn post-entry-btn" data-entry-id="'+e.id+'">Post</button>':'')+(e.status==='posted'?'<button class="accounting-small-btn delete-entry-btn" data-entry-id="'+e.id+'" title="Delete posted journal">Delete</button>':'');return `<tr><td><button class="entry-link" data-entry-id="${e.id}" type="button"><b>${esc(e.entry_no)}</b></button></td><td>${dateText(e.entry_date)}</td><td>${esc(e.accounting_journals?.code||'')}</td><td>${esc(e.accounting_partners?.name||'—')}</td><td>${esc(e.reference||'—')}</td><td class="num">${money(debit)}</td><td class="num">${money(credit)}</td><td><span class="${statusClass(e.status)}">${esc(e.status)}</span></td><td class="accounting-actions">${actions}</td></tr>`}).join('')||'<tr><td colspan="9" class="accounting-empty">No journal entries match the current filters.</td></tr>';
    document.querySelectorAll('.post-entry-btn').forEach(b=>b.onclick=()=>postEntry(b.dataset.entryId));
    document.querySelectorAll('.delete-entry-btn').forEach(b=>b.onclick=()=>deletePostedEntry(b.dataset.entryId));
    document.querySelectorAll('.view-entry-btn').forEach(b=>b.onclick=()=>showEntryDetail(b.dataset.entryId));
    document.querySelectorAll('.entry-link').forEach(b=>b.onclick=()=>showEntryDetail(b.dataset.entryId));
  }
  async function showEntryDetail(id){
    const e=state.entries.find(x=>x.id===id);if(!e)return;const lines=state.entryLines.filter(l=>l.entry_id===id),debit=lines.reduce((x,l)=>x+Number(l.debit||0),0),credit=lines.reduce((x,l)=>x+Number(l.credit||0),0);
    const source=[...state.invoices,...state.bills].find(d=>d.posted_entry_id===id),payment=state.payments.find(p=>p.posted_entry_id===id);
    const sourceLabel=source?(source.document_type==='customer_invoice'?'Customer Invoice':'Vendor Bill')+' · '+source.document_no:payment?'Payment · '+payment.payment_no:'Manual / System Journal';
    const box=el('accountingEntryDetail');if(!box)return;box.hidden=false;
    box.innerHTML=`<div class="accounting-entry-dialog" role="dialog" aria-modal="true" aria-labelledby="entryDetailTitle"><div class="entry-detail-head"><div><span class="document-detail-kicker">JOURNAL ENTRY</span><h3 id="entryDetailTitle">${esc(e.entry_no)}</h3><p>${dateText(e.entry_date)} · ${esc(e.accounting_journals?.code||'')} — ${esc(e.accounting_journals?.name||'')} · ${esc(e.accounting_partners?.name||'No partner')}</p></div><div class="entry-detail-actions"><span class="${statusClass(e.status)}">${esc(e.status)}</span><button type="button" class="text-btn" id="closeEntryDetail">Close</button></div></div><div class="entry-detail-meta"><span>Reference <b>${esc(e.reference||'—')}</b></span><span>Source <b>${esc(sourceLabel)}</b></span><span>Created <b>${e.created_at?new Date(e.created_at).toLocaleString('id-ID'):'—'}</b></span><span>Posted <b>${e.posted_at?new Date(e.posted_at).toLocaleString('id-ID'):'—'}</b></span></div><div class="entry-detail-memo">${esc(e.memo||'No journal memo.')}</div><div class="accounting-table-wrap"><table class="accounting-table entry-detail-table"><thead><tr><th>Account</th><th>Description</th><th>Partner</th><th>Due Date</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>${lines.map(l=>`<tr><td><b>${esc(l.accounting_accounts?.code||'')}</b> — ${esc(l.accounting_accounts?.name||'')}</td><td>${esc(l.description||'—')}</td><td>${esc(l.accounting_partners?.name||e.accounting_partners?.name||'—')}</td><td>${dateText(l.due_date)}</td><td class="num">${Number(l.debit||0)?money(l.debit):'—'}</td><td class="num">${Number(l.credit||0)?money(l.credit):'—'}</td></tr>`).join('')||'<tr><td colspan="6" class="accounting-empty">No journal lines found.</td></tr>'}</tbody><tfoot><tr><th colspan="4">TOTAL</th><th class="num">${money(debit)}</th><th class="num">${money(credit)}</th></tr></tfoot></table></div></div>`;
    el('closeEntryDetail')?.addEventListener('click',()=>{box.hidden=true});
    box.querySelector('.accounting-entry-dialog')?.addEventListener('click',e=>e.stopPropagation());
    box.onclick=e=>{if(e.target===box)box.hidden=true};
  }
  function renderDocuments() {
    const row=d=>{
      const outstanding=docOutstanding(d);
      const overdue=outstanding>0.005&&d.due_date&&d.due_date<today()&&['posted','partially_paid'].includes(d.status);
      const actions=[];
      actions.push('<button class="accounting-small-btn view-document-btn" data-document-id="'+d.id+'">View</button>'); if(d.status==='draft') actions.push('<button class="accounting-small-btn edit-document-btn" data-document-id="'+d.id+'">Edit</button>'); if(d.status==='draft'){ actions.push('<button class="accounting-small-btn post-document-btn" data-document-id="'+d.id+'">Post</button>'); actions.push('<button class="accounting-small-btn cancel-document-btn" data-document-id="'+d.id+'">Cancel</button>'); } actions.push('<button class="accounting-small-btn duplicate-document-btn" data-document-id="'+d.id+'">Duplicate</button>'); actions.push('<button class="accounting-small-btn print-document-btn" data-document-id="'+d.id+'">Print / PDF</button>'); actions.push('<button class="accounting-small-btn send-document-btn" data-document-id="'+d.id+'">Send</button>');
      if(d.status==='posted'&&Number(d.amount_paid||0)<=0.005) actions.push('<button class="accounting-small-btn cancel-document-btn" data-document-id="'+d.id+'">Cancel</button>');
      actions.push('<button class="accounting-small-btn history-document-btn" data-document-id="'+d.id+'">History</button>');
      return `<tr><td><b>${esc(d.document_no)}</b></td><td>${dateText(d.document_date)}</td><td>${esc(d.accounting_partners?.name||'—')}</td><td>${dateText(d.due_date)}</td><td class="num">${money(d.total_amount)}</td><td class="num">${money(d.amount_paid)}</td><td class="num">${money(outstanding)}</td><td><span class="${statusClass(d.status)}">${esc(d.status.replace('_',' '))}</span>${overdue?'<span class="accounting-overdue">Overdue</span>':''}</td><td class="accounting-actions">${actions.join('')}</td></tr>`;
    };
    el('accountingInvoicesBody').innerHTML=state.invoices.map(row).join('')||'<tr><td colspan="9" class="accounting-empty">No customer invoices yet.</td></tr>';
    el('accountingBillsBody').innerHTML=state.bills.map(row).join('')||'<tr><td colspan="9" class="accounting-empty">No vendor bills yet.</td></tr>';
    document.querySelectorAll('.view-document-btn').forEach(b=>b.onclick=()=>showDocumentDetail(b.dataset.documentId)); document.querySelectorAll('.edit-document-btn').forEach(b=>b.onclick=()=>editDocument(b.dataset.documentId)); document.querySelectorAll('.duplicate-document-btn').forEach(b=>b.onclick=()=>duplicateDocument(b.dataset.documentId)); document.querySelectorAll('.print-document-btn').forEach(b=>b.onclick=()=>printDocument(b.dataset.documentId)); document.querySelectorAll('.send-document-btn').forEach(b=>b.onclick=()=>sendDocument(b.dataset.documentId)); document.querySelectorAll('.post-document-btn').forEach(b=>b.onclick=()=>postDocument(b.dataset.documentId));
    document.querySelectorAll('.cancel-document-btn').forEach(b=>b.onclick=()=>cancelDocument(b.dataset.documentId));
    document.querySelectorAll('.history-document-btn').forEach(b=>b.onclick=()=>showDocumentHistory(b.dataset.documentId));
  }
  function getDocument(id){return [...state.invoices,...state.bills].find(x=>x.id===id)||null;}
  async function getDocumentLines(id){
    const {data,error}=await client().from('accounting_document_lines').select('*').eq('document_id',id).order('line_no');
    if(error){alert(error.message);return [];} return data||[];
  }
  function documentLabel(d){return d?.document_type?.startsWith('customer_')?'Customer Invoice':'Vendor Bill';}
  function lineRowsHtml(lines){
    return lines.map(l=>'<tr><td>'+esc(l.description||'')+'</td><td class="num">'+Number(l.quantity||0).toLocaleString('en-US')+'</td><td class="num">'+money(l.unit_price)+'</td><td class="num">'+money(l.line_subtotal)+'</td><td class="num">'+money(l.tax_amount)+'</td></tr>').join('');
  }
  async function showDocumentDetail(id){
    const d=getDocument(id); if(!d) return;
    const lines=await getDocumentLines(id);
    const box=el('accountingDocumentDetail'); if(!box)return;
    box.hidden=false;
    box.innerHTML='<div class="document-detail-head"><div><span class="document-detail-kicker">'+esc(documentLabel(d))+'</span><h3>'+esc(d.document_no)+'</h3><p>'+esc(d.accounting_partners?.name||'—')+' · '+dateText(d.document_date)+' · Due '+dateText(d.due_date)+'</p></div><button type="button" class="text-btn" id="closeDocumentDetail">Close</button></div>'+
      '<div class="document-detail-meta"><span>Status <b>'+esc(d.status)+'</b></span><span>Total <b>'+money(d.total_amount)+'</b></span><span>Paid <b>'+money(d.amount_paid)+'</b></span><span>Outstanding <b>'+money(docOutstanding(d))+'</b></span></div>'+
      '<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Subtotal</th><th class="num">Tax</th></tr></thead><tbody>'+lineRowsHtml(lines)+'</tbody></table></div>'+
      '<div class="document-detail-footer"><span>Reference: '+esc(d.reference||'—')+'</span><span>'+esc(d.memo||'')+'</span></div>';
    el('closeDocumentDetail')?.addEventListener('click',()=>{box.hidden=true;});
  }
  async function editDocument(id){
    const d=getDocument(id); if(!d||d.status!=='draft') return alert('Only draft documents can be edited.');
    const lines=await getDocumentLines(id);
    const customer=d.document_type==='customer_invoice';
    showTab(customer?'invoices':'bills');
    const prefix=customer?'document':'bill', container=customer?'documentLines':'billLines';
    el(prefix+'Partner').value=d.partner_id; el(prefix+'Date').value=d.document_date||today(); el(prefix+'DueDate').value=d.due_date||'';
    if(el(prefix+'PaymentTerms')) el(prefix+'PaymentTerms').value=String(d.payment_terms_days||0);
    el(prefix+'Reference').value=d.reference||''; el(prefix+'Memo').value=d.memo||'';
    const box=el(container); box.innerHTML=(lines.length?lines:[{description:'',quantity:1,unit_price:0,tax_rate:0}]).map((l,i)=>lineHtml(customer?'customer_invoice':'vendor_bill',i)).join('');
    [...box.querySelectorAll('.document-line')].forEach((row,i)=>{const l=lines[i]||{};row.querySelector('.line-desc').value=l.description||'';row.querySelector('.line-account').value=l.account_id||'';row.querySelector('.line-qty').value=l.quantity||1;row.querySelector('.line-price').value=l.unit_price||0;row.querySelector('.line-tax').value=l.tax_rate||0;});
    updateDocumentPreview(customer?'customer_invoice':'vendor_bill');
    box.dataset.editingId=id;
    const form=el(customer?'documentForm':'billForm'); form.dataset.editingId=id;
    const btn=form.querySelector('button[type="submit"]'); if(btn) btn.textContent='Save Draft Changes';
    form.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function saveEditedDocument(kind,e,id){
    const customer=kind==='customer_invoice', partner=el(customer?'documentPartner':'billPartner').value;
    const date=el(customer?'documentDate':'billDate').value||today(), due=el(customer?'documentDueDate':'billDueDate').value||null;
    const termsEl=el(customer?'documentPaymentTerms':'billPaymentTerms'), lines=readLines(customer?'documentLines':'billLines');
    if(!partner||!lines.length||lines.some(l=>!l.description||!l.account_id||l.quantity<=0||l.unit_price<0)) return alert('Complete every document line.');
    const {error}=await client().from('accounting_documents').update({partner_id:partner,document_date:date,due_date:due,payment_terms_days:Number(termsEl?.value||0),payment_terms:termsEl?.selectedOptions?.[0]?.textContent||null,reference:el(customer?'documentReference':'billReference').value.trim()||null,memo:el(customer?'documentMemo':'billMemo').value.trim()||null}).eq('id',id).eq('status','draft');
    if(error)return alert(error.message);
    const {error:delErr}=await client().from('accounting_document_lines').delete().eq('document_id',id); if(delErr)return alert(delErr.message);
    const taxAccount=state.accounts.find(a=>a.code===(customer?'2200':'1210'))?.id||null;
    const {error:insErr}=await client().from('accounting_document_lines').insert(lines.map(l=>({...l,document_id:id,tax_account_id:taxAccount})));
    if(insErr)return alert(insErr.message);
    delete e.target.dataset.editingId; const btn=e.target.querySelector('button[type="submit"]'); if(btn) btn.textContent=customer?'Create & Post Invoice →':'Create & Post Bill →';
    await load(); alert('Draft saved. It remains unposted.'); 
  }
  async function duplicateDocument(id){
    const d=getDocument(id); if(!d)return; const lines=await getDocumentLines(id);
    const customer=d.document_type==='customer_invoice', kind=customer?'customer_invoice':'vendor_bill';
    const {data:no,error:noErr}=await client().rpc('next_accounting_document_no',{p_document_type:kind}); if(noErr)return alert(noErr.message);
    const {data:userData}=await client().auth.getUser();
    const journal=state.journals.find(j=>j.journal_type===(customer?'sales':'purchase')); if(!journal)return alert('Journal is missing.');
    const {data:copy,error}=await client().from('accounting_documents').insert({document_no:no,document_type:kind,partner_id:d.partner_id,journal_id:journal.id,document_date:today(),due_date:null,payment_terms_days:d.payment_terms_days||0,payment_terms:d.payment_terms||null,reference:d.reference||null,memo:d.memo||null,status:'draft',created_by:userData?.user?.id||null}).select().single();
    if(error)return alert(error.message);
    const {error:le}=await client().from('accounting_document_lines').insert(lines.map(l=>({document_id:copy.id,line_no:l.line_no,description:l.description,account_id:l.account_id,quantity:l.quantity,unit_price:l.unit_price,discount_percent:l.discount_percent||0,tax_rate:l.tax_rate||0,tax_account_id:l.tax_account_id||null})));
    if(le){await client().from('accounting_documents').delete().eq('id',copy.id);return alert(le.message);}
    await load(); alert('Draft '+no+' created from '+d.document_no+'.');
  }
  async function sendDocument(id){
    const d=getDocument(id); if(!d)return;
    const email=d.accounting_partners?.email||'';
    if(!email) return alert('This partner does not have an email address. Add the partner email first.');
    if(d.status==='draft'||d.status==='cancelled') return alert('Only posted or paid documents can be sent.');
    if(!confirm('Send '+documentLabel(d)+' '+d.document_no+' to '+email+' with the PDF attached?')) return;
    const {data,error}=await client().functions.invoke('send-accounting-document',{body:{document_id:id}});
    if(error){
      let msg=error.message||'Email delivery failed.';
      try{ if(error.context){const t=await error.context.json(); if(t?.error)msg=t.error;} }catch(_){}
      return alert(msg);
    }
    alert('Sent '+documentLabel(d)+' '+d.document_no+' to '+email+'.');
    await load();
  }
  async function printDocument(id){
    const d=getDocument(id); if(!d)return;
    const w=window.open('about:blank','_blank','width=900,height=900');
    if(!w)return alert('Please allow pop-ups for Print / PDF.');
    w.document.write('<!doctype html><html><head><title>Generating '+esc(d.document_no)+'</title></head><body style="font-family:Arial,sans-serif;padding:40px"><p>Generating PDF…</p></body></html>');
    try{
      const {data,error}=await client().functions.invoke('generate-accounting-pdf',{body:{document_id:id}});
      if(error)throw error;
      const blob=data instanceof Blob?data:new Blob([data],{type:'application/pdf'});
      const url=URL.createObjectURL(blob);
      w.location.href=url;
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(err){
      w.close();
      alert('PDF generation failed: '+(err?.message||'Unknown error'));
    }
  }
  function showDocumentHistory(id){
    const d=[...state.invoices,...state.bills].find(x=>x.id===id);
    const rows=state.allocations.filter(a=>a.document_id===id);
    const sends=state.sends.filter(s=>s.document_id===id);
    const box=el('accountingDocumentHistory') || el('accountingDocumentHistoryBills'); if(!box) return;
    box.hidden=false;
    box.innerHTML=`<div class="document-history-head"><div><b>${esc(d?.document_no||'Document')}</b><span>${esc(d?.accounting_partners?.name||'')}</span></div><button type="button" class="text-btn" id="closeDocumentHistory">Close</button></div>`+
      (rows.length?'<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Payment</th><th>Date</th><th>Type</th><th>Status</th><th class="num">Allocated</th></tr></thead><tbody>'+
      rows.map(a=>`<tr><td><b>${esc(a.accounting_payments?.payment_no||'—')}</b></td><td>${dateText(a.accounting_payments?.payment_date)}</td><td>${a.accounting_payments?.payment_type==='receive'?'Receive':'Pay'}</td><td>${esc(a.accounting_payments?.status||'—')}</td><td class="num">${money(a.amount)}</td></tr>`).join('')+
      '</tbody></table></div>':'<div class="accounting-empty">No payment allocations yet.</div>')+
      `<div class="document-history-section"><div class="document-history-section-title">Email history</div>${sends.length?'<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Sent</th><th>Recipient</th><th>Provider</th><th>Status</th><th>Message ID</th></tr></thead><tbody>'+
      sends.map(s=>`<tr><td>${dateText(String(s.sent_at||'').slice(0,10))}</td><td>${esc(s.recipient_email)}</td><td>${esc(s.provider||'—')}</td><td>${esc(s.status||'—')}</td><td><small>${esc(s.provider_message_id||s.error_message||'—')}</small></td></tr>`).join('')+
      '</tbody></table></div>':'<div class="accounting-empty">No email has been sent for this document yet.</div>'}</div>`;
    el('closeDocumentHistory')?.addEventListener('click',()=>{box.hidden=true;});
  }
  function renderPayments() {
    el('accountingPaymentsBody').innerHTML=state.payments.map(p=>`<tr><td><b>${esc(p.payment_no)}</b></td><td>${dateText(p.payment_date)}</td><td>${p.payment_type==='receive'?'Receive':'Pay'}</td><td>${esc(p.accounting_partners?.name||'—')}</td><td class="num">${money(p.amount)}</td><td><span class="${statusClass(p.status)}">${esc(p.status)}</span></td></tr>`).join('')||'<tr><td colspan="6" class="accounting-empty">No payments yet.</td></tr>';
    refreshPaymentDocuments();
  }
  function refreshPaymentDocuments() {
    const type=el('paymentType')?.value||'receive', partner=el('paymentPartner')?.value||'';
    const docs=(type==='receive'?state.invoices:state.bills).filter(d=>['posted','partially_paid'].includes(d.status)&&docOutstanding(d)>0.005&&(!partner||d.partner_id===partner));
    if(el('paymentDocument')) el('paymentDocument').innerHTML='<option value="">No allocation / leave as partner credit</option>'+docs.map(d=>`<option value="${d.id}">${esc(d.document_no)} — ${money(docOutstanding(d))} due</option>`).join('');
  }

  function lineHtml(kind,index) {
    const revenue=kind==='customer_invoice';
    return `<div class="document-line" data-line-index="${index}">
      <input class="line-desc" placeholder="Description" value="${index===0?(revenue?'Product / service':'Purchase / expense'):''}">
      <select class="line-account">${accountOptions('',revenue?'revenue':'expense')}</select>
      <input class="line-qty" type="number" min="0.0001" step="0.0001" value="1" title="Qty">
      <input class="line-price" type="number" min="0" step="0.01" value="0" title="Unit price">
      <input class="line-tax" type="number" min="0" step="0.01" value="0" title="Tax %">
      <button type="button" class="line-remove" aria-label="Remove line">×</button>
    </div>`;
  }
  function bindLineContainer(containerId,kind) {
    const box=el(containerId); if(!box) return;
    box.innerHTML=lineHtml(kind,0);
    box.addEventListener('click',e=>{ if(e.target.classList.contains('line-remove')){const rows=box.querySelectorAll('.document-line');if(rows.length>1)e.target.closest('.document-line').remove(); updateDocumentPreview(kind);}});
    box.addEventListener('input',()=>updateDocumentPreview(kind));
    box.addEventListener('change',()=>updateDocumentPreview(kind));
  }
  function readLines(containerId) {
    return [...document.querySelectorAll('#'+containerId+' .document-line')].map((r,i)=>({
      line_no:i+1,description:r.querySelector('.line-desc').value.trim(),account_id:r.querySelector('.line-account').value,quantity:Number(r.querySelector('.line-qty').value||0),unit_price:Number(r.querySelector('.line-price').value||0),discount_percent:0,tax_rate:Number(r.querySelector('.line-tax').value||0),tax_account_id:null
    }));
  }
  function updateDocumentPreview(kind) {
    const lines=readLines(kind==='customer_invoice'?'documentLines':'billLines');
    let sub=0,tax=0; lines.forEach(l=>{const s=Math.round(l.quantity*l.unit_price*100)/100;sub+=s;tax+=Math.round(s*l.tax_rate)/100;});
    const prefix=kind==='customer_invoice'?'document':'bill';
    el(prefix+'Subtotal').textContent=money(sub);el(prefix+'Tax').textContent=money(tax);el(prefix+'Total').textContent=money(sub+tax);
  }

  function applyPaymentTerms(prefix){
    const dateEl=el(prefix+'Date'), termsEl=el(prefix+'PaymentTerms'), dueEl=el(prefix+'DueDate');
    if(!dateEl||!termsEl||!dueEl) return;
    const d=new Date((dateEl.value||today())+'T00:00:00');
    d.setDate(d.getDate()+Number(termsEl.value||0));
    dueEl.value=d.toISOString().slice(0,10);
  }

  async function cancelDocument(id){
    const d=[...state.invoices,...state.bills].find(x=>x.id===id);
    if(!d) return;
    if(!confirm('Cancel '+d.document_no+'? This will create a reversal journal entry.')) return;
    const {error}=await client().rpc('cancel_accounting_document',{p_document_id:id});
    if(error) return alert(error.message);
    await load();
  }

  async function createDocument(kind,e) {
    e.preventDefault();
    const customer=kind==='customer_invoice', partner=el(customer?'documentPartner':'billPartner').value;
    const date=el(customer?'documentDate':'billDate').value||today(), termsEl=el(customer?'documentPaymentTerms':'billPaymentTerms'), termsDays=Number(termsEl?.value||0), due=el(customer?'documentDueDate':'billDueDate').value||null;
    const reference=el(customer?'documentReference':'billReference').value.trim()||null, memo=el(customer?'documentMemo':'billMemo').value.trim()||null;
    const lines=readLines(customer?'documentLines':'billLines');
    if(!partner) return alert('Select a partner.');
    if(!lines.length||lines.some(l=>!l.description||!l.account_id||l.quantity<=0||l.unit_price<0)) return alert('Complete every document line.');
    const {data:userData}=await client().auth.getUser();
    const {data:docNo,error:noErr}=await client().rpc('next_accounting_document_no',{p_document_type:kind});
    if(noErr) return alert('Could not create document number: '+noErr.message);
    const journal=state.journals.find(j=>j.journal_type===(customer?'sales':'purchase'));
    if(!journal) return alert('The '+(customer?'Sales':'Purchase')+' journal is missing.');
    const {data:doc,error}=await client().from('accounting_documents').insert({document_no:docNo,document_type:kind,partner_id:partner,journal_id:journal.id,document_date:date,due_date:due,payment_terms_days:termsDays,payment_terms:termsEl?.selectedOptions?.[0]?.textContent||null,reference,memo,status:'draft',created_by:userData?.user?.id||null}).select().single();
    if(error) return alert('Could not create document: '+error.message);
    const taxAccount=state.accounts.find(a=>a.code===(customer?'2200':'1210'))?.id||null;
    const payload=lines.map(l=>({...l,document_id:doc.id,tax_account_id:taxAccount}));
    const {error:lineErr}=await client().from('accounting_document_lines').insert(payload);
    if(lineErr){await client().from('accounting_documents').delete().eq('id',doc.id);return alert('Could not create document lines: '+lineErr.message);}
    const {error:postErr}=await client().rpc('post_accounting_document',{p_document_id:doc.id});
    if(postErr) return alert('Document created as draft, but could not be posted: '+postErr.message);
    e.target.reset(); if(customer){el('documentDate').value=today();el('documentType').value='customer_invoice';bindLineContainer('documentLines',kind);}else{el('billDate').value=today();bindLineContainer('billLines',kind);} await load(); showTab(customer?'invoices':'bills');
  }

  async function postDocument(id){if(!confirm('Post this document? A posted document creates an accounting journal entry.'))return;const {error}=await client().rpc('post_accounting_document',{p_document_id:id});if(error)return alert(error.message);await load();}
  async function createPayment(e){
    e.preventDefault();
    const type=el('paymentType').value, partner=el('paymentPartner').value, journal=el('paymentJournal').value, amount=Number(el('paymentAmount').value);
    if(!partner||!journal||amount<=0)return alert('Select partner, journal and a positive amount.');
    const {data:userData}=await client().auth.getUser();
    const {data:no,error:noErr}=await client().rpc('next_accounting_payment_no');if(noErr)return alert(noErr.message);
    const {data:p,error}=await client().from('accounting_payments').insert({payment_no:no,payment_type:type,partner_id:partner,journal_id:journal,payment_date:el('paymentDate').value||today(),amount,reference:el('paymentReference').value.trim()||null,memo:el('paymentMemo').value.trim()||null,status:'draft',created_by:userData?.user?.id||null}).select().single();
    if(error)return alert(error.message);
    const docId=el('paymentDocument').value;
    if(docId){const d=[...state.invoices,...state.bills].find(x=>x.id===docId);if(d&&amount>docOutstanding(d)+0.005){await client().from('accounting_payments').delete().eq('id',p.id);return alert('Payment amount exceeds outstanding of '+money(docOutstanding(d)));}}
    const rpcParams={p_payment_id:p.id,p_document_id:docId||null,p_allocation_amount:docId?amount:null};
    const {error:postErr}=await client().rpc('post_accounting_payment_with_allocation',rpcParams);
    if(postErr)return alert('Payment could not be posted: '+postErr.message);
    e.target.reset();el('paymentDate').value=today();await load();showTab('payments');
  }

  async function renderReports(){
    const from=el('reportFrom')?.value||monthStart();
    const to=el('reportTo')?.value||today();
    if(el('reportFrom')&&!el('reportFrom').value) el('reportFrom').value=from;
    if(el('reportTo')&&!el('reportTo').value) el('reportTo').value=to;
    if(from>to){
      if(el('reportProfitLoss')) el('reportProfitLoss').innerHTML='<div class="accounting-empty">Report start date cannot be after the end date.</div>';
      if(el('reportBalanceSheet')) el('reportBalanceSheet').innerHTML='<div class="accounting-empty">Report start date cannot be after the end date.</div>';
      if(el('reportTrialBalance')) el('reportTrialBalance').innerHTML='<div class="accounting-empty">Report start date cannot be after the end date.</div>';
      return;
    }
    state.reportFrom=from; state.reportTo=to;
    const [periodLines,closingLines]=await Promise.all([postedLines(from,to),postedLines(null,to)]);
    const balances=state.accounts.map(a=>({account:a,balance:balanceForAccount(periodLines,a.id)})).filter(x=>Math.abs(x.balance)>0.005);
    const closingBalances=state.accounts.map(a=>({account:a,balance:balanceForAccount(closingLines,a.id)})).filter(x=>Math.abs(x.balance)>0.005);
    const renderRows=rows=>rows.sort((a,b)=>a.account.code.localeCompare(b.account.code)).map(x=>`<div class="report-row"><span><b>${esc(x.account.code)}</b> ${esc(x.account.name)}</span><strong>${money(x.balance)}</strong></div>`).join('')||'<div class="accounting-empty">No posted data.</div>';
    el('reportProfitLoss').innerHTML=renderRows(balances.filter(x=>['income','income_other','expense','expense_other','expense_depreciation','expense_direct_cost'].includes(x.account.account_type)));
    el('reportBalanceSheet').innerHTML=renderRows(closingBalances.filter(x=>['asset_receivable','asset_cash','asset_current','asset_non_current','asset_prepayments','asset_fixed','liability_payable','liability_credit_card','liability_current','liability_non_current','equity','equity_unaffected'].includes(x.account.account_type)));

    const trialRows=state.accounts.map(a=>{
      const rows=periodLines.filter(x=>x.account_id===a.id);
      return {account:a,debit:rows.reduce((s,x)=>s+Number(x.debit||0),0),credit:rows.reduce((s,x)=>s+Number(x.credit||0),0)};
    }).filter(x=>x.debit>0.005||x.credit>0.005).sort((a,b)=>a.account.code.localeCompare(b.account.code));
    el('reportTrialBalance').innerHTML=trialRows.map(x=>`<div class="report-row"><span><b>${esc(x.account.code)}</b> ${esc(x.account.name)}</span><strong>${money(x.debit)} / ${money(x.credit)}</strong></div>`).join('')||'<div class="accounting-empty">No posted data.</div>';

    const ageRows=(docs)=>{const buckets=[['Current',0],['1–30 days',0],['31–60 days',0],['61–90 days',0],['90+ days',0]];docs.filter(d=>docOutstanding(d)>0.005).forEach(d=>{const days=Math.max(0,Math.floor((new Date()-new Date((d.due_date||d.document_date)+'T00:00:00'))/86400000));const i=days===0?0:days<=30?1:days<=60?2:days<=90?3:4;buckets[i][1]+=docOutstanding(d);});return buckets.map(x=>`<div class="report-row"><span>${x[0]}</span><strong>${money(x[1])}</strong></div>`).join('');};
    el('reportReceivable').innerHTML=ageRows(state.invoices);
    el('reportPayable').innerHTML=ageRows(state.bills);
  }

  function agingBucket(days){
    if(days<=0)return 'Current';
    if(days<=30)return '1–30 days';
    if(days<=60)return '31–60 days';
    if(days<=90)return '61–90 days';
    return '90+ days';
  }
  function docOutstandingAsOf(d,asOf){
    if(!d||d.status==='cancelled'||d.document_date>asOf)return 0;
    const paid=state.allocations.filter(a=>a.document_id===d.id && a.accounting_payments?.status==='posted' && String(a.accounting_payments.payment_date||'')<=asOf).reduce((s,a)=>s+Number(a.amount||0),0);
    return Math.max(0,Number(d.total_amount||0)-paid);
  }
  function renderAgingPartners(){
    const type=el('agingType')?.value||'customer';
    const opts=state.partners.filter(p=>p.partner_type===type||p.partner_type==='both').sort((a,b)=>a.name.localeCompare(b.name));
    const html='<option value="">All partners</option>'+opts.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');
    if(el('agingPartner')){const v=el('agingPartner').value;el('agingPartner').innerHTML=html;if(opts.some(p=>p.id===v))el('agingPartner').value=v;}
    const s='<option value="">Select partner…</option>'+opts.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');
    if(el('statementPartner')){const v=el('statementPartner').value;el('statementPartner').innerHTML=s;if(opts.some(p=>p.id===v))el('statementPartner').value=v;}
  }
  function renderAging(){
    const asOf=el('agingAsOf')?.value||today(), type=el('agingType')?.value||'customer', partner=el('agingPartner')?.value||'';
    const source=type==='customer'?state.invoices:state.bills;
    const docs=source.filter(d=>!partner||d.partner_id===partner).map(d=>{
      const paid=state.allocations.filter(x=>x.document_id===d.id&&x.accounting_payments?.status==='posted'&&String(x.accounting_payments.payment_date||'')<=asOf).reduce((sum,x)=>sum+Number(x.amount||0),0);
      const original=Number(d.total_amount||0), outstanding=Math.max(0,original-paid), due=d.due_date||d.document_date;
      const days=Math.max(0,Math.floor((new Date(asOf+'T00:00:00')-new Date(due+'T00:00:00'))/86400000));
      return {...d,original,paid,outstanding,due,age:days,bucket:agingBucket(days),reconciliation:paid<=0.005?'Unreconciled':outstanding<=0.005?'Reconciled':'Partially reconciled'};
    }).filter(d=>d.outstanding>0.005);
    const buckets={'Current':0,'1–30 days':0,'31–60 days':0,'61–90 days':0,'90+ days':0};
    docs.forEach(d=>buckets[d.bucket]+=d.outstanding);
    const total=docs.reduce((sum,d)=>sum+d.outstanding,0),overdue=total-buckets.Current,paid=docs.reduce((sum,d)=>sum+d.paid,0),original=docs.reduce((sum,d)=>sum+d.original,0);
    el('agingSummary').innerHTML=Object.entries(buckets).map(([k,v])=>'<div class="report-row"><span>'+k+'</span><strong>'+money(v)+'</strong></div>').join('')+'<div class="report-row aging-total"><span><b>Total Outstanding</b></span><strong>'+money(total)+'</strong></div><div class="report-row"><span>Total Overdue</span><strong>'+money(overdue)+'</strong></div>';
    if(el('agingReconciliationNote'))el('agingReconciliationNote').innerHTML='<span>Documents: <b>'+docs.length+'</b></span><span>Original: <b>'+money(original)+'</b></span><span>Paid / Allocated: <b>'+money(paid)+'</b></span><span>Outstanding: <b>'+money(total)+'</b></span>';
    el('agingDocumentsBody').innerHTML=docs.sort((a,b)=>b.age-a.age).map(d=>'<tr><td><b>'+esc(d.document_no)+'</b></td><td>'+esc(d.accounting_partners?.name||'—')+'</td><td>'+dateText(d.due)+'</td><td>'+d.age+' days</td><td>'+d.bucket+'<br><small>'+d.reconciliation+'</small></td><td class="num">'+money(d.original)+'</td><td class="num">'+money(d.paid)+'</td><td class="num">'+money(d.outstanding)+'</td></tr>').join('')||'<tr><td colspan="8"><div class="accounting-empty">No outstanding documents as of this date.</div></td></tr>';
  }
  function renderStatement(){
    const pid=el('statementPartner')?.value, from=el('statementFrom')?.value||monthStart(), to=el('statementTo')?.value||today();
    const box=el('partnerStatement'); if(!box)return;
    if(!pid){box.innerHTML='<div class="accounting-empty">Select a partner to view the statement.</div>';return;}
    if(from>to){box.innerHTML='<div class="accounting-empty">Statement start date cannot be after the end date.</div>';return;}

    const p=state.partners.find(x=>x.id===pid);
    const isCustomer=p?.partner_type==='customer';
    const docs=[...state.invoices,...state.bills]
      .filter(d=>d.partner_id===pid&&d.status!=='cancelled'&&d.document_date<=to);
    const payments=state.payments
      .filter(x=>x.partner_id===pid&&x.status==='posted'&&String(x.payment_date||'')<=to);

    const allocatedByPayment=new Map();
    state.allocations
      .filter(a=>a.accounting_payments?.partner_id===pid&&a.accounting_payments?.status==='posted'&&String(a.accounting_payments?.payment_date||'')<=to)
      .forEach(a=>{
        const key=a.payment_id;
        allocatedByPayment.set(key,(allocatedByPayment.get(key)||0)+Number(a.amount||0));
      });

    const docPaid=d=>state.allocations
      .filter(a=>a.document_id===d.id&&a.accounting_payments?.status==='posted'&&String(a.accounting_payments?.payment_date||'')<=to)
      .reduce((s,a)=>s+Number(a.amount||0),0);

    const signedDocument=d=>d.document_type==='customer_invoice'?Number(d.total_amount||0):-Number(d.total_amount||0);
    const signedPayment=pay=>pay.payment_type==='receive'?-Number(pay.amount||0):Number(pay.amount||0);

    const openingDocs=docs.filter(d=>d.document_date<from);
    const openingPayments=payments.filter(x=>String(x.payment_date||'')<from);
    const openingBalance=openingDocs.reduce((s,d)=>s+signedDocument(d),0)+openingPayments.reduce((s,x)=>s+signedPayment(x),0);

    const rows=[];
    docs.filter(d=>d.document_date>=from&&d.document_date<=to).forEach(d=>{
      const paid=docPaid(d), original=Number(d.total_amount||0), outstanding=Math.max(0,original-paid);
      const status=paid<=0.005?'Unreconciled':outstanding<=0.005?'Reconciled':'Partially reconciled';
      rows.push({
        date:d.document_date,no:d.document_no,type:documentLabel(d),debit:d.document_type==='customer_invoice'?original:0,
        credit:d.document_type==='vendor_bill'?original:0,source:'document',documentId:d.id,
        detail:status+' · Outstanding '+money(outstanding)
      });
    });

    payments.filter(x=>String(x.payment_date||'')>=from&&String(x.payment_date||'')<=to).forEach(pay=>{
      const allocated=allocatedByPayment.get(pay.id)||0, unallocated=Math.max(0,Number(pay.amount||0)-allocated);
      rows.push({
        date:pay.payment_date,no:pay.payment_no,
        type:pay.payment_type==='receive'?'Payment Received':'Payment Made',
        debit:pay.payment_type==='pay'?Number(pay.amount||0):0,
        credit:pay.payment_type==='receive'?Number(pay.amount||0):0,
        source:'payment',paymentId:pay.id,
        detail:allocated>0?(unallocated>0?'Allocated '+money(allocated)+' · Unallocated '+money(unallocated):'Allocated '+money(allocated)):'Unallocated payment'
      });
    });

    rows.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.no).localeCompare(String(b.no)));

    let balance=openingBalance;
    const body=rows.map(r=>{
      balance+=r.debit-r.credit;
      const ref=r.source==='document'
        ?'<button type="button" class="statement-doc-link" data-document-id="'+esc(r.documentId)+'">'+esc(r.no)+'</button>'
        :'<span><b>'+esc(r.no)+'</b></span>';
      return '<tr><td>'+dateText(r.date)+'</td><td>'+ref+'</td><td>'+esc(r.type)+'</td><td class="num">'+(r.debit?money(r.debit):'—')+'</td><td class="num">'+(r.credit?money(r.credit):'—')+'</td><td>'+esc(r.detail)+'</td><td class="num"><b>'+money(balance)+'</b></td></tr>';
    }).join('');

    const totalOutstanding=docs.reduce((s,d)=>s+Number(d.total_amount||0),0)
      -state.allocations.filter(a=>a.accounting_payments?.partner_id===pid&&a.accounting_payments?.status==='posted'&&String(a.accounting_payments?.payment_date||'')<=to)
        .reduce((s,a)=>s+Number(a.amount||0),0);
    const closingBalance=balance;
    const direction=isCustomer?'Receivable':'Payable';

    box.innerHTML=
      '<div class="statement-head"><div><b>'+esc(p?.name||'')+'</b><span>'+esc(p?.email||'')+'</span></div><div><b>Statement period</b><span>'+dateText(from)+' – '+dateText(to)+'</span></div></div>'+
      '<div class="statement-summary"><div><span>Opening Balance</span><b>'+money(openingBalance)+'</b></div><div><span>Closing Balance</span><b>'+money(closingBalance)+'</b></div><div><span>'+direction+' Outstanding</span><b>'+money(Math.max(0,totalOutstanding))+'</b></div></div>'+
      '<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Date</th><th>Document</th><th>Type</th><th class="num">Debit</th><th class="num">Credit</th><th>Reconciliation</th><th class="num">Balance</th></tr></thead><tbody>'+
      (body||'<tr><td colspan="7"><div class="accounting-empty">No transactions in this period.</div></td></tr>')+
      '</tbody></table></div>'+
      '<div class="statement-total"><span>Closing '+direction+' through '+dateText(to)+'</span><b>'+money(closingBalance)+'</b></div>';

    box.querySelectorAll('.statement-doc-link').forEach(b=>b.addEventListener('click',()=>showDocumentDetail(b.dataset.documentId)));
  }
  function printStatement(){
    const html=el('partnerStatement')?.innerHTML; const p=state.partners.find(x=>x.id===el('statementPartner')?.value); if(!html||!p)return alert('View a statement first.');
    const w=window.open('','_blank');if(!w)return alert('Popup blocked. Allow popups for the CMS.');
    w.document.write('<!doctype html><html><head><title>Statement - '+esc(p.name)+'</title><style>body{font:13px Arial,sans-serif;padding:32px;color:#17212b}h1{margin:0 0 6px;font-size:22px}.muted{color:#667}.accounting-table{width:100%;border-collapse:collapse;margin-top:18px}.accounting-table th,.accounting-table td{border-bottom:1px solid #ddd;padding:8px;text-align:left}.accounting-table .num{text-align:right}.statement-head{display:flex;justify-content:space-between;gap:30px}.statement-head span{display:block;color:#667;margin-top:4px}.statement-total{display:flex;justify-content:flex-end;gap:30px;margin-top:18px;font-size:16px}</style></head><body><h1>PILARK COMPOSITES</h1><div class="muted">Partner Statement</div>'+html+'</body></html>');w.document.close();w.focus();setTimeout(()=>w.print(),250);
  }

  function erpPeriodRange(mode){
    const now=new Date();
    const y=now.getFullYear();
    if(mode==='month'){
      const s=new Date(y,now.getMonth(),1), e=new Date(y,now.getMonth()+1,0);
      return {from:s.toISOString().slice(0,10),to:e.toISOString().slice(0,10),label:s.toLocaleDateString('en-US',{month:'long',year:'numeric'})};
    }
    if(mode==='quarter'){
      const q=Math.floor(now.getMonth()/3), s=new Date(y,q*3,1), e=new Date(y,q*3+3,0);
      return {from:s.toISOString().slice(0,10),to:e.toISOString().slice(0,10),label:'Q'+(q+1)+' '+y};
    }
    return {from:y+'-01-01',to:y+'-12-31',label:'Full year '+y};
  }

  async function renderErpOverview(){
    if(!el('view-erp-overview'))return;
    const mode=el('erpDashboardPeriod')?.value||'year';
    const period=erpPeriodRange(mode);
    if(el('erpDashboardPeriodText'))el('erpDashboardPeriodText').textContent=period.label+' · '+dateText(period.from)+' – '+dateText(period.to);

    const posted=state.entries.filter(x=>x.status==='posted');
    const periodEntryIds=new Set(posted.filter(x=>x.entry_date>=period.from&&x.entry_date<=period.to).map(x=>x.id));
    // Reuse the accounting lines loaded by load(). This keeps ERP Overview
    // consistent with Journal Entries and avoids a second RLS/session query.
    const periodLines=state.entryLines
      .filter(l=>periodEntryIds.has(l.entry_id))
      .map(l=>({
        entry_id:l.entry_id,
        account_id:l.account_id,
        debit:l.debit,
        credit:l.credit,
        accounting_accounts:l.accounting_accounts
      }));
    const periodBalances=state.accounts.map(a=>({account:a,balance:balanceForAccount(periodLines,a.id)}));
    const sumTypes=types=>periodBalances.filter(x=>types.includes(x.account.account_type)).reduce((s,x)=>s+x.balance,0);
    const revenue=sumTypes(['income','income_other']);
    const expenses=sumTypes(['expense','expense_other','expense_depreciation','expense_direct_cost']);
    const ar=state.invoices.filter(d=>['posted','partially_paid'].includes(d.status)).reduce((s,d)=>s+docOutstanding(d),0);
    const ap=state.bills.filter(d=>['posted','partially_paid'].includes(d.status)).reduce((s,d)=>s+docOutstanding(d),0);
    const allLines=await postedLines();
    const allBalances=state.accounts.map(a=>({account:a,balance:balanceForAccount(allLines,a.id)}));
    const cash=allBalances.filter(x=>x.account.account_type==='asset_cash').reduce((s,x)=>s+x.balance,0);
    const inventory=state.inventoryBalances.reduce((s,x)=>s+Number(x.stock_value||0),0);

    el('erpRevenue').textContent=money(revenue);
    el('erpExpenses').textContent=money(expenses);
    el('erpProfit').textContent=money(revenue-expenses);
    el('erpAR').textContent=money(ar);
    el('erpAP').textContent=money(ap);
    el('erpCash').textContent=money(cash);

    const sales=state.invoices.filter(d=>d.status!=='cancelled'&&d.document_date>=period.from&&d.document_date<=period.to).reduce((s,d)=>s+Number(d.total_amount||0),0);
    const purchases=state.bills.filter(d=>d.status!=='cancelled'&&d.document_date>=period.from&&d.document_date<=period.to).reduce((s,d)=>s+Number(d.total_amount||0),0);
    const salesCount=state.invoices.filter(d=>d.status!=='cancelled'&&d.document_date>=period.from&&d.document_date<=period.to).length;
    const purchaseCount=state.bills.filter(d=>d.status!=='cancelled'&&d.document_date>=period.from&&d.document_date<=period.to).length;
    el('erpSalesPurchase').innerHTML=[
      ['Customer invoices',money(sales)+' · '+salesCount+' documents'],
      ['Vendor bills',money(purchases)+' · '+purchaseCount+' documents'],
      ['Net trading flow',money(sales-purchases)]
    ].map(r=>'<div class="dashboard-stack-row"><span>'+esc(r[0])+'</span><b>'+esc(r[1])+'</b></div>').join('');

    const activeProducts=new Set(state.inventoryBalances.map(x=>x.product_id)).size;
    const units=state.inventoryBalances.reduce((s,x)=>s+Number(x.quantity||0),0);
    el('erpInventory').innerHTML=[
      ['Products with balance',String(activeProducts)],
      ['Units on hand',Number(units).toLocaleString('id-ID')],
      ['Stock value',money(inventory)]
    ].map(r=>'<div class="dashboard-stack-row"><span>'+esc(r[0])+'</span><b>'+esc(r[1])+'</b></div>').join('');

    const ageBuckets=(docs)=>{
      const buckets={'Current':0,'1–30 days':0,'31–60 days':0,'61–90 days':0,'90+ days':0};
      docs.filter(d=>docOutstanding(d)>0.005).forEach(d=>{
        const due=d.due_date||d.document_date;
        const days=Math.max(0,Math.floor((new Date()-new Date(due+'T00:00:00'))/86400000));
        const key=agingBucket(days); buckets[key]+=docOutstanding(d);
      });
      return buckets;
    };
    const arAge=ageBuckets(state.invoices), apAge=ageBuckets(state.bills);
    const arOverdue=arAge['1–30 days']+arAge['31–60 days']+arAge['61–90 days']+arAge['90+ days'];
    const apOverdue=apAge['1–30 days']+apAge['31–60 days']+apAge['61–90 days']+apAge['90+ days'];
    el('erpAging').innerHTML=[
      ['AR outstanding',money(ar),arOverdue],
      ['AR overdue',money(arOverdue),null],
      ['AP outstanding',money(ap),apOverdue],
      ['AP overdue',money(apOverdue),null]
    ].map(r=>'<div class="dashboard-stack-row"><span>'+esc(r[0])+'</span><b>'+esc(r[1])+'</b></div>').join('');

    const year=new Date().getFullYear();
    const months=[];
    for(let m=0;m<12;m++){
      const key=year+'-'+String(m+1).padStart(2,'0');
      const value=state.invoices.filter(d=>d.status!=='cancelled'&&d.document_date?.slice(0,7)===key).reduce((s,d)=>s+Number(d.total_amount||0),0);
      months.push({label:new Date(year,m,1).toLocaleDateString('en-US',{month:'short'}),value});
    }
    const max=Math.max(1,...months.map(x=>x.value));
    el('erpRevenueTrend').innerHTML=months.map(m=>'<div class="dashboard-bar-group"><span>'+m.label+'</span><div class="dashboard-bar-track"><i style="width:'+Math.round(m.value/max*100)+'%" title="'+money(m.value)+'"></i></div><small>'+money(m.value)+'</small></div>').join('');

    const activity=[
      ...state.invoices.filter(x=>x.status==='posted'||x.status==='partially_paid'||x.status==='paid').map(x=>({...x,_type:'Customer Invoice',_date:x.document_date,_amount:x.total_amount})),
      ...state.bills.filter(x=>x.status==='posted'||x.status==='partially_paid'||x.status==='paid').map(x=>({...x,_type:'Vendor Bill',_date:x.document_date,_amount:x.total_amount})),
      ...state.payments.filter(x=>x.status==='posted').map(x=>({...x,_type:x.payment_type==='receive'?'Payment Received':'Payment Made',_date:x.payment_date,_amount:x.amount}))
    ].sort((a,b)=>String(b._date).localeCompare(String(a._date))).slice(0,10);
    el('erpRecentActivity').innerHTML=activity.length
      ? '<table class="accounting-table"><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Partner</th><th class="num">Amount</th></tr></thead><tbody>'+activity.map(x=>'<tr><td>'+dateText(x._date)+'</td><td>'+esc(x._type)+'</td><td><b>'+esc(x.document_no||x.payment_no||'—')+'</b></td><td>'+esc(x.accounting_partners?.name||'—')+'</td><td class="num">'+money(x._amount)+'</td></tr>').join('')+'</tbody></table>'
      : '<div class="accounting-empty">No posted accounting activity yet.</div>';
  }

  function renderAccountingMarkdown(value){
    const src=String(value??'').replace(/\r\n?/g,'\n').trim();
    if(!src)return '';
    const lines=src.split('\n');
    const out=[];
    let listType=null;
    let listItems=[];
    let inCode=false;
    let codeLines=[];
    function flushList(){
      if(!listItems.length)return;
      out.push('<'+listType+'>'+listItems.join('')+'</'+listType+'>');
      listType=null; listItems=[];
    }
    function inline(text){
      let s=esc(text);
      s=s.replace(/`([^`]+)`/g,'<code>$1</code>');
      s=s.replace(/\*\*([^*]+?)\*\*/g,'<strong>$1</strong>');
      s=s.replace(/__([^_]+?)__/g,'<strong>$1</strong>');
      s=s.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g,'<em>$1</em>');
      s=s.replace(/(?<!_)_([^_\n]+?)_(?!_)/g,'<em>$1</em>');
      return s;
    }
    for(const rawLine of lines){
      const line=rawLine.trim();
      if(line.startsWith('```')){
        flushList();
        if(!inCode){inCode=true;codeLines=[];}else{out.push('<pre><code>'+esc(codeLines.join('\n'))+'</code></pre>');inCode=false;}
        continue;
      }
      if(inCode){codeLines.push(rawLine);continue;}
      if(!line){flushList();continue;}
      let m=line.match(/^(#{1,3})\s+(.+)$/);
      if(m){flushList();out.push('<h'+m[1].length+'>'+inline(m[2])+'</h'+m[1].length+'>');continue;}
      m=line.match(/^[-*]\s+(.+)$/);
      if(m){if(listType!=='ul'){flushList();listType='ul';}listItems.push('<li>'+inline(m[1])+'</li>');continue;}
      m=line.match(/^\d+[.)]\s+(.+)$/);
      if(m){if(listType!=='ol'){flushList();listType='ol';}listItems.push('<li>'+inline(m[1])+'</li>');continue;}
      flushList();
      out.push('<p>'+inline(line)+'</p>');
    }
    if(inCode)out.push('<pre><code>'+esc(codeLines.join('\n'))+'</code></pre>');
    flushList();
    return out.join('');
  }

  function renderAccountingAi(){
    const box=el('accountingAiMessages'); if(!box)return;
    box.innerHTML=state.aiMessages.map(m=>'<div class="accounting-ai-message '+(m.role==='user'?'user':'assistant')+'"><div class="accounting-ai-avatar">'+(m.role==='user'?'P':'✦')+'</div><div class="accounting-ai-bubble">'+(m.role==='user'?esc(m.text).replace(/\n/g,'<br>'):renderAccountingMarkdown(m.text))+'</div></div>').join('');
    box.scrollTop=box.scrollHeight;
  }
  function openAccountingAi(){
    const panel=el('accountingAiPanel'); if(!panel)return;
    panel.hidden=false;
    if(!state.aiMessages.length){
      state.aiMessages.push({role:'assistant',text:'Halo. Saya PILARK Accounting AI. Saya bisa membantu menjelaskan jurnal, Chart of Accounts, AR/AP, reconciliation, laporan, dan cara kerja accounting di sistem ini.'});
      renderAccountingAi();
    }
    setTimeout(()=>el('accountingAiInput')?.focus(),50);
  }
  function closeAccountingAi(){if(el('accountingAiPanel'))el('accountingAiPanel').hidden=true;}
  function accountingAiContext(){
    const docSummary=(docs,type)=>docs.slice(0,80).map(d=>({
      no:d.document_no,type, date:d.document_date,due:d.due_date||d.document_date,
      partner:d.accounting_partners?.name||'—',status:d.status,total:Number(d.total_amount||0),paid:Number(d.amount_paid||0),
      outstanding:Math.max(0,Number(d.total_amount||0)-Number(d.amount_paid||0))
    }));
    const posted=state.entries.filter(e=>e.status==='posted');
    const lineByEntry=new Map();
    state.entryLines.forEach(l=>{const a=lineByEntry.get(l.entry_id)||{debit:0,credit:0};a.debit+=Number(l.debit||0);a.credit+=Number(l.credit||0);lineByEntry.set(l.entry_id,a);});
    return {
      currentTab:state.tab,
      accounts:state.accounts.filter(a=>a.is_active&&!a.is_group).map(a=>({code:a.code,name:a.name,type:typeLabel(a.account_type),reconcile:!!a.reconcile})),
      journals:state.journals.map(j=>({code:j.code,name:j.name,type:j.journal_type})),
      customers:state.partners.filter(p=>p.partner_type==='customer'||p.partner_type==='both').map(p=>({name:p.name})).slice(0,100),
      vendors:state.partners.filter(p=>p.partner_type==='vendor'||p.partner_type==='both').map(p=>({name:p.name})).slice(0,100),
      customerInvoices:docSummary(state.invoices,'customer_invoice'),
      vendorBills:docSummary(state.bills,'vendor_bill'),
      payments:state.payments.slice(0,100).map(p=>({no:p.payment_no,date:p.payment_date,type:p.payment_type,partner:p.accounting_partners?.name||'—',status:p.status,amount:Number(p.amount||0)})),
      postedJournalEntries:posted.slice(0,80).map(e=>({no:e.entry_no,date:e.entry_date,journal:e.accounting_journals?.code||'—',partner:e.accounting_partners?.name||'—',reference:e.reference||'—',memo:e.memo||'—',totals:lineByEntry.get(e.id)||{debit:0,credit:0}})),
      reconciliationLines:state.reconLines.length,
      accountingPeriods:state.periods.map(p=>({name:p.name,start:p.date_start,end:p.date_end,status:p.status})),
      note:'Use this data to analyze the live PILARK accounting system. When preparing a journal, use only account codes and journal codes that exist in this context.'
    };
  }

  function renderAccountingAiAction(action){
    if(!action||action.type!=='journal_draft')return '';
    const amount=Number(action.amount||0);
    if(!action.debit_account_code||!action.credit_account_code||!action.journal_code||amount<=0)return '';
    const accountMap=new Map(state.accounts.map(a=>[String(a.code).toLowerCase(),a]));
    const journalMap=new Map(state.journals.map(j=>[String(j.code).toLowerCase(),j]));
    const debit=accountMap.get(String(action.debit_account_code).toLowerCase());
    const credit=accountMap.get(String(action.credit_account_code).toLowerCase());
    const journal=journalMap.get(String(action.journal_code).toLowerCase());
    if(!debit||!credit||!journal)return '';
    const partner=action.partner_name?String(action.partner_name):'';
    return '<div class="accounting-ai-action">'+
      '<div class="accounting-ai-action-head"><div><b>Draft Journal</b><span>Prepared by PILARK AI — review before posting</span></div></div>'+
      '<div class="accounting-ai-action-grid">'+
        '<div><small>Date</small><b>'+esc(action.date||today())+'</b></div>'+
        '<div><small>Journal</small><b>'+esc(journal.code+' — '+journal.name)+'</b></div>'+
        '<div><small>Debit</small><b>'+esc(debit.code+' — '+debit.name)+'</b></div>'+
        '<div><small>Credit</small><b>'+esc(credit.code+' — '+credit.name)+'</b></div>'+
        '<div><small>Amount</small><b>'+esc(money(amount))+'</b></div>'+
        '<div><small>Partner</small><b>'+esc(partner||'No partner')+'</b></div>'+
      '</div>'+
      (action.memo?'<div class="accounting-ai-action-memo">'+esc(action.memo)+'</div>':'')+
      '<button type="button" class="accounting-ai-review-btn" data-ai-review-journal="1">Review Journal Entry →</button>'+
    '</div>';
  }

  function reviewAccountingAiJournal(action){
    if(!action||action.type!=='journal_draft')return;
    const debit=state.accounts.find(a=>String(a.code).toLowerCase()===String(action.debit_account_code||'').toLowerCase()&&!a.is_group);
    const credit=state.accounts.find(a=>String(a.code).toLowerCase()===String(action.credit_account_code||'').toLowerCase()&&!a.is_group);
    const journal=state.journals.find(j=>String(j.code).toLowerCase()===String(action.journal_code||'').toLowerCase());
    if(!debit||!credit||!journal)return alert('AI draft references an account or journal that is not currently loaded. Refresh Accounting and try again.');
    showTab('entries');
    if(el('entryDate'))el('entryDate').value=action.date||today();
    if(el('entryJournal'))el('entryJournal').value=journal.id;
    if(el('entryPartner')){
      const wanted=String(action.partner_name||'').trim().toLowerCase();
      const partner=state.partners.find(p=>wanted&&String(p.name||'').trim().toLowerCase()===wanted);
      el('entryPartner').value=partner?.id||'';
    }
    if(el('entryDebitAccount'))el('entryDebitAccount').value=debit.id;
    if(el('entryCreditAccount'))el('entryCreditAccount').value=credit.id;
    const debitBtn=document.querySelector('.account-picker-trigger[data-account-target="entryDebitAccount"]');
    const creditBtn=document.querySelector('.account-picker-trigger[data-account-target="entryCreditAccount"]');
    if(debitBtn)debitBtn.querySelector('span').textContent=debit.code+' — '+debit.name;
    if(creditBtn)creditBtn.querySelector('span').textContent=credit.code+' — '+credit.name;
    if(el('entryAmount'))el('entryAmount').value=Number(action.amount||0);
    if(el('entryReference'))el('entryReference').value=action.reference||'';
    if(el('entryMemo'))el('entryMemo').value=action.memo||'';
    el('entryAmount')?.focus();
    el('accountingAiPanel')?.setAttribute('hidden','');
  }

  function renderAccountingAi(){
    const box=el('accountingAiMessages'); if(!box)return;
    box.innerHTML=state.aiMessages.map(m=>'<div class="accounting-ai-message '+(m.role==='user'?'user':'assistant')+'"><div class="accounting-ai-avatar">'+(m.role==='user'?'P':'✦')+'</div><div class="accounting-ai-bubble">'+(m.role==='user'?esc(m.text).replace(/\n/g,'<br>'):renderAccountingMarkdown(m.text)+(m.action?renderAccountingAiAction(m.action):''))+'</div></div>').join('');
    box.querySelectorAll('[data-ai-review-journal]').forEach(btn=>btn.addEventListener('click',()=>{
      const index=[...box.querySelectorAll('[data-ai-review-journal]')].indexOf(btn);
      const actions=state.aiMessages.filter(m=>m.role==='assistant'&&m.action?.type==='journal_draft');
      reviewAccountingAiJournal(actions[index]);
    }));
    box.scrollTop=box.scrollHeight;
  }

  function openAccountingAi(){
    const panel=el('accountingAiPanel'); if(!panel)return;
    panel.hidden=false;
    if(!state.aiMessages.length){
      state.aiMessages.push({role:'assistant',text:'Halo. Saya PILARK Accounting Assistant. Saya bisa menjelaskan accounting, menganalisis data ERP, dan menyiapkan draft jurnal untuk Anda review sebelum diposting.'});
      renderAccountingAi();
    }
    setTimeout(()=>el('accountingAiInput')?.focus(),50);
  }
  function closeAccountingAi(){if(el('accountingAiPanel'))el('accountingAiPanel').hidden=true;}

  async function sendAccountingAi(question){
    const q=String(question||'').trim(); if(!q)return;
    state.aiMessages.push({role:'user',text:q}); renderAccountingAi();
    const input=el('accountingAiInput'),send=el('accountingAiSend');
    if(input)input.value=''; if(send){send.disabled=true;send.textContent='…';}
    try{
      const {data,error}=await client().functions.invoke('accounting-ai',{body:{question:q,tab:state.tab,context:accountingAiContext()}});
      if(error)throw error;
      if(data?.error)throw new Error(data.error);
      state.aiMessages.push({role:'assistant',text:data?.answer||'Maaf, AI tidak memberikan jawaban.',action:data?.action||null});
    }catch(err){
      state.aiMessages.push({role:'assistant',text:'Maaf, Accounting AI belum dapat menjawab: '+(err?.message||'Unknown error')});
    }finally{
      if(send){send.disabled=false;send.textContent='➤';}
      renderAccountingAi();
      setTimeout(()=>el('accountingAiInput')?.focus(),30);
    }
  }

  function ensureReceiptScannerUi(){
    const view=el('view-accounting'); if(!view || el('receiptScannerPanel')) return;
    const tabs=view.querySelector('[data-accounting-tab="overview"]')?.parentElement;
    if(tabs && !tabs.querySelector('[data-accounting-tab="ai-scanner"]')){
      const b=document.createElement('button');
      b.type='button'; b.dataset.accountingTab='ai-scanner'; b.textContent='✦ AI Receipt Scanner';
      tabs.appendChild(b);
    }
    const panel=document.createElement('div');
    panel.id='receiptScannerPanel'; panel.className='accounting-tab-panel'; panel.dataset.accountingPanel='ai-scanner'; panel.hidden=true;
    panel.innerHTML=`
      <div class="section-intro accounting-intro">
        <div><h2>AI Receipt Scanner</h2><p>Upload a receipt, bill or invoice. AI will read it, map it to the existing Chart of Accounts, and prepare a journal draft for review.</p></div>
      </div>
      <div class="receipt-scanner-grid">
        <div class="panel receipt-upload-panel">
          <div id="receiptDropzone" class="receipt-dropzone">
            <div class="receipt-upload-icon">⌁</div>
            <h3>Upload receipt / bill</h3>
            <p>JPG, PNG or WEBP. You can also drag and drop an image here.</p>
            <input id="receiptFileInput" type="file" accept="image/jpeg,image/png,image/webp" hidden>
            <button id="receiptChooseBtn" class="primary-btn" type="button">Choose image</button>
          </div>
          <div id="receiptScanStatus" class="receipt-scan-status">Ready to scan.</div>
          <div id="receiptPreviewWrap" class="receipt-preview-wrap" hidden><img id="receiptPreview" alt="Receipt preview"></div>
        </div>
        <div class="panel receipt-result-panel">
          <div class="panel-head"><div><h2>AI Review</h2><p>Nothing is posted automatically. Review the extracted values and journal mapping first.</p></div><span id="receiptConfidence" class="receipt-confidence">—</span></div>
          <div id="receiptResult" class="receipt-result-empty">Upload a document to begin.</div>
        </div>
      </div>
      <div id="receiptActionBar" class="receipt-action-bar" hidden>
        <button id="receiptRejectBtn" class="accounting-small-btn" type="button">Reject</button>
        <button id="receiptPostBtn" class="primary-btn" type="button">✓ Approve &amp; Post to Journal</button>
      </div>`;
    view.appendChild(panel);

    const input=el('receiptFileInput'), choose=el('receiptChooseBtn'), drop=el('receiptDropzone');
    choose.onclick=()=>input.click();
    input.onchange=()=>{const f=input.files?.[0]; if(f)scanReceipt(f);};
    ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('dragging');}));
    ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('dragging');}));
    drop.addEventListener('drop',e=>{const f=e.dataTransfer.files?.[0];if(f)scanReceipt(f);});
    el('receiptPostBtn').onclick=postScannedReceipt;
    el('receiptRejectBtn').onclick=rejectScannedReceipt;
  }

  function receiptAccountOptions(selected='', allowBlank=false){
    const accounts=state.accounts.filter(a=>a.is_active&&!a.is_group).sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true}));
    return (allowBlank?'<option value="">Not selected</option>':'<option value="">Select account…</option>')+
      accounts.map(a=>`<option value="${esc(a.code)}" ${a.code===selected?'selected':''}>${esc(a.code)} — ${esc(a.name)}</option>`).join('');
  }

  function receiptJournalOptions(selected=''){
    return '<option value="">Select journal…</option>'+state.journals.filter(j=>j.is_active).map(j=>`<option value="${esc(j.code)}" ${j.code===selected?'selected':''}>${esc(j.code)} — ${esc(j.name)}</option>`).join('');
  }

  function setReceiptStatus(message,kind=''){
    const x=el('receiptScanStatus'); if(x){x.className='receipt-scan-status '+kind;x.textContent=message;}
  }

  function fileToBase64(file){
    return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=reject;r.readAsDataURL(file);});
  }

  function receiptContext(){
    return {
      accounts:state.accounts.filter(a=>a.is_active&&!a.is_group).map(a=>({code:a.code,name:a.name,account_type:a.account_type})),
      journals:state.journals.filter(j=>j.is_active).map(j=>({code:j.code,name:j.name,journal_type:j.journal_type})),
      partners:state.partners.filter(p=>p.is_active).map(p=>({name:p.name,partner_type:p.partner_type}))
    };
  }

  async function scanReceipt(file){
    if(!/^image\/(jpeg|png|webp)$/i.test(file.type)) return alert('Please upload JPG, PNG or WEBP.');
    if(file.size>13*1024*1024) return alert('Please use an image smaller than 13 MB.');
    const preview=el('receiptPreview'), wrap=el('receiptPreviewWrap');
    preview.src=URL.createObjectURL(file);wrap.hidden=false;
    setReceiptStatus('Uploading document…','working');
    el('receiptResult').innerHTML='<div class="receipt-loading"><span></span><b>AI is reading the document…</b><small>Extracting vendor, date, amounts and accounting mapping.</small></div>';
    el('receiptActionBar').hidden=true;
    try{
      const path=`scans/${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
      const up=await client().storage.from('accounting-ai').upload(path,file,{contentType:file.type,upsert:false});
      if(up.error) throw up.error;
      setReceiptStatus('Document uploaded. Sending to AI…','working');
      const {data,error}=await client().functions.invoke('accounting-ai',{body:{
        mode:'scan_receipt',storage_path:path,mime_type:file.type,context:receiptContext()
      }});
      if(error){
        let detail=error.message||'Failed to call Accounting AI.';
        try{
          const body=error.context && typeof error.context.json==='function' ? await error.context.json() : null;
          if(body?.error) detail=body.error;
        }catch(_){}
        throw new Error(detail);
      }
      if(data?.error) throw new Error(data.error);
      const d=data?.document||{};
      const js=d.journal_suggestion||{};
      const {data:userData}=await client().auth.getUser();
      const {data:saved,error:saveError}=await client().from('accounting_ai_documents').insert({
        file_name:file.name,storage_path:path,mime_type:file.type,document_type:d.document_type||'unknown',status:'draft',
        vendor_name:d.vendor_name||null,document_number:d.document_number||null,document_date:d.document_date||null,due_date:d.due_date||null,
        currency_code:d.currency_code||'IDR',subtotal:Number(d.subtotal||0),tax_amount:Number(d.tax_amount||0),total_amount:Number(d.total_amount||0),
        extracted_data:d,journal_suggestion:js,confidence:Number(d.confidence||0),notes:d.notes||null,created_by:userData?.user?.id||null
      }).select().single();
      if(saveError) throw saveError;
      const lines=(d.lines||[]).map((l,i)=>({
        ai_document_id:saved.id,line_no:i+1,description:l.description||'',quantity:Number(l.quantity||1),unit_price:Number(l.unit_price||0),
        line_subtotal:Number(l.line_subtotal||0),tax_rate:Number(l.tax_rate||0),tax_amount:Number(l.tax_amount||0),line_total:Number(l.line_total||0),
        suggested_account_id:state.accounts.find(a=>a.code===l.account_code)?.id||null,confidence:Number(l.account_confidence||0)
      }));
      if(lines.length){const {error:e}=await client().from('accounting_ai_document_lines').insert(lines);if(e)throw e;}
      window.__pilarkReceiptScan={id:saved.id,path,fileName:file.name,document:d};
      renderReceiptResult();
      setReceiptStatus('Scan complete. Review the draft before posting.','success');
      el('receiptActionBar').hidden=false;
    }catch(err){
      console.error(err);setReceiptStatus('Scan failed: '+(err?.message||err),'error');
      el('receiptResult').innerHTML='<div class="receipt-error">The document could not be scanned. Please check the AI configuration and try again.</div>';
    }
  }

  function renderReceiptResult(){
    const x=window.__pilarkReceiptScan,d=x?.document||{},j=d.journal_suggestion||{};
    if(!x)return;
    el('receiptConfidence').textContent=Math.round(Number(d.confidence||0))+'% confidence';
    el('receiptResult').innerHTML=`
      <div class="receipt-fields">
        <label>Vendor<input id="scanVendor" value="${esc(d.vendor_name||'')}"></label>
        <label>Document No.<input id="scanDocNo" value="${esc(d.document_number||'')}"></label>
        <label>Date<input id="scanDate" type="date" value="${esc(d.document_date||'')}"></label>
        <label>Subtotal<input id="scanSubtotal" type="number" step="0.01" value="${Number(d.subtotal||0)}"></label>
        <label>Tax / PPN<input id="scanTax" type="number" step="0.01" value="${Number(d.tax_amount||0)}"></label>
        <label>Total<input id="scanTotal" type="number" step="0.01" value="${Number(d.total_amount||0)}"></label>
      </div>
      <div class="receipt-journal-head"><b>Suggested Journal</b><span>Edit mapping if necessary before posting.</span></div>
      <div class="receipt-journal-grid">
        <label>Journal<select id="scanJournal">${receiptJournalOptions(j.journal_code||'')}</select></label>
        <label>Debit Account<select id="scanDebit">${receiptAccountOptions(j.debit_account_code||'')}</select></label>
        <label>Tax Account<select id="scanTaxAccount">${receiptAccountOptions(j.tax_account_code||'',true)}</select></label>
        <label>Credit Account<select id="scanCredit">${receiptAccountOptions(j.credit_account_code||'')}</select></label>
      </div>
      <div class="receipt-lines">
        <b>Detected line items</b>
        ${(d.lines||[]).map(l=>`<div><span>${esc(l.description||'—')}</span><strong>${money(l.line_total||0)}</strong></div>`).join('')||'<small>No line items detected.</small>'}
      </div>
      <div class="receipt-ai-note">${esc(d.notes||j.reason||'Review the document and journal mapping before posting.')}</div>`;
  }

  async function postScannedReceipt(){
    const x=window.__pilarkReceiptScan;if(!x?.id)return;
    const subtotal=Number(el('scanSubtotal')?.value||0),tax=Number(el('scanTax')?.value||0),total=Number(el('scanTotal')?.value||0);
    const journalCode=el('scanJournal')?.value||'',debit=el('scanDebit')?.value||'',taxCode=el('scanTaxAccount')?.value||'',credit=el('scanCredit')?.value||'';
    if(!journalCode||!debit||!credit)return alert('Please select the journal, debit account and credit account.');
    if(Math.abs((subtotal+tax)-total)>0.02)return alert('Subtotal + tax must equal total before posting.');
    if(!confirm('Approve this AI draft and post it to the accounting journal?'))return;
    const js={...(x.document.journal_suggestion||{}),journal_code:journalCode,debit_account_code:debit,tax_account_code:taxCode,credit_account_code:credit,amount:total};
    const patch={vendor_name:el('scanVendor').value.trim()||null,document_number:el('scanDocNo').value.trim()||null,document_date:el('scanDate').value||null,subtotal,tax_amount:tax,total_amount:total,journal_suggestion:js,status:'reviewed',reviewed_by:window.PILARK_CMS?.user?.id||null,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    const {error}=await client().from('accounting_ai_documents').update(patch).eq('id',x.id);if(error)return alert(error.message);
    const {data:entryId,error:postError}=await client().rpc('post_ai_accounting_document',{p_ai_document_id:x.id});
    if(postError)return alert(postError.message);
    alert('Posted successfully to journal '+(entryId||'')+'.');
    window.__pilarkReceiptScan=null;el('receiptActionBar').hidden=true;el('receiptResult').innerHTML='<div class="receipt-success"><b>✓ Posted to Accounting</b><span>The AI document has been converted into a posted journal entry.</span></div>';
    setReceiptStatus('Posted successfully.','success');
    await load();showTab('entries');
  }

  async function rejectScannedReceipt(){
    const x=window.__pilarkReceiptScan;if(!x?.id)return;
    if(!confirm('Reject this scanned document?'))return;
    const {error}=await client().from('accounting_ai_documents').update({status:'rejected',reviewed_by:window.PILARK_CMS?.user?.id||null,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',x.id);
    if(error)return alert(error.message);
    window.__pilarkReceiptScan=null;el('receiptActionBar').hidden=true;el('receiptResult').innerHTML='<div class="receipt-success"><b>Document rejected.</b></div>';setReceiptStatus('Rejected.','success');
  }

  function showTab(tab,updateTitle=true){
    const valid=[...document.querySelectorAll('.accounting-tab-panel')].map(p=>p.dataset.accountingPanel);
    if(!valid.includes(tab)) tab='overview';
    state.tab=tab;
    document.querySelectorAll('[data-accounting-tab]').forEach(b=>b.classList.toggle('active',b.dataset.accountingTab===tab));
    document.querySelectorAll('.accounting-tab-panel').forEach(p=>{
      const active=p.dataset.accountingPanel===tab;
      p.hidden=!active;
      p.style.display=active?'block':'none';
    });
    if(updateTitle&&el('view-accounting')?.classList.contains('active'))el('pageTitle').textContent='Accounting';
    if(tab==='overview')renderOverview().catch(console.warn);
    if(tab==='reports')renderReports().catch(console.warn);
    if(tab==='aging'){renderAgingPartners();renderAging();renderStatement();}
    if(tab==='periods')renderPeriods();
    if(tab==='accounts'&&state.selectedLedgerAccount)renderGeneralLedger().catch(console.warn);
  }
  
  function quotationLineHtml(index){
    return `<div class="quotation-line document-line" data-q-index="${index}">
      <input class="q-item-code" placeholder="Item code">
      <input class="q-item-name" placeholder="Item name" required>
      <textarea class="q-desc" rows="2" placeholder="Product description"></textarea>
      <input class="q-qty" type="number" min="0.0001" step="0.0001" value="1">
      <input class="q-uom" value="PCS">
      <input class="q-price" type="number" min="0" step="1" value="0" placeholder="0">
      <input class="q-line-total" type="text" value="Rp 0" readonly aria-label="Line total">
      <button type="button" class="line-remove q-remove" aria-label="Remove item">×</button>
    </div>`;
  }
  function bindQuotationLines(){
    const box=el('quotationLines');if(!box)return;
    if(!box.children.length)box.innerHTML=quotationLineHtml(0);
    box.addEventListener('click',e=>{if(e.target.classList.contains('q-remove')){if(box.children.length>1){e.target.closest('.quotation-line').remove();updateQuotationTotals();}}});
    box.addEventListener('input',updateQuotationTotals);
    box.addEventListener('change',updateQuotationTotals);
  }
  function readQuotationLines(){
    return [...document.querySelectorAll('#quotationLines .quotation-line')].map((r,i)=>{
      const qty=Number(r.querySelector('.q-qty')?.value||0),price=Number(r.querySelector('.q-price')?.value||0),total=Math.round(qty*price*100)/100;
      const totalEl=r.querySelector('.q-line-total');if(totalEl)totalEl.value=money(total);
      return {line_no:i+1,item_code:r.querySelector('.q-item-code')?.value.trim()||null,item_name:r.querySelector('.q-item-name')?.value.trim()||'',
      description:r.querySelector('.q-desc')?.value.trim()||'',quantity:qty,uom:r.querySelector('.q-uom')?.value.trim()||'PCS',unit_price:price,line_total:total};
    });
  }
  function updateQuotationTotals(){
    const lines=readQuotationLines(),sub=lines.reduce((a,l)=>a+l.line_total,0),rate=Number(el('quotationTaxRate')?.value||0),tax=Math.round(sub*rate)/100,total=sub+tax;
    if(el('quotationSubtotal'))el('quotationSubtotal').textContent=money(sub);
    if(el('quotationTax'))el('quotationTax').textContent=money(tax);
    if(el('quotationTotal'))el('quotationTotal').textContent=money(total);
  }
  async function prepareQuotationNumber(){
    const d=el('quotationDate')?.value||today();const {data,error}=await client().rpc('next_sales_quotation_no',{p_date:d});
    if(!error&&data&&el('quotationNo'))el('quotationNo').value=data;
  }
  function renderQuotations(){
    const body=el('quotationsBody');if(!body)return;
    const label=s=>({draft:'Draft',sent:'Sent',accepted:'Accepted',rejected:'Rejected',expired:'Expired',cancelled:'Cancelled'}[s]||s);
    body.innerHTML=state.quotations.map(q=>`<tr>
      <td><b>${esc(q.quotation_no)}</b></td><td>${dateText(q.quotation_date)}</td><td>${esc(q.accounting_partners?.name||'—')}</td><td>${esc(q.project_name||'—')}</td><td class="num">${money(q.total_amount)}</td>
      <td><span class="${statusClass(q.status)}">${label(q.status)}</span></td>
      <td class="accounting-actions">
        <button type="button" class="accounting-small-btn q-pdf" data-id="${q.id}">Print / PDF</button>
        <button type="button" class="accounting-small-btn q-status" data-id="${q.id}" data-status="sent">Send</button>
        <button type="button" class="accounting-small-btn q-status" data-id="${q.id}" data-status="accepted">Accept</button>
        <button type="button" class="accounting-small-btn q-status" data-id="${q.id}" data-status="rejected">Reject</button>
      </td>
    </tr>`).join('')||'<tr><td colspan="7" class="accounting-empty">No quotations yet.</td></tr>';
    body.querySelectorAll('.q-pdf').forEach(b=>b.onclick=()=>printQuotation(b.dataset.id));
    body.querySelectorAll('.q-status').forEach(b=>b.onclick=()=>updateQuotationStatus(b.dataset.id,b.dataset.status));
  }
  async function loadQuotationLogos(){
    const box=el('quotationLogoLibrary');if(!box)return;
    const [{data:files,error:fileError},{data:selected,error:selectedError}]=await Promise.all([
      client().storage.from('quotation-assets').list('logos',{limit:100,sortBy:{column:'created_at',order:'desc'}}),
      client().from('quotation_logo_settings').select('storage_path,file_name').eq('id',1).maybeSingle()
    ]);
    if(fileError){box.innerHTML='<div class="quotation-logo-empty">Unable to load logo library: '+esc(fileError.message)+'</div>';return;}
    const selectedPath=selected?.storage_path||'';
    const logos=(files||[]).filter(f=>f.name).map(f=>({
      name:f.name,
      path:'logos/'+f.name,
      url:client().storage.from('quotation-assets').getPublicUrl('logos/'+f.name).data.publicUrl
    }));
    box.innerHTML=logos.length?logos.map(l=>'<div class="quotation-logo-card '+(l.path===selectedPath?'selected':'')+'" data-logo-path="'+esc(l.path)+'" data-logo-name="'+esc(l.name)+'"><img src="'+esc(l.url)+'" alt="'+esc(l.name)+'"><span class="quotation-logo-name">'+esc(l.name)+'</span>'+(l.path===selectedPath?'<span class="quotation-logo-selected">SELECTED</span>':'')+'</div>').join(''):'<div class="quotation-logo-empty">No uploaded logos yet. Upload a PNG or JPG logo to begin.</div>';
    box.querySelectorAll('.quotation-logo-card').forEach(card=>card.onclick=()=>selectQuotationLogo(card.dataset.logoPath,card.dataset.logoName));
  }

  async function selectQuotationLogo(path,name){
    const {data:userData}=await client().auth.getUser();
    const {error}=await client().from('quotation_logo_settings').upsert({id:1,storage_path:path,file_name:name,updated_at:new Date().toISOString(),updated_by:userData?.user?.id||null});
    if(error)return alert('Unable to select logo: '+error.message);
    await loadQuotationLogos();
  }

  async function uploadQuotationLogo(file){
    if(!file)return;
    if(!['image/png','image/jpeg','image/jpg'].includes(file.type))return alert('Please upload PNG or JPG.');
    if(file.size>2*1024*1024)return alert('Logo must be 2 MB or smaller.');
    const safe=file.name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-');
    const path='logos/'+Date.now()+'-'+safe;
    const {error}=await client().storage.from('quotation-assets').upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});
    if(error)return alert('Logo upload failed: '+error.message);
    await selectQuotationLogo(path,file.name);
    alert('Logo uploaded and selected for new quotation PDFs.');
  }

  async function createQuotation(e){
    e.preventDefault();
    const partner=el('quotationPartner').value,date=el('quotationDate').value,lines=readQuotationLines();
    if(!partner||!date||!lines.length||lines.some(l=>!l.item_name||l.quantity<=0||l.unit_price<0))return alert('Complete customer, date and all quotation items.');
    const subtotal=lines.reduce((a,l)=>a+l.line_total,0),taxRate=Number(el('quotationTaxRate').value||0),tax=Math.round(subtotal*taxRate)/100,total=subtotal+tax;
    const {data:userData}=await client().auth.getUser();
    const {data:qn,error:ne}=await client().rpc('next_sales_quotation_no',{p_date:date});if(ne)return alert(ne.message);
    const payload={quotation_no:qn,quotation_date:date,project_name:el('quotationProject').value.trim()||null,partner_id:partner,reference:el('quotationReference').value.trim()||null,currency_code:'IDR',subtotal,tax_rate:taxRate,tax_amount:tax,total_amount:total,status:'draft',delivery_time:el('quotationDeliveryTime').value.trim()||'TBA',offer_period:el('quotationOfferPeriod').value.trim()||null,delivery_term:el('quotationDeliveryTerm').value.trim()||null,warranty:el('quotationWarranty').value.trim()||null,notes:el('quotationNotes').value.trim()||null,terms_conditions:el('quotationTerms').value.trim()||null,salesperson_name:el('quotationSalesperson').value.trim()||'Sales Engineer',created_by:userData?.user?.id||null,updated_by:userData?.user?.id||null};
    const {data:q,error}=await client().from('sales_quotations').insert(payload).select().single();if(error)return alert(error.message);
    const {error:le}=await client().from('sales_quotation_lines').insert(lines.map(l=>({...l,quotation_id:q.id})));if(le){await client().from('sales_quotations').delete().eq('id',q.id);return alert(le.message);}
    e.target.reset();el('quotationDate').value=today();el('quotationTaxRate').value=11;el('quotationDeliveryTime').value='TBA';el('quotationOfferPeriod').value='Price could be changed without any prior notice';el('quotationWarranty').value='1 Year';el('quotationSalesperson').value='Sales Engineer';el('quotationLines').innerHTML=quotationLineHtml(0);await load();showTab('quotations');alert('Quotation '+qn+' saved as Draft.');
  }
  async function printQuotation(id){
    const w=window.open('about:blank','_blank','width=900,height=900');if(!w)return alert('Please allow pop-ups for Print / PDF.');
    w.document.write('<!doctype html><html><body style="font-family:Arial;padding:40px">Generating quotation PDF…</body></html>');
    try{
      const {data,error}=await client().functions.invoke('generate-quotation-pdf',{body:{quotation_id:id}});
      if(error)throw error;
      if(!(data instanceof Blob)) throw new Error('The quotation PDF response was not received as a PDF.');
      if(data.size<1000) throw new Error('The quotation PDF is empty or invalid.');
      const blob=new Blob([await data.arrayBuffer()],{type:'application/pdf'});
      const url=URL.createObjectURL(blob);
      w.location.href=url;
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(err){w.close();alert('Quotation PDF failed: '+(err?.message||'Unknown error'));}}
  async function updateQuotationStatus(id,status){if(!confirm('Change quotation status to '+status+'?'))return;const {error}=await client().from('sales_quotations').update({status,updated_at:new Date().toISOString(),updated_by:window.PILARK_CMS?.user?.id||null}).eq('id',id);if(error)return alert(error.message);await load();}
function render(){renderAccounts();renderPartners();renderEntries();renderDocuments();renderQuotations();renderPayments();renderPeriods();renderOverview().catch(console.warn);renderErpOverview().catch(console.warn);renderReports().catch(console.warn);showTab(state.tab,false);}

  async function createAccount(e){e.preventDefault();const isGroup=!!el('accountIsGroup')?.checked;const payload={code:el('accountCode').value.trim(),name:el('accountName').value.trim(),account_type:el('accountType').value,parent_id:el('accountParent').value||null,is_group:isGroup,reconcile:isGroup?false:el('accountReconcile').checked};if(!payload.code||!payload.name||!payload.account_type)return alert('Complete Code, Name and Type.');const {error}=await client().from('accounting_accounts').insert(payload);if(error)return alert(error.message);e.target.reset();await load();showTab('accounts');}
  async function createPartner(e){e.preventDefault();const payload={name:el('partnerName').value.trim(),partner_type:el('partnerType').value,email:el('partnerEmail').value.trim()||null,phone:el('partnerPhone').value.trim()||null,tax_id:el('partnerTax').value.trim()||null,address:el('partnerAddress').value.trim()||null};if(!payload.name)return alert('Partner name is required.');const {error}=await client().from('accounting_partners').insert(payload);if(error)return alert(error.message);e.target.reset();await load();showTab('partners');}
  async function createEntry(e){e.preventDefault();const debit=el('entryDebitAccount').value,credit=el('entryCreditAccount').value,amount=Number(el('entryAmount').value);if(!debit||!credit||debit===credit||amount<=0)return alert('Select two different accounts and a positive amount.');const {data:userData}=await client().auth.getUser();const {data:entry,error}=await client().from('accounting_entries').insert({entry_no:'JE-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+Math.random().toString(36).slice(2,7).toUpperCase(),entry_date:el('entryDate').value||today(),journal_id:el('entryJournal').value,partner_id:el('entryPartner').value||null,reference:el('entryReference').value.trim()||null,memo:el('entryMemo').value.trim()||null,status:'draft',created_by:userData?.user?.id||null}).select().single();if(error)return alert(error.message);const {error:le}=await client().from('accounting_lines').insert([{entry_id:entry.id,account_id:debit,partner_id:entry.partner_id,description:entry.memo||entry.reference||'Journal entry',debit:amount,credit:0},{entry_id:entry.id,account_id:credit,partner_id:entry.partner_id,description:entry.memo||entry.reference||'Journal entry',debit:0,credit:amount}]);if(le)return alert(le.message);const {error:pe}=await client().rpc('post_accounting_entry',{p_entry_id:entry.id});if(pe)return alert(pe.message);e.target.reset();el('ledgerFrom').value=monthStart();el('ledgerTo').value=today();el('entryDate').value=today();await load();showTab('entries');}
  async function postEntry(id){if(!confirm('Post this journal entry?'))return;const {error}=await client().rpc('post_accounting_entry',{p_entry_id:id});if(error)return alert(error.message);await load();}
  async function deletePostedEntry(id){
    const entry=state.entries.find(x=>x.id===id);
    if(!entry)return;
    if(entry.status!=='posted')return alert('Only posted journal entries can be deleted.');
    const ok=confirm('Delete posted journal '+entry.entry_no+'?\\n\\nThis permanently removes the journal entry and its journal lines. This action cannot be undone.');
    if(!ok)return;
    const {error}=await client().rpc('delete_posted_manual_journal_entry',{p_entry_id:id});
    if(error)return alert(error.message);
    el('accountingEntryDetail')?.setAttribute('hidden','');
    await load();
    showTab('entries');
  }

  function applyReportFilters(){
    if(!el('reportFrom')||!el('reportTo')) return;
    if(el('reportFrom').value>el('reportTo').value){ alert('Report start date cannot be after the end date.'); return; }
    renderReports().catch(e=>console.warn(e));
  }

  function bind(){
    el('accountingAiButton')?.addEventListener('click',openAccountingAi);
    el('accountingAiClose')?.addEventListener('click',closeAccountingAi);
    el('accountingAiForm')?.addEventListener('submit',e=>{e.preventDefault();sendAccountingAi(el('accountingAiInput')?.value);});
    document.querySelectorAll('[data-ai-prompt]').forEach(b=>b.addEventListener('click',()=>sendAccountingAi(b.dataset.aiPrompt)));
    el('accountingAiInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendAccountingAi(e.currentTarget.value);}});

    document.querySelectorAll('[data-accounting-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.accountingTab));document.querySelectorAll('.account-picker-trigger').forEach(b=>b.onclick=()=>openAccountPicker(b.dataset.accountTarget));document.querySelectorAll('[data-close-account-picker]').forEach(b=>b.onclick=closeAccountPicker);el('accountPickerSearch')?.addEventListener('input',e=>{state.accountPickerQuery=e.target.value;state.accountPickerPage=0;renderAccountPicker();});el('accountPickerPrev')?.addEventListener('click',()=>{state.accountPickerPage--;renderAccountPicker();});el('accountPickerNext')?.addEventListener('click',()=>{state.accountPickerPage++;renderAccountPicker();});el('accountPickerNew')?.addEventListener('click',()=>{closeAccountPicker();showTab('accounts');el('accountCode')?.focus();});el('entrySearch')?.addEventListener('input',renderEntries);el('entryJournalFilter')?.addEventListener('change',renderEntries);el('entryStatusFilter')?.addEventListener('change',renderEntries);el('entryFrom')?.addEventListener('change',renderEntries);el('entryTo')?.addEventListener('change',renderEntries);el('entryClearFilters')?.addEventListener('click',()=>{['entrySearch','entryFrom','entryTo'].forEach(id=>{if(el(id))el(id).value=''});if(el('entryJournalFilter'))el('entryJournalFilter').value='';if(el('entryStatusFilter'))el('entryStatusFilter').value='';renderEntries();});
    el('accountForm')?.addEventListener('submit',createAccount);el('ledgerApply')?.addEventListener('click',renderGeneralLedger);el('ledgerReconcileFilter')?.addEventListener('change',()=>{state.selectedReconcileLines.clear();renderGeneralLedger();});el('ledgerReconcileBtn')?.addEventListener('click',reconcileSelectedLines);el('ledgerReconcileAmount')?.addEventListener('input',updateReconcileControls);el('ledgerReconcileAutoBtn')?.addEventListener('click',autoMatchReconcile);el('ledgerSearch')?.addEventListener('input',renderGeneralLedger);el('ledgerFrom')?.addEventListener('change',renderGeneralLedger);el('ledgerTo')?.addEventListener('change',renderGeneralLedger);el('accountLedgerClose')?.addEventListener('click',()=>{state.selectedLedgerAccount='';el('accountLedgerClose').hidden=true;el('accountLedgerTitle').textContent='General Ledger';el('accountLedgerSubtitle').textContent='Select a posting account to inspect its complete ledger.';el('accountLedgerBody').innerHTML='<tr><td colspan="8" class="accounting-empty">Select a posting account above.</td></tr>';});el('partnerForm')?.addEventListener('submit',createPartner);el('entryForm')?.addEventListener('submit',createEntry);
    el('documentForm')?.addEventListener('submit',e=>{const id=e.currentTarget.dataset.editingId; if(id) saveEditedDocument('customer_invoice',e,id); else createDocument('customer_invoice',e);});el('billForm')?.addEventListener('submit',e=>{const id=e.currentTarget.dataset.editingId; if(id) saveEditedDocument('vendor_bill',e,id); else createDocument('vendor_bill',e);});
    el('addDocumentLine')?.addEventListener('click',()=>{el('documentLines').insertAdjacentHTML('beforeend',lineHtml('customer_invoice',el('documentLines').children.length));updateDocumentPreview('customer_invoice');});
    el('addBillLine')?.addEventListener('click',()=>{el('billLines').insertAdjacentHTML('beforeend',lineHtml('vendor_bill',el('billLines').children.length));updateDocumentPreview('vendor_bill');});
    el('paymentForm')?.addEventListener('submit',createPayment);el('paymentType')?.addEventListener('change',()=>{el('paymentPartner').innerHTML=partnerOptions('',el('paymentType').value==='receive'?'customer':'vendor');refreshPaymentDocuments();});el('paymentPartner')?.addEventListener('change',refreshPaymentDocuments);
    el('accountingRefresh')?.addEventListener('click',()=>load().catch(err=>alert(err.message)));el('dashboardRefresh')?.addEventListener('click',()=>load().catch(err=>alert(err.message)));
    window.addEventListener('pilark:refresh-view',e=>{if(['accounting','erp-overview'].includes(e.detail?.view))load().then(()=>e.detail?.done?.()).catch(err=>e.detail?.done?.(err));});el('agingAsOf').value=today();el('statementFrom').value=monthStart();el('statementTo').value=today();
    el('entryDate').value=today();el('periodStart').value=monthStart();el('periodEnd').value=(()=>{const d=new Date();d.setMonth(d.getMonth()+1,0);return d.toISOString().slice(0,10)})();el('documentDate').value=today();el('billDate').value=today();el('paymentDate').value=today();el('documentPaymentTerms').value='30';el('billPaymentTerms').value='30';applyPaymentTerms('document');applyPaymentTerms('bill');el('documentPaymentTerms')?.addEventListener('change',()=>applyPaymentTerms('document'));el('billPaymentTerms')?.addEventListener('change',()=>applyPaymentTerms('bill'));el('documentDate')?.addEventListener('change',()=>applyPaymentTerms('document'));el('billDate')?.addEventListener('change',()=>applyPaymentTerms('bill'));
    bindLineContainer('documentLines','customer_invoice');bindLineContainer('billLines','vendor_bill');
    const nav=document.querySelector('.side-link[data-view="accounting"]');nav?.addEventListener('click',()=>setTimeout(()=>load().catch(console.warn),50));
    el('reportApply')?.addEventListener('click',applyReportFilters);el('erpDashboardPeriod')?.addEventListener('change',()=>renderErpOverview().catch(e=>console.warn(e)));el('erpDashboardRefresh')?.addEventListener('click',()=>load().catch(err=>alert(err.message)));document.querySelector('.side-link[data-view="erp-overview"]')?.addEventListener('click',()=>setTimeout(()=>renderErpOverview().catch(console.warn),80));el('periodForm')?.addEventListener('submit',createPeriod);el('agingApply')?.addEventListener('click',renderAging);el('agingType')?.addEventListener('change',()=>{renderAgingPartners();renderAging();});el('statementApply')?.addEventListener('click',renderStatement);el('statementPrint')?.addEventListener('click',printStatement);
  }

  function populateDynamic(){el('entryJournal').innerHTML=journalOptions();if(el('entryJournalFilter'))el('entryJournalFilter').innerHTML='<option value="">All journals</option>'+journalOptions();el('entryPartner').innerHTML='<option value="">No partner</option>'+partnerOptions().replace('<option value="">Select partner…</option>','');el('documentPartner').innerHTML=partnerOptions('', 'customer');el('quotationPartner').innerHTML=partnerOptions('', 'customer');el('billPartner').innerHTML=partnerOptions('', 'vendor');el('paymentPartner').innerHTML=partnerOptions('', 'customer');el('paymentJournal').innerHTML=journalOptions('', ['bank','cash']);refreshPaymentDocuments();}
  const originalRender=render; // populate after data loads
  const oldLoad=load;
  async function bootLoad(){await oldLoad();populateDynamic();renderDocuments();renderPayments();updateDocumentPreview('customer_invoice');updateDocumentPreview('vendor_bill');await loadQuotationLogos();}
  function init(){if(!el('view-accounting'))return;ensureReceiptScannerUi();bindQuotationLines();
    el('quotationForm')?.addEventListener('submit',createQuotation);
    el('addQuotationLine')?.addEventListener('click',()=>{const box=el('quotationLines');if(box){box.insertAdjacentHTML('beforeend',quotationLineHtml(box.children.length));updateQuotationTotals();}});
    el('quotationDate')?.addEventListener('change',prepareQuotationNumber);
    el('quotationTaxRate')?.addEventListener('input',updateQuotationTotals);
    el('quotationLogoFile')?.addEventListener('change',e=>uploadQuotationLogo(e.target.files?.[0]).catch(err=>alert(err.message||'Logo upload failed.')));

    if(el('quotationDate'))el('quotationDate').value=today();
    prepareQuotationNumber().catch(()=>{});
    bind();if(ready())bootLoad().catch(err=>console.warn('Accounting init:',err));else setTimeout(()=>bootLoad().catch(err=>console.warn('Accounting init:',err)),800);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();