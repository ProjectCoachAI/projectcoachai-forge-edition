'use strict';
const express  = require('express');
const https    = require('https');
const router   = express.Router();
const db       = require('../lib/db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { encrypt, decrypt } = require('../lib/encrypt');

const PROVIDERS = ['claude','chatgpt','gemini','mistral','deepseek','perplexity','grok'];

router.get('/', optionalAuth, async (req, res) => {
  if (!req.user) return res.json({ success:true, connections:{} });
  const rows = await db.query('SELECT provider, connected_at FROM provider_keys WHERE user_email=$1', [req.userEmail]);
  const status = {};
  for (const p of PROVIDERS) {
    const row = rows.rows.find(r => r.provider === p);
    status[p] = { connected: Boolean(row), connectedAt: row?.connected_at||null };
  }
  res.json({ success:true, connections:status });
});

router.post('/:provider', requireAuth, async (req, res) => {
  const provider = String(req.params.provider||'').toLowerCase();
  if (!PROVIDERS.includes(provider)) return res.status(400).json({ success:false, error:`Unknown provider: ${provider}` });
  const apiKey = String(req.body?.apiKey||'').trim();
  if (!apiKey || apiKey.length < 10) return res.status(400).json({ success:false, error:'Valid apiKey is required' });

  const encKey = encrypt(apiKey);
  await db.query(`INSERT INTO provider_keys(user_email,provider,encrypted_key,connected_at) VALUES($1,$2,$3,NOW())
    ON CONFLICT(user_email,provider) DO UPDATE SET encrypted_key=$3, connected_at=NOW()`, [req.userEmail, provider, encKey]);
  console.log(`🔗 [Connections] ${req.userEmail} connected ${provider}`);
  res.json({ success:true, provider, connected:true, connectedAt:new Date().toISOString() });
});

router.delete('/:provider', requireAuth, async (req, res) => {
  const provider = String(req.params.provider||'').toLowerCase();
  if (!PROVIDERS.includes(provider)) return res.status(400).json({ success:false, error:`Unknown provider: ${provider}` });
  await db.query('DELETE FROM provider_keys WHERE user_email=$1 AND provider=$2', [req.userEmail, provider]);
  console.log(`🔌 [Connections] ${req.userEmail} disconnected ${provider}`);
  res.json({ success:true, provider, connected:false });
});

router.get('/test/:provider', requireAuth, async (req, res) => {
  const provider = String(req.params.provider||'').toLowerCase();
  if (!PROVIDERS.includes(provider)) return res.status(400).json({ success:false, error:`Unknown provider: ${provider}` });
  const r = await db.query('SELECT encrypted_key FROM provider_keys WHERE user_email=$1 AND provider=$2', [req.userEmail, provider]);
  if (!r.rows[0]) return res.json({ success:false, connected:false, error:'No key stored' });
  const apiKey = decrypt(r.rows[0].encrypted_key);
  if (!apiKey) return res.json({ success:false, connected:false, error:'Could not decrypt key' });
  try {
    const valid = await testProviderKey(provider, apiKey);
    res.json({ success:true, connected:valid.ok, provider, message:valid.message });
  } catch(err) {
    res.json({ success:false, connected:false, provider, error:err.message });
  }
});

async function getUserProviderKey(userEmail, provider) {
  try {
    const r = await db.query('SELECT encrypted_key FROM provider_keys WHERE user_email=$1 AND provider=$2', [userEmail, provider]);
    return r.rows[0] ? decrypt(r.rows[0].encrypted_key) : null;
  } catch(_) { return null; }
}

function testProviderKey(provider, apiKey) {
  const tests = {
    chatgpt:()=>testOpenAI(apiKey), claude:()=>testClaude(apiKey), gemini:()=>testGemini(apiKey),
    mistral:()=>testMistral(apiKey), deepseek:()=>testDeepSeek(apiKey),
    perplexity:()=>testPerplexity(apiKey), grok:()=>testGrok(apiKey),
  };
  return (tests[provider]||(() => Promise.resolve({ok:false,message:'No test available'})))();
}

function minimalPost(options, body) {
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data=''; res.on('data',c=>data+=c);
      res.on('end',()=>{ try{resolve({status:res.statusCode,data:JSON.parse(data)})}catch(_){resolve({status:res.statusCode,data:{}})} });
    });
    req.on('error',(e)=>resolve({status:0,error:e.message}));
    req.setTimeout(8000,()=>{req.destroy();resolve({status:0,error:'timeout'})});
    req.write(body); req.end();
  });
}
async function testOpenAI(k){const b=JSON.stringify({model:'gpt-4o-mini',max_tokens:1,messages:[{role:'user',content:'hi'}]});const r=await minimalPost({hostname:'api.openai.com',port:443,path:'/v1/chat/completions',method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${k}`,'Content-Length':Buffer.byteLength(b)}},b);return r.status===200?{ok:true,message:'Valid'}:r.status===401?{ok:false,message:'Invalid key'}:{ok:false,message:`Error ${r.status}`};}
async function testClaude(k){const b=JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:1,messages:[{role:'user',content:'hi'}]});const r=await minimalPost({hostname:'api.anthropic.com',port:443,path:'/v1/messages',method:'POST',headers:{'Content-Type':'application/json','x-api-key':k,'anthropic-version':'2023-06-01','Content-Length':Buffer.byteLength(b)}},b);return r.status===200?{ok:true,message:'Valid'}:r.status===401?{ok:false,message:'Invalid key'}:{ok:false,message:`Error ${r.status}`};}
async function testGemini(k){const b=JSON.stringify({contents:[{parts:[{text:'hi'}]}],generationConfig:{maxOutputTokens:1}});const r=await minimalPost({hostname:'generativelanguage.googleapis.com',port:443,path:`/v1beta/models/gemini-2.0-flash:generateContent?key=${k}`,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}},b);return r.status===200?{ok:true,message:'Valid'}:{ok:false,message:`Error ${r.status}`};}
async function testMistral(k){const b=JSON.stringify({model:'mistral-small-latest',max_tokens:1,messages:[{role:'user',content:'hi'}]});const r=await minimalPost({hostname:'api.mistral.ai',port:443,path:'/v1/chat/completions',method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${k}`,'Content-Length':Buffer.byteLength(b)}},b);return r.status===200?{ok:true,message:'Valid'}:{ok:false,message:`Error ${r.status}`};}
async function testDeepSeek(k){const b=JSON.stringify({model:'deepseek-chat',max_tokens:1,messages:[{role:'user',content:'hi'}]});const r=await minimalPost({hostname:'api.deepseek.com',port:443,path:'/v1/chat/completions',method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${k}`,'Content-Length':Buffer.byteLength(b)}},b);return r.status===200?{ok:true,message:'Valid'}:{ok:false,message:`Error ${r.status}`};}
async function testPerplexity(k){const b=JSON.stringify({model:'llama-3.1-sonar-small-128k-online',max_tokens:1,messages:[{role:'user',content:'hi'}]});const r=await minimalPost({hostname:'api.perplexity.ai',port:443,path:'/chat/completions',method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${k}`,'Content-Length':Buffer.byteLength(b)}},b);return r.status===200?{ok:true,message:'Valid'}:{ok:false,message:`Error ${r.status}`};}
async function testGrok(k){const b=JSON.stringify({model:'grok-beta',max_tokens:1,messages:[{role:'user',content:'hi'}]});const r=await minimalPost({hostname:'api.x.ai',port:443,path:'/v1/chat/completions',method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${k}`,'Content-Length':Buffer.byteLength(b)}},b);return r.status===200?{ok:true,message:'Valid'}:{ok:false,message:`Error ${r.status}`};}

module.exports = router;
module.exports.getUserProviderKey = getUserProviderKey;
module.exports.PROVIDERS = PROVIDERS;
