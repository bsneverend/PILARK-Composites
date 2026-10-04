(function(){
  const cms=()=>window.PILARK_CMS;
  const client=()=>cms()?.client;
  const el=id=>document.getElementById(id);
  const today=()=>new Date().toISOString().slice(0,10);
  const money=v=>'Rp'+Number(v||0).toLocaleString('id-ID',{maximumFractionDigits:2});
  const esc=v=>String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  let state={orders:[],partners:[],products:[],tab:'overview',crm:{accounts:[],projects:[],opportunities:[],activities:[]}};
  async function load(){
    if(!client())return;
    const [o,p,pr]=await Promise.all([
      client().from('sales_orders').select('*,accounting_partners(name,email)').order('quotation_date',{ascending:false}).limit(500),
      client().from('accounting_partners').select('*').eq('is_active',true).order('name'),
      client().from('inventory_products').select('id,product_code,name,unit,is_active').eq('is_active',true).order('product_code')
    ]);
    if(o.error)throw o.error;if(p.error)throw p.error;
    state.orders=o.data||[];state.partners=p.data||[];state.products=pr.data||[];render();populatePartners();
  }
  function populatePartners(){const s=el('salesPartner');if(!s)return;s.innerHTML='<option value="">Select customer…</option>'+state.partners.filter(p=>['customer','both'].includes(p.partner_type)).map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('');}
  function productOptions(){return '<option value="">Non-inventory / service</option>'+state.products.map(p=>'<option value="'+p.id+'">'+esc(p.product_code)+' — '+esc(p.name)+'</option>').join('');}
  function lineHtml(i){return '<div class="sales-line" data-line-index="'+i+'"><select class="sales-product"><option value="">Select inventory product…</option>'+state.products.map(p=>'<option value="'+p.id+'">'+esc(p.product_code)+' — '+esc(p.name)+'</option>').join('')+'</select><input class="sales-desc" placeholder="Product / service description"><input class="sales-qty" type="number" min="0.0001" step="0.0001" value="1"><input class="sales-price" type="number" min="0" step="0.01" value="0"><input class="sales-discount" type="number" min="0" max="100" step="0.01" value="0"><input class="sales-tax" type="number" min="0" step="0.01" value="0"><button type="button" class="sales-line-remove" aria-label="Remove line">×</button></div>';}
  function readLines(){return [...document.querySelectorAll('.sales-line')].map((r,i)=>({line_no:i+1,product_id:r.querySelector('.sales-product').value||null,description:r.querySelector('.sales-desc').value.trim(),quantity:Number(r.querySelector('.sales-qty').value||0),unit_price:Number(r.querySelector('.sales-price').value||0),discount_percent:Number(r.querySelector('.sales-discount').value||0),tax_rate:Number(r.querySelector('.sales-tax').value||0)}));}
  function updatePreview(){let sub=0,tax=0;readLines().forEach(l=>{const net=Math.round(l.quantity*l.unit_price*(1-l.discount_percent/100)*100)/100;sub+=net;tax+=Math.round(net*l.tax_rate)/100;});el('salesSubtotal').textContent=money(sub);el('salesTax').textContent=money(tax);el('salesTotal').textContent=money(sub+tax);}
  async function createQuotation(e){
    e.preventDefault();const partner=el('salesPartner').value,lines=readLines();
    if(!partner)return alert('Select a customer.');
    if(!lines.length||lines.some(l=>!l.description||l.quantity<=0||l.unit_price<0||l.discount_percent<0||l.discount_percent>100))return alert('Complete every sales line.');
    const {data:userData}=await client().auth.getUser();const {data:orderNo,error:noErr}=await client().rpc('next_sales_order_no');if(noErr)return alert(noErr.message);
    const {data:order,error}=await client().from('sales_orders').insert({order_no:orderNo,status:'quotation',partner_id:partner,quotation_date:el('salesDate').value||today(),validity_date:el('salesValidity').value||null,reference:el('salesReference').value.trim()||null,notes:el('salesNotes').value.trim()||null,created_by:userData?.user?.id||null}).select().single();
    if(error)return alert(error.message);const {error:lineErr}=await client().from('sales_order_lines').insert(lines.map(l=>({...l,sales_order_id:order.id})));if(lineErr){await client().from('sales_orders').delete().eq('id',order.id);return alert(lineErr.message);}
    const {error:calcErr}=await client().rpc('recalc_sales_order',{p_sales_order_id:order.id});if(calcErr)return alert(calcErr.message);e.target.reset();el('salesDate').value=today();await Promise.all([load(),loadCRM()]);showTab('quotations');
  }
  async function confirmOrder(id){if(!confirm('Confirm this quotation as a Sales Order?'))return;const {error}=await client().rpc('confirm_sales_order',{p_sales_order_id:id});if(error)return alert(error.message);await load();showTab('orders');}
  async function createInvoice(id){if(!confirm('Create and post the customer invoice for this Sales Order?'))return;const {error}=await client().rpc('create_invoice_from_sales_order',{p_sales_order_id:id});if(error)return alert(error.message);await load();showTab('orders');}
  async function cancelOrder(id){if(!confirm('Cancel this quotation?'))return;const {error}=await client().from('sales_orders').update({status:'cancelled'}).eq('id',id).in('status',['quotation','sent']);if(error)return alert(error.message);await load();}
  function statusClass(s){return 'sales-status sales-status-'+s.replace('_','-');}
  function row(o){const actions=o.status==='sales_order'?'<button class="accounting-small-btn sales-invoice-btn" data-id="'+o.id+'">Create Invoice</button>':'<button class="accounting-small-btn sales-confirm-btn" data-id="'+o.id+'">Confirm</button><button class="accounting-small-btn sales-cancel-btn" data-id="'+o.id+'">Cancel</button>';return '<tr><td><b>'+esc(o.order_no)+'</b></td><td>'+esc(o.accounting_partners?.name||'—')+'</td><td>'+String(o.quotation_date||'—')+'</td><td>'+String(o.validity_date||'—')+'</td><td class="num">'+money(o.total_amount)+'</td><td><span class="'+statusClass(o.status)+'">'+esc(o.status.replace('_',' '))+'</span></td><td>'+actions+'</td></tr>';}
  function render(){const q=state.orders.filter(o=>['quotation','sent'].includes(o.status)),so=state.orders.filter(o=>o.status==='sales_order');el('salesMetricQuotations').textContent=q.length;el('salesMetricOrders').textContent=so.length;el('salesMetricValue').textContent=money(state.orders.reduce((n,o)=>n+Number(o.total_amount||0),0));el('salesMetricOpen').textContent=money(so.reduce((n,o)=>n+Number(o.total_amount||0),0));el('salesQuotationsBody').innerHTML=q.map(row).join('')||'<tr><td colspan="7" class="accounting-empty">No quotations yet.</td></tr>';el('salesOrdersBody').innerHTML=so.map(row).join('')||'<tr><td colspan="7" class="accounting-empty">No sales orders yet.</td></tr>';document.querySelectorAll('.sales-confirm-btn').forEach(b=>b.onclick=()=>confirmOrder(b.dataset.id));document.querySelectorAll('.sales-invoice-btn').forEach(b=>b.onclick=()=>createInvoice(b.dataset.id));document.querySelectorAll('.sales-cancel-btn').forEach(b=>b.onclick=()=>cancelOrder(b.dataset.id));}
  function showTab(tab){state.tab=tab;document.querySelectorAll('[data-sales-tab]').forEach(b=>b.classList.toggle('active',b.dataset.salesTab===tab));document.querySelectorAll('[data-sales-panel]').forEach(p=>p.hidden=p.dataset.salesPanel!==tab);}
  function crmTodayPlus(days){const d=new Date();d.setDate(d.getDate()+days);return d.toISOString().slice(0,10);}
  const CRM_STAGES=['PROSPECT','CONTACTED','MEETING','TECHNICAL PRESENTATION','SPECIFICATION','RFQ','QUOTATION','NEGOTIATION','PO','WON'];
  function crmStageClass(stage){return 'crm-stage-'+stage.toLowerCase().replace(/[^a-z0-9]+/g,'-');}
  function crmPriorityClass(p){return 'crm-priority-'+String(p||'WARM').toLowerCase();}
  function renderCRM(){
    const c=state.crm||{},os=c.opportunities||[],as=c.accounts||[],acts=c.activities||[];
    const hot=os.filter(o=>o.lead_status==='HOT').length;
    const due=acts.filter(a=>a.status==='PLANNED'&&a.due_date&&a.due_date<=today()).length;
    const meetings=os.filter(o=>['MEETING','TECHNICAL PRESENTATION'].includes(o.stage)).length;
    const target=os.reduce((n,o)=>n+Number(o.estimated_project_value||0),0);
    if(el('crmMetricHot'))el('crmMetricHot').textContent=hot;
    if(el('crmMetricDue'))el('crmMetricDue').textContent=due;
    if(el('crmMetricMeetings'))el('crmMetricMeetings').textContent=meetings;
    if(el('crmMetricTarget'))el('crmMetricTarget').textContent=money(target);
    const board=el('salesExecutionBoard');
    if(board){
      board.innerHTML=CRM_STAGES.slice(0,8).map(stage=>{
        const items=os.filter(o=>o.stage===stage);
        return '<div class="crm-column '+crmStageClass(stage)+'"><div class="crm-column-head"><b>'+esc(stage)+'</b><span>'+items.length+'</span></div><div class="crm-column-body">'+(items.length?items.map(o=>{
          const a=o.sales_accounts||{},p=o.sales_projects||{};
          const next=CRM_STAGES[Math.min(CRM_STAGES.indexOf(stage)+1,CRM_STAGES.length-1)];
          return '<article class="crm-card"><div class="crm-card-top"><span class="crm-priority '+crmPriorityClass(a.priority||o.lead_status)+'">'+esc(a.priority||o.lead_status)+'</span><span class="crm-card-product">'+esc(o.product)+'</span></div><strong>'+esc(a.company_name||'—')+'</strong><small>'+esc(p.project_name||o.opportunity_name)+'</small><div class="crm-card-meta"><span>'+esc(o.sales_strategy)+'</span><span>Follow-up '+esc(o.next_follow_up||'—')+'</span></div><p>'+esc(o.next_action||'No next action')+'</p><div class="crm-card-actions"><button type="button" class="crm-action crm-done" data-id="'+o.id+'">Done</button><button type="button" class="crm-action crm-advance" data-id="'+o.id+'" data-next="'+esc(next)+'">→ '+esc(next)+'</button></div></article>';
        }).join(''):'<div class="crm-empty">No opportunities</div>')+'</div></div>';
      }).join('');
    }
    if(el('salesAccountsBody'))el('salesAccountsBody').innerHTML=as.map(a=>'<tr><td><b>'+esc(a.company_name)+'</b></td><td>'+esc(a.contact_department||'—')+'</td><td>'+esc(a.public_email||'—')+'</td><td>'+esc(a.public_phone||'—')+'</td><td><span class="crm-priority '+crmPriorityClass(a.priority)+'">'+esc(a.priority)+'</span></td></tr>').join('')||'<tr><td colspan="5" class="accounting-empty">No accounts.</td></tr>';
    if(el('salesActivitiesBody'))el('salesActivitiesBody').innerHTML=acts.slice().sort((a,b)=>String(a.due_date||'').localeCompare(String(b.due_date||''))).map(a=>'<tr><td>'+esc(a.due_date||'—')+'</td><td><b>'+esc(a.sales_opportunities?.sales_accounts?.company_name||'—')+'</b><br><small>'+esc(a.sales_opportunities?.opportunity_name||'')+'</small></td><td>'+esc(a.subject)+'</td><td><span class="crm-activity-status crm-activity-'+String(a.status).toLowerCase()+'">'+esc(a.status)+'</span></td><td>'+(a.status==='PLANNED'?'<button type="button" class="accounting-small-btn crm-activity-done" data-id="'+a.id+'" data-opp="'+a.opportunity_id+'">Mark done</button>':'✓')+'</td></tr>').join('')||'<tr><td colspan="5" class="accounting-empty">No activities.</td></tr>';
    document.querySelectorAll('.crm-done').forEach(b=>b.onclick=()=>completeNextCRMActivity(b.dataset.id));
    document.querySelectorAll('.crm-advance').forEach(b=>b.onclick=()=>advanceCRMStage(b.dataset.id,b.dataset.next));
    document.querySelectorAll('.crm-activity-done').forEach(b=>b.onclick=()=>completeCRMActivity(b.dataset.id,b.dataset.opp));
  }
  async function loadCRM(){
    if(!client())return;
    const [a,p,o,acts]=await Promise.all([
      client().from('sales_accounts').select('*').eq('is_active',true).order('priority').order('company_name'),
      client().from('sales_projects').select('*').order('project_name'),
      client().from('sales_opportunities').select('*,sales_accounts(company_name,priority,public_email,public_phone,contact_department),sales_projects(project_name,location,project_status)').order('next_follow_up',{ascending:true}),
      client().from('sales_activities').select('*,sales_opportunities(opportunity_name,sales_accounts(company_name))').order('due_date',{ascending:true})
    ]);
    for(const r of [a,p,o,acts])if(r.error)throw r.error;
    state.crm={accounts:a.data||[],projects:p.data||[],opportunities:o.data||[],activities:acts.data||[]};
    renderCRM();
  }
  async function completeCRMActivity(id,oppId){
    const {error}=await client().from('sales_activities').update({status:'DONE'}).eq('id',id);
    if(error)return alert(error.message);
    const next=state.crm.activities.filter(a=>a.opportunity_id===oppId&&a.status==='PLANNED'&&a.id!==id).sort((x,y)=>String(x.due_date||'').localeCompare(String(y.due_date||'')))[0];
    await client().from('sales_opportunities').update({last_contact:today(),next_follow_up:next?.due_date||null}).eq('id',oppId);
    await loadCRM();
  }
  async function completeNextCRMActivity(oppId){
    const a=state.crm.activities.filter(x=>x.opportunity_id===oppId&&x.status==='PLANNED').sort((x,y)=>String(x.due_date||'').localeCompare(String(y.due_date||'')))[0];
    if(a)return completeCRMActivity(a.id,oppId);
    alert('No planned activity found for this opportunity.');
  }
  async function advanceCRMStage(id,next){
    if(!next||next==='WON')return;
    const {error}=await client().from('sales_opportunities').update({stage:next,next_action:'Execute '+next+' step',next_follow_up:crmTodayPlus(3)}).eq('id',id);
    if(error)return alert(error.message);
    await client().from('sales_activities').insert({opportunity_id:id,activity_type:'FOLLOW-UP',subject:'Follow-up after stage → '+next,activity_date:today(),due_date:crmTodayPlus(3),status:'PLANNED',notes:'Follow up after advancing the opportunity.'});
    await loadCRM();
  }
  function bind(){document.querySelectorAll('[data-sales-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.salesTab));el('salesForm')?.addEventListener('submit',createQuotation);el('addSalesLine')?.addEventListener('click',()=>{el('salesLines').insertAdjacentHTML('beforeend',lineHtml(el('salesLines').children.length));updatePreview();});el('salesLines')?.addEventListener('click',e=>{if(e.target.classList.contains('sales-line-remove')){const rows=el('salesLines').querySelectorAll('.sales-line');if(rows.length>1)e.target.closest('.sales-line').remove();updatePreview();}});el('salesLines')?.addEventListener('input',updatePreview);el('salesRefresh')?.addEventListener('click',()=>Promise.all([load(),loadCRM()]).catch(e=>alert(e.message)));
    el('salesCrmRefresh')?.addEventListener('click',()=>loadCRM().catch(e=>alert(e.message)));el('salesDate').value=today();el('salesLines').innerHTML=lineHtml(0);updatePreview();document.querySelector('.side-link[data-view="sales"]')?.addEventListener('click',()=>setTimeout(()=>Promise.all([load(),loadCRM()]).catch(console.warn),50));}
  function init(){if(!el('view-sales'))return;bind();if(client())Promise.all([load(),loadCRM()]).catch(e=>console.warn('Sales init:',e));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();