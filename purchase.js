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
  async function createQuotation(e){
    e.preventDefault();
    const partner=el('purchasePartner').value,lines=readLines();
    if(!partner)return alert('Select a vendor.');
    if(!lines.length||lines.some(l=>!l.description||l.quantity<=0||l.unit_price<0||l.discount_percent<0||l.discount_percent>100||l.tax_rate<0))
      return alert('Complete every purchase line.');
    const {data:userData}=await client().auth.getUser();
    const {data:orderNo,error:noErr}=await client().rpc('next_purchase_order_no');
    if(noErr)return alert(noErr.message);
    const {data:order,error}=await client().from('purchase_orders').insert({
      order_no:orderNo,status:'quotation',partner_id:partner,
      quotation_date:el('purchaseDate').value||today(),
      validity_date:el('purchaseValidity').value||null,
      reference:el('purchaseReference').value.trim()||null,
      notes:el('purchaseNotes').value.trim()||null,
      created_by:userData?.user?.id||null
    }).select().single();
    if(error)return alert(error.message);
    const {error:lineErr}=await client().from('purchase_order_lines').insert(lines.map(l=>({...l,purchase_order_id:order.id})));
    if(lineErr){await client().from('purchase_orders').delete().eq('id',order.id);return alert(lineErr.message);}
    const {error:calcErr}=await client().rpc('recalc_purchase_order',{p_purchase_order_id:order.id});
    if(calcErr)return alert(calcErr.message);
    e.target.reset();el('purchaseDate').value=today();el('purchaseLines').innerHTML=lineHtml(0);await load();showTab('quotations');
  }
  async function confirmOrder(id){
    if(!confirm('Confirm this RFQ as a Purchase Order?'))return;
    const {error}=await client().rpc('confirm_purchase_order',{p_purchase_order_id:id});
    if(error)return alert(error.message);await load();showTab('orders');
  }
  async function createBill(id){
    if(!confirm('Create and post the vendor bill for this Purchase Order?'))return;
    const {error}=await client().rpc('create_vendor_bill_from_purchase_order',{p_purchase_order_id:id});
    if(error)return alert(error.message);await load();showTab('orders');
  }
  async function cancelOrder(id){
    if(!confirm('Cancel this RFQ?'))return;
    const {error}=await client().from('purchase_orders').update({status:'cancelled'}).eq('id',id).in('status',['quotation','sent']);
    if(error)return alert(error.message);await load();
  }
  function statusClass(s){return 'purchase-status purchase-status-'+s.replace('_','-');}
  function row(o){
    const actions=o.status==='purchase_order'
      ?'<button class="accounting-small-btn purchase-bill-btn" data-id="'+o.id+'">Create Vendor Bill</button>'
      :'<button class="accounting-small-btn purchase-confirm-btn" data-id="'+o.id+'">Confirm PO</button><button class="accounting-small-btn purchase-cancel-btn" data-id="'+o.id+'">Cancel</button>';
    return '<tr><td><b>'+esc(o.order_no)+'</b></td><td>'+esc(o.accounting_partners?.name||'—')+'</td><td>'+String(o.quotation_date||'—')+'</td><td>'+String(o.validity_date||'—')+'</td><td class="num">'+money(o.total_amount)+'</td><td><span class="'+statusClass(o.status)+'">'+esc(o.status.replace('_',' '))+'</span></td><td>'+actions+'</td></tr>';
  }
  function render(){
    const q=state.orders.filter(o=>['quotation','sent'].includes(o.status)),po=state.orders.filter(o=>o.status==='purchase_order');
    el('purchaseMetricQuotations').textContent=q.length;el('purchaseMetricOrders').textContent=po.length;
    el('purchaseMetricValue').textContent=money(state.orders.reduce((n,o)=>n+Number(o.total_amount||0),0));
    el('purchaseMetricOpen').textContent=money(po.reduce((n,o)=>n+Number(o.total_amount||0),0));
    el('purchaseQuotationsBody').innerHTML=q.map(row).join('')||'<tr><td colspan="7" class="accounting-empty">No RFQs yet.</td></tr>';
    el('purchaseOrdersBody').innerHTML=po.map(row).join('')||'<tr><td colspan="7" class="accounting-empty">No Purchase Orders yet.</td></tr>';
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
    el('purchaseRefresh')?.addEventListener('click',()=>load().catch(e=>alert(e.message)));
    if(el('purchaseDate'))el('purchaseDate').value=today();
    if(el('purchaseLines'))el('purchaseLines').innerHTML=lineHtml(0);
    updatePreview();
    document.querySelector('.side-link[data-view="purchase"]')?.addEventListener('click',()=>setTimeout(()=>load().catch(console.warn),50));
  }
  function init(){if(!el('view-purchase'))return;bind();if(client())load().catch(e=>console.warn('Purchase init:',e));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();