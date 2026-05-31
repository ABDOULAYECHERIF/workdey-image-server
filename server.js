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

// CRITICAL: AI text models only render SHORT text cleanly (2-5 words max).
// So each flyer has ONE short headline + "WorkDey" logo. Everything else is VISUAL.

const STYLE = `Professional social media flyer, portrait. Deep palm green and vibrant orange color scheme. 
Bold modern minimal design, lots of clean space, premium African tech brand aesthetic. 
The ONLY text in the image is the headline and a small "WorkDey" wordmark at the bottom. 
No paragraphs, no body text, no small text, no fake text. Clean, readable, award-winning poster design.`;

function pick(arr, seed) { return arr[seed % arr.length]; }

function buildFlyerPrompt(postType, d, seed) {
  const scenes = [
    "a confident young African professional in a sharp suit smiling, modern office",
    "a vibrant Lagos city skyline at golden hour, glass towers",
    "diverse African professionals collaborating around a laptop, bright workspace",
    "a clean geometric abstract composition with bold green and orange shapes",
    "a successful African businesswoman in elegant attire, contemporary setting",
    "an aerial view of a modern African business district at sunset",
    "a dynamic split-color background with subtle motion graphics",
  ];
  const scene = pick(scenes, seed);

  // Each flyer: ONE punchy headline only (2-5 words). Everything else is visual.
  const headlines = {
    job_spotlight:     `the large bold headline text "NEW JOBS THIS WEEK"`,
    market_insight:    `the large bold headline text "JOB MARKET REPORT"`,
    company_spotlight: `the large bold headline text "NOW HIRING"`,
    platform_stats:    `the large bold headline text "${d.weekApps || 380} HIRED THIS WEEK"`,
    industry_report:   `the large bold headline text "AFRICA IS HIRING"`,
    employer_tip:      `the large bold headline text "HIRE SMARTER"`,
    weekly_roundup:    `the large bold headline text "THIS WEEK ON WORKDEY"`,
    seeker_tip:        `the large bold headline text "CAREER TIP"`,
    success_story:     `the large bold headline text "HIRED!"`,
    career_advice:     `the large bold headline text "GROW YOUR CAREER"`,
    employer_pitch:    `the large bold headline text "POST JOBS FREE"`,
    gig_economy:       `the large bold headline text "EARN DAILY"`,
    youth_employment:  `the large bold headline text "AFRICA'S FUTURE"`,
    salary_insight:    `the large bold headline text "KNOW YOUR WORTH"`,
  };
  const headline = headlines[postType] || headlines.platform_stats;

  return `A professional recruitment flyer featuring ${scene}, with ${headline} prominently displayed in clean bold sans-serif letters at the top, and a small "WorkDey" logo wordmark at the bottom. ${STYLE}`;
}


// ═══════════════════════════════════════════════════════════════════
// GENERATE FLYER VIA IDEOGRAM (best text rendering)
// ═══════════════════════════════════════════════════════════════════
async function generateFlyer(postType, d, seed) {
  const prompt = buildFlyerPrompt(postType, d, seed);

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
  const { post_type = 'platform_stats', data = {} } = req.body;
  // Seed for visual variety — changes by hour
  const seed = Math.floor(Date.now() / 3600000);

  try {
    const { bytes } = await generateFlyer(post_type, data, seed);
    res.set('Content-Type', 'image/png');
    res.send(bytes);
  } catch (e) {
    console.error('Generate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Preview endpoint — returns the image URL instead of bytes (for testing)
app.post('/preview', async (req, res) => {
  const { post_type = 'platform_stats', data = {} } = req.body;
  const seed = Math.floor(Date.now() / 3600000);
  try {
    const { url } = await generateFlyer(post_type, data, seed);
    res.json({ url, post_type });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`WorkDey Flyer Server (Ideogram) on :${PORT}`));
