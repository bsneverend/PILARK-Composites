import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const clean=(v:any)=>String(v??"").replace(/[\r\n]+/g," ").trim();
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const auth=req.headers.get("Authorization"); if(!auth)throw new Error("Authentication required");
  const body=await req.json().catch(()=>({})); const id=body?.document_id; if(!id)throw new Error("document_id is required");
  const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:ue}=await supabase.auth.getUser(); if(ue||!user)throw new Error("Authentication required");
  const {data:doc,error:de}=await supabase.from("accounting_documents").select("id,document_no,document_type,total_amount,amount_paid,due_date,status,accounting_partners(name,email)").eq("id",id).single();
  if(de||!doc)throw new Error(de?.message||"Document not found");
  const to=clean(doc.accounting_partners?.email); if(!to)throw new Error("Partner does not have an email address.");
  if(doc.status==="draft"||doc.status==="cancelled")throw new Error("Only posted or paid documents can be sent.");
  const resendKey=Deno.env.get("RESEND_API_KEY"); const from=Deno.env.get("PILARK_EMAIL_FROM");
  if(!resendKey||!from)throw new Error("Email provider is not configured. Set RESEND_API_KEY and PILARK_EMAIL_FROM in Supabase Edge Function secrets.");
  const pdfRes=await fetch(Deno.env.get("SUPABASE_URL")!+"/functions/v1/generate-accounting-pdf",{method:"POST",headers:{"Authorization":auth,"Content-Type":"application/json"},body:JSON.stringify({document_id:id})});
  if(!pdfRes.ok)throw new Error("PDF generation failed before email delivery.");
  const pdf=await pdfRes.arrayBuffer();
  const filename=clean(doc.document_no).replace(/[^a-z0-9_-]/gi,"_")+".pdf";
  const label=doc.document_type?.includes("vendor")?"Vendor Bill":"Customer Invoice";
  const subject=label+" "+doc.document_no;
  const total=new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",minimumFractionDigits:0}).format(Number(doc.total_amount||0));
  const due=doc.due_date?new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(doc.due_date+"T00:00:00")):"—";
  const html="<div style='font-family:Arial,sans-serif;color:#17212b;line-height:1.6'><h2 style='margin-bottom:4px'>PILARK</h2><p>Please find attached your <b>"+label+"</b> <b>"+clean(doc.document_no)+"</b>.</p><p><b>Total:</b> "+total+"<br><b>Due date:</b> "+due+"</p><p>Thank you,<br>PILARK Composites</p></div>";
  const encoded=Uint8Array.from(atob(btoa(String.fromCharCode(...new Uint8Array(pdf)))),c=>c.charCodeAt(0));
  const payload={from,to:[to],subject,html,attachments:[{filename,content:btoa(String.fromCharCode(...new Uint8Array(pdf)))}]};
  const er=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+resendKey,"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const ed=await er.json().catch(()=>({}));
  if(!er.ok){await supabase.from("accounting_document_sends").insert({document_id:id,recipient_email:to,subject,provider:"resend",status:"failed",error_message:clean(ed?.message||"Email provider rejected request"),sent_by:user.id});throw new Error(ed?.message||"Email delivery failed.");}
  await supabase.from("accounting_document_sends").insert({document_id:id,recipient_email:to,subject,provider:"resend",provider_message_id:ed?.id||null,status:"sent",sent_by:user.id});
  return new Response(JSON.stringify({ok:true,message_id:ed?.id||null,recipient:to}),{status:200,headers:{...cors,"Content-Type":"application/json"}});
 }catch(err){return new Response(JSON.stringify({error:err?.message||"Email delivery failed"}),{status:400,headers:{...cors,"Content-Type":"application/json"}});}
});