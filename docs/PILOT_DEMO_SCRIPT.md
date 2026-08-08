# Roteiro de demonstração do piloto v0.9.2

## Preparação antes da demonstração

- usar um navegador e aparelho já testados;
- confirmar que a versão apresentada é `v0.9.2`;
- separar arquivos próprios para demonstração, sem dados pessoais ou desnecessários;
- manter uma cópia intacta de cada arquivo usado;
- verificar espaço para downloads e saber onde o navegador salva arquivos;
- fazer uma execução curta antes da reunião;
- evitar depender de internet instável: deixar a PWA já aberta e disponível no aparelho.

## Arquivos necessários

- um template de contagem compatível e autorizado para a demonstração;
- uma planilha modelo XLSX compatível;
- opcionalmente, um XLSX já gerado como contingência caso o navegador bloqueie o download durante a reunião.

Esses arquivos são materiais operacionais locais e não devem ser adicionados ao repositório.

## Cenário sugerido

Use de três a cinco itens genéricos, distribuídos em duas áreas macro. Registre pelo menos um item em duas áreas, uma quantidade com conversão de unidade e um item sem lançamento. O cenário deve ser pequeno o bastante para concluir todo o ciclo durante a demonstração.

## Passos da demonstração

1. Abrir o app e explicar que o piloto funciona localmente no navegador.
2. Importar o template preparado para a demonstração.
3. Mostrar a configuração das áreas macro, sem alterar o escopo durante a apresentação.
4. Abrir a contagem de uma área e registrar poucas quantidades e unidades.
5. Repetir o registro em uma segunda área.
6. Abrir a consolidação e mostrar como os valores das áreas são reunidos.
7. Conferir que não existem pendências ou valores parciais.
8. Salvar o fechamento e explicar que ele congela o resultado daquele momento.
9. Finalizar o ciclo.
10. No detalhe do fechamento, selecionar a planilha modelo XLSX.
11. Mostrar o resumo do plano de preenchimento e confirmar que não há bloqueios.
12. Gerar e baixar a cópia preenchida.
13. Abrir o XLSX e conferir valores, grade `G:H:I`, cabeçalho `TOTAL` e borda destacada.
14. Explicar que o arquivo conferido pode ser enviado manualmente pelo canal escolhido.

## Pontos de fala

- A contagem é guiada por área e reduz a necessidade de anotações dispersas.
- Unidades e conversões ficam ligadas às entradas, reduzindo cálculo manual no fechamento.
- A consolidação reúne áreas antes de gerar o resultado final.
- Pendências e valores parciais bloqueiam o XLSX definitivo do piloto.
- O fechamento usa um snapshot congelado, evitando recalcular o passado com dados vivos.
- A planilha original não é modificada: o app baixa uma nova cópia.
- O envio permanece manual, permitindo conferência humana antes de compartilhar.

## Problemas manuais que o piloto reduz

- somar várias anotações e áreas à mão;
- perder a origem de uma quantidade;
- preencher a linha errada na planilha;
- esquecer itens pendentes antes do fechamento;
- alterar acidentalmente a planilha modelo;
- repetir a formatação básica dos blocos e do TOTAL.

## Como apresentar o XLSX final

Abra primeiro a cópia baixada, nunca o modelo original. Compare uma pequena amostra com a consolidação no app e mostre que ausências permanecem vazias, sem zeros artificiais. Destaque que `I` é o `TOTAL` e que sua borda mais grossa facilita a leitura. Não use a demonstração para prometer fidelidade perfeita de impressão ou suporte a qualquer planilha.

## Como posicionar o piloto

Esta versão comprova o fluxo operacional e a utilidade da exportação. Ela não é um sistema final: não possui servidor, autenticação, sincronização entre aparelhos, integração com ERP/PDV ou suporte formal. O objetivo da conversa é recolher decisões para o próximo planejamento, não aprovar novas funcionalidades durante a demonstração.

## Perguntas prováveis

**Funciona sem internet?**

Depois de carregada e instalada corretamente, a PWA foi desenhada para uso local. O envio do arquivo depende do canal escolhido.

**Os dados vão para algum servidor?**

Não. No piloto, os dados operacionais ficam no navegador e os arquivos só saem quando o usuário exporta ou envia manualmente.

**Vários celulares trabalham juntos?**

Ainda não. Não existe sincronização entre aparelhos nesta versão.

**Já integra com o sistema definitivo?**

Não. Uma integração com ERP ou PDV depende de documentação, acesso e regras que ainda serão planejadas.

**Aceita qualquer planilha?**

Não. O XLSX precisa seguir a estrutura compatível validada pelo piloto.

**A planilha modelo fica salva no app?**

Não. Ela é escolhida pelo usuário, processada em memória e permanece inalterada.

**Já podemos instalar para toda a equipe?**

Não é a recomendação atual. Primeiro devem ser definidos instalação controlada, treinamento, privacidade, backup e suporte.

**O que vem depois?**

Uma rodada de planejamento decidirá prioridades, incluindo unidades, interface de demonstração, poucos aparelhos e possível integração.
