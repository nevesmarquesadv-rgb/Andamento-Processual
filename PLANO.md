# Plano de Evolução — Dashboard Neves Marques Advocacia

Documento de engenharia. Registra a auditoria (FASE 0) e o que ficou
para fases seguintes. O código vive em `atualizar_planilha.gs`.

## Estado atual

Script único com 5 blocos: **Andamento Processual** (leitura de e-mails
PJe/EPROC/Recorte Digital → abas Processos/Agenda), **Fase 1** (menu, KPIs,
pastas, prazos, backup, migração, log), **Fase 2** (Procuração/Contrato),
**Fase 3** (relatório semanal, processos parados, aniversários) e
**Fase 4** (IA Claude: análise e rascunho de petição).

### Gatilhos instalados por `configurarTriggers`
- `onEditTrigger` — a cada edição (cria pasta do cliente; agenda recálculo de KPIs)
- `processarEmailsJudiciais` — diário 7h
- `verificarPrazos`, `verificarAniversariosClientes`, `atualizarKPIs` — diário 8h
- `alertarProcessosSemMovimento` — sexta 8h
- `relatorioSemanal`, `backupSemanal` — segunda 7h

## ✅ Implementado — Pacote de Segurança (itens 1–5)

| Item | Risco | O que mudou |
|------|-------|-------------|
| 1 | R1 — perda silenciosa de andamentos | E-mail judicial que o parser não interpreta agora recebe a etiqueta `PJe-Revisar`, **não** é marcado como processado, e gera aviso por e-mail aos sócios. |
| 2 | R2 — abas com emoji quebram as Fases | Todas as leituras das Fases passam por `getSheet_` / `ehAba_` (tolerante a emoji), preservando os índices de coluna. |
| 3 | R3 — prazos duplicados | `adicionarAgenda_` e `appendAgenda_` deduplicam por data normalizada + nº de processo, usando o índice real das colunas. |
| 4 | R5 — KPIs recalculados a cada célula | `onEditTrigger` marca "KPIs sujos" e agenda **um** recálculo (`recalcularKPIsSeNecessario`, ~1 min depois). |
| 5 | R7 — backups acumulam sem limite | Backups vão para a subpasta `🗄️ Backups - Dashboard`; mantém os últimos `CFG.MAX_BACKUPS` (8). |

## ✅ Implementado — FASE 1 (Modelo de Dados e Abas)

- **Camada central de resolução de abas** (`resolverAba_` + `_normNome_`):
  tolerante a emoji, acento, caixa, espaços e variações de nome. O `getSheet_`
  agora delega para ela — toda a automação herda essa robustez.
- **`SCHEMA`**: fonte única da verdade com as 13 abas e suas colunas propostas
  (Configurações, Clientes, Processos, Agenda, Andamentos, Tarefas, Documentos,
  Financeiro, CRM/Oportunidades, IA_Log, Auditoria, Erros, Backups).
- **`auditarEstrutura()`** (menu 🧱, **somente leitura**): lê a estrutura real
  da planilha, acha a linha de cabeçalho mesmo fora da linha 1 e relata, na aba
  `🧱 Auditoria Estrutura`, o que existe, o que falta e o que será criado.
- **`criarAbasNovas()`** (menu 🧱): cria **apenas** as abas novas inexistentes
  (com cabeçalho/cor/congelamento) e semeia a aba `Configurações` com os valores
  atuais do código. **Nunca** cria nem altera as abas já em uso.

### Decisões de segurança da FASE 1
- As abas já em uso (**Clientes, Processos, Agenda, Financeiro**) são tratadas
  **somente na auditoria** — não são modificadas automaticamente, para não
  conflitar com as colunas/índices que a automação atual já lê e escreve.
- `CRM/Oportunidades` sobrepõe a aba existente `Prospectos`. Mantida separada;
  a consolidação deve ser decidida manualmente (ver auditoria).

### FASE 1 — deferido (próximo passo, exige planilha real para validar)
- **Migrar colunas das abas existentes** para o SCHEMA: como o código lê várias
  colunas por índice fixo (`r[12]`, `r[19]`…), adicionar/renomear colunas exige
  rodar a auditoria primeiro e migrar leitura→nome com a planilha à mão.
- **Ligar o fluxo de dados às novas abas**: gravar andamentos (com hash de
  deduplicação) em `Andamentos`; registrar chamadas de IA em `IA_Log`; erros em
  `Erros`; trilha em `Auditoria`; ler parâmetros de `Configurações`. Hoje as
  abas existem e estão prontas, mas a automação ainda não escreve nelas.

## ✅ Implementado — FASE 2 (Ingestão Inteligente de E-mails)

| Item | O que mudou |
|------|-------------|
| Cursor incremental | `processarEmailsJudiciais` lê `EMAIL_LAST_RUN` do `PropertiesService`. Só busca e-mails recebidos após a última execução bem-sucedida; na primeira execução usa a janela `CONFIG.diasRetroativos` como fallback. Ao final de cada run bem-sucedido atualiza o cursor. |
| `buildGmailQuery_(desde)` | Aceita cursor `Date` opcional; se presente usa `after:AAAA/MM/DD`; caso contrário usa `newer_than:Xd`. |
| Dry-run / Modo Teste | `alternarModoTeste()` (menu) grava `EMAIL_DRY_RUN=1` no `PropertiesService`. Enquanto ativo, o processamento registra no Log o que seria gravado, mas não altera planilha nem labels do Gmail. |
| Reprocessar por período | `reprocessarEmailsPorPeriodo()` (menu) pede data em DD/MM/AAAA, redefine o cursor e dispara `processarEmailsJudiciais`. Andamentos já registrados (mesmo hash) são ignorados automaticamente. |
| Hash SHA-256 | `_f2_computarHash_` usa `Utilities.computeDigest(SHA_256, ...)` sobre `número + data + remetente + assunto + trecho`. Antes de qualquer escrita, `_f2_verificarDuplicata_` consulta a coluna "Hash de deduplicação" na aba `Andamentos`. |
| Aba Andamentos | `_f2_gravarAndamento_` escreve na aba `Andamentos` (criada na FASE 1): ID, processo, data, sistema de origem, resumo, link do e-mail, hash, classificação, relevância, ação sugerida, criado em. |
| Classificação em 13 tipos | `_f2_classificarMovimento_` classifica por palavras-chave (normalizado NFD): `andamento`, `intimacao`, `prazo`, `publicacao`, `audiencia`, `sentenca`, `decisao`, `despacho`, `juntada`, `certidao`, `ato_ordinatorio`, `com_administrativa`, `irrelevante`. |
| Relevância e ação sugerida | Alta (sentença/prazo/intimação/audiência) · Média (decisão/publicação/despacho) · Normal · Baixa · Triagem. Ação sugerida correspondente a cada tipo. |
| Triagem de processos novos | Quando `resultado.novo === true`, grava na aba `Andamentos` com classificação `triagem` e adiciona a label Gmail `PJe-Triagem` à thread, para revisão humana antes de vincular ao cliente. |
| Novos labels Gmail | `PJe-Triagem` criado automaticamente em paralelo com `PJe-Processado` e `PJe-Revisar`. |
| Menu | Dois novos itens em `📨 Andamento Processual`: **Reprocessar por Período** e **Ativar / Desativar Modo Teste**. |

### Decisões de segurança da FASE 2
- A aba `Andamentos` deve ser criada antes via `🧱 Estrutura de Dados → Criar Abas Novas`. Se não existir, `_f2_gravarAndamento_` e `_f2_verificarDuplicata_` falham silenciosamente — o processamento principal continua sem interrupção.
- `inserirNovoProcesso_` ainda insere o processo na aba `Processos` com cliente "A identificar" (comportamento atual preservado). A label `PJe-Triagem` + registro na aba `Andamentos` são camadas adicionais de rastreabilidade, não substitutos.
- A IA (FASE 4) não é chamada durante o processamento de e-mails — classificação é só por palavras-chave; humano revisa.

## 🔜 Estrutural — próxima fase (a aprovar)

- **R4 — IA em lote sem estourar 6 min**: `analisarTodosProcessos` deve
  processar em janelas, salvando um cursor em `PropertiesService` e
  reagendando-se via trigger de continuação.
- **R8 — falha de gatilho não notifica**: camada central de captura de erro
  que envia e-mail aos sócios quando um gatilho falha (hoje só vai ao `🔧 Log`).
- **Mapa de colunas por aba**: substituir índices mágicos (`r[12]`, `r[19]`…)
  por um mapa central de cabeçalhos, reduzindo erro ao mudar a planilha.
- **Histórico de movimentações**: hoje "Últ. Mov." é sobrescrita; criar aba de
  histórico para não perder o encadeamento dos andamentos.

## 🗺️ Futuro — documentado (a decidir)

- **R6 / LGPD — Fase 4**: o envio de CPF/endereço/andamentos a `api.anthropic.com`
  permanece como está **por decisão do escritório**. Quando quiserem endurecer:
  gate de consentimento + mascaramento de CPF antes do envio, e chave por usuário.
- Módulo Financeiro completo (fluxo de caixa, honorários a receber).
- Aba de Tarefas / Kanban operacional.
- Sincronização de prazos com o Google Calendar.
- Migração do parsing de e-mail para a API oficial do CNJ/DataJud
  (mais confiável que regex sobre o corpo do e-mail).

## Como testar com segurança

1. **Arquivo → Fazer uma cópia** da planilha e rode o script na cópia.
2. Ajuste `CONFIG.diasRetroativos` para um valor baixo.
3. Verifique a aba `🔧 Log` após cada execução.
4. Reverter: cada mudança é um commit isolado (`git revert`); o editor do
   Apps Script também mantém histórico de versões.
