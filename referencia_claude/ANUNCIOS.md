# Guia de Implementação de Anúncios - XSODOMA

## Espaços de anúncio implementados

O site tem 4 espaços de anúncio estrategicamente posicionados:

### 1. Anúncio Topo (ad-top)
- **Localização**: Entre o cabeçalho e os filtros
- **Formato desktop**: 728x90 (leaderboard)
- **Formato mobile**: 320x50 (mobile banner)
- **ID do elemento**: `ad-top`

### 2. Anúncio Inline (ad-inline)
- **Localização**: No meio da grade de vídeos (após o 6º vídeo)
- **Formato**: 300x250 (medium rectangle)
- **ID do elemento**: `ad-inline`

### 3. Anúncio Player (ad-player)
- **Localização**: Abaixo do player de vídeo no modal
- **Formato**: 300x250 (medium rectangle)
- **ID do elemento**: `ad-player`

### 4. Popunder (DESATIVADO por padrão)
- **Trigger**: Clique na grade de vídeos
- **Frequência**: Uma vez por sessão
- **Mobile**: Desabilitado
- **Status**: `POPUNDER_ATIVO = false` no script.js

## Como configurar os anúncios

### Passo 1: Escolher a rede de anúncios

Redes recomendadas para conteúdo adulto:
- **ExoClick** (mais popular para adulto)
- **TrafficJunky**
- **JuicyAds**
- **EroAdvertising**

### Passo 2: Inserir os scripts de anúncio

Após criar sua conta na rede escolhida, você receberá códigos JavaScript. Insira-os nos elementos corretos:

**Exemplo com ExoClick:**

```html
<!-- No index.html, substitua o conteúdo dos elementos ad-slot -->

<!-- Anúncio Topo -->
<div id="ad-top" class="ad-slot">
    <!-- Cole aqui o script da sua rede -->
    <script type="application/javascript">
        // Código fornecido pela rede
    </script>
</div>

<!-- Anúncio Player -->
<div id="ad-player" class="ad-slot">
    <!-- Cole aqui o script da sua rede -->
    <script type="application/javascript">
        // Código fornecido pela rede
    </script>
</div>
```

### Passo 3: Configurar o Popunder (OPCIONAL)

⚠️ **AVISO IMPORTANTE**: Popunders têm taxa de entrega baixa (30-50%) devido a:
- Bloqueadores de pop-up nativos do navegador
- AdBlock e extensões similares
- Restrições em iframes (onde o player roda)
- Má reputação das redes de popunder

Se mesmo assim quiser ativar:

1. Abra `script.js`
2. Localize a linha: `const POPUNDER_ATIVO = false;`
3. Altere para: `const POPUNDER_ATIVO = true;`
4. Cole a URL do popunder: `const POPUNDER_URL = 'https://sua-rede.com/pop/123456';`

## Compliance e Legal

### 1. Identificação de Publicidade (OBRIGATÓRIO)
✅ **Já implementado**: Todos os espaços têm o rótulo "Publicidade" visível.

❌ **NÃO REMOVA** este rótulo. É exigido por:
- CDC Art. 36 (Brasil)
- CONAR
- FTC Guidelines (EUA)
- GDPR (Europa)

### 2. Consentimento de Cookies (LGPD)

Antes de carregar scripts de anúncios, você DEVE pedir consentimento do usuário para cookies.

**Implementação necessária** (não incluída no código base):

```html
<!-- Adicione um banner de cookies ANTES de carregar anúncios -->
<div id="cookie-banner" style="display: none;">
    <p>Este site usa cookies para melhorar sua experiência e exibir anúncios personalizados.</p>
    <button id="accept-cookies">Aceitar</button>
    <button id="reject-cookies">Rejeitar</button>
</div>

<script>
// Só carregue os scripts de anúncio APÓS o usuário aceitar
if (!localStorage.getItem('cookies-accepted')) {
    document.getElementById('cookie-banner').style.display = 'block';
}

document.getElementById('accept-cookies').addEventListener('click', () => {
    localStorage.setItem('cookies-accepted', 'true');
    // AGORA SIM carregue os scripts de anúncio
    loadAds();
});
</script>
```

### 3. Verificação de Idade

Várias jurisdições exigem verificação de idade real para conteúdo adulto:

- **Reino Unido**: Age Verification obrigatória (BBFC)
- **França**: Verificação obrigatória
- **Alemanha**: Verificação obrigatória
- **EUA**: Recomendada (proteção legal)

**Soluções**:
- AgeChecker.net
- AVSecure
- Yoti
- Verificação por cartão de crédito

Implemente ANTES do lançamento público se tiver audiência nesses países.

## Alturas Reservadas e CLS

✅ **Já implementado**: Todos os espaços têm `min-height` definido.

Isso previne **Cumulative Layout Shift (CLS)**, uma métrica do Google que penaliza sites onde o conteúdo "pula" quando anúncios carregam.

**Não remova** as alturas mínimas dos elementos `.ad-slot` no CSS.

## Estimativas de Receita

### CPM Realista (conteúdo adulto):

| Formato | CPM Desktop | CPM Mobile |
|---------|-------------|------------|
| Banner 728x90 | $1-3 | $0.50-1.50 |
| Rectangle 300x250 | $2-5 | $1-3 |
| Popunder | $3-8* | $2-5* |

\* Considerando taxa de entrega de 30-50%

### Cálculo de exemplo:
- 10.000 pageviews/dia
- 4 impressões de banner por pageview = 40.000 impressões
- CPM médio de $2
- **Receita estimada**: $80/dia ou $2.400/mês

**Popunder adicional** (se ativado):
- 10.000 pageviews × 50% entrega = 5.000 impressões
- CPM de $5
- **Receita adicional**: $25/dia ou $750/mês

## Otimização de Performance

### O que está implementado:
✅ Lazy loading de imagens (`loading="lazy"`)
✅ Alturas reservadas (previne CLS)
✅ Anúncios não bloqueiam renderização inicial

### Recomendações adicionais:
1. Use CDN para servir o site (Cloudflare, BunnyCDN)
2. Ative compressão Gzip/Brotli
3. Minifique CSS e JS para produção
4. Configure cache headers corretos

## Suporte

Para dúvidas sobre implementação:
1. Consulte a documentação da sua rede de anúncios
2. Teste sempre com ferramentas de desenvolvedor abertas (F12)
3. Verifique o Console para erros de script
4. Use modo anônimo para testar sem cache

## Checklist Pré-Lançamento

- [ ] Conta criada na rede de anúncios
- [ ] Scripts colados nos elementos corretos
- [ ] Banner de consentimento de cookies implementado
- [ ] Verificação de idade implementada (se necessário)
- [ ] Testado em desktop
- [ ] Testado em mobile
- [ ] Verificado que rótulos "Publicidade" estão visíveis
- [ ] CLS verificado no Google PageSpeed Insights
- [ ] Popunder testado (se ativado)
