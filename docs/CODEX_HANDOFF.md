# Codex Handoff - Estoque Casa da Praça

Projeto: `/home/d99/Documents/estoque-casa-praca`

## Stack

- Vite
- Vanilla JS
- CSS puro
- IndexedDB
- Fallback LocalStorage
- Sem React
- Sem backend
- Sem dependências desnecessárias

## Estado funcional

O app é uma ferramenta local de contagem de estoque para a Casa da Praça.

Funcionalidades atuais:

- Catálogo:
  - adicionar item
  - editar item
  - excluir item
  - reordenar item
  - importar CSV
  - backup JSON

- Unidades:
  - unidades padrão
  - unidades personalizadas
  - conversões
  - unidades inativas
  - snapshot em entradas

- Contagem:
  - várias entradas por item
  - voltar/próximo
  - remover entrada
  - rascunho salvo
  - proteção contra perda acidental
  - finalização

- Histórico:
  - contagens finalizadas salvas
  - abrir relatório antigo
  - copiar relatório
  - enviar WhatsApp

- Persistência:
  - IndexedDB
  - migração de LocalStorage
  - fallback seguro

## Cuidados

- Não confundir rascunho com contagem finalizada.
- Não apagar histórico ao iniciar nova contagem.
- Não recalcular relatório antigo com unidade editada depois.
- Não mexer em várias áreas ao mesmo tempo.
- Uma etapa por prompt.
- Rodar `npm run build` após cada etapa.
