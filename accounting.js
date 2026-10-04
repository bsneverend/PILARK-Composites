(() => {
  const state = { accounts: [], partners: [], journals: [], entries: [], invoices: [], bills: [], payments: [], allocations: [], sends: [], periods: [], inventoryBalances: [], tab: 'overview', reportFrom: '', reportTo: '' };
  const el = id => document.getElementById(id);
  const client = () => window.PILARK_CMS?.client;
  const ready = () => !!window.PILARK_CMS?.ready && !!client();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const money = value => new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', maximumFractionDigits:0 }).format(Number(value||0));
  const dateText = value => value ? new Date(value+'T00:00:00').toLocaleDateString('id-ID') : '-';
  const today = () => new Date().toISOString().slice(0,10);
  const monthStart = () => { const d=new Date(); d.setDate(1); return d.toISOString().slice(0,10); };
  const typeLabel = type => ({asset_receivable:'Receivable',asset_cash:'Bank & Cash',asset_current:'Current Asset',asset_non_current:'Non-current Asset',asset_prepayments:'Prepayments',asset_fixed:'Fixed Asset',liability_payable:'Payable',liability_credit_card:'Credit Card',liability_current:'Current Liability',liability_non_current:'Non-current Liability',equity:'Equity',equity_unaffected:'Current Year Earnings',income:'Income',income_other:'Other Income',expense:'Expense',expense_other:'Other Expense',expense_depreciation:'Depreciation',expense_direct_cost:'Cost of Revenue',off_balance:'Off-balance'}[type]||type);
  const statusClass = s => 'accounting-status '+esc(s);
  const docOutstanding = d => Math.max(0, Number(d.total_amount||0)-Number(d.amount_paid||0));

  async function load() {
    if(!ready()) return;
    const c=client();
    const [a,p,j,e,i,b,py,al,se,ib,pe] = await Promise.all([
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
      c.from('accounting_periods').select('*').order('date_start',{ascending:false})
    ]);
    for(const x of [a,p,j,e,i,b,py,al,se,ib,pe]) if(x.error) throw x.error;
    state.accounts=a.data||[]; state.partners=p.data||[]; state.journals=j.data||[]; state.entries=e.data||[]; state.invoices=i.data||[]; state.bills=b.data||[]; state.payments=py.data||[]; state.allocations=al.data||[]; state.sends=se.data||[]; state.inventoryBalances=ib.data||[]; state.periods=pe.data||[];
    render();
  }

  async function postedLines(fromDate=null,toDate=null) {
    const ids=state.entries
      .filter(x=>x.status==='posted')
      .filter(x=>!fromDate||x.entry_date>=fromDate)
      .filter(x=>!toDate||x.entry_date<=toDate)
      .map(x=>x.id);
    if(!ids.length) return [];
    const {data,error}=await client().from('accounting_lines').select('entry_id,account_id,debit,credit,accounting_accounts(code,name,account_type)').in('entry_id',ids);
    if(error) throw error; return data||[];
  }
  function balanceForAccount(lines,a) {
    const rows=lines.filter(x=>x.account_id===a.id);
    const d=rows.reduce((s,x)=>s+Number(x.debit||0),0), c=rows.reduce((s,x)=>s+Number(x.credit||0),0);
    const debitNormal=['asset_receivable','asset_cash','asset_current','asset_non_current','asset_prepayments','asset_fixed','expense','expense_other','expense_depreciation','expense_direct_cost'].includes(a.account_type);
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
    el('accountingAccountsBody').innerHTML=state.accounts.map(a=>`<tr><td>${esc(a.code)}</td><td><b>${esc(a.name)}</b></td><td>${esc(typeLabel(a.account_type))}</td><td>${a.reconcile?'Yes':'—'}</td><td>${a.is_active?'Active':'Inactive'}</td></tr>`).join('');
    el('accountType').innerHTML='<option value="">Select type…</option>'+['asset_receivable','asset_cash','asset_current','asset_non_current','asset_prepayments','asset_fixed','liability_payable','liability_credit_card','liability_current','liability_non_current','equity','equity_unaffected','income','income_other','expense','expense_other','expense_depreciation','expense_direct_cost','off_balance'].map(t=>`<option value="${t}">${esc(typeLabel(t))}</option>`).join('');
  }
  function renderPartners() {
    el('accountingPartnersBody').innerHTML=state.partners.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.partner_type)}</td><td>${esc(p.email||'—')}</td><td>${esc(p.phone||'—')}</td><td>${esc(p.tax_id||'—')}</td></tr>`).join('')||'<tr><td colspan="5" class="accounting-empty">No contacts yet.</td></tr>';
  }
  function renderEntries() {
    el('accountingEntriesBody').innerHTML=state.entries.map(e=>`<tr><td><b>${esc(e.entry_no)}</b></td><td>${dateText(e.entry_date)}</td><td>${esc(e.accounting_journals?.code||'')}</td><td>${esc(e.accounting_partners?.name||'—')}</td><td>${esc(e.memo||e.reference||'—')}</td><td><span class="${statusClass(e.status)}">${esc(e.status)}</span></td><td>${e.status==='draft'?'<button class="accounting-small-btn post-entry-btn" data-entry-id="'+e.id+'">Post</button>':''}</td></tr>`).join('')||'<tr><td colspan="7" class="accounting-empty">No journal entries yet.</td></tr>';
    document.querySelectorAll('.post-entry-btn').forEach(b=>b.onclick=()=>postEntry(b.dataset.entryId));
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
    const docs=(type==='customer'?state.invoices:state.bills).filter(d=>!partner||d.partner_id===partner).map(d=>({...d,outstanding:docOutstandingAsOf(d,asOf)})).filter(d=>d.outstanding>0.005);
    const buckets={'Current':0,'1–30 days':0,'31–60 days':0,'61–90 days':0,'90+ days':0};
    docs.forEach(d=>{const due=d.due_date||d.document_date;const days=Math.max(0,Math.floor((new Date(asOf+'T00:00:00')-new Date(due+'T00:00:00'))/86400000));d.age=days;d.bucket=agingBucket(days);buckets[d.bucket]+=d.outstanding;});
    el('agingSummary').innerHTML=Object.entries(buckets).map(([k,v])=>'<div class="report-row"><span>'+k+'</span><strong>'+money(v)+'</strong></div>').join('')+'<div class="report-row aging-total"><span><b>Total Outstanding</b></span><strong>'+money(docs.reduce((s,d)=>s+d.outstanding,0))+'</strong></div>';
    el('agingDocumentsBody').innerHTML=docs.sort((a,b)=>b.age-a.age).map(d=>'<tr><td><b>'+esc(d.document_no)+'</b></td><td>'+esc(d.accounting_partners?.name||'—')+'</td><td>'+dateText(d.due_date)+'</td><td>'+d.age+' days</td><td>'+d.bucket+'</td><td class="num">'+money(d.outstanding)+'</td></tr>').join('')||'<tr><td colspan="6"><div class="accounting-empty">No outstanding documents as of this date.</div></td></tr>';
  }
  function renderStatement(){
    const pid=el('statementPartner')?.value, from=el('statementFrom')?.value||monthStart(), to=el('statementTo')?.value||today();
    const box=el('partnerStatement'); if(!box)return;
    if(!pid){box.innerHTML='<div class="accounting-empty">Select a partner to view the statement.</div>';return;}
    if(from>to){box.innerHTML='<div class="accounting-empty">Statement start date cannot be after the end date.</div>';return;}
    const p=state.partners.find(x=>x.id===pid); const docs=[...state.invoices,...state.bills].filter(d=>d.partner_id===pid&&d.status!=='cancelled'&&d.document_date<=to&&d.document_date>=from);
    const pays=state.allocations.filter(a=>a.accounting_payments?.partner_id===pid&&a.accounting_payments?.status==='posted'&&String(a.accounting_payments.payment_date||'')>=from&&String(a.accounting_payments.payment_date||'')<=to);
    const rows=[];
    docs.forEach(d=>rows.push({date:d.document_date,no:d.document_no,type:documentLabel(d),debit:d.document_type==='customer_invoice'?Number(d.total_amount||0):0,credit:d.document_type==='vendor_bill'?Number(d.total_amount||0):0}));
    pays.forEach(a=>rows.push({date:a.accounting_payments.payment_date,no:a.accounting_payments.payment_no,type:a.accounting_payments.payment_type==='receive'?'Payment Received':'Payment Made',debit:a.accounting_payments.payment_type==='pay'?Number(a.amount||0):0,credit:a.accounting_payments.payment_type==='receive'?Number(a.amount||0):0}));
    rows.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.no).localeCompare(String(b.no)));
    let balance=0;
    const body=rows.map(r=>{balance+=r.debit-r.credit;return '<tr><td>'+dateText(r.date)+'</td><td><b>'+esc(r.no)+'</b></td><td>'+esc(r.type)+'</td><td class="num">'+(r.debit?money(r.debit):'—')+'</td><td class="num">'+(r.credit?money(r.credit):'—')+'</td><td class="num"><b>'+money(balance)+'</b></td></tr>';}).join('');
    const periodDocs=[...state.invoices,...state.bills].filter(d=>d.partner_id===pid&&d.status!=='cancelled'&&d.document_date<=to);
    const totalDue=periodDocs.reduce((s,d)=>s+Number(d.total_amount||0),0)-state.allocations.filter(a=>a.accounting_payments?.partner_id===pid&&a.accounting_payments?.status==='posted'&&String(a.accounting_payments.payment_date||'')<=to).reduce((s,a)=>s+Number(a.amount||0),0);
    box.innerHTML='<div class="statement-head"><div><b>'+esc(p?.name||'')+'</b><span>'+esc(p?.email||'')+'</span></div><div><b>Statement period</b><span>'+dateText(from)+' – '+dateText(to)+'</span></div></div><div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Date</th><th>Document</th><th>Type</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead><tbody>'+body+'</tbody></table></div><div class="statement-total"><span>Outstanding through '+dateText(to)+'</span><b>'+money(Math.max(0,totalDue))+'</b></div>';
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
    const periodEntryIds=posted.filter(x=>x.entry_date>=period.from&&x.entry_date<=period.to).map(x=>x.id);
    let periodLines=[];
    if(periodEntryIds.length){
      const {data,error}=await client().from('accounting_lines').select('entry_id,account_id,debit,credit,accounting_accounts(code,name,account_type)').in('entry_id',periodEntryIds);
      if(error)throw error;
      periodLines=data||[];
    }
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
    const zeroStock=Math.max(0,state.accounts.length?0:0);
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

  function showTab(tab,updateTitle=true){state.tab=tab;document.querySelectorAll('[data-accounting-tab]').forEach(b=>b.classList.toggle('active',b.dataset.accountingTab===tab));document.querySelectorAll('.accounting-tab-panel').forEach(p=>p.hidden=p.dataset.accountingPanel!==tab);if(updateTitle&&el('view-accounting')?.classList.contains('active'))el('pageTitle').textContent='Accounting';if(tab==='overview')renderOverview().catch(console.warn);if(tab==='reports')renderReports().catch(console.warn);if(tab==='aging'){renderAgingPartners();renderAging();renderStatement();}if(tab==='periods')renderPeriods();}
  function render(){renderAccounts();renderPartners();renderEntries();renderDocuments();renderPayments();renderPeriods();renderOverview().catch(console.warn);renderErpOverview().catch(console.warn);renderReports().catch(console.warn);showTab(state.tab,false);}

  async function createAccount(e){e.preventDefault();const payload={code:el('accountCode').value.trim(),name:el('accountName').value.trim(),account_type:el('accountType').value,reconcile:el('accountReconcile').checked};if(!payload.code||!payload.name||!payload.account_type)return alert('Complete Code, Name and Type.');const {error}=await client().from('accounting_accounts').insert(payload);if(error)return alert(error.message);e.target.reset();await load();showTab('accounts');}
  async function createPartner(e){e.preventDefault();const payload={name:el('partnerName').value.trim(),partner_type:el('partnerType').value,email:el('partnerEmail').value.trim()||null,phone:el('partnerPhone').value.trim()||null,tax_id:el('partnerTax').value.trim()||null,address:el('partnerAddress').value.trim()||null};if(!payload.name)return alert('Partner name is required.');const {error}=await client().from('accounting_partners').insert(payload);if(error)return alert(error.message);e.target.reset();await load();showTab('partners');}
  async function createEntry(e){e.preventDefault();const debit=el('entryDebitAccount').value,credit=el('entryCreditAccount').value,amount=Number(el('entryAmount').value);if(!debit||!credit||debit===credit||amount<=0)return alert('Select two different accounts and a positive amount.');const {data:userData}=await client().auth.getUser();const {data:entry,error}=await client().from('accounting_entries').insert({entry_no:'JE-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+Math.random().toString(36).slice(2,7).toUpperCase(),entry_date:el('entryDate').value||today(),journal_id:el('entryJournal').value,partner_id:el('entryPartner').value||null,reference:el('entryReference').value.trim()||null,memo:el('entryMemo').value.trim()||null,status:'draft',created_by:userData?.user?.id||null}).select().single();if(error)return alert(error.message);const {error:le}=await client().from('accounting_lines').insert([{entry_id:entry.id,account_id:debit,partner_id:entry.partner_id,description:entry.memo||entry.reference||'Journal entry',debit:amount,credit:0},{entry_id:entry.id,account_id:credit,partner_id:entry.partner_id,description:entry.memo||entry.reference||'Journal entry',debit:0,credit:amount}]);if(le)return alert(le.message);const {error:pe}=await client().rpc('post_accounting_entry',{p_entry_id:entry.id});if(pe)return alert(pe.message);e.target.reset();el('entryDate').value=today();await load();showTab('entries');}
  async function postEntry(id){if(!confirm('Post this journal entry?'))return;const {error}=await client().rpc('post_accounting_entry',{p_entry_id:id});if(error)return alert(error.message);await load();}

  function applyReportFilters(){
    if(!el('reportFrom')||!el('reportTo')) return;
    if(el('reportFrom').value>el('reportTo').value){ alert('Report start date cannot be after the end date.'); return; }
    renderReports().catch(e=>console.warn(e));
  }

  function bind(){
    document.querySelectorAll('[data-accounting-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.accountingTab));
    el('accountForm')?.addEventListener('submit',createAccount);el('partnerForm')?.addEventListener('submit',createPartner);el('entryForm')?.addEventListener('submit',createEntry);
    el('documentForm')?.addEventListener('submit',e=>{const id=e.currentTarget.dataset.editingId; if(id) saveEditedDocument('customer_invoice',e,id); else createDocument('customer_invoice',e);});el('billForm')?.addEventListener('submit',e=>{const id=e.currentTarget.dataset.editingId; if(id) saveEditedDocument('vendor_bill',e,id); else createDocument('vendor_bill',e);});
    el('addDocumentLine')?.addEventListener('click',()=>{el('documentLines').insertAdjacentHTML('beforeend',lineHtml('customer_invoice',el('documentLines').children.length));updateDocumentPreview('customer_invoice');});
    el('addBillLine')?.addEventListener('click',()=>{el('billLines').insertAdjacentHTML('beforeend',lineHtml('vendor_bill',el('billLines').children.length));updateDocumentPreview('vendor_bill');});
    el('paymentForm')?.addEventListener('submit',createPayment);el('paymentType')?.addEventListener('change',()=>{el('paymentPartner').innerHTML=partnerOptions('',el('paymentType').value==='receive'?'customer':'vendor');refreshPaymentDocuments();});el('paymentPartner')?.addEventListener('change',refreshPaymentDocuments);
    el('accountingRefresh')?.addEventListener('click',()=>load().catch(err=>alert(err.message)));el('dashboardRefresh')?.addEventListener('click',()=>load().catch(err=>alert(err.message)));el('agingAsOf').value=today();el('statementFrom').value=monthStart();el('statementTo').value=today();
    el('entryDate').value=today();el('periodStart').value=monthStart();el('periodEnd').value=(()=>{const d=new Date();d.setMonth(d.getMonth()+1,0);return d.toISOString().slice(0,10)})();el('documentDate').value=today();el('billDate').value=today();el('paymentDate').value=today();el('documentPaymentTerms').value='30';el('billPaymentTerms').value='30';applyPaymentTerms('document');applyPaymentTerms('bill');el('documentPaymentTerms')?.addEventListener('change',()=>applyPaymentTerms('document'));el('billPaymentTerms')?.addEventListener('change',()=>applyPaymentTerms('bill'));el('documentDate')?.addEventListener('change',()=>applyPaymentTerms('document'));el('billDate')?.addEventListener('change',()=>applyPaymentTerms('bill'));
    bindLineContainer('documentLines','customer_invoice');bindLineContainer('billLines','vendor_bill');
    const nav=document.querySelector('.side-link[data-view="accounting"]');nav?.addEventListener('click',()=>setTimeout(()=>load().catch(console.warn),50));
    el('reportApply')?.addEventListener('click',applyReportFilters);el('erpDashboardPeriod')?.addEventListener('change',()=>renderErpOverview().catch(e=>console.warn(e)));el('erpDashboardRefresh')?.addEventListener('click',()=>load().catch(err=>alert(err.message)));document.querySelector('.side-link[data-view="erp-overview"]')?.addEventListener('click',()=>setTimeout(()=>renderErpOverview().catch(console.warn),80));el('periodForm')?.addEventListener('submit',createPeriod);el('agingApply')?.addEventListener('click',renderAging);el('agingType')?.addEventListener('change',()=>{renderAgingPartners();renderAging();});el('statementApply')?.addEventListener('click',renderStatement);el('statementPrint')?.addEventListener('click',printStatement);
  }

  function populateDynamic(){el('entryJournal').innerHTML=journalOptions();el('entryPartner').innerHTML='<option value="">No partner</option>'+partnerOptions().replace('<option value="">Select partner…</option>','');el('entryDebitAccount').innerHTML=accountOptions();el('entryCreditAccount').innerHTML=accountOptions();el('documentPartner').innerHTML=partnerOptions('', 'customer');el('billPartner').innerHTML=partnerOptions('', 'vendor');el('paymentPartner').innerHTML=partnerOptions('', 'customer');el('paymentJournal').innerHTML=journalOptions('', ['bank','cash']);refreshPaymentDocuments();}
  const originalRender=render; // populate after data loads
  const oldLoad=load;
  async function bootLoad(){await oldLoad();populateDynamic();renderDocuments();renderPayments();updateDocumentPreview('customer_invoice');updateDocumentPreview('vendor_bill');}
  function init(){if(!el('view-accounting'))return;bind();if(ready())bootLoad().catch(err=>console.warn('Accounting init:',err));else setTimeout(()=>bootLoad().catch(err=>console.warn('Accounting init:',err)),800);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();