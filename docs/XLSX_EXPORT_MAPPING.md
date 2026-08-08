# Mapeamento para exportação XLSX

## Objetivo

Definir como um fechamento de contagem já finalizado alimenta uma cópia da planilha oficial no exportador piloto. O arquivo modelo é selecionado manualmente no detalhe do fechamento, validado e processado somente em memória no navegador.

## Fonte de dados

A origem é o snapshot congelado da consolidação, não o estado vivo da contagem. O snapshot precisa:

- estar finalizado;
- identificar o template e as sessões incluídas;
- conter itens, áreas, quantidades convertidas, totais e unidades base;
- preservar status e pendências da consolidação.

O template oficial local é apenas uma fonte de estrutura em ambiente controlado. Ele não deve ser importado pela PWA, copiado para o bundle ou versionado.

O piloto não persiste o arquivo selecionado, não altera o original e não usa o estado vivo da contagem para recalcular valores.

## Estrutura esperada da planilha

A estrutura confirmada possui uma aba operacional, uma linha introdutória de título/data e blocos ordenados de grupos e itens.

| Coluna | Papel |
| --- | --- |
| A | Código nas linhas de item. |
| B | Grupo na linha de cabeçalho; nome nas linhas de item. |
| G:H | Quantidades por área, com significado definido pelo cabeçalho de cada grupo. |
| I | Total, somente quando declarado no cabeçalho do grupo. |

As colunas de área são contextuais. O exportador futuro não pode assumir uma coluna global por área: ele deve ler cada cabeçalho de grupo e aplicar o mapa encontrado somente às linhas daquele bloco.

Áreas canônicas previstas:

- `BAR`
- `ESTOQUE`
- `EMPORIO`
- `SALÃO`
- `COZINHA`
- `GELADEIRA LATICÍNIOS`

Variações de caixa, espaços e acentuação podem ser normalizadas para comparação. O texto oficial do template deve ser preservado.

## Regra de preenchimento

### Identidade e ordem

- A planilha é a autoridade para a ordem física dos 18 grupos e 270 itens.
- O código normalizado é a chave de correspondência do item.
- Nome e grupo são verificações auxiliares; não devem servir para correspondência aproximada automática.
- Linhas de grupo, linhas vazias e itens existentes não devem ser inseridos, removidos ou reordenados.
- Códigos devem ser tratados como identificadores textuais para evitar perda de zeros ou precisão.

### Grupo, código e item

- A coluna `B` já contém o nome do grupo na linha estrutural; o snapshot apenas valida esse valor.
- A coluna `A` contém o código na linha de item.
- A coluna `B` contém o nome do item na linha de item.
- Um exportador não deve sobrescrever códigos, nomes ou grupos durante o preenchimento de quantidades.

### Áreas e total

- O valor de uma área vem da célula correspondente em `item.areas`.
- O destino é descoberto pelo cabeçalho do grupo, normalmente em `G` ou `H`.
- O total vem de `item.total` e só pode ir para `I` quando o grupo declara `TOTAL`.
- Sem coluna `TOTAL`, o grupo de uma única área só é aceito quando o total congelado coincide com essa área.
- Uma área sem coluna naquele grupo não pode ser redirecionada para outra área.
- Antes de aceitar o total, o plano deve confirmar que nenhuma quantidade ficou fora das colunas representáveis pelo grupo.

### Unidade base

- Usar a quantidade decimal já convertida e congelada no snapshot.
- Escrever futuramente um valor numérico, sem concatenar o nome da unidade.
- Exigir consistência entre a unidade do item, das células por área e do total.
- Como a planilha não declara unidade por item, a equivalência entre a unidade base do app e a unidade esperada pelo processo operacional precisa de validação própria.

### Ausência, pendência e parcial

- Sem lançamento significa célula vazia, não zero.
- Pendência sem conversão mantém a célula e o total vazios e bloqueia o plano.
- Valor parcial não deve ser escrito como valor definitivo; a célula e o total ficam vazios e o plano é bloqueado.
- Um snapshot finalizado com avisos pode ser mapeado para diagnóstico, mas não é exportável segundo a política conservadora atual.
- Item existente na planilha e ausente no snapshot gera aviso se suas quantidades estiverem vazias; se já houver quantidade, gera bloqueio para evitar carregar valor estranho ao fechamento.
- Item existente no snapshot e ausente na planilha não cria nova linha e gera bloqueio.

## Algoritmo do exportador piloto

1. Recusar snapshots não finalizados ou estruturalmente inválidos.
2. Abrir uma cópia do template e identificar de modo inequívoco a aba operacional.
3. Ler as linhas na ordem física e separar cabeçalhos de grupo, itens e linhas vazias.
4. Para cada grupo, construir um mapa normalizado de área para coluna a partir dos cabeçalhos contextuais.
5. Indexar as linhas de item por código normalizado e rejeitar duplicidades.
6. Cruzar cada item do snapshot com uma única linha da planilha.
7. Validar nome, grupo, unidade base, áreas, status e pendências.
8. Criar em memória um plano de células candidatas antes de mutar o workbook carregado.
9. Classificar problemas em bloqueios e avisos.
10. Somente com plano sem bloqueios, aplicar quantidades numéricas à cópia em memória e iniciar o download de um novo arquivo.

O plano intermediário deve ser audível. Cada operação precisa informar linha, coluna, área, origem do valor e estado da validação, sem persistir dados reais no código-fonte.

## Tratamento de divergências

São bloqueios:

- aba operacional ausente ou ambígua;
- snapshot não finalizado;
- código ausente ou duplicado;
- item do snapshot sem linha correspondente;
- linha sem item no snapshot quando já contém quantidade;
- área com lançamento sem coluna no grupo;
- pendência ou valor parcial;
- unidade base ausente ou inconsistente.

São avisos que exigem decisão antes da exportação:

- linha vazia de quantidade sem item correspondente no snapshot;
- nome ou grupo diferente para o mesmo código;
- grupo sem coluna de total;
- célula de data ainda não definida;
- diferenças de apresentação que a biblioteca não consiga preservar com fidelidade.

## Limitações

- Não há coluna de unidade, status ou pendência no layout atual.
- O total não é calculado por fórmula no template inspecionado.
- Nem todos os grupos declaram as mesmas áreas.
- Pelo menos um grupo não declara coluna de total; o piloto permite esse caso apenas quando existe uma única área representada e registra aviso.
- A leitura disponível não comprova preservação completa de estilos em uma escrita futura.
- A biblioteca pode não preservar todos os detalhes visuais ou de impressão do arquivo original.

## Formatação mínima do XLSX piloto

O fluxo XLSX usa `xlsx-js-style` somente no módulo carregado sob demanda para aplicar bordas finas pretas aos cabeçalhos de área, às células de quantidade e ao `TOTAL` declarado em cada grupo. Estilos já disponíveis no objeto da célula são mantidos; apenas as quatro laterais de `border` são definidas pelo piloto.

Essa formatação básica melhora a leitura das tabelas, mas não garante preservação perfeita de todos os estilos, configurações de impressão ou particularidades visuais do arquivo modelo.

## Decisões pendentes

1. Confirmar a unidade operacional esperada para cada item.
2. Definir a célula de data.
3. Decidir se divergências de nome/grupo devem sempre bloquear.
4. Definir critérios de comparação visual e estrutural para a cópia baixada.

## Riscos

- Fixar `G` ou `H` globalmente para uma área gravaria valores em colunas erradas.
- Converter códigos para número pode destruir a identidade do item.
- Preencher ausência com zero esconderia itens não contados.
- Gravar subtotal parcial como total produziria fechamento enganoso.
- Usar o total do snapshot quando existe área não representada no grupo criaria inconsistência.
- Regravar o workbook sem teste de fidelidade pode perder detalhes visuais ou de impressão.
