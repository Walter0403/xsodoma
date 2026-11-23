const fs = require('fs');

const SITE_URL = 'https://x-sodoma.com';
const catalog = JSON.parse(fs.readFileSync('functions/data/catalog.json', 'utf8'));

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function slugify(text) {
  return String(text || 'video')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'video';
}

let videoXml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
`;

for (const v of catalog) {
  const vSlug = slugify(v.title);
  const loc = `${SITE_URL}/video/${v.id}/${vSlug}`;
  const rawThumb = (v.default_thumb && v.default_thumb.src) || `${SITE_URL}/favicon.png`;
  const thumbLoc = rawThumb.startsWith('http')
    ? `${SITE_URL}/api/thumb?url=${encodeURIComponent(rawThumb)}`
    : rawThumb;
  const desc = `Assista ao vídeo "${escapeXml(v.title)}" em Full HD 4K no XSodoma. O melhor conteúdo adulto com streaming rápido e gratuito.`;
  const embed = v.embed || `https://www.eporner.com/embed/${v.id}/`;
  const duration = v.length_sec || 300;
  const views = v.views || 1000;
  const pubDate = v.added ? (v.added.includes('T') ? v.added.split('T')[0] : v.added) : '2024-01-01';

  videoXml += `  <url>
    <loc>${loc}</loc>
    <video:video>
      <video:thumbnail_loc>${escapeXml(thumbLoc)}</video:thumbnail_loc>
      <video:title>${escapeXml(v.title)}</video:title>
      <video:description>${escapeXml(desc)}</video:description>
      <video:player_loc allow_embed="yes">${escapeXml(embed)}</video:player_loc>
      <video:duration>${duration}</video:duration>
      <video:rating>4.8</video:rating>
      <video:view_count>${views}</video:view_count>
      <video:publication_date>${pubDate}</video:publication_date>
      <video:family_friendly>no</video:family_friendly>
    </video:video>
  </url>
`;
}

videoXml += `</urlset>\n`;

fs.writeFileSync('sitemap-videos.xml', videoXml, 'utf8');
fs.writeFileSync('dist/sitemap-videos.xml', videoXml, 'utf8');
console.log('sitemap-videos.xml gerado com', catalog.length, 'vídeos com thumbnails reais!');
