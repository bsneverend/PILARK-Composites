(function(){
  const client=()=>window.PILARK_CMS?.client;
  const el=id=>document.getElementById(id);
  const money=v=>'Rp'+Number(v||0).toLocaleString('id-ID',{maximumFractionDigits:2});
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let state={products:[],balances:[],purchaseOrders:[],salesOrders:[]};

  async function load(){
    if(!client())return;
    const [p,b,po,so]=await Promise.all([
      client().from('inventory_products').select('*').order('product_code'),
      client().from('inventory_balances').select('*,inventory_products(product_code,name),inventory_locations(code,name)').order('updated_at',{ascending:false}),
      client().from('purchase_orders').select('id,order_no,status,accounting_partners(name)').eq('status','purchase_order').order('order_date',{ascending:false}),
      client().from('sales_orders').select('id,order_no,status,accounting_partners(name)').eq('status','sales_order').order('order_date',{ascending:false})
    ]);
    if(p.error)throw p.error;if(b.error)throw b.error;if(po.error)throw po.error;if(so.error)throw so.error;
    state.products=p.data||[];state.balances=b.data||[];state.purchaseOrders=po.data||[];state.salesOrders=so.data||[];
    render();
  }

  function render(){
    const totalQty=state.balances.reduce((n,b)=>n+Number(b.quantity||0),0);
    const totalValue=state.balances.reduce((n,b)=>n+Number(b.stock_value||0),0);
    el('inventoryMetricProducts').textContent=state.products.filter(p=>p.is_active).length;
    el('inventoryMetricQty').textContent=totalQty.toLocaleString('id-ID',{maximumFractionDigits:2});
    el('inventoryMetricValue').textContent=money(totalValue);
    el('inventoryMetricLow').textContent=state.balances.filter(b=>Number(b.quantity||0)<=0).length;

    el('inventoryProductsBody').innerHTML=state.products.map(p=>{
      const bs=state.balances.filter(b=>b.product_id===p.id);
      const qty=bs.reduce((n,b)=>n+Number(b.quantity||0),0);
      const val=bs.reduce((n,b)=>n+Number(b.stock_value||0),0);
      return '<tr><td><b>'+esc(p.product_code)+'</b></td><td>'+esc(p.name)+'</td><td>'+esc(p.unit)+'</td><td class="num">'+qty.toLocaleString('id-ID',{maximumFractionDigits:4})+'</td><td class="num">'+money(val)+'</td><td>'+money(p.standard_cost)+'</td></tr>';
    }).join('')||'<tr><td colspan="6" class="accounting-empty">No inventory products.</td></tr>';

    el('inventoryReceipts').innerHTML=state.purchaseOrders.map(o=>'<div class="inventory-order-row"><div><b>'+esc(o.order_no)+'</b><span>'+esc(o.accounting_partners?.name||'—')+'</span></div><button class="accounting-small-btn inventory-receive-btn" data-id="'+o.id+'">Receive Stock</button></div>').join('')||'<div class="accounting-empty">No confirmed Purchase Orders awaiting receipt.</div>';
    el('inventoryDeliveries').innerHTML=state.salesOrders.map(o=>'<div class="inventory-order-row"><div><b>'+esc(o.order_no)+'</b><span>'+esc(o.accounting_partners?.name||'—')+'</span></div><button class="accounting-small-btn inventory-deliver-btn" data-id="'+o.id+'">Deliver Stock</button></div>').join('')||'<div class="accounting-empty">No confirmed Sales Orders awaiting delivery.</div>';

    document.querySelectorAll('.inventory-receive-btn').forEach(b=>b.onclick=()=>receive(b.dataset.id));
    document.querySelectorAll('.inventory-deliver-btn').forEach(b=>b.onclick=()=>deliver(b.dataset.id));
  }

  async function receive(id){
    if(!confirm('Receive the remaining quantities on this Purchase Order into Main Warehouse?'))return;
    const {error}=await client().rpc('receive_purchase_order_inventory',{p_purchase_order_id:id});
    if(error)return alert(error.message);
    await load();
    alert('Stock receipt posted successfully.');
  }
  async function deliver(id){
    if(!confirm('Deliver the remaining quantities on this Sales Order from Main Warehouse? This will post COGS.'))return;
    const {error}=await client().rpc('deliver_sales_order_inventory',{p_sales_order_id:id});
    if(error)return alert(error.message);
    await load();
    alert('Delivery posted and COGS recorded.');
  }

  function bind(){
    el('inventoryRefresh')?.addEventListener('click',()=>load().catch(e=>alert(e.message)));
    document.querySelector('.side-link[data-view="inventory"]')?.addEventListener('click',()=>setTimeout(()=>load().catch(console.warn),50));
  }
  function init(){if(!el('view-inventory'))return;bind();if(client())load().catch(e=>console.warn('Inventory init:',e));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();