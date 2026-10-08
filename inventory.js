(function(){
  const client=()=>window.PILARK_CMS?.client;
  const el=id=>document.getElementById(id);
  const money=v=>'Rp'+Number(v||0).toLocaleString('id-ID',{maximumFractionDigits:2});
  const qty=v=>Number(v||0).toLocaleString('id-ID',{maximumFractionDigits:4});
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const today=()=>new Date().toISOString().slice(0,10);
  const monthStart=()=>{const d=new Date();d.setDate(1);return d.toISOString().slice(0,10);};
  let state={products:[],balances:[],locations:[],moves:[],purchaseOrders:[],salesOrders:[],tab:'stock'};

  async function load(){
    if(!client())return;
    const [p,b,l,m,po,so]=await Promise.all([
      client().from('inventory_products').select('*').order('product_code'),
      client().from('inventory_balances').select('*,inventory_products(product_code,name),inventory_locations(code,name)').order('updated_at',{ascending:false}),
      client().from('inventory_locations').select('*').eq('is_active',true).order('code'),
      client().from('inventory_stock_moves').select('*,inventory_products(product_code,name),inventory_locations(code,name)').order('created_at',{ascending:false}).limit(2000),
      client().from('purchase_orders').select('id,order_no,status,accounting_partners(name)').eq('status','purchase_order').order('order_date',{ascending:false}),
      client().from('sales_orders').select('id,order_no,status,accounting_partners(name)').eq('status','sales_order').order('order_date',{ascending:false})
    ]);
    for(const x of [p,b,l,m,po,so])if(x.error)throw x.error;
    state.products=p.data||[];state.balances=b.data||[];state.locations=l.data||[];state.moves=m.data||[];state.purchaseOrders=po.data||[];state.salesOrders=so.data||[];
    populateSelectors();render();showTab(state.tab,false);
  }

  function options(items,valueFn,labelFn,selected=''){
    return '<option value="">Select…</option>'+items.map(x=>'<option value="'+valueFn(x)+'" '+(valueFn(x)===selected?'selected':'')+'>'+esc(labelFn(x))+'</option>').join('');
  }

  function populateSelectors(){
    const products=state.products.filter(p=>p.is_active);
    const locations=state.locations.filter(l=>l.is_active);
    const ap=el('inventoryAdjustmentProduct'), al=el('inventoryAdjustmentLocation'), cp=el('inventoryCardProduct'), cl=el('inventoryCardLocation');
    if(ap)ap.innerHTML=options(products,p=>p.id,p=>p.product_code+' — '+p.name,ap.value);
    if(al)al.innerHTML=options(locations,l=>l.id,l=>l.code+' — '+l.name,al.value||locations.find(l=>l.code==='MAIN')?.id||'');
    if(cp)cp.innerHTML=options(products,p=>p.id,p=>p.product_code+' — '+p.name,cp.value||products[0]?.id||'');
    if(cl)cl.innerHTML=options(locations,l=>l.id,l=>l.code+' — '+l.name,cl.value||locations.find(l=>l.code==='MAIN')?.id||'');
    if(el('inventoryCardFrom')&&!el('inventoryCardFrom').value)el('inventoryCardFrom').value=monthStart();
    if(el('inventoryCardTo')&&!el('inventoryCardTo').value)el('inventoryCardTo').value=today();
  }

  function render(){
    const totalQty=state.balances.reduce((n,b)=>n+Number(b.quantity||0),0);
    const totalValue=state.balances.reduce((n,b)=>n+Number(b.stock_value||0),0);
    el('inventoryMetricProducts').textContent=state.products.filter(p=>p.is_active).length;
    el('inventoryMetricQty').textContent=qty(totalQty);
    el('inventoryMetricValue').textContent=money(totalValue);
    el('inventoryMetricLow').textContent=state.balances.filter(b=>Number(b.quantity||0)<=0).length;

    el('inventoryProductsBody').innerHTML=state.products.filter(p=>p.is_active).map(p=>{
      const bs=state.balances.filter(b=>b.product_id===p.id);
      const q=bs.reduce((n,b)=>n+Number(b.quantity||0),0), v=bs.reduce((n,b)=>n+Number(b.stock_value||0),0);
      const avg=q>0?v/q:0;
      return '<tr><td><b>'+esc(p.product_code)+'</b></td><td>'+esc(p.name)+'</td><td>'+esc(p.unit)+'</td><td class="num">'+qty(q)+'</td><td class="num">'+money(v)+'</td><td class="num">'+money(avg)+'</td></tr>';
    }).join('')||'<tr><td colspan="6" class="accounting-empty">No inventory products.</td></tr>';

    el('inventoryReceipts').innerHTML=state.purchaseOrders.map(o=>'<div class="inventory-order-row"><div><b>'+esc(o.order_no)+'</b><span>'+esc(o.accounting_partners?.name||'—')+'</span></div><button class="accounting-small-btn inventory-receive-btn" data-id="'+o.id+'">Receive Stock</button></div>').join('')||'<div class="accounting-empty">No confirmed Purchase Orders awaiting receipt.</div>';
    el('inventoryDeliveries').innerHTML=state.salesOrders.map(o=>'<div class="inventory-order-row"><div><b>'+esc(o.order_no)+'</b><span>'+esc(o.accounting_partners?.name||'—')+'</span></div><button class="accounting-small-btn inventory-deliver-btn" data-id="'+o.id+'">Deliver Stock</button></div>').join('')||'<div class="accounting-empty">No confirmed Sales Orders awaiting delivery.</div>';

    document.querySelectorAll('.inventory-receive-btn').forEach(b=>b.onclick=()=>receive(b.dataset.id));
    document.querySelectorAll('.inventory-deliver-btn').forEach(b=>b.onclick=()=>deliver(b.dataset.id));
    renderStockCard();
  }

  async function receive(id){
    if(!confirm('Receive the remaining quantities on this Purchase Order into Main Warehouse?'))return;
    const {error}=await client().rpc('receive_purchase_order_inventory',{p_purchase_order_id:id});
    if(error)return alert(error.message);
    await load();alert('Stock receipt posted successfully.');
  }

  async function deliver(id){
    if(!confirm('Deliver the remaining quantities on this Sales Order from Main Warehouse? This will post COGS.'))return;
    const {error}=await client().rpc('deliver_sales_order_inventory',{p_sales_order_id:id});
    if(error)return alert(error.message);
    await load();alert('Delivery posted and COGS recorded at inventory average cost.');
  }

  async function adjust(e){
    e.preventDefault();
    const product=el('inventoryAdjustmentProduct').value,location=el('inventoryAdjustmentLocation').value,type=el('inventoryAdjustmentType').value;
    const quantity=Number(el('inventoryAdjustmentQty').value),cost=el('inventoryAdjustmentCost').value===''?null:Number(el('inventoryAdjustmentCost').value),reason=el('inventoryAdjustmentReason').value.trim();
    if(!product||!location||quantity<=0||!reason)return alert('Complete product, warehouse, quantity and reason.');
    const signed=type==='increase'?quantity:-quantity;
    if(!confirm((type==='increase'?'Increase':'Decrease')+' inventory by '+qty(quantity)+'? This will create an accounting entry.'))return;
    const {error}=await client().rpc('adjust_inventory_stock',{p_product_id:product,p_location_id:location,p_quantity:signed,p_unit_cost:cost,p_reason:reason});
    if(error)return alert(error.message);
    e.target.reset();populateSelectors();await load();showTab('adjustment');alert('Inventory adjustment posted successfully.');
  }

  function renderStockCard(){
    const product=el('inventoryCardProduct')?.value,location=el('inventoryCardLocation')?.value,from=el('inventoryCardFrom')?.value,to=el('inventoryCardTo')?.value;
    if(!product||!location)return;
    const moves=state.moves.filter(m=>m.product_id===product&&m.location_id===location&&(!from||String(m.created_at).slice(0,10)>=from)&&(!to||String(m.created_at).slice(0,10)<=to)).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
    const before=state.moves.filter(m=>m.product_id===product&&m.location_id===location&&from&&String(m.created_at).slice(0,10)<from).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
    let runningQty=0,runningValue=0;
    for(const m of before){const signed=Number(m.quantity||0);runningQty+=signed;runningValue+=signed>=0?Number(m.total_value||0):-Number(m.total_value||0);}
    const rows=moves.map(m=>{
      const signed=Number(m.quantity||0),value=signed>=0?Number(m.total_value||0):-Number(m.total_value||0);
      runningQty+=signed;runningValue+=value;
      const inbound=signed>0?signed:0,outbound=signed<0?Math.abs(signed):0;
      return '<tr><td>'+new Date(m.created_at).toLocaleDateString('id-ID')+'</td><td><b>'+esc(m.move_no)+'</b></td><td>'+esc(m.move_type)+'</td><td class="num">'+qty(inbound)+'</td><td class="num">'+qty(outbound)+'</td><td class="num">'+money(m.unit_cost)+'</td><td class="num">'+money(value)+'</td><td class="num"><b>'+qty(runningQty)+'</b><br><small>'+money(runningValue)+'</small></td><td>'+esc(m.reason||m.reference||'—')+'</td></tr>';
    }).join('');
    el('inventoryStockCardBody').innerHTML=rows||'<tr><td colspan="9" class="accounting-empty">No stock movement for the selected filters.</td></tr>';
  }

  function showTab(tab,update=true){
    state.tab=tab;
    document.querySelectorAll('[data-inventory-tab]').forEach(b=>b.classList.toggle('active',b.dataset.inventoryTab===tab));
    document.querySelectorAll('[data-inventory-panel]').forEach(p=>p.hidden=p.dataset.inventoryPanel!==tab);
    if(update)renderStockCard();
  }

  function bind(){
    el('inventoryRefresh')?.addEventListener('click',()=>load().catch(e=>alert(e.message)));
    window.addEventListener('pilark:refresh-view',e=>{if(e.detail?.view==='inventory')load().then(()=>e.detail?.done?.()).catch(err=>e.detail?.done?.(err));});
    document.querySelectorAll('[data-inventory-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.inventoryTab));
    el('inventoryAdjustmentForm')?.addEventListener('submit',adjust);
    el('inventoryCardApply')?.addEventListener('click',renderStockCard);
    el('inventoryCardProduct')?.addEventListener('change',renderStockCard);
    el('inventoryCardLocation')?.addEventListener('change',renderStockCard);
    document.querySelector('.side-link[data-view="inventory"]')?.addEventListener('click',()=>setTimeout(()=>load().catch(console.warn),50));
  }
  function init(){if(!el('view-inventory'))return;bind();if(client())load().catch(e=>console.warn('Inventory init:',e));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();