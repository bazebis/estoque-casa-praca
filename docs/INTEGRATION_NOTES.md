# Notas de Integração Futura

## Objetivo

Preparar o app para futuramente integrar contagens de estoque com sistemas externos, possivelmente Yunes, sem depender da API existir agora.

## Premissas

- Não há documentação pública confirmada da API Yunes neste projeto.
- Não inventar endpoints.
- Não fazer chamadas reais sem documentação.
- O app deve continuar útil mesmo sem integração externa.

## Estratégia

Criar uma camada abstrata de integração.

Possíveis saídas:

1. Relatório textual.
2. CSV de contagem.
3. JSON padronizado.
4. Fila local de sincronização.
5. API externa futura.

## Dados desejáveis nos produtos

- id local
- external_id opcional
- nome
- código interno opcional
- código de barras opcional
- unidade base
- unidade padrão
- ativo
- timestamps

## Payload padronizado de contagem

Uma contagem finalizada deve poder gerar:

- id da sessão
- data/hora de início
- data/hora de fim
- status
- itens contados
- entradas por item
- totais convertidos
- unidade base
- origem: app local
- status de sincronização

## Estrutura futura sugerida

src/integrations/
├── integrationPayload.js
├── syncQueue.js
├── adapters/
│   ├── mockIntegrationAdapter.js
│   ├── csvExportAdapter.js
│   └── futureYunesApiAdapter.js

## Regras

- Não implementar API real sem documentação.
- Primeiro implementar exportação CSV/JSON padronizada.
- Depois fila de sincronização.
- Depois adapter mock.
- Depois adapter real, se houver API.
