# Próximo planejamento após o piloto v0.9.2

## Ponto de partida

O piloto comprovou o ciclo local de contagem, consolidação, fechamento e exportação XLSX. A aprovação não inicia automaticamente uma fase de produção. A próxima etapa deve escolher um problema prioritário, definir usuários, riscos e critérios de aceite antes de alterar o app.

## Decisões adiadas

- público e quantidade de aparelhos da próxima fase;
- nova planilha ou cardápio operacional;
- revisão das unidades e conversões;
- política de privacidade e visibilidade do repositório;
- necessidade real de autenticação e perfis;
- estratégia de backup, restauração e retenção;
- sincronização entre aparelhos e tratamento de conflitos;
- forma de integração com ERP ou PDV;
- responsável por suporte, treinamento e conferência dos fechamentos.

## O que reaproveitar

- domínio de contagem por área e registro de entradas;
- conversões e snapshots congelados, após revisão das unidades;
- consolidação, pendências e bloqueios de segurança;
- fechamento e finalização do ciclo;
- validação estrutural e plano auditável de exportação;
- seleção local do modelo e geração da cópia XLSX;
- arquitetura local-first e carregamento sob demanda do exportador.

## O que não deve virar premissa definitiva

- envio exclusivamente manual;
- dependência permanente de uma planilha selecionada pelo usuário;
- grade `G:H:I` como formato universal de integração;
- armazenamento somente em um navegador;
- ausência de autenticação e auditoria;
- adaptações visuais específicas do modelo do piloto.

Esses elementos podem continuar úteis como fallback, mas devem ser reavaliados quando o destino definitivo estiver conhecido.

## Relação com ERP e PDV

Uma integração direta pode substituir parte da exportação manual, desde que o sistema definitivo ofereça documentação, credenciais, ambiente de teste e identificadores estáveis de itens e unidades. Antes disso, não se deve inventar endpoints nem assumir que o XLSX corresponde ao formato de importação do ERP/PDV.

O próximo planejamento deve comparar três caminhos: continuar com arquivo conferido manualmente, gerar um formato oficial de importação ou enviar dados por API. Mesmo com integração direta, convém preservar uma exportação legível para auditoria e contingência.

## Blocos candidatos

Nenhum bloco abaixo está iniciado ou priorizado:

1. Interface de demonstração mais simples e orientada.
2. Revisão de unidades e conversões operacionais.
3. Nova planilha ou cardápio enxuto.
4. Instalação controlada em poucos celulares.
5. Privacidade dos dados e possível repositório privado.
6. Sincronização e integração com API, ERP ou PDV.
7. Autenticação e controle de acesso.
8. Operação multi-dispositivo e resolução de conflitos.
9. Backup, exportação e importação com procedimento testado.

## Riscos técnicos atuais

- perda de dados locais ao limpar o navegador ou trocar de aparelho;
- ausência de sincronização, autenticação e auditoria;
- divergências futuras entre catálogo, unidades e sistema definitivo;
- dependência da estrutura do XLSX e preservação visual limitada pelo writer;
- tamanho elevado do módulo XLSX carregado sob demanda;
- necessidade de revisar dependências e vulnerabilidades antes de produção;
- exposição indevida caso arquivos operacionais ou dados pessoais entrem no repositório;
- aumento de complexidade e conflitos caso multi-dispositivo seja iniciado sem modelo de dados e backend definidos.

## Perguntas para a próxima rodada

1. Quem usará o app, em quais aparelhos e com que frequência?
2. Qual problema deve ser resolvido primeiro após a demonstração?
3. Quem é responsável por catálogo, unidades e conferência final?
4. Quais dados são sensíveis e qual política deve protegê-los?
5. Quanto tempo os fechamentos precisam ser mantidos?
6. Qual é o procedimento aceitável de backup e recuperação?
7. O ERP/PDV possui API ou importador documentado e ambiente de testes?
8. Quais identificadores ligam com segurança os itens entre os sistemas?
9. O uso em vários aparelhos precisa ser simultâneo?
10. Quais métricas e critérios determinarão se a próxima fase foi bem-sucedida?

## Saída esperada do replanejamento

A rodada deve produzir uma prioridade única ou um conjunto pequeno e ordenado, com responsável, usuários-piloto, dados permitidos, critérios de aceite e plano de reversão. Só depois disso uma nova etapa de desenvolvimento deve ser aberta.
