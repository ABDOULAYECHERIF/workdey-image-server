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

// AI text models render 2-3 SHORT text elements cleanly. Use headline + one stat + tagline.

const STYLE = `Premium professional social media flyer, portrait orientation. 
Deep palm green (#0a8508) and vibrant orange (#f7a814) brand colors. 
Bold modern editorial design with strong visual hierarchy, generous spacing, premium African tech brand aesthetic like a Forbes Africa or top startup campaign. 
Only render the few specified short text elements — no paragraphs, no fake body text, no gibberish text. 
Every letter sharp and readable. Award-winning graphic design quality.`;

function pick(arr, seed) { return arr[seed % arr.length]; }

function buildFlyerPrompt(postType, d, seed) {
  const scenes = [
    "a confident young African professional in a sharp suit smiling in a modern glass office",
    "a stunning Lagos city skyline at golden hour with gleaming towers",
    "diverse African professionals collaborating energetically in a bright modern workspace",
    "a bold geometric abstract composition of green and orange shapes with depth",
    "a successful African businesswoman in elegant professional attire, confident pose",
    "a cinematic aerial view of a thriving African business district at sunset",
    "an African tech worker at a sleek desk with city views behind them",
  ];
  const scene = pick(scenes, seed);

  // headline (2-4 words) + one big stat + a short tagline. All short = clean rendering.
  const flyers = {
    job_spotlight: {
      headline: "NEW JOBS THIS WEEK",
      stat: `${d.newJobs || 47}+`,
      tagline: "Apply today on WorkDey",
    },
    market_insight: {
      headline: "JOB MARKET REPORT",
      stat: `${d.totalJobs || 4200}+`,
      tagline: "Active jobs in Africa",
    },
    company_spotlight: {
      headline: "NOW HIRING",
      stat: `${d.topCompany?.count || 12}`,
      tagline: "Open positions on WorkDey",
    },
    platform_stats: {
      headline: "THE NUMBERS SPEAK",
      stat: `${d.weekApps || 380}`,
      tagline: "Applications this week",
    },
    industry_report: {
      headline: "AFRICA IS HIRING",
      stat: "12M+",
      tagline: "New jobs needed yearly · World Bank",
    },
    employer_tip: {
      headline: "HIRE SMARTER",
      stat: "+40%",
      tagline: "More applicants with WorkDey",
    },
    weekly_roundup: {
      headline: "WEEK IN REVIEW",
      stat: `${d.weekHires || 18}`,
      tagline: "People hired this week",
    },
    seeker_tip: {
      headline: "CAREER TIP",
      stat: "4x",
      tagline: "More callbacks · Apply early",
    },
    success_story: {
      headline: "HIRED IN 5 DAYS",
      stat: "",
      tagline: "Real WorkDey success story",
    },
    career_advice: {
      headline: "GROW YOUR CAREER",
      stat: "",
      tagline: "Free tips on WorkDey",
    },
    employer_pitch: {
      headline: "POST JOBS FREE",
      stat: `${d.totalCos || 820}+`,
      tagline: "Companies trust WorkDey",
    },
    gig_economy: {
      headline: "EARN DAILY",
      stat: "85%",
      tagline: "Of Africa works gig · World Bank",
    },
    youth_employment: {
      headline: "AFRICA'S FUTURE",
      stat: "60%",
      tagline: "Under 25 · UN SDG Goal 8",
    },
    salary_insight: {
      headline: `${(d.salary?.role || 'SALARY').toUpperCase()} PAY`,
      stat: "",
      tagline: "Know your worth on WorkDey",
    },
  };

  const f = flyers[postType] || flyers.platform_stats;
  const statPart = f.stat ? `a huge bold number "${f.stat}" as the focal point, ` : "";

  return `A premium recruitment campaign flyer featuring ${scene}. 
Design includes: the bold headline "${f.headline}" at the top, ${statPart}the short tagline "${f.tagline}", and a clean "WorkDey" logo wordmark at the bottom in green and orange. 
${STYLE}`;
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
