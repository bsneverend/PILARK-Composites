import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-3-flash-preview";
function clean(value: unknown, max = 12000) { return String(value ?? "").slice(0, max); }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return new Response(JSON.stringify({ error: "Accounting AI belum dikonfigurasi. Tambahkan GEMINI_API_KEY pada Supabase Edge Function secret." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const body = await req.json();
    const question = clean(body?.question, 4000).trim();
    const context = clean(JSON.stringify(body?.context || {}), 30000);
    if (!question) return new Response(JSON.stringify({ error: "Question is required." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const system = `You are PILARK Accounting AI, an internal read-only assistant for the PILARK ERP.
Answer in the same language as the user, normally Indonesian.
Explain accounting concepts and how the PILARK accounting system works, and analyze the supplied live accounting context.
Be practical and specific. When discussing journal entries, explain Debit/Credit clearly.
Use supplied system data for current balances, documents, accounts, journals, or transactions.
Never invent numbers, documents, account codes, or system features. If context lacks the needed data, say so.
Never request or expose API keys or secrets.
You are read-only: never claim to have created, posted, edited, deleted, or reconciled accounting data.
If asked to perform a transaction, explain the steps the user should take in the CMS instead.
System context follows:
${context}`;
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(MODEL) + ":generateContent?key=" + encodeURIComponent(apiKey);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: question }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 1200 } }),
    });
    const data = await response.json();
    if (!response.ok) {
      const message = data?.error?.message || "Gemini API request failed.";
      return new Response(JSON.stringify({ error: message }), { status: response.status >= 500 ? 502 : response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const answer = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("").trim();
    if (!answer) return new Response(JSON.stringify({ error: "AI returned an empty response." }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ answer, model: MODEL }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected AI error." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});