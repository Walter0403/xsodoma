# Integrando a Eporner API v2 no xSodoma

Arquivos entregues:

```
eporner-api.js   cliente da API v2 (search, id, removed), sem dependências
demo.html        página de teste isolada — abre e funciona sozinha
INTEGRACAO.md    este guia
```

Comece pelo `demo.html`. Ele responde a pergunta que decide toda a arquitetura:
**o navegador consegue chamar a API do Eporner direto?**

---

## 1. O problema do CORS, explicado

A API do Eporner é `GET` simples, mas não publica política de CORS na
documentação. Se o seu `index.html` está em `file://` ou num domínio diferente
de `eporner.com`, o navegador só deixa a resposta passar se o servidor do
Eporner mandar `Access-Control-Allow-Origin`.

Isso tem três desfechos possíveis:

| Situação | O que o `demo.html` mostra | O que você faz |
|---|---|---|
| CORS liberado | Faixa verde "Acesso direto funcionou" | Usa o cliente sem proxy. Pronto. |
| CORS bloqueado | Faixa vermelha com "CORS" no detalhe | Precisa de proxy (§3). Obrigatório. |
| `file://` | Muitas vezes bloqueado também, por origem `null` | Rode um servidor local (§2). |

**Rode o teste antes de mexer no `app.js`.** Se você integrar tudo primeiro e
descobrir o CORS no fim, vai ter que refatorar cada chamada.

### 2. Servindo localmente para testar

Não abra o `demo.html` com duplo clique. Origem `file://` gera falsos
negativos. Suba um servidor na pasta:

```bash
# Python
python -m http.server 8080

# ou Node
npx serve -l 8080
```

Depois acesse `http://localhost:8080/demo.html`.

Se aparecer a faixa verde, o acesso direto está liberado e você pode seguir
direto para §4.

---

## 3. O proxy (se o CORS bloquear)

O proxy é um endpoint no seu servidor que faz a busca no lugar do navegador.
Servidor não tem CORS — a restrição é do navegador.

O contrato é o que o `eporner-api.js` já espera: o cliente manda a URL completa
da API codificada como parâmetro, e o proxy devolve o corpo como veio.

### Node / Express

```js
// npm i express
const express = require('express');
const app = express();

const ALLOWED_PREFIX = 'https://www.eporner.com/api/v2/';

app.get('/api/eporner', async (req, res) => {
  const target = req.query.url;

  // Allowlist obrigatória. Sem isso você acabou de construir um proxy aberto,
  // e alguém vai usar seu servidor para varrer a rede interna.
  if (typeof target !== 'string' || !target.startsWith(ALLOWED_PREFIX)) {
    return res.status(400).json({ error: 'url não permitida' });
  }

  try {
    const upstream = await fetch(target, {
      headers: { Accept: 'application/json, text/plain, */*' },
      signal: AbortSignal.timeout(15000)
    });
    const body = await upstream.text();

    res.status(upstream.status);
    res.set('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.set('Cache-Control', 'public, max-age=60');
    res.send(body);
  } catch (err) {
    res.status(502).json({ error: 'falha ao consultar o upstream' });
  }
});

app.listen(3000);
```

### PHP

```php
<?php
// api/eporner.php
$allowed = 'https://www.eporner.com/api/v2/';
$target  = $_GET['url'] ?? '';

if (!is_string($target) || strpos($target, $allowed) !== 0) {
    http_response_code(400);
    exit(json_encode(['error' => 'url não permitida']));
}

$ctx  = stream_context_create(['http' => ['timeout' => 15, 'ignore_errors' => true]]);
$body = @file_get_contents($target, false, $ctx);

if ($body === false) {
    http_response_code(502);
    exit(json_encode(['error' => 'falha ao consultar o upstream']));
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=60');
echo $body;
```

Depois, uma linha no cliente antes de qualquer chamada:

```js
EpornerApi.configure({ proxy: '/api/eporner?url=' });
```

### Por que o proxy é a escolha melhor, mesmo quando o CORS funciona

Além de resolver o CORS de vez, ele te dá três coisas que você vai querer:
cache no servidor (economiza chamadas repetidas), esconder o domínio de origem
do navegador, e a possibilidade de aplicar rate limit no seu lado. Também é o
único caminho se você quiser usar a API `removed`, que devolve vários megabytes.

---

## 4. Ligando no `app.js` do xSodoma

Adicione o script antes do seu `app.js`, no `index.html`:

```html
<script src="eporner-api.js"></script>
<script src="js/app.js"></script>
```

Se estiver usando proxy, configure logo no topo do `app.js`:

```js
EpornerApi.configure({
  proxy: '/api/eporner?url=',   // remova esta linha se o acesso direto funcionar
  thumbsize: 'medium',
  perPage: 24
});
```

### Renderizar os vídeos

O ponto de atenção aqui é segurança: `title` e `keywords` vêm de fonte externa.
Use `textContent`, nunca `innerHTML`. A função abaixo monta os cards inteiramente
por DOM — nenhum dado de fora é interpretado como HTML.

```js
function cardDoVideo(v) {
  const card = document.createElement('article');
  card.className = 'video-card';

  const img = document.createElement('img');
  img.src = v.thumb?.src ?? '';
  img.alt = '';
  img.loading = 'lazy';
  img.referrerPolicy = 'no-referrer';
  img.onerror = () => { img.style.visibility = 'hidden'; };

  const titulo = document.createElement('h3');
  titulo.textContent = v.title;                 // textContent, não innerHTML

  const info = document.createElement('p');
  info.className = 'video-meta';
  info.textContent =
    `${EpornerApi.formatDuration(v.lengthSec)} · ` +
    `${EpornerApi.formatViews(v.views)} · ★ ${EpornerApi.formatRate(v.rate)}`;

  card.append(img, titulo, info);
  card.addEventListener('click', () => abrirVideo(v));
  return card;
}

async function carregar(pagina = 1) {
  const grade = document.querySelector('#grade');
  grade.replaceChildren();

  try {
    const res = await EpornerApi.search({
      query: termoAtual || 'all',
      page: pagina,
      order: 'latest'
    });

    res.videos.forEach(v => grade.appendChild(cardDoVideo(v)));
    atualizarPaginacao(res);          // res.page, res.totalPages, res.hasNext
  } catch (err) {
    console.error('[xsodoma]', err.kind, err.message);
    mostrarErro(err.kind === 'network'
      ? 'Não foi possível falar com a API. Verifique o proxy.'
      : 'Erro ao carregar a lista.');
  }
}
```

### Player

O campo `embed` já é uma URL de iframe pronta:

```js
function abrirVideo(v) {
  const frame = document.querySelector('#player');
  frame.src = v.embed;
  document.querySelector('#overlay').hidden = false;
}

function fecharVideo() {
  document.querySelector('#player').src = '';   // sem isso o vídeo segue tocando
  document.querySelector('#overlay').hidden = true;
}
```

---

## 5. Referência rápida do cliente

```js
// Busca — devolve { page, perPage, totalCount, totalPages, hasPrev, hasNext, videos[] }
await EpornerApi.search({
  query: 'all',        // termo de busca; 'all' traz tudo
  page: 1,
  perPage: 24,         // 1..1000
  thumbsize: 'medium', // small (190x152) | medium (427x240) | big (640x360)
  order: 'latest',     // latest | longest | shortest | top-rated |
                       // most-popular | top-weekly | top-monthly
  gay: 0,              // 0 = exclui | 1 = inclui | 2 = só gay
  lq: 1                // 0 = exclui baixa qualidade | 1 = inclui | 2 = só lq
});

// Detalhe — devolve o vídeo ou null se foi removido
await EpornerApi.getById('IsabYDAiqXa');

// Ainda está no ar?
await EpornerApi.isAlive('IsabYDAiqXa');   // true | false

// Todos os IDs removidos (uma chamada, vários MB — prefira via proxy)
const removidos = await EpornerApi.getRemovedSet();   // Set
if (removidos.has(v.id)) { /* marcar como morto */ }

// Utilitários
EpornerApi.formatViews(260221);         // "260,2 mil views"
EpornerApi.formatDuration(2539);        // "42:19"
EpornerApi.thumbAtSize(v, 'big');       // troca a thumb sem nova chamada
EpornerApi.clearCache();
```

Cada vídeo normalizado tem: `id`, `title`, `keywords[]`, `views`, `rate`,
`url`, `embed`, `added`, `addedDate` (Date ou null), `lengthSec`, `lengthMin`,
`thumb`, `thumbs[]`.

### Tratamento de erro

Os erros vêm como `EpornerError` com um campo `kind`:

| `kind` | Significado | O que fazer |
|---|---|---|
| `network` | CORS, DNS, offline | Configure o proxy |
| `timeout` | Passou de `timeoutMs` (20s) | Tente de novo |
| `http` | Status 4xx/5xx (tem `.status`) | Mostre o erro; 5xx costuma ser temporário |
| `parse` | Resposta não era JSON | Provável bloqueio de rede intermediária |
| `config` | Parâmetro inválido seu | Bug de chamada |

---

## 6. Detalhes que costumam morder

**Vídeo sem data.** A API devolve `added: "1970-01-01 01:00:00"` para vídeos com
data desconhecida. O cliente já converte isso para `addedDate: null` — trate
como "data desconhecida" em vez de mostrar 1970.

**`id` é case-sensitive, 11 caracteres.** Guarde como string, nunca como número.

**`getRemoved` é pesado.** São vários megabytes numa chamada só. Use `format:
'txt'` (uns 60% menor), chame via proxy e cacheie no servidor, tipo uma vez por
dia.

**Paginação tem teto.** `per_page` no máximo 1000 e `total_pages` tende a
estourar em 10000. Não tente varrer o catálogo inteiro em loop; trabalhe com
busca e ordenação.

**Thumbs são hotlink do CDN do Eporner.** O cliente já põe
`referrerPolicy="no-referrer"`, que evita problemas com bloqueio por referer em
alguns CDNs.

**Cache de 60s no cliente.** Voltar uma página não refaz a chamada. Se você
precisar de dados frescos, `EpornerApi.clearCache()`.

---

## 7. Antes de colocar no ar

Sendo direto, porque isso evita problema sério depois: se o site é público e
hospeda conteúdo adulto de terceiros, você está no papel de distribuidor, não de
espectador. Na prática isso significa verificação de idade real antes de servir
o conteúdo, registro do consentimento/verificação dos performers nos materiais
que exibe, e um canal de denúncia e remoção que funcione de verdade. Vale olhar
as exigências de verificação de idade do seu país ou estado antes do lançamento
— nos EUA, por exemplo, vários estados têm leis ativas sobre isso, e a
responsabilidade costuma recair sobre quem publica, não sobre a fonte.

Deliberadamente não escrevi nada voltado a destacar conteúdo que possa
sexualizar menores — nem na busca, nem nos filtros, nem em sugestões. Se em
algum momento for adicionar moderação, o caminho é bloquear por tag e revisar
título, e o `getRemovedSet()` ajuda: sempre que um ID aparece como removido,
tire o card do ar.

---

## 8. O que eu não consegui verificar

Preciso ser claro sobre os limites do que testei. O ambiente Linux onde eu rodo
comandos está com falha de inicialização por falta de espaço em disco, então:

- **Não executei o `eporner-api.js`** — a sintaxe não foi checada por nenhum
  linter nem runtime. Se der erro, me diga a mensagem e eu corrijo.
- **Não consegui abrir o `tubelocal_pasta.zip`.** Só vi os nomes dos arquivos
  por dentro (`README.md`, `index.html`, `css/style.css`, `js/app.js`). Não sei
  como o `app.js` está estruturado, se há CSS existente para casar com os cards,
  nem que nomes de classe/id a sua página já usa. O código em §4 é um ponto de
  partida genérico — precisa de adaptação a esses nomes.
- **Não testei CORS contra o Eporner de verdade.** O host está fora da allowlist
  de rede do meu ambiente. Essa é justamente a pergunta que o `demo.html`
  responde na sua máquina.

Se você me mandar os quatro arquivos soltos (`.js`, `.html`, `.css`, `.md`, não
em zip) eles entram direto no meu contexto mesmo com o ambiente quebrado, e aí eu
consigo escrever a integração já casada com o seu código. Também vale liberar
espaço em disco e abrir sessão nova para eu conseguir rodar e testar.
