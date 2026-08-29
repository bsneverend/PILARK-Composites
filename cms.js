(function(){
  const cfg=window.PILARK_SUPABASE_CONFIG||{};
  const ready=Boolean(cfg.url&&cfg.anonKey&&window.supabase?.createClient);
  const client=ready?window.supabase.createClient(cfg.url,cfg.anonKey,{auth:{persistSession:true,autoRefreshToken:true}}):null;

  async function load(){
    if(!client) return null;
    const [media,products,content]=await Promise.all([
      client.from('site_media').select('key,src'),
      client.from('site_products').select('id,image_url'),
      client.from('site_content').select('section,data')
    ]);
    if(media.error) throw media.error;
    if(products.error) throw products.error;
    if(content.error) throw content.error;
    return {
      media:Object.fromEntries((media.data||[]).map(x=>[x.key,x.src])),
      products:Object.fromEntries((products.data||[]).map(x=>[x.id,{img:x.image_url}])),
      content:Object.fromEntries((content.data||[]).map(x=>[x.section,x.data]))
    };
  }

  window.PILARK_CMS={ready,client,load};
})();
