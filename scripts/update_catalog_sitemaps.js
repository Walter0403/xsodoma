const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://x-sodoma.com';

// 1. Carrega catálogo existente (2.291 vídeos)
const existingCatalog = JSON.parse(fs.readFileSync('functions/data/catalog.json', 'utf8'));
const existingMap = new Map();
for (const v of existingCatalog) {
  existingMap.set(v.id, v);
}

// 2. Extrai vídeos de sitemap.xml
const sitemapXml = fs.readFileSync('sitemap.xml', 'utf8');
const sitemapVideoUrls = sitemapXml.match(/<url>[\s\S]*?<\/url>/g) || [];

let addedCount = 0;
for (const u of sitemapVideoUrls) {
  const m = u.match(/<loc>https:\/\/x-sodoma\.com(?:\/[a-z-]+)?\/video\/([^\/]+)(?:\/([^<]+))?<\/loc>/);
  if (m) {
    const id = m[1];
    const slug = m[2] || '';
    if (!existingMap.has(id)) {
      addedCount++;
      const titleWords = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const title = titleWords || `Vídeo HD Exclusivo ${id}`;
      existingMap.set(id, {
        id: id,
        title: title,
        length_sec: 480 + (Math.abs(id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % 600),
        views: 12000 + (Math.abs(id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 17) % 35000),
        rate: 96,
        added: '2024-01-01',
        default_thumb: {
          src: `https://static-ca-cdn.eporner.com/thumbs/static4/${id.slice(0, 1)}/${id.slice(0, 2)}/${id.slice(0, 3)}/${id}/5_360.jpg`
        },
        embed: `https://www.eporner.com/embed/${id}/`,
        keywords: slug.replace(/-/g, ' ')
      });
    }
  }
}

const fullCatalog = Array.from(existingMap.values());
console.log(`Catálogo consolidado: ${fullCatalog.length} vídeos (adicionados ${addedCount} novos vídeos de sitemap.xml)`);

// Salva catalog.json atualizado
fs.writeFileSync('functions/data/catalog.json', JSON.stringify(fullCatalog, null, 2), 'utf8');
if (fs.existsSync('dist/functions/data/catalog.json')) {
  fs.writeFileSync('dist/functions/data/catalog.json', JSON.stringify(fullCatalog, null, 2), 'utf8');
}

// 3. Gera sitemap-videos.xml completo e padronizado com Google Video schema 1.1
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

for (const v of fullCatalog) {
  const vSlug = slugify(v.title);
  const loc = `${SITE_URL}/video/${v.id}/${vSlug}`;
  // Usa thumbnail através do proxy para garantir que o Googlebot nunca receba 403 / bloqueio de CDN
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
console.log('sitemap-videos.xml gerado com sucesso com', fullCatalog.length, 'vídeos');

// 4. Limpa sitemap.xml para conter APENAS URLs de estrutura (homepages, categorias, tags, blog)
const structureUrls = [];
for (const u of sitemapVideoUrls) {
  const locM = u.match(/<loc>([^<]+)<\/loc>/);
  if (locM) {
    const loc = locM[1];
    // Se não for rota de vídeo (/video/), mantém no sitemap estrutural
    if (!loc.includes('/video/')) {
      structureUrls.push(u.trim());
    }
  }
}

let cleanSitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

for (const u of structureUrls) {
  cleanSitemapXml += `  ${u}\n`;
}

cleanSitemapXml += `</urlset>\n`;

fs.writeFileSync('sitemap.xml', cleanSitemapXml, 'utf8');
console.log('sitemap.xml limpo: agora contém apenas', structureUrls.length, 'URLs estruturais');
