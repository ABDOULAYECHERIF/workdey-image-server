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

app.use((req, res, next) => {
  if (req.path === '/health') return next();
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

app.listen(PORT, () => console.log(`WorkDey Flyer Server (Ideogram) on :${PORT}`));
