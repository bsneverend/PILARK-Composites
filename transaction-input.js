(function(){
const ODOO_FN='https://seelqcgjfuuwurslwtgf.supabase.co/functions/v1/odoo-transaction-input';
const SCAN_FN='https://seelqcgjfuuwurslwtgf.supabase.co/functions/v1/odoo-receipt-scan';
let initialized=false,masters={accounts:[],journals:[],partners:[],employees:[],expense_products:[],role_accounts:{}},currentReceipt=null,currentDraftId=null,editingTransaction=null;

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
function fillExpenseMasters(){
 const e=$('transactionInputEmployee'),p=$('transactionInputProduct');
 if(e){
  const current=e.value;
  e.innerHTML='<option value="">Select Odoo employee…</option>'+masters.employees.map(x=>'<option value="'+x.id+'">'+esc(x.name||('Employee '+x.id))+'</option>').join('');
  if(current && masters.employees.some(x=>String(x.id)===String(current)))e.value=current;
 }
 if(p){
  const current=p.value;
  p.innerHTML='<option value="">Select Odoo expense category…</option>'+masters.expense_products.map(x=>'<option value="'+x.id+'">'+esc((x.default_code?x.default_code+' — ':'')+(x.name||('Expense '+x.id)))+'</option>').join('');
  if(current && masters.expense_products.some(x=>String(x.id)===String(current)))p.value=current;
 }
}
function applyBeneficiaryRule(){
 const type=$('transactionInputType')?.value||'reimbursement';
 const role=$('transactionInputBeneficiaryRole')?.value||'employee';
 const title=role==='director'?'Reimbursement — Director Expense':role==='vendor'?'Vendor / Supplier — Odoo Expenses requires an employee':'Reimbursement — Employee Expense';
 if($('transactionInputRuleTitle'))$('transactionInputRuleTitle').textContent=title;
 if($('transactionInputRuleText'))$('transactionInputRuleText').textContent=role==='vendor'
  ?'Odoo Expenses is employee-based. Vendor / supplier payments should use the Purchase / Vendor Bill workflow instead.'
  :'PILARK CMS sends the expense to Odoo Expenses. Approval, accounting posting and reimbursement remain under the Odoo workflow.';
 renderPreview();
}
function fillMasters(){
 const a=$('transactionInputDebitAccount'),cr=$('transactionInputCreditAccount'),j=$('transactionInputJournal');
 fillPartners();fillExpenseMasters();
 if(a&&cr&&j){
  const opts='<option value="">Select Odoo account…</option>'+masters.accounts.map(x=>'<option value="'+x.id+'">'+esc(accountLabel(x))+'</option>').join('');
  a.innerHTML=opts;cr.innerHTML=opts;
  j.innerHTML='<option value="">Selecting Odoo journal automatically…</option>';
  const selected=chooseAutomaticJournal();
  if(selected){j.value=String(selected.id);j.innerHTML='<option value="'+selected.id+'">'+esc((selected.code?selected.code+' — ':'')+selected.name)+'</option>';j.disabled=true;}
 }
 applyBeneficiaryRule();renderPreview();
}
function updateRule(){applyBeneficiaryRule()}
function renderPreview(){
 const amount=Number($('transactionInputAmount')?.value||0);
 const e=masters.employees.find(x=>String(x.id)===$('transactionInputEmployee')?.value);
 const p=masters.expense_products.find(x=>String(x.id)===$('transactionInputProduct')?.value);
 const box=$('transactionJournalPreview');if(!box)return;
 box.innerHTML='<div class="transaction-preview-head"><span>Odoo Expense</span><b>'+money(amount)+'</b></div>'+
 '<div class="transaction-preview-line"><span>Employee</span><b>'+esc(e?.name||'Select employee')+'</b></div>'+
 '<div class="transaction-preview-line"><span>Category</span><b>'+esc(p?((p.default_code?p.default_code+' — ':'')+p.name):'Select expense category')+'</b></div>'+
 '<div class="transaction-preview-meta">Status after send: Submitted / Waiting Approval in Odoo (if the Odoo API user has submit permission).</div>';
}
async function loadMasters(){
 let expenseLoaded=false;
 try{
  // Expense masters are the critical data for the new workflow.
  // Load them independently so a legacy accounting-master permission/error
  // cannot make the Employee and Expense Category fields appear broken.
  const em=await callOdoo('',{method:'POST',body:JSON.stringify({action:'expense_masters'})});
  masters.employees=em.employees||[];
  masters.expense_products=em.expense_products||[];
  fillExpenseMasters();
  renderPreview();
  if(!masters.employees.length)throw new Error('Odoo returned no active employees. Please configure employees in Odoo Expenses.');
  if(!masters.expense_products.length)throw new Error('Odoo returned no expense categories. Please enable at least one product for Expenses in Odoo.');
  expenseLoaded=true;
  status('transactionInputStatus','Odoo Expenses employees and categories loaded.',true);
 }catch(e){
  const p=$('transactionInputProduct'),em=$('transactionInputEmployee');
  if(p)p.innerHTML='<option value="">Unable to load Odoo expense categories</option>';
  if(em)em.innerHTML='<option value="">Unable to load Odoo employees</option>';
  status('transactionInputStatus',e?.message||String(e));
 }
 // Legacy masters are only needed for historical journal correction.
 // Do not let them block the new Odoo Expenses workflow.
 try{
  const p=await callOdoo('?detail=masters');
  masters.accounts=p.accounts||[];masters.journals=p.journals||[];masters.partners=p.partners||[];
  masters.role_accounts=p.role_accounts||{};
  fillPartners();
  if(expenseLoaded)fillExpenseMasters();
  applyBeneficiaryRule();renderPreview();
 }catch(e){
  if(expenseLoaded)status('transactionInputStatus','Odoo Expenses employees and categories loaded. Legacy journal masters are unavailable; historical journal correction may be unavailable until permissions are fixed.',true);
 }
}
async function loadRecent(){
 const body=$('transactionInputBody');if(!body)return;
 const {data,error}=await window.PILARK_CMS.client.from('odoo_transaction_inputs').select('*').order('created_at',{ascending:false}).limit(20);
 if(error){body.innerHTML='<tr><td colspan="8">Unable to load transaction inputs.</td></tr>';return}
 body.innerHTML=(data||[]).map(x=>{
  const canEdit=String(x.status||'').toLowerCase()==='posted'&&Number(x.odoo_move_id)>0&&!Number(x.odoo_expense_id);
  const action=canEdit?'<button type="button" class="accounting-small-btn transaction-edit-btn" data-edit-transaction="'+esc(x.id)+'">Edit & Correct</button>':Number(x.odoo_expense_id)?'<span class="field-help">Managed in Odoo</span>':'—';
  return '<tr><td>'+esc(x.transaction_date||'')+'</td><td>'+esc(x.input_type==='reimbursement'?'Reimbursement':'Payment Request')+'</td><td>'+esc(x.reference||'—')+'</td><td>'+esc(x.description||'—')+'</td><td class="num">'+money(x.amount)+'</td><td><span class="accounting-status-badge '+esc(x.status)+'">'+esc(x.status)+'</span></td><td>'+(x.odoo_expense_id?'Expense #'+esc(String(x.odoo_expense_id)):(x.odoo_move_id?'Journal #'+esc(String(x.odoo_move_id)):'—'))+'</td><td>'+action+'</td></tr>'
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
  const savedPartnerId=data.beneficiary_partner_id||data.partner_id||'';const savedPartnerName=data.beneficiary_name||data.partner_name||'';const matchedPartner=masters.partners.find(p=>savedPartnerId&&String(p.id)===String(savedPartnerId))||masters.partners.find(p=>norm(p.name)===norm(savedPartnerName))||masters.partners.find(p=>savedPartnerName&&(norm(p.name).includes(norm(savedPartnerName))||norm(savedPartnerName).includes(norm(p.name))));
  $('transactionInputPartner').value=matchedPartner?String(matchedPartner.id):'';
  $('transactionInputDebitAccount').value=String(data.debit_account_id||'');
  $('transactionInputCreditAccount').disabled=false;
  $('transactionInputCreditAccount').value=String(data.credit_account_id||'');
  applyBeneficiaryRule();
  // Keep the credit account selected by the beneficiary-role rule.
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
 const category=norm(d?.expense_category),hint=norm(d?.accounting_hint),description=norm(d?.description),vendor=norm(d?.vendor_name);
 const hay=category+' '+hint+' '+description+' '+vendor;
 const terms=[
  ['meal','food','dining','restaurant','entertainment','catering','lounge','makan','minum','jamuan','konsumsi'],
  ['travel','transport','perjalanan','transportasi','taxi','taksi','grab','gojek'],
  ['hotel','accommodation','penginapan','akomodasi'],
  ['fuel','petrol','gasoline','bbm','bensin','solar'],
  ['office','supplies','stationery','atk','alat tulis','perlengkapan kantor'],
  ['utility','utilities','electricity','water','internet','telecom','listrik','air','telepon'],
  ['professional','service','consulting','consultant','jasa','konsultan']
 ];
 const hit=masters.expense_products.find(p=>terms.some(group=>group.some(t=>norm(p.name).includes(t))&&group.some(t=>hay.includes(t))));
 if(hit)$('transactionInputProduct').value=String(hit.id);
 const vendorName=d?.vendor_name||'';
 if(vendorName){
  const partner=masters.partners.find(p=>norm(p.name)===norm(vendorName)||norm(p.name).includes(norm(vendorName))||norm(vendorName).includes(norm(p.name)));
  if(partner)$('transactionInputPartner').value=String(partner.id);
 }
 syncEmployeeFromPartner();applyBeneficiaryRule();renderPreview();
}
function syncEmployeeFromPartner(){
 const partnerId=$('transactionInputPartner')?.value||'';
 const partner=masters.partners.find(p=>String(p.id)===String(partnerId));
 if(!partner)return;
 const hit=masters.employees.find(e=>norm(e.name)===norm(partner.name)||norm(e.name).includes(norm(partner.name))||norm(partner.name).includes(norm(e.name)));
 if(hit)$('transactionInputEmployee').value=String(hit.id);
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
  status('transactionScanStatus','AI extracted the receipt and proposed the Odoo expense category ('+category+'). Please review the expense details before sending to Odoo.',true);
  renderPreview();
 }catch(e){status('transactionScanStatus',e?.message||String(e))}
 finally{$('transactionScanBtn').disabled=false}
}
async function saveDraft(){
 const type=$('transactionInputType').value,date=$('transactionInputDate').value,amount=Number($('transactionInputAmount').value||0),beneficiaryRole=$('transactionInputBeneficiaryRole').value,beneficiaryPartnerId=Number($('transactionInputPartner').value||0),employeeId=Number($('transactionInputEmployee').value||0),productId=Number($('transactionInputProduct').value||0);
 if(!date||!amount||!employeeId||!productId)throw new Error('Please complete date, Odoo employee, expense category and amount.');
 if(!beneficiaryPartnerId)throw new Error('Please select the beneficiary / partner.');
 if(beneficiaryRole==='vendor')throw new Error('Vendor / supplier payments should be handled through Odoo Purchase / Vendor Bills, not Expenses.');
 const receiptPath=currentReceipt?await uploadReceipt():null;
 const s=await session(),partner=masters.partners.find(x=>String(x.id)===String(beneficiaryPartnerId)),employee=masters.employees.find(x=>String(x.id)===String(employeeId));
 const payload={input_type:type,status:'draft',transaction_date:date,reference:$('transactionInputReference').value||null,description:$('transactionInputDescription').value||null,requester_name:$('transactionInputRequester').value||null,partner_name:partner?.name||null,partner_id:beneficiaryPartnerId,amount,currency_code:'IDR',journal_id:null,debit_account_id:null,credit_account_id:null,rule_code:'ODOO_EXPENSE_'+beneficiaryRole.toUpperCase(),rule_explanation:$('transactionInputRuleText').textContent,receipt_path:receiptPath,receipt_name:currentReceipt?.name||null,created_by:s.user.id,submitted_by_name:s.user.user_metadata?.full_name||s.user.user_metadata?.name||s.user.email||null,submitted_by_role:$('transactionInputSubmitterRole').value,beneficiary_role:beneficiaryRole,beneficiary_name:partner?.name||null,beneficiary_partner_id:beneficiaryPartnerId,beneficiary_account_id:null,expense_product_id:productId,expense_employee_id:employeeId};
 let q;
 if(currentDraftId)q=await window.PILARK_CMS.client.from('odoo_transaction_inputs').update(payload).eq('id',currentDraftId).select().single();
 else q=await window.PILARK_CMS.client.from('odoo_transaction_inputs').insert(payload).select().single();
 if(q.error)throw q.error;currentDraftId=q.data.id;
 await loadRecent();return q.data
}
async function postTransaction(){
 if(editingTransaction){await savePostedCorrection();return}
 const saved=await saveDraft();
 const employeeId=Number($('transactionInputEmployee').value||0),productId=Number($('transactionInputProduct').value||0),amount=Number($('transactionInputAmount').value||0);
 if(!employeeId||!productId||amount<=0)throw new Error('Please select an Odoo employee, expense category and valid amount.');
 status('transactionInputStatus','Sending expense to Odoo Expenses…',true);
 $('transactionPost').disabled=true;$('transactionSaveDraft').disabled=true;
 try{
  const attachment=currentReceipt?await fileToBase64(currentReceipt):null;
  const created=await callOdoo('',{method:'POST',body:JSON.stringify({
   action:'create_expense',
   date:$('transactionInputDate').value,
   employee_id:employeeId,
   product_id:productId,
   amount,
   reference:$('transactionInputReference').value,
   name:$('transactionInputDescription').value||'Expense',
   description:$('transactionInputDescription').value,
   attachment_base64:attachment,
   attachment_name:currentReceipt?.name||'Receipt',
   attachment_mime:currentReceipt?.type||'application/octet-stream'
  })});
  const submitted=!!created.submitted,expense=created.expense||{};
  const upd=await window.PILARK_CMS.client.from('odoo_transaction_inputs').update({
   status:submitted?'submitted':'draft',
   odoo_expense_id:Number(expense.id||0)||null,
   odoo_expense_state:expense.state||null,
   odoo_state:expense.state||null,
   error_message:created.warning||null,
   posted_at:null
  }).eq('id',currentDraftId);
  if(upd.error)throw new Error('Odoo Expense was created, but the CMS record update failed: '+upd.error.message);
  if(submitted){
   status('transactionInputStatus','Sent to Odoo Expenses successfully. Expense '+(expense.id||'')+' is now in '+(expense.state||'Submitted')+' status. Approval, posting and reimbursement continue in Odoo.',true);
  }else{
   status('transactionInputStatus','Expense was created in Odoo as Draft. Odoo could not submit it automatically: '+(created.warning||'Please submit it from Expenses.' ));
  }
  await loadRecent();setTimeout(resetForm,700);
 }finally{$('transactionPost').disabled=false;$('transactionSaveDraft').disabled=false}
}
function resetForm(){
 $('transactionInputForm').reset();currentReceipt=null;currentDraftId=null;editingTransaction=null;
 $('transactionInputForm').classList.remove('transaction-edit-mode');$('transactionSaveDraft').textContent='Save Draft';$('transactionPost').textContent='Send to Odoo Expenses →';$('transactionScanBtn').disabled=false; $('transactionInputPartner').innerHTML='<option value="">Select beneficiary / partner…</option>'; $('transactionInputRequester').value='';
 const now=new Date();$('transactionInputDate').value=iso(now);$('transactionReceiptName').textContent='No file selected';
 fillMasters();updateRule();status('transactionScanStatus','');status('transactionInputStatus','');
}
async function init(){
 if(initialized){await loadRecent();return}initialized=true;
 $('transactionInputDate').value=iso(new Date());
 $('transactionInputPartner').addEventListener('change',()=>{syncEmployeeFromPartner();renderPreview()});
 $('transactionInputEmployee').addEventListener('change',()=>{renderPreview()});
 $('transactionInputProduct').addEventListener('change',()=>{renderPreview()});
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
 ['transactionInputAmount','transactionInputReference','transactionInputDescription'].forEach(id=>$(id)?.addEventListener('input',renderPreview));
 $('transactionReceipt').addEventListener('change',e=>{currentReceipt=e.target.files?.[0]||null;$('transactionReceiptName').textContent=currentReceipt?.name||'No file selected'});
 $('transactionScanBtn').addEventListener('click',scanReceipt);
 $('transactionSaveDraft').addEventListener('click',async()=>{if(editingTransaction){resetForm();status('transactionInputStatus','Edit cancelled. No changes were made.',true);await loadRecent();return}try{await saveDraft();status('transactionInputStatus','Draft saved.',true)}catch(e){status('transactionInputStatus',e?.message||String(e))}});
 $('transactionInputForm').addEventListener('submit',async e=>{e.preventDefault();try{await postTransaction()}catch(err){status('transactionInputStatus',err?.message||String(err));if(currentDraftId&&!editingTransaction)await window.PILARK_CMS.client.from('odoo_transaction_inputs').update({status:'error',error_message:err?.message||String(err)}).eq('id',currentDraftId);else if(editingTransaction&&/may now be in Draft|not posted/i.test(err?.message||String(err)))await window.PILARK_CMS.client.from('odoo_transaction_inputs').update({status:'error',odoo_state:'draft',error_message:err?.message||String(err)}).eq('id',currentDraftId);await loadRecent()}});
 $('transactionInputRefresh').addEventListener('click',async()=>{await loadMasters();await loadRecent()});
 const me=await session(); $('transactionInputRequester').value=me.user.user_metadata?.full_name||me.user.user_metadata?.name||me.user.email||''; await loadMasters();await loadRecent();updateRule();applyBeneficiaryRule();
}
window.initTransactionInput=init;
window.transactionInputRefresh=async()=>{await loadMasters();await loadRecent()};
window.addEventListener('pilark:refresh-view',e=>{if(e.detail?.view==='transaction-input')init().then(()=>e.detail?.done?.()).catch(err=>e.detail?.done?.(err))});
})();