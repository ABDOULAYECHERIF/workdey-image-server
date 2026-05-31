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

// Shared brand + style instruction appended to every prompt
const BRAND = `Professional corporate social media flyer design, portrait orientation. 
WorkDey brand colors: deep palm green and vibrant orange accents. 
Modern clean typography, bold sans-serif headlines, generous spacing, premium quality.
Include the text "WorkDey" as a logo in palm green and orange at the bottom, with "workdey.work" beneath it.
High-end design like a flyer from a top African tech startup. Sharp, polished, professional.
NOT cluttered. Readable text. Award-winning graphic design.`;

function pick(arr, seed) { return arr[seed % arr.length]; }

function buildFlyerPrompt(postType, d, seed) {
  // Visual scene variety — rotates so images differ
  const scenes = [
    "with a confident young African professional smiling in a modern office",
    "with a vibrant African city skyline at golden hour in the background",
    "with diverse African professionals collaborating in a bright workspace",
    "with a clean geometric abstract background in green and orange",
    "with a modern African business district and glass towers",
    "with an African woman in business attire looking confident and successful",
    "with dynamic motion graphics and bold color blocks",
  ];
  const scene = pick(scenes, seed);

  const prompts = {
    job_spotlight: `A bold job advertisement flyer headlined "NEW JOBS THIS WEEK" in large letters, with subtext "${d.newJobs}+ Opportunities in Cameroon & Nigeria", ${scene}. Show "${d.topCategory?.name || 'Sales'} · Accounting · IT · Marketing" as category tags. ${BRAND}`,

    market_insight: `A sleek data report flyer headlined "AFRICAN JOB MARKET REPORT 2026", with subtext "${d.totalJobs}+ Active Jobs Across Cameroon & Nigeria", featuring elegant bar chart graphics, ${scene}. Reference "Source: WorkDey Data". ${BRAND}`,

    company_spotlight: `A premium company recruitment flyer headlined "NOW HIRING", with subtext "${d.topCompany?.count || 12} Open Positions" and "${d.topCompany?.country === 'NG' ? 'Nigeria' : 'Cameroon'}", ${scene}. Professional corporate aesthetic. ${BRAND}`,

    platform_stats: `An energetic milestone celebration flyer headlined "THE NUMBERS SPEAK", showing big bold statistics "${d.weekApps} Applications · ${d.newJobs} New Jobs · ${d.weekHires} Hired This Week", ${scene}. Celebratory momentum design. ${BRAND}`,

    industry_report: `A professional industry analysis flyer headlined "AFRICA'S WORKFORCE RISING", with subtext "12 Million New Jobs Needed Every Year", featuring upward trending graphics, ${scene}. Reference "World Bank · ILO · AfDB". Authoritative report aesthetic. ${BRAND}`,

    employer_tip: `A clean tip-of-the-week flyer headlined "HIRING SMARTER", with subtext "Post jobs with salary ranges — get 40% more applications", ${scene}. Professional advice card design. ${BRAND}`,

    weekly_roundup: `A vibrant weekly summary flyer headlined "THIS WEEK ON WORKDEY", showing "${d.weekApps} Applications · ${d.newJobs} New Jobs · ${d.weekHires} Hires", ${scene}. Newsletter highlight aesthetic. ${BRAND}`,

    seeker_tip: `An inspiring career tip flyer with a large quote "${(d.tipHeadline || 'Apply within 24 hours').slice(0, 50)}", subtext "Career tips for African professionals", ${scene}. Motivational quote card design. ${BRAND}`,

    success_story: `An emotional success story flyer headlined "FROM SEEKER TO HIRED", with subtext "Real stories from the WorkDey community", ${scene} showing a happy celebrating African professional. Warm inspiring design. ${BRAND}`,

    career_advice: `An editorial career advice flyer headlined "${(d.article?.title || 'Land Your Dream Job').slice(0, 40)}", with a "Career Tips" category tag, ${scene}. Magazine feature aesthetic. ${BRAND}`,

    employer_pitch: `A persuasive employer flyer headlined "STILL HIRING ON WHATSAPP?", with subtext "${d.totalCos}+ companies switched to WorkDey", ${scene}. Bold comparison advertising design. ${BRAND}`,

    gig_economy: `A dynamic gig economy flyer headlined "EARN DAILY. WORK FLEXIBLY.", with subtext "Africa's gig economy is booming", ${scene} showing an energetic young African gig worker. Vibrant modern design. ${BRAND}`,

    youth_employment: `An uplifting youth employment flyer headlined "AFRICA'S YOUNG WORKFORCE", with subtext "60% of Africa is under 25", ${scene} showing optimistic young African graduates. Reference "UN SDG Goal 8". Hopeful inspiring design. ${BRAND}`,

    salary_insight: `A clean salary data flyer headlined "${(d.salary?.role || 'Accountant').toUpperCase()} SALARIES", showing "Cameroon: ${d.salary?.cm || '150,000-300,000 XAF'}" and "Nigeria: ${d.salary?.ng || '180,000-350,000 NGN'}", ${scene}. Professional data card design. ${BRAND}`,
  };

  return prompts[postType] || prompts.platform_stats;
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
