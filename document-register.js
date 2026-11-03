(function(){
 const $=id=>document.getElementById(id);
 const client=()=>window.PILARK_CMS?.client;
 const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>'Rp'+Number(v||0).toLocaleString('id-ID',{maximumFractionDigits:2});
 let records=[];
 const statusLabel=s=>String(s||'Draft').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
 async function load(){
  const db=client();if(!db)return;
  $('documentRegisterBody').innerHTML='<tr><td colspan="8" class="accounting-empty">Loading register…</td></tr>';
  const [q,l]=await Promise.all([
   db.from('sales_quotations').select('*,accounting_partners(name,email)').order('quotation_date',{ascending:false}).limit(1000),
   db.from('company_letters').select('*').order('letter_date',{ascending:false}).limit(1000)
  ]);
  if(q.error||l.error){$('documentRegisterBody').innerHTML='<tr><td colspan="8" class="accounting-empty">Unable to load register: '+esc(q.error?.message||l.error?.message)+'</td></tr>';return;}
  records=[
   ...(q.data||[]).map(x=>({kind:'quotation',id:x.id,no:x.quotation_no,date:x.quotation_date,party:x.accounting_partners?.name||'—',subject:x.project_name||x.reference||'—',amount:x.total_amount,status:x.status||'draft',data:x})),
   ...(l.data||[]).map(x=>({kind:'letter',id:x.id,no:x.letter_no,date:x.letter_date,party:[x.recipient_name,x.recipient_company].filter(Boolean).join(' · ')||'—',subject:x.subject,amount:null,status:x.status||'draft',data:x}))
  ].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(a.no).localeCompare(String(b.no)));
  const statuses=[...new Set(records.map(x=>x.status))].sort();
  $('documentRegisterStatus').innerHTML='<option value="all">All statuses</option>'+statuses.map(s=>'<option value="'+esc(s)+'">'+esc(statusLabel(s))+'</option>').join('');
  render();
 }
 function render(){
  const term=$('documentRegisterSearch').value.trim().toLowerCase(),type=$('documentRegisterType').value,status=$('documentRegisterStatus').value;
  const rows=records.filter(r=>(type==='all'||r.kind===type)&&(status==='all'||r.status===status)&&(!term||[r.no,r.party,r.subject,r.status,r.kind].join(' ').toLowerCase().includes(term)));
  $('documentRegisterBody').innerHTML=rows.map(r=>'<tr><td><span class="document-type-pill">'+(r.kind==='quotation'?'Quotation':'Company Letter')+'</span></td><td><b>'+esc(r.no)+'</b></td><td>'+esc(r.date)+'</td><td>'+esc(r.party)+'</td><td>'+esc(r.subject)+'</td><td class="num">'+(r.amount==null?'—':money(r.amount))+'</td><td><span class="sales-status">'+esc(statusLabel(r.status))+'</span></td><td><button type="button" class="accounting-small-btn" data-document-id="'+esc(r.id)+'" data-document-kind="'+r.kind+'">View details</button></td></tr>').join('')||'<tr><td colspan="8" class="accounting-empty">No documents match your filters.</td></tr>';
  $('documentRegisterBody').querySelectorAll('[data-document-id]').forEach(b=>b.onclick=()=>details(b.dataset.documentKind,b.dataset.documentId));
 }
 async function details(kind,id){
  const r=records.find(x=>x.kind===kind&&x.id===id);if(!r)return;
  const d=r.data;let html='';
  const field=(k,v)=>'<div class="document-detail-field"><small>'+esc(k)+'</small><b>'+esc(v||'—')+'</b></div>';
  if(kind==='quotation'){
   const {data:lines,error}=await client().from('sales_quotation_lines').select('*').eq('quotation_id',id).order('line_no');
   html='<div class="document-detail-grid">'+field('Quotation Number',d.quotation_no)+field('Date',d.quotation_date)+field('Valid Until',d.valid_until)+field('Customer',d.accounting_partners?.name)+field('Customer Email',d.accounting_partners?.email)+field('Project',d.project_name)+field('Reference',d.reference)+field('Salesperson',d.salesperson_name)+field('Currency',d.currency_code)+field('Status',statusLabel(d.status))+field('Subtotal',money(d.subtotal))+field('Tax Rate',String(d.tax_rate??'—')+'%')+field('Tax Amount',money(d.tax_amount))+field('Total',money(d.total_amount))+field('Delivery Time',d.delivery_time)+field('Offer Period',d.offer_period)+field('Delivery Term',d.delivery_term)+field('Warranty',d.warranty)+'</div><h3>Quotation Items</h3>'+(error?'<p>Unable to load quotation items: '+esc(error.message)+'</p>':'<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>#</th><th>Code</th><th>Item / Description</th><th>Qty</th><th>UOM</th><th class="num">Unit Price</th><th class="num">Line Total</th></tr></thead><tbody>'+(lines||[]).map(x=>'<tr><td>'+esc(x.line_no)+'</td><td>'+esc(x.item_code)+'</td><td>'+esc(x.item_name||x.description)+'</td><td>'+esc(x.quantity)+'</td><td>'+esc(x.uom)+'</td><td class="num">'+money(x.unit_price)+'</td><td class="num">'+money(x.line_total)+'</td></tr>').join('')+'</tbody></table></div>')+'<h3>Notes & Terms</h3><p>'+esc(d.notes)+'</p><p>'+esc(d.terms_conditions)+'</p><p>'+esc(d.memo)+'</p>';
  }else{
   html='<div class="document-detail-grid">'+field('Letter Number',d.letter_no)+field('Date',d.letter_date)+field('Category',d.category==='HR'?'Human Resources':'General / Official')+field('Direction',d.direction==='E'?'External':'Internal')+field('Language',d.language==='id'?'Bahasa Indonesia':'English')+field('Recipient Name',d.recipient_name)+field('Job / Department',d.recipient_department)+field('Company / Organization',d.recipient_company)+field('Location',d.recipient_location)+field('Appendix',d.appendix)+field('Subject',d.subject)+field('Status',statusLabel(d.status))+field('Signatory',d.signatory_name)+field('Position',d.signatory_position)+'</div><h3>Letter Body</h3><div class="document-letter-body">'+esc(d.body).replace(/\n/g,'<br>')+'</div>';
  }
  $('documentRegisterDetailTitle').textContent=r.no||'Document Details';$('documentRegisterDetailSubtitle').textContent=(kind==='quotation'?'Quotation':'Company Letter')+' · '+(r.date||'');$('documentRegisterDetailBody').innerHTML=html;
  $('documentRegisterDetail').hidden=false;
 }
 document.addEventListener('click',e=>{if(e.target.closest('[data-document-close]'))$('documentRegisterDetail').hidden=true;});
 document.addEventListener('input',e=>{if(e.target.id==='documentRegisterSearch')render();});
 document.addEventListener('change',e=>{if(e.target.id==='documentRegisterType'||e.target.id==='documentRegisterStatus')render();});
 document.addEventListener('click',e=>{if(e.target.id==='documentRegisterRefresh')load().catch(console.error);});
 window.addEventListener('pilark:refresh-view',e=>{if(e.detail?.view==='document-register')load().then(()=>e.detail.done?.()).catch(err=>e.detail.done?.(err));});
 document.addEventListener('DOMContentLoaded',()=>{if($('documentRegisterBody'))load().catch(console.error);});
})();