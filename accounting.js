(() => {
  const state = { accounts: [], partners: [], journals: [], entries: [], tab: 'overview' };
  const el = id => document.getElementById(id);
  const client = () => window.PILARK_CMS?.client;
  const ready = () => !!window.PILARK_CMS?.ready && !!client();
  const esc = value => String(value ?? '').replace(/[&<>\"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[s]));
  const money = value => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));
  const dateText = value => value ? new Date(value).toLocaleDateString('en-GB') : '-';
  const accountTypeLabel = type => ({asset_receivable:'Receivable',asset_cash:'Bank & Cash',asset_current:'Current Asset',asset_non_current:'Non-current Asset',asset_prepayments:'Prepayments',asset_fixed:'Fixed Asset',liability_payable:'Payable',liability_credit_card:'Credit Card',liability_current:'Current Liability',liability_non_current:'Non-current Liability',equity:'Equity',equity_unaffected:'Current Year Earnings',income:'Income',income_other:'Other Income',expense:'Expense',expense_other:'Other Expense',expense_depreciation:'Depreciation',expense_direct_cost:'Cost of Revenue',off_balance:'Off-balance'}[type] || type);

  async function load() {
    if (!ready()) return;
    const c = client();
    const results = await Promise.all([
      c.from('accounting_accounts').select('*').order('code'),
      c.from('accounting_partners').select('*').order('name'),
      c.from('accounting_journals').select('*').order('code'),
      c.from('accounting_entries').select('id,entry_no,entry_date,reference,memo,status,created_at,posted_at,journal_id,partner_id,accounting_journals(code,name),accounting_partners(name)').order('entry_date',{ascending:false}).order('created_at',{ascending:false}).limit(200)
    ]);
    const [a,p,j,e] = results;
    if (a.error) throw a.error;
    if (p.error) throw p.error;
    if (j.error) throw j.error;
    if (e.error) throw e.error;
    state.accounts = a.data || [];
    state.partners = p.data || [];
    state.journals = j.data || [];
    state.entries = e.data || [];
    render();
  }

  async function postedLines() {
    const { data, error } = await client().from('accounting_lines').select('account_id,debit,credit,accounting_accounts(code,name,account_type)').in('entry_id', state.entries.filter(e=>e.status==='posted').map(e=>e.id));
    if (error) throw error;
    return data || [];
  }

  function balanceForAccount(lines, accountId) {
    const rows = lines.filter(x => x.account_id === accountId);
    const debit = rows.reduce((s,x)=>s+Number(x.debit||0),0);
    const credit = rows.reduce((s,x)=>s+Number(x.credit||0),0);
    const type = state.accounts.find(a=>a.id===accountId)?.account_type || '';
    const debitNormal = ['asset_receivable','asset_cash','asset_current','asset_non_current','asset_prepayments','asset_fixed','expense','expense_other','expense_depreciation','expense_direct_cost'].includes(type);
    return debitNormal ? debit-credit : credit-debit;
  }

  async function renderOverview() {
    const lines = await postedLines();
    const balances = state.accounts.map(a=>({account:a,balance:balanceForAccount(lines,a.id)}));
    const cash = balances.filter(x=>['asset_cash'].includes(x.account.account_type)).reduce((s,x)=>s+x.balance,0);
    const ar = balances.filter(x=>x.account.account_type==='asset_receivable').reduce((s,x)=>s+x.balance,0);
    const ap = balances.filter(x=>x.account.account_type==='liability_payable').reduce((s,x)=>s+x.balance,0);
    const revenue = balances.filter(x=>['income','income_other'].includes(x.account.account_type)).reduce((s,x)=>s+x.balance,0);
    const expenses = balances.filter(x=>['expense','expense_other','expense_depreciation','expense_direct_cost'].includes(x.account.account_type)).reduce((s,x)=>s+x.balance,0);
    el('accountingCards').innerHTML = [['Cash & Bank',cash],['Receivables',ar],['Payables',ap],['Revenue',revenue],['Expenses',expenses]].map(([n,v])=>`<div class="accounting-metric"><span>${n}</span><b>${money(v)}</b><small>Posted journal entries</small></div>`).join('');
    const reportRows = balances.filter(x=>Math.abs(x.balance)>0.005).sort((a,b)=>a.account.code.localeCompare(b.account.code));
    el('accountingTrialBalance').innerHTML = reportRows.length ? reportRows.map(x=>`<tr><td>${esc(x.account.code)}</td><td>${esc(x.account.name)}</td><td>${esc(accountTypeLabel(x.account.account_type))}</td><td class="num">${money(x.balance)}</td></tr>`).join('') : '<tr><td colspan="4" class="accounting-empty">No posted transactions yet.</td></tr>';
    const profit = revenue-expenses;
    el('accountingProfit').textContent = money(profit);
    el('accountingEntryCount').textContent = state.entries.filter(e=>e.status==='posted').length;
  }

  function accountOptions(selected='') { return '<option value="">Select account…</option>'+state.accounts.filter(a=>a.is_active).map(a=>`<option value="${a.id}" ${a.id===selected?'selected':''}>${esc(a.code)} — ${esc(a.name)}</option>`).join(''); }
  function partnerOptions(selected='') { return '<option value="">No partner</option>'+state.partners.filter(p=>p.is_active).map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join(''); }
  function journalOptions(selected='') { return state.journals.filter(j=>j.is_active).map(j=>`<option value="${j.id}" ${j.id===selected?'selected':''}>${esc(j.code)} — ${esc(j.name)}</option>`).join(''); }

  function renderAccounts() {
    el('accountingAccountsBody').innerHTML = state.accounts.map(a=>`<tr><td>${esc(a.code)}</td><td><b>${esc(a.name)}</b></td><td>${esc(accountTypeLabel(a.account_type))}</td><td>${a.reconcile?'Yes':'—'}</td><td>${a.is_active?'Active':'Inactive'}</td></tr>`).join('') || '<tr><td colspan="5" class="accounting-empty">No accounts.</td></tr>';
    el('accountType').innerHTML = '<option value="">Select type…</option>'+['asset_receivable','asset_cash','asset_current','asset_non_current','asset_prepayments','asset_fixed','liability_payable','liability_credit_card','liability_current','liability_non_current','equity','equity_unaffected','income','income_other','expense','expense_other','expense_depreciation','expense_direct_cost','off_balance'].map(t=>`<option value="${t}">${esc(accountTypeLabel(t))}</option>`).join('');
  }

  function renderPartners() {
    el('accountingPartnersBody').innerHTML = state.partners.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.partner_type)}</td><td>${esc(p.email||'—')}</td><td>${esc(p.phone||'—')}</td><td>${esc(p.tax_id||'—')}</td></tr>`).join('') || '<tr><td colspan="5" class="accounting-empty">No partners yet.</td></tr>';
  }

  function renderEntries() {
    el('accountingEntriesBody').innerHTML = state.entries.map(e=>`<tr><td><b>${esc(e.entry_no)}</b></td><td>${dateText(e.entry_date)}</td><td>${esc(e.accounting_journals?.code||'')}</td><td>${esc(e.accounting_partners?.name||'—')}</td><td>${esc(e.memo||e.reference||'—')}</td><td><span class="accounting-status ${esc(e.status)}">${esc(e.status)}</span></td><td>${e.status==='draft'?`<button class="accounting-small-btn post-entry-btn" data-entry-id="${e.id}">Post</button>`:''}</td></tr>`).join('') || '<tr><td colspan="7" class="accounting-empty">No journal entries yet.</td></tr>';
    el('entryJournal').innerHTML = journalOptions(state.journals[0]?.id);
    el('entryPartner').innerHTML = partnerOptions();
    el('entryDebitAccount').innerHTML = accountOptions();
    el('entryCreditAccount').innerHTML = accountOptions();
    document.querySelectorAll('.post-entry-btn').forEach(btn=>btn.onclick=()=>postEntry(btn.dataset.entryId));
  }

  function render() {
    renderAccounts(); renderPartners(); renderEntries();
    showTab(state.tab);
    renderOverview().catch(err=>console.warn('Accounting overview:',err.message));
  }

  function showTab(tab) {
    state.tab=tab;
    document.querySelectorAll('[data-accounting-tab]').forEach(b=>b.classList.toggle('active',b.dataset.accountingTab===tab));
    document.querySelectorAll('.accounting-tab-panel').forEach(p=>p.hidden=p.dataset.accountingPanel!==tab);
    if(tab==='overview') renderOverview().catch(()=>{});
  }

  async function createAccount(e) {
    e.preventDefault();
    const payload={code:el('accountCode').value.trim(),name:el('accountName').value.trim(),account_type:el('accountType').value,reconcile:el('accountReconcile').checked};
    if(!payload.code||!payload.name||!payload.account_type) return alert('Please complete Code, Name and Type.');
    const {error}=await client().from('accounting_accounts').insert(payload);
    if(error) return alert('Could not create account: '+error.message);
    e.target.reset(); await load(); showTab('accounts');
  }

  async function createPartner(e) {
    e.preventDefault();
    const payload={name:el('partnerName').value.trim(),partner_type:el('partnerType').value,email:el('partnerEmail').value.trim()||null,phone:el('partnerPhone').value.trim()||null,tax_id:el('partnerTax').value.trim()||null,address:el('partnerAddress').value.trim()||null};
    if(!payload.name) return alert('Partner name is required.');
    const {error}=await client().from('accounting_partners').insert(payload);
    if(error) return alert('Could not create partner: '+error.message);
    e.target.reset(); await load(); showTab('partners');
  }

  async function createEntry(e) {
    e.preventDefault();
    const debit=el('entryDebitAccount').value, credit=el('entryCreditAccount').value, amount=Number(el('entryAmount').value);
    if(!debit||!credit||debit===credit||!amount||amount<=0) return alert('Select two different accounts and enter an amount greater than zero.');
    const {data:userData}=await client().auth.getUser();
    const payload={entry_no:'JE-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+Math.random().toString(36).slice(2,7).toUpperCase(),entry_date:el('entryDate').value||new Date().toISOString().slice(0,10),journal_id:el('entryJournal').value,partner_id:el('entryPartner').value||null,reference:el('entryReference').value.trim()||null,memo:el('entryMemo').value.trim()||null,status:'draft',created_by:userData?.user?.id||null};
    const {data:entry,error}=await client().from('accounting_entries').insert(payload).select().single();
    if(error) return alert('Could not create journal entry: '+error.message);
    const lines=[{entry_id:entry.id,account_id:debit,partner_id:payload.partner_id,description:payload.memo||payload.reference||'Journal entry',debit:amount,credit:0},{entry_id:entry.id,account_id:credit,partner_id:payload.partner_id,description:payload.memo||payload.reference||'Journal entry',debit:0,credit:amount}];
    const {error:lineError}=await client().from('accounting_lines').insert(lines);
    if(lineError){await client().from('accounting_entries').delete().eq('id',entry.id);return alert('Could not create journal lines: '+lineError.message);}
    const {error:postError}=await client().rpc('post_accounting_entry',{p_entry_id:entry.id});
    if(postError) return alert('Entry saved as draft but could not be posted: '+postError.message);
    e.target.reset(); el('entryDate').value=new Date().toISOString().slice(0,10); await load(); showTab('entries');
  }

  async function postEntry(id) {
    if(!confirm('Post this journal entry? Posted entries become part of the financial reports.')) return;
    const {error}=await client().rpc('post_accounting_entry',{p_entry_id:id});
    if(error) return alert('Could not post entry: '+error.message);
    await load(); showTab('entries');
  }

  function bind() {
    document.querySelectorAll('[data-accounting-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.accountingTab));
    el('accountForm')?.addEventListener('submit',createAccount);
    el('partnerForm')?.addEventListener('submit',createPartner);
    el('entryForm')?.addEventListener('submit',createEntry);
    el('accountingRefresh')?.addEventListener('click',()=>load().catch(err=>alert('Refresh failed: '+err.message)));
    el('entryDate').value=new Date().toISOString().slice(0,10);
    window.addEventListener('resize',()=>{});
    const accountingNav=document.querySelector('.side-link[data-view="accounting"]');
    accountingNav?.addEventListener('click',()=>setTimeout(()=>load().catch(err=>console.warn('Accounting load:',err.message)),50));
  }

  function init() {
    if(!el('view-accounting')) return;
    bind();
    if(ready()) load().catch(err=>console.warn('Accounting init:',err.message));
    else setTimeout(()=>load().catch(err=>console.warn('Accounting init:',err.message)),800);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
