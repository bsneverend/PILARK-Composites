(function(){
  const cms=()=>window.PILARK_CMS;
  const client=()=>cms()?.client;
  const el=id=>document.getElementById(id);
  const today=()=>new Date().toISOString().slice(0,10);
  const money=v=>'Rp'+Number(v||0).toLocaleString('id-ID',{maximumFractionDigits:2});
  const moneyCompact=v=>{const n=Number(v||0);if(!n)return 'Rp0';if(n>=1e12)return 'Rp'+(n/1e12).toLocaleString('id-ID',{maximumFractionDigits:2})+' T';if(n>=1e9)return 'Rp'+(n/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' B';if(n>=1e6)return 'Rp'+(n/1e6).toLocaleString('id-ID',{maximumFractionDigits:2})+' Jt';if(n>=1e3)return 'Rp'+(n/1e3).toLocaleString('id-ID',{maximumFractionDigits:1})+' Rb';return money(n);};
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
  function render(){const q=state.orders.filter(o=>['quotation','sent'].includes(o.status)),so=state.orders.filter(o=>o.status==='sales_order');el('salesMetricQuotations').textContent=q.length;el('salesMetricOrders').textContent=so.length;el('salesMetricValue').textContent=money(state.orders.reduce((n,o)=>n+Number(o.total_amount||0),0));el('salesMetricOpen').textContent=money(so.reduce((n,o)=>n+Number(o.total_amount||0),0));if(el('salesQuotationsBody'))el('salesQuotationsBody').innerHTML=q.map(row).join('')||'<tr><td colspan="7" class="accounting-empty">No quotations yet.</td></tr>';if(el('salesOrdersBody'))el('salesOrdersBody').innerHTML=so.map(row).join('')||'<tr><td colspan="7" class="accounting-empty">No sales orders yet.</td></tr>';document.querySelectorAll('.sales-confirm-btn').forEach(b=>b.onclick=()=>confirmOrder(b.dataset.id));document.querySelectorAll('.sales-invoice-btn').forEach(b=>b.onclick=()=>createInvoice(b.dataset.id));document.querySelectorAll('.sales-cancel-btn').forEach(b=>b.onclick=()=>cancelOrder(b.dataset.id));}
  function showTab(tab){state.tab=tab;document.querySelectorAll('[data-sales-tab]').forEach(b=>b.classList.toggle('active',b.dataset.salesTab===tab));document.querySelectorAll('[data-sales-panel]').forEach(p=>{
      const active=p.dataset.salesPanel===tab;
      if(active){p.hidden=false;p.removeAttribute('hidden');p.style.setProperty('display','block','important');}
      else{p.hidden=true;p.setAttribute('hidden','');p.style.setProperty('display','none','important');}
    });}
  function crmTodayPlus(days){const d=new Date();d.setDate(d.getDate()+days);return d.toISOString().slice(0,10);}
  const CRM_STAGES=['PROSPECT','CONTACTED','MEETING','TECHNICAL PRESENTATION','SPECIFICATION','RFQ','QUOTATION','NEGOTIATION','PO','WON'];
  function crmStageClass(stage){return 'crm-stage-'+stage.toLowerCase().replace(/[^a-z0-9]+/g,'-');}
  function crmPriorityClass(p){return 'crm-priority-'+String(p||'WARM').toLowerCase();}
  function crmContactCandidates(o){
    const contacts=(state.crm.contacts||[]).filter(x=>x.account_id===o?.account_id&&x.is_active!==false);
    const rank={HIGH:0,MEDIUM:1,LOW:2};
    return contacts.slice().sort((x,y)=>{
      const px=x.project_id===o?.project_id?0:(x.project_id?1:2), py=y.project_id===o?.project_id?0:(y.project_id?1:2);
      const cx=rank[x.confidence]??9, cy=rank[y.confidence]??9;
      const rx=(x.whatsapp_phone||x.mobile_phone||x.phone||x.email||x.linkedin_url)?0:1;
      const ry=(y.whatsapp_phone||y.mobile_phone||y.phone||y.email||y.linkedin_url)?0:1;
      return px-py||cx-cy||rx-ry;
    });
  }
  function crmBestContact(o){
    const list=crmContactCandidates(o);
    if(list[0])return list[0];
    const a=o?.sales_accounts||{};
    if(a.public_email||a.public_phone||a.contact_person||a.contact_department){
      return {id:null,account_id:o?.account_id,contact_person:a.contact_person||a.contact_department||'Company contact',department:a.contact_department,email:a.public_email,phone:a.public_phone,mobile_phone:a.mobile_phone,whatsapp_phone:a.whatsapp_phone,linkedin_url:a.linkedin_url,confidence:a.contact_confidence||'—',source_name:'Account public contact',is_account_fallback:true};
    }
    return null;
  }
  function crmWhatsAppNumber(value){
    const d=String(value||'').replace(/[^0-9]/g,'');
    if(!d)return '';
    return d.startsWith('0')?'62'+d.slice(1):d;
  }
  function crmWhatsAppMessage(o,contact){
    const a=o?.sales_accounts||{},p=o?.sales_projects||{};
    const name=contact?.contact_person||contact?.department||a.contact_department||'Pak/Bu';
    const project=p.project_name||o?.opportunity_name||'project';
    const product=o?.product||'GFRP / FRP / GRP solution';
    let focus='technical characteristics, application suitability and project references';
    if(/Jacking/i.test(product))focus='GRP Jacking Pipe configuration, stiffness, allowable jacking force, joint system and installation approach';
    else if(/Sheet Pile/i.test(product))focus='FRP Sheet Pile structural performance and installation approach for river, marine or flood-control works';
    else if(/Rebar/i.test(product))focus='GFRP Rebar application, corrosion resistance and structural considerations';
    return 'Dear '+name+',\\n\\nI am reaching out from PILARK Composite (PT. Panca Integra Laguna Reksa, ORI Group). We develop engineered GFRP / FRP / GRP solutions for infrastructure applications.\\n\\nWe would like to introduce our '+product+' solution in relation to '+project+'. We would be pleased to share '+focus+' for your engineering review.\\n\\nMay I send a short technical introduction to the appropriate Engineering / Project / Procurement team?\\n\\nThank you.';
  }
  function crmActivityTargetStage(type){
    const map={
      'FIRST CONTACT':'CONTACTED',
      'EMAIL':'CONTACTED',
      'WHATSAPP':'CONTACTED',
      'CALL':'CONTACTED',
      'MEETING':'MEETING',
      'TECHNICAL PRESENTATION':'TECHNICAL PRESENTATION',
      'SPECIFICATION':'SPECIFICATION',
      'RFQ':'RFQ',
      'QUOTATION':'QUOTATION',
      'NEGOTIATION':'NEGOTIATION',
      'PO':'PO'
    };
    return map[String(type||'').toUpperCase()]||null;
  }
  async function ensureFirstContactStage(o,channel,name){
    if(o?.stage!=='PROSPECT')return;
    const followDate=crmTodayPlus(3);
    const {error}=await client().from('sales_opportunities').update({
      stage:'CONTACTED',
      last_contact:null,
      next_action:'Follow up after first contact',
      next_follow_up:followDate
    }).eq('id',o.id);
    if(error)throw error;
    const {data:existing,error:existingError}=await client().from('sales_activities')
      .select('id')
      .eq('opportunity_id',o.id)
      .eq('status','PLANNED')
      .eq('subject','Follow-up after first contact')
      .limit(1);
    if(existingError)throw existingError;
    if(!existing?.length){
      const {error:followError}=await client().from('sales_activities').insert({
        opportunity_id:o.id,
        activity_type:'FOLLOW-UP',
        subject:'Follow-up after first contact',
        activity_date:today(),
        due_date:followDate,
        status:'PLANNED',
        notes:'Automatic follow-up created after '+channel+' contact initiation with '+name+'.'
      });
      if(followError)throw followError;
    }
  }
  async function logCRMContactInitiated(o,contact,channel,detail){
    const name=contact?.contact_person||contact?.department||o?.sales_accounts?.contact_department||'company contact';
    const subject=channel+' contact initiated — '+name;
    const notes=detail+'\\nContact: '+name+(contact?.position?' · '+contact.position:'')+(contact?.source_name?'\\nSource: '+contact.source_name:'')+'\\nStatus remains PLANNED until the salesperson confirms the actual conversation/contact.';
    const {error}=await client().from('sales_activities').insert({
      opportunity_id:o.id,
      activity_type:channel==='WHATSAPP'?'WHATSAPP':channel==='CALL'?'CALL':'NOTE',
      subject,
      activity_date:today(),
      due_date:today(),
      status:'PLANNED',
      notes
    });
    if(error)throw error;
    await ensureFirstContactStage(o,channel,name);
  }
  async function syncCRMStageFromCompletedActivity(o,activityType,completedId){
    const target=crmActivityTargetStage(activityType);
    if(!target||!o||['WON','LOST'].includes(o.stage))return;
    const currentIndex=CRM_STAGES.indexOf(o.stage),targetIndex=CRM_STAGES.indexOf(target);
    if(currentIndex<0||targetIndex<=currentIndex)return;
    const {data:planned,error:plannedError}=await client().from('sales_activities')
      .select('id,due_date,subject')
      .eq('opportunity_id',o.id)
      .eq('status','PLANNED')
      .not('due_date','is',null)
      .order('due_date',{ascending:true});
    if(plannedError)throw plannedError;
    const next=(planned||[]).find(x=>x.id!==completedId);
    const {error}=await client().from('sales_opportunities').update({
      stage:target,
      next_action:next?.subject||'Execute '+target+' step',
      next_follow_up:next?.due_date||null
    }).eq('id',o.id);
    if(error)throw error;
  }
  async function handleCRMContactAction(oppId,contactId,channel){
    const o=(state.crm.opportunities||[]).find(x=>x.id===oppId); if(!o)return;
    const candidates=crmContactCandidates(o);
    const contact=candidates.find(x=>x.id===contactId)||crmBestContact(o);
    if(!contact)return;
    try{
      if(channel==='EMAIL'){
        openCRMActivityModal(null,oppId,'EMAIL');
        return;
      }
      if(channel==='WHATSAPP'){
        const number=crmWhatsAppNumber(contact.whatsapp_phone||contact.mobile_phone);
        if(!number)return alert('No WhatsApp/mobile number is available for this contact.');
        const message=crmWhatsAppMessage(o,contact);
        await logCRMContactInitiated(o,contact,'WHATSAPP','WhatsApp draft opened with a product/stage-specific introduction.');
        window.open('https://wa.me/'+number+'?text='+encodeURIComponent(message),'_blank','noopener');
        await loadCRM();
        renderOpportunityDetail(oppId);
        return;
      }
      if(channel==='CALL'){
        const phone=String(contact.phone||contact.mobile_phone||'').trim();
        if(!phone)return alert('No phone number is available for this contact.');
        await logCRMContactInitiated(o,contact,'CALL','Call route opened for the verified business contact.');
        window.location.href='tel:'+phone.replace(/[^+0-9]/g,'');
        return;
      }
      if(channel==='REQUEST_PIC'){
        const fallback=crmBestContact(o)||{contact_person:o?.sales_accounts?.contact_department||'Company switchboard',department:o?.sales_accounts?.contact_department||'Engineering / Project / Procurement'};
        await logCRMContactInitiated(o,fallback,'CALL','No verified individual contact is available. Call the company route and request the appropriate Engineering / Project / Procurement PIC.');
        await loadCRM();
        renderOpportunityDetail(oppId);
        return;
      }
      if(channel==='LINKEDIN'){
        if(!contact.linkedin_url)return alert('No LinkedIn URL is available for this contact.');
        await logCRMContactInitiated(o,contact,'LINKEDIN','LinkedIn profile/company route opened for the verified business contact.');
        window.open(contact.linkedin_url,'_blank','noopener');
        await loadCRM();
        renderOpportunityDetail(oppId);
      }
    }catch(err){alert(err.message||'Unable to initiate contact route.');}
  }
  async function loadAiSalesActionPlan(opportunityId){const {data,error}=await client().from('sales_ai_action_plans').select('*').eq('opportunity_id',opportunityId).maybeSingle();if(error)throw error;return data||null;}
function actionPlanScoreClass(score){return Number(score)>=80?'high':Number(score)>=60?'medium':'low';}
function renderAiSalesActionPlan(plan){const box=el('crmAiSalesPlan');if(!box)return;if(!plan){box.innerHTML='<div class="crm-ai-plan-empty">No AI sales action plan yet. Click <b>Generate AI Sales Action Plan</b>.</div>';return;}const bd=plan.score_breakdown||{},targets=Array.isArray(plan.target_stakeholders)?plan.target_stakeholders:[],steps=Array.isArray(plan.sales_steps)?plan.sales_steps:[],prep=Array.isArray(plan.preparation_items)?plan.preparation_items:[],risks=Array.isArray(plan.risks)?plan.risks:[],qs=Array.isArray(plan.questions_to_ask)?plan.questions_to_ask:[];const dims={Project:bd.project_confirmed,Product:bd.product_fit,'Project Value':bd.project_value,Procurement:bd.procurement_activity,Stakeholders:bd.stakeholder_access,Contacts:bd.contact_availability,Timing:bd.timing,'Strategic Fit':bd.strategic_fit};box.innerHTML='<div class="crm-ai-plan-head"><div><span>Opportunity Score</span><strong class="crm-ai-score '+actionPlanScoreClass(plan.score)+'">'+Number(plan.score||0)+'/100</strong></div><button type="button" class="accounting-small-btn" id="crmAiSalesPlanRegenerate">↻ Regenerate</button></div><p class="crm-ai-plan-summary">'+esc(plan.summary||'')+'</p><div class="crm-ai-plan-grid">'+Object.entries(dims).map(([k,v])=>'<div><span>'+esc(k)+'</span><b>'+Number(v||0)+'/10</b></div>').join('')+'</div><div class="crm-ai-plan-section"><h4>Why this is attractive</h4><p>'+esc(plan.why_attractive||'—')+'</p></div><div class="crm-ai-plan-section"><h4>Recommended next action</h4><div class="crm-ai-next-action">'+esc(plan.recommended_next_action||'—')+'</div></div><div class="crm-ai-plan-section"><h4>Target stakeholders</h4><div class="crm-ai-plan-list">'+(targets.length?targets.map(x=>'<div><b>'+esc(x.organization||'—')+'</b><span>'+esc(x.stakeholder_type||'OTHER')+' · '+esc(x.person||'Route')+' · '+esc(x.priority||'—')+'</span><p>'+esc(x.objective||'')+'</p></div>').join(''):'<div class="crm-ai-plan-empty">No stakeholders identified yet.</div>')+'</div></div><div class="crm-ai-plan-section"><h4>Sales steps</h4><ol class="crm-ai-plan-steps">'+steps.map(x=>'<li><b>'+esc(x.title||'Step')+'</b><span>'+esc(x.action||'')+'</span><small>Owner: '+esc(x.owner||'Sales')+' · Success: '+esc(x.success_signal||'')+'</small></li>').join('')+'</ol></div><div class="crm-ai-plan-columns"><div><h4>Prepare</h4><ul>'+prep.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div><div><h4>Questions</h4><ul>'+qs.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div><div><h4>Risks</h4><ul>'+risks.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div></div><small class="crm-ai-plan-generated">Generated '+esc(plan.generated_at||'')+'</small>';el('crmAiSalesPlanRegenerate')?.addEventListener('click',()=>runAiSalesActionPlan(plan.opportunity_id));}
async function runAiSalesActionPlan(opportunityId){const o=(state.crm.opportunities||[]).find(x=>x.id===opportunityId);if(!o)return;const box=el('crmAiSalesPlan');if(!box)return;box.innerHTML='<div class="crm-ai-plan-loading">✦ AI is analyzing the project, product fit, value, procurement, stakeholders and contacts…</div>';try{const p=o.sales_projects||((state.crm.projects||[]).find(x=>x.id===o.project_id)||{});const stake=await client().from('sales_project_contacts').select('*').eq('project_id',o.project_id||'').order('confidence',{ascending:false});if(stake.error)throw stake.error;const {data:userData}=await client().auth.getUser();const payload={opportunity:{id:o.id,name:o.opportunity_name,product:o.product,application:o.application,sales_strategy:o.sales_strategy,stage:o.stage,priority:o.lead_status,probability:o.probability,estimated_quantity:o.estimated_quantity,estimated_project_value:o.estimated_project_value,project_value_amount:o.project_value_amount,project_value_currency:o.project_value_currency,project_value_type:o.project_value_type,project_value_idr:o.project_value_idr,current_material:o.current_material,potential_alternative:o.potential_alternative,technical_requirement:o.technical_requirement,next_action:o.next_action,next_follow_up:o.next_follow_up},project:{id:p.id,name:p.project_name,owner:p.project_owner,location:p.location,type:p.project_type,status:p.project_status,source_url:p.source_url,value:p.project_value,start_date:p.start_date,end_date:p.end_date,notes:p.notes},stakeholders:stake.data||[],contacts:crmContactCandidates(o).slice(0,20)};const {data,error}=await client().functions.invoke('sales-ai-action-plan',{body:payload});if(error)throw error;if(data?.error)throw new Error(data.error);const row={opportunity_id:o.id,project_id:o.project_id||null,score:Number(data.score||0),score_breakdown:data.score_breakdown||{},summary:data.summary||'',why_attractive:data.why_attractive||'',recommended_next_action:data.recommended_next_action||'',target_stakeholders:data.target_stakeholders||[],sales_steps:data.sales_steps||[],preparation_items:data.preparation_items||[],risks:data.risks||[],questions_to_ask:data.questions_to_ask||[],ai_model:data.ai_model||null,generated_at:new Date().toISOString(),created_by:userData?.user?.id||null,updated_at:new Date().toISOString()};const up=await client().from('sales_ai_action_plans').upsert(row,{onConflict:'opportunity_id'}).select('*').single();if(up.error)throw up.error;renderAiSalesActionPlan(up.data);}catch(e){box.innerHTML='<div class="crm-ai-plan-error">AI sales action plan failed: '+esc(e?.message||'Unknown error')+'</div>';}}
function renderOpportunityDetail(id){
    const o=(state.crm.opportunities||[]).find(x=>x.id===id); if(!o)return;
    const a=o.sales_accounts||{},p=o.sales_projects||{};
    const acts=(state.crm.activities||[]).filter(x=>x.opportunity_id===id).sort((x,y)=>String(y.due_date||'').localeCompare(String(x.due_date||'')));
    const contacts=crmContactCandidates(o);
    const best=crmBestContact(o);
    const modal=el('salesOpportunityModal'); if(!modal)return;
    const contactRows=contacts.slice(0,4).map(c=>{
      const wa=crmWhatsAppNumber(c.whatsapp_phone||c.mobile_phone);
      return '<div class="crm-route-contact">'+
        '<div class="crm-route-contact-main"><strong>'+esc(c.contact_person||'Business contact')+'</strong><span>'+esc(c.position||c.department||'Business contact')+(c.project_id===o.project_id?' · Project matched':'')+'</span><small>'+esc(c.confidence||'—')+(c.source_name?' · '+esc(c.source_name):'')+'</small></div>'+
        '<div class="crm-route-actions">'+
          (c.email?'<button type="button" class="crm-route-btn" data-action="EMAIL" data-opp="'+o.id+'" data-contact="'+c.id+'">✉ Email</button>':'')+
          (wa?'<button type="button" class="crm-route-btn" data-action="WHATSAPP" data-opp="'+o.id+'" data-contact="'+c.id+'">◉ WhatsApp</button>':'')+
          ((c.phone||c.mobile_phone)?'<button type="button" class="crm-route-btn" data-action="CALL" data-opp="'+o.id+'" data-contact="'+c.id+'">☎ Call</button>':'')+
          (c.linkedin_url?'<button type="button" class="crm-route-btn" data-action="LINKEDIN" data-opp="'+o.id+'" data-contact="'+c.id+'">LinkedIn ↗</button>':'')+
        '</div></div>';
    }).join('');
    const bestName=best?.contact_person||a.contact_person||a.contact_department||'No individual contact';
    const bestRole=best?.position||best?.department||a.contact_department||'';
    const bestSource=best?.source_name||a.contact_source||'';
    el('crmDetailTitle').textContent=a.company_name||'Opportunity';
    el('crmDetailSubtitle').textContent=o.opportunity_name||'';
    el('crmDetailBody').innerHTML='<div class="crm-detail-grid">'+
      '<div class="crm-detail-main">'+
        '<div class="crm-detail-kpis"><div><span>Stage</span><b>'+esc(o.stage)+'</b></div><div><span>Priority</span><b>'+esc(o.lead_status)+'</b></div><div><span>Probability</span><b>'+Number(o.probability||0)+'%</b></div><div><span>Product</span><b>'+esc(o.product)+'</b></div></div>'+
        '<div class="crm-detail-section"><h3>Project</h3><p><b>'+esc(p.project_name||o.opportunity_name)+'</b><br>'+esc(p.location||'—')+' · '+esc(p.project_status||'—')+'</p><p>'+esc(o.application||'')+'</p></div>'+
        '<div class="crm-detail-section"><h3>Technical focus</h3><p>'+esc(o.technical_requirement||'Not defined')+'</p><div class="crm-detail-two"><div><span>Current material</span><b>'+esc(o.current_material||'—')+'</b></div><div><span>Potential alternative</span><b>'+esc(o.potential_alternative||'—')+'</b></div></div></div>'+
        '<div class="crm-detail-section"><h3>Recommended approach</h3><p>'+esc(o.first_contact_message||'—')+'</p><div class="crm-detail-attachment"><span>Attachment</span><b>'+esc(o.recommended_attachment||'—')+'</b></div></div>'+
        '<div class="crm-detail-section crm-ai-sales-plan-section"><div class="crm-ai-plan-title-row"><div><h3>AI Sales Intelligence</h3><p class="crm-ai-plan-intro">Turn project, value, stakeholder and contact intelligence into a prioritized sales action plan.</p></div><button type="button" class="primary-btn" id="crmAiSalesPlanGenerate">✦ Generate AI Sales Action Plan</button></div><div id="crmAiSalesPlan"></div></div><div class="crm-detail-section"><h3>Activity history</h3><div class="crm-timeline">'+(acts.map(x=>'<div class="crm-timeline-item"><div class="crm-timeline-dot"></div><div><b>'+esc(x.subject)+'</b><span>'+esc(x.activity_type)+' · '+esc(x.due_date||x.activity_date||'—')+' · '+esc(x.status)+'</span><p>'+esc(x.notes||'')+'</p></div></div>').join('')||'<p class="crm-empty">No activity yet.</p>')+'</div></div>'+
      '</div>'+
      '<aside class="crm-detail-side">'+
        '<div><h3>Contact routing</h3><b>'+esc(bestName)+'</b><span>'+esc(bestRole)+'</span><small>Confidence: '+esc(best?.confidence||a.contact_confidence||'—')+(bestSource?' · '+esc(bestSource):'')+'</small>'+
          '<div class="crm-route-primary">'+
            (best?.email||a.public_email?'<button type="button" class="crm-route-primary-btn" data-action="EMAIL" data-opp="'+o.id+'" data-contact="'+esc(best?.id||'')+'">✉ Email Contact</button>':'')+
            (best?.whatsapp_phone||best?.mobile_phone||a.whatsapp_phone||a.mobile_phone?'<button type="button" class="crm-route-primary-btn" data-action="WHATSAPP" data-opp="'+o.id+'" data-contact="'+esc(best?.id||'')+'">◉ WhatsApp</button>':'')+
            (best?.phone||best?.mobile_phone||a.public_phone?'<button type="button" class="crm-route-primary-btn" data-action="CALL" data-opp="'+o.id+'" data-contact="'+esc(best?.id||'')+'">☎ Call</button>':'')+
            (best?.linkedin_url||a.linkedin_url?'<button type="button" class="crm-route-primary-btn" data-action="LINKEDIN" data-opp="'+o.id+'" data-contact="'+esc(best?.id||'')+'">LinkedIn ↗</button>':'')+
          '</div>'+
          '<div class="crm-route-status">'+(best?'Primary route selected using project match, verification confidence and available contact channels.':'No direct contact found — request the appropriate PIC.')+'</div>'+
          '<button type="button" class="crm-route-request" data-action="REQUEST_PIC" data-opp="'+o.id+'">☎ Request Engineering / Project / Procurement PIC</button>'+
        '</div>'+
        '<div><h3>Available contacts</h3><div class="crm-route-list">'+(contactRows||'<div class="crm-research-empty">No individual contact stored. Use Research Contacts to find a verified business PIC.</div>')+'</div><button type="button" class="text-btn crm-route-research">+ Research / Add Contact</button></div>'+
        '<div><h3>Next action</h3><p>'+esc(o.next_action||'—')+'</p><b>Follow-up: '+esc(o.next_follow_up||'—')+'</b></div>'+
        '<div class="crm-detail-buttons"><button type="button" class="primary-btn crm-detail-advance" data-id="'+o.id+'">Advance Stage →</button><button type="button" class="accounting-small-btn crm-detail-done" data-id="'+o.id+'">Complete next activity</button><button type="button" class="accounting-small-btn crm-detail-won" data-id="'+o.id+'">✓ Mark Won</button><button type="button" class="accounting-small-btn crm-detail-lost" data-id="'+o.id+'">Mark Lost</button></div>'+
      '</aside>'+
      '</div>';
    modal.hidden=false;
    el('crmDetailClose').onclick=()=>modal.hidden=true;
    modal.querySelector('.crm-detail-advance').onclick=()=>advanceCRMStage(o.id,CRM_STAGES[Math.min(CRM_STAGES.indexOf(o.stage)+1,CRM_STAGES.length-1)]);
    const aiPlanBox=el('crmAiSalesPlan');if(aiPlanBox){loadAiSalesActionPlan(o.id).then(plan=>{renderAiSalesActionPlan(plan);if(!plan)el('crmAiSalesPlanGenerate')?.addEventListener('click',()=>runAiSalesActionPlan(o.id));}).catch(()=>renderAiSalesActionPlan(null));}
    modal.querySelector('.crm-detail-done').onclick=()=>completeNextCRMActivity(o.id);
    modal.querySelector('.crm-route-research')?.addEventListener('click',()=>openContactResearchModal(o.account_id));
    modal.querySelectorAll('.crm-route-btn,.crm-route-primary-btn,.crm-route-request').forEach(b=>b.onclick=()=>handleCRMContactAction(b.dataset.opp,b.dataset.contact||'',b.dataset.action));
  }
  function renderCRM(){
    const c=state.crm||{},os=c.opportunities||[],as=c.accounts||[],acts=c.activities||[];
    const hot=os.filter(o=>o.lead_status==='HOT').length;
    const due=acts.filter(a=>a.status==='PLANNED'&&a.due_date&&a.due_date<=today()).length;
    const meetings=os.filter(o=>['MEETING','TECHNICAL PRESENTATION'].includes(o.stage)).length;
    const target=os.reduce((n,o)=>n+Number(o.project_value_idr||((o.project_value_currency||'IDR')==='IDR'?o.estimated_project_value:0)||0),0);
    if(el('crmMetricHot'))el('crmMetricHot').textContent=hot;
    if(el('crmMetricDue'))el('crmMetricDue').textContent=due;
    if(el('crmMetricMeetings'))el('crmMetricMeetings').textContent=meetings;
    if(el('crmMetricTarget'))el('crmMetricTarget').textContent=moneyCompact(target);
    const board=el('salesExecutionBoard');
    if(board){
      board.innerHTML=CRM_STAGES.map(stage=>{
        const items=os.filter(o=>o.stage===stage);
        return '<div class="crm-column '+crmStageClass(stage)+'"><div class="crm-column-head"><b>'+esc(stage)+'</b><span>'+items.length+'</span></div><div class="crm-column-body">'+(items.length?items.map(o=>{
          const a=o.sales_accounts||{},p=o.sales_projects||{};
          const next=CRM_STAGES[Math.min(CRM_STAGES.indexOf(stage)+1,CRM_STAGES.length-1)];
          return '<article class="crm-card" data-opp-id="'+o.id+'"><button type="button" class="crm-card-open" data-id="'+o.id+'" aria-label="Open opportunity">↗</button><div class="crm-card-top"><span class="crm-priority '+crmPriorityClass(a.priority||o.lead_status)+'">'+esc(a.priority||o.lead_status)+'</span><span class="crm-card-product">'+esc(o.product)+'</span></div><strong>'+esc(a.company_name||'—')+'</strong><small>'+esc(p.project_name||o.opportunity_name)+'</small><div class="crm-card-meta"><span>'+esc(o.sales_strategy)+'</span><span>Follow-up '+esc(o.next_follow_up||'—')+'</span></div><p>'+esc(o.next_action||'No next action')+'</p><div class="crm-card-actions"><button type="button" class="crm-action crm-done" data-id="'+o.id+'">Done</button>'+(CRM_STAGES.indexOf(stage)>0?'<button type="button" class="crm-action crm-undo" data-id="'+o.id+'">↶ Undo</button>':'')+(CRM_STAGES.indexOf(stage)<CRM_STAGES.length-1?'<button type="button" class="crm-action crm-advance" data-id="'+o.id+'" data-next="'+esc(next)+'">→ '+esc(next)+'</button>':'')+'</div></article>';
        }).join(''):'<div class="crm-empty">No opportunities</div>')+'</div></div>';
      }).join('');
    }
    if(el('salesAccountsBody'))el('salesAccountsBody').innerHTML=as.map(a=>{
      const cs=(c.contacts||[]).filter(x=>x.account_id===a.id);
      const rank={HIGH:0,MEDIUM:1,LOW:2}; const best=cs.slice().sort((x,y)=>(rank[x.confidence]??9)-(rank[y.confidence]??9))[0];
      const email=best?.email||a.public_email, phone=best?.phone||a.public_phone, mobile=best?.whatsapp_phone||best?.mobile_phone||a.whatsapp_phone||a.mobile_phone, linkedin=best?.linkedin_url||a.linkedin_url;
      const route=best?.preferred_channel||((best?.whatsapp_phone||best?.mobile_phone)?'WhatsApp':(best?.phone||a.public_phone)?'Call':email?'Email':linkedin?'LinkedIn':'Request PIC');
      return '<tr><td><b>'+esc(a.company_name)+'</b><br><small>'+esc(best?.contact_person||a.contact_person||a.contact_department||'—')+'</small></td><td>'+esc(best?.department||a.contact_department||'—')+'</td><td>'+(email?'<a href="mailto:'+esc(email)+'">'+esc(email)+'</a>':'—')+'</td><td>'+(phone?'<a href="tel:'+esc(phone)+'">'+esc(phone)+'</a>':'—')+'</td><td>'+(mobile?'<a href="tel:'+esc(mobile)+'">'+esc(mobile)+'</a>':'—')+'</td><td>'+(linkedin?'<a href="'+esc(linkedin)+'" target="_blank" rel="noopener">LinkedIn ↗</a>':'—')+'</td><td><span class="crm-contact-route">'+esc(route)+'</span></td><td><span class="crm-contact-count">'+cs.length+' contact'+(cs.length===1?'':'s')+'</span></td><td><span class="crm-priority '+crmPriorityClass(a.priority)+'">'+esc(a.priority)+'</span></td><td>'+esc(best?.confidence||a.contact_confidence||'—')+'</td></tr>';
    }).join('')||'<tr><td colspan="10" class="accounting-empty">No accounts.</td></tr>';
    if(el('salesActivitiesBody'))el('salesActivitiesBody').innerHTML=acts.slice().sort((a,b)=>String(a.due_date||'').localeCompare(String(b.due_date||''))).map(a=>'<tr><td>'+esc(a.due_date||'—')+'</td><td><b>'+esc(a.sales_opportunities?.sales_accounts?.company_name||'—')+'</b><br><small>'+esc(a.sales_opportunities?.opportunity_name||'')+'</small></td><td>'+esc(a.subject)+'</td><td><span class="crm-activity-status crm-activity-'+String(a.status).toLowerCase()+'">'+esc(a.status)+'</span></td><td>'+'<div class="crm-activity-menu"><button type="button" class="crm-activity-more" aria-label="Activity actions" title="Actions">⋯</button><div class="crm-activity-popover"><button type="button" class="crm-activity-edit" data-id="'+a.id+'">Edit</button>'+(a.status==='PLANNED'?'<button type="button" class="crm-activity-done" data-id="'+a.id+'" data-opp="'+a.opportunity_id+'">Done</button>':'')+'</div></div>'+'</td></tr>').join('')||'<tr><td colspan="5" class="accounting-empty">No activities.</td></tr>';
    document.querySelectorAll('.crm-card-open').forEach(b=>b.onclick=()=>renderOpportunityDetail(b.dataset.id));
    document.querySelectorAll('.crm-done').forEach(b=>b.onclick=()=>completeNextCRMActivity(b.dataset.id));
    document.querySelectorAll('.crm-undo').forEach(b=>b.onclick=()=>undoCRMStage(b.dataset.id));
    document.querySelectorAll('.crm-advance').forEach(b=>b.onclick=()=>advanceCRMStage(b.dataset.id,b.dataset.next));
    document.querySelectorAll('.crm-activity-done').forEach(b=>b.onclick=()=>completeCRMActivity(b.dataset.id,b.dataset.opp));
    document.querySelectorAll('.crm-detail-won').forEach(b=>b.onclick=()=>markCRMClosed(b.dataset.id,'WON'));
    document.querySelectorAll('.crm-detail-lost').forEach(b=>b.onclick=()=>markCRMClosed(b.dataset.id,'LOST'));
    document.querySelectorAll('.crm-activity-edit').forEach(b=>b.onclick=()=>openCRMActivityModal(b.dataset.id));
    document.querySelectorAll('.crm-detail-email').forEach(b=>b.onclick=()=>openCRMActivityModal(null,b.dataset.id,'EMAIL'));
  }
  function crmEmailTemplate(o){
    const a=o?.sales_accounts||{},p=o?.sales_projects||{};const contacts=(state.crm.contacts||[]).filter(x=>x.account_id===o?.account_id&&(!x.project_id||x.project_id===o?.project_id));const best=contacts.sort((x,y)=>({HIGH:0,MEDIUM:1,LOW:2}[x.confidence]??9)-({HIGH:0,MEDIUM:1,LOW:2}[y.confidence]??9))[0]||null;
    const company=a.company_name||'Engineering Team',project=p.project_name||o?.opportunity_name||'your project',location=p.location||'',product=o?.product||'GFRP / FRP / GRP solutions',stage=o?.stage||'PROSPECT';
    let subject='PILARK Composite — Technical Introduction for '+company;
    let body='Dear '+(a.contact_department||'Engineering / Project / BD Team')+',\n\nWe are PT. Panca Integra Laguna Reksa, through our PILARK Composite brand, part of ORI Group.\nPILARK Composite develops and supplies engineered GFRP / FRP / GRP solutions for infrastructure applications.\n\nWe would like to introduce our '+product+' solution in relation to '+project+(location?' in '+location:'')+'.\n\n';
    if(/Jacking/i.test(product))body+='For trenchless applications, we would be pleased to present the relevant pipe configuration, stiffness, allowable jacking force, joint system, structural design considerations and installation approach for your engineering review.\n\n';
    else if(/Sheet Pile/i.test(product))body+='For river, marine and flood-control applications, we would be pleased to discuss FRP sheet pile as an engineered alternative and review the relevant structural and installation requirements.\n\n';
    else if(/Rebar/i.test(product))body+='For reinforced concrete applications, we would be pleased to discuss GFRP rebar for environments where corrosion resistance and reduced maintenance are important.\n\n';
    else body+='We would be pleased to present the relevant technical characteristics, application suitability, design considerations and project references for your engineering review.\n\n';
    body+='Would you be available for a short technical introduction with the appropriate Engineering / Project / BD team?\n\nBest regards,\nPILARK Composite\nPT. Panca Integra Laguna Reksa\nORI Group';
    if(stage==='CONTACTED')subject='PILARK Composite — Follow-up on '+project;
    if(stage==='MEETING')subject='PILARK Composite — Technical Meeting Follow-up — '+project;
    if(stage==='TECHNICAL PRESENTATION')subject='PILARK Composite — Technical Presentation — '+project;
    if(stage==='SPECIFICATION')subject='PILARK Composite — Specification Support — '+project;
    if(stage==='RFQ')subject='PILARK Composite — RFQ / Technical Clarification — '+project;
    if(stage==='QUOTATION')subject='PILARK Composite — Quotation Follow-up — '+project;
    if(stage==='NEGOTIATION')subject='PILARK Composite — Commercial Follow-up — '+project;
    if(stage==='PO')subject='PILARK Composite — PO / Order Follow-up — '+project;
    return {subject,body};
  }
  function crmActivityDefaults(type='FOLLOW-UP'){return {type,due:crmTodayPlus(0),subject:type==='EMAIL'?'PILARK Composite — Technical Introduction':'Follow-up activity',notes:''};}
  function populateCRMActivityOpportunities(selected){const s=el('crmActivityOpportunity');if(!s)return;s.innerHTML='<option value="">Select opportunity…</option>'+(state.crm.opportunities||[]).map(o=>'<option value="'+o.id+'">'+esc(o.sales_accounts?.company_name||'—')+' — '+esc(o.opportunity_name||'')+'</option>').join('');if(selected)s.value=selected;}
  function openCRMActivityModal(activityId=null,oppId=null,forceType=null){
    const modal=el('salesActivityModal');if(!modal)return;populateCRMActivityOpportunities(oppId);
    const a=activityId?(state.crm.activities||[]).find(x=>x.id===activityId):null,o=oppId?(state.crm.opportunities||[]).find(x=>x.id===oppId):null,d=crmActivityDefaults(forceType||a?.activity_type||'FOLLOW-UP');
    el('crmActivityId').value=a?.id||'';el('crmActivityOpportunity').value=a?.opportunity_id||oppId||'';el('crmActivityType').value=a?.activity_type||d.type;el('crmActivityDue').value=a?.due_date||d.due;el('crmActivityTo').value=a?.sales_opportunities?.sales_accounts?.public_email||o?.sales_accounts?.public_email||'';const template=(forceType==='EMAIL'&&!a&&o)?crmEmailTemplate(o):null;el('crmActivitySubject').value=a?.subject||template?.subject||d.subject;el('crmActivityNotes').value=a?.notes||template?.body||'';
    el('crmActivityModalTitle').textContent=a?'Edit Activity':(forceType==='EMAIL'?'Send Email':'Add Activity');el('crmActivitySend').textContent=forceType==='EMAIL'?'Send Email →':(a?'Save Changes →':'Save Activity →');modal.hidden=false;
  }
  async function saveCRMActivity(e){
    e.preventDefault();const id=el('crmActivityId').value,oppId=el('crmActivityOpportunity').value,type=el('crmActivityType').value,due=el('crmActivityDue').value,subject=el('crmActivitySubject').value.trim(),notes=el('crmActivityNotes').value.trim(),to=el('crmActivityTo').value.trim();
    if(!oppId||!due||!subject)return alert('Complete opportunity, due date and subject.');
    if(type==='EMAIL'){
      if(!to)return alert('Enter the contact email.');
      const html='<div style="font-family:Arial,sans-serif;color:#17212b;line-height:1.65"><p>'+esc(notes).replace(/\n/g,'<br>')+'</p><p>Best regards,<br><b>PILARK Composite</b><br>PT. Panca Integra Laguna Reksa</p></div>';
      el('crmActivitySend').disabled=true;el('crmActivitySend').textContent='Sending…';
      try{const {data:{session}}=await client().auth.getSession();const res=await fetch(((window.PILARK_SUPABASE_CONFIG||{}).url||'')+'/functions/v1/send-sales-email',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session?.access_token,'apikey':(window.PILARK_SUPABASE_CONFIG||{}).anonKey||''},body:JSON.stringify({opportunity_id:oppId,to,subject,html,notes})});const out=await res.json().catch(()=>({}));if(!res.ok)throw new Error(out.error||'Email delivery failed.');const currentOpp=(state.crm.opportunities||[]).find(x=>x.id===oppId);if(currentOpp?.stage==='PROSPECT'){const followDate=crmTodayPlus(3);await client().from('sales_opportunities').update({stage:'CONTACTED',last_contact:today(),next_action:'Follow up after first contact',next_follow_up:followDate}).eq('id',oppId);const exists=(state.crm.activities||[]).some(x=>x.opportunity_id===oppId&&x.status==='PLANNED'&&x.subject==='Follow-up after first contact');if(!exists)await client().from('sales_activities').insert({opportunity_id:oppId,activity_type:'FOLLOW-UP',subject:'Follow-up after first contact',activity_date:today(),due_date:followDate,status:'PLANNED',notes:'Automatic follow-up created after first email contact.'});}el('salesActivityModal').hidden=true;await loadCRM();alert('Email sent to '+to+'. Opportunity updated automatically.');}catch(err){alert(err.message);}finally{el('crmActivitySend').disabled=false;}return;
    }
    const payload={opportunity_id:oppId,activity_type:type,subject,activity_date:today(),due_date:due,status:id?aStatus(id):'PLANNED',notes};
    const q=id?client().from('sales_activities').update(payload).eq('id',id):client().from('sales_activities').insert(payload);const {error}=await q;if(error)return alert(error.message);
    await client().from('sales_opportunities').update({next_follow_up:due,next_action:subject}).eq('id',oppId);el('salesActivityModal').hidden=true;await loadCRM();
  }
  function aStatus(id){return (state.crm.activities||[]).find(x=>x.id===id)?.status||'PLANNED';}
  function closeCRMActivityModal(){const m=el('salesActivityModal');if(m)m.hidden=true;}
  async function loadCRM(){
    if(!client())return;
    const [a,p,o,acts,contacts]=await Promise.all([
      client().from('sales_accounts').select('*').eq('is_active',true).order('priority').order('company_name'),
      client().from('sales_projects').select('*').order('project_name'),
      client().from('sales_opportunities').select('*,sales_accounts(company_name,priority,public_email,public_phone,contact_department),sales_projects(id,project_name,location,project_status)').order('next_follow_up',{ascending:true}),
      client().from('sales_activities').select('*,sales_opportunities(opportunity_name,sales_accounts(company_name))').order('due_date',{ascending:true}),
      client().from('sales_contacts').select('*').eq('is_active',true).order('confidence',{ascending:false})
    ]);
    for(const r of [a,p,o,acts,contacts])if(r.error)throw r.error;
    state.crm={accounts:a.data||[],projects:p.data||[],opportunities:o.data||[],activities:acts.data||[],contacts:contacts.data||[]};
    renderCRM();
  }
  async function completeCRMActivity(id,oppId){
    const activity=(state.crm.activities||[]).find(a=>a.id===id);
    if(!activity)return;
    const {error}=await client().from('sales_activities').update({status:'DONE'}).eq('id',id);
    if(error)return alert(error.message);
    const o=(state.crm.opportunities||[]).find(x=>x.id===oppId);
    if(!o)return loadCRM();
    try{
      await syncCRMStageFromCompletedActivity(o,activity.activity_type,id);
      const {data:planned,error:plannedError}=await client().from('sales_activities')
        .select('due_date,subject')
        .eq('opportunity_id',oppId)
        .eq('status','PLANNED')
        .not('due_date','is',null)
        .order('due_date',{ascending:true});
      if(plannedError)throw plannedError;
      const next=(planned||[])[0];
      const {data:latestOpp,error:latestError}=await client().from('sales_opportunities').select('stage').eq('id',oppId).single();
      if(latestError)throw latestError;
      await client().from('sales_opportunities').update({
        last_contact:today(),
        next_action:next?.subject||('Execute '+(latestOpp?.stage||o.stage)+' step'),
        next_follow_up:next?.due_date||null
      }).eq('id',oppId);
    }catch(err){alert(err.message||'Activity completed but stage synchronization failed.');}
    await loadCRM();
  }
  async function completeNextCRMActivity(oppId){
    const a=state.crm.activities.filter(x=>x.opportunity_id===oppId&&x.status==='PLANNED').sort((x,y)=>String(x.due_date||'').localeCompare(String(y.due_date||'')))[0];
    if(a)return completeCRMActivity(a.id,oppId);
    alert('No planned activity found for this opportunity.');
  }
  async function advanceCRMStage(id,next){
    if(!next||next===state.crm.opportunities.find(x=>x.id===id)?.stage||next==='LOST')return;
    const {error}=await client().from('sales_opportunities').update({stage:next,next_action:'Execute '+next+' step',next_follow_up:crmTodayPlus(3)}).eq('id',id);
    if(error)return alert(error.message);
    await client().from('sales_activities').insert({opportunity_id:id,activity_type:'FOLLOW-UP',subject:'Follow-up after stage → '+next,activity_date:today(),due_date:crmTodayPlus(3),status:'PLANNED',notes:'Follow up after advancing the opportunity.'});
    await loadCRM();
  }
  async function markCRMClosed(id,status){
    const o=(state.crm.opportunities||[]).find(x=>x.id===id); if(!o)return;
    const label=status==='WON'?'WON':'LOST';
    if(!confirm('Mark this opportunity as '+label+'?'))return;
    const {error}=await client().from('sales_opportunities').update({
      stage:status,
      next_action:status==='WON'?'Closed — Won':'Closed — Lost',
      next_follow_up:null
    }).eq('id',id);
    if(error)return alert(error.message);
    await client().from('sales_activities').update({status:'CANCELLED'}).eq('opportunity_id',id).eq('status','PLANNED');
    await loadCRM();
  }
  async function undoCRMStage(id){
    const o=(state.crm.opportunities||[]).find(x=>x.id===id); if(!o)return;
    const currentIndex=CRM_STAGES.indexOf(o.stage); if(currentIndex<=0)return;
    const previous=CRM_STAGES[currentIndex-1];
    if(!confirm('Undo stage '+o.stage+' → '+previous+'? This will remove the automatic follow-up created by the last stage change.'))return;
    const {error}=await client().from('sales_opportunities').update({stage:previous,next_action:'Execute '+previous+' step',next_follow_up:null}).eq('id',id);
    if(error)return alert(error.message);
    await client().from('sales_activities').delete().eq('opportunity_id',id).eq('status','PLANNED').eq('subject','Follow-up after stage → '+o.stage);
    const {data:remaining}=await client().from('sales_activities').select('due_date').eq('opportunity_id',id).eq('status','PLANNED').not('due_date','is',null).order('due_date',{ascending:true}).limit(1);
    if(remaining?.[0]?.due_date)await client().from('sales_opportunities').update({next_follow_up:remaining[0].due_date}).eq('id',id);
    await loadCRM();
  }
  function bind(){document.querySelectorAll('[data-sales-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.salesTab));el('salesForm')?.addEventListener('submit',createQuotation);el('addSalesLine')?.addEventListener('click',()=>{el('salesLines').insertAdjacentHTML('beforeend',lineHtml(el('salesLines').children.length));updatePreview();});el('salesLines')?.addEventListener('click',e=>{if(e.target.classList.contains('sales-line-remove')){const rows=el('salesLines').querySelectorAll('.sales-line');if(rows.length>1)e.target.closest('.sales-line').remove();updatePreview();}});el('salesLines')?.addEventListener('input',updatePreview);el('salesRefresh')?.addEventListener('click',()=>Promise.all([load(),loadCRM()]).catch(e=>alert(e.message)));
    window.addEventListener('pilark:refresh-view',e=>{if(e.detail?.view==='sales')Promise.all([load(),loadCRM()]).then(()=>e.detail?.done?.()).catch(err=>e.detail?.done?.(err));});
    el('salesCrmRefresh')?.addEventListener('click',()=>loadCRM().catch(e=>alert(e.message)));
    el('salesAddProspect')?.addEventListener('click',openSalesProspectModal);
    el('salesAiFindProspect')?.addEventListener('click',openAiProspectModal);
    el('salesAiProspectClose')?.addEventListener('click',closeAiProspectModal);
    el('salesAiFindBtn')?.addEventListener('click',runAiProspector);
    document.querySelectorAll('[data-ai-prospect-close]').forEach(b=>b.addEventListener('click',closeAiProspectModal));
    loadAiCandidates().catch(()=>{});
    el('salesProspectClose')?.addEventListener('click',closeSalesProspectModal);
    el('salesProspectCancel')?.addEventListener('click',closeSalesProspectModal);
    el('salesProspectForm')?.addEventListener('submit',createManualProspect);
    document.querySelectorAll('[data-prospect-close]').forEach(b=>b.addEventListener('click',closeSalesProspectModal));
    el('crmAddActivity')?.addEventListener('click',()=>openCRMActivityModal());
    el('crmResearchContacts')?.addEventListener('click',()=>openContactResearchModal());
    el('crmActivityForm')?.addEventListener('submit',saveCRMActivity);
    el('crmActivityClose')?.addEventListener('click',closeCRMActivityModal);
    el('crmActivityCancel')?.addEventListener('click',closeCRMActivityModal);
    document.querySelectorAll('[data-crm-activity-close]').forEach(b=>b.addEventListener('click',closeCRMActivityModal));
    el('crmActivityOpportunity')?.addEventListener('change',()=>{const o=(state.crm.opportunities||[]).find(x=>x.id===el('crmActivityOpportunity').value);if(o)el('crmActivityTo').value=o.sales_accounts?.public_email||'';});if(el('salesDate'))el('salesDate').value=today();if(el('salesLines')){el('salesLines').innerHTML=lineHtml(0);updatePreview();}document.querySelector('.side-link[data-view="sales"]')?.addEventListener('click',()=>setTimeout(()=>{window.dispatchEvent(new CustomEvent('pilark:refresh-sales-quotation'));Promise.all([load(),loadCRM()]).catch(console.warn);},50));}
  function openSalesProspectModal(){el('salesProspectModal')?.removeAttribute('hidden');el('prospectCompanyName')?.focus();}
  function closeSalesProspectModal(){el('salesProspectModal')?.setAttribute('hidden','');}
  async function createManualProspect(e){
    e.preventDefault();
    const v=id=>el(id)?.value?.trim()||null;
    const company=v('prospectCompanyName'), opportunity=v('prospectOpportunityName');
    if(!company||!opportunity)return alert('Company name and opportunity/project name are required.');
    const {data:userData}=await client().auth.getUser();
    const accountPayload={
      company_name:company,
      account_type:'company',
      industry:v('prospectIndustry'),
      website:v('prospectWebsite'),
      city:v('prospectCity'),
      contact_department:v('prospectDepartment'),
      contact_person:v('prospectContactPerson'),
      contact_position:v('prospectContactPosition'),
      public_email:v('prospectEmail'),
      public_phone:v('prospectPhone'),
      mobile_phone:v('prospectWhatsapp'),
      whatsapp_phone:v('prospectWhatsapp'),
      priority:el('prospectPriority')?.value||'WARM',
      contact_source:'Manual entry',
      contact_confidence:'HIGH',
      notes:v('prospectNotes'),
      is_active:true,
      created_by:userData?.user?.id||null
    };
    const {data:account,error:accountError}=await client().from('sales_accounts').insert(accountPayload).select().single();
    if(accountError)return alert(accountError.message);
    const projectValue=Number(el('prospectProjectValue')?.value||0);
    const pilarkValue=Number(el('prospectPilarkValue')?.value||0);
    let project=null;
    const {data:projectData,error:projectError}=await client().from('sales_projects').insert({
      account_id:account.id,
      project_name:opportunity,
      location:v('prospectCity'),
      project_type:v('prospectApplication'),
      project_status:'target',
      project_value:projectValue,
      notes:v('prospectNotes'),
      created_by:userData?.user?.id||null
    }).select().single();
    if(projectError){
      await client().from('sales_accounts').delete().eq('id',account.id);
      return alert(projectError.message);
    }
    project=projectData;
    const {data:opp,error:oppError}=await client().from('sales_opportunities').insert({
      account_id:account.id,
      project_id:project.id,
      opportunity_name:opportunity,
      product:el('prospectProduct')?.value||'Other GFRP / FRP / GRP Solution',
      application:v('prospectApplication'),
      sales_strategy:'Technical-led project development',
      lead_status:el('prospectPriority')?.value||'WARM',
      stage:'PROSPECT',
      probability:10,
      estimated_quantity:null,
      estimated_project_value:projectValue,
      estimated_pilark_value:pilarkValue,
      current_material:v('prospectCurrentMaterial'),
      potential_alternative:v('prospectAlternative'),
      technical_requirement:v('prospectTechnicalRequirement'),
      next_action:'Qualify prospect and identify project PIC',
      next_follow_up:crmTodayPlus(3),
      notes:v('prospectNotes'),
      sales_owner:userData?.user?.id||null,
      created_by:userData?.user?.id||null
    }).select().single();
    if(oppError){
      await client().from('sales_projects').delete().eq('id',project.id);
      await client().from('sales_accounts').delete().eq('id',account.id);
      return alert(oppError.message);
    }
    const contactName=v('prospectContactPerson');
    if(contactName){
      const {error:contactError}=await client().from('sales_contacts').insert({
        account_id:account.id,
        project_id:project.id,
        contact_person:contactName,
        position:v('prospectContactPosition'),
        department:v('prospectDepartment'),
        email:v('prospectEmail'),
        phone:v('prospectPhone'),
        mobile_phone:v('prospectWhatsapp'),
        whatsapp_phone:v('prospectWhatsapp'),
        contact_type:'BUSINESS',
        source_name:'Manual entry',
        confidence:'HIGH',
        preferred_channel:v('prospectWhatsapp')?'WHATSAPP':(v('prospectEmail')?'EMAIL':(v('prospectPhone')?'CALL':null)),
        notes:v('prospectNotes')
      });
      if(contactError)return alert('Prospect created, but contact could not be saved: '+contactError.message);
    }
    await client().from('sales_activities').insert({
      opportunity_id:opp.id,
      activity_type:'FOLLOW-UP',
      subject:'Qualify new prospect and identify project PIC',
      activity_date:today(),
      due_date:crmTodayPlus(3),
      status:'PLANNED',
      notes:'Automatic first follow-up created for manually added prospect.'
    });
    e.target.reset();
    el('prospectPriority').value='WARM';
    el('prospectProduct').value='GRP Jacking Pipe';
    el('prospectProjectValue').value='0';
    el('prospectPilarkValue').value='0';
    closeSalesProspectModal();
    await loadCRM();
    showTab('execution');
    const created=(state.crm.opportunities||[]).find(x=>x.id===opp.id);
    if(created)renderOpportunityDetail(created.id);
  }
  function openAiProspectModal(){el('salesAiProspectModal')?.removeAttribute('hidden');renderAiProspectResults();}
  function closeAiProspectModal(){el('salesAiProspectModal')?.setAttribute('hidden','');}
  function aiScoreClass(score){return Number(score)>=90?'ai-score-hot':Number(score)>=75?'ai-score-good':'ai-score-review';}
  function renderAiProspectResults(){
    const box=el('salesAiResults'); if(!box)return;
    const rows=(state.crm.aiCandidates||[]).map(c=>'<div class="ai-prospect-card">'+
      '<div class="ai-prospect-card-head"><div><strong>'+esc(c.company_name)+'</strong><span>'+esc(c.project_name||'Project signal')+' · '+esc(c.city||c.industry||'Indonesia')+'</span></div><div class="'+aiScoreClass(c.ai_score)+'">'+Number(c.ai_score||0)+'/100</div></div>'+
      '<div class="ai-prospect-meta"><b>'+esc(c.product)+'</b><span>'+esc(c.application||'')+'</span></div><div class="ai-prospect-value"><b>Project Value:</b> '+(Number(c.project_value_amount||c.estimated_project_value||0)>0?esc((c.project_value_currency||'IDR')+' '+Number(c.project_value_amount||c.estimated_project_value||0).toLocaleString('en-US')):'Not disclosed')+' <span>· '+esc(c.project_value_type||'UNKNOWN')+'</span></div>'+
      '<p>'+esc(c.ai_reason||'')+'</p><small><b>Evidence:</b> '+esc(c.evidence||'')+'</small>'+
      '<div class="ai-prospect-actions"><a class="text-btn" href="'+esc(c.source_url||c.project_url||c.website||'#')+'" target="_blank" rel="noopener">Source ↗</a><button type="button" class="accounting-small-btn ai-approve-btn" data-id="'+esc(c.id)+'">Approve to CRM</button><button type="button" class="accounting-small-btn ai-reject-btn" data-id="'+esc(c.id)+'">Reject</button></div></div>').join('');
    box.innerHTML=rows||'<div class="crm-research-empty">No AI candidates yet. Click <b>Find Prospects ✦</b> to search.</div>';
    box.querySelectorAll('.ai-approve-btn').forEach(b=>b.onclick=()=>approveAiProspect(b.dataset.id));
    box.querySelectorAll('.ai-reject-btn').forEach(b=>b.onclick=()=>rejectAiProspect(b.dataset.id));
  }
  async function loadAiCandidates(){
    const {data,error}=await client().from('sales_prospect_candidates').select('*').eq('review_status','NEW').order('ai_score',{ascending:false});
    if(error)throw error; state.crm.aiCandidates=data||[]; renderAiProspectResults();
  }
  async function runAiProspector(){
    const btn=el('salesAiFindBtn'), status=el('salesAiStatus');
    if(btn)btn.disabled=true; if(status)status.textContent='Searching public project signals and qualifying prospects…';
    try{
      const existing=(state.crm.accounts||[]).map(x=>x.company_name).filter(Boolean);
      const {data,error}=await client().functions.invoke('sales-ai-prospect-finder',{body:{product_focus:el('aiProspectProduct')?.value||'Mixed GFRP / FRP / GRP',market:el('aiProspectMarket')?.value?.trim()||'Indonesia',limit:Number(el('aiProspectLimit')?.value||8),existing_accounts:existing}});
      if(error)throw error;
      const candidates=Array.isArray(data?.candidates)?data.candidates:[];
      if(!candidates.length){if(status)status.textContent='No qualified new prospects found. Try another product focus or market.';return;}
      const {data:userData}=await client().auth.getUser();
      const existingLower=new Set(existing.map(x=>x.toLowerCase().trim()));
      const clean=candidates.filter(x=>x.company_name&&!existingLower.has(String(x.company_name).toLowerCase().trim())).map(x=>({...x,review_status:'NEW',created_by:userData?.user?.id||null,project_value_amount:Number(x.project_value_amount||x.estimated_project_value||0),project_value_currency:String(x.project_value_currency||'IDR').toUpperCase(),project_value_type:x.project_value_type||'UNKNOWN',project_value_confidence:x.project_value_confidence||'LOW',project_value_source_url:x.project_value_source_url||x.source_url||null,project_value_evidence:x.project_value_evidence||null,project_value_idr:String(x.project_value_currency||'IDR').toUpperCase()==='IDR'?Number(x.project_value_amount||x.estimated_project_value||0):null}));
      if(clean.length){const ins=await client().from('sales_prospect_candidates').insert(clean);if(ins.error)throw ins.error;}
      await loadAiCandidates();
      if(status)status.textContent='Found '+clean.length+' new candidate'+(clean.length===1?'':'s')+'. Review the evidence before approving.';
    }catch(e){
      let detail=e?.message||'AI prospect search failed.';
      try{
        const response=e?.context;
        if(response && typeof response.clone==='function'){
          const payload=await response.clone().json();
          if(payload?.error)detail=payload.error;
          if(payload?.upstream_status)detail+=' (HTTP '+payload.upstream_status+(payload?.model?'; '+payload.model:'')+')';
        }
      }catch(_){}
      if(status)status.textContent='AI prospect search failed: '+detail;
    }
    finally{if(btn)btn.disabled=false;}
  }
  async function approveAiProspect(id){
    const candidate=(state.crm.aiCandidates||[]).find(x=>x.id===id); if(!candidate)return;
    if(!confirm('Approve '+candidate.company_name+' and create it as a Sales CRM prospect?'))return;
    const dup=await client().from('sales_accounts').select('id,company_name').ilike('company_name',candidate.company_name).limit(1);
    if(dup.error)return alert(dup.error.message);
    if(dup.data?.length){await client().from('sales_prospect_candidates').update({review_status:'DUPLICATE',reviewed_at:new Date().toISOString()}).eq('id',id);await loadAiCandidates();return alert('This company already exists in Sales CRM. Marked as duplicate.');}
    const {data:userData}=await client().auth.getUser(), uid=userData?.user?.id||null;
    const accountPayload={company_name:candidate.company_name,account_type:'company',industry:candidate.industry||null,website:candidate.website||null,city:candidate.city||null,priority:Number(candidate.ai_score)>=90?'HOT':Number(candidate.ai_score)>=75?'WARM':'COLD',source_url:candidate.source_url||candidate.project_url||null,contact_source:'AI Prospect Finder',contact_confidence:'MEDIUM',notes:'AI prospect evidence: '+(candidate.ai_reason||'')+' '+(candidate.evidence||''),is_active:true,created_by:uid};
    const ar=await client().from('sales_accounts').insert(accountPayload).select().single(); if(ar.error)return alert(ar.error.message);
    const sourceCurrency=String(candidate.project_value_currency||'IDR').toUpperCase(); const valueAmount=Number(candidate.project_value_amount||candidate.estimated_project_value||0); const valueIdr=sourceCurrency==='IDR'?Number(candidate.project_value_idr||valueAmount):null; const pr=await client().from('sales_projects').insert({account_id:ar.data.id,project_name:candidate.project_name||candidate.company_name,location:candidate.city||null,project_type:candidate.application||candidate.industry||null,project_status:'target',project_value:valueIdr||0,source_url:candidate.project_url||candidate.source_url||null,notes:(candidate.project_value_evidence?('Project value: '+candidate.project_value_evidence+' '):'')+(candidate.evidence||candidate.ai_reason||''),created_by:uid}).select().single();
    if(pr.error){await client().from('sales_accounts').delete().eq('id',ar.data.id);return alert(pr.error.message);}
    const op=await client().from('sales_opportunities').insert({account_id:ar.data.id,project_id:pr.data.id,opportunity_name:candidate.project_name||candidate.company_name,product:candidate.product||'Other GFRP / FRP / GRP Solution',application:candidate.application||null,sales_strategy:'DIRECT PROJECT',lead_status:Number(candidate.ai_score)>=90?'HOT':Number(candidate.ai_score)>=75?'WARM':'COLD',stage:'PROSPECT',probability:10,estimated_project_value:valueAmount,estimated_pilark_value:Number(candidate.estimated_pilark_value||0),project_value_currency:sourceCurrency,project_value_type:candidate.project_value_type||'UNKNOWN',project_value_confidence:candidate.project_value_confidence||'LOW',project_value_source_url:candidate.project_value_source_url||candidate.source_url||candidate.project_url||null,project_value_evidence:candidate.project_value_evidence||null,project_value_idr:valueIdr,project_value_fx_rate:candidate.project_value_fx_rate||null,project_value_fx_date:candidate.project_value_fx_date||null,current_material:candidate.current_material||null,potential_alternative:candidate.potential_alternative||'PILARK GFRP / FRP / GRP solution',technical_requirement:candidate.technical_requirement||null,next_action:'Validate project, identify PIC and confirm specification',next_follow_up:crmTodayPlus(3),notes:candidate.ai_reason||candidate.evidence||null,sales_owner:uid,created_by:uid}).select().single();
    if(op.error){await client().from('sales_projects').delete().eq('id',pr.data.id);await client().from('sales_accounts').delete().eq('id',ar.data.id);return alert(op.error.message);}
    await client().from('sales_activities').insert({opportunity_id:op.data.id,activity_type:'FOLLOW-UP',subject:'Validate AI-identified project and identify PIC',activity_date:today(),due_date:crmTodayPlus(3),status:'PLANNED',notes:'Created after human approval of AI prospect. Source: '+(candidate.source_url||candidate.project_url||'public web')});
    await client().from('sales_prospect_candidates').update({review_status:'APPROVED',reviewed_at:new Date().toISOString()}).eq('id',id);
    await loadCRM(); await loadAiCandidates(); showTab('execution'); renderOpportunityDetail(op.data.id);
  }
  async function rejectAiProspect(id){if(!confirm('Reject this AI prospect?'))return;const {error}=await client().from('sales_prospect_candidates').update({review_status:'REJECTED',reviewed_at:new Date().toISOString()}).eq('id',id);if(error)return alert(error.message);await loadAiCandidates();}
  async function saveCRMContact(accountId){
  const v=id=>el(id)?.value?.trim()||null;
  const contact={account_id:accountId,contact_person:v('crmContactPerson'),position:v('crmContactPosition'),department:v('crmContactDepartment'),email:v('crmContactEmail'),phone:v('crmContactPhone'),mobile_phone:v('crmContactMobile'),whatsapp_phone:v('crmContactWhatsapp'),linkedin_url:v('crmContactLinkedin'),source_url:v('crmContactSourceUrl'),source_name:v('crmContactSourceName'),confidence:v('crmContactConfidence')||'MEDIUM',preferred_channel:v('crmContactPreferred'),notes:v('crmContactNotes')};
  if(!contact.contact_person){alert('Contact name is required.');return;}
  const r=await client().from('sales_contacts').insert(contact);
  if(r.error){alert(r.error.message);return;}
  await loadCRM();
  openContactResearchModal(accountId);
}
async function loadAiContactCandidates(accountId){
  const {data,error}=await client().from('sales_contact_candidates').select('*').eq('account_id',accountId).eq('review_status','NEW').order('ai_score',{ascending:false});
  if(error)throw error;
  return data||[];
}
function renderAiContactCandidates(accountId, rows){
  const box=el('crmAiContactResults');
  if(!box)return;
  const data=rows||[];
  box.innerHTML=data.length?data.map(c=>
    '<div class="crm-research-item">'+
      '<strong>'+esc(c.contact_person||'Business contact')+'</strong>'+
      '<span>'+esc(c.position||c.department||'Business contact')+' · <b>'+esc(c.confidence||'—')+'</b> · AI '+Number(c.ai_score||0)+'/100</span>'+
      '<small>'+(c.email?esc(c.email)+' · ':'')+(c.phone||c.mobile_phone?esc(c.phone||c.mobile_phone)+' · ':'')+(c.linkedin_url?'LinkedIn available · ':'')+esc(c.source_name||'Public source')+'</small>'+
      '<p>'+esc(c.evidence||'')+'</p>'+
      '<div class="crm-ai-contact-actions">'+
        '<a class="text-btn" href="'+esc(c.source_url||'#')+'" target="_blank" rel="noopener">Source ↗</a>'+
        '<button type="button" class="accounting-small-btn crm-ai-contact-approve" data-id="'+esc(c.id)+'">Save Contact</button>'+
        '<button type="button" class="accounting-small-btn crm-ai-contact-reject" data-id="'+esc(c.id)+'">Reject</button>'+
      '</div>'+
    '</div>'
  ).join(''):'<div class="crm-research-empty">No AI contact candidates yet. Click <b>Find Contacts with AI</b>.</div>';
  box.querySelectorAll('.crm-ai-contact-approve').forEach(b=>b.onclick=()=>approveAiContactCandidate(b.dataset.id,accountId));
  box.querySelectorAll('.crm-ai-contact-reject').forEach(b=>b.onclick=()=>rejectAiContactCandidate(b.dataset.id,accountId));
}
async function runAiContactFinder(accountId){
  const a=(state.crm.accounts||[]).find(x=>x.id===accountId);
  if(!a)return;
  const opp=(state.crm.opportunities||[]).find(x=>x.account_id===accountId);
  const p=opp?.sales_projects|| (state.crm.projects||[]).find(x=>x.account_id===accountId)||{};
  const btn=el('crmAiContactFindBtn'),status=el('crmAiContactStatus');
  if(btn)btn.disabled=true;
  if(status)status.textContent='AI is searching public project, procurement, engineering and professional sources…';
  try{
    const {data,error}=await client().functions.invoke('sales-ai-contact-finder',{body:{
      company_name:a.company_name,
      project_name:p.project_name||opp?.opportunity_name||'',
      website:a.website||'',
      project_url:p.source_url||'',
      source_url:opp?.sales_projects?.source_url||a.source_url||'',
      city:a.city||p.location||'',
      product:opp?.product||'',
      limit:8
    }});
    if(error)throw error;
    const contacts=Array.isArray(data?.contacts)?data.contacts:[];
    const {data:userData}=await client().auth.getUser();
    const clean=contacts.filter(c=>c.contact_person&&c.source_url).map(c=>({
      account_id:accountId,
      project_id:p.id||opp?.project_id||null,
      opportunity_id:opp?.id||null,
      contact_person:c.contact_person,
      position:c.position||null,
      department:c.department||null,
      email:c.email||null,
      phone:c.phone||null,
      mobile_phone:c.mobile_phone||null,
      whatsapp_phone:c.whatsapp_phone||null,
      linkedin_url:c.linkedin_url||null,
      source_url:c.source_url,
      source_name:c.source_name||'Public web source',
      confidence:c.confidence||'LOW',
      ai_score:Number(c.ai_score||0),
      evidence:c.evidence||null,
      search_query:'AI contact research',
      review_status:'NEW',
      created_by:userData?.user?.id||null
    }));
    if(clean.length){
      const ins=await client().from('sales_contact_candidates').insert(clean);
      if(ins.error)throw ins.error;
    }
    const rows=await loadAiContactCandidates(accountId);
    renderAiContactCandidates(accountId,rows);
    if(status)status.textContent=clean.length?'Found '+clean.length+' public contact candidate'+(clean.length===1?'':'s')+'. Review before saving to CRM.':'No verified public contact candidates found. Try again later or use manual research.';
  }catch(e){
    let detail=e?.message||'AI contact research failed.';
    try{
      const response=e?.context;
      if(response&&typeof response.clone==='function'){
        const payload=await response.clone().json();
        if(payload?.error)detail=payload.error;
        if(payload?.upstream_status)detail+=' (HTTP '+payload.upstream_status+(payload?.model?'; '+payload.model:'')+')';
      }
    }catch(_){}
    if(status)status.textContent='AI contact research failed: '+detail;
  }finally{if(btn)btn.disabled=false;}
}
async function approveAiContactCandidate(id,accountId){
  const {data:c,error}=await client().from('sales_contact_candidates').select('*').eq('id',id).single();
  if(error)return alert(error.message);
  if(!confirm('Save '+(c.contact_person||'this contact')+' as a verified business contact in CRM?'))return;
  const existing=await client().from('sales_contacts').select('id').eq('account_id',accountId).or('email.eq.'+String(c.email||'').replace(/,/g,'')+',linkedin_url.eq.'+String(c.linkedin_url||'').replace(/,/g,'')).limit(1);
  if(existing.error&&c.email)return alert(existing.error.message);
  if(existing.data?.length){await client().from('sales_contact_candidates').update({review_status:'DUPLICATE',reviewed_at:new Date().toISOString()}).eq('id',id);const rows=await loadAiContactCandidates(accountId);renderAiContactCandidates(accountId,rows);return alert('A matching contact already exists. Marked as duplicate.');}
  const payload={
    account_id:accountId,
    project_id:c.project_id||null,
    contact_person:c.contact_person,
    position:c.position||null,
    department:c.department||null,
    email:c.email||null,
    phone:c.phone||null,
    mobile_phone:c.mobile_phone||null,
    whatsapp_phone:c.whatsapp_phone||null,
    linkedin_url:c.linkedin_url||null,
    contact_type:'BUSINESS',
    source_url:c.source_url||null,
    source_name:c.source_name||'AI Contact Finder',
    confidence:c.confidence||'MEDIUM',
    preferred_channel:c.whatsapp_phone||c.mobile_phone?'WHATSAPP':c.phone?'CALL':c.email?'EMAIL':c.linkedin_url?'LINKEDIN':null,
    notes:'AI contact research evidence: '+(c.evidence||''),
    is_active:true
  };
  const ins=await client().from('sales_contacts').insert(payload);
  if(ins.error)return alert(ins.error.message);
  await client().from('sales_contact_candidates').update({review_status:'APPROVED',reviewed_at:new Date().toISOString()}).eq('id',id);
  await loadCRM();
  openContactResearchModal(accountId);
}
async function rejectAiContactCandidate(id,accountId){
  if(!confirm('Reject this contact candidate?'))return;
  const {error}=await client().from('sales_contact_candidates').update({review_status:'REJECTED',reviewed_at:new Date().toISOString()}).eq('id',id);
  if(error)return alert(error.message);
  const rows=await loadAiContactCandidates(accountId);
  renderAiContactCandidates(accountId,rows);
}
async function loadProjectStakeholders(projectId){const {data,error}=await client().from('sales_project_contacts').select('*').eq('project_id',projectId).order('created_at',{ascending:false});if(error)throw error;return data||[];}
function renderProjectStakeholders(rows){const box=el('crmProjectStakeholderResults');if(!box)return;box.innerHTML=rows?.length?rows.map(c=>'<div class="crm-research-item"><strong>'+esc(c.organization_name||'Project stakeholder')+'</strong><span>'+esc(c.stakeholder_type||'OTHER')+' · '+esc(c.contact_person||'Business route')+' · <b>'+esc(c.confidence||'—')+'</b></span><small>'+esc(c.position||c.department||'')+(c.email?' · '+esc(c.email):'')+(c.phone?' · '+esc(c.phone):'')+'</small><p>'+esc(c.relevance||c.evidence||'')+'</p>'+(c.source_url?'<a class="text-btn" href="'+esc(c.source_url)+'" target="_blank" rel="noopener">Source ↗</a>':'')+'</div>').join(''):'<div class="crm-research-empty">No project stakeholders saved yet.</div>';}
async function runProjectStakeholderFinder(projectId,oppId){const p=(state.crm.projects||[]).find(x=>x.id===projectId)||{},o=(state.crm.opportunities||[]).find(x=>x.id===oppId)||{},a=(state.crm.accounts||[]).find(x=>x.id===o.account_id)||{};const btn=el('crmProjectStakeholderFindBtn'),status=el('crmProjectStakeholderStatus');if(btn)btn.disabled=true;if(status)status.textContent='AI is mapping owner, agency, contractor, consultant and procurement stakeholders…';try{const {data,error}=await client().functions.invoke('sales-ai-contact-finder',{body:{company_name:a.company_name||'',project_name:p.project_name||o.opportunity_name||'',website:a.website||'',project_url:p.source_url||'',source_url:o.sales_projects?.source_url||a.source_url||'',city:a.city||p.location||'',product:o.product||'',limit:10}});if(error)throw error;const contacts=Array.isArray(data?.contacts)?data.contacts:[];const {data:userData}=await client().auth.getUser();const clean=contacts.filter(c=>c.organization_name&&c.contact_person&&c.source_url).map(c=>({account_id:a.id,project_id:projectId,opportunity_id:oppId,contact_person:c.contact_person,position:c.position||null,department:c.department||null,email:c.email||null,phone:c.phone||null,mobile_phone:c.mobile_phone||null,whatsapp_phone:c.whatsapp_phone||null,linkedin_url:c.linkedin_url||null,source_url:c.source_url,source_name:c.source_name||'Public project source',confidence:c.confidence||'LOW',ai_score:Number(c.ai_score||0),evidence:c.evidence||null,relevance:c.relevance||null,organization_name:c.organization_name,stakeholder_type:c.stakeholder_type||'OTHER',search_query:'AI project stakeholder research',review_status:'NEW',created_by:userData?.user?.id||null}));if(clean.length){const ins=await client().from('sales_contact_candidates').insert(clean);if(ins.error)throw ins.error;}const {data:rows,error:loadErr}=await client().from('sales_contact_candidates').select('*').eq('project_id',projectId).eq('review_status','NEW').order('ai_score',{ascending:false});if(loadErr)throw loadErr;renderProjectStakeholderCandidates(rows||[]);if(status)status.textContent=clean.length?'Found '+clean.length+' project stakeholder candidate'+(clean.length===1?'':'s')+'. Review before saving.':'No verified project stakeholder candidates found.';}catch(e){if(status)status.textContent='AI stakeholder research failed: '+(e?.message||'Unknown error');}finally{if(btn)btn.disabled=false;}}
async function loadProjectStakeholderCandidates(projectId){if(!projectId)return[];const {data,error}=await client().from('sales_contact_candidates').select('*').eq('project_id',projectId).eq('review_status','NEW').order('ai_score',{ascending:false});if(error)throw error;return data||[];}
function renderProjectStakeholderCandidates(rows){const box=el('crmProjectStakeholderResults');if(!box)return;box.innerHTML=rows?.length?rows.map(c=>'<div class="crm-research-item"><strong>'+esc(c.organization_name||'Stakeholder')+'</strong><span>'+esc(c.stakeholder_type||'OTHER')+' · '+esc(c.contact_person||'Business route')+' · <b>'+esc(c.confidence||'—')+'</b> · AI '+Number(c.ai_score||0)+'/100</span><small>'+esc(c.position||c.department||'')+(c.email?' · '+esc(c.email):'')+(c.phone?' · '+esc(c.phone):'')+'</small><p>'+esc(c.relevance||c.evidence||'')+'</p><div class="crm-ai-contact-actions"><a class="text-btn" href="'+esc(c.source_url||'#')+'" target="_blank" rel="noopener">Source ↗</a><button type="button" class="accounting-small-btn crm-project-stakeholder-approve" data-id="'+esc(c.id)+'">Save Stakeholder</button><button type="button" class="accounting-small-btn crm-project-stakeholder-reject" data-id="'+esc(c.id)+'">Reject</button></div></div>').join(''):'<div class="crm-research-empty">No project stakeholder candidates yet. Click <b>Find Project Stakeholders with AI</b>.</div>';box.querySelectorAll('.crm-project-stakeholder-approve').forEach(b=>b.onclick=()=>approveProjectStakeholderCandidate(b.dataset.id));box.querySelectorAll('.crm-project-stakeholder-reject').forEach(b=>b.onclick=()=>rejectProjectStakeholderCandidate(b.dataset.id));}
async function approveProjectStakeholderCandidate(id){const {data:c,error}=await client().from('sales_contact_candidates').select('*').eq('id',id).single();if(error)return alert(error.message);if(!confirm('Save '+(c.contact_person||'this stakeholder')+' as a project stakeholder?'))return;const ins=await client().from('sales_project_contacts').insert({project_id:c.project_id,opportunity_id:c.opportunity_id,organization_name:c.organization_name,contact_person:c.contact_person,position:c.position,department:c.department,email:c.email,phone:c.phone,mobile_phone:c.mobile_phone,whatsapp_phone:c.whatsapp_phone,linkedin_url:c.linkedin_url,stakeholder_type:c.stakeholder_type||'OTHER',relevance:c.relevance,source_url:c.source_url,source_name:c.source_name,confidence:c.confidence,evidence:c.evidence,created_by:c.created_by});if(ins.error)return alert(ins.error.message);await client().from('sales_contact_candidates').update({review_status:'APPROVED',reviewed_at:new Date().toISOString()}).eq('id',id);const rows=await loadProjectStakeholders(c.project_id);renderProjectStakeholders(rows);renderProjectStakeholderCandidates([]);}
async function rejectProjectStakeholderCandidate(id){if(!confirm('Reject this project stakeholder candidate?'))return;const {error}=await client().from('sales_contact_candidates').update({review_status:'REJECTED',reviewed_at:new Date().toISOString()}).eq('id',id);if(error)return alert(error.message);renderProjectStakeholderCandidates([]);}
async function openContactResearchModal(accountId){
  const accounts=state.crm.accounts||[];
  if(!accounts.length)return;
  const selected=accounts.find(x=>x.id===accountId)||null;
  const a=selected||accounts[0];
  const contacts=(state.crm.contacts||[]).filter(x=>x.account_id===a.id);
  const opp=(state.crm.opportunities||[]).find(x=>x.account_id===a.id);
  const rows=contacts.length?contacts.map(x=>'<div class="crm-research-contact"><strong>'+esc(x.contact_person)+'</strong><span>'+esc(x.position||x.department||'Business contact')+' · <b>'+esc(x.confidence)+'</b></span><small>'+esc(x.email||'')+' '+esc(x.mobile_phone||x.phone||'')+'</small></div>').join(''):'<div class="crm-research-empty">No individual contacts stored yet.</div>';
  const accountOptions=accounts.map(x=>'<option value="'+x.id+'" '+(x.id===a.id?'selected':'')+'>'+esc(x.company_name)+'</option>').join('');
  const html='<div class="crm-research-card">'+
    '<div class="crm-research-toolbar"><label>Account<select id="crmResearchAccount">'+accountOptions+'</select></label><div><span class="crm-confidence-badge">'+contacts.length+' contact'+(contacts.length===1?'':'s')+'</span></div></div>'+
    '<div class="crm-research-section">'+
      '<div class="eyebrow">AI CONTACT FINDER</div>'+
      '<p class="crm-research-intro">AI searches public project, procurement, engineering and professional sources for <b>business contacts only</b>. It does not guess private contact information or email patterns.</p>'+
      '<div class="crm-ai-contact-find-wrap"><button type="button" class="primary-btn crm-ai-contact-find" id="crmAiContactFindBtn">✦ Find Contacts with AI</button></div>'+
      '<div id="crmAiContactStatus" class="crm-research-intro"></div>'+
      '<div id="crmAiContactResults" class="crm-research-grid"></div><div class="crm-research-section"><div class="eyebrow">PROJECT STAKEHOLDERS</div><p class="crm-research-intro">AI maps the project ecosystem — owner, implementing agency, procurement, contractor, consultant, financier and utility — not only the CRM account.</p><div class="crm-ai-contact-find-wrap"><button type="button" class="primary-btn" id="crmProjectStakeholderFindBtn">✦ Find Project Stakeholders with AI</button></div><div id="crmProjectStakeholderStatus" class="crm-research-intro"></div><div id="crmProjectStakeholderResults" class="crm-research-grid"></div></div>'+
    '</div>'+
    '<div class="crm-research-grid">'+
      '<div class="crm-research-item"><strong>Official / Project / Procurement</strong><span>Engineering, Project, Procurement, SCM or BD contacts.</span><button type="button" class="text-btn crm-research-open" data-query="'+encodeURIComponent(a.company_name+' official contact engineering procurement project')+'">Search ↗</button></div>'+
      '<div class="crm-research-item"><strong>LinkedIn</strong><span>Public professional/company information.</span><button type="button" class="text-btn crm-research-open" data-query="'+encodeURIComponent(a.company_name+' LinkedIn engineering project procurement')+'">Search ↗</button></div>'+
    '</div>'+
    '<div class="crm-research-section"><div class="eyebrow">Add verified business contact manually</div>'+
      '<div class="crm-contact-form-grid">'+
        '<label>Name<input id="crmContactPerson" placeholder="e.g. Project Manager"></label>'+
        '<label>Position<input id="crmContactPosition" placeholder="e.g. Engineering Manager"></label>'+
        '<label>Department<input id="crmContactDepartment" placeholder="Engineering / Project / Procurement / SCM"></label>'+
        '<label>Confidence<select id="crmContactConfidence"><option>HIGH</option><option selected>MEDIUM</option><option>LOW</option></select></label>'+
        '<label>Email<input id="crmContactEmail" type="email" placeholder="business email"></label>'+
        '<label>Office Phone<input id="crmContactPhone" placeholder="+62 ..."></label>'+
        '<label>Mobile<input id="crmContactMobile" placeholder="+62 ..."></label>'+
        '<label>WhatsApp<input id="crmContactWhatsapp" placeholder="+62 ..."></label>'+
        '<label>LinkedIn<input id="crmContactLinkedin" placeholder="https://linkedin.com/..."></label>'+
        '<label>Preferred Channel<select id="crmContactPreferred"><option>WhatsApp</option><option>Mobile</option><option>Phone</option><option>Email</option><option>LinkedIn</option></select></label>'+
        '<label>Source Name<input id="crmContactSourceName" placeholder="Official website / procurement portal / project page"></label>'+
        '<label>Source URL<input id="crmContactSourceUrl" placeholder="https://..."></label>'+
        '<label class="crm-contact-notes">Notes<textarea id="crmContactNotes" placeholder="Why this contact is relevant / verification note"></textarea></label>'+
      '</div><button type="button" class="primary-btn crm-save-contact" id="crmSaveContact">+ Save Verified Contact</button></div>'+
    '<div class="crm-research-section"><div class="eyebrow">Known contacts</div><div class="crm-known-contacts">'+rows+'</div></div>'+
  '</div>';
  const modal=el('salesOpportunityModal'); if(!modal)return;
  modal.classList.add('crm-contact-research-modal');
  el('crmDetailTitle').textContent='Contact Research';
  el('crmDetailSubtitle').textContent=a.company_name;
  const eyebrow=modal.querySelector('.crm-modal-head .eyebrow'); if(eyebrow)eyebrow.textContent='CONTACT INTELLIGENCE';
  el('crmDetailBody').innerHTML=html;
  modal.hidden=false;
  el('crmDetailClose').onclick=()=>{modal.hidden=true;modal.classList.remove('crm-contact-research-modal');if(eyebrow)eyebrow.textContent='SALES OPPORTUNITY';};
  el('crmResearchAccount').onchange=e=>openContactResearchModal(e.target.value);
  el('crmAiContactFindBtn').onclick=()=>runAiContactFinder(a.id);
  const researchOpp=opp;const projectId=researchOpp?.project_id||researchOpp?.sales_projects?.id||'';const researchProject=projectId?((state.crm.projects||[]).find(x=>x.id===projectId)||researchOpp?.sales_projects||{id:projectId}):{};const stakeholderBtn=el('crmProjectStakeholderFindBtn');if(stakeholderBtn&&projectId){stakeholderBtn.onclick=()=>runProjectStakeholderFinder(projectId,researchOpp?.id||null);}else if(stakeholderBtn){stakeholderBtn.onclick=()=>{const s=el('crmProjectStakeholderStatus');if(s)s.textContent='No project is linked to this opportunity yet. Link a project first.';};}if(projectId){loadProjectStakeholders(projectId).then(renderProjectStakeholders).catch(()=>renderProjectStakeholders([]));loadProjectStakeholderCandidates(projectId).then(renderProjectStakeholderCandidates).catch(()=>renderProjectStakeholderCandidates([]));}
  loadAiContactCandidates(a.id).then(rows=>renderAiContactCandidates(a.id,rows)).catch(()=>renderAiContactCandidates(a.id,[]));
  el('crmDetailBody').querySelectorAll('.crm-research-open').forEach(b=>b.onclick=()=>window.open('https://www.google.com/search?q='+b.dataset.query,'_blank','noopener'));
  el('crmSaveContact').onclick=()=>saveCRMContact(a.id);
}

function init(){if(!el('view-sales'))return;bind();showTab(state.tab||'overview');window.addEventListener('pilark:open-sales-tab',e=>{if(e.detail?.tab)showTab(e.detail.tab);});window.addEventListener('pilark:refresh-sales-quotation',()=>{window.dispatchEvent(new CustomEvent('pilark:refresh-accounting-quotation'));});if(client())Promise.all([load(),loadCRM()]).catch(e=>console.warn('Sales init:',e));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();