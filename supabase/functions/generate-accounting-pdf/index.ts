import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const money=(v:number|null|undefined)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",minimumFractionDigits:0,maximumFractionDigits:0}).format(Number(v||0));
const dateText=(v:string|null|undefined)=>v?new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(v+"T00:00:00")):"—";
const clean=(v:any)=>String(v??"").replace(/[\r\n]+/g," ").trim();
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const auth=req.headers.get("Authorization"); if(!auth)throw new Error("Authentication required");
  const url=Deno.env.get("SUPABASE_URL")!,key=Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb=createClient(url,key,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:ue}=await sb.auth.getUser(); if(ue||!user)throw new Error("Authentication required");
  const body=await req.json().catch(()=>({})); const id=body?.document_id; if(!id)throw new Error("document_id is required");
  const {data:doc,error:de}=await sb.from("accounting_documents").select("id,document_no,document_type,document_date,due_date,payment_terms,payment_terms_days,reference,memo,status,subtotal,tax_amount,total_amount,amount_paid,accounting_partners(name,email,address,phone,tax_id)").eq("id",id).single();
  if(de||!doc) return new Response(JSON.stringify({error:de?.message||"Document not found"}),{status:404,headers:{...cors,"Content-Type":"application/json"}});
  const {data:lines,error:le}=await sb.from("accounting_document_lines").select("line_no,description,quantity,unit_price,discount_percent,tax_rate,line_subtotal,tax_amount,accounting_accounts(code,name)").eq("document_id",id).order("line_no");
  if(le)throw le;
  const pdf=await PDFDocument.create(),page=pdf.addPage([595.28,841.89]);
  const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const W=page.getWidth(),H=page.getHeight(),m=42,ink=rgb(.1,.14,.18),muted=rgb(.38,.44,.49),line=rgb(.84,.87,.89),accent=rgb(.04,.34,.43);
  page.drawText("PILARK",{x:m,y:H-55,size:25,font:bold,color:accent});page.drawText("COMPOSITES",{x:m,y:H-70,size:8,font:bold,color:muted});
  const title=doc.document_type?.includes("vendor")?"VENDOR BILL":"CUSTOMER INVOICE";
  page.drawText(title,{x:W-m-190,y:H-58,size:17,font:bold,color:ink});page.drawText(clean(doc.document_no),{x:W-m-190,y:H-76,size:10,font:regular,color:muted});
  let y=H-112;page.drawLine({start:{x:m,y},end:{x:W-m,y},thickness:1,color:line});y-=25;
  page.drawText(doc.document_type?.includes("vendor")?"VENDOR":"BILL TO",{x:m,y,size:8,font:bold,color:muted});page.drawText(clean(doc.accounting_partners?.name)||"—",{x:m,y:y-17,size:11,font:bold,color:ink});
  let py=y-32;if(doc.accounting_partners?.address){page.drawText(clean(doc.accounting_partners.address).slice(0,75),{x:m,y:py,size:8,font:regular,color:muted});py-=12;}if(doc.accounting_partners?.email)page.drawText(clean(doc.accounting_partners.email),{x:m,y:py,size:8,font:regular,color:muted});
  const rx=W-m-180;page.drawText("DOCUMENT DATE",{x:rx,y,size:8,font:bold,color:muted});page.drawText(dateText(doc.document_date),{x:rx,y:y-17,size:10,font:regular,color:ink});page.drawText("DUE DATE",{x:rx+92,y,size:8,font:bold,color:muted});page.drawText(dateText(doc.due_date),{x:rx+92,y:y-17,size:10,font:regular,color:ink});
  page.drawText("PAYMENT TERMS",{x:rx,y:y-39,size:8,font:bold,color:muted});page.drawText(clean(doc.payment_terms)||((doc.payment_terms_days||0)+" days"),{x:rx,y:y-56,size:9,font:regular,color:ink});if(doc.reference){page.drawText("REFERENCE",{x:rx+92,y:y-39,size:8,font:bold,color:muted});page.drawText(clean(doc.reference).slice(0,20),{x:rx+92,y:y-56,size:9,font:regular,color:ink);}
  y=Math.min(py,y-75)-25;const cols=[m,m+245,m+325,m+400,m+485,W-m];page.drawRectangle({x:m,y:y-18,width:W-2*m,height:22,color:rgb(.95,.97,.98)});["DESCRIPTION","QTY","UNIT PRICE","TAX","AMOUNT"].forEach((h,i)=>page.drawText(h,{x:cols[i],y:y-11,size:7,font:bold,color:muted}));y-=34;
  for(const l of(lines||[])){if(y<115){page.drawText("Continued…",{x:m,y:55,size:8,font:regular,color:muted});y=H-55;}page.drawText(clean(l.description).slice(0,46)||"Item",{x:cols[0],y,size:8.5,font:regular,color:ink});page.drawText(String(Number(l.quantity||0)),{x:cols[1],y,size:8,font:regular,color:ink});page.drawText(money(l.unit_price),{x:cols[2],y,size:8,font:regular,color:ink});page.drawText(String(Number(l.tax_rate||0))+"%",{x:cols[3],y,size:8,font:regular,color:ink});page.drawText(money(Number(l.line_subtotal||0)+Number(l.tax_amount||0)),{x:cols[4],y,size:8,font:regular,color:ink});y-=22;page.drawLine({start:{x:m,y:y+10},end:{x:W-m,y:y+10},thickness:.5,color:line});}
  const bx=W-m-205,ty=Math.max(y-8,165);page.drawText("Subtotal",{x:bx,y:ty,size:9,font:regular,color:muted});page.drawText(money(doc.subtotal),{x:W-m-5,y:ty,size:9,font:regular,color:ink});page.drawText("Tax",{x:bx,y:ty-18,size:9,font:regular,color:muted});page.drawText(money(doc.tax_amount),{x:W-m-5,y:ty-18,size:9,font:regular,color:ink});page.drawLine({start:{x:bx,y:ty-29},end:{x:W-m,y:ty-29},thickness:1,color:ink});page.drawText("TOTAL",{x:bx,y:ty-47,size:11,font:bold,color:ink});page.drawText(money(doc.total_amount),{x:W-m-5,y:ty-47,size:11,font:bold,color:ink});page.drawText("Paid",{x:bx,y:ty-67,size:9,font:regular,color:muted});page.drawText(money(doc.amount_paid),{x:W-m-5,y:ty-67,size:9,font:regular,color:ink});page.drawText("Outstanding",{x:bx,y:ty-85,size:9,font:regular,color:muted});page.drawText(money(Number(doc.total_amount||0)-Number(doc.amount_paid||0)),{x:W-m-5,y:ty-85,size:9,font:bold,color:ink});
  if(doc.memo){page.drawText("Notes",{x:m,y:125,size:8,font:bold,color:muted});page.drawText(clean(doc.memo).slice(0,110),{x:m,y:110,size:8,font:regular,color:ink});}
  page.drawLine({start:{x:m,y:52},end:{x:W-m,y:52},thickness:.7,color:line});page.drawText("PILARK Composites · PT Panca Integra Laguna Reksa",{x:m,y:36,size:7.5,font:regular,color:muted});page.drawText("Generated from PILARK ERP",{x:W-m-130,y:36,size:7.5,font:regular,color:muted});
  const bytes=await pdf.save(),filename=clean(doc.document_no).replace(/[^a-z0-9_-]/gi,"_")+".pdf";
  return new Response(bytes,{status:200,headers:{...cors,"Content-Type":"application/pdf","Content-Disposition":'inline; filename="'+filename+'"'}});
 }catch(err){console.error(err);return new Response(JSON.stringify({error:err?.message||"PDF generation failed"}),{status:500,headers:{...cors,"Content-Type":"application/json"}});}
});