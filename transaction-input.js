(function(){
const ODOO_FN='https://seelqcgjfuuwurslwtgf.supabase.co/functions/v1/odoo-transaction-input';
const SCAN_FN='https://seelqcgjfuuwurslwtgf.supabase.co/functions/v1/odoo-receipt-scan';
let initialized=false,masters={accounts:[],journals:[]},currentReceipt=null,currentDraftId=null;

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
function fillMasters(){
 const a=$('transactionInputDebitAccount'),c=$('transactionInputCreditAccount'),j=$('transactionInputJournal');
 if(!a||!c||!j)return;
 const opts='<option value="">Select Odoo account…</option>'+masters.accounts.map(x=>'<option value="'+x.id+'">'+esc(accountLabel(x))+'</option>').join('');
 a.innerHTML=opts;c.innerHTML=opts;
 j.innerHTML='<option value="">Select Odoo journal…</option>'+masters.journals.map(x=>'<option value="'+x.id+'">'+esc((x.code?x.code+' — ':'')+x.name)+'</option>').join('');
 const general=masters.journals.find(x=>x.type==='general');if(general)j.value=String(general.id);
}
function updateRule(){
 const type=$('transactionInputType')?.value||'reimbursement';
 const title=type==='reimbursement'?'Reimbursement — Expense → Employee Payable':'Payment Request — Expense / Asset → Payable / Clearing';
 const text=type==='reimbursement'?'Debit the approved expense account and credit the employee/payable account.':'Debit the approved expense or asset account and credit the selected payable/clearing account.';
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
 const p=await callOdoo('?detail=masters');masters.accounts=p.accounts||[];masters.journals=p.journals||[];fillMasters();renderPreview()
}
async function loadRecent(){
 const body=$('transactionInputBody');if(!body)return;
 const {data,error}=await window.PILARK_CMS.client.from('odoo_transaction_inputs').select('*').order('created_at',{ascending:false}).limit(20);
 if(error){body.innerHTML='<tr><td colspan="7">Unable to load transaction inputs.</td></tr>';return}
 body.innerHTML=(data||[]).map(x=>'<tr><td>'+esc(x.transaction_date||'')+'</td><td>'+esc(x.input_type==='reimbursement'?'Reimbursement':'Payment Request')+'</td><td>'+esc(x.reference||'—')+'</td><td>'+esc(x.description||'—')+'</td><td class="num">'+money(x.amount)+'</td><td><span class="accounting-status-badge '+esc(x.status)+'">'+esc(x.status)+'</span></td><td>'+(x.odoo_move_id?esc(String(x.odoo_move_id)):'—')+'</td></tr>').join('')||'<tr><td colspan="7">No transaction inputs yet.</td></tr>'
}
async function uploadReceipt(){
 if(!currentReceipt)return null;
 const s=await session(),safe=currentReceipt.name.replace(/[^a-zA-Z0-9._-]/g,'_');
 const path='transaction-input/'+s.user.id+'/'+Date.now()+'-'+safe;
 const {error}=await window.PILARK_CMS.client.storage.from('accounting-ai').upload(path,currentReceipt,{upsert:false,contentType:currentReceipt.type||'image/jpeg'});
 if(error)throw error;return path
}
function fileToBase64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=reject;r.readAsDataURL(file)})}
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
  if(d.vendor_name)$('transactionInputPartner').value=d.vendor_name;
  if(d.document_number)$('transactionInputReference').value=d.document_number;
  if(d.description)$('transactionInputDescription').value=d.description;
  status('transactionScanStatus','AI extracted the receipt. Please review the amount, description and accounts before posting.',true);
  renderPreview();
 }catch(e){status('transactionScanStatus',e?.message||String(e))}
 finally{$('transactionScanBtn').disabled=false}
}
async function saveDraft(){
 const type=$('transactionInputType').value,date=$('transactionInputDate').value,journalId=Number($('transactionInputJournal').value),amount=Number($('transactionInputAmount').value||0),debitId=Number($('transactionInputDebitAccount').value),creditId=Number($('transactionInputCreditAccount').value);
 if(!date||!journalId||!amount||!debitId||!creditId)throw new Error('Please complete date, journal, amount, debit account and credit account.');
 const receiptPath=currentReceipt?await uploadReceipt():null;
 const s=await session();
 const payload={input_type:type,status:'draft',transaction_date:date,reference:$('transactionInputReference').value||null,description:$('transactionInputDescription').value||null,requester_name:$('transactionInputRequester').value||null,partner_name:$('transactionInputPartner').value||null,amount,currency_code:'IDR',journal_id:journalId,debit_account_id:debitId,credit_account_id:creditId,rule_code:type==='reimbursement'?'REIMBURSEMENT_EXPENSE_PAYABLE':'PAYMENT_REQUEST_EXPENSE_PAYABLE',rule_explanation:$('transactionInputRuleText').textContent,receipt_path:receiptPath,receipt_name:currentReceipt?.name||null,created_by:s.user.id};
 let q;
 if(currentDraftId)q=await window.PILARK_CMS.client.from('odoo_transaction_inputs').update(payload).eq('id',currentDraftId).select().single();
 else q=await window.PILARK_CMS.client.from('odoo_transaction_inputs').insert(payload).select().single();
 if(q.error)throw q.error;currentDraftId=q.data.id;
 await window.PILARK_CMS.client.from('odoo_transaction_input_lines').delete().eq('transaction_id',currentDraftId);
 const lines=[{transaction_id:currentDraftId,line_no:1,description:$('transactionInputDescription').value||'Expense',account_id:debitId,debit:amount,credit:0},{transaction_id:currentDraftId,line_no:2,description:$('transactionInputDescription').value||'Settlement',account_id:creditId,debit:0,credit:amount}];
 const l=await window.PILARK_CMS.client.from('odoo_transaction_input_lines').insert(lines);if(l.error)throw l.error;
 await loadRecent();return q.data
}
async function postTransaction(){
 const saved=await saveDraft();
 let moveId=Number(saved?.odoo_move_id||0);
 if(!moveId){
  status('transactionInputStatus','Creating draft journal in Odoo…',true);
  const lines=[{name:$('transactionInputDescription').value||'Expense',account_id:Number($('transactionInputDebitAccount').value),debit:Number($('transactionInputAmount').value||0),credit:0},{name:$('transactionInputDescription').value||'Settlement',account_id:Number($('transactionInputCreditAccount').value),debit:0,credit:Number($('transactionInputAmount').value||0)}];
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
 $('transactionInputForm').reset();currentReceipt=null;currentDraftId=null;
 const now=new Date();$('transactionInputDate').value=iso(now);$('transactionReceiptName').textContent='No file selected';
 fillMasters();updateRule();status('transactionScanStatus','');status('transactionInputStatus','');
}
async function init(){
 if(initialized){await loadRecent();return}initialized=true;
 $('transactionInputDate').value=iso(new Date());
 $('transactionInputType').addEventListener('change',updateRule);
 ['transactionInputAmount','transactionInputDebitAccount','transactionInputCreditAccount','transactionInputJournal'].forEach(id=>$(id)?.addEventListener('input',renderPreview));
 $('transactionReceipt').addEventListener('change',e=>{currentReceipt=e.target.files?.[0]||null;$('transactionReceiptName').textContent=currentReceipt?.name||'No file selected'});
 $('transactionScanBtn').addEventListener('click',scanReceipt);
 $('transactionSaveDraft').addEventListener('click',async()=>{try{await saveDraft();status('transactionInputStatus','Draft saved.',true)}catch(e){status('transactionInputStatus',e?.message||String(e))}});
 $('transactionInputForm').addEventListener('submit',async e=>{e.preventDefault();try{await postTransaction()}catch(err){status('transactionInputStatus',err?.message||String(err));if(currentDraftId)await window.PILARK_CMS.client.from('odoo_transaction_inputs').update({status:'error',error_message:err?.message||String(err)}).eq('id',currentDraftId);await loadRecent()}});
 $('transactionInputRefresh').addEventListener('click',async()=>{await loadMasters();await loadRecent()});
 await loadMasters();await loadRecent();updateRule();
}
window.initTransactionInput=init;
window.transactionInputRefresh=async()=>{await loadMasters();await loadRecent()};
window.addEventListener('pilark:refresh-view',e=>{if(e.detail?.view==='transaction-input')init().then(()=>e.detail?.done?.()).catch(err=>e.detail?.done?.(err))});
})();