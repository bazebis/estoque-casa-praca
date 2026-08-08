# Handoff do piloto v0.9.2

## Identificação

- Nome: Piloto de contagem de estoque — Casa da Praça.
- Versão encerrada: `v0.9.2`.
- Tag: `v0.9.2` — grade visual padronizada no XLSX piloto.
- Objetivo: validar um fluxo local e simples para registrar contagens por área, consolidar um fechamento e entregar os valores em uma cópia preenchida da planilha operacional.

## O que o piloto já faz

- importa um template de contagem sem embutir dados operacionais no app;
- permite configurar e contar áreas macro;
- registra várias quantidades com suas unidades e conversões;
- consolida as áreas e apresenta pendências antes do fechamento;
- salva e finaliza um snapshot congelado da contagem;
- exporta CSV para apoio operacional;
- preenche uma cópia de um modelo XLSX escolhido pelo usuário;
- padroniza no XLSX exportado a grade `G:H:I`, o cabeçalho `TOTAL` e sua borda destacada;
- oferece apoio ao envio manual, sem transmitir dados automaticamente.

## Fluxo operacional aprovado

1. Importar o template.
2. Configurar as áreas macro.
3. Contar por área.
4. Registrar quantidades e unidades.
5. Consolidar as contagens.
6. Salvar o fechamento.
7. Finalizar o ciclo.
8. Selecionar a planilha modelo e exportar o XLSX preenchido.
9. Abrir e conferir a planilha baixada.
10. Enviar manualmente pelo WhatsApp ou por outro meio aprovado.

Uma nova contagem só deve começar depois da conferência e finalização do ciclo anterior.

## Validação humana concluída

O teste do piloto confirmou que:

- os valores são preenchidos corretamente;
- o arquivo XLSX gerado abre normalmente;
- todos os blocos apresentam a grade visual `G:H:I`;
- a terceira coluna é apresentada como `TOTAL`;
- a borda do `TOTAL` tem destaque em relação às áreas;
- uma irregularidade de cabeçalho do modelo é corrigida somente na cópia exportada;
- o arquivo modelo original permanece inalterado.

## Dependências e execução

- Vite prepara a aplicação web.
- IndexedDB mantém os dados operacionais no navegador.
- LocalStorage é usado apenas como compatibilidade ou contingência prevista pelo app.
- `xlsx-js-style` lê, preenche e grava o XLSX piloto com a formatação mínima.
- A aplicação funciona como PWA local-first; a exportação e o envio de arquivos continuam sob controle do usuário.

## Armazenamento e privacidade

Contagens, configurações e fechamentos ficam no navegador do aparelho. Não há backend, conta de usuário ou sincronização entre celulares. Limpar dados do navegador, trocar de aparelho ou perder o dispositivo pode remover informações que não tenham sido exportadas.

A planilha modelo é processada em memória para gerar uma cópia. Ela não deve ser versionada, embutida no bundle público nem persistida pelo app. Templates, planilhas preenchidas, CSVs, JSONs operacionais e dados de contato devem permanecer fora do repositório.

## Limitações conhecidas

- não há sincronização ou resolução de conflitos entre dispositivos;
- não há autenticação, perfis de acesso ou trilha de auditoria de produção;
- backup e restauração ainda dependem de procedimento manual;
- unidades e conversões ainda precisam de revisão antes de uma adoção definitiva;
- a estrutura visual depende do modelo XLSX compatível selecionado pelo usuário;
- a preservação de estilos e configurações de impressão não é perfeita;
- o envio continua manual e não há integração com ERP, PDV ou API.

## O que não está pronto para produção

O piloto não deve ser tratado como sistema corporativo definitivo. Ainda faltam decisões sobre suporte, privacidade, instalação controlada, recuperação de dados, acesso, sincronização, integração e responsabilidade operacional. Também não está aprovada uma atualização de planilha, cardápio ou unidades.

## Critérios de encerramento

O piloto é considerado encerrado porque o fluxo completo foi executado sem alterar a lógica de contagem, o XLSX foi aprovado em teste humano e os limites de uso estão registrados. Qualquer evolução após `v0.9.2` deve começar por um novo planejamento, com prioridade e critérios de aceite próprios.
