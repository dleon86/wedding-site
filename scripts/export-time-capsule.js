require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

const sql = neon(process.env.DATABASE_URL);

const BACKUP_DIR = path.join(__dirname, '..', 'backup');
const PHOTOS_DIR = path.join(BACKUP_DIR, 'photos');

// Download an image, save to disk, and return base64 data URI
async function downloadImage(url, entryId, photoIndex) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'image/jpeg';

    // Determine file extension from content type
    const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' }[contentType] || '.jpg';
    const filename = `entry-${entryId}-photo-${photoIndex}${ext}`;
    fs.writeFileSync(path.join(PHOTOS_DIR, filename), buffer);

    const base64 = buffer.toString('base64');
    return { dataUri: `data:${contentType};base64,${base64}`, filename };
  } catch (err) {
    console.error(`  Failed to download: ${url} — ${err.message}`);
    return null;
  }
}

async function main() {
  // Create backup directories
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });

  console.log('Fetching all guestbook entries...\n');

  const entries = await sql`
    SELECT id, name, note, photos, created_at, approved
    FROM guestbook_entries
    ORDER BY created_at ASC
  `;

  console.log(`Found ${entries.length} entries.\n`);

  // Download all images — save raw files AND collect base64
  let totalPhotos = 0;
  for (const entry of entries) {
    if (entry.photos && entry.photos.length > 0) {
      const embedded = [];
      for (let i = 0; i < entry.photos.length; i++) {
        totalPhotos++;
        process.stdout.write(`  Downloading photo ${totalPhotos} (entry #${entry.id})...`);
        const result = await downloadImage(entry.photos[i], entry.id, i + 1);
        if (result) {
          embedded.push(result.dataUri);
          console.log(` saved as ${result.filename}`);
        } else {
          console.log(' FAILED');
        }
      }
      entry.embeddedPhotos = embedded;
    } else {
      entry.embeddedPhotos = [];
    }
  }

  console.log(`\nDownloaded ${totalPhotos} photos to backup/photos/`);

  // Also save raw data as JSON
  const jsonData = entries.map(e => ({
    id: e.id, name: e.name, note: e.note, approved: e.approved,
    created_at: e.created_at, photo_urls: e.photos || [],
  }));
  const jsonPath = path.join(BACKUP_DIR, 'guestbook-data.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), 'utf-8');
  console.log(`Raw data saved to: ${jsonPath}`);

  // Generate HTML files
  console.log('\nGenerating HTML files...');

  const cleanEntries = entries.slice(3); // skip first 3 test entries
  const publicEntries = entries.filter(e => e.approved);
  const cleanPublicEntries = cleanEntries.filter(e => e.approved);

  const variants = [
    { file: 'time-capsule-full-with-tests.html',  data: entries,             title: 'Wedding Guestbook — Complete Archive (incl. test posts)' },
    { file: 'time-capsule-public-with-tests.html', data: publicEntries,       title: 'Wedding Guestbook — Public (incl. test posts)' },
    { file: 'time-capsule-full.html',              data: cleanEntries,        title: 'Wedding Guestbook — Complete Archive' },
    { file: 'time-capsule-public.html',            data: cleanPublicEntries,  title: 'Wedding Guestbook' },
  ];

  for (const v of variants) {
    const html = buildHTML(v.data, v.title);
    const outPath = path.join(BACKUP_DIR, v.file);
    fs.writeFileSync(outPath, html, 'utf-8');
  }

  console.log(`\n--- Backup Summary ---`);
  for (const v of variants) {
    const outPath = path.join(BACKUP_DIR, v.file);
    const size = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
    console.log(`  ${v.file.padEnd(42)} — ${v.data.length} entries (${size} MB)`);
  }
  console.log(`  ${'guestbook-data.json'.padEnd(42)} — raw database export`);
  console.log(`  ${'photos/'.padEnd(42)} — ${totalPhotos} image files`);
  console.log(`\nDone! Your physical backup is in the backup/ folder.`);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function renderEntry(entry) {
  const photos = entry.embeddedPhotos.map(src =>
    `<img src="${src}" class="entry-photo" onclick="openLightbox(this.src)" />`
  ).join('');

  return `
    <div class="entry">
      <div class="entry-header">
        <h3 class="entry-name">${escapeHtml(entry.name)}</h3>
        <time class="entry-date">${formatDate(entry.created_at)}</time>
      </div>
      <p class="entry-note">${escapeHtml(entry.note)}</p>
      ${photos ? `<div class="entry-photos">${photos}</div>` : ''}
    </div>`;
}

function buildHTML(allEntries, title) {
  const entriesHTML = allEntries.map(renderEntry).join('\n');
  const exportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      background: #faf8f5;
      color: #3a3330;
      line-height: 1.7;
      padding: 2rem 1rem;
    }

    .container { max-width: 800px; margin: 0 auto; }

    header {
      text-align: center;
      padding: 3rem 1rem 2rem;
      border-bottom: 1px solid #e0d5c8;
      margin-bottom: 2rem;
    }

    header h1 {
      font-size: 2.4rem;
      font-weight: 400;
      letter-spacing: 0.04em;
      color: #5c4a3a;
      margin-bottom: 0.4rem;
    }

    header .subtitle {
      font-style: italic;
      color: #8a7a6c;
      font-size: 1.05rem;
    }

    .stats {
      display: flex;
      justify-content: center;
      gap: 2rem;
      margin-top: 1.2rem;
      font-size: 0.9rem;
      color: #8a7a6c;
    }

    .stats span { font-weight: 600; color: #5c4a3a; }

    /* Section headings */
    .section-heading {
      text-align: center;
      font-size: 1.3rem;
      font-weight: 400;
      color: #5c4a3a;
      margin: 2.5rem 0 1.5rem;
      letter-spacing: 0.05em;
    }

    .section-heading::before,
    .section-heading::after {
      content: ' — ';
      color: #c4b5a4;
    }

    /* Entries */
    .entry {
      background: #fff;
      border: 1px solid #e8e0d6;
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1.2rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }

    .entry-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .entry-name {
      font-size: 1.15rem;
      font-weight: 600;
      color: #4a3c32;
    }

    .entry-date {
      font-size: 0.8rem;
      color: #a09080;
      font-style: italic;
    }

    .entry-note {
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .entry-photos {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
      margin-top: 1rem;
    }

    .entry-photo {
      width: 180px;
      height: 180px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid #e0d5c8;
      cursor: pointer;
      transition: transform 0.15s;
    }

    .entry-photo:hover { transform: scale(1.03); }

    /* Lightbox */
    .lightbox {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.85);
      z-index: 1000;
      justify-content: center;
      align-items: center;
      cursor: pointer;
    }

    .lightbox.active { display: flex; }

    .lightbox img {
      max-width: 92vw;
      max-height: 92vh;
      border-radius: 4px;
      box-shadow: 0 4px 30px rgba(0,0,0,0.4);
    }

    /* Footer */
    footer {
      text-align: center;
      margin-top: 3rem;
      padding: 2rem 1rem;
      border-top: 1px solid #e0d5c8;
      color: #a09080;
      font-size: 0.85rem;
      font-style: italic;
    }

    @media (max-width: 600px) {
      header h1 { font-size: 1.6rem; }
      .entry-photo { width: 120px; height: 120px; }
      .stats { flex-direction: column; gap: 0.3rem; }
    }

    @media print {
      .lightbox { display: none !important; }
      .entry { break-inside: avoid; }
      .entry-photo { width: 140px; height: 140px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Wedding Guestbook</h1>
      <p class="subtitle">A Time Capsule of Love &amp; Well Wishes</p>
      <div class="stats">
        <div><span>${allEntries.length}</span> messages</div>
        <div><span>${allEntries.reduce((n, e) => n + e.embeddedPhotos.length, 0)}</span> photos</div>
      </div>
    </header>

    <h2 class="section-heading">Messages</h2>
    ${entriesHTML}

    <footer>
      Archived on ${exportDate}<br>
      Made with love.
    </footer>
  </div>

  <div class="lightbox" id="lightbox" onclick="closeLightbox()">
    <img id="lightbox-img" src="" alt="Full size photo" />
  </div>

  <script>
    function openLightbox(src) {
      document.getElementById('lightbox-img').src = src;
      document.getElementById('lightbox').classList.add('active');
    }
    function closeLightbox() {
      document.getElementById('lightbox').classList.remove('active');
    }
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeLightbox();
    });
  </script>
</body>
</html>`;
}

main().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});
