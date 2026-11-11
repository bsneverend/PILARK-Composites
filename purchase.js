(function(){
  const client=()=>window.PILARK_CMS?.client;
  const el=id=>document.getElementById(id);
  const today=()=>new Date().toISOString().slice(0,10);
  const money=v=>'Rp'+Number(v||0).toLocaleString('id-ID',{maximumFractionDigits:2});
  const esc=v=>String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  let state={orders:[],partners:[],accounts:[],products:[],tab:'overview'};

  async function load(){
    if(!client())return;
    const [o,p,a,pr]=await Promise.all([
      client().from('purchase_orders').select('*,accounting_partners(name,email)').order('quotation_date',{ascending:false}).limit(500),
      client().from('accounting_partners').select('*').eq('is_active',true).order('name'),
      client().from('accounting_accounts').select('*').eq('is_active',true).order('code'),
      client().from('inventory_products').select('id,product_code,name,unit,is_active').eq('is_active',true).order('product_code')
    ]);
    if(o.error)throw o.error;if(p.error)throw p.error;if(a.error)throw a.error;
    state.orders=o.data||[];state.partners=p.data||[];state.accounts=a.data||[];state.products=pr.data||[];
    render();populateVendor();resetLineOptions();
  }

  function accountOptions(selected=''){
    const allowed=['expense','expense_other','expense_depreciation','expense_direct_cost','asset_current','asset_prepayments'];
    return '<option value="">Default expense (6100)</option>'+state.accounts.filter(a=>allowed.includes(a.account_type)).map(a=>'<option value="'+a.id+'" '+(a.id===selected?'selected':'')+'>'+esc(a.code)+' — '+esc(a.name)+'</option>').join('');
  }
  function taxAccountOptions(selected=''){
    const tax=state.accounts.find(a=>a.code==='1210');
    return '<option value="">Input VAT (1210)</option>'+(tax?'<option value="'+tax.id+'" '+(tax.id===selected?'selected':'')+'>'+esc(tax.code)+' — '+esc(tax.name)+'</option>':'');
  }
  function populateVendor(){
    const s=el('purchasePartner');if(!s)return;
    s.innerHTML='<option value="">Select vendor…</option>'+state.partners.filter(p=>['vendor','both'].includes(p.partner_type)).map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('');
  }
  function lineHtml(i){
    return '<div class="purchase-line" data-line-index="'+i+'"><select class="purchase-product"><option value="">Select inventory product…</option>'+state.products.map(p=>'<option value="'+p.id+'">'+esc(p.product_code)+' — '+esc(p.name)+'</option>').join('')+'</select><input class="purchase-desc" placeholder="Product / service description"><input class="purchase-qty" type="number" min="0.0001" step="0.0001" value="1"><input class="purchase-price" type="number" min="0" step="0.01" value="0"><input class="purchase-discount" type="number" min="0" max="100" step="0.01" value="0"><input class="purchase-tax" type="number" min="0" step="0.01" value="0"><select class="purchase-account" title="Expense account">'+accountOptions()+'</select><button type="button" class="purchase-line-remove" aria-label="Remove line">×</button></div>';
  }
  function resetLineOptions(){
    const box=el('purchaseLines');if(!box)return;
    if(!box.children.length)box.innerHTML=lineHtml(0);
    else [...box.querySelectorAll('.purchase-line')].forEach((row,i)=>{
      const a=row.querySelector('.purchase-account')?.value||'';
      row.querySelector('.purchase-account').innerHTML=accountOptions(a);
    });
    updatePreview();
  }
  function readLines(){
    return [...document.querySelectorAll('.purchase-line')].map((r,i)=>({
      line_no:i+1,product_id:r.querySelector('.purchase-product').value||null,description:r.querySelector('.purchase-desc').value.trim(),
      quantity:Number(r.querySelector('.purchase-qty').value||0),
      unit_price:Number(r.querySelector('.purchase-price').value||0),
      discount_percent:Number(r.querySelector('.purchase-discount').value||0),
      tax_rate:Number(r.querySelector('.purchase-tax').value||0),
      expense_account_id:r.querySelector('.purchase-account').value||null,
      tax_account_id:null
    }));
  }
  function updatePreview(){
    let sub=0,tax=0;readLines().forEach(l=>{
      const net=Math.round(l.quantity*l.unit_price*(1-l.discount_percent/100)*100)/100;
      sub+=net;tax+=Math.round(net*l.tax_rate)/100;
    });
    if(el('purchaseSubtotal'))el('purchaseSubtotal').textContent=money(sub);
    if(el('purchaseTax'))el('purchaseTax').textContent=money(tax);
    if(el('purchaseTotal'))el('purchaseTotal').textContent=money(sub+tax);
  }
  function showDocumentModal(title,message,status='loading',html=''){const m=el('purchaseDocumentModal');if(!m)return;el('purchaseDocumentTitle').textContent=title;el('purchaseDocumentMessage').textContent=message;el('purchaseDocumentPreview').innerHTML=html||'<div class="purchase-document-status '+status+'">'+(status==='error'?'Action could not be completed':status==='success'?'Completed':'Processing…')+'</div>';el('purchaseDocumentPrint').hidden=true;m.hidden=false;document.body.classList.add('modal-open');}
  function closeDocumentModal(){const m=el('purchaseDocumentModal');if(m)m.hidden=true;document.body.classList.remove('modal-open');}
  function fmtDate(v){if(!v)return '—';return new Date(v+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});}
  function documentHtml(o,lines){
    let sub=0,tax=0;lines.forEach(l=>{sub+=Number(l.line_total||0);tax+=Math.round(Number(l.line_total||0)*Number(l.tax_rate||0))/100;});
    const rows=lines.map(l=>'<tr><td>'+esc(l.product_code||'')+'</td><td>'+esc(l.description||l.product_name||'')+'</td><td class="num">'+Number(l.quantity||0).toLocaleString('id-ID')+'</td><td>'+esc(l.uom||'PCS')+'</td><td class="num">'+money(l.unit_price)+'</td><td class="num">'+money(l.line_total)+'</td></tr>').join('');
    return '<div class="purchase-document-paper"><div class="purchase-document-brand"><div><div class="purchase-doc-brand">PILARK</div><div class="purchase-doc-sub">COMPOSITES · PT. PANCA INTEGRA LAGUNA REKSA</div></div><div class="purchase-doc-type">'+(o.status==='purchase_order'?'PURCHASE ORDER':'REQUEST FOR QUOTATION')+'</div></div><div class="purchase-doc-meta"><div><b>Number</b><span>'+esc(o.order_no)+'</span></div><div><b>Vendor</b><span>'+esc(o.accounting_partners?.name||'—')+'</span></div><div><b>Date</b><span>'+fmtDate(o.quotation_date)+'</span></div><div><b>Valid Until</b><span>'+fmtDate(o.validity_date)+'</span></div><div><b>Reference</b><span>'+esc(o.reference||'—')+'</span></div></div><table class="purchase-doc-table"><thead><tr><th>Code</th><th>Description</th><th class="num">Qty</th><th>UOM</th><th class="num">Unit Price</th><th class="num">Amount</th></tr></thead><tbody>'+rows+'</tbody></table><div class="purchase-doc-totals"><div>Subtotal <b>'+money(sub)+'</b></div><div>Input VAT <b>'+money(tax)+'</b></div><div class="grand">Total <b>'+money(sub+tax)+'</b></div></div><div class="purchase-doc-notes"><b>Notes / Terms</b><p>'+esc(o.notes||'').replace(/\n/g,'<br>')+'</p></div></div>';
  }
  async function viewPurchaseDocument(id){
    const o=state.orders.find(x=>x.id===id);if(!o)return;
    showDocumentModal(o.status==='purchase_order'?'Purchase Order':'Request for Quotation','Review the document below. You can print it or save it as PDF.','success');
    const {data:lines,error}=await client().from('purchase_order_lines').select('*,inventory_products(product_code,name,unit)').eq('purchase_order_id',id).order('line_no');
    if(error){el('purchaseDocumentPreview').innerHTML='<div class="purchase-document-status error">'+esc(error.message)+'</div>';return;}
    const normalized=(lines||[]).map(l=>({...l,product_code:l.inventory_products?.product_code,product_name:l.inventory_products?.name,uom:l.inventory_products?.unit,line_total:Number(l.quantity||0)*Number(l.unit_price||0)*(1-Number(l.discount_percent||0)/100)}));
    el('purchaseDocumentPreview').innerHTML=documentHtml(o,normalized);
    const pb=el('purchaseDocumentPrint');pb.hidden=false;pb.onclick=()=>printPurchaseDocument(o,normalized);
  }
  function printPurchaseDocument(o,lines){
    const w=window.open('about:blank','_blank','width=1000,height=900');if(!w)return alert('Please allow pop-ups for Print / PDF.');
    w.document.write('<!doctype html><html><head><title>'+esc(o.order_no)+'</title><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#111;margin:0;padding:32px}.purchase-document-paper{max-width:900px;margin:auto}.purchase-document-brand{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:18px}.purchase-doc-brand{font-size:30px;font-weight:900;letter-spacing:4px}.purchase-doc-sub{font-size:10px;letter-spacing:1.5px;color:#68747c}.purchase-doc-type{font-size:20px;font-weight:900}.purchase-doc-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0}.purchase-doc-meta div{border:1px solid #ddd;padding:10px}.purchase-doc-meta b{display:block;font-size:10px;text-transform:uppercase;color:#68747c;margin-bottom:5px}.purchase-doc-meta span{font-size:13px}.purchase-doc-table{width:100%;border-collapse:collapse;font-size:12px}.purchase-doc-table th,.purchase-doc-table td{border-bottom:1px solid #ddd;padding:9px;text-align:left}.purchase-doc-table th{font-size:10px;text-transform:uppercase;background:#f3f5f6}.num{text-align:right!important}.purchase-doc-totals{margin:22px 0 0 auto;width:360px}.purchase-doc-totals div{display:flex;justify-content:space-between;padding:6px 0}.purchase-doc-totals .grand{font-size:17px;font-weight:900;border-top:2px solid #111;padding-top:10px}.purchase-doc-notes{margin-top:30px;border-top:1px solid #ddd;padding-top:14px;font-size:12px;line-height:1.6}@media print{body{padding:0}.purchase-doc-table th{background:#f3f5f6;-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>'+documentHtml(o,lines)+'</body></html>');
    w.document.close();w.focus();setTimeout(()=>w.print(),250);
  }
  function readableFetchError(err){
    const raw=String(err?.message||err||'Unknown error');
    if(/failed to fetch/i.test(raw)){
      return 'The browser could not reach the Supabase API. This is a network/API connection error, not a missing form field. Check the Supabase project status, API URL, and browser Network tab for the failed request.';
    }
    return raw;
  }
  async function createQuotation(e){
    e.preventDefault();
    const partner=el('purchasePartner').value,lines=readLines();
    if(!partner)return alert('Select a vendor before creating the RFQ.');
    if(!lines.length||lines.some(l=>!l.description||l.quantity<=0||l.unit_price<0||l.discount_percent<0||l.discount_percent>100||l.tax_rate<0))
      return alert('Complete every purchase line.');
    showDocumentModal('Creating RFQ','Saving the RFQ and purchase lines…','loading');
    try{
      const {data:userData,error:userErr}=await client().auth.getUser();
      if(userErr)throw userErr;
      const {data:orderNo,error:noErr}=await client().rpc('next_purchase_order_no');
      if(noErr)throw noErr;
      const {data:order,error}=await client().from('purchase_orders').insert({
        order_no:orderNo,status:'quotation',partner_id:partner,
        quotation_date:el('purchaseDate').value||today(),
        validity_date:el('purchaseValidity').value||null,
        reference:el('purchaseReference').value.trim()||null,
        notes:el('purchaseNotes').value.trim()||null,
        created_by:userData?.user?.id||null
      }).select().single();
      if(error)throw error;
      const {error:lineErr}=await client().from('purchase_order_lines').insert(lines.map(l=>({...l,purchase_order_id:order.id})));
      if(lineErr){await client().from('purchase_orders').delete().eq('id',order.id);throw lineErr;}
      const {error:calcErr}=await client().rpc('recalc_purchase_order',{p_purchase_order_id:order.id});
      if(calcErr)throw calcErr;
      e.target.reset();el('purchaseDate').value=today();el('purchaseLines').innerHTML=lineHtml(0);
      await load();showTab('quotations');
      el('purchaseRfqModal').hidden=true;document.body.classList.remove('modal-open');closeDocumentModal();alert('RFQ '+orderNo+' created successfully.');
    }catch(err){
      console.error('Purchase RFQ creation failed:',err);
      showDocumentModal('RFQ could not be created','The RFQ transaction failed.','error',readableFetchError(err));
    }
  }
  async function confirmOrder(id){
    if(!confirm('Confirm this RFQ as a Purchase Order?'))return;
    showDocumentModal('Confirming Purchase Order','Posting the confirmed Purchase Order…','loading');
    try{
      const {error}=await client().rpc('confirm_purchase_order',{p_purchase_order_id:id});
      if(error)throw error;
      await load();showTab('orders');
      showDocumentModal('Purchase Order confirmed','The RFQ has been converted to a Purchase Order.','success','Purchase Order status: Confirmed');
    }catch(err){
      console.error('Purchase Order confirmation failed:',err);
      showDocumentModal('Purchase Order failed','The RFQ could not be converted to a Purchase Order.','error',readableFetchError(err));
    }
  }
  async function createBill(id){
    if(!confirm('Create and post the vendor bill for this Purchase Order?'))return;
    showDocumentModal('Creating Vendor Bill','Posting the vendor bill to accounting…','loading');
    try{
      const {error}=await client().rpc('create_vendor_bill_from_purchase_order',{p_purchase_order_id:id});
      if(error)throw error;
      await load();showTab('orders');
      showDocumentModal('Vendor Bill created','The vendor bill was created and posted successfully.','success','Purchase Order → Vendor Bill completed.');
    }catch(err){
      console.error('Vendor bill creation failed:',err);
      showDocumentModal('Vendor Bill failed','The vendor bill could not be created.','error',readableFetchError(err));
    }
  }
  async function cancelOrder(id){
    if(!confirm('Cancel this RFQ?'))return;
    try{
      const {error}=await client().from('purchase_orders').update({status:'cancelled'}).eq('id',id).in('status',['quotation','sent']);
      if(error)throw error;await load();
    }catch(err){
      console.error('RFQ cancellation failed:',err);
      showDocumentModal('RFQ cancellation failed','The RFQ could not be cancelled.','error',readableFetchError(err));
    }
  }
  function statusClass(s){return 'purchase-status purchase-status-'+s.replace('_','-');}
  function row(o){
    const actions='<button class="accounting-small-btn purchase-view-btn" data-id="'+o.id+'">View / Print</button>'+(o.status==='purchase_order'?'<button class="accounting-small-btn purchase-bill-btn" data-id="'+o.id+'">Create Vendor Bill</button>':'<button class="accounting-small-btn purchase-confirm-btn" data-id="'+o.id+'">Confirm PO</button><button class="accounting-small-btn purchase-cancel-btn" data-id="'+o.id+'">Cancel</button>');
    return '<tr><td><b>'+esc(o.order_no)+'</b></td><td>'+esc(o.accounting_partners?.name||'—')+'</td><td>'+String(o.quotation_date||'—')+'</td><td>'+String(o.validity_date||'—')+'</td><td class="num">'+money(o.total_amount)+'</td><td><span class="'+statusClass(o.status)+'">'+esc(o.status.replace('_',' '))+'</span></td><td>'+actions+'</td></tr>';
  }
  function render(){
    const q=state.orders.filter(o=>['quotation','sent'].includes(o.status)),po=state.orders.filter(o=>o.status==='purchase_order');
    el('purchaseMetricQuotations').textContent=q.length;el('purchaseMetricOrders').textContent=po.length;
    el('purchaseMetricValue').textContent=money(state.orders.reduce((n,o)=>n+Number(o.total_amount||0),0));
    el('purchaseMetricOpen').textContent=money(po.reduce((n,o)=>n+Number(o.total_amount||0),0));
    el('purchaseQuotationsBody').innerHTML=q.map(row).join('')||'<tr><td colspan="7" class="accounting-empty">No RFQs yet.</td></tr>';
    el('purchaseOrdersBody').innerHTML=po.map(row).join('')||'<tr><td colspan="7" class="accounting-empty">No Purchase Orders yet.</td></tr>';
    document.querySelectorAll('.purchase-view-btn').forEach(b=>b.onclick=()=>viewPurchaseDocument(b.dataset.id));
    document.querySelectorAll('.purchase-confirm-btn').forEach(b=>b.onclick=()=>confirmOrder(b.dataset.id));
    document.querySelectorAll('.purchase-bill-btn').forEach(b=>b.onclick=()=>createBill(b.dataset.id));
    document.querySelectorAll('.purchase-cancel-btn').forEach(b=>b.onclick=()=>cancelOrder(b.dataset.id));
  }
  function showTab(tab){
    state.tab=tab;
    document.querySelectorAll('[data-purchase-tab]').forEach(b=>b.classList.toggle('active',b.dataset.purchaseTab===tab));
    document.querySelectorAll('[data-purchase-panel]').forEach(p=>{
      const active=p.dataset.purchasePanel===tab;
      if(active){p.hidden=false;p.removeAttribute('hidden');p.style.setProperty('display','block','important');}
      else{p.hidden=true;p.setAttribute('hidden','');p.style.setProperty('display','none','important');}
    });
  }
  function bind(){
    document.querySelectorAll('[data-purchase-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.purchaseTab));
    el('purchaseForm')?.addEventListener('submit',createQuotation);
    el('addPurchaseLine')?.addEventListener('click',()=>{el('purchaseLines').insertAdjacentHTML('beforeend',lineHtml(el('purchaseLines').children.length));updatePreview();});
    el('purchaseLines')?.addEventListener('click',e=>{if(e.target.classList.contains('purchase-line-remove')){const rows=el('purchaseLines').querySelectorAll('.purchase-line');if(rows.length>1)e.target.closest('.purchase-line').remove();updatePreview();}});
    el('purchaseLines')?.addEventListener('input',updatePreview);
    el('purchaseLines')?.addEventListener('change',updatePreview);
    el('purchaseRefresh')?.addEventListener('click',()=>load().catch(e=>showDocumentModal('Purchase refresh failed','Could not load Purchase data.','error',readableFetchError(e))));
    const openRfq=()=>{const m=el('purchaseRfqModal');if(m){m.hidden=false;document.body.classList.add('modal-open');if(el('purchaseDate'))el('purchaseDate').value=today();}};
    el('newPurchaseRfq')?.addEventListener('click',openRfq);el('overviewNewRfq')?.addEventListener('click',openRfq);el('rfqNewFromList')?.addEventListener('click',openRfq);
    el('purchaseRfqClose')?.addEventListener('click',()=>{el('purchaseRfqModal').hidden=true;document.body.classList.remove('modal-open');});el('purchaseFormCancel')?.addEventListener('click',()=>{el('purchaseRfqModal').hidden=true;document.body.classList.remove('modal-open');});
    el('purchaseDocumentClose')?.addEventListener('click',closeDocumentModal);
    el('purchaseDocumentCloseBtn')?.addEventListener('click',closeDocumentModal);
    el('purchaseDocumentModal')?.querySelector('[data-purchase-close]')?.addEventListener('click',closeDocumentModal);
    window.addEventListener('pilark:refresh-view',e=>{if(e.detail?.view==='purchase')load().then(()=>e.detail?.done?.()).catch(err=>e.detail?.done?.(err));});
    if(el('purchaseDate'))el('purchaseDate').value=today();
    if(el('purchaseLines'))el('purchaseLines').innerHTML=lineHtml(0);
    updatePreview();
    document.querySelector('.side-link[data-view="purchase"]')?.addEventListener('click',()=>setTimeout(()=>load().catch(console.warn),50));
  }
  function init(){if(!el('view-purchase'))return;bind();if(client())load().catch(e=>console.warn('Purchase init:',e));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();