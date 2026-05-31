// ═══════════════════════════════════════════════════════════════════
// WorkDey Image Generator Server
// Generates branded LinkedIn cards with AI background + text overlay
// Deploy on Railway (free tier)
// ═══════════════════════════════════════════════════════════════════

const express = require('express');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const FAL_KEY = process.env.FAL_API_KEY || '';
const AUTH_SECRET = process.env.AUTH_SECRET || 'workdey-image-2026';

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const auth = req.headers['x-auth-secret'] || req.query.secret;
  if (auth !== AUTH_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// ─── HEALTH CHECK ────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'WorkDey Image Generator' }));

// ─── COLORS ─────────────────────────────────────────────────────
const C = {
  green:      '#0a8508',
  greenDark:  '#063d20',
  greenDeep:  '#0a3d2e',
  orange:     '#f7a814',
  white:      '#ffffff',
  black:      '#0a0a0a',
  textLight:  '#a8d5a2',
  textFaint:  '#5db96d',
  overlay:    'rgba(6,30,16,0.72)',
  overlayMid: 'rgba(6,30,16,0.55)',
  overlayLight:'rgba(6,30,16,0.35)',
  card:       'rgba(255,255,255,0.10)',
  cardBorder: 'rgba(255,255,255,0.18)',
};

// ─── CANVAS SIZE (LinkedIn optimal) ─────────────────────────────
const W = 1200;
const H = 627;

// ─── FETCH AI BACKGROUND FROM FAL.AI ────────────────────────────
async function fetchBackground(prompt) {
  const res = await fetch('https://fal.run/fal-ai/flux-pro', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: prompt + '\nPhotorealistic, professional photography, 16:9 landscape format, no text, no logos, no watermarks.',
      image_size: 'landscape_16_9',
      num_images: 1,
      safety_tolerance: '5',
      output_format: 'jpeg',
    }),
  });
  if (!res.ok) throw new Error(`fal.ai error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  if (!data.images || !data.images[0]) throw new Error('No image from fal.ai');
  const imgRes = await fetch(data.images[0].url);
  if (!imgRes.ok) throw new Error('Failed to download background');
  const buf = await imgRes.buffer();
  return buf;
}

// ─── DRAW UTILITIES ─────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let lines = [];
  for (let w of words) {
    const test = line + w + ' ';
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line.trim());
      line = w + ' ';
    } else {
      line = test;
    }
  }
  if (line) lines.push(line.trim());
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return lines.length;
}

function drawLogo(ctx, x, y, size = 36) {
  // "Work" in green
  ctx.font = `900 ${size}px Arial Black, Arial`;
  ctx.fillStyle = C.green;
  ctx.fillText('Work', x, y);
  const workW = ctx.measureText('Work').width;
  // "Dey" in orange
  ctx.fillStyle = C.orange;
  ctx.fillText('Dey', x + workW, y);
  const deyW = ctx.measureText('Dey').width;
  // dot separator
  ctx.fillStyle = C.textLight;
  ctx.font = `400 ${Math.round(size * 0.5)}px Arial`;
  ctx.fillText('  workdey.work', x + workW + deyW, y - 2);
}

function drawPill(ctx, x, y, text, bg = C.orange, fg = C.black, padding = 24) {
  ctx.font = '700 15px Arial';
  const tw = ctx.measureText(text).width;
  const pw = tw + padding * 2;
  const ph = 38;
  roundRect(ctx, x, y, pw, ph, 19);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = '800 13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(text, x + pw / 2, y + 25);
  ctx.textAlign = 'left';
  return pw;
}

function drawCard(ctx, x, y, w, h, r = 12) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.strokeStyle = C.cardBorder;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawAccentBar(ctx) {
  // Left orange accent bar
  ctx.fillStyle = C.orange;
  ctx.fillRect(0, 0, 6, H);
  // Bottom gradient bar
  const grad = ctx.createLinearGradient(0, H - 4, W, H - 4);
  grad.addColorStop(0, C.green);
  grad.addColorStop(1, C.orange);
  ctx.fillStyle = grad;
  ctx.fillRect(0, H - 4, W, 4);
}

function drawFooter(ctx) {
  // Footer separator
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, H - 72);
  ctx.lineTo(W - 60, H - 72);
  ctx.stroke();
  // Logo
  drawLogo(ctx, 60, H - 34);
}

async function drawBackground(ctx, bgBuffer, overlayStyle = 'dark') {
  // Draw AI photo background
  if (bgBuffer) {
    try {
      const img = await loadImage(bgBuffer);
      ctx.drawImage(img, 0, 0, W, H);
    } catch (e) {
      // Fallback gradient if image fails
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, C.greenDeep);
      grad.addColorStop(1, C.greenDark);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, C.greenDeep);
    grad.addColorStop(1, C.greenDark);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // Overlay to make text readable
  const overlays = {
    dark:    ['rgba(6,20,12,0.78)', 'rgba(6,20,12,0.65)'],
    medium:  ['rgba(6,20,12,0.65)', 'rgba(6,20,12,0.45)'],
    light:   ['rgba(6,20,12,0.55)', 'rgba(6,20,12,0.30)'],
    split:   ['rgba(6,20,12,0.82)', 'rgba(6,20,12,0.40)'],
  };
  const [c1, c2] = overlays[overlayStyle] || overlays.dark;
  const grad2 = ctx.createLinearGradient(0, 0, 0, H);
  grad2.addColorStop(0, c1);
  grad2.addColorStop(1, c2);
  ctx.fillStyle = grad2;
  ctx.fillRect(0, 0, W, H);
}

// ═══════════════════════════════════════════════════════════════════
// CARD DESIGNS
// ═══════════════════════════════════════════════════════════════════

// 1. JOB SPOTLIGHT
async function drawJobSpotlight(ctx, d, bg) {
  await drawBackground(ctx, bg, 'dark');
  drawAccentBar(ctx);

  drawPill(ctx, 60, 48, '🔥  HOT JOBS THIS WEEK', C.orange, C.black);

  ctx.fillStyle = C.white;
  ctx.font = '900 64px Arial Black, Arial';
  ctx.fillText(`${d.newJobs}+ New Jobs`, 60, 168);

  ctx.fillStyle = C.orange;
  ctx.font = '700 36px Arial';
  ctx.fillText('Posted This Week in Africa', 60, 218);

  // Job rows
  const jobs = (d.topJobs || []).slice(0, 3);
  jobs.forEach((j, i) => {
    const ry = 278 + i * 82;
    drawCard(ctx, 60, ry, 720, 68, 10);
    // Accent color strip
    const colors = [C.orange, C.green, '#2557a7'];
    ctx.fillStyle = colors[i];
    roundRect(ctx, 60, ry, 5, 68, 3);
    ctx.fill();
    ctx.fillStyle = C.white;
    ctx.font = '700 20px Arial';
    ctx.fillText((j.title || '—').slice(0, 42), 86, ry + 30);
    ctx.fillStyle = C.textLight;
    ctx.font = '400 15px Arial';
    ctx.fillText(`${j.city || ''}${j.salary_label ? ' · ' + j.salary_label : ''}`, 86, ry + 54);
  });

  // Right stat box
  drawCard(ctx, 840, 248, 300, 165, 14);
  ctx.fillStyle = C.orange;
  ctx.font = '900 68px Arial Black, Arial';
  ctx.textAlign = 'center';
  ctx.fillText(String(d.totalJobs || '4.2k+'), 990, 318);
  ctx.fillStyle = C.textLight;
  ctx.font = '700 15px Arial';
  ctx.fillText('ACTIVE JOBS', 990, 348);
  ctx.fillStyle = C.textFaint;
  ctx.font = '400 13px Arial';
  ctx.fillText(`${d.totalCos || 820}+ companies hiring`, 990, 372);
  ctx.textAlign = 'left';

  drawFooter(ctx);
}

// 2. MARKET INSIGHT
async function drawMarketInsight(ctx, d, bg) {
  await drawBackground(ctx, bg, 'dark');
  drawAccentBar(ctx);

  drawPill(ctx, 60, 48, '📊  MARKET INTELLIGENCE', '#2557a7', C.white, 20);

  ctx.fillStyle = C.white;
  ctx.font = '900 50px Arial Black, Arial';
  ctx.fillText('Top In-Demand Skills', 60, 162);

  ctx.fillStyle = C.textLight;
  ctx.font = '500 22px Arial';
  ctx.fillText(`Cameroon & Nigeria · ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`, 60, 204);

  const cats = (d.topCategories || [{ name: 'Sales', count: 42 }, { name: 'Accounting', count: 38 }, { name: 'Driver', count: 31 }, { name: 'IT Support', count: 24 }, { name: 'Marketing', count: 19 }]).slice(0, 5);
  const maxC = Math.max(...cats.map(c => c.count), 1);
  const barColors = [C.orange, C.green, '#2557a7', '#cc8000', '#0d6e0d'];

  cats.forEach((c, i) => {
    const ry = 248 + i * 54;
    const bw = Math.round((c.count / maxC) * 520);
    ctx.fillStyle = C.white;
    ctx.font = '700 17px Arial';
    ctx.fillText(c.name, 60, ry + 22);
    roundRect(ctx, 240, ry, bw, 28, 5);
    ctx.fillStyle = barColors[i % barColors.length];
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.orange;
    ctx.font = '700 15px Arial';
    ctx.fillText(String(c.count), 240 + bw + 10, ry + 20);
  });

  drawCard(ctx, 840, 248, 300, 165, 14);
  ctx.fillStyle = C.orange;
  ctx.font = '900 62px Arial Black, Arial';
  ctx.textAlign = 'center';
  ctx.fillText(String(d.totalJobs || '4.2k+'), 990, 316);
  ctx.fillStyle = C.textLight;
  ctx.font = '700 14px Arial';
  ctx.fillText('ACTIVE JOBS', 990, 344);
  ctx.fillStyle = C.textFaint;
  ctx.font = '400 13px Arial';
  ctx.fillText(`${d.weekApps || 0} applications/week`, 990, 366);
  ctx.textAlign = 'left';

  drawFooter(ctx);
}

// 3. SEEKER TIP
async function drawSeekerTip(ctx, d, bg) {
  await drawBackground(ctx, bg, 'medium');
  drawAccentBar(ctx);

  drawPill(ctx, 60, 48, '💡  CAREER TIP OF THE WEEK', C.green, C.white, 20);

  // Large quote mark
  ctx.fillStyle = C.orange;
  ctx.globalAlpha = 0.18;
  ctx.font = '900 220px Georgia, serif';
  ctx.fillText('"', 44, 300);
  ctx.globalAlpha = 1;

  // Tip headline
  ctx.fillStyle = C.white;
  ctx.font = '900 46px Arial Black, Arial';
  const tip = d.tipHeadline || 'One page. Clear skills. WhatsApp number.';
  wrapText(ctx, tip, 60, 256, 820, 58);

  // Sub text
  ctx.fillStyle = C.textLight;
  ctx.font = '400 22px Arial';
  ctx.fillText((d.tipSub || '').slice(0, 70), 60, 390);

  // AI Coach promo box
  drawCard(ctx, 60, 424, 520, 68, 10);
  ctx.strokeStyle = C.orange;
  ctx.globalAlpha = 0.4;
  roundRect(ctx, 60, 424, 520, 68, 10);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.orange;
  ctx.font = '700 16px Arial';
  ctx.fillText('🤖  Practice with WorkDey AI Interview Coach', 80, 452);
  ctx.fillStyle = C.textLight;
  ctx.font = '400 14px Arial';
  ctx.fillText('Free · workdey.work', 80, 474);

  drawFooter(ctx);
}

// 4. COMPANY SPOTLIGHT
async function drawCompanySpotlight(ctx, d, bg) {
  await drawBackground(ctx, bg, 'dark');
  drawAccentBar(ctx);

  drawPill(ctx, 60, 48, '🏢  COMPANY SPOTLIGHT', C.orange, C.black);

  const co = d.topCompany || { name: 'Top Employer', country: 'CM', count: 5 };
  const country = co.country === 'NG' ? 'Nigeria' : 'Cameroon';
  const ini = (co.name || 'CO').split(/\s+/).map(w => w[0] || '').slice(0, 2).join('').toUpperCase();

  // Company avatar
  drawCard(ctx, 60, 124, 110, 110, 16);
  ctx.strokeStyle = C.orange;
  ctx.lineWidth = 2;
  roundRect(ctx, 60, 124, 110, 110, 16);
  ctx.stroke();
  ctx.fillStyle = C.orange;
  ctx.font = '900 44px Arial Black, Arial';
  ctx.textAlign = 'center';
  ctx.fillText(ini, 115, 196);
  ctx.textAlign = 'left';

  ctx.fillStyle = C.white;
  ctx.font = '900 50px Arial Black, Arial';
  ctx.fillText((co.name || '').slice(0, 28), 192, 182);

  ctx.fillStyle = C.textLight;
  ctx.font = '500 22px Arial';
  ctx.fillText(`${country} · Verified Employer ✓`, 192, 218);

  // Open roles big number
  drawCard(ctx, 60, 268, 500, 130, 14);
  ctx.strokeStyle = C.orange;
  ctx.globalAlpha = 0.35;
  roundRect(ctx, 60, 268, 500, 130, 14);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = C.orange;
  ctx.font = '900 88px Arial Black, Arial';
  ctx.textAlign = 'center';
  ctx.fillText(String(co.count || 5), 188, 358);
  ctx.textAlign = 'left';

  ctx.fillStyle = C.white;
  ctx.font = '700 24px Arial';
  ctx.fillText('Open', 320, 330);
  ctx.fillText('Positions', 320, 362);

  // CTA button
  roundRect(ctx, 60, 432, 340, 62, 31);
  ctx.fillStyle = C.green;
  ctx.fill();
  ctx.fillStyle = C.white;
  ctx.font = '800 20px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Apply at workdey.work →', 230, 470);
  ctx.textAlign = 'left';

  drawCard(ctx, 840, 248, 300, 165, 14);
  ctx.fillStyle = C.orange;
  ctx.font = '900 62px Arial Black, Arial';
  ctx.textAlign = 'center';
  ctx.fillText(String(d.totalJobs || '4.2k+'), 990, 318);
  ctx.fillStyle = C.textLight;
  ctx.font = '700 14px Arial';
  ctx.fillText('JOBS AVAILABLE', 990, 346);
  ctx.fillStyle = C.textFaint;
  ctx.font = '400 13px Arial';
  ctx.fillText(`${d.totalCos || 820}+ employers`, 990, 368);
  ctx.textAlign = 'left';

  drawFooter(ctx);
}

// 5. PLATFORM STATS
async function drawPlatformStats(ctx, d, bg) {
  await drawBackground(ctx, bg, 'dark');
  drawAccentBar(ctx);

  drawPill(ctx, 60, 48, '📈  WORKDEY THIS WEEK', C.green, C.white, 20);

  ctx.fillStyle = C.white;
  ctx.font = '900 52px Arial Black, Arial';
  ctx.fillText('The Numbers Speak', 60, 162);

  ctx.fillStyle = C.textLight;
  ctx.font = '500 22px Arial';
  ctx.fillText('Real impact. Real jobs. Real Africa.', 60, 200);

  // 4 stat cards in 2x2
  const stats = [
    { val: String(d.weekApps || 0), lbl: 'APPLICATIONS', sub: 'this week', color: C.orange },
    { val: String(d.newJobs || 0), lbl: 'JOBS POSTED', sub: 'this week', color: C.green },
    { val: String(d.weekHires || 0), lbl: 'PEOPLE HIRED', sub: 'this week', color: C.orange },
    { val: `${d.totalCos || 820}+`, lbl: 'EMPLOYERS', sub: 'on platform', color: C.green },
  ];

  const positions = [[60, 238], [326, 238], [60, 382], [326, 382]];
  stats.forEach((st, i) => {
    const [sx, sy] = positions[i];
    drawCard(ctx, sx, sy, 250, 124, 12);
    ctx.fillStyle = st.color;
    ctx.font = `900 54px Arial Black, Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(st.val, sx + 125, sy + 64);
    ctx.fillStyle = C.textLight;
    ctx.font = '700 13px Arial';
    ctx.fillText(st.lbl, sx + 125, sy + 90);
    ctx.fillStyle = C.textFaint;
    ctx.font = '400 12px Arial';
    ctx.fillText(st.sub, sx + 125, sy + 110);
    ctx.textAlign = 'left';
  });

  drawCard(ctx, 756, 238, 390, 265, 14);
  ctx.fillStyle = C.orange;
  ctx.font = '900 82px Arial Black, Arial';
  ctx.textAlign = 'center';
  ctx.fillText(String(d.totalJobs || '4.2k+'), 951, 344);
  ctx.fillStyle = C.white;
  ctx.font = '700 18px Arial';
  ctx.fillText('TOTAL ACTIVE JOBS', 951, 376);
  ctx.fillStyle = C.textLight;
  ctx.font = '400 15px Arial';
  ctx.fillText('Cameroon + Nigeria', 951, 400);
  ctx.textAlign = 'left';

  drawFooter(ctx);
}

// 6. CAREER ADVICE
async function drawCareerAdvice(ctx, d, bg) {
  await drawBackground(ctx, bg, 'medium');
  drawAccentBar(ctx);

  const a = d.article || { title: 'How to Write a CV That Gets You Hired', cat: 'Career Tips', catColor: C.green };
  drawPill(ctx, 60, 48, `📚  ${(a.cat || 'CAREER TIPS').toUpperCase()}`, a.catColor || C.green, C.white, 20);

  ctx.fillStyle = C.white;
  ctx.font = '900 52px Arial Black, Arial';
  const lines = [];
  const words = (a.title || '').split(' ');
  let line = '';
  words.forEach(w => {
    const test = line + w + ' ';
    if (ctx.measureText(test).width > 840 && line) { lines.push(line.trim()); line = w + ' '; }
    else line = test;
  });
  if (line) lines.push(line.trim());
  lines.slice(0, 3).forEach((l, i) => { ctx.fillText(l, 60, 168 + i * 62); });

  // Divider
  ctx.strokeStyle = C.orange;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, 368);
  ctx.lineTo(580, 368);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = C.orange;
  ctx.font = '700 20px Arial';
  ctx.fillText('Read more → workdey.work/blog', 60, 408);

  drawCard(ctx, 840, 248, 300, 165, 14);
  ctx.fillStyle = C.orange;
  ctx.font = '900 62px Arial Black, Arial';
  ctx.textAlign = 'center';
  ctx.fillText(String(d.totalJobs || '4.2k+'), 990, 318);
  ctx.fillStyle = C.textLight;
  ctx.font = '700 14px Arial';
  ctx.fillText('JOBS AVAILABLE', 990, 346);
  ctx.textAlign = 'left';

  drawFooter(ctx);
}

// 7. EMPLOYER PITCH
async function drawEmployerPitch(ctx, d, bg) {
  await drawBackground(ctx, bg, 'dark');
  drawAccentBar(ctx);

  drawPill(ctx, 60, 48, '📣  ATTENTION EMPLOYERS', C.orange, C.black);

  ctx.fillStyle = C.white;
  ctx.font = '900 54px Arial Black, Arial';
  ctx.fillText('Still Hiring via', 60, 164);
  ctx.fillStyle = C.orange;
  ctx.fillText('WhatsApp Groups?', 60, 222);

  // Left card (problem)
  drawCard(ctx, 60, 252, 440, 228, 12);
  ctx.strokeStyle = '#cc2e2e';
  ctx.globalAlpha = 0.4;
  roundRect(ctx, 60, 252, 440, 228, 12);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ff8a8a';
  ctx.font = '800 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('WHATSAPP GROUPS', 280, 282);
  ctx.textAlign = 'left';
  const cons = ['✗  Unverified candidates', '✗  No skill filtering', '✗  CVs lost in forwards', '✗  No pipeline tracking', '✗  Spam and fake applicants'];
  cons.forEach((c, i) => {
    ctx.fillStyle = '#ffaaaa';
    ctx.font = '400 16px Arial';
    ctx.fillText(c, 80, 318 + i * 34);
  });

  // VS
  ctx.fillStyle = C.orange;
  ctx.font = '900 28px Arial Black, Arial';
  ctx.textAlign = 'center';
  ctx.fillText('VS', 590, 372);
  ctx.textAlign = 'left';

  // Right card (solution)
  drawCard(ctx, 660, 252, 440, 228, 12);
  ctx.strokeStyle = C.green;
  ctx.globalAlpha = 0.4;
  roundRect(ctx, 660, 252, 440, 228, 12);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.textLight;
  ctx.font = '800 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('WORKDEY', 880, 282);
  ctx.textAlign = 'left';
  const pros = ['✓  Verified profiles + CVs', '✓  Skills filtering built in', '✓  Full pipeline dashboard', '✓  WhatsApp integrated', `✓  ${d.totalCos || 820}+ companies use it`];
  pros.forEach((p, i) => {
    ctx.fillStyle = C.textLight;
    ctx.font = '400 16px Arial';
    ctx.fillText(p, 680, 318 + i * 34);
  });

  ctx.fillStyle = C.textLight;
  ctx.font = '400 18px Arial';
  ctx.fillText('Post your first job ', 60, 512);
  const pw = ctx.measureText('Post your first job ').width;
  ctx.fillStyle = C.orange;
  ctx.font = '800 18px Arial';
  ctx.fillText('completely free', 60 + pw, 512);
  const fw = ctx.measureText('completely free').width;
  ctx.fillStyle = C.textLight;
  ctx.font = '400 18px Arial';
  ctx.fillText(' → workdey.work', 60 + pw + fw, 512);

  drawFooter(ctx);
}

// ═══════════════════════════════════════════════════════════════════
// BACKGROUND PROMPTS — professional photography
// ═══════════════════════════════════════════════════════════════════
const BG_PROMPTS = {
  job_spotlight: 'Confident young African professionals in a bright modern open-plan office in Lagos Nigeria, glass walls, city skyline background, natural daylight, warm professional atmosphere, editorial photography style',
  market_insight: 'Aerial view of Victoria Island Lagos business district at golden hour, glass skyscrapers, warm orange sunset light, cinematic drone photography',
  seeker_tip: 'Focused young African man writing at a minimalist wooden desk in a bright home office, warm side window light, concentrated expression, cozy productive atmosphere, editorial photography',
  company_spotlight: 'Modern glass corporate headquarters entrance lobby in Douala Cameroon, marble floors, living green wall, African art, professional executives walking through, soft professional lighting',
  platform_stats: 'Large diverse group of smiling young African professionals in business attire on steps of modern glass office building in Lagos at golden hour, community and achievement',
  career_advice: 'Confident African woman in tailored blazer in a bright modern meeting room, speaking clearly, professional body language, floor to ceiling windows, city view, natural daylight',
  employer_pitch: 'Professional African HR manager standing confidently in front of modern recruitment dashboard monitor, modern open-plan office in Douala, team working in background, professional corporate setting',
};

// ═══════════════════════════════════════════════════════════════════
// MAIN ENDPOINT
// POST /generate { post_type, data }
// Returns PNG image
// ═══════════════════════════════════════════════════════════════════
app.post('/generate', async (req, res) => {
  const { post_type = 'platform_stats', data = {} } = req.body;

  try {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Fetch AI background
    let bgBuffer = null;
    const bgPrompt = BG_PROMPTS[post_type] || BG_PROMPTS.platform_stats;
    if (FAL_KEY) {
      try {
        bgBuffer = await fetchBackground(bgPrompt);
      } catch (e) {
        console.error('Background fetch failed:', e.message, '— using gradient fallback');
      }
    }

    // Draw the card
    const drawFns = {
      job_spotlight:    drawJobSpotlight,
      market_insight:   drawMarketInsight,
      seeker_tip:       drawSeekerTip,
      company_spotlight: drawCompanySpotlight,
      platform_stats:   drawPlatformStats,
      career_advice:    drawCareerAdvice,
      employer_pitch:   drawEmployerPitch,
    };

    const drawFn = drawFns[post_type] || drawPlatformStats;
    await drawFn(ctx, data, bgBuffer);

    // Return PNG
    const png = canvas.toBuffer('image/png');
    res.set('Content-Type', 'image/png');
    res.set('Content-Length', String(png.length));
    res.send(png);

  } catch (e) {
    console.error('Generate error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`WorkDey Image Server running on port ${PORT}`);
});
