(function(){
  const STORAGE_KEY='pilarkLiveChatSessionV1';
  let client=null, session=null, timer=null, lastSignature='';

  function $(id){return document.getElementById(id)}
  function setOpen(panel,openButton,isOpen){
    if(!panel||!openButton)return;
    panel.hidden=!isOpen;
    openButton.hidden=isOpen;
  }
  function getSession(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{return null}}
  function saveSession(v){localStorage.setItem(STORAGE_KEY,JSON.stringify(v));session=v}
  function esc(v){return String(v||'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]))}
  function fmt(t){try{return new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date(t))}catch{return ''}}

  function render(){
    const body=$('chatMessages'); if(!body||!session||!client) return;
    client.rpc('chat_get_visitor_messages',{p_conversation_id:session.id,p_visitor_token:session.token}).then(({data,error})=>{
      if(error) return;
      const sig=JSON.stringify(data||[]);
      if(sig===lastSignature) return;
      lastSignature=sig;
      body.innerHTML=(data||[]).map(m=>'<div class="chat-msg '+(m.sender_type==='visitor'?'mine':'theirs')+'"><div>'+esc(m.message)+'</div><small>'+fmt(m.created_at)+'</small></div>').join('');
      body.scrollTop=body.scrollHeight;
    });
  }

  async function startConversation(name,email){
    if(!client) throw new Error('Chat service is not ready. Please refresh and try again.');
    const {data,error}=await client.rpc('chat_start_conversation',{p_name:name,p_email:email,p_page:location.href});
    if(error) throw error;
    const row=Array.isArray(data)?data[0]:data;
    saveSession({id:row.id,token:row.visitor_token,name,email});
    $('chatLead').hidden=true; $('chatComposer').hidden=false; $('chatWelcome').textContent='You are connected with PILARK. Leave your message and our team will reply.';
    render();
    if(timer) clearInterval(timer); timer=setInterval(render,4000);
  }

  document.addEventListener('DOMContentLoaded',()=>{
    client=window.PILARK_CMS?.client;
    if(!client) return;
    const panel=$('liveChatPanel'), open=$('liveChatOpen'), close=$('liveChatClose');
    setOpen(panel,open,false);
    open?.addEventListener('click',()=>{setOpen(panel,open,true);setTimeout(()=>{(session?$('chatMessage'):$('chatName'))?.focus()},50)});
    close?.addEventListener('click',()=>{setOpen(panel,open,false)});
    $('chatLead')?.addEventListener('submit',async e=>{
      e.preventDefault();
      const name=$('chatName').value.trim(), email=$('chatEmail').value.trim();
      if(!name){$('chatLeadStatus').textContent='Please enter your name.';return}
      $('chatLeadStatus').textContent='Starting chat…';
      const submit=e.currentTarget.querySelector('button[type="submit"]');
      if(submit) submit.disabled=true;
      try{await startConversation(name,email);$('chatLeadStatus').textContent=''}catch(err){console.error('PILARK Live Chat start error:',err);$('chatLeadStatus').textContent=err.message||'Unable to start chat.'}
      finally{if(submit) submit.disabled=false;}
    });
    $('chatComposer')?.addEventListener('submit',async e=>{
      e.preventDefault();
      const input=$('chatMessage'), message=input.value.trim(); if(!message||!session||!client)return;
      input.disabled=true;
      try{
        const {error}=await client.rpc('chat_send_visitor_message',{p_conversation_id:session.id,p_visitor_token:session.token,p_message:message});
        if(error)throw error;
        input.value=''; lastSignature=''; render();
      }catch(err){console.error('PILARK Live Chat send error:',err);alert(err.message||'Message could not be sent.')}
      finally{input.disabled=false;input.focus()}
    });

    session=getSession();
    if(session){
      $('chatLead').hidden=true; $('chatComposer').hidden=false;
      $('chatWelcome').textContent='Welcome back. Your conversation is still active.';
      render(); timer=setInterval(render,4000);
    }
  });
})();