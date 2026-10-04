(() => {
  const state = { accounts: [], partners: [], journals: [], entries: [], invoices: [], bills: [], payments: [], allocations: [], tab: 'overview', reportFrom: '', reportTo: '' };
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
    const [a,p,j,e,i,b,py,al] = await Promise.all([
      c.from('accounting_accounts').select('*').order('code'),
      c.from('accounting_partners').select('*').order('name'),
      c.from('accounting_journals').select('*').order('code'),
      c.from('accounting_entries').select('id,entry_no,entry_date,reference,memo,status,created_at,posted_at,journal_id,partner_id,accounting_journals(code,name),accounting_partners(name)').order('entry_date',{ascending:false}).order('created_at',{ascending:false}).limit(300),
      c.from('accounting_documents').select('*,accounting_partners(name),accounting_journals(code,name)').eq('document_type','customer_invoice').order('document_date',{ascending:false}).limit(300),
      c.from('accounting_documents').select('*,accounting_partners(name),accounting_journals(code,name)').eq('document_type','vendor_bill').order('document_date',{ascending:false}).limit(300),
      c.from('accounting_payments').select('*,accounting_partners(name),accounting_journals(code,name)').order('payment_date',{ascending:false}).limit(300),
      c.from('accounting_payment_allocations').select('*,accounting_payments(payment_no,payment_date,payment_type,status,amount),accounting_documents(document_no,document_type)').order('created_at',{ascending:false}).limit(500)
    ]);
    for(const x of [a,p,j,e,i,b,py,al]) if(x.error) throw x.error;
    state.accounts=a.data||[]; state.partners=p.data||[]; state.journals=j.data||[]; state.entries=e.data||[]; state.invoices=i.data||[]; state.bills=b.data||[]; state.payments=py.data||[]; state.allocations=al.data||[];
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
    el('accountingCards').innerHTML=[['Cash & Bank',cash],['Receivables',ar],['Payables',ap],['Revenue',revenue],['Expenses',expenses]].map(([n,v])=>`<div class="accounting-metric"><span>${n}</span><b>${money(v)}</b><small>Posted accounting balance</small></div>`).join('');
    el('accountingProfit').textContent=money(revenue-expenses);
    el('accountingEntryCount').textContent=state.entries.filter(x=>x.status==='posted').length;
    const open=[...state.invoices,...state.bills].filter(x=>['posted','partially_paid'].includes(x.status)&&docOutstanding(x)>0.005).sort((a,b)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))).slice(0,15);
    el('accountingOpenDocs').innerHTML=open.length?open.map(d=>`<tr><td>${d.document_type==='customer_invoice'?'Invoice':'Bill'}</td><td><b>${esc(d.document_no)}</b></td><td>${esc(d.accounting_partners?.name||'—')}</td><td>${dateText(d.due_date)}</td><td class="num">${money(docOutstanding(d))}</td></tr>`).join(''):'<tr><td colspan="5" class="accounting-empty">No open receivables or payables.</td></tr>';
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
      if(d.status==='draft') actions.push('<button class="accounting-small-btn post-document-btn" data-document-id="'+d.id+'">Post</button>');
      if(d.status==='posted'&&Number(d.amount_paid||0)<=0.005) actions.push('<button class="accounting-small-btn cancel-document-btn" data-document-id="'+d.id+'">Cancel</button>');
      actions.push('<button class="accounting-small-btn history-document-btn" data-document-id="'+d.id+'">History</button>');
      return `<tr><td><b>${esc(d.document_no)}</b></td><td>${dateText(d.document_date)}</td><td>${esc(d.accounting_partners?.name||'—')}</td><td>${dateText(d.due_date)}</td><td class="num">${money(d.total_amount)}</td><td class="num">${money(d.amount_paid)}</td><td class="num">${money(outstanding)}</td><td><span class="${statusClass(d.status)}">${esc(d.status.replace('_',' '))}</span>${overdue?'<span class="accounting-overdue">Overdue</span>':''}</td><td class="accounting-actions">${actions.join('')}</td></tr>`;
    };
    el('accountingInvoicesBody').innerHTML=state.invoices.map(row).join('')||'<tr><td colspan="9" class="accounting-empty">No customer invoices yet.</td></tr>';
    el('accountingBillsBody').innerHTML=state.bills.map(row).join('')||'<tr><td colspan="9" class="accounting-empty">No vendor bills yet.</td></tr>';
    document.querySelectorAll('.post-document-btn').forEach(b=>b.onclick=()=>postDocument(b.dataset.documentId));
    document.querySelectorAll('.cancel-document-btn').forEach(b=>b.onclick=()=>cancelDocument(b.dataset.documentId));
    document.querySelectorAll('.history-document-btn').forEach(b=>b.onclick=()=>showDocumentHistory(b.dataset.documentId));
  }
  function showDocumentHistory(id){
    const d=[...state.invoices,...state.bills].find(x=>x.id===id);
    const rows=state.allocations.filter(a=>a.document_id===id);
    const box=el('accountingDocumentHistory') || el('accountingDocumentHistoryBills'); if(!box) return;
    box.hidden=false;
    box.innerHTML=`<div class="document-history-head"><div><b>${esc(d?.document_no||'Document')}</b><span>${esc(d?.accounting_partners?.name||'')}</span></div><button type="button" class="text-btn" id="closeDocumentHistory">Close</button></div>`+
      (rows.length?'<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Payment</th><th>Date</th><th>Type</th><th>Status</th><th class="num">Allocated</th></tr></thead><tbody>'+
      rows.map(a=>`<tr><td><b>${esc(a.accounting_payments?.payment_no||'—')}</b></td><td>${dateText(a.accounting_payments?.payment_date)}</td><td>${a.accounting_payments?.payment_type==='receive'?'Receive':'Pay'}</td><td>${esc(a.accounting_payments?.status||'—')}</td><td class="num">${money(a.amount)}</td></tr>`).join('')+
      '</tbody></table></div>':'<div class="accounting-empty">No payment allocations yet.</div>');
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

  function showTab(tab,updateTitle=true){state.tab=tab;document.querySelectorAll('[data-accounting-tab]').forEach(b=>b.classList.toggle('active',b.dataset.accountingTab===tab));document.querySelectorAll('.accounting-tab-panel').forEach(p=>p.hidden=p.dataset.accountingPanel!==tab);if(updateTitle&&el('view-accounting')?.classList.contains('active'))el('pageTitle').textContent='Accounting';if(tab==='overview')renderOverview().catch(console.warn);if(tab==='reports')renderReports().catch(console.warn);}
  function render(){renderAccounts();renderPartners();renderEntries();renderDocuments();renderPayments();renderOverview().catch(console.warn);renderReports().catch(console.warn);showTab(state.tab,false);}

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
    el('documentForm')?.addEventListener('submit',e=>createDocument('customer_invoice',e));el('billForm')?.addEventListener('submit',e=>createDocument('vendor_bill',e));
    el('addDocumentLine')?.addEventListener('click',()=>{el('documentLines').insertAdjacentHTML('beforeend',lineHtml('customer_invoice',el('documentLines').children.length));updateDocumentPreview('customer_invoice');});
    el('addBillLine')?.addEventListener('click',()=>{el('billLines').insertAdjacentHTML('beforeend',lineHtml('vendor_bill',el('billLines').children.length));updateDocumentPreview('vendor_bill');});
    el('paymentForm')?.addEventListener('submit',createPayment);el('paymentType')?.addEventListener('change',()=>{el('paymentPartner').innerHTML=partnerOptions('',el('paymentType').value==='receive'?'customer':'vendor');refreshPaymentDocuments();});el('paymentPartner')?.addEventListener('change',refreshPaymentDocuments);
    el('accountingRefresh')?.addEventListener('click',()=>load().catch(err=>alert(err.message)));
    el('entryDate').value=today();el('documentDate').value=today();el('billDate').value=today();el('paymentDate').value=today();el('documentPaymentTerms').value='30';el('billPaymentTerms').value='30';applyPaymentTerms('document');applyPaymentTerms('bill');el('documentPaymentTerms')?.addEventListener('change',()=>applyPaymentTerms('document'));el('billPaymentTerms')?.addEventListener('change',()=>applyPaymentTerms('bill'));el('documentDate')?.addEventListener('change',()=>applyPaymentTerms('document'));el('billDate')?.addEventListener('change',()=>applyPaymentTerms('bill'));
    bindLineContainer('documentLines','customer_invoice');bindLineContainer('billLines','vendor_bill');
    const nav=document.querySelector('.side-link[data-view="accounting"]');nav?.addEventListener('click',()=>setTimeout(()=>load().catch(console.warn),50));
    el('reportApply')?.addEventListener('click',applyReportFilters);
  }

  function populateDynamic(){el('entryJournal').innerHTML=journalOptions();el('entryPartner').innerHTML='<option value="">No partner</option>'+partnerOptions().replace('<option value="">Select partner…</option>','');el('entryDebitAccount').innerHTML=accountOptions();el('entryCreditAccount').innerHTML=accountOptions();el('documentPartner').innerHTML=partnerOptions('', 'customer');el('billPartner').innerHTML=partnerOptions('', 'vendor');el('paymentPartner').innerHTML=partnerOptions('', 'customer');el('paymentJournal').innerHTML=journalOptions('', ['bank','cash']);refreshPaymentDocuments();}
  const originalRender=render; // populate after data loads
  const oldLoad=load;
  async function bootLoad(){await oldLoad();populateDynamic();renderDocuments();renderPayments();updateDocumentPreview('customer_invoice');updateDocumentPreview('vendor_bill');}
  function init(){if(!el('view-accounting'))return;bind();if(ready())bootLoad().catch(err=>console.warn('Accounting init:',err));else setTimeout(()=>bootLoad().catch(err=>console.warn('Accounting init:',err)),800);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();