(function(){
const ODOO_FN='https://seelqcgjfuuwurslwtgf.supabase.co/functions/v1/odoo-transaction-input';
const SCAN_FN='https://seelqcgjfuuwurslwtgf.supabase.co/functions/v1/odoo-receipt-scan';
let initialized=false,masters={accounts:[],journals:[],partners:[],role_accounts:{}},currentReceipt=null,currentDraftId=null,editingTransaction=null;

const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const iso=d=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day};
function status(id,msg,ok=false){const el=$(id);if(!el)return;el.textContent=msg||'';el.classList.toggle('ok',!!ok);el.classList.toggle('bad',!!msg&&!ok)}
async function session(){const {data,error}=await window.PILARK_CMS.client.auth.getSession();if(error)throw error;if(!data?.session)throw new Error('Your CMS session has expired.');return data.session}
async function callOdoo(path,options={}){
 const s=await session();
 const res=await fetch(ODOO_FN+path,{...options,headers:{...(options.headers||{}),Authorization:'Bearer '+s.access_token,apikey:window.PILARK_SUPABASE_CONFIG?.anonKey||'','Content-Type':'application/json'}});
 const p=await res.json().catch(()=>({}));if(!res.ok||!p.ok)throw new Error(p.error||'Odoo transaction request failed.');return p
}
function accountLabel(a){return (a.code||'')+' — '+(a.name||'')}
function chooseAutomaticJournal(){
 const type=$('transactionInputType')?.value||'reimbursement';
 const journals=masters.journals.filter(x=>x.active!==false);
 if(!journals.length)return null;
 const scored=journals.map(j=>{
  const text=((j.name||'')+' '+(j.code||'')).toLowerCase();
  let score=0;
  if(j.type==='general')score+=100;
  if(/misc|miscellaneous/.test(text))score+=40;
  if(/general|journal entry|journal entries|adjustment/.test(text))score+=30;
  if(type==='reimbursement'&&/expense|reimburse/.test(text))score+=5;
  if(type==='payment_request'&&/payable|payment|request/.test(text))score+=5;
  return {j,score};
 }).sort((a,b)=>b.score-a.score);
 return scored[0]?.j||null;
}
function fillPartners(){
 const p=$('transactionInputPartner'); if(!p)return;
 const current=p.value;
 p.innerHTML='<option value="">Select beneficiary / partner…</option>'+masters.partners.map(x=>'<option value="'+x.id+'">'+esc(x.name||('Partner '+x.id))+'</option>').join('');
 if(current && masters.partners.some(x=>String(x.id)===String(current)))p.value=current;
}
function applyBeneficiaryRule(){
 const type=$('transactionInputType')?.value||'reimbursement';
 const role=$('transactionInputBeneficiaryRole')?.value||'employee';
 let rule=null;
 if(type==='reimbursement'){
   if(role==='employee') rule=masters.role_accounts?.employee;
   else if(role==='director') rule=masters.role_accounts?.director;
   else if(role==='vendor') rule=masters.role_accounts?.vendor;
 }
 if(type==='payment_request' && role==='vendor') rule=masters.role_accounts?.vendor;
 const credit=$('transactionInputCreditAccount');
 if(rule?.id && credit){credit.value=String(rule.id);credit.disabled=true;credit.title='Credit account is controlled by the beneficiary role/accounting rule.'}
 else if(credit){credit.disabled=false;credit.title='Select the credit account manually for this beneficiary role.'}
 updateRule();
 renderPreview();
}
function fillMasters(){
 const a=$('transactionInputDebitAccount'),c=$('transactionInputCreditAccount'),j=$('transactionInputJournal');
 if(!a||!c||!j)return;
 fillPartners();
 const opts='<option value="">Select Odoo account…</option>'+masters.accounts.map(x=>'<option value="'+x.id+'">'+esc(accountLabel(x))+'</option>').join('');
 a.innerHTML=opts;c.innerHTML=opts;
 j.innerHTML='<option value="">Selecting Odoo journal automatically…</option>';
 const selected=chooseAutomaticJournal();
 if(selected){
   j.value=String(selected.id);
   j.innerHTML='<option value="'+selected.id+'">'+esc((selected.code?selected.code+' — ':'')+selected.name)+'</option>';
   j.disabled=true;
   j.title='Journal is selected automatically from the Odoo journal configuration.';
 }else{
   j.innerHTML='<option value="">No suitable Odoo journal found</option>';
   j.disabled=true;
 }
 renderPreview();
}
function updateRule(){
 const type=$('transactionInputType')?.value||'reimbursement';
 const role=$('transactionInputBeneficiaryRole')?.value||'employee';
 let title='Payment Request — Expense / Asset → Payable / Clearing';
 let text='Debit the approved expense or asset account and credit the selected payable/clearing account.';
 if(type==='reimbursement'){
   const configured=role==='director'?masters.role_accounts?.director:role==='employee'?masters.role_accounts?.employee:role==='vendor'?masters.role_accounts?.vendor:null;
   const label=configured?accountLabel(configured):(role==='director'?'Hutang Direksi':role==='employee'?'Employee Liabilities':role==='vendor'?'Accounts Payable':'Configured Liability');
   title='Reimbursement — Expense → '+label;
   text='Debit the approved expense account and credit the liability account defined by the beneficiary role.';
 }
 if($('transactionInputRuleTitle'))$('transactionInputRuleTitle').textContent=title;
 if($('transactionInputRuleText'))$('transactionInputRuleText').textContent=text;
 renderPreview();
}
function renderPreview(){
 const amount=Number($('transactionInputAmount')?.value||0);
 const da=masters.accounts.find(x=>String(x.id)===$('transactionInputDebitAccount')?.value);
 const ca=masters.accounts.find(x=>String(x.id)===$('transactionInputCreditAccount')?.value);
 const j=masters.journals.find(x=>String(x.id)===$('transactionInputJournal')?.value);
 const box=$('transactionJournalPreview');if(!box)return;
 box.innerHTML='<div class="transaction-preview-head"><span>Draft Journal</span><b>'+money(amount)+'</b></div>'+
 '<div class="transaction-preview-line"><span>DR · '+esc(da?accountLabel(da):'Select debit account')+'</span><b>'+money(amount)+'</b></div>'+
 '<div class="transaction-preview-line"><span>CR · '+esc(ca?accountLabel(ca):'Select credit account')+'</span><b>'+money(amount)+'</b></div>'+
 '<div class="transaction-preview-meta">Journal: '+esc(j?((j.code?j.code+' — ':'')+j.name):'Select journal')+'</div>';
}
async function loadMasters(){
 try{
  const p=await callOdoo('?detail=masters');
  masters.accounts=p.accounts||[];
  masters.journals=p.journals||[];
  masters.partners=p.partners||[];
  masters.role_accounts=p.role_accounts||{};
  fillMasters();
  renderPreview();
  applyBeneficiaryRule();
  if(!masters.journals.length){
   const j=$('transactionInputJournal');
   if(j){j.innerHTML='<option value="">No Odoo general journal available</option>';j.disabled=true;j.title='Odoo returned no accessible general journal.'}
   throw new Error('Odoo returned no accessible general journal. Please check the Odoo Accounting Journals configuration and the integration user access.');
  }
  status('transactionInputStatus','Odoo masters loaded. Journal selected automatically.',true);
 }catch(e){
  const j=$('transactionInputJournal');
  if(j){j.innerHTML='<option value="">Unable to load Odoo journal</option>';j.disabled=true}
  status('transactionInputStatus',e?.message||String(e));
  throw e;
 }
}
async function loadRecent(){
 const body=$('transactionInputBody');if(!body)return;
 const {data,error}=await window.PILARK_CMS.client.from('odoo_transaction_inputs').select('*').order('created_at',{ascending:false}).limit(20);
 if(error){body.innerHTML='<tr><td colspan="8">Unable to load transaction inputs.</td></tr>';return}
 body.innerHTML=(data||[]).map(x=>{
  const canEdit=String(x.status||'').toLowerCase()==='posted'&&Number(x.odoo_move_id)>0;
  const action=canEdit?'<button type="button" class="accounting-small-btn transaction-edit-btn" data-edit-transaction="'+esc(x.id)+'">Edit & Correct</button>':'—';
  return '<tr><td>'+esc(x.transaction_date||'')+'</td><td>'+esc(x.input_type==='reimbursement'?'Reimbursement':'Payment Request')+'</td><td>'+esc(x.reference||'—')+'</td><td>'+esc(x.description||'—')+'</td><td class="num">'+money(x.amount)+'</td><td><span class="accounting-status-badge '+esc(x.status)+'">'+esc(x.status)+'</span></td><td>'+(x.odoo_move_id?esc(String(x.odoo_move_id)):'—')+'</td><td>'+action+'</td></tr>'
 }).join('')||'<tr><td colspan="8">No transaction inputs yet.</td></tr>';
 body.querySelectorAll('[data-edit-transaction]').forEach(btn=>btn.addEventListener('click',()=>editTransaction(btn.dataset.editTransaction)));
}
async function editTransaction(id){
 try{
  const {data,error}=await window.PILARK_CMS.client.from('odoo_transaction_inputs').select('*').eq('id',id).single();
  if(error)throw error;
  if(String(data.status).toLowerCase()!=='posted'||!Number(data.odoo_move_id))throw new Error('Only a posted transaction linked to an Odoo journal can be corrected here.');
  editingTransaction=data;currentDraftId=data.id;currentReceipt=null;
  $('transactionInputType').value=data.input_type||'reimbursement';
  $('transactionInputDate').value=data.transaction_date||iso(new Date());
  $('transactionInputAmount').value=Number(data.amount||0);
  $('transactionInputReference').value=data.reference||'';
  $('transactionInputDescription').value=data.description||'';
  $('transactionInputRequester').value=data.requester_name||'';
  $('transactionInputSubmitterRole').value=data.submitted_by_role||'employee';
  $('transactionInputBeneficiaryRole').value=data.beneficiary_role||'employee';
  fillMasters();
  $('transactionInputPartner').value=String(data.beneficiary_partner_id||data.partner_id||'');
  $('transactionInputDebitAccount').value=String(data.debit_account_id||'');
  $('transactionInputCreditAccount').disabled=false;
  $('transactionInputCreditAccount').value=String(data.credit_account_id||'');
  applyBeneficiaryRule();
  $('transactionInputCreditAccount').value=String(data.credit_account_id||masters.role_accounts?.[data.beneficiary_role]?.id||'');
  $('transactionInputForm').scrollIntoView({behavior:'smooth',block:'start'});
  $('transactionInputForm').classList.add('transaction-edit-mode');
  $('transactionSaveDraft').textContent='Cancel Edit';
  $('transactionPost').textContent='Save Changes & Repost →';
  $('transactionScanBtn').disabled=true;
  status('transactionInputStatus','Editing posted Odoo journal '+(data.odoo_move_id||'')+'. Correct the beneficiary role and account, then save to update Odoo.',true);
  status('transactionScanStatus','Edit mode: receipt scanning is disabled to avoid replacing the original evidence.');
 }catch(e){status('transactionInputStatus',e?.message||String(e))}
}
async function savePostedCorrection(){
 if(!editingTransaction)throw new Error('No posted transaction is currently being edited.');
 const type=$('transactionInputType').value,date=$('transactionInputDate').value,journalId=Number($('transactionInputJournal').value),amount=Number($('transactionInputAmount').value||0),debitId=Number($('transactionInputDebitAccount').value),creditId=Number($('transactionInputCreditAccount').value),role=$('transactionInputBeneficiaryRole').value,partnerId=Number($('transactionInputPartner').value||0);
 if(!date||!journalId||amount<=0||!debitId||!creditId||!partnerId)throw new Error('Please complete date, journal, amount, both accounts and beneficiary.');
 if(!confirm('This will temporarily reset Odoo journal '+(editingTransaction.odoo_move_id||'')+' to Draft, replace its accounting lines, and repost it. Continue?'))return;
 status('transactionInputStatus','Correcting Odoo journal…',true);
 $('transactionPost').disabled=true;$('transactionSaveDraft').disabled=true;
 try{
  const partner=masters.partners.find(x=>String(x.id)===String(partnerId));
  const lines=[
   {name:$('transactionInputDescription').value||'Expense',account_id:debitId,debit:amount,credit:0,partner_id:partnerId},
   {name:$('transactionInputDescription').value||'Settlement',account_id:creditId,debit:0,credit:amount,partner_id:partnerId}
  ];
  const result=await callOdoo('',{method:'POST',body:JSON.stringify({action:'correct_posted',move_id:Number(editingTransaction.odoo_move_id),expected_ref:editingTransaction.reference||'',expected_journal_id:Number(editingTransaction.journal_id||0),date,journal_id:journalId,reference:$('transactionInputReference').value,description:$('transactionInputDescription').value,lines})});
  const payload={input_type:type,status:'posted',transaction_date:date,reference:$('transactionInputReference').value||null,description:$('transactionInputDescription').value||null,requester_name:$('transactionInputRequester').value||null,partner_name:partner?.name||null,partner_id:partnerId,beneficiary_role:role,beneficiary_name:partner?.name||null,beneficiary_partner_id:partnerId,amount,currency_code:'IDR',journal_id:journalId,debit_account_id:debitId,credit_account_id:creditId,beneficiary_account_id:creditId,rule_code:type==='reimbursement'?('REIMBURSEMENT_'+role.toUpperCase()):('PAYMENT_REQUEST_'+role.toUpperCase()),rule_explanation:$('transactionInputRuleText').textContent,odoo_state:result.move?.state||'posted',error_message:null,posted_at:new Date().toISOString()};
  const upd=await window.PILARK_CMS.client.from('odoo_transaction_inputs').update(payload).eq('id',editingTransaction.id);
  if(upd.error)throw new Error('Odoo journal was corrected, but the CMS record update failed: '+upd.error.message+'. Please refresh and reconcile the CMS record.');
  await window.PILARK_CMS.client.from('odoo_transaction_input_lines').delete().eq('transaction_id',editingTransaction.id);
  const l=await window.PILARK_CMS.client.from('odoo_transaction_input_lines').insert([{transaction_id:editingTransaction.id,line_no:1,description:$('transactionInputDescription').value||'Expense',account_id:debitId,debit:amount,credit:0,partner_id:partnerId},{transaction_id:editingTransaction.id,line_no:2,description:$('transactionInputDescription').value||'Settlement',account_id:creditId,debit:0,credit:amount,partner_id:partnerId}]);
  if(l.error)throw new Error('Odoo was corrected, but CMS transaction lines did not update: '+l.error.message);
  status('transactionInputStatus','Correction posted successfully. Odoo journal '+(result.move?.name||editingTransaction.odoo_move_id)+' now uses '+accountLabel(masters.accounts.find(a=>String(a.id)===String(creditId))||{})+'.',true);
  editingTransaction=null;await loadRecent();resetForm();
 }finally{$('transactionPost').disabled=false;$('transactionSaveDraft').disabled=false}
}
async function uploadReceipt(){
 if(!currentReceipt)return null;
 const s=await session(),safe=currentReceipt.name.replace(/[^a-zA-Z0-9._-]/g,'_');
 const path='transaction-input/'+s.user.id+'/'+Date.now()+'-'+safe;
 const {error}=await window.PILARK_CMS.client.storage.from('accounting-ai').upload(path,currentReceipt,{upsert:false,contentType:currentReceipt.type||'image/jpeg'});
 if(error)throw error;return path
}
function fileToBase64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=reject;r.readAsDataURL(file)})}
function norm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9\\s_-]/g,' ')}
function scoreAccount(a,terms,preferredTypes=[]){
 const text=norm((a.code||'')+' '+(a.name||'')+' '+(a.account_type||''));
 let score=0;
 if(preferredTypes.includes(a.account_type))score+=35;
 for(const t of terms){if(text.includes(t))score+=10}
 return score;
}
function autoSelectAccountsFromReceipt(d){
 const type=$('transactionInputType')?.value||'reimbursement';
 const category=norm(d?.expense_category);
 const hint=norm(d?.accounting_hint);
 const description=norm(d?.description);
 const vendor=norm(d?.vendor_name);
 const hay=category+' '+hint+' '+description+' '+vendor;
 const rules=[
  {keys:['meals_entertainment','meal','food','dining','restaurant','entertainment','catering','lounge','makan','minum','jamuan','konsumsi'],terms:['food','meal','dining','restaurant','entertainment','catering','lounge','makan','minum','jamuan','konsumsi','entertainment'],types:['expense','expense_other']},
  {keys:['travel','transport','transportation'],terms:['travel','transport','perjalanan','transportasi','taxi','taksi','grab','gojek'],types:['expense','expense_other']},
  {keys:['hotel_accommodation','hotel','accommodation'],terms:['hotel','accommodation','penginapan','akomodasi'],types:['expense','expense_other']},
  {keys:['fuel_transport','fuel','petrol','gasoline'],terms:['fuel','petrol','gasoline','bbm','bensin','solar'],types:['expense','expense_other']},
  {keys:['office_supplies','office','stationery'],terms:['office','supplies','stationery','atk','alat tulis','perlengkapan kantor'],types:['expense','expense_other']},
  {keys:['utilities'],terms:['utility','utilities','electricity','water','internet','telecom','listrik','air','internet','telepon'],types:['expense','expense_other']},
  {keys:['professional_services'],terms:['professional','service','consulting','consultant','jasa','konsultan'],types:['expense','expense_other']},
  {keys:['project_expense'],terms:['project','construction','proyek','konstruksi'],types:['expense','expense_other']},
  {keys:['equipment'],terms:['equipment','asset','peralatan','mesin'],types:['asset_non_current','expense']}
 ];
 const rule=rules.find(r=>r.keys.some(k=>category.includes(k)))||rules.find(r=>r.terms.some(t=>hay.includes(t)));
 if(rule){
  const candidates=masters.accounts.map(a=>({a,score:scoreAccount(a,rule.terms,rule.types)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  if(candidates[0]&&candidates[0].score>=35)$('transactionInputDebitAccount').value=String(candidates[0].a.id);
 }
 const role=$('transactionInputBeneficiaryRole')?.value||'employee';
 const roleAccount=(type==='reimbursement' ? (role==='employee'?masters.role_accounts?.employee:role==='director'?masters.role_accounts?.director:role==='vendor'?masters.role_accounts?.vendor:null) : role==='vendor'?masters.role_accounts?.vendor:null);
 if(roleAccount?.id)$('transactionInputCreditAccount').value=String(roleAccount.id);
 const creditTerms=roleAccount?.id ? [] : (type==='reimbursement'
  ?['employee liabilities','employee liability','director liability','hutang direksi']
  :['accounts payable','vendor payable','supplier payable','clearing','payment']);
 const creditTypes=type==='reimbursement'?['liability_payable','liability_current']:['liability_payable','liability_current'];
 const creditCandidates=masters.accounts.map(a=>({a,score:scoreAccount(a,creditTerms,creditTypes)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
 if(!roleAccount?.id && creditCandidates[0]&&creditCandidates[0].score>=35)$('transactionInputCreditAccount').value=String(creditCandidates[0].a.id);
 applyBeneficiaryRule();
 renderPreview();
}
async function scanReceipt(){
 if(!currentReceipt){status('transactionScanStatus','Choose a receipt image first.');return}
 status('transactionScanStatus','Scanning receipt with AI…',true);$('transactionScanBtn').disabled=true;
 try{
  const s=await session(),data=await fileToBase64(currentReceipt);
  const res=await fetch(SCAN_FN,{method:'POST',headers:{Authorization:'Bearer '+s.access_token,apikey:window.PILARK_SUPABASE_CONFIG?.anonKey||'','Content-Type':'application/json'},body:JSON.stringify({image_base64:data,mime_type:currentReceipt.type||'image/jpeg'})});
  const p=await res.json().catch(()=>({}));if(!res.ok||!p.ok)throw new Error(p.error||'AI scan failed.');
  const d=p.data||{};
  if(d.document_date&&/^\d{4}-\d{2}-\d{2}$/.test(d.document_date))$('transactionInputDate').value=d.document_date;
  if(d.total_amount!=null)$('transactionInputAmount').value=Number(d.total_amount)||0;
  if(d.vendor_name && ($('transactionInputType')?.value==='payment_request' || $('transactionInputBeneficiaryRole')?.value==='vendor')){
    const hit=masters.partners.find(p=>norm(p.name)===norm(d.vendor_name)||norm(p.name).includes(norm(d.vendor_name))||norm(d.vendor_name).includes(norm(p.name)));
    if(hit)$('transactionInputPartner').value=String(hit.id);
  }
  if(d.document_number)$('transactionInputReference').value=d.document_number;
  if(d.description)$('transactionInputDescription').value=d.description;
  autoSelectAccountsFromReceipt(d);
  const category=d.expense_category||'other';
  status('transactionScanStatus','AI extracted the receipt and proposed the accounting accounts ('+category+'). Please review the proposed accounts before posting.',true);
  renderPreview();
 }catch(e){status('transactionScanStatus',e?.message||String(e))}
 finally{$('transactionScanBtn').disabled=false}
}
async function saveDraft(){
 const type=$('transactionInputType').value,date=$('transactionInputDate').value,journalId=Number($('transactionInputJournal').value),amount=Number($('transactionInputAmount').value||0),debitId=Number($('transactionInputDebitAccount').value),creditId=Number($('transactionInputCreditAccount').value),beneficiaryRole=$('transactionInputBeneficiaryRole').value,beneficiaryPartnerId=Number($('transactionInputPartner').value||0);
 if(!date||!journalId||!amount||!debitId||!creditId)throw new Error('Please complete date, journal, amount, debit account and credit account.');
 if(!beneficiaryPartnerId)throw new Error('Please select the beneficiary / partner.');
 const receiptPath=currentReceipt?await uploadReceipt():null;
 const s=await session();
 const partner=masters.partners.find(x=>String(x.id)===String(beneficiaryPartnerId));
 const payload={input_type:type,status:'draft',transaction_date:date,reference:$('transactionInputReference').value||null,description:$('transactionInputDescription').value||null,requester_name:$('transactionInputRequester').value||null,partner_name:partner?.name||null,amount,currency_code:'IDR',journal_id:journalId,debit_account_id:debitId,credit_account_id:creditId,rule_code:type==='reimbursement'?('REIMBURSEMENT_'+beneficiaryRole.toUpperCase()):('PAYMENT_REQUEST_'+beneficiaryRole.toUpperCase()),rule_explanation:$('transactionInputRuleText').textContent,receipt_path:receiptPath,receipt_name:currentReceipt?.name||null,created_by:s.user.id,submitted_by_name:s.user.user_metadata?.full_name||s.user.user_metadata?.name||s.user.email||null,submitted_by_role:$('transactionInputSubmitterRole').value,beneficiary_role:beneficiaryRole,beneficiary_name:partner?.name||null,beneficiary_partner_id:beneficiaryPartnerId,beneficiary_account_id:creditId};
 let q;
 if(currentDraftId)q=await window.PILARK_CMS.client.from('odoo_transaction_inputs').update(payload).eq('id',currentDraftId).select().single();
 else q=await window.PILARK_CMS.client.from('odoo_transaction_inputs').insert(payload).select().single();
 if(q.error)throw q.error;currentDraftId=q.data.id;
 await window.PILARK_CMS.client.from('odoo_transaction_input_lines').delete().eq('transaction_id',currentDraftId);
 const lines=[{transaction_id:currentDraftId,line_no:1,description:$('transactionInputDescription').value||'Expense',account_id:debitId,debit:amount,credit:0,partner_id:beneficiaryPartnerId},{transaction_id:currentDraftId,line_no:2,description:$('transactionInputDescription').value||'Settlement',account_id:creditId,debit:0,credit:amount,partner_id:beneficiaryPartnerId}];
 const l=await window.PILARK_CMS.client.from('odoo_transaction_input_lines').insert(lines);if(l.error)throw l.error;
 await loadRecent();return q.data
}
async function postTransaction(){
 if(editingTransaction){await savePostedCorrection();return}
 const saved=await saveDraft();
 let moveId=Number(saved?.odoo_move_id||0);
 if(!moveId){
  status('transactionInputStatus','Creating draft journal in Odoo…',true);
  const lines=[{name:$('transactionInputDescription').value||'Expense',account_id:Number($('transactionInputDebitAccount').value),debit:Number($('transactionInputAmount').value||0),credit:0,partner_id:Number($('transactionInputPartner').value||0)},{name:$('transactionInputDescription').value||'Settlement',account_id:Number($('transactionInputCreditAccount').value),debit:0,credit:Number($('transactionInputAmount').value||0),partner_id:Number($('transactionInputPartner').value||0)}];
  const created=await callOdoo('',{method:'POST',body:JSON.stringify({action:'create_draft',date:$('transactionInputDate').value,journal_id:Number($('transactionInputJournal').value),reference:$('transactionInputReference').value,description:$('transactionInputDescription').value,lines})});
  moveId=Number(created.move?.id||0);if(!moveId)throw new Error('Odoo draft journal was not created.');
  await window.PILARK_CMS.client.from('odoo_transaction_inputs').update({status:'reviewed',odoo_move_id:moveId,odoo_state:created.move?.state||'draft',reviewed_by:(await session()).user.id,approved_at:new Date().toISOString()}).eq('id',currentDraftId);
 }
 if(!confirm('The reviewed journal is balanced and ready to post to Odoo. Continue posting?')){status('transactionInputStatus','Odoo draft created. Posting was cancelled.');await loadRecent();return}
 const posted=await callOdoo('',{method:'POST',body:JSON.stringify({action:'post',move_id:moveId})});
 await window.PILARK_CMS.client.from('odoo_transaction_inputs').update({status:'posted',odoo_state:posted.move?.state||'posted',posted_at:new Date().toISOString()}).eq('id',currentDraftId);
 status('transactionInputStatus','Posted successfully to Odoo. Journal ID '+moveId+'.',true);await loadRecent();setTimeout(resetForm,350);
}
function resetForm(){
 $('transactionInputForm').reset();currentReceipt=null;currentDraftId=null;editingTransaction=null;
 $('transactionInputForm').classList.remove('transaction-edit-mode');$('transactionSaveDraft').textContent='Save Draft';$('transactionPost').textContent='Post to Odoo →';$('transactionScanBtn').disabled=false; $('transactionInputPartner').innerHTML='<option value="">Select beneficiary / partner…</option>'; $('transactionInputRequester').value='';
 const now=new Date();$('transactionInputDate').value=iso(now);$('transactionReceiptName').textContent='No file selected';
 fillMasters();updateRule();status('transactionScanStatus','');status('transactionInputStatus','');
}
async function init(){
 if(initialized){await loadRecent();return}initialized=true;
 $('transactionInputDate').value=iso(new Date());
 $('transactionInputType').addEventListener('change',()=>{
   const role=$('transactionInputBeneficiaryRole');
   if(role){
     if($('transactionInputType').value==='payment_request' && role.value!=='vendor')role.value='vendor';
     if($('transactionInputType').value==='reimbursement' && role.value==='vendor')role.value='employee';
   }
   updateRule();fillMasters();applyBeneficiaryRule()
 });
 $('transactionInputBeneficiaryRole').addEventListener('change',()=>{applyBeneficiaryRule()});
 $('transactionInputSubmitterRole').addEventListener('change',()=>{updateRule()});
 ['transactionInputAmount','transactionInputDebitAccount','transactionInputCreditAccount','transactionInputJournal'].forEach(id=>$(id)?.addEventListener('input',renderPreview));
 $('transactionReceipt').addEventListener('change',e=>{currentReceipt=e.target.files?.[0]||null;$('transactionReceiptName').textContent=currentReceipt?.name||'No file selected'});
 $('transactionScanBtn').addEventListener('click',scanReceipt);
 $('transactionSaveDraft').addEventListener('click',async()=>{if(editingTransaction){resetForm();status('transactionInputStatus','Edit cancelled. No changes were made.',true);await loadRecent();return}try{await saveDraft();status('transactionInputStatus','Draft saved.',true)}catch(e){status('transactionInputStatus',e?.message||String(e))}});
 $('transactionInputForm').addEventListener('submit',async e=>{e.preventDefault();try{await postTransaction()}catch(err){status('transactionInputStatus',err?.message||String(err));if(currentDraftId)await window.PILARK_CMS.client.from('odoo_transaction_inputs').update({status:'error',error_message:err?.message||String(err)}).eq('id',currentDraftId);await loadRecent()}});
 $('transactionInputRefresh').addEventListener('click',async()=>{await loadMasters();await loadRecent()});
 const me=await session(); $('transactionInputRequester').value=me.user.user_metadata?.full_name||me.user.user_metadata?.name||me.user.email||''; await loadMasters();await loadRecent();updateRule();applyBeneficiaryRule();
}
window.initTransactionInput=init;
window.transactionInputRefresh=async()=>{await loadMasters();await loadRecent()};
window.addEventListener('pilark:refresh-view',e=>{if(e.detail?.view==='transaction-input')init().then(()=>e.detail?.done?.()).catch(err=>e.detail?.done?.(err))});
})();