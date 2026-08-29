
const ADMIN_OVERRIDES_KEY='pilarkAdminOverridesV1';
function getAdminOverrides(){try{return JSON.parse(localStorage.getItem(ADMIN_OVERRIDES_KEY)||'{}')}catch(e){return {}}}
function applyAdminOverrides(){
  const o=getAdminOverrides();
  if(o.products){products.forEach(p=>{if(o.products[p.id]?.img)p.img=o.products[p.id].img;});}

  const set=(id,src)=>{const el=document.getElementById(id);if(el&&src)el.src=src;};
  set('navbarLogo',o.media?.navbarLogo);
  set('footerLogo',o.media?.footerLogo);
  set('heroThumbnail',o.media?.hero);
  set('companyThumbnail',o.media?.company);
  set('visionMissionImage',o.media?.vision);
  if(o.media?.applications){const el=document.getElementById('applicationsMedia');if(el)el.style.backgroundImage='url("'+o.media.applications.replace(/"/g,'\\\"')+'")';}

  const content=o.content||{};
  const setText=(selector,value,index=0)=>{
    if(value===undefined||value===null||value==='')return;
    const nodes=document.querySelectorAll(selector),el=nodes[index];
    if(el)el.textContent=value;
  };

  if(content.hero){
    setText('.hero .eyebrow',content.hero.eyebrow);
    setText('.hero h1',content.hero.title);
    setText('.hero-copy',content.hero.copy);
  }
  if(content.company){
    setText('.company-copy .eyebrow',content.company.eyebrow);
    setText('.company-copy h2',content.company.title);
    setText('.company-copy p',content.company.copy1,0);
    setText('.company-copy p',content.company.copy2,1);
  }
  if(content.applications){
    setText('#applications .section-head h2',content.applications.title);
    setText('#applications .section-head p',content.applications.copy);
  }
  if(content.services){
    setText('#services .section-head h2',content.services.title);
    setText('#services .section-head p',content.services.copy);
  }
}

const products=[
{id:'molded-grating',cat:'FRP Grating',title:'Molded Grating',img:'assets/molded-grating-product.jpg?v=20260829',modalImg:'assets/profile/page14.jpg',desc:'GFRP molded grating manufactured through a molding process using fiberglass reinforcement, thermosetting resin and controlled curing.',page:14,features:['Open-mold manufacturing process','Corrosion and chemical resistance','Non-conductive composite flooring','Multiple mesh, color and surface options'],spec:[['Typical application','Industrial flooring, platforms, walkways, trench covers'],['Open area','Multiple configurations in catalog'],['Surface options','Anti-skid, concave, chequered plate, flat'],['Colors','Dark green, dark grey, light grey, yellow']]},
{id:'pultruded-grating',cat:'FRP Grating',title:'Pultruded Grating',img:'assets/pultruded-grating-thumb.jpg',modalImg:'assets/catalog/page19.jpg',desc:'Pultruded grating manufactured by pulling fiberglass reinforcements through resin, then shaping and heating into structural grating profiles.',page:15,features:['High strength-to-weight ratio','Directional load-bearing performance','Lightweight modular construction','Demanding industrial environments'],spec:[['Series','G-2500, G-4000, G-5000'],['Cross rod','Catalog provides dimensions by series'],['Open area','Catalog provides values by series']]},
{id:'bmc-manhole',cat:'Manhole Covers',title:'BMC Manhole Cover',img:'assets/bmc-manhole-cover-thumb.jpg',modalImg:'assets/profile/page15.jpg',desc:'BMC manhole cover system using bulk molding compound for inspection chambers where strength, corrosion resistance and lightweight handling are required.',page:24,features:['Rounded and square variants','Resin and glass-fiber composite','Lightweight','Multiple colors'],spec:[['Material','BMC / Bulk Molding Compound'],['Variants','Rounded and Square'],['Colors','Black, Light Grey, Yellow, Green']]},
{id:'grating-manhole',cat:'Manhole Covers',title:'Grating Manhole Cover',img:'assets/grating-manhole-cover-thumb.jpg',modalImg:'assets/profile/page16.jpg',desc:'Combination of molded grating and chequered plate for manhole access, providing strength, slip resistance and drainage/open-area performance.',page:16,features:['Molded grating + chequered plate','Anti-slip performance','Practical access solution','Custom applications supported'],spec:[['Product','Grating Manhole Cover'],['Surface','Chequered plate / molded grating'],['Application','Manholes and inspection areas']]},
{id:'cable-tray',cat:'Cable Management',title:'FRP Cable Tray',img:'assets/frp-cable-tray-thumb.jpg',modalImg:'assets/profile/page18.jpg',desc:'GFRP cable support system designed to organize cable routes and reduce maintenance in demanding environments.',page:27,features:['Strong GFRP construction','Electrical insulation','Corrosion resistance','Straight and fitting configurations'],spec:[['System','FRP Cable Tray'],['Use','Cable routing and support'],['Fittings','Horizontal elbow, vertical elbow, tee and reducer']]},
{id:'cable-ladder',cat:'Cable Management',title:'FRP Cable Ladder',img:'assets/frp-cable-ladder-thumb.jpg',modalImg:'assets/profile/page19.jpg',desc:'GFRP cable ladder system consisting of two longitudinal side rails connected by cross bars for open, accessible cable support.',page:28,features:['Open structure','Maintenance-friendly','Lightweight and corrosion resistant','Type 100 and Type 150'],spec:[['Types','Type 100, Type 150'],['Load test','Catalog includes load-test tables'],['Standards','NEMA loading standards referenced']]},
{id:'gfrp-profiles',cat:'Structural FRP',title:'GFRP Profiles',img:'assets/gfrp-profiles-thumb.jpg',modalImg:'assets/profile/page17.jpg',desc:'Pultruded GFRP structural profiles available in cross-sectional shapes for construction and industrial applications.',page:30,features:['Square and rectangular hollow','U-channel','Equal-angle','I-beam, floor deck and C-channel'],spec:[['Manufacturing','Pultrusion'],['Material','GFRP'],['Applications','Structural and construction components']]},
{id:'handrail',cat:'Access & Safety',title:'GFRP Handrail',img:'assets/gfrp-handrail-thumb.jpg',modalImg:'assets/profile/page22.jpg',desc:'GFRP handrail and fittings providing high strength, corrosion resistance and easy installation.',page:33,features:['Base mounting square','3-way and 4-way corners','Cross joint and adjustable elbow','Modular handrail systems'],spec:[['Material','GFRP'],['Tube','Round tube configurations'],['Applications','Industrial facilities, bridges, platforms, infrastructure']]},
{id:'cage-ladder',cat:'Access & Safety',title:'FRP Cage Ladder',img:'assets/frp-cage-ladder-thumb.jpg',modalImg:'assets/catalog/page35.jpg',desc:'FRP cage ladder system designed for safe, durable access in industrial and commercial facilities.',page:35,features:['Corrosion resistant','Protective cage','Non-conductive','Lightweight'],spec:[['System','FRP Cage Ladder'],['Components','Elliptic bar, U-channel, flat bar and serrated tube'],['Application','Industrial and commercial access']]},
{id:'gfrp-rebar',cat:'GFRP Reinforcement',title:'GFRP Rebar',img:'assets/gfrp-rebar-thumb.jpg',modalImg:'assets/profile/page23.jpg',desc:'Concrete reinforcement made from fiberglass and resin, offering lower weight and corrosion resistance for structures exposed to harsh environments.',page:37,features:['Lightweight','High tensile strength','Non-corrosive','Aggressive environments'],spec:[['Diameter','6, 8, 10, 12, 16, 22, 28, 32, 36, 38 mm'],['Length','6000 mm'],['Tensile strength','Catalog provides values by diameter'],['Weight','Catalog provides kg/m by diameter']]},
{id:'gfrp-wire-mesh',cat:'GFRP Reinforcement',title:'GFRP Wire Mesh',img:'assets/grp-wire-mesh.jpg',modalImg:'assets/catalog/page40.jpg',desc:'Fiberglass and resin reinforcing mesh intended for structures frequently exposed to water, chemicals or corrosive environments.',page:40,features:['Corrosion resistant','Lightweight','Non-conductive','Demanding environments'],spec:[['O-Line fiberglass wiremesh','1700 × 2400 × Ø10 mm'],['O-Line fiberglass wiremesh','1700 × 2400 × Ø12 mm']]},
{id:'drainage-bmc',cat:'Drainage',title:'BMC Trench Drainage',img:'assets/bmc-trench-drainage.jpg',modalImg:'assets/catalog/page41.jpg',desc:'BMC trench drainage system formed from thermosetting resin, fiberglass, fillers and additives for durable surface-water management.',page:41,features:['Durable and corrosion resistant','Customizable','Lightweight','Industrial, parking, residential and infrastructure'],spec:[['Material','BMC / thermosetting resin composite'],['System','Trench drainage'],['Catalog data','Width, height, length and weight']]},
{id:'drainage-pp',cat:'Drainage',title:'Polypropylene Drainage',img:'assets/polypropylene-drainage.jpg',modalImg:'assets/catalog/page42.jpg',desc:'O-Line PP drainage system designed for rapid ground-rainwater collection and directing to municipal pipe networks.',page:42,features:['Polypropylene','Modular channel','Multiple sizes','Connector accessories'],spec:[['Material','Polypropylene'],['Length','1000 mm modules'],['Widths','Multiple dimensions from 100 to 500 mm']]},
{id:'polymer-concrete',cat:'Drainage',title:'Polymer Concrete Drainage',img:'assets/polymer-concrete-drainage.jpg',modalImg:'assets/catalog/page43.jpg',desc:'Polymer concrete channels, sumps and kerbs combining mineral fillers with synthetic or natural resin for durable drainage systems.',page:43,features:['Long service life','High-performance composite','Infrastructure and construction','Pits and channels'],spec:[['Material','Polymer concrete'],['Product range','Channels, sumps, kerbs and pits'],['Catalog data','Multiple width/height configurations']]},
{id:'individual-septic',cat:'Septic & Wastewater',title:'Individual Bio Septic Tank',img:'assets/individual-bio-septic-tank.jpg',modalImg:'assets/profile/page25.jpg',desc:'Individual septic tank available in GFRP and LLDPE, designed for household wastewater treatment with durable, leak-resistant construction.',page:25,features:['Household wastewater treatment','Strong and lightweight','Leak-resistant','Installation accessories'],spec:[['Materials','GFRP and LLDPE'],['Configuration','Three-chamber system shown'],['Accessories','Sealing tape, sealing ring, nut & screws, elbow pipe, cover, partition panel, honey comb, bio ball']]},
{id:'communal-septic',cat:'Septic & Wastewater',title:'Communal Bio Septic Tank',img:'assets/communal-bio-septic-tank.jpg',modalImg:'assets/profile/page26.jpg',desc:'Communal septic tank system designed for wastewater collection and processing from several homes or buildings in one system.',page:26,features:['Communal wastewater treatment','Strong and durable','Corrosion resistant','Multi-house or building applications'],spec:[['Material','GFRP'],['Use','Several homes or buildings'],['Configuration','Horizontal tank with staged treatment']]},
{id:'frp-sheet-piling',cat:'Structural FRP',title:'FRP Sheet Piling',img:'assets/frp-sheet-piling.jpg',modalImg:'assets/profile/page20.jpg',desc:'FRP sheet piling provides a flexible and lightweight solution for retaining and earth-support applications with corrosion resistance.',page:20,features:['Flexible and lightweight','High section modulus','Corrosion resistant','Retaining and earth support'],spec:[['Material','FRP'],['Application','Retaining, earth support and infrastructure']]},
{id:'gfrp-optic-pole',cat:'Utility',title:'GFRP Optic Pole',img:'assets/gfrp-optic-pole.jpg',modalImg:'assets/profile/page21.jpg',desc:'Composite pole made from fiberglass reinforced resin, designed for outdoor lighting and communication infrastructure.',page:21,features:['Lightweight','High mechanical strength','Corrosion resistant','Outdoor lighting and communication'],spec:[['Material','GFRP'],['Application','Outdoor lighting and communication infrastructure']]}
];

async function applyCloudCms(){
  const cms=window.PILARK_CMS;
  if(!cms?.ready) return false;
  const o=await cms.load();
  if(!o) return false;

  if(o.products){products.forEach(p=>{if(o.products[p.id]?.img)p.img=o.products[p.id].img;});}
  const set=(id,src)=>{const el=document.getElementById(id);if(el&&src)el.src=src;};
  set('navbarLogo',o.media?.navbarLogo);
  set('footerLogo',o.media?.footerLogo);
  set('heroThumbnail',o.media?.hero);
  set('companyThumbnail',o.media?.company);
  set('visionMissionImage',o.media?.vision);
  if(o.media?.applications){const el=document.getElementById('applicationsMedia');if(el)el.style.backgroundImage='url("'+String(o.media.applications).replace(/"/g,'\\\"')+'")';}

  const content=o.content||{};
  const setText=(selector,value,index=0)=>{if(value===undefined||value===null||value==='')return;const nodes=document.querySelectorAll(selector),el=nodes[index];if(el)el.textContent=value;};
  if(content.hero){setText('.hero .eyebrow',content.hero.eyebrow);setText('.hero h1',content.hero.title);setText('.hero-copy',content.hero.copy);}
  if(content.company){setText('.company-copy .eyebrow',content.company.eyebrow);setText('.company-copy h2',content.company.title);setText('.company-copy p',content.company.copy1,0);setText('.company-copy p',content.company.copy2,1);}
  if(content.applications){setText('#applications .section-head h2',content.applications.title);setText('#applications .section-head p',content.applications.copy);}
  if(content.services){setText('#services .section-head h2',content.services.title);setText('#services .section-head p',content.services.copy);}
  return true;
}

const clientSectors=[{"title":"Agriculture","items":["Evans Group (MG)","Sorini Agro Asia Corp Tbk, PT (PF)","Wilmar Indonesia Group, PT (CL,CT,MG)"]},{"title":"Automotive","items":["Evolution Tyres, PT (MG)","Yamaha Indonesia Motor Manufacturing (MG)"]},{"title":"Building","items":["Sequis Tower (MG)"]},{"title":"Chemical","items":["Asahimas Chemical, PT (CL, CT,MG)","Austin Powder Indonesia, PT (MG)","Dover Indonesia Chemical, PT (CT)","Galic Bina Mada, PT (MG)","Indonesia Acids Industry, PT (PG)","Kaltim Nitrate Indonesia, PT (MG, CM)","Lautan Otsuka Chemical, PT (MG)","Lautan Luas Sulfamat, PT (MG)","Liku Telaga, PT (PG)","Mitsubishi Chemical Indonesia, PT (PG)","Multi Nitrotama Kimia, PT (PG)","Pacinesia Chemical Industry, PT (MG)","Sulfindo Adiusah, PT (CL,CT,MG)"]},{"title":"Cooling Tower","items":["Golden Mulyono Pratama, PT (PF)"]},{"title":"Developer","items":["MAS Group (ST)","Metropolitan Land (ST)","Sinarmas Land, Kota Wisata (MG)","Sinarmas Land, Legenda Wisata (MG)","Summarecon Bogor (MG)"]},{"title":"Engineering & Contractor","items":["Adhi Karya, PT (MG)","Asahi Synchrotech Indonesia, PT (MG)","Bajra Mandalasakti, PT (CL)","Black and Veatch, PT (MG)","Chiyoda International Indonesia, PT (MG)","Fadajaya Makmur, PT (CL,MG)","Inti Bumi Mas, PT (CL)","Jaya Konstruksi Manggala, PT (MG)","Jagat Konstruksi, PT (MG)","Libratama, PT (CL)","Linde Indonesia, PT (CT)","Lintech Duta Pratama, PT (MG)","Livia Andalan Indonesia, PT (CL, MG)","Memiontec Indonesia, PT (MG)","Murinda Iron Steel, PT (MG)","Niatsae Prakarsa Indonesia, PT (MG,PF)","Nindya Karya (Persero), PT (MG)","Pembangunan Perumahan (Persero), PT (MG)","Prambanan Dwipaka, PT (MG)","Rekayasa Industri, PT (CL, MG &amp; Stairway.)","Samsung C&amp;T (CT)","Sanggar Sarana Baja, PT (MG)","Satria Nusa Engineering (MG, PF)","Takenaka Indonesia, PT (MG)","Tatamulia Nusantara Indah, PT (PG)","Total Bangun Persada, PT (MG)","Weir Mineral, PT (MG)","Wijaya Karya, PT (MG,CT,PF)"]},{"title":"Factory","items":["Berkah Manis Makmur, PT (MG)","Cibadak Indah Sari Farm (MG)","Cheetham Garam Indonesia, PT (MG,PF)","Duta Sugar International, PT (MG)","Dystar Colours, PT (CT, MG, HR)","Lautan Natural Krimerindo, PT (MG)","Greenfield Indonesia, PT (MG)","Rejoso Manis Indo, PT (PF)","SK Metalindo, PT (MG)"]},{"title":"Fertilizer","items":["Agri Indomas, PT (MG)","Petrokimia Gresik, PT (CL,CT, MG)","Pupuk Iskandar Muda, PT (MG)","Pupuk Kaltim, PT (CL,CT,MG)","Pupuk Kujang, PT (MG &amp; PF)","Pupuk Sriwidjaya Palembang (Pusri), PT (CT)"]},{"title":"Government","items":["PU Bontang (MC)","PU Cirebon (MC)","PU Jember (MC)","PU Lumajang (MC)","PU Ogan Ilir (MC)","PU Situ Bondo (MC)","PU Sleman (MC)","PU Sukoharjo (MC)","PU Surakarta (MC)","PU Yogyakarta (MC)"]},{"title":"Maritime","items":["Pancaran Group (MG)","Samudra Marine Indonesia, PT (MG)","Waruna Shipyard Indonesia, PT (MG)"]},{"title":"Oil & Gas","items":["Essa Industries Indonesia, PT (MG)","Jambaran Tiung Biru, Pertamina (CL)","Pertamina Drilling Services Indonesia, PT (ST)","Pertamina Hulu Energy, PT (MG)"]},{"title":"Power Plant","items":["Cirebon Electric Power, PT (CL)","Indonesia Power, PT (MG)","Jambaran Tiung Biru, Pertamina (CL)","Jawa Satu (CT,PF)","Lestari Banten Energy (HR,MG)","Muara Laboeh Geothermal (MG,SW)","Merak Energy (MG)","PLTU Lontar (MG)","PLTU Muara Karang (PG)","PLTU Labuan Angin Sibolga (MG)","PLTU Tanjung Awar Awar (MG)","PLTU Paiton Energy (CL,CT,MG)","Sarula Geothermal (CL)","Star Energy, PT (PF)","Supreme Energy, PT (PF)","Tanjung Jati Power Services, PT (MG)","Wilmar Bioenergi Indonesia, PT (MG)"]},{"title":"Pulp & Paper","items":["OKI 2 Expansion (MG)","Pabrik Kertas Tjiwi Kimia, Tbk, PT (MG)","Papertech Indonesia, PT (CT,MG)","Pindo Deli Pulp &amp; Paper (MG)","Riau Andalan Pulp &amp; Paper, PT (CL,MG)","Tanjung Enim Lestari, PT (CL)","Toba Pulp Lestari, PT (PG)"]},{"title":"Recreation","items":["Goa Laumehe, (MG)","Taman Bendera Pusaka (MG)","Taman Safari Indonesia (Bali) (MG,PF)"]},{"title":"Resources","items":["Adaro Indonesia, PT (MG)","Amman Mineral Nusa Tenggara, PT (MG, PG)","Batu Tua Tembaga Raya, PT (CL,MG)","Bumi Suksesindo, PT (CL,MG)","Freeport Indonesia, PT (CL,MG)","Halmahera Persada Lygend (MG, PF)","Kayong Aluminium Nusantara, PT (MC)","Merdeka Tsingshan Indonesia, PT (MG)","Mifa Bersaudara, PT (MG)","Timah Industri, PT (MG)","QMB New Energy, PT (MG,PF)"]},{"title":"Telecommunication","items":["Dayamitra Telekomunikasi Tbk, PT (PF)"]},{"title":"Textile","items":["Bandung Sakura Textile, PT (MG)","Biporin Agung, PT (MG)","South Pasific Viscose, PT (MG)"]},{"title":"Transportation","items":["KAI Bandung (MG)"]},{"title":"Water Treatment","items":["Envicon Ekatama, PT (MG)","Organo Indonesia, PT (MG)","WWTP Ancol (MG)","WWTP Pekan Baru (MG)","IPAL Sintanala (MG)"]}];
const clientAbbreviationNote=["CL : Cable Ladder","CM : Custom","CT : Cable Tray","HR : Handrail","MC : Manhole Cover","MG : Molded Grating","PF : Profile","PG : Pultruded Grating","ST : Septic Tank"];
function openClientSector(index){const sector=clientSectors[index],modal=$('clientModal');if(!sector||!modal)return;$('clientModalTitle').textContent=sector.title;$('clientModalCount').textContent=`${sector.items.length} listed client${sector.items.length===1?'':'s'}`;$('clientModalList').innerHTML=sector.items.map(item=>`<div class="client-list-item">${item}</div>`).join('');const noteEl=$('clientModalNote');if(noteEl){noteEl.innerHTML=sector.title==='Government'?'':clientAbbreviationNote.map(item=>`<span>${item}</span>`).join('');noteEl.hidden=sector.title==='Government'||!clientAbbreviationNote.length;}modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.classList.add('lock');}
function closeClientModal(){const modal=$('clientModal');modal?.classList.remove('open');modal?.setAttribute('aria-hidden','true');document.body.classList.remove('lock');}
function initClientModal(){document.querySelectorAll('[data-client-sector]').forEach(btn=>btn.addEventListener('click',()=>openClientSector(Number(btn.dataset.clientSector))));$('closeClientModal')?.addEventListener('click',closeClientModal);$('clientModal')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeClientModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('clientModal')?.classList.contains('open'))closeClientModal();});}

const $=id=>document.getElementById(id);
const categories=['All',...new Set(products.map(p=>p.cat))];
function renderFilters(){const el=$('filters');if(!el)return;el.innerHTML=categories.map((c,i)=>`<button class="filter ${i?'':'active'}" data-filter="${c}">${c}</button>`).join('');el.querySelectorAll('.filter').forEach(b=>b.onclick=()=>{el.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderProducts(b.dataset.filter)})}
function renderProducts(filter='All'){const el=$('productGrid');if(!el)return;const list=filter==='All'?products:products.filter(p=>p.cat===filter);el.innerHTML=list.map(p=>`<article class="product reveal"><div class="product-media"><img loading="lazy" src="${p.img}" alt="${p.title}"></div><div class="product-body"><div class="product-meta"><span class="pill">${p.cat}</span></div><h3>${p.title}</h3><p>${p.desc}</p><button class="product-link" data-product="${p.id}" style="border:0;background:none;padding:0;cursor:pointer">Explore specifications →</button></div></article>`).join('');el.querySelectorAll('[data-product]').forEach(b=>b.onclick=()=>openProduct(b.dataset.product));observeReveals()}
function openProduct(id){const p=products.find(x=>x.id===id),m=$('productModal');if(!p||!m)return;$('modalTitle').textContent=p.title;$('modalImage').src=p.modalImg||p.img;$('modalImage').alt=p.title;$('modalDesc').textContent=p.desc;$('modalFeatures').innerHTML=p.features.map(x=>`<li>${x}</li>`).join('');$('modalSpec').innerHTML=p.spec.map(r=>`<tr><th>${r[0]}</th><td>${r[1]}</td></tr>`).join('');$('modalCatalog').href='#catalog';$('modalCatalog').dataset.page=String(p.page);m.classList.add('open');document.body.classList.add('lock')}
function closeModal(){$('productModal')?.classList.remove('open');document.body.classList.remove('lock')}
const CATALOG_TOTAL=49;
let catalogPage=1,catalogPickerReady=false;
function catalogSrc(page){return `assets/catalog/page${String(page).padStart(2,'0')}.jpg`}
function renderCatalog(){const el=$('catalogGrid');if(!el)return;el.innerHTML=`<article class="catalog-brochure reveal show"><div class="catalog-brochure-cover"><img src="${catalogSrc(1)}" alt="PILARK Catalog 2026 cover"></div><div class="catalog-brochure-info"><div class="eyebrow">Digital brochure</div><h3>PILARK Product Catalog 2026</h3><p>Explore the complete 49-page catalog in one focused viewer. Browse sequentially or jump directly to any product and technical page.</p><div class="catalog-brochure-meta"><span>49 Pages</span><span>Products & Specifications</span><span>2026 Edition</span></div><button class="btn btn-primary" id="openCatalog">Open catalog ↗</button></div></article>`;$('openCatalog')?.addEventListener('click',()=>openCatalog(1))}
function updateCatalogPage(page){catalogPage=Math.max(1,Math.min(CATALOG_TOTAL,Number(page)||1));const img=$('catalogImage');if(!img)return;img.src=catalogSrc(catalogPage);img.alt=`PILARK Catalog 2026 page ${catalogPage}`;$('catalogPageLabel').textContent=`Page ${catalogPage} / ${CATALOG_TOTAL}`;$('catalogJump').value=String(catalogPage);$('catalogPrev').disabled=catalogPage===1;$('catalogNext').disabled=catalogPage===CATALOG_TOTAL;document.querySelectorAll('.catalog-page-choice').forEach(b=>b.classList.toggle('active',Number(b.dataset.page)===catalogPage))}
function openCatalog(page=1){const viewer=$('catalogViewer');if(!viewer)return;viewer.classList.add('open');viewer.setAttribute('aria-hidden','false');document.body.classList.add('lock');updateCatalogPage(page)}
function closeCatalog(){const viewer=$('catalogViewer');viewer?.classList.remove('open');viewer?.setAttribute('aria-hidden','true');document.body.classList.remove('lock')}
function renderCatalogPicker(){const picker=$('catalogThumbs');if(!picker||catalogPickerReady)return;picker.innerHTML=Array.from({length:CATALOG_TOTAL},(_,i)=>{const page=i+1;return `<button class="catalog-page-choice" data-page="${page}"><img loading="lazy" src="${catalogSrc(page)}" alt="Catalog page ${page}"><span>${page}</span></button>`}).join('');picker.addEventListener('click',e=>{const b=e.target.closest('.catalog-page-choice');if(!b)return;updateCatalogPage(Number(b.dataset.page));picker.hidden=true});catalogPickerReady=true}
function initCatalogViewer(){const jump=$('catalogJump');if(jump)jump.innerHTML=Array.from({length:CATALOG_TOTAL},(_,i)=>`<option value="${i+1}">Page ${i+1}</option>`).join('');$('catalogPrev')?.addEventListener('click',()=>updateCatalogPage(catalogPage-1));$('catalogNext')?.addEventListener('click',()=>updateCatalogPage(catalogPage+1));$('catalogClose')?.addEventListener('click',closeCatalog);$('catalogViewer')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeCatalog()});jump?.addEventListener('change',e=>updateCatalogPage(e.target.value));$('catalogThumbToggle')?.addEventListener('click',()=>{const picker=$('catalogThumbs');if(!picker)return;renderCatalogPicker();picker.hidden=!picker.hidden});let startX=0;$('catalogImage')?.addEventListener('touchstart',e=>{startX=e.changedTouches[0].screenX},{passive:true});$('catalogImage')?.addEventListener('touchend',e=>{const dx=e.changedTouches[0].screenX-startX;if(Math.abs(dx)>45)updateCatalogPage(catalogPage+(dx<0?1:-1))},{passive:true})}
function observeReveals(){if(!window.IntersectionObserver){document.querySelectorAll('.reveal').forEach(x=>x.classList.add('show'));return}const o=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('show');o.unobserve(e.target)}}),{threshold:.08});document.querySelectorAll('.reveal:not(.show)').forEach(el=>o.observe(el))}
document.addEventListener('DOMContentLoaded',async()=>{applyAdminOverrides();try{await applyCloudCms();}catch(err){console.warn('PILARK CMS unavailable:',err);}renderFilters();renderProducts();renderCatalog();initCatalogViewer();initClientModal();observeReveals();$('closeModal')?.addEventListener('click',closeModal);$('productModal')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal()});$('modalCatalog')?.addEventListener('click',e=>{e.preventDefault();const page=Number(e.currentTarget.dataset.page)||1;closeModal();openCatalog(page)});const menu=$('mobileMenu'),btn=$('menuBtn');btn?.addEventListener('click',()=>menu?.classList.toggle('open'));menu?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>menu.classList.remove('open')));document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeCatalog()}else if($('catalogViewer')?.classList.contains('open')&&e.key==='ArrowLeft'){updateCatalogPage(catalogPage-1)}else if($('catalogViewer')?.classList.contains('open')&&e.key==='ArrowRight'){updateCatalogPage(catalogPage+1)}})});

document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('a[href^="mailto:"]').forEach(a=>{a.href='mailto:support@pilarkomposit.com';a.textContent='support@pilarkomposit.com';});
});


document.addEventListener('DOMContentLoaded',()=>{
  const visionModal=$('visionMissionModal');
  const visionBtn=$('visionMissionBtn');
  const closeVision=$('closeVisionMission');
  const openVision=()=>{if(!visionModal)return;visionModal.classList.add('open');visionModal.setAttribute('aria-hidden','false');};
  const closeVisionModal=()=>{if(!visionModal)return;visionModal.classList.remove('open');visionModal.setAttribute('aria-hidden','true');};
  visionBtn?.addEventListener('click',openVision);
  closeVision?.addEventListener('click',closeVisionModal);
  visionModal?.addEventListener('click',e=>{if(e.target===visionModal)closeVisionModal();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&visionModal?.classList.contains('open'))closeVisionModal();});
});


document.addEventListener('DOMContentLoaded',()=>{
  const toggle=document.getElementById('solutionsMobileToggle');
  const submenu=document.getElementById('solutionsMobileMenu');
  if(toggle&&submenu){
    toggle.addEventListener('click',()=>{
      const open=!submenu.classList.contains('open');
      submenu.classList.toggle('open',open);
      toggle.setAttribute('aria-expanded',String(open));
    });
  }
});
