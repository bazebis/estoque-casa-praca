# Plano Técnico — Contagem por Localização Física

## 1. Objetivo

Evoluir o app de uma contagem baseada na ordem global do catálogo para uma contagem guiada pela estrutura física do restaurante.

O usuário deverá navegar por uma árvore como:

```text
Cozinha
└── Geladeira 4 portas
    ├── Prateleira 1
    └── Prateleira 2

Bar
└── Freezer cervejeiro
    ├── Lado esquerdo
    └── Lado direito
```

Ao selecionar uma localização terminal, o app deve abrir uma sessão contendo somente os itens vinculados àquele local, na ordem operacional configurada. O fluxo atual de entradas acumuladas, unidades, navegação, rascunho e finalização deve ser reaproveitado.

O desenho deve preservar estes princípios:

- funcionamento local-first e offline;
- compatibilidade com catálogo, rascunhos, histórico e backups existentes;
- snapshots para impedir que alterações futuras modifiquem contagens antigas;
- separação entre domínio, persistência, interface e adapters de integração;
- ausência de suposições sobre o CSV empresarial enquanto o arquivo real não estiver disponível.

## 2. Modelo de dados proposto

### 2.1 `locationNodes`

`locationNodes` representa a árvore física. O relacionamento é feito por lista de adjacência: cada nó guarda o `parentId` do pai.

```js
{
    id: "location_uuid",
    parentId: null,
    name: "Cozinha",
    type: "room",
    order: 0,
    active: true,
    externalId: null,
    createdAt: "2026-08-04T12:00:00.000Z",
    updatedAt: "2026-08-04T12:00:00.000Z"
}
```

Regras propostas:

- `id` é estável e gerado localmente; renomear ou mover um local não troca seu ID.
- `parentId: null` identifica um nó raiz.
- `order` vale entre irmãos do mesmo `parentId`, não na árvore inteira.
- `active: false` oculta o local de novas contagens sem apagar referências históricas.
- `externalId` permanece opcional até existir identificador confiável no CSV ou ERP.
- um nó não pode ser pai de si mesmo nem de um de seus descendentes;
- pais inexistentes, ciclos e IDs duplicados devem ser rejeitados na normalização;
- inicialmente, somente nós terminais devem receber itens e iniciar contagem;
- adicionar um filho a um nó que já possui itens deve exigir que os vínculos sejam movidos ou uma confirmação explícita.

Os tipos ajudam a interface e a integração, mas não devem impor uma hierarquia rígida. A estrutura física real pode conter níveis não previstos.

### 2.2 Tipos de localização

Tipos aceitos na primeira versão:

| Tipo | Uso esperado |
|---|---|
| `room` | Cômodo ou área principal, como Cozinha, Bar ou Estoque |
| `equipment` | Equipamento físico, como geladeira, freezer ou armário |
| `shelf` | Prateleira ou nível interno de um equipamento |
| `section` | Divisão operacional, como lado esquerdo, gaveta ou compartimento |
| `custom` | Estrutura que não se encaixa nos tipos anteriores |

Regras de interface sugeridas:

- mostrar rótulos traduzidos, mantendo os valores técnicos estáveis;
- permitir `custom` em qualquer nível;
- permitir equipamento como nó terminal, por exemplo `Freezer horizontal 1`;
- tratar o tipo como metadado, sem assumir que toda árvore precisa conter todos os níveis.

### 2.3 `itemLocationLinks`

`itemLocationLinks` representa a relação muitos-para-muitos entre catálogo e localização.

```js
{
    id: "location_uuid:item_uuid",
    locationId: "location_uuid",
    itemId: "item_uuid",
    order: 0,
    createdAt: "2026-08-04T12:00:00.000Z",
    updatedAt: "2026-08-04T12:00:00.000Z"
}
```

Regras propostas:

- a combinação `locationId + itemId` deve ser única;
- o mesmo item pode estar em várias localizações;
- `order` define a sequência dentro da localização e não altera `catalogItem.order`;
- vínculos para itens ou locais inexistentes devem ser marcados como órfãos e não usados silenciosamente;
- itens inativos no catálogo ou locais inativos não entram em novas sessões;
- excluir um item do catálogo deve tratar seus vínculos de forma explícita;
- substituir catálogo por CSV não deve tentar religar itens apenas pelo nome sem confirmação.

Não se recomenda adicionar `locationId` diretamente ao item do catálogo. Isso impediria que o mesmo produto aparecesse em mais de um local e misturaria a identidade do produto com sua posição física.

### 2.4 `countSessions` por localização

Cada sessão deve representar a contagem de uma localização terminal. Uma futura rodada geral poderá agrupar várias sessões usando `countRunId`, sem ser necessária na primeira entrega.

```js
{
    id: "count_session_uuid",
    version: 2,
    status: "em_andamento",
    countRunId: null,
    locationId: "location_uuid",
    locationSnapshot: {
        id: "location_uuid",
        name: "Prateleira 1",
        type: "shelf",
        path: [
            { id: "room_uuid", name: "Cozinha", type: "room" },
            { id: "equipment_uuid", name: "Geladeira 4 portas", type: "equipment" },
            { id: "location_uuid", name: "Prateleira 1", type: "shelf" }
        ],
        pathLabel: "Cozinha > Geladeira 4 portas > Prateleira 1"
    },
    startedAt: "2026-08-04T12:00:00.000Z",
    updatedAt: "2026-08-04T12:05:00.000Z",
    finishedAt: null,
    currentIndex: 0,
    countLines: [],
    entriesByLineId: {}
}
```

Cada linha da sessão deve copiar os dados necessários do catálogo e do vínculo:

```js
{
    lineId: "item_location_link_id",
    itemId: "item_uuid",
    itemSnapshot: {
        id: "item_uuid",
        name: "COCA",
        unitId: "fardo_6"
    },
    locationLinkSnapshot: {
        id: "item_location_link_id",
        order: 0
    }
}
```

Usar `lineId` em vez de depender somente de `itemId` evita colisões se uma futura rodada reunir o mesmo item em mais de uma localização.

Compatibilidade:

- rascunhos versão 1 continuam sendo normalizados como contagem geral do catálogo;
- o primeiro incremento pode continuar permitindo apenas um rascunho ativo global;
- suporte a vários rascunhos simultâneos ou a uma rodada multi-local deve ser uma decisão posterior de produto;
- uma sessão finalizada é copiada para o histórico antes de o rascunho ser removido.

## 3. Reaproveitamento do catálogo atual

O catálogo continua sendo a fonte canônica dos produtos. Sua estrutura atual não precisa receber a árvore física.

O fluxo deve ser:

1. carregar os itens do catálogo;
2. carregar os vínculos da localização selecionada;
3. ignorar vínculos órfãos e itens inativos, emitindo aviso administrativo;
4. ordenar pelos `itemLocationLinks.order`;
5. criar snapshots das linhas da sessão;
6. iniciar a contagem com essa lista preparada.

A ordem global `catalogItem.order` continua útil para:

- administração geral do catálogo;
- compatibilidade com o fluxo legado;
- ordem inicial ao vincular vários itens a um local;
- itens ainda não organizados por localização.

Importações de catálogo devem preservar IDs existentes sempre que houver um identificador confiável. Enquanto só houver nome e unidade, substituições completas precisam avisar que podem deixar vínculos órfãos.

## 4. Reaproveitamento da contagem acumulada

O motor atual já oferece os comportamentos essenciais:

- várias entradas por item;
- snapshot de unidade e fator de conversão;
- soma convertida para unidade base;
- remoção de entrada;
- voltar e avançar;
- posição atual;
- rascunho persistido;
- finalização em resumos.

Essas regras devem permanecer independentes de localização. A mudança principal é a origem da lista de linhas:

```text
Hoje: catálogo ativo em ordem global
Depois: vínculos ativos do local em ordem operacional
```

O módulo de localização prepara `countLines`; o módulo de contagem apenas percorre essas linhas. A interface deve mostrar o caminho do local durante toda a sessão para reduzir o risco de o usuário contar no equipamento errado.

Ao normalizar sessões antigas, o código precisa aceitar tanto `items + entriesByItemId` quanto `countLines + entriesByLineId` durante a transição.

## 5. Histórico com localização

Uma entrada finalizada deve guardar, além dos campos atuais:

```js
{
    scope: {
        type: "location",
        locationId: "location_uuid"
    },
    locationSnapshot: {},
    countLines: [],
    entriesByLineId: {}
}
```

Regras:

- o histórico nunca deve consultar o nome ou caminho atual para reconstruir uma contagem antiga;
- renomear, mover, desativar ou excluir um local não altera `locationSnapshot`;
- históricos versão 1 recebem `scope.type: "catalog"` durante a normalização;
- a lista do histórico deve mostrar data, status, quantidade de itens e caminho do local;
- filtros futuros podem usar `locationSnapshot.id` e os IDs presentes no caminho;
- se houver uma rodada geral futura, cada sessão mantém sua localização e a rodada agrega seus IDs.

O relatório textual pode inicialmente incluir uma linha de localização no cabeçalho. A forma definitiva de agrupamento deve acompanhar as regras do CSV real e a decisão sobre contagem independente versus rodada geral.

## 6. Exportação operacional com localização

O payload interno deve evoluir de forma aditiva, mantendo a separação entre modelo de domínio e formato externo.

Estrutura sugerida:

```js
{
    type: "stock_count",
    schemaVersion: 2,
    countId: "count_session_uuid",
    countRunId: null,
    scope: {
        type: "location",
        location: {
            id: "location_uuid",
            externalId: null,
            name: "Prateleira 1",
            type: "shelf",
            pathLabel: "Cozinha > Geladeira 4 portas > Prateleira 1",
            path: []
        }
    },
    items: []
}
```

Cada item exportado deve poder informar:

- `lineId`;
- `itemId` e futuro `externalId` do produto;
- localização terminal;
- caminho físico completo;
- ordem operacional;
- entradas originais com snapshot de unidade;
- total convertido e unidade base.

No CSV operacional genérico, a localização poderá virar colunas adicionais como `location_id`, `location_type`, `location_name` e `location_path`. Essa alteração deve ser tratada como schema novo e não como reprodução do CSV empresarial.

O adapter definitivo precisa decidir, com base no arquivo real, se haverá uma linha por entrada, por item/local ou por total consolidado.

## 7. Importação CSV futura e grupos físicos

A importação do CSV real deve possuir um adapter separado do importador simples de catálogo existente.

O adapter deverá reconhecer qual das estruturas abaixo é usada:

- uma coluna por nível, como `comodo`, `equipamento`, `prateleira` e `secao`;
- um único caminho, como `Cozinha > Geladeira > Prateleira 1`;
- códigos de localização independentes dos nomes;
- linhas de cabeçalho/grupo seguidas pelos produtos do grupo;
- ordem das linhas como única indicação da sequência física;
- colunas explícitas de nível e posição.

O resultado da análise deve ser intermediário e revisável:

```js
{
    locationCandidates: [],
    itemCandidates: [],
    linkCandidates: [],
    warnings: [],
    unmappedRows: []
}
```

Antes da confirmação, a UI deve mostrar:

- locais que serão criados, atualizados ou reutilizados;
- produtos reconhecidos e não reconhecidos;
- vínculos e ordens resultantes;
- duplicidades e ambiguidades;
- unidades desconhecidas;
- linhas ignoradas.

Nenhum agrupamento deve ser inferido permanentemente apenas pela aparência visual do CSV sem uma regra confirmada.

## 8. Exportação CSV futura no formato original

Para reproduzir estruturalmente o arquivo empresarial, o adapter deverá capturar um perfil de formato durante a análise:

```js
{
    delimiter: ";",
    encoding: "utf-8",
    hasBom: true,
    lineEnding: "crlf",
    headers: [],
    columnMappings: {},
    groupingStrategy: "columns",
    decimalSeparator: ",",
    staticColumns: {},
    passthroughColumns: []
}
```

O exportador específico deverá usar esse perfil para preservar, quando necessário:

- nomes e ordem das colunas;
- separador, encoding, BOM e quebra de linha;
- convenção decimal;
- códigos e nomes de produto/local;
- linhas ou colunas de agrupamento;
- colunas fixas exigidas pelo destino;
- ordem operacional dos locais e itens;
- nome esperado do arquivo.

O objetivo deve ser compatibilidade estrutural e semântica, não igualdade byte a byte, pois datas e quantidades mudam entre arquivos.

Campos desconhecidos que precisem sobreviver a um ciclo de importação/exportação podem exigir metadados de passthrough. Essa necessidade só pode ser confirmada com o CSV real e o sistema consumidor.

## 9. Persistência, migração e backup

Mudanças previstas:

- incrementar a versão do IndexedDB;
- criar stores `locationNodes`, `itemLocationLinks` e, se aprovado, `countSessions`;
- criar chaves equivalentes para o fallback LocalStorage;
- adicionar migração separada da migração legada já concluída;
- atualizar backup para schema 2;
- incluir locais, vínculos e regras explícitas para rascunhos;
- continuar aceitando backups schema 1;
- impedir que `replace-all` deixe dados de localização antigos misturados com os importados.

Não é necessário criar localizações automaticamente para usuários atuais. Enquanto não houver árvore configurada, o fluxo legado pode continuar disponível. Uma migração opcional posterior poderá criar um local `Catálogo geral` e vincular os itens na ordem atual.

## 10. Riscos

- ciclos, nós órfãos ou ordens inconsistentes na árvore;
- exclusão de local referenciado por rascunho ou histórico;
- vínculos órfãos após substituir ou excluir itens do catálogo;
- dupla contagem quando o mesmo item existe em vários locais;
- ambiguidade entre total por local e total consolidado por produto;
- incompatibilidade entre rascunhos versão 1 e sessões versão 2;
- colisão de `itemId` ao reunir várias localizações em uma rodada;
- perda de dados durante upgrade do IndexedDB ou fallback para LocalStorage;
- backup schema 2 não restaurar todas as novas stores de forma atômica;
- aumento de acoplamento se administração e navegação forem adicionadas diretamente ao `ui.js` e `main.js` atuais;
- divergência entre ordem global do catálogo e ordem por localização;
- inferência errada da hierarquia ao analisar o CSV;
- exportação com unidade, agregação ou separador incompatível com o sistema consumidor;
- crescimento de payloads e backups por duplicação de snapshots;
- vários rascunhos concorrentes sem uma política clara;
- mudanças de local durante uma sessão ativa confundirem o usuário, mesmo com o histórico protegido por snapshot.

Mitigações principais:

- módulos pequenos e separados para domínio, storage, UI e adapters;
- validação pura da árvore antes de persistir;
- snapshots de item, unidade, vínculo e caminho físico;
- versionamento explícito de banco, backup, sessão e payload;
- testes de caracterização e migração antes de alterar a interface;
- preview obrigatório para importações destrutivas;
- soft delete/desativação para locais já utilizados;
- adapters específicos em vez de regras de CSV dentro do domínio.

## 11. Etapas incrementais de implementação

### Etapa 0 — Baseline e contratos

- adicionar testes de caracterização para catálogo, contagem, histórico, backup e payload;
- documentar os schemas versão 1;
- centralizar ou relacionar as versões de banco, sessão, backup e integração.

### Etapa 1 — Domínio puro de localização

- criar funções de normalização de `locationNodes` e `itemLocationLinks`;
- montar árvore e caminho completo;
- validar ciclos, órfãos, duplicidades e ordem;
- testar sem alterar banco ou interface.

### Etapa 2 — Persistência

- criar stores e fallback LocalStorage;
- implementar load/save/replace de locais e vínculos;
- testar migração e falha do IndexedDB;
- manter o fluxo atual inalterado.

### Etapa 3 — Backup schema 2

- exportar e restaurar locais e vínculos;
- manter compatibilidade com schema 1;
- corrigir a política de rascunho e `replace-all`.

### Etapa 4 — Administração da árvore

- criar módulo de UI próprio para locais;
- adicionar, editar, mover, reordenar e desativar nós;
- impedir operações que criem ciclos ou perda silenciosa de vínculos.

### Etapa 5 — Administração de vínculos

- vincular e desvincular itens;
- reordenar itens dentro de cada localização;
- listar itens sem local e vínculos órfãos;
- preservar a ordem global do catálogo.

### Etapa 6 — Navegação operacional

- exibir árvore mobile first;
- mostrar caminho, quantidade de itens e estado do local;
- permitir iniciar contagem apenas em localização terminal válida.

### Etapa 7 — Sessão por localização

- evoluir o schema da sessão;
- preparar `countLines` pelos vínculos;
- adaptar o motor acumulado para `lineId`;
- preservar normalização de rascunhos antigos;
- mostrar o caminho durante a contagem.

### Etapa 8 — Histórico e relatório

- persistir `locationSnapshot`;
- mostrar e filtrar histórico por local;
- incluir localização no relatório sem recalcular históricos anteriores.

### Etapa 9 — Payload interno versão 2

- adicionar escopo e caminho físico;
- preservar entradas e totais por linha/local;
- manter adapter genérico separado do formato empresarial.

### Etapa 10 — Adapter do CSV real

- analisar amostras reais;
- implementar mapeamento, preview e validação;
- reproduzir o formato exigido em um exportador específico;
- criar testes com fixtures anonimizadas representativas.

### Etapa 11 — Integração ERP/API futura

- definir identificadores externos e idempotência;
- implementar fila local somente quando houver destino documentado;
- criar adapter de transporte separado;
- manter contagens úteis e exportáveis mesmo sem conexão.

## 12. O que deve esperar pelo CSV real

Não implementar definitivamente antes de receber o arquivo:

- nomes, ordem e obrigatoriedade das colunas;
- separador, encoding, BOM e quebra de linha;
- estratégia de agrupamento físico;
- quantidade e significado dos níveis de localização;
- códigos externos de produto, unidade, local e estabelecimento;
- regra de identificação e unicidade de produtos;
- regra de identificação e unicidade de localizações;
- forma de representar item presente em vários locais;
- origem da ordem operacional;
- unidade esperada no arquivo e fatores de conversão aceitos;
- separador decimal, arredondamento e casas decimais;
- significado de vazio, zero e valores negativos;
- uma linha por entrada, item/local ou total consolidado;
- tratamento de itens zerados e não contados;
- agregação por local, produto, depósito ou restaurante;
- linhas de subtotal, cabeçalhos de grupo e rodapés;
- campos de sessão, responsável, data/hora e timezone;
- colunas fixas ou desconhecidas que precisam ser preservadas;
- convenção de nome do arquivo;
- regras de erro, duplicidade, reimportação e idempotência;
- qualquer endpoint, autenticação ou comportamento de API/ERP.

Antes da implementação do adapter definitivo, são necessários pelo menos um CSV real anonimizado, a identificação do sistema consumidor e exemplos de casos com item repetido, local sem subdivisão, quantidade zero, quantidade decimal e unidade convertida.
