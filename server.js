// ═══════════════════════════════════════════════════════════════════
// WorkDey Flyer Generator — Pure AI flyers via Ideogram (text + design)
// Portrait 3:4 (1080x1350 style) — optimized for LinkedIn feed
// Deploy on Railway — node server.js
// ═══════════════════════════════════════════════════════════════════

const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const FAL_KEY = process.env.FAL_API_KEY || '';
const AUTH_SECRET = process.env.AUTH_SECRET || 'workdey-image-2026';
const SB_URL = process.env.SB_URL || 'https://ybaehslipgaqsnoffsvd.supabase.co';
const SB_ANON = process.env.SB_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InliYWVoc2xpcGdhcXNub2Zmc3ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNjYyNTUsImV4cCI6MjA4OTg0MjI1NX0.Rrb8hZoND0wvK4t2s8Ywfpt2Kr3bY-xAKl_RUCsF9WY';
const SITE = 'https://workdey.work';

// Tiny in-memory cache (5 min) so we don't hit Supabase on every crawler request
const cache = new Map();
function cacheGet(k){const v=cache.get(k);if(v&&Date.now()<v.exp)return v.val;return null;}
function cacheSet(k,val,ttlMs=300000){cache.set(k,{val,exp:Date.now()+ttlMs});}

async function sb(path){
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` }
  });
  if(!res.ok) throw new Error('supabase '+res.status);
  return res.json();
}

// Public routes (no auth): health check + blog (crawlers need open access)
const PUBLIC_PREFIXES = ['/health', '/blog', '/sitemap.xml', '/robots.txt'];
app.use((req, res, next) => {
  if (PUBLIC_PREFIXES.some(p => req.path === p || req.path.startsWith(p + '/'))) return next();
  const auth = req.headers['x-auth-secret'] || req.query.secret;
  if (auth !== AUTH_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

app.get('/health', (req, res) => res.json({ ok: true, version: 'ideogram-flyer-v2' }));

// ═══════════════════════════════════════════════════════════════════
// FLYER PROMPTS — full design described per post type
// Ideogram renders the complete flyer with readable text
// WorkDey brand: palm green (#0a8508) + orange (#f7a814)
// ═══════════════════════════════════════════════════════════════════

// Flyer text now comes from the AI (passed in via `flyer`), never hardcoded.

const STYLE = `Premium professional social media flyer, portrait orientation. 
Deep palm green (#0a8508) and vibrant orange (#f7a814) brand colors. 
Bold modern editorial design with strong visual hierarchy, generous spacing, premium African tech brand aesthetic like a Forbes Africa or top startup campaign. 
Only render the few specified short text elements — no paragraphs, no fake body text, no gibberish text. 
Every letter sharp and readable. Award-winning graphic design quality.`;

function pick(arr, seed) { return arr[seed % arr.length]; }

function buildFlyerPrompt(postType, d, seed, flyer) {
  const scenes = [
    "a confident young African professional in a sharp suit smiling in a modern glass office",
    "a stunning Lagos city skyline at golden hour with gleaming towers",
    "diverse African professionals collaborating energetically in a bright modern workspace",
    "a bold geometric abstract composition of green and orange shapes with depth",
    "a successful African businesswoman in elegant professional attire, confident pose",
    "a cinematic aerial view of a thriving African business district at sunset",
    "an African tech worker at a sleek desk with city views behind them",
    "a group of happy African graduates celebrating, optimistic and bright",
    "a professional African man reviewing documents at a clean modern desk",
  ];
  const scene = pick(scenes, seed);

  // Use AI-generated flyer text, with safe fallbacks
  const headline = (flyer && flyer.headline) || "WORKDEY";
  const stat = (flyer && flyer.stat) || "";
  const tagline = (flyer && flyer.tagline) || "workdey.work";

  const statPart = stat ? `a huge bold number "${stat}" as the visual focal point, ` : "";

  return `A premium recruitment campaign flyer featuring ${scene}. 
Design includes: the bold headline "${headline}" at the top, ${statPart}the short tagline "${tagline}", and a clean "WorkDey" logo wordmark at the bottom in green and orange. 
${STYLE}`;
}



// ═══════════════════════════════════════════════════════════════════
// GENERATE FLYER VIA IDEOGRAM (best text rendering)
// ═══════════════════════════════════════════════════════════════════
async function generateFlyer(postType, d, seed, flyer) {
  const prompt = buildFlyerPrompt(postType, d, seed, flyer);

  const res = await fetch('https://fal.run/fal-ai/ideogram/v2', {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      aspect_ratio: '3:4',          // portrait
      expand_prompt: true,           // Ideogram enhances the prompt
      style: 'design',               // design style = best for flyers/posters
      num_images: 1,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ideogram error ${res.status}: ${err}`);
  }

  const data = await res.json();
  if (!data.images || !data.images[0] || !data.images[0].url) {
    throw new Error('No image from Ideogram: ' + JSON.stringify(data).slice(0, 200));
  }

  // Download the flyer
  const imgRes = await fetch(data.images[0].url);
  if (!imgRes.ok) throw new Error('Failed to download flyer');
  const buf = await imgRes.buffer();
  return { bytes: buf, url: data.images[0].url };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ENDPOINT
// ═══════════════════════════════════════════════════════════════════
app.post('/generate', async (req, res) => {
  const { post_type = 'platform_stats', data = {}, flyer = null } = req.body;
  const seed = Math.floor(Math.random() * 100000);

  try {
    const { bytes } = await generateFlyer(post_type, data, seed, flyer);
    res.set('Content-Type', 'image/png');
    res.send(bytes);
  } catch (e) {
    console.error('Generate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Preview endpoint — returns the image URL instead of bytes (for testing)
app.post('/preview', async (req, res) => {
  const { post_type = 'platform_stats', data = {}, flyer = null } = req.body;
  const seed = Math.floor(Math.random() * 100000);
  try {
    const { url } = await generateFlyer(post_type, data, seed, flyer);
    res.json({ url, post_type });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ═══════════════════════════════════════════════════════════════════
// SERVER-SIDE BLOG — static HTML for WhatsApp/Google previews
// ═══════════════════════════════════════════════════════════════════

function esc(x){return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function stripHtml(h){return String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();}

const COVER_BG=['#0a8508','#2557a7','#f7a814','#7c3aed','#cc8000','#0a3d2e'];
function fmtDate(iso){if(!iso)return'';return new Date(iso).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});}

function pageShell({title, desc, canonical, ogImage, bodyHtml, jsonLd}){
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="WorkDey">
${ogImage?`<meta property="og:image" content="${esc(ogImage)}">`:''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
${ogImage?`<meta name="twitter:image" content="${esc(ogImage)}">`:''}
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
${jsonLd?`<script type="application/ld+json">${jsonLd}</script>`:''}
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',Arial,sans-serif;color:#2d2d2d;background:#fafafa;line-height:1.7}
a{color:#0a8508;text-decoration:none}a:hover{text-decoration:underline}
.nav{background:#fff;border-bottom:1px solid #e4e2e0;position:sticky;top:0;z-index:10}
.nav-in{max-width:1140px;margin:0 auto;padding:16px 20px;display:flex;align-items:center;gap:20px}
.logo{font-size:24px;font-weight:800}.logo .g{color:#0a8508}.logo .o{color:#f7a814}
.nav a{margin-left:auto;background:#0a8508;color:#fff;padding:9px 20px;border-radius:22px;font-weight:700;font-size:14px}
.hero{background:linear-gradient(135deg,#0a3d2e,#0a8508);color:#fff;padding:48px 20px;text-align:center}
.hero h1{font-size:38px;font-weight:800;margin-bottom:10px}
.hero p{font-size:17px;opacity:.92;max-width:600px;margin:0 auto}
.wrap{max-width:1140px;margin:0 auto;padding:40px 20px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.card{background:#fff;border:1px solid #e4e2e0;border-radius:8px;overflow:hidden;transition:.18s}
.card:hover{transform:translateY(-4px);box-shadow:0 8px 24px rgba(0,0,0,.12)}
.card a{color:inherit;text-decoration:none}
.cover{height:150px;display:flex;align-items:center;justify-content:center;font-size:60px;position:relative}
.tag{position:absolute;top:12px;left:12px;background:rgba(0,0,0,.6);color:#fff;font-size:11px;font-weight:600;padding:4px 12px;border-radius:12px}
.cb{padding:18px}.cd{font-size:12px;color:#767676;margin-bottom:6px}
.ct{font-size:17px;font-weight:700;line-height:1.35;margin-bottom:8px}
.ce{font-size:14px;color:#595959;line-height:1.55}
.art{max-width:760px;margin:0 auto;padding:40px 20px 64px}
.art .back{font-size:14px;font-weight:600;color:#0a8508;display:inline-block;margin-bottom:24px}
.artcover{height:200px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:88px;margin-bottom:24px}
.artcat{display:inline-block;background:#0a8508;color:#fff;font-size:12px;font-weight:600;padding:5px 14px;border-radius:14px;margin-bottom:14px}
.art h1{font-size:34px;font-weight:800;line-height:1.15;margin-bottom:14px}
.artmeta{font-size:14px;color:#767676;margin-bottom:30px;padding-bottom:22px;border-bottom:1px solid #e4e2e0}
.content{font-size:17px;line-height:1.8;color:#333}
.content h2{font-size:25px;font-weight:700;margin:34px 0 14px}
.content h3{font-size:20px;font-weight:700;margin:26px 0 12px}
.content p{margin-bottom:18px}.content ul,.content ol{margin:0 0 18px 24px}
.content li{margin-bottom:8px}.content strong{font-weight:700}
.content a{color:#0a8508;font-weight:600;text-decoration:underline}
.cta{background:linear-gradient(135deg,#0a3d2e,#0a8508);color:#fff;border-radius:8px;padding:32px;text-align:center;margin-top:40px}
.cta h3{font-size:22px;margin-bottom:8px}.cta p{opacity:.9;margin-bottom:18px}
.cta a{display:inline-block;background:#fff;color:#0a8508;padding:12px 30px;border-radius:24px;font-weight:700}
.foot{background:#fff;border-top:1px solid #e4e2e0;padding:32px 20px;text-align:center;color:#767676;font-size:13px;margin-top:40px}
@media(max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:640px){.grid{grid-template-columns:1fr}.hero h1{font-size:28px}.art h1{font-size:26px}}
</style></head><body>
<nav class="nav"><div class="nav-in">
<a href="${SITE}/blog" style="margin:0"><span class="logo"><span class="g">Work</span><span class="o">Dey</span></span></a>
<a href="${SITE}">Find Jobs</a></div></nav>
${bodyHtml}
<div class="foot">© 2026 WorkDey · Optima CoreTech · Connecting talent with opportunity across Africa</div>
</body></html>`;
}

// Blog index
app.get('/blog', async (req, res) => {
  try {
    let articles = cacheGet('index');
    if(!articles){
      articles = await sb('blog_articles?select=slug,title,meta_desc,category,cover_emoji,created_at&published=eq.true&order=created_at.desc&limit=60');
      cacheSet('index', articles);
    }
    const cards = articles.map((a,i)=>`
      <div class="card"><a href="${SITE}/blog/${esc(a.slug)}">
        <div class="cover" style="background:${COVER_BG[i%COVER_BG.length]}22">
          <span class="tag">${esc(a.category||'Article')}</span><span>${a.cover_emoji||'📄'}</span>
        </div>
        <div class="cb"><div class="cd">${fmtDate(a.created_at)}</div>
        <div class="ct">${esc(a.title)}</div>
        <div class="ce">${esc(a.meta_desc||'')}</div></div>
      </a></div>`).join('');
    const body = `<div class="hero"><h1>Career Advice & Job Tips</h1>
      <p>Expert guides, salary insights, and job search strategies for Cameroon, Nigeria, and across Africa.</p></div>
      <div class="wrap">${articles.length?`<div class="grid">${cards}</div>`:'<p style="text-align:center;color:#767676">Fresh articles coming soon.</p>'}</div>`;
    res.set('Content-Type','text/html; charset=utf-8');
    res.set('Cache-Control','public, max-age=300');
    res.send(pageShell({
      title:'WorkDey Blog — Career Advice & Job Tips for Africa',
      desc:'Expert career advice, salary guides, and job search tips for Cameroon, Nigeria and across Africa.',
      canonical:`${SITE}/blog`, ogImage:'', bodyHtml:body, jsonLd:''
    }));
  } catch(e){ res.status(500).send('Error loading blog'); }
});

// Individual article
app.get('/blog/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    let rows = cacheGet('a:'+slug);
    if(!rows){
      rows = await sb(`blog_articles?select=*&slug=eq.${encodeURIComponent(slug)}&published=eq.true&limit=1`);
      if(rows && rows.length) cacheSet('a:'+slug, rows);
    }
    if(!rows || !rows.length){ res.status(404).send(pageShell({title:'Article not found — WorkDey',desc:'',canonical:`${SITE}/blog`,ogImage:'',bodyHtml:'<div class="wrap"><h1>Article not found</h1><p><a href="'+SITE+'/blog">Back to blog</a></p></div>',jsonLd:''})); return; }
    const a = rows[0];
    const plain = stripHtml(a.body_html).slice(0,160);
    const desc = a.meta_desc || plain;

    // Related
    let related = cacheGet('rel:'+a.category);
    if(!related){
      related = await sb(`blog_articles?select=slug,title,cover_emoji&category=eq.${encodeURIComponent(a.category||'')}&published=eq.true&order=created_at.desc&limit=4`);
      cacheSet('rel:'+a.category, related);
    }
    const relCards = (related||[]).filter(r=>r.slug!==slug).slice(0,3).map((r,i)=>`
      <div class="card"><a href="${SITE}/blog/${esc(r.slug)}">
      <div class="cover" style="background:${COVER_BG[i%COVER_BG.length]}22"><span>${r.cover_emoji||'📄'}</span></div>
      <div class="cb"><div class="ct" style="font-size:15px">${esc(r.title)}</div></div></a></div>`).join('');

    const jsonLd = JSON.stringify({
      "@context":"https://schema.org","@type":"BlogPosting",
      "headline":a.title,"description":desc,
      "datePublished":a.created_at,"author":{"@type":"Organization","name":"WorkDey"},
      "publisher":{"@type":"Organization","name":"WorkDey"},
      "mainEntityOfPage":`${SITE}/blog/${a.slug}`
    });

    const body = `<div class="art">
      <a class="back" href="${SITE}/blog">← Back to all articles</a>
      <div class="artcover" style="background:${COVER_BG[0]}22">${a.cover_emoji||'📄'}</div>
      <span class="artcat">${esc(a.category||'Article')}</span>
      <h1>${esc(a.title)}</h1>
      <div class="artmeta">WorkDey · ${fmtDate(a.created_at)}</div>
      <div class="content">${a.body_html||''}</div>
      <div class="cta"><h3>Ready to find your next job?</h3>
        <p>Browse thousands of verified jobs across Cameroon and Nigeria.</p>
        <a href="${SITE}">Find Jobs on WorkDey →</a></div>
      ${relCards?`<div style="margin-top:48px"><h3 style="font-size:20px;font-weight:700;margin-bottom:16px">Related articles</h3><div class="grid">${relCards}</div></div>`:''}
    </div>`;

    res.set('Content-Type','text/html; charset=utf-8');
    res.set('Cache-Control','public, max-age=300');
    res.send(pageShell({
      title:`${a.title} — WorkDey Blog`, desc, canonical:`${SITE}/blog/${a.slug}`,
      ogImage:'', bodyHtml:body, jsonLd
    }));
  } catch(e){ res.status(500).send('Error loading article'); }
});

// Sitemap for Google
app.get('/sitemap.xml', async (req, res) => {
  try {
    const articles = await sb('blog_articles?select=slug,created_at&published=eq.true&order=created_at.desc&limit=1000');
    const urls = articles.map(a=>`<url><loc>${SITE}/blog/${a.slug}</loc><lastmod>${(a.created_at||'').slice(0,10)}</lastmod></url>`).join('');
    res.set('Content-Type','application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}/blog</loc></url>${urls}</urlset>`);
  } catch(e){ res.status(500).send(''); }
});

app.get('/robots.txt', (req,res)=>{
  res.set('Content-Type','text/plain');
  res.send(`User-agent: *\nAllow: /blog\nSitemap: ${SITE}/sitemap.xml`);
});


app.listen(PORT, () => console.log(`WorkDey Flyer Server (Ideogram) on :${PORT}`));
