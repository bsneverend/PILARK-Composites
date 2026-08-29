const KEY='pilarkAdminOverridesV1';
const SESSION_KEY='pilarkAdminSessionV1';

const mediaDefaults=[
  {key:'hero',name:'Hero thumbnail',description:'Homepage hero image',src:'assets/hero-thumbnail.jpg'},
  {key:'company',name:'Company image',description:'Our Company section',src:'assets/company-thumbnail.jpg'},
  {key:'applications',name:'Applications image',description:'Applications feature background',src:'assets/applications-thumbnail.jpg'},
  {key:'vision',name:'Vision & Mission',description:'Popup image',src:'assets/vision-mission.jpg'}
];

const productDefaults=[
['molded-grating','Molded Grating','assets/molded-grating-product.jpg?v=20260829'],['pultruded-grating','Pultruded Grating','assets/pultruded-grating-thumb.jpg'],['bmc-manhole','BMC Manhole Cover','assets/bmc-manhole-cover-thumb.jpg'],['grating-manhole','Grating Manhole Cover','assets/grating-manhole-cover-thumb.jpg'],['cable-tray','FRP Cable Tray','assets/frp-cable-tray-thumb.jpg'],['cable-ladder','FRP Cable Ladder','assets/frp-cable-ladder-thumb.jpg'],['gfrp-profiles','GFRP Profiles','assets/gfrp-profiles-thumb.jpg'],['handrail','GFRP Handrail','assets/gfrp-handrail-thumb.jpg'],['cage-ladder','FRP Cage Ladder','assets/frp-cage-ladder-thumb.jpg'],['gfrp-rebar','GFRP Rebar','assets/gfrp-rebar-thumb.jpg'],['gfrp-wire-mesh','GFRP Wire Mesh','assets/grp-wire-mesh.jpg'],['drainage-bmc','BMC Trench Drainage','assets/bmc-trench-drainage.jpg'],['drainage-pp','Polypropylene Drainage','assets/polypropylene-drainage.jpg'],['polymer-concrete','Polymer Concrete Drainage','assets/polymer-concrete-drainage.jpg'],['individual-septic','Individual Bio Septic Tank','assets/individual-bio-septic-tank.jpg'],['communal-septic','Communal Bio Septic Tank','assets/communal-bio-septic-tank.jpg'],['frp-sheet-piling','FRP Sheet Piling','assets/frp-sheet-piling.jpg'],['gfrp-optic-pole','GFRP Optic Pole','assets/gfrp-optic-pole.jpg']
];

const contentGroups=[
  {key:'hero',title:'Homepage Hero',description:'Main introduction shown at the top of the website.',fields:[
    ['eyebrow','Eyebrow','PILARK Composites · PT Panca Integra Laguna Reksa','input'],
    ['title','Main heading','Composite solutions built for real environments.','textarea'],
    ['copy','Description','Fiberglass Reinforced Polymer solutions for industrial, residential, commercial and infrastructure applications — engineered around durability, corrosion resistance, strength and long-term performance.','textarea']
  ]},
  {key:'company',title:'About Us',description:'Main company introduction section.',fields:[
    ['eyebrow','Eyebrow','Our Company','input'],
    ['title','Main heading','Quality is our commitment. Innovation is our step.','textarea'],
    ['copy1','First paragraph','PILARK Composites delivers reliable Fiberglass Reinforced Plastic (FRP) solutions for industrial, commercial and infrastructure applications. We combine engineering expertise, manufacturing capability and a commitment to quality to deliver solutions built for demanding environments.','textarea'],
    ['copy2','Second paragraph','With a focus on innovation, durability and long-term performance, we work to support our customers with composite solutions that meet evolving project requirements.','textarea']
  ]},
  {key:'applications',title:'Applications',description:'Introduction for the applications section.',fields:[
    ['title','Main heading','From plant floors to public infrastructure.','textarea'],
    ['copy','Description','Our composite solutions are designed for a wide range of industrial, commercial and infrastructure applications. From demanding production environments to public facilities, PILARK supports projects with durable and reliable material solutions tailored to their specific requirements.','textarea']
  ]},
  {key:'services',title:'Services',description:'Introduction for the services section.',fields:[
    ['title','Main heading','More than products.','textarea'],
    ['copy','Description','Beyond manufacturing, we provide technical support throughout the project process. From initial consultation and engineering to fabrication and installation supervision, our team works closely with customers to deliver practical and reliable solutions.','textarea']
  ]}
];

let cloudState={media:{},products:{},content:{}};
function cloudReady(){return !!window.PILARK_CMS?.ready}
function load(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}}
function activeData(){return cloudReady()?cloudState:load()}
async function loadCloudState(){if(!cloudReady())return false;cloudState=await window.PILARK_CMS.load()||{media:{},products:{},content:{}};return true}
async function cloudUpload(file,path){
  const c=window.PILARK_CMS.client;
  const {error}=await c.storage.from('website-media').upload(path,file,{upsert:true,cacheControl:'3600',contentType:file.type});
  if(error)throw error;
  const {data}=c.storage.from('website-media').getPublicUrl(path);
  return data.publicUrl;
}
async function saveMediaCloud(key,src){const {error}=await window.PILARK_CMS.client.from('site_media').upsert({key,src,updated_at:new Date().toISOString()});if(error)throw error;cloudState.media[key]=src}
async function saveProductCloud(id,img){const {error}=await window.PILARK_CMS.client.from('site_products').upsert({id,image_url:img,updated_at:new Date().toISOString()});if(error)throw error;cloudState.products[id]={img}}
async function saveContentCloud(section,data){const {error}=await window.PILARK_CMS.client.from('site_content').upsert({section,data,updated_at:new Date().toISOString()});if(error)throw error;cloudState.content[section]=data}
function save(data){localStorage.setItem(KEY,JSON.stringify(data))}
function getMedia(item){return activeData().media?.[item.key]||item.src}
function getProduct(id,src){return activeData().products?.[id]?.img||src}
function getContent(group,field,fallback){return activeData().content?.[group]?.[field]??fallback}
function upload(file,done){if(!file)return;if(cloudReady()){done(file);return;}if(file.size>3500000){alert('For local dashboard mode, please use an image below 3.5 MB.');return}const r=new FileReader();r.onload=()=>done(r.result);r.readAsDataURL(file)}

function mediaCard(item){return '<article class="media-card"><div class="media-preview"><img src="'+getMedia(item)+'" alt=""></div><div class="media-card-body"><b>'+item.name+'</b><span>'+item.description+'</span><label class="upload-btn">Replace image<input type="file" accept="image/*" data-media="'+item.key+'"></label></div></article>'}
function renderMedia(){document.getElementById('mediaGrid').innerHTML=mediaDefaults.map(mediaCard).join('');document.getElementById('quickMedia').innerHTML=mediaDefaults.map(mediaCard).join('');bindUploads()}

function renderProducts(query=''){
  const q=query.trim().toLowerCase();
  const list=productDefaults.filter(([,name])=>!q||name.toLowerCase().includes(q));
  document.getElementById('productEditor').innerHTML=list.map(([id,name,src])=>'<article class="product-edit-card"><img src="'+getProduct(id,src)+'" alt=""><div class="product-edit-body"><h3>'+name+'</h3><span>Product thumbnail</span><label class="upload-btn">Replace thumbnail<input type="file" accept="image/*" data-product="'+id+'"></label></div></article>').join('');
  bindUploads();
}

function bindUploads(){
  document.querySelectorAll('input[data-media]').forEach(input=>input.onchange=e=>upload(e.target.files[0],async result=>{
    try{
      const key=e.target.dataset.media;
      if(cloudReady()){const src=await cloudUpload(result,'media/'+key+'-'+Date.now()+'-'+result.name.replace(/[^a-z0-9._-]/gi,'-'));await saveMediaCloud(key,src);}
      else {const d=load();d.media=d.media||{};d.media[key]=result;save(d);}
      renderMedia();updateStats();
    }catch(err){alert('Upload failed: '+err.message);}
  }));
  document.querySelectorAll('input[data-product]').forEach(input=>input.onchange=e=>upload(e.target.files[0],async result=>{
    try{
      const id=e.target.dataset.product;
      if(cloudReady()){const src=await cloudUpload(result,'products/'+id+'-'+Date.now()+'-'+result.name.replace(/[^a-z0-9._-]/gi,'-'));await saveProductCloud(id,src);}
      else {const d=load();d.products=d.products||{};d.products[id]={img:result};save(d);}
      renderProducts(document.getElementById('productSearch')?.value||'');updateStats();
    }catch(err){alert('Upload failed: '+err.message);}
  }));
}

function renderContentEditor(){
  const el=document.getElementById('contentEditor');
  el.innerHTML=contentGroups.map(group=>{
    const fields=group.fields.map(([key,label,fallback,type])=>{
      const value=getContent(group.key,key,fallback).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      return '<label>'+label+(type==='textarea'?'<textarea rows="3" data-field="'+key+'">'+value+'</textarea>':'<input data-field="'+key+'" value="'+value+'">')+'</label>';
    }).join('');
    return '<article class="content-card" data-group="'+group.key+'"><div class="content-card-head"><div><h3>'+group.title+'</h3><p>'+group.description+'</p></div></div><div class="content-fields">'+fields+'</div><div class="content-actions"><button type="button" class="reset-section-btn" data-reset-group="'+group.key+'">Reset section</button><button type="button" class="save-btn" data-save-group="'+group.key+'">Save changes</button></div><div class="content-status" data-status="'+group.key+'"></div></article>';
  }).join('');
  el.querySelectorAll('[data-save-group]').forEach(btn=>btn.onclick=()=>{
    const card=btn.closest('[data-group]'),group=card.dataset.group;
    const payload={};card.querySelectorAll('[data-field]').forEach(field=>payload[field.dataset.field]=field.value.trim());
    if(cloudReady()){saveContentCloud(group,payload).then(()=>{card.querySelector('[data-status]').textContent='Saved to cloud. The live website will use the new content.';updateStats();}).catch(err=>alert('Save failed: '+err.message));}
    else {const d=load();d.content=d.content||{};d.content[group]=payload;save(d);card.querySelector('[data-status]').textContent='Saved locally. Preview the website to see the update.';updateStats();}
  });
  el.querySelectorAll('[data-reset-group]').forEach(btn=>btn.onclick=()=>{
    const group=btn.dataset.resetGroup;
    if(cloudReady()){window.PILARK_CMS.client.from('site_content').delete().eq('section',group).then(({error})=>{if(error)throw error;delete cloudState.content[group];renderContentEditor();updateStats();}).catch(err=>alert('Reset failed: '+err.message));}
    else {const d=load();if(d.content)delete d.content[group];save(d);renderContentEditor();updateStats();}
  });
}

function updateStats(){
  const d=activeData();
  document.getElementById('productCount').textContent=productDefaults.length;
  document.getElementById('mediaCount').textContent=mediaDefaults.length;
  const contentCount=Object.values(d.content||{}).reduce((n,g)=>n+Object.keys(g||{}).length,0);
  document.getElementById('contentCount').textContent=contentCount;
}

function showView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+name));
  document.querySelectorAll('.side-link').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  document.getElementById('pageTitle').textContent={dashboard:'Website overview',media:'Media Library',products:'Product thumbnails',sections:'Website Content',settings:'Settings'}[name]||'PILARK Admin';
}

function enterDashboard(){
  document.getElementById('loginView').hidden=true;
  document.getElementById('adminApp').hidden=false;
  sessionStorage.setItem(SESSION_KEY,'1');
}

document.addEventListener('DOMContentLoaded',async()=>{
  // Bind login first so the dashboard can always be opened even if an editor
  // section has a missing asset or encounters a rendering error.
  const loginForm=document.getElementById('loginForm');
  await loadCloudState().catch(err=>console.warn('CMS not configured:',err));
  const loginStatus=document.getElementById('loginStatus');

  if(loginForm){
    loginForm.addEventListener('submit',e=>{
      e.preventDefault();
      const email=document.getElementById('adminEmail')?.value.trim()||'';
      const password=document.getElementById('adminPassword')?.value||'';

      if(!email||!password){if(loginStatus) loginStatus.textContent='Please enter your email and password.';return;}
      if(cloudReady()){
        if(loginStatus) loginStatus.textContent='Signing in...';
        window.PILARK_CMS.client.auth.signInWithPassword({email,password}).then(async({error})=>{
          if(error){if(loginStatus)loginStatus.textContent=error.message;return;}
          await loadCloudState();if(loginStatus)loginStatus.textContent='';enterDashboard();
        }).catch(err=>{if(loginStatus)loginStatus.textContent=err.message;});
        return;
      }
      if(loginStatus) loginStatus.textContent='';
      enterDashboard();
    });
  }

  try{
    renderMedia();
    renderProducts();
    renderContentEditor();
    updateStats();

    document.querySelectorAll('.side-link').forEach(b=>b.onclick=()=>showView(b.dataset.view));
    document.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>showView(b.dataset.goto));
    document.getElementById('productSearch')?.addEventListener('input',e=>renderProducts(e.target.value));

    const logoutBtn=document.getElementById('logoutBtn');
    if(logoutBtn) logoutBtn.onclick=()=>{
      sessionStorage.removeItem(SESSION_KEY);if(cloudReady())window.PILARK_CMS.client.auth.signOut();
      document.getElementById('adminApp').hidden=true;
      document.getElementById('loginView').hidden=false;
      document.getElementById('loginForm').reset();
    };

    const resetBtn=document.getElementById('resetBtn');
    if(resetBtn) resetBtn.onclick=()=>{
      if(confirm('Reset all local dashboard changes?')){
        localStorage.removeItem(KEY);
        renderMedia();renderProducts();renderContentEditor();updateStats();
        alert('Local changes reset. The website will return to repository defaults in this browser.');
      }
    };
  }catch(err){
    console.error('Admin editor initialization failed:',err);
    if(loginStatus) loginStatus.textContent='Editor initialization issue detected. You can still log in to open the dashboard.';
  }

  if(cloudReady()){
    const {data:{session}}=await window.PILARK_CMS.client.auth.getSession();
    if(session){await loadCloudState();enterDashboard();}
  }else if(sessionStorage.getItem(SESSION_KEY)==='1') enterDashboard();
});