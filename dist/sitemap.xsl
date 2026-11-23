<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0" 
                xmlns:html="http://www.w3.org/TR/REC-html40"
                xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
                xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"
                xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR">
      <head>
        <title>XSodoma — Mapa do Site XML</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0c0a09; color: #f5f5f4; margin: 0; padding: 24px; }
          .container { max-width: 1100px; margin: 0 auto; background: #1c1917; border: 1px solid #292524; border-radius: 12px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
          h1 { font-size: 22px; color: #eab308; margin-top: 0; display: flex; align-items: center; gap: 10px; }
          p { font-size: 13.5px; color: #a8a29e; line-height: 1.5; }
          table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 13px; }
          th { background: #292524; color: #f59e0b; text-align: left; padding: 10px 12px; font-weight: 700; border-bottom: 2px solid #44403c; }
          td { padding: 9px 12px; border-bottom: 1px solid #292524; word-break: break-all; }
          tr:hover td { background: #262322; }
          a { color: #38bdf8; text-decoration: none; }
          a:hover { text-decoration: underline; color: #7dd3fc; }
          .badge { background: #eab308; color: #000; font-size: 11px; font-weight: 800; padding: 2px 7px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1><span>👑</span> XSodoma — Mapa do Site XML (Google Indexing)</h1>
          <p>Este arquivo XML foi gerado para os motores de busca (Google, Bing, IndexNow) para indexação programática e rápida de páginas e vídeos do <strong>x-sodoma.com</strong>.</p>
          <xsl:if test="sitemap:sitemapindex">
            <table>
              <thead>
                <tr>
                  <th>Sitemap</th>
                  <th>Última Modificação</th>
                </tr>
              </thead>
              <tbody>
                <xsl:for-each select="sitemap:sitemapindex/sitemap:sitemap">
                  <tr>
                    <td><a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a></td>
                    <td><xsl:value-of select="sitemap:lastmod"/></td>
                  </tr>
                </xsl:for-each>
              </tbody>
            </table>
          </xsl:if>
          <xsl:if test="sitemap:urlset">
            <table>
              <thead>
                <tr>
                  <th style="width: 60%;">URL da Página</th>
                  <th>Prioridade</th>
                  <th>Frequência</th>
                </tr>
              </thead>
              <tbody>
                <xsl:for-each select="sitemap:urlset/sitemap:url[position() &lt;= 250]">
                  <tr>
                    <td><a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a></td>
                    <td><span class="badge"><xsl:value-of select="sitemap:priority"/></span></td>
                    <td><xsl:value-of select="sitemap:changefreq"/></td>
                  </tr>
                </xsl:for-each>
              </tbody>
            </table>
          </xsl:if>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>

