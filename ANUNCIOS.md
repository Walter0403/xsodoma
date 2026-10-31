# Anúncios: o que dá para fazer, o que não dá

Este documento existe porque o pedido envolvia popunder, e popunder tem um
problema técnico que não é opinião. Leia a seção 1 antes de escolher a rede.

---

## 1. Popunder: o problema é técnico, não moral

Popunder é o anúncio que abre **atrás** da janela atual. O usuário só descobre
quando fecha a aba. Paga bem justamente porque é invasivo.

**Só que ele não funciona dentro de iframe.** A maior parte do tráfego de um
site como este vem do player — e o player é um `<iframe>` do Eporner. Dentro do
iframe, a política de origem cruzada do navegador bloqueia `window.open` sem
gesto do usuário. O popunder simplesmente não dispara ali.

Isso significa que, neste site, o popunder só funcionaria na navegação da grade,
nunca sobre o vídeo. E na grade ele enfrenta três coisas:

| Obstáculo | Efeito prático |
|---|---|
| Bloqueador de pop-up | Chrome/Safari bloqueiam `window.open` sem clique. Você perde a maior parte. |
| `target=_blank` sem gesto | Vira pop-up bloqueado e o usuário vê um aviso feio do navegador. |
| Adblock | Popunder é a primeira categoria de script bloqueada. |

Resultado realista: **CPM alto no papel, receita baixa na prática**, porque a
taxa de entrega é baixa e a de reclamação é alta. Você troca receita previsível
por uma fração de entrega.

Existe ainda o problema de negócio: as redes que aceitam popunder em conteúdo
adulto costumam ser as de menor reputação — as que pagam com atraso, aplicam
"ajuste de tráfego" no fim do mês, ou descontam por "tráfego inválido" sem
explicar. Vale checar reputação antes de assinar.

---

## 2. O que eu recomendo no lugar

Todos os formatos abaixo estão integrados no `demo.html` e não dependem de
pop-up. Ordem de retorno por esforço:

**Banner de topo (728x90 / 320x50 no celular).** Inventário mais fácil de
vender, entrega quase 100%, não incomoda. É o que já está no topo do acervo.

**Retângulo abaixo do player (300x250).** Depois do popunder, é o melhor CPM da
página. O usuário acabou de escolher o vídeo e está com atenção presa ali — é o
ponto de maior valor sem interromper nada.

**Retângulo no meio da grade (a cada ~6 cards).** Inventário adicional sem
empurrar o conteúdo. Integrado depois da 6ª caixa.

**Pré-roll em vídeos próprios.** Não se aplica aqui, porque o vídeo é embed de
terceiro. Só funcionaria se você hospedasse o arquivo.

Se ainda quiser insistir no popunder, o caminho menos pior é usá-lo apenas na
entrada da home, uma vez por sessão, com uma rede que faça isso no servidor
(interstitial de gateway) em vez de `window.open` no cliente. Ainda assim,
conte com 30–50% de bloqueio.

---

## 3. O que está no código

Quatro espaços reservados, todos com rótulo "Publicidade" e `aria-label`:

| Slot | Onde | Tamanho | `data-slot` |
|---|---|---|---|
| topo | acima do acervo | 728x90 / 320x50 | `topo` |
| grade | depois da 6ª caixa | responsivo | `grade` |
| player | abaixo do iframe | 300x250 | `player` |

Cada um tem altura mínima reservada. Isso não é preciosismo: se o anúncio entra
depois e o espaço não estava reservado, o conteúdo pula e o Google mede isso
como CLS. Página que sacode perde posição na busca.

### Como ligar sua rede

Troque o parágrafo `.anuncio__vazio` pelo script da rede, mantendo o rótulo:

```html
<aside class="anuncio anuncio--faixa" aria-label="Publicidade">
  <span class="anuncio__rotulo">Publicidade</span>
  <!-- cole aqui o script da rede -->
  <script async src="https://sua-rede.example/ad.js"
          data-zone="12345"></script>
</aside>
```

No slot da grade, o anúncio é criado por JavaScript dentro de
`criarAnuncioNaGrade()`. Se a rede exigir um `<div>` com id fixo, adicione ali.

### O rótulo "Publicidade" não é opcional

No Brasil, o CDC (art. 36) exige que a publicidade seja identificável como tal,
e o CONAR trata publicidade não identificada como enganosa. Esconder o rótulo
para "melhorar a experiência" é exatamente a prática que gera autuação. Deixe
visível, com contraste suficiente para ser lido.

---

## 4. Antes de ligar a monetização

Dois pontos que costumam aparecer só depois, quando já é caro corrigir.

**Consentimento e LGPD.** Anúncio comportamental usa cookie de terceiro. Isso
exige base legal e, na prática, um banner de consentimento antes de carregar o
script da rede — não depois. Carregar o script e pedir consentimento em seguida
já vazou o dado. Redes sérias oferecem modo de consentimento (o Google chama de
Consent Mode); use.

**Verificação de idade.** O site exibe conteúdo adulto, então precisa de
verificação antes de servir a página — não um "você tem 18 anos?" com botão de
sim. Vários estados dos EUA e países da UE já exigem verificação real, e a
responsabilidade recai sobre quem publica. Rede de anúncio alguma paga bem em
site adulto sem isso, e as que pagam pior são as que não perguntam.

---

## 5. O que eu não verifiquei

Não executei nada disso em navegador: o ambiente Linux do meu lado continua
fora por falta de espaço em disco, e o preview não renderiza rede externa. As
alturas reservadas e o comportamento responsivo seguem o padrão da indústria,
mas não foram medidos na tela. Se algo quebrar, me manda o erro do console.
