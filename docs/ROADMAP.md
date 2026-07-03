# Roadmap - Estoque Casa da Praça

## Estado atual

O app já possui:

- Vite + Vanilla JS modular.
- Interface mobile first.
- Catálogo com adicionar, editar, excluir e reordenar.
- Importação de catálogo por CSV.
- Backup JSON completo.
- Sistema de unidades padrão e personalizadas.
- Snapshot de unidades em entradas de contagem.
- Contagem acumulada com várias entradas por item.
- Rascunho protegido contra perda acidental.
- Histórico local de contagens finalizadas.
- Relatório final com copiar texto, WhatsApp e mostrar zerados.
- Persistência migrada para IndexedDB com fallback LocalStorage.

## Próximas etapas

1. PWA instalável/offline.
2. Exportações operacionais de contagem.
3. Camada abstrata de integração.
4. Payload padronizado de inventário/contagem.
5. Fila local de sincronização.
6. Integração futura com Yunes, se houver API ou formato de importação.
7. Capacitor para Android/iPhone.
8. Backend/sincronização multiaparelho, se necessário.

## Regras

- Não implementar backend sem necessidade.
- Não inventar API Yunes.
- Não quebrar modo offline.
- Não apagar dados locais sem confirmação.
- Não alterar relatórios antigos por mudanças futuras de unidade.
