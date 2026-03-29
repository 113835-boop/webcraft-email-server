const express = require('express');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY || 're_b2LHxtsg_HqPH7oxz846kEaR6o6MEyZra');
const app    = express();

app.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-WC-Secret');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '50mb' }));

/* ══════════════════════════════════════════════════════════════
   SITE STORE
   publishedSites[subdomain] = {
     name, slug, pages: { '/home': '<html>...', '/pages/contact': '...' }
   }
══════════════════════════════════════════════════════════════ */
const publishedSites = {};
const previewPages   = {};  /* local preview: previewPages[projectId][slug] = html */

/* ──────────────────────────────────────────────────────────────
   SUBDOMAIN ROUTING
   If request comes in with Host: slimtech.brickks.com
   serve the published site for subdomain "slimtech"
────────────────────────────────────────────────────────────── */
app.use(function (req, res, next) {
  const host      = req.headers.host || '';
  const rootDomain = process.env.ROOT_DOMAIN || 'brickks.com';

  /* check if it's a subdomain request e.g. slimtech.brickks.com */
  if (host.endsWith('.' + rootDomain)) {
    const subdomain = host.replace('.' + rootDomain, '');
    const site      = publishedSites[subdomain];

    if (!site) {
      return res.status(404).send(errorPage(
        '404 — Website not found',
        `<strong>${subdomain}.${rootDomain}</strong> hasn't been published yet.`
      ));
    }

    /* determine which page to serve */
    const slug = req.path === '/' ? '/home' : req.path;
    const html = site.pages[slug];

    if (!html) {
      /* try /home as fallback */
      const home = site.pages['/home'];
      if (home) return res.redirect('/');
      return res.status(404).send(errorPage('404', 'Page not found: ' + slug));
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }

  next();
});

/* ══════════════════════════════════════════════════════════════
   PUBLISH endpoint — WebCraft calls this when you click Publish
   Body: { subdomain, name, pages: { slug: html } }
══════════════════════════════════════════════════════════════ */
app.post('/publish', (req, res) => {
  const { subdomain, name, pages } = req.body;

  if (!subdomain || !name || !pages) {
    return res.status(400).json({ ok: false, error: 'Missing subdomain, name or pages' });
  }

  /* sanitize subdomain: lowercase, alphanumeric + hyphens only */
  const clean = subdomain.toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/^-+|-+$/g, '');
  if (!clean) return res.status(400).json({ ok: false, error: 'Invalid subdomain' });

  publishedSites[clean] = { name, pages, publishedAt: new Date().toISOString() };

  const rootDomain = process.env.ROOT_DOMAIN || 'brickks.com';
  const url        = `https://${clean}.${rootDomain}`;

  console.log(`🚀 Published: ${name} → ${url} (${Object.keys(pages).length} pages)`);
  res.json({ ok: true, url, subdomain: clean });
});

/* List all published sites */
app.get('/published', (req, res) => {
  const rootDomain = process.env.ROOT_DOMAIN || 'brickks.com';
  const list = Object.entries(publishedSites).map(([sub, site]) => ({
    subdomain: sub,
    name:      site.name,
    url:       `https://${sub}.${rootDomain}`,
    pages:     Object.keys(site.pages),
    publishedAt: site.publishedAt
  }));
  res.json(list);
});

/* ══════════════════════════════════════════════════════════════
   LOCAL PREVIEW — same as before
══════════════════════════════════════════════════════════════ */
app.post('/push-page', (req, res) => {
  const { projectId, slug, html } = req.body;
  if (!projectId || !slug || !html)
    return res.status(400).json({ ok: false, error: 'Missing fields' });
  if (!previewPages[projectId]) previewPages[projectId] = {};
  previewPages[projectId][slug] = html;
  res.json({ ok: true, url: `http://localhost:3001/preview/${projectId}${slug}` });
});

app.use('/preview', (req, res) => {
  const parts     = req.path.split('/').filter(Boolean);
  const projectId = parts[0];
  const slug      = '/' + parts.slice(1).join('/');
  const project   = previewPages[projectId];
  if (!project)
    return res.status(404).send(errorPage('Project not found', projectId));
  const html = project[slug] || project['/home'];
  if (!html)
    return res.status(404).send(errorPage('Page not found', slug + ' (available: ' + Object.keys(project).join(', ') + ')'));
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

/* ══════════════════════════════════════════════════════════════
   EMAIL
══════════════════════════════════════════════════════════════ */
app.get('/', (req, res) => res.send(`
  <h2>WebCraft Server ✅</h2>
  <p>Email + Preview + Publish</p>
  <p>Published sites: ${Object.keys(publishedSites).length}</p>
`));

app.post('/contact', async (req, res) => {
  const { to, senderEmail, message } = req.body;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!to || !senderEmail || !message)
    return res.status(400).json({ ok: false, error: 'Ontbrekende velden' });
  if (!emailRegex.test(to) || !emailRegex.test(senderEmail))
    return res.status(400).json({ ok: false, error: 'Ongeldig e-mailadres' });
  try {
    const { error } = await resend.emails.send({
      from:     'WebCraft Leads <info@brickksapp.com>',
      to:       [to],
      reply_to: senderEmail,
      subject:  '📩 Nieuw lead via contactformulier',
      html: `<div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#f9f9f9;border-radius:12px;">
        <h2 style="margin:0 0 8px;color:#111;">Nieuw bericht via het contactformulier</h2>
        <div style="background:#fff;border-radius:8px;padding:20px;border:1px solid #e5e7eb;">
          <p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-transform:uppercase;">Van</p>
          <p style="margin:0 0 20px;font-size:15px;color:#111;">${senderEmail}</p>
          <p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-transform:uppercase;">Bericht</p>
          <p style="margin:0;font-size:15px;color:#111;line-height:1.6;">${message.replace(/\n/g,'<br/>')}</p>
        </div>
      </div>`,
      text: `Van: ${senderEmail}\n\n${message}`,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('Resend error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

function errorPage(title, msg) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <style>body{font-family:Inter,sans-serif;background:#0d0d10;color:#e4e4ee;
    display:flex;align-items:center;justify-content:center;height:100vh;margin:0;
    flex-direction:column;gap:12px;text-align:center;padding:32px;}
    h2{color:#f87171;font-size:24px;} p{color:#6b6b80;font-size:14px;max-width:400px;}</style>
    </head><body><h2>${title}</h2><p>${msg}</p></body></html>`;
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ WebCraft server on http://localhost:${PORT}`);
  console.log(`   📄 Preview:  http://localhost:${PORT}/preview/{id}/{slug}`);
  console.log(`   🚀 Publish:  POST http://localhost:${PORT}/publish`);
  console.log(`   🌐 Live:     {subdomain}.brickks.com`);
});
