// ═══════════════════════════════════════════════════════════════════
// WorkDey Image Generator Server
// AI background (Flux Pro) + branded canvas overlay
// Deploy on Railway — node server.js
// ═══════════════════════════════════════════════════════════════════

const express = require('express');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fetch = require('node-fetch');
const path = require('path');

// Register bundled fonts — required since Railway has no system fonts
GlobalFonts.registerFromPath(path.join(__dirname, 'fonts', 'Roboto-Regular.ttf'), 'Roboto');
GlobalFonts.registerFromPath(path.join(__dirname, 'fonts', 'Roboto-Bold.ttf'), 'Roboto');
GlobalFonts.registerFromPath(path.join(__dirname, 'fonts', 'Roboto-Black.ttf'), 'Roboto');
console.log('Fonts registered:', GlobalFonts.families.map(f => f.family).join(', '));

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const FAL_KEY     = process.env.FAL_API_KEY || '';
const AUTH_SECRET = process.env.AUTH_SECRET || 'workdey-image-2026';

// ─── AUTH ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const auth = req.headers['x-auth-secret'] || req.query.secret;
  if (auth !== AUTH_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

app.get('/health', (req, res) => res.json({ ok: true }));

// ─── CONSTANTS ───────────────────────────────────────────────────
const W = 1200, H = 627;

const GREEN       = '#0a8508';
const GREEN_DARK  = '#063d20';
const ORANGE      = '#f7a814';
const WHITE       = '#ffffff';
const TEXT_LIGHT  = '#a8d5a2';
const TEXT_FAINT  = '#6db96d';
const CARD_FILL   = 'rgba(255,255,255,0.09)';
const CARD_STROKE = 'rgba(255,255,255,0.18)';

// ─── FETCH AI BACKGROUND ─────────────────────────────────────────
const BG_PROMPTS = {
  job_spotlight:     'Confident young African professionals working in a bright modern glass office in Lagos Nigeria, natural daylight, warm professional atmosphere, no text',
  market_insight:    'Aerial view of Victoria Island Lagos business district at golden hour, glass skyscrapers, warm orange sunset, cinematic, no text',
  seeker_tip:        'Focused young African man writing at a minimalist wooden desk in a bright home office, warm side window light, cozy productive atmosphere, no text',
  company_spotlight: 'Modern glass corporate headquarters entrance lobby in Douala Cameroon, marble floors, professional lighting, African executives, no text',
  platform_stats:    'Large diverse group of smiling young African professionals in business attire on steps of modern glass office building Lagos at golden hour, no text',
  career_advice:     'Confident African woman in tailored blazer in a bright modern meeting room, speaking clearly, floor to ceiling windows, city view, natural daylight, no text',
  employer_pitch:    'Professional African HR manager standing confidently in modern open-plan office in Douala, team working in background, corporate setting, no text',
};

async function fetchBg(postType) {
  if (!FAL_KEY) return null;
  try {
    const prompt = (BG_PROMPTS[postType] || BG_PROMPTS.platform_stats)
      + ' Photorealistic professional photography. 16:9 landscape. No text no logos no watermarks.';
    const res = await fetch('https://fal.run/fal-ai/flux-pro', {
      method: 'POST',
      headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image_size: 'landscape_16_9', num_images: 1, safety_tolerance: '5', output_format: 'jpeg' }),
    });
    if (!res.ok) throw new Error(`fal ${res.status}`);
    const data = await res.json();
    if (!data.images?.[0]?.url) throw new Error('no image url');
    const ir = await fetch(data.images[0].url);
    if (!ir.ok) throw new Error('download failed');
    return await ir.buffer();
  } catch (e) {
    console.error('BG failed:', e.message, '— using gradient');
    return null;
  }
}

// ─── CANVAS HELPERS ──────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r = 10) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function card(ctx, x, y, w, h, r = 12) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = CARD_FILL;
  ctx.fill();
  ctx.strokeStyle = CARD_STROKE;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function pill(ctx, x, y, label, bg = ORANGE, fg = '#1a1a1a') {
  ctx.font = '800 13px Roboto';
  const tw = ctx.measureText(label).width;
  const pw = tw + 40, ph = 38;
  roundRect(ctx, x, y, pw, ph, 19);
  ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.fillText(label, x + pw / 2, y + 25);
  ctx.textAlign = 'left';
  return pw;
}

function logo(ctx, x, y, size = 34) {
  ctx.font = `bold ${size}px Roboto`;
  ctx.fillStyle = GREEN;
  ctx.fillText('Work', x, y);
  const ww = ctx.measureText('Work').width;
  ctx.fillStyle = ORANGE;
  ctx.fillText('Dey', x + ww, y);
  const dw = ctx.measureText('Dey').width;
  ctx.fillStyle = TEXT_LIGHT;
  ctx.font = `400 ${Math.round(size * 0.48)}px Roboto`;
  ctx.fillText('  workdey.work', x + ww + dw, y - 2);
}

function footer(ctx) {
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(60, H - 68); ctx.lineTo(W - 60, H - 68); ctx.stroke();
  logo(ctx, 60, H - 28);
}

function accentBar(ctx) {
  ctx.fillStyle = ORANGE;
  ctx.fillRect(0, 0, 6, H);
  const g = ctx.createLinearGradient(0, H - 4, W, H - 4);
  g.addColorStop(0, GREEN); g.addColorStop(1, ORANGE);
  ctx.fillStyle = g; ctx.fillRect(0, H - 4, W, 4);
}

async function drawBg(ctx, buf, style = 'dark') {
  if (buf) {
    try {
      const img = await loadImage(buf);
      ctx.drawImage(img, 0, 0, W, H);
    } catch {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#0a3d2e'); g.addColorStop(1, GREEN_DARK);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0a3d2e'); g.addColorStop(1, GREEN_DARK);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  const alphas = { dark: [0.78, 0.68], medium: [0.65, 0.50], light: [0.50, 0.35] };
  const [a1, a2] = alphas[style] || alphas.dark;
  const ov = ctx.createLinearGradient(0, 0, 0, H);
  ov.addColorStop(0, `rgba(4,18,10,${a1})`);
  ov.addColorStop(1, `rgba(4,18,10,${a2})`);
  ctx.fillStyle = ov; ctx.fillRect(0, 0, W, H);
}

function statCard(ctx, x, y, val, lbl, sub, valColor = ORANGE) {
  const CW = 230, CH = 120;
  card(ctx, x, y, CW, CH, 12);
  ctx.fillStyle = valColor;
  ctx.font = 'bold 54px Roboto';
  ctx.textAlign = 'center';
  ctx.fillText(String(val), x + CW / 2, y + 62);
  ctx.fillStyle = TEXT_LIGHT;
  ctx.font = '700 13px Roboto';
  ctx.fillText(lbl, x + CW / 2, y + 86);
  ctx.fillStyle = TEXT_FAINT;
  ctx.font = '400 12px Roboto';
  ctx.fillText(sub, x + CW / 2, y + 106);
  ctx.textAlign = 'left';
}

// ═══════════════════════════════════════════════════════════════════
// 1. JOB SPOTLIGHT
// Layout: pill + headline (left), 3 job rows (left), stat box (right)
// ═══════════════════════════════════════════════════════════════════
async function drawJobSpotlight(ctx, d, bg) {
  await drawBg(ctx, bg); accentBar(ctx);
  pill(ctx, 60, 46, '🔥  HOT JOBS THIS WEEK', ORANGE, '#1a1a1a');

  ctx.fillStyle = WHITE; ctx.font = 'bold 58px Roboto';
  ctx.fillText(`${d.newJobs || 4}+ New Jobs This Week`, 60, 158);
  ctx.fillStyle = ORANGE; ctx.font = '700 28px Roboto';
  ctx.fillText(`${(d.topCategory?.name || 'Sales')} leads with ${d.topCategory?.count || 12}+ openings`, 60, 198);

  const jobs = (d.topJobs || []).slice(0, 3);
  const jColors = [ORANGE, GREEN, '#2557a7'];
  jobs.forEach((j, i) => {
    const ry = 228 + i * 88;
    card(ctx, 60, ry, 710, 74, 10);
    ctx.fillStyle = jColors[i]; ctx.fillRect(60, ry, 5, 74);
    ctx.fillStyle = WHITE; ctx.font = '700 21px Roboto';
    ctx.fillText((j.title || '—').slice(0, 40), 86, ry + 32);
    ctx.fillStyle = TEXT_LIGHT; ctx.font = '400 15px Roboto';
    ctx.fillText(`${j.city || ''}${j.salary_label ? '  ·  ' + j.salary_label : ''}`, 86, ry + 56);
  });

  // Right stat box
  card(ctx, 834, 228, 306, 170, 14);
  ctx.fillStyle = ORANGE; ctx.font = 'bold 70px Roboto';
  ctx.textAlign = 'center'; ctx.fillText(String(d.totalJobs || 43), 987, 316);
  ctx.fillStyle = TEXT_LIGHT; ctx.font = '700 15px Roboto';
  ctx.fillText('ACTIVE JOBS', 987, 346);
  ctx.fillStyle = TEXT_FAINT; ctx.font = '400 13px Roboto';
  ctx.fillText(`${d.totalCos || 29} companies hiring`, 987, 368);
  ctx.textAlign = 'left';

  footer(ctx);
}

// ═══════════════════════════════════════════════════════════════════
// 2. MARKET INSIGHT
// Layout: pill + title, 5 horizontal bar chart rows, right stat box
// ═══════════════════════════════════════════════════════════════════
async function drawMarketInsight(ctx, d, bg) {
  await drawBg(ctx, bg); accentBar(ctx);
  pill(ctx, 60, 46, '📊  MARKET INTELLIGENCE', '#2557a7', WHITE);

  ctx.fillStyle = WHITE; ctx.font = 'bold 48px Roboto';
  ctx.fillText('Top In-Demand Skills', 60, 156);
  ctx.fillStyle = TEXT_LIGHT; ctx.font = '500 20px Roboto';
  ctx.fillText(`Cameroon & Nigeria  ·  ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`, 60, 192);

  const cats = (d.topCategories?.length ? d.topCategories : [
    { name: 'Sales', count: 42 }, { name: 'Accounting', count: 38 },
    { name: 'Driver', count: 31 }, { name: 'IT Support', count: 24 }, { name: 'Marketing', count: 19 }
  ]).slice(0, 5);
  const maxC = Math.max(...cats.map(c => c.count), 1);
  const bColors = [ORANGE, GREEN, '#2557a7', '#cc8000', '#0d6e0d'];

  cats.forEach((c, i) => {
    const ry = 224 + i * 56;
    const bw = Math.round((c.count / maxC) * 480);
    ctx.fillStyle = WHITE; ctx.font = '600 16px Roboto';
    ctx.fillText(c.name, 60, ry + 20);
    roundRect(ctx, 230, ry, bw, 28, 5);
    ctx.fillStyle = bColors[i]; ctx.globalAlpha = 0.88; ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = ORANGE; ctx.font = '700 14px Roboto';
    ctx.fillText(String(c.count), 230 + bw + 10, ry + 20);
  });

  card(ctx, 834, 224, 306, 170, 14);
  ctx.fillStyle = ORANGE; ctx.font = 'bold 70px Roboto';
  ctx.textAlign = 'center'; ctx.fillText(String(d.totalJobs || 43), 987, 312);
  ctx.fillStyle = TEXT_LIGHT; ctx.font = '700 15px Roboto';
  ctx.fillText('ACTIVE JOBS', 987, 342);
  ctx.fillStyle = TEXT_FAINT; ctx.font = '400 13px Roboto';
  ctx.fillText(`${d.weekApps || 19} applications/week`, 987, 364);
  ctx.textAlign = 'left';

  footer(ctx);
}

// ═══════════════════════════════════════════════════════════════════
// 3. SEEKER TIP
// Layout: pill, big quote, tip headline, sub text, AI coach promo box
// ═══════════════════════════════════════════════════════════════════
async function drawSeekerTip(ctx, d, bg) {
  await drawBg(ctx, bg, 'medium'); accentBar(ctx);
  pill(ctx, 60, 46, '💡  CAREER TIP OF THE WEEK', GREEN, WHITE);

  // Big decorative quote
  ctx.fillStyle = ORANGE; ctx.globalAlpha = 0.14;
  ctx.font = 'bold 200px Roboto'; ctx.fillText('"', 46, 310);
  ctx.globalAlpha = 1;

  const tip = d.tipHeadline || 'One page. Clear skills. WhatsApp number.';
  ctx.fillStyle = WHITE; ctx.font = 'bold 48px Roboto';
  // Word wrap tip
  const words = tip.split(' '); let line = '', ty = 260;
  words.forEach(w => {
    const t = line + w + ' ';
    if (ctx.measureText(t).width > 900 && line) {
      ctx.fillText(line.trim(), 60, ty); line = w + ' '; ty += 58;
    } else line = t;
  });
  ctx.fillText(line.trim(), 60, ty); ty += 42;

  ctx.fillStyle = TEXT_LIGHT; ctx.font = '400 22px Roboto';
  ctx.fillText((d.tipSub || '').slice(0, 72), 60, ty + 10);

  // AI Coach promo
  card(ctx, 60, ty + 36, 580, 68, 10);
  ctx.strokeStyle = ORANGE; ctx.globalAlpha = 0.38;
  roundRect(ctx, 60, ty + 36, 580, 68, 10); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = ORANGE; ctx.font = '700 16px Roboto';
  ctx.fillText('🤖  Practice with WorkDey AI Interview Coach', 82, ty + 60);
  ctx.fillStyle = TEXT_LIGHT; ctx.font = '400 14px Roboto';
  ctx.fillText('Free · workdey.work', 82, ty + 82);

  footer(ctx);
}

// ═══════════════════════════════════════════════════════════════════
// 4. COMPANY SPOTLIGHT
// Layout: pill, company name+avatar (top), open roles card, CTA, stat box
// ═══════════════════════════════════════════════════════════════════
async function drawCompanySpotlight(ctx, d, bg) {
  await drawBg(ctx, bg); accentBar(ctx);
  pill(ctx, 60, 46, '🏢  COMPANY SPOTLIGHT', ORANGE, '#1a1a1a');

  const co = d.topCompany || { name: 'Top Employer', country: 'CM', count: 5 };
  const country = co.country === 'NG' ? 'Nigeria' : 'Cameroon';
  const ini = (co.name || 'CO').split(/\s+/).map(w => (w[0] || '')).slice(0, 2).join('').toUpperCase();

  // Avatar box
  card(ctx, 60, 116, 108, 108, 14);
  ctx.strokeStyle = ORANGE; ctx.lineWidth = 2;
  roundRect(ctx, 60, 116, 108, 108, 14); ctx.stroke();
  ctx.fillStyle = ORANGE; ctx.font = 'bold 46px Roboto';
  ctx.textAlign = 'center'; ctx.fillText(ini, 114, 186); ctx.textAlign = 'left';

  ctx.fillStyle = WHITE; ctx.font = 'bold 48px Roboto';
  ctx.fillText((co.name || '').slice(0, 26), 192, 170);
  ctx.fillStyle = TEXT_LIGHT; ctx.font = '500 20px Roboto';
  ctx.fillText(`${country}  ·  Verified Employer ✓`, 192, 204);

  // Open roles card
  card(ctx, 60, 248, 480, 126, 14);
  ctx.strokeStyle = ORANGE; ctx.globalAlpha = 0.3;
  roundRect(ctx, 60, 248, 480, 126, 14); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = ORANGE; ctx.font = 'bold 84px Roboto';
  ctx.textAlign = 'center'; ctx.fillText(String(co.count || 5), 180, 340); ctx.textAlign = 'left';
  ctx.fillStyle = WHITE; ctx.font = '700 26px Roboto';
  ctx.fillText('Open', 310, 304); ctx.fillText('Positions', 310, 338);

  // CTA button
  roundRect(ctx, 60, 402, 360, 60, 30);
  ctx.fillStyle = GREEN; ctx.fill();
  ctx.fillStyle = WHITE; ctx.font = '800 20px Roboto';
  ctx.textAlign = 'center'; ctx.fillText('Apply at workdey.work →', 240, 439); ctx.textAlign = 'left';

  card(ctx, 834, 248, 306, 170, 14);
  ctx.fillStyle = ORANGE; ctx.font = 'bold 70px Roboto';
  ctx.textAlign = 'center'; ctx.fillText(String(d.totalJobs || 43), 987, 336);
  ctx.fillStyle = TEXT_LIGHT; ctx.font = '700 15px Roboto'; ctx.fillText('JOBS AVAILABLE', 987, 364);
  ctx.fillStyle = TEXT_FAINT; ctx.font = '400 13px Roboto'; ctx.fillText(`${d.totalCos || 29}+ employers`, 987, 386);
  ctx.textAlign = 'left';

  footer(ctx);
}

// ═══════════════════════════════════════════════════════════════════
// 5. PLATFORM STATS
// Layout: pill + headline, 4 stat cards in a row, 1 hero stat below
// ═══════════════════════════════════════════════════════════════════
async function drawPlatformStats(ctx, d, bg) {
  await drawBg(ctx, bg); accentBar(ctx);
  pill(ctx, 60, 46, '📈  WORKDEY THIS WEEK', GREEN, WHITE);

  ctx.fillStyle = WHITE; ctx.font = 'bold 52px Roboto';
  ctx.fillText('The Numbers Speak', 60, 154);
  ctx.fillStyle = TEXT_LIGHT; ctx.font = '500 22px Roboto';
  ctx.fillText('Real impact. Real jobs. Real Africa.', 60, 192);

  // 4 stat cards in a single row — each 246px wide with 16px gaps
  const cards4 = [
    { val: d.weekApps || 19,  lbl: 'APPLICATIONS',  sub: 'this week',   col: ORANGE },
    { val: d.newJobs  || 4,   lbl: 'JOBS POSTED',   sub: 'this week',   col: GREEN  },
    { val: d.weekHires|| 2,   lbl: 'PEOPLE HIRED',  sub: 'this week',   col: ORANGE },
    { val: `${d.totalCos||29}+`, lbl: 'EMPLOYERS',  sub: 'on platform', col: GREEN  },
  ];
  const cw = 246, gap = 16;
  cards4.forEach((c, i) => {
    statCard(ctx, 60 + i * (cw + gap), 232, c.val, c.lbl, c.sub, c.col);
  });

  // Hero total jobs bar
  card(ctx, 60, 378, 1080, 116, 14);
  ctx.fillStyle = ORANGE; ctx.font = 'bold 80px Roboto';
  ctx.textAlign = 'center'; ctx.fillText(String(d.totalJobs || 43), 370, 456);
  ctx.fillStyle = WHITE; ctx.font = '700 22px Roboto'; ctx.fillText('TOTAL ACTIVE JOBS', 560, 430);
  ctx.fillStyle = TEXT_LIGHT; ctx.font = '400 17px Roboto'; ctx.fillText('Cameroon  ·  Nigeria  ·  Africa', 560, 462);
  ctx.textAlign = 'left';

  footer(ctx);
}

// ═══════════════════════════════════════════════════════════════════
// 6. CAREER ADVICE
// Layout: category pill, article title (word-wrapped), divider, CTA, stat box
// ═══════════════════════════════════════════════════════════════════
async function drawCareerAdvice(ctx, d, bg) {
  await drawBg(ctx, bg, 'medium'); accentBar(ctx);

  const a = d.article || { title: 'How to Write a CV That Gets You Hired in Cameroon', cat: 'Career Tips', catColor: GREEN };
  pill(ctx, 60, 46, `📚  ${(a.cat || 'CAREER TIPS').toUpperCase()}`, a.catColor || GREEN, WHITE);

  ctx.fillStyle = WHITE; ctx.font = 'bold 52px Roboto';
  const words = (a.title || '').split(' ');
  let line = '', ty = 160, lines = 0;
  words.forEach(w => {
    const t = line + w + ' ';
    if (ctx.measureText(t).width > 860 && line) {
      ctx.fillText(line.trim(), 60, ty); line = w + ' '; ty += 62; lines++;
    } else line = t;
  });
  if (line) { ctx.fillText(line.trim(), 60, ty); ty += 62; lines++; }

  ty += 16;
  ctx.strokeStyle = ORANGE; ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(60, ty); ctx.lineTo(640, ty); ctx.stroke(); ctx.globalAlpha = 1;
  ty += 36;

  ctx.fillStyle = TEXT_LIGHT; ctx.font = '400 22px Roboto';
  ctx.fillText('More career tips →', 60, ty);
  const cw2 = ctx.measureText('More career tips →').width;
  ctx.fillStyle = ORANGE; ctx.font = '700 22px Roboto';
  ctx.fillText('  workdey.work/blog', 60 + cw2, ty);

  card(ctx, 834, 200, 306, 170, 14);
  ctx.fillStyle = ORANGE; ctx.font = 'bold 70px Roboto';
  ctx.textAlign = 'center'; ctx.fillText(String(d.totalJobs || 43), 987, 292);
  ctx.fillStyle = TEXT_LIGHT; ctx.font = '700 15px Roboto'; ctx.fillText('JOBS AVAILABLE', 987, 320);
  ctx.fillStyle = TEXT_FAINT; ctx.font = '400 13px Roboto'; ctx.fillText('workdey.work', 987, 342);
  ctx.textAlign = 'left';

  footer(ctx);
}

// ═══════════════════════════════════════════════════════════════════
// 7. EMPLOYER PITCH
// Layout: pill + headline, left card (cons), VS divider, right card (pros), bottom CTA
// ═══════════════════════════════════════════════════════════════════
async function drawEmployerPitch(ctx, d, bg) {
  await drawBg(ctx, bg); accentBar(ctx);
  pill(ctx, 60, 46, '📣  ATTENTION EMPLOYERS', ORANGE, '#1a1a1a');

  ctx.fillStyle = WHITE; ctx.font = 'bold 50px Roboto';
  ctx.fillText('Still Hiring via WhatsApp Groups?', 60, 146);

  // Left card — problem
  roundRect(ctx, 60, 172, 430, 228, 12);
  ctx.fillStyle = 'rgba(180,30,30,0.18)'; ctx.fill();
  ctx.strokeStyle = 'rgba(220,60,60,0.38)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#ff8a8a'; ctx.font = '800 14px Roboto';
  ctx.textAlign = 'center'; ctx.fillText('WHATSAPP GROUPS', 275, 200); ctx.textAlign = 'left';
  ['✗  Unverified candidates', '✗  No skill filtering', '✗  CVs lost in forwards', '✗  No pipeline tracking', '✗  Spam and fake applicants'].forEach((t, i) => {
    ctx.fillStyle = '#ffbbbb'; ctx.font = '400 17px Roboto';
    ctx.fillText(t, 82, 236 + i * 34);
  });

  // VS
  ctx.fillStyle = ORANGE; ctx.font = 'bold 30px Roboto';
  ctx.textAlign = 'center'; ctx.fillText('VS', 580, 292); ctx.textAlign = 'left';

  // Right card — solution
  roundRect(ctx, 710, 172, 430, 228, 12);
  ctx.fillStyle = 'rgba(10,133,8,0.18)'; ctx.fill();
  ctx.strokeStyle = 'rgba(10,133,8,0.38)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = TEXT_LIGHT; ctx.font = '800 14px Roboto';
  ctx.textAlign = 'center'; ctx.fillText('WORKDEY', 925, 200); ctx.textAlign = 'left';
  ['✓  Verified profiles + CVs', '✓  Skills filtering built in', '✓  Full pipeline dashboard', '✓  WhatsApp integrated', `✓  ${d.totalCos || 29}+ companies already use it`].forEach((t, i) => {
    ctx.fillStyle = TEXT_LIGHT; ctx.font = '400 17px Roboto';
    ctx.fillText(t, 732, 236 + i * 34);
  });

  // Bottom CTA
  ctx.fillStyle = TEXT_LIGHT; ctx.font = '400 20px Roboto';
  ctx.fillText('Post your first job ', 60, 438);
  const pw2 = ctx.measureText('Post your first job ').width;
  ctx.fillStyle = ORANGE; ctx.font = '800 20px Roboto';
  ctx.fillText('completely free', 60 + pw2, 438);
  const fw2 = ctx.measureText('completely free').width;
  ctx.fillStyle = TEXT_LIGHT; ctx.font = '400 20px Roboto';
  ctx.fillText('  →  workdey.work', 60 + pw2 + fw2, 438);

  // Stats bar
  card(ctx, 60, 464, 1080, 66, 10);
  const stats = [`${d.totalJobs || 43} active jobs`, `${d.totalCos || 29} employers`, `${d.weekApps || 19} applications this week`];
  stats.forEach((s, i) => {
    ctx.fillStyle = i % 2 === 0 ? ORANGE : WHITE;
    ctx.font = '700 18px Roboto';
    ctx.textAlign = 'center';
    ctx.fillText(s, 200 + i * 340, 503);
  });
  ctx.textAlign = 'left';

  footer(ctx);
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ENDPOINT
// ═══════════════════════════════════════════════════════════════════
const DRAW_FNS = {
  job_spotlight:    drawJobSpotlight,
  market_insight:   drawMarketInsight,
  seeker_tip:       drawSeekerTip,
  company_spotlight: drawCompanySpotlight,
  platform_stats:   drawPlatformStats,
  career_advice:    drawCareerAdvice,
  employer_pitch:   drawEmployerPitch,
};

app.post('/generate', async (req, res) => {
  const { post_type = 'platform_stats', data = {} } = req.body;
  try {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const bg = await fetchBg(post_type);
    const fn = DRAW_FNS[post_type] || drawPlatformStats;
    await fn(ctx, data, bg);
    const png = canvas.toBuffer('image/png');
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`WorkDey Image Server on :${PORT}`));
