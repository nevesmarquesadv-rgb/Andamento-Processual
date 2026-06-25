/**
 * ============================================================
 * NEVES MARQUES ADVOCACIA — Dashboard - Escritório
 * SCRIPT ÚNICO UNIFICADO  v2.0
 * Luiz Fernando Batista Neves  OAB/RJ 253.413
 * Kariny Marques Barbosa        OAB/RJ 241.456
 * ============================================================
 *
 * Este arquivo reúne, em um único código, TODAS as automações:
 *
 *  PARTE 0 — ANDAMENTO PROCESSUAL (leitura de e-mails judiciais)
 *            • Lê e-mails do PJe/EPROC/Recorte Digital
 *            • Atualiza a aba Processos e cria prazos na Agenda
 *            • Roda sozinho todo dia às 7h
 *
 *  FASE 1 — Menu, KPIs, pastas de clientes, alertas de prazo,
 *           backup semanal, migração, triggers, log de auditoria
 *  FASE 2 — Geração de documentos (Procuração / Contrato)
 *  FASE 3 — Relatório executivo semanal, processos sem
 *           movimentação, aniversários de clientes
 *  FASE 4 — Integração com IA (Claude / Anthropic): análise de
 *           clientes, análise em lote e rascunhos de petições
 *
 * ────────────────────────────────────────────────────────────
 * INSTALAÇÃO (uma única vez):
 *   1. Abra a planilha "Dashboard - Escritório"
 *   2. Extensões → Apps Script
 *   3. Apague TODO o conteúdo e cole este arquivo inteiro
 *   4. Preencha EMAIL_KARINY na constante CFG (mais abaixo)
 *   5. Salve (Ctrl+S)
 *   6. Execute uma vez a função "configurarTriggers"
 *      (autorize o acesso ao Drive e ao Gmail quando pedido)
 *   7. Recarregue a planilha → aparecerá o menu "⚖️ Neves Marques"
 *
 * Para usar a IA (Fase 4), ative também o serviço avançado:
 *   Apps Script → Serviços (+) → Drive API → Adicionar
 *   e configure a chave em: ⚖️ Neves Marques → 🤖 IA — Claude
 * ============================================================
 */


// ============================================================
// CONFIGURAÇÕES
// ============================================================

// --- Andamento Processual (leitura de e-mails judiciais) ---
const CONFIG = {
  spreadsheetId:   '1X8BX-jsHsN5AcjdxmpePp2baVqGA3hKMZcWHPxZrO44',
  abaProcessos:    'Processos',  // palavra-chave — busca por nome parcial
  abaAgenda:       'Agenda',     // palavra-chave — busca por nome parcial
  diasRetroativos: 2,
  labelProcessado: 'PJe-Processado',
  labelRevisar:    'PJe-Revisar',   // e-mail judicial que o parser não interpretou

  // Remetentes judiciais reconhecidos
  remetentes: [
    'tjrj.pjeadm-LD@tjrj.jus.br',
    'eproc.noreply@tjrj.jus.br',
    'eproc-bounce@jfrj.jus.br',
    'rd_oabrj@recortedigital.adv.br'
  ]
};

// --- Fases 1 a 4 (pastas, documentos, relatórios, IA) ---
const CFG = {
  PASTA_CLIENTES_ID : '1iB94RlRt8t8cI_zIqDvoGUXvFwa8gdy1',
  EMAIL_LUIZ        : 'nevesmarquesadv@gmail.com',
  EMAIL_KARINY      : 'PREENCHA_EMAIL_KARINY@gmail.com',   // <<< preencher
  DIAS_ALERTA       : 7,
  MAX_BACKUPS       : 8,   // nº de backups semanais mantidos; o excedente vai p/ lixeira

  SUBPASTAS: [
    '📄 Documentos Pessoais',
    '⚖️ Peças Processuais',
    '📋 Contratos e Procurações',
    '📁 Andamentos e Decisões',
    '💰 Financeiro'
  ],

  // Mapeamento: nome atual da pasta → { nome completo, área do direito }
  // Usado por migrarRenomearPastas() — rodar apenas 1 vez.
  RENOMEAR: {
    'BRUNA RIBEIRO'                         : { nome: 'Bruna Martins Ribeiro',                  area: 'Direito Cível' },
    'ADEMIR'                                : { nome: 'Ademir Belarmino de Souza',               area: 'Direito do Consumidor' },
    'Regina Guedes'                         : { nome: 'Regina de Souza Guedes',                  area: 'Direito da Saúde' },
    'Wilber'                                : { nome: 'Wilber Moreira Fonseca',                  area: 'Direito Previdenciário' },
    'ANA CAROLINA NEVES'                    : { nome: 'Ana Carolina Batista Neves',              area: 'Direito Previdenciário' },
    'GUILHERME - BMW'                       : { nome: 'Guilherme Vasconcellos de Souza Junior',  area: 'Direito do Consumidor' },
    'Rodrigo - PQD'                         : { nome: 'Rodrigo Oliveira Sobrinho',               area: 'Direito Militar' },
    'Leandro - Divórcio'                    : { nome: 'Leandro',                                 area: 'Direito de Família' },
    'Cláudio - Partilha'                    : { nome: 'Cláudio Mecone',                          area: 'Direito de Família' },
    'Camila - MED'                          : { nome: 'Camila Correa Campos de Fonseca',         area: 'Direito Médico e Hospitalar' },
    'Raissa - Contrato Trabalho Doméstico'  : { nome: 'Raissa Figueiredo Neves Basil',           area: 'Direito Cível' },
    'Vitor Vidon - VOUCHER AEREAS'          : { nome: 'Vitor Aguiar Vidon de Oliveira',          area: 'Direito do Consumidor' },
    'Luciene - RESTITUIÇÃO IR'              : { nome: 'Luciene Henriques Batista Neves',         area: 'Direito Tributário' },
    'Guilherme - MED'                       : { nome: 'Guilherme (Médico)',                      area: 'Direito Médico e Hospitalar' },
    'TALEL - ENARE'                         : { nome: 'Talel Georges Moreira El Nabbout',        area: 'Direito Administrativo' },
    'MATHEUS - AGUAS DO RIO'                : { nome: 'Matheus Moura Bastos',                    area: 'Direito do Consumidor' },
    'C L BATISTA LTDA'                      : { nome: 'C L Batista LTDA',                        area: 'Direito Empresarial' },
    'ALANA DO SANTOS'                       : { nome: 'Alana dos Santos',                        area: 'Direito Cível' },
    'Sidlea'                                : { nome: 'Sidlea',                                  area: 'Direito Cível' },
    'Gleice Kelly'                          : { nome: 'Gleice Kelly',                            area: 'Direito Cível' },
    'ELIZABETH - USA'                       : { nome: 'Elizabeth',                               area: 'Direito Cível' }
  }
};

// --- Fase 3 (inteligência e relatórios) ---
const FASE3 = {
  DIAS_INATIVO     : 30,   // Processos sem movimentação há X dias → alertar
  DIAS_ANIVERSARIO : 3     // Alertar X dias antes do aniversário do cliente
};

// --- FASE 3 (controle de prazos e alertas) ---
const F3 = {
  STATUS_PENDENTE  : 'Pendente de conferência',
  STATUS_CONFIRMADO: 'Confirmado',
  STATUS_REALIZADO : 'Realizado',
  STATUS_CANCELADO : 'Cancelado',
  DIAS_URGENTE     : 2   // prazo ≤ N dias → urgente
};

// --- Fase 4 (IA Claude) ---
const F4 = {
  MODELO       : 'claude-haiku-4-5-20251001',  // rápido e econômico
  MODELO_PRO   : 'claude-sonnet-4-6',           // avançado para petições
  MAX_TOKENS   : 2048,
  ABA_INSIGHTS : '🤖 IA Insights',
  SUBPASTA_AND : '📁 Andamentos e Decisões',
  SUBPASTA_PEC : '⚖️ Peças Processuais',
  MAX_CHARS    : 8000
};

// --- Fase 2 (geração de documentos) ---
const TEMPLATES = {
  PROCURACAO : '1mbJaKfa4RXyAcmuUbxGv0ggh6mJWQfmELMPi3xvaa6g',
  CONTRATO   : '1YBDCYEcvg-F6Tao9qWGriQxBTkA8HVKSvOYZiwslpSA'
};

const ESCRITORIO = {
  ENDERECO : 'PREENCHA O ENDEREÇO DO ESCRITÓRIO',
  CIDADE   : 'Nova Iguaçu',
  COMARCA  : 'Nova Iguaçu'
};

// --- FASE 2 (ingestão inteligente de e-mails) ---
const F2 = {
  PROP_LAST_RUN  : 'EMAIL_LAST_RUN',
  PROP_DRY_RUN   : 'EMAIL_DRY_RUN',
  LABEL_TRIAGEM  : 'PJe-Triagem',
  TIPOS: {
    ANDAMENTO         : 'andamento',
    INTIMACAO         : 'intimacao',
    PRAZO             : 'prazo',
    PUBLICACAO        : 'publicacao',
    AUDIENCIA         : 'audiencia',
    SENTENCA          : 'sentenca',
    DECISAO           : 'decisao',
    DESPACHO          : 'despacho',
    JUNTADA           : 'juntada',
    CERTIDAO          : 'certidao',
    ATO_ORDINATORIO   : 'ato_ordinatorio',
    COM_ADMINISTRATIVA: 'com_administrativa',
    IRRELEVANTE       : 'irrelevante'
  }
};


// ============================================================
// FASE 1 — MODELO DE DADOS (SCHEMA)
// Fonte única da verdade para abas e colunas.
//   aliases  : palavras-chave p/ o resolvedor central encontrar a aba
//              (tolerante a emoji/acento/maiúsculas/espaços)
//   headers  : colunas PROPOSTAS (cabeçalho)
//   existente: true  = aba já em uso pela automação → auditoria apenas,
//                      NUNCA é criada/alterada automaticamente
//              false = aba nova → pode ser criada com segurança
//   cor      : cor da guia (apenas em abas novas)
// ============================================================
const SCHEMA = {
  CONFIGURACOES: {
    nome: 'Configurações', existente: false, cor: '#455a64',
    aliases: ['Configurações', 'Config', 'Configuracoes', 'Parâmetros'],
    headers: ['Chave', 'Valor', 'Descrição', 'Categoria']
  },
  CLIENTES: {
    nome: 'Clientes', existente: true,
    aliases: ['Clientes', 'Cliente'],
    headers: ['ID interno', 'Nome', 'CPF/CNPJ', 'E-mail', 'Telefone',
      'Data de nascimento', 'Tipo de cliente', 'Origem do cliente',
      'Status do relacionamento', 'Pasta no Drive', 'Documentos pendentes',
      'Contrato assinado', 'Procuração assinada', 'Observações relevantes',
      'Data de cadastro', 'Data da última interação']
  },
  PROCESSOS: {
    nome: 'Processos', existente: true,
    aliases: ['Processos', 'Processo'],
    headers: ['ID interno', 'Número CNJ', 'Cliente', 'Parte contrária',
      'Tribunal', 'Sistema processual', 'Órgão julgador', 'Classe', 'Assunto',
      'Área', 'Fase', 'Status', 'Responsável', 'Link do processo',
      'Pasta do processo no Drive', 'Último andamento', 'Data do último andamento',
      'Dias sem movimentação', 'Próximo prazo', 'Grau de risco',
      'Estratégia processual resumida', 'Observações']
  },
  AGENDA: {
    nome: 'Agenda', existente: true,
    aliases: ['Agenda', 'Prazos', 'Agenda/Prazos'],
    headers: ['ID interno', 'Processo vinculado', 'Cliente', 'Tipo de prazo',
      'Descrição', 'Data fatal', 'Horário', 'Responsável', 'Status', 'Prioridade',
      'Origem do prazo', 'E-mail de origem', 'Data de captura',
      'Confirmado por humano', 'Enviado alerta', 'Observações']
  },
  ANDAMENTOS: {
    nome: 'Andamentos', existente: false, cor: '#1565c0',
    aliases: ['Andamentos', 'Andamento', 'Movimentações'],
    headers: ['ID interno', 'Processo vinculado', 'Data do andamento',
      'Sistema de origem', 'Resumo do andamento', 'Texto bruto', 'Link do e-mail',
      'Hash de deduplicação', 'Classificação por IA', 'Relevância',
      'Ação sugerida', 'Criado em']
  },
  TAREFAS: {
    nome: 'Tarefas', existente: false, cor: '#2e7d32',
    aliases: ['Tarefas', 'Tarefa', 'To-do'],
    headers: ['ID interno', 'Cliente', 'Processo', 'Descrição', 'Responsável',
      'Status', 'Prioridade', 'Prazo interno', 'Origem', 'Criado em', 'Concluído em']
  },
  DOCUMENTOS: {
    nome: 'Documentos', existente: false, cor: '#6a1b9a',
    aliases: ['Documentos', 'Documento', 'Docs'],
    headers: ['ID interno', 'Cliente', 'Processo', 'Tipo de documento',
      'Nome do documento', 'Link do Drive', 'Template utilizado', 'Status',
      'Criado em', 'Revisado por', 'Observações']
  },
  FINANCEIRO: {
    nome: 'Financeiro', existente: true,
    aliases: ['Financeiro', 'Finanças', 'Honorários'],
    headers: ['Cliente', 'Processo', 'Tipo de contratação', 'Honorários fixos',
      'Honorários de êxito', 'Parcelas', 'Vencimentos', 'Valores pagos',
      'Valores em aberto', 'Custas', 'Reembolsos', 'Status financeiro', 'Observações']
  },
  CRM: {
    nome: 'CRM/Oportunidades', existente: false, cor: '#ad1457',
    aliases: ['CRM/Oportunidades', 'CRM', 'Oportunidades', 'Prospectos', 'Leads'],
    headers: ['Lead', 'Origem', 'Data do primeiro contato', 'Área de interesse',
      'Valor estimado', 'Probabilidade de fechamento', 'Próxima ação', 'Status',
      'Observações']
  },
  IA_LOG: {
    nome: 'IA_Log', existente: false, cor: '#00838f',
    aliases: ['IA_Log', 'IA Log', 'Log IA'],
    headers: ['Data', 'Usuário', 'Função chamada', 'Prompt utilizado',
      'Modelo utilizado', 'Processo/cliente relacionado', 'Resultado', 'Status',
      'Erro', 'Custo estimado']
  },
  AUDITORIA: {
    nome: 'Auditoria', existente: false, cor: '#37474f',
    aliases: ['Auditoria', 'Audit'],
    headers: ['Timestamp', 'Usuário', 'Função executada', 'Entidade afetada',
      'Antes', 'Depois', 'Resultado', 'Erro', 'ID de correlação']
  },
  ERROS: {
    nome: 'Erros', existente: false, cor: '#b71c1c',
    aliases: ['Erros', 'Erro', 'Errors'],
    headers: ['Timestamp', 'Função', 'Tipo de erro', 'Mensagem', 'Stack trace',
      'Dados de contexto', 'Resolvido', 'Observações']
  },
  BACKUPS: {
    nome: 'Backups', existente: false, cor: '#5d4037',
    aliases: ['Backups', 'Backup'],
    headers: ['Data', 'Tipo', 'Link do backup', 'Status', 'Observações']
  }
};


// ============================================================
// MENU PERSONALIZADO (versão única — todas as fases)
// ============================================================

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('⚖️ Neves Marques')

    .addSubMenu(ui.createMenu('📨 Andamento Processual')
      .addItem('🔄 Processar E-mails Judiciais agora', 'processarEmailsJudiciais')
      .addItem('📅 Reprocessar por Período',           'reprocessarEmailsPorPeriodo')
      .addItem('🧪 Ativar / Desativar Modo Teste',     'alternarModoTeste')
      .addItem('📌 Aplicar Atualizações Pendentes',    'aplicarTodasAtualizacoesPendentes'))

    .addSeparator()

    .addSubMenu(ui.createMenu('📊 Dashboard')
      .addItem('▶ Atualizar KPIs agora', 'atualizarKPIs')
      .addItem('📋 Ver Log do Sistema', 'verLog'))

    .addSeparator()

    .addSubMenu(ui.createMenu('📁 Pastas & Clientes')
      .addItem('🔄 Migrar: Renomear Pastas Existentes', 'migrarRenomearPastas')
      .addItem('📂 Migrar: Criar Subpastas Faltantes',  'migrarCriarSubpastas'))

    .addSeparator()

    .addSubMenu(ui.createMenu('📄 Documentos')
      .addItem('📜 Gerar Procuração (linha atual)', 'gerarProcuracao')
      .addItem('📋 Gerar Contrato (linha atual)',   'gerarContrato'))

    .addSeparator()

    .addSubMenu(ui.createMenu('🔔 Alertas & Relatórios')
      .addItem('⚡ Verificar Prazos Agora',               'verificarPrazos')
      .addItem('✅ Confirmar Prazo Selecionado',           'confirmarPrazo')
      .addItem('💤 Processos sem Movimento',               'alertarProcessosSemMovimento')
      .addItem('🎂 Aniversários de Clientes',              'verificarAniversariosClientes')
      .addItem('📊 Relatório Semanal (enviar agora)',      'relatorioSemanal')
      .addItem('💾 Backup Semanal (executar agora)',       'backupSemanal'))

    .addSeparator()

    .addSubMenu(ui.createMenu('🤖 IA — Claude')
      .addItem('🔑 Configurar Chave API',               'configurarApiClaude')
      .addSeparator()
      .addItem('📊 Analisar Cliente Selecionado',       'analisarClienteSelecionado')
      .addItem('⚡ Analisar Todos os Processos (lote)', 'analisarTodosProcessos')
      .addSeparator()
      .addItem('📝 Gerar Rascunho de Petição',          'gerarRascunhoPeticao')
      .addSeparator()
      .addItem('📋 Ver Painel de Insights',             'verPainelInsights'))

    .addSeparator()

    .addSubMenu(ui.createMenu('🧱 Estrutura de Dados')
      .addItem('🔍 Auditar Estrutura (somente leitura)', 'auditarEstrutura')
      .addItem('➕ Criar Abas Novas',                    'criarAbasNovas'))

    .addSeparator()

    .addSubMenu(ui.createMenu('⚙️ Sistema')
      .addItem('▶ Instalar / Reinstalar todos os gatilhos', 'configurarTriggers')
      .addItem('📋 Ver Log do Sistema',                     'verLog'))

    .addToUi();
}


// ████████████████████████████████████████████████████████████
// PARTE 0 — ANDAMENTO PROCESSUAL (LEITURA DE E-MAILS JUDICIAIS)
// ████████████████████████████████████████████████████████████

// ──────────────────────────────────────────────────────────
// PONTO DE ENTRADA PRINCIPAL (roda no gatilho diário das 7h)
// ──────────────────────────────────────────────────────────
function processarEmailsJudiciais() {
  const ss     = getPlanilha_();
  const dryRun = _f2_isDryRun_();
  if (dryRun) registrarLog('[TESTE] Modo Dry Run ATIVO — nenhuma escrita será feita na planilha.');

  garantirLabelProcessado_();
  garantirLabelRevisar_();
  _f2_garantirLabelTriagem_();

  // Cursor incremental: só processa e-mails recebidos após a última execução bem-sucedida.
  // Na primeira execução (sem cursor) usa a janela fixa de CONFIG.diasRetroativos.
  const props      = PropertiesService.getScriptProperties();
  const lastRunStr = props.getProperty(F2.PROP_LAST_RUN);
  const desde      = lastRunStr ? new Date(lastRunStr) : null;
  const agora      = new Date();

  const query   = buildGmailQuery_(desde);
  const threads = GmailApp.search(query, 0, 50);
  Logger.log('[F2] Cursor: ' + (lastRunStr || 'inicial (janela de ' + CONFIG.diasRetroativos + 'd)') + ' | ' + threads.length + ' threads encontradas');

  let totalAtualizados = 0;
  let totalNovos       = 0;
  let totalDedup       = 0;
  let alertasUrgentes  = [];
  let paraRevisar      = [];
  const triagemThreads = new Set(); // threads com processos novos (triagem)

  for (const thread of threads) {
    if (jaProcessado_(thread) || jaParaRevisar_(thread)) continue;

    let reconhecidos = 0; // mensagens de remetente judicial reconhecido
    let extraidos    = 0; // mensagens que o parser conseguiu interpretar (ou já deduplicadas)
    let threadNovo   = false;

    for (const msg of thread.getMessages()) {
      const remetente = msg.getFrom();
      if (!remetenteReconhecido_(remetente)) continue;
      reconhecidos++;

      const corpo = msg.getPlainBody() + msg.getBody();
      const dados = extrairDadosEmail_(corpo, remetente, msg.getDate());
      if (!dados) continue;

      // Deduplicação por hash (número do processo + data + remetente + assunto + trecho)
      const hash = _f2_computarHash_(dados, msg);
      if (_f2_verificarDuplicata_(ss, hash)) {
        totalDedup++;
        extraidos++; // conta como "processado" p/ não enviar p/ revisão
        Logger.log('[F2] Duplicata ignorada: ' + dados.numProcesso + ' hash=' + hash.substring(0, 16));
        continue;
      }

      extraidos++;

      const classif  = _f2_classificarMovimento_(dados.descMovimentacao);
      dados._classif = classif;
      dados._hash    = hash;

      if (!dryRun) {
        const resultado = aplicarNaPlanilha_(ss, dados);
        if (resultado.novo)       { totalNovos++; threadNovo = true; }
        if (resultado.atualizado)   totalAtualizados++;
        if (resultado.alerta)       alertasUrgentes.push(resultado.alerta);
        _f2_gravarAndamento_(ss, dados, msg, hash, classif, resultado.novo);
      } else {
        Logger.log('[TESTE] Seria gravado: ' + dados.numProcesso + ' | ' + classif
          + ' | ' + dados.descMovimentacao.substring(0, 60) + '...');
      }
    }

    if (dryRun) continue; // modo teste: não altera labels do Gmail

    if (extraidos > 0) {
      marcarComoProcessado_(thread);
      if (threadNovo) triagemThreads.add(thread); // sinaliza triagem em paralelo
    } else if (reconhecidos > 0) {
      // E-mail de remetente judicial reconhecido, mas parser não extraiu dados.
      // NÃO marca como processado — etiqueta para revisão humana.
      marcarParaRevisar_(thread);
      paraRevisar.push(thread);
      Logger.log('[REVISAR] Parser não extraiu dados: ' + thread.getFirstMessageSubject());
    } else {
      marcarComoProcessado_(thread);
    }
  }

  // Etiqueta threads com processos novos para triagem humana
  triagemThreads.forEach(function(t) { _f2_marcarTriagem_(t); });

  if (!dryRun) {
    // Avança o cursor para a próxima execução incremental
    props.setProperty(F2.PROP_LAST_RUN, agora.toISOString());
  }

  const resumo = (dryRun ? '[TESTE] ' : '') +
    totalAtualizados + ' atualizado(s), ' + totalNovos + ' novo(s), ' +
    totalDedup + ' dedup, ' + paraRevisar.length + ' p/ revisão, ' +
    triagemThreads.size + ' triagem';
  Logger.log('[F2] ' + resumo);
  registrarLog('Andamento Processual: ' + resumo);

  if (alertasUrgentes.length > 0) enviarAlertaEmail_(alertasUrgentes);
  if (paraRevisar.length > 0)    enviarAvisoRevisao_(paraRevisar);
}

// ──────────────────────────────────────────────────────────
// EXTRAÇÃO DE DADOS DOS E-MAILS
// ──────────────────────────────────────────────────────────
function extrairDadosEmail_(corpo, remetente, dataEmail) {
  if (remetente.includes('tjrj.pjeadm-LD')) {
    return extrairPjePush_(corpo, dataEmail);
  }
  if (remetente.includes('eproc-bounce@jfrj') || remetente.includes('eproc.noreply@tjrj')) {
    return extrairEproc_(corpo, dataEmail);
  }
  if (remetente.includes('recortedigital')) {
    return extrairRecorteDigital_(corpo, dataEmail);
  }
  return null;
}

function extrairPjePush_(corpo, dataEmail) {
  const num = matchFirst_(corpo, /Número do Processo[:\s]+([0-9]{7}-[0-9]{2}\.[0-9]{4}\.[0-9]\.[0-9]{2}\.[0-9]{4})/);
  if (!num) return null;

  const poloAtivo   = matchFirst_(corpo, /Polo Ativo[:\s]+(.+?)(?:\n|<br)/i) || '';
  const poloPassivo = matchFirst_(corpo, /Polo Passivo[:\s]+(.+?)(?:\n|<br)/i) || '';
  const orgao       = matchFirst_(corpo, /Órgão[:\s]+(.+?)(?:\n|<br)/i) || '';
  const classe      = matchFirst_(corpo, /Classe Judicial[:\s]+(.+?)(?:\n|<br)/i) || '';
  const assunto     = matchFirst_(corpo, /Assunto[:\s]+(.+?)(?:\n|<br)/i) || '';

  // Extrai todas as movimentações da tabela
  const movs = [];
  const regexMov = /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})\s*[-–]\s*(.+?)(?=\d{2}\/\d{2}\/\d{4}|$)/gs;
  let m;
  while ((m = regexMov.exec(corpo)) !== null) {
    movs.push({ data: m[1].trim(), desc: limpar_(m[2]) });
  }

  // Tenta extrair de tags <td> se regex acima falhou
  if (movs.length === 0) {
    const tdRegex = /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})\s*-\s*([^<\n]+)/g;
    while ((m = tdRegex.exec(corpo)) !== null) {
      movs.push({ data: m[1].trim(), desc: limpar_(m[2]) });
    }
  }

  const ultimaMov = movs.length > 0 ? movs[0] : null;
  const descMovs  = movs.map(v => `${v.data} — ${v.desc}`).join(' | ');

  return {
    tipo:         'pje_push',
    numProcesso:  num,
    poloAtivo:    limpar_(poloAtivo),
    poloPassivo:  limpar_(poloPassivo),
    orgao:        limpar_(orgao),
    classe:       limpar_(classe),
    assunto:      limpar_(assunto),
    ultimaMovData: ultimaMov ? parseDateBR_(ultimaMov.data) : dataEmail,
    descMovimentacao: descMovs || 'Movimentação registrada via PJe Push',
    movimentos:   movs,
    dataEmail:    dataEmail
  };
}

function extrairEproc_(corpo, dataEmail) {
  const num = matchFirst_(corpo, /Num\. Processo[:\s]+([0-9]{7}-[0-9]{2}\.[0-9]{4}\.[0-9]\.[0-9]{2}\.[0-9]{4})/);
  if (!num) return null;

  const mov      = matchFirst_(corpo, /Movimentação[:\s]+(.+?)(?:\n|<)/i) || 'Movimentação EPROC';
  const eventoN  = matchFirst_(corpo, /Evento Número[:\s]+(\d+)/i) || '';
  const poloAt   = matchFirst_(corpo, /AUTOR\s*\n+([^\n]+)/i) || '';
  const poloPass = matchFirst_(corpo, /RÉU\s*\n+([^\n]+)/i) || '';

  const desc = eventoN
    ? `${limpar_(mov)} — Evento ${eventoN} (EPROC — ${Utilities.formatDate(dataEmail, 'America/Sao_Paulo', 'dd/MM/yyyy')})`
    : limpar_(mov);

  return {
    tipo:             'eproc',
    numProcesso:      num,
    poloAtivo:        limpar_(poloAt),
    poloPassivo:      limpar_(poloPass),
    ultimaMovData:    dataEmail,
    descMovimentacao: desc,
    movimentos:       [{ data: Utilities.formatDate(dataEmail, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'), desc: desc }],
    dataEmail:        dataEmail
  };
}

function extrairRecorteDigital_(corpo, dataEmail) {
  const num = matchFirst_(corpo, /PROCESSO[:\s]+([0-9]{7}-[0-9]{2}\.[0-9]{4}\.[0-9]\.[0-9]{2}\.[0-9]{4})/);
  if (!num) return null;

  const dataPub   = matchFirst_(corpo, /Data de Publicação[:\s]+(\d{2}\/\d{2}\/\d{4})/i) || '';
  const dataDis   = matchFirst_(corpo, /Data de Disponibilização[:\s]+(\d{2}\/\d{2}\/\d{4})/i) || '';
  const local     = matchFirst_(corpo, /Local[:\s]+(.+?)(?:\n|<br)/i) || '';
  const pubTexto  = matchFirst_(corpo, /Publicação[:\s]+(.+?)(?=Total de Publicações|$)/is) || '';

  const desc = `Publicação DJE — Disponibilização: ${dataDis || '?'} · Publicação: ${dataPub || '?'} — ${limpar_(local).substring(0, 80)}`;

  return {
    tipo:             'recorte_digital',
    numProcesso:      num,
    ultimaMovData:    dataDis ? parseDateBR_(dataDis) : dataEmail,
    descMovimentacao: desc,
    movimentos:       [{ data: dataDis || Utilities.formatDate(dataEmail, 'America/Sao_Paulo', 'dd/MM/yyyy'), desc: desc }],
    dataEmail:        dataEmail
  };
}

// ──────────────────────────────────────────────────────────
// APLICAR DADOS NA PLANILHA
// ──────────────────────────────────────────────────────────
function aplicarNaPlanilha_(ss, dados) {
  const resultado = { novo: false, atualizado: false, alerta: null };

  const abaProc = getSheet_(ss, CONFIG.abaProcessos);
  if (!abaProc) { Logger.log('Aba Processos não encontrada'); return resultado; }

  const todasLinhas = abaProc.getDataRange().getValues();
  const cab = encontrarCabecalho_(todasLinhas, 'Nº Processo');
  if (!cab) return resultado;

  const { cabRow, headers } = cab;

  // Procura a linha do processo
  let linhaEncontrada = -1;
  for (let r = cabRow + 1; r < todasLinhas.length; r++) {
    if (normNum_(todasLinhas[r][headers.indexOf('Nº Processo')]) === normNum_(dados.numProcesso)) {
      linhaEncontrada = r;
      break;
    }
  }

  const dataMovStr = Utilities.formatDate(dados.ultimaMovData, 'America/Sao_Paulo', 'dd/MM/yyyy');

  if (linhaEncontrada >= 0) {
    // Atualiza processo existente
    const r1 = linhaEncontrada + 1;
    setCell_(abaProc, r1, headers, 'Últ. Mov.', dataMovStr);
    setCell_(abaProc, r1, headers, 'Desc. Últ. Movimentação', dados.descMovimentacao);

    // Detecta situações especiais para alerta
    const descLow = dados.descMovimentacao.toLowerCase();
    if (descLow.includes('improcedente') || descLow.includes('procedente') ||
        descLow.includes('sentença') || descLow.includes('julgado') ||
        descLow.includes('acórdão') || descLow.includes('prazo decorrido')) {
      resultado.alerta = gerarAlerta_(dados, todasLinhas[linhaEncontrada], headers);
      setCell_(abaProc, r1, headers, 'Fase', detectarFase_(dados.descMovimentacao));
      adicionarAgenda_(ss, dados, todasLinhas[linhaEncontrada], headers, true);
    } else {
      adicionarAgenda_(ss, dados, todasLinhas[linhaEncontrada], headers, false);
    }

    resultado.atualizado = true;
    Logger.log(`[OK] Processo ${dados.numProcesso} atualizado — ${dataMovStr}`);

  } else {
    // Processo não encontrado na planilha — insere novo
    inserirNovoProcesso_(abaProc, dados, cabRow, headers);
    adicionarAgenda_(ss, dados, null, headers, false);
    resultado.novo = true;
    Logger.log(`[NOVO] Processo ${dados.numProcesso} inserido`);
  }

  return resultado;
}

function inserirNovoProcesso_(aba, dados, cabRow, headers) {
  // Encontra primeira linha vazia após os processos do escritório
  const todasLinhas = aba.getDataRange().getValues();
  let linhaInsercao = todasLinhas.length + 1;
  for (let r = cabRow + 1; r < todasLinhas.length; r++) {
    const v = String(todasLinhas[r][0]).trim();
    if (v === '' || v.startsWith('⚖')) { linhaInsercao = r + 1; break; }
  }

  const novaLinha = new Array(headers.length).fill('');
  function s(col, val) {
    const i = headers.indexOf(col);
    if (i >= 0) novaLinha[i] = val;
  }

  const dataMovStr = Utilities.formatDate(dados.ultimaMovData, 'America/Sao_Paulo', 'dd/MM/yyyy');
  s('Nº Processo',             dados.numProcesso);
  s('Cliente',                 dados.poloAtivo || 'A identificar');
  s('Polo Ativo',              dados.poloAtivo || '');
  s('Polo Passivo',            dados.poloPassivo || '');
  s('Área',                    inferirArea_(dados));
  s('Tipo de Ação',            dados.classe || dados.assunto || 'A classificar');
  s('Tribunal / Órgão',        dados.orgao || '');
  s('Status',                  'Ativo');
  s('Fase',                    'Em andamento');
  s('Distribuição',            dataMovStr);
  s('Últ. Mov.',               dataMovStr);
  s('Desc. Últ. Movimentação', dados.descMovimentacao);
  s('Tipo Prazo',              'Prazo Processual');
  s('Observações',             `Processo inserido automaticamente via PJe Push em ${Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy')}`);

  aba.insertRowBefore(linhaInsercao);
  aba.getRange(linhaInsercao, 1, 1, novaLinha.length).setValues([novaLinha]);
}

function adicionarAgenda_(ss, dados, linhaProc, headers, urgente) {
  const abaAg = getSheet_(ss, CONFIG.abaAgenda);
  if (!abaAg) return;

  const todasLinhas = abaAg.getDataRange().getValues();
  const cab = encontrarCabecalho_(todasLinhas, 'Data');
  if (!cab) return;

  const { headers: hAg } = cab;

  const cliente    = linhaProc ? linhaProc[headers.indexOf('Cliente')] : (dados.poloAtivo || 'A identificar');
  const tribunal   = linhaProc ? linhaProc[headers.indexOf('Tribunal / Órgão')] : (dados.orgao || '');
  const responsavel= linhaProc ? linhaProc[headers.indexOf('Responsável')] : '';

  const prazoData  = urgente ? calcularPrazo_(dados.ultimaMovData, 15) : calcularPrazo_(dados.ultimaMovData, 7);
  const prazoStr   = Utilities.formatDate(prazoData, 'America/Sao_Paulo', 'dd/MM/yyyy');

  // Evita duplicação: mesma data de prazo + mesmo número de processo.
  // (compara data normalizada — a célula pode ser Date ou texto.)
  const colData = hAg.indexOf('Data');
  const colRef  = hAg.indexOf('Nº Processo / Ref.');
  const numProc = normNum_(dados.numProcesso);
  for (let r = cab.cabRow + 1; r < todasLinhas.length; r++) {
    const dataCel = normalizarDataParaTexto_(todasLinhas[r][colData >= 0 ? colData : 0]);
    const refCel  = normNum_(String(todasLinhas[r][colRef >= 0 ? colRef : 0]));
    if (numProc.length > 0 && dataCel === prazoStr && refCel.includes(numProc)) return;
  }

  const novaLinha  = new Array(hAg.length).fill('');
  function s(col, val) { const i = hAg.indexOf(col); if (i >= 0) novaLinha[i] = val; }

  const capturaStr = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
  s('Data',                  prazoStr);
  s('Tipo',                  urgente ? 'Prazo Processual' : 'Acompanhamento');
  s('Tipo de prazo',         urgente ? 'Prazo Processual' : 'Acompanhamento');
  s('Nº Processo / Ref.',    String(dados.numProcesso) + ' — ' + String(cliente));
  s('Processo vinculado',    String(dados.numProcesso));
  s('Data fatal',            prazoStr);
  s('Cliente',               String(cliente));
  s('Tribunal / Local',      String(tribunal));
  s('Descrição',             dados.descMovimentacao.substring(0, 300));
  s('Responsável',           String(responsavel));
  s('Status',                F3.STATUS_PENDENTE);
  s('Prioridade',            urgente ? '🔴 Alta' : '🟡 Média');
  s('Origem do prazo',       'Captura automática — e-mail judicial');
  s('Data de captura',       capturaStr);
  s('Confirmado por humano', '');
  s('Enviado alerta',        '');

  abaAg.appendRow(novaLinha);
}

// ──────────────────────────────────────────────────────────
// TODAS AS ATUALIZAÇÕES PENDENTES (sessões anteriores + hoje)
// Execute "aplicarTodasAtualizacoesPendentes" — pode rodar
// mais de uma vez sem duplicar dados.
// ──────────────────────────────────────────────────────────
function aplicarTodasAtualizacoesPendentes() {
  const ss      = getPlanilha_();
  const abaProc = getSheet_(ss, CONFIG.abaProcessos);
  const abaAg   = getSheet_(ss, CONFIG.abaAgenda);

  if (!abaProc) {
    SpreadsheetApp.getUi().alert('ERRO: aba "Processos" não encontrada.\nAbas disponíveis: ' + ss.getSheets().map(s => s.getName()).join(', '));
    return;
  }
  if (!abaAg) {
    SpreadsheetApp.getUi().alert('ERRO: aba "Agenda" não encontrada.\nAbas disponíveis: ' + ss.getSheets().map(s => s.getName()).join(', '));
    return;
  }

  // Lê linhas UMA vez e reusa (evita múltiplas chamadas à API)
  let todasLinhas = abaProc.getDataRange().getValues();
  const cab = encontrarCabecalho_(todasLinhas, 'Nº Processo');
  if (!cab) {
    SpreadsheetApp.getUi().alert('ERRO: cabeçalho "Nº Processo" não encontrado na aba Processos.');
    return;
  }
  const { cabRow, headers } = cab;

  // ════════════════════════════════════════════════
  // BLOCO A — E-mails de 17–20/06/2026
  // ════════════════════════════════════════════════

  // ── A1. WILBER × UNIÃO (5002092-77) ─────────────
  // EPROC/JFRJ 20/06: intimação eletrônica Evento 11
  atualizarLinhaPorNumero_(abaProc, todasLinhas, headers,
    '5002092-77.2026.4.02.5102',
    '20/06/2026',
    'Expedida/certificada a intimação eletrônica — Evento 11 (JFRJ/EPROC — 20/06/2026)'
  );
  buscarEAtualizarCelula_(abaProc, todasLinhas, headers,
    '5002092-77.2026.4.02.5102', headers.indexOf('Tipo Prazo'), 'Intimação Eletrônica');
  buscarEAtualizarCelula_(abaProc, todasLinhas, headers,
    '5002092-77.2026.4.02.5102', headers.indexOf('Data Limite'), '11/07/2026');
  appendAgenda_(abaAg, {
    data: '11/07/2026', tipo: 'Prazo Processual',
    proc: '5002092-77.2026.4.02.5102 — Wilber × União/Fazenda Nacional',
    cliente: 'Wilber Moreira Fonseca',
    tribunal: '5ª VF — Niterói (JEF) / TRF2',
    desc: 'PRAZO FATAL — Intimação eletrônica expedida (Evento 11, 20/06/2026). Verificar conteúdo no EPROC/JFRJ e providenciar resposta.',
    resp: 'Luiz Fernando', prioridade: '🔴 Alta'
  });

  // ── A2. BRUNA/LUISA × ESTADO RJ (3110375-04) — NOVO ──
  // Distribuído 17/06, publicado DJE 22/06
  todasLinhas = abaProc.getDataRange().getValues(); // recarrega após possível inserção
  const existeBruna = todasLinhas.some(r => normNum_(String(r[0])) === normNum_('3110375-04.2026.8.19.0001'));
  if (!existeBruna) {
    inserirProcessoGenerico_(abaProc, cabRow, headers, {
      num:         '3110375-04.2026.8.19.0001',
      cliente:     'Bruna Martins Ribeiro Ferreira / Luisa Ribeiro Ferreira',
      area:        'Direito Cível',
      tipo:        'Procedimento Comum Cível — Fazenda Pública',
      orgao:       '17ª Vara da Fazenda Pública da Comarca da Capital — TJRJ',
      fase:        'Distribuição',
      poloAtivo:   'Bruna Martins Ribeiro Ferreira e Luisa Ribeiro Ferreira',
      poloPassivo: 'Estado do Rio de Janeiro',
      distrib:     '17/06/2026',
      ultMov:      '17/06/2026',
      descMov:     'Distribuído por sorteio em 17/06/2026 (14h26) — Magistrado: Manoel Tavares Cavalcanti — Publicação DJE/TJRJ em 22/06/2026 — Chave EPROC: 397388264626',
      tipoPrazo:   'Prazo Processual',
      resp:        'Kariny Barbosa / Luiz Fernando',
      obs:         'Advogados: Kariny Barbosa OAB 241456/RJ e Luiz Fernando OAB 253413/RJ'
    });
  }
  appendAgenda_(abaAg, {
    data: '30/06/2026', tipo: 'Acompanhamento',
    proc: '3110375-04.2026.8.19.0001 — Bruna e Luisa × Estado do Rio de Janeiro',
    cliente: 'Bruna Martins Ribeiro Ferreira / Luisa Ribeiro Ferreira',
    tribunal: '17ª Vara da Fazenda Pública — Capital — TJRJ',
    desc: 'Processo novo distribuído em 17/06/2026. Verificar despacho inicial e intimações no eproc.tjrj. Publicação DJE em 22/06/2026.',
    resp: 'Kariny Barbosa / Luiz Fernando', prioridade: '🟡 Média'
  });

  // ════════════════════════════════════════════════
  // BLOCO B — E-mails de 23/06/2026 (PJe Push TJRJ)
  // ════════════════════════════════════════════════

  // Recarrega linhas após inserções do bloco A
  todasLinhas = abaProc.getDataRange().getValues();

  // ── B1. ADEMIR × GOL (0812492-61) ───────────────
  atualizarLinhaPorNumero_(abaProc, todasLinhas, headers,
    '0812492-61.2026.8.19.0038',
    '22/06/2026',
    '22/06/2026 14:15 — Expedição de Outros documentos | 22/06/2026 14:10 — Juntada de Petição (PJe Push TJRJ)'
  );
  appendAgenda_(abaAg, {
    data: '30/06/2026', tipo: 'Acompanhamento',
    proc: '0812492-61.2026.8.19.0038 — Ademir × GOL',
    cliente: 'Ademir Belarmino de Souza',
    tribunal: '4º JECível — Nova Iguaçu',
    desc: 'Verificar documentos expedidos em 22/06 e petição juntada — possível designação de audiência ou intimação. Acessar PJe/TJRJ.',
    resp: 'Kariny Barbosa', prioridade: '🟡 Média'
  });

  // ── B2. VITOR × AZUL (0862248-73) ⚠️ IMPROCEDENTE ──
  atualizarLinhaPorNumero_(abaProc, todasLinhas, headers,
    '0862248-73.2025.8.19.0038',
    '22/06/2026',
    '22/06/2026 17:02 — JULGADO IMPROCEDENTE O PEDIDO | Homologação de Decisão de Juiz Leigo | Expedição de documentos (PJe Push TJRJ)'
  );
  buscarEAtualizarCelula_(abaProc, todasLinhas, headers,
    '0862248-73.2025.8.19.0038', headers.indexOf('Fase'), 'Sentença — Improcedente');
  appendAgenda_(abaAg, {
    data: '07/07/2026', tipo: 'Prazo Processual',
    proc: '0862248-73.2025.8.19.0038 — Vitor × Azul',
    cliente: 'Vitor Aguiar Vidon de Oliveira',
    tribunal: '2º JECível — Nova Iguaçu',
    desc: '🚨 PRAZO FATAL — JULGADO IMPROCEDENTE em 22/06/2026. Verificar publicação oficial e decidir com cliente sobre Recurso Inominado (15 dias da ciência).',
    resp: 'Kariny Barbosa', prioridade: '🔴 Alta'
  });

  // ── B3. WALLACE × DETRAN (0804503-97) — NOVO ────
  todasLinhas = abaProc.getDataRange().getValues();
  const existeWallace = todasLinhas.some(r => normNum_(String(r[0])) === normNum_('0804503-97.2025.8.19.0083'));
  if (!existeWallace) {
    inserirProcessoGenerico_(abaProc, cabRow, headers, {
      num:         '0804503-97.2025.8.19.0083',
      cliente:     'Wallace da Rosa Candido',
      area:        'Direito Administrativo / Trânsito',
      tipo:        'Procedimento Comum Cível — Indenização por Dano Moral',
      orgao:       '5º Núcleo de Justiça 4.0 — Causas Fazendárias até 60 SM — TJRJ',
      fase:        'Instrução',
      poloAtivo:   'Wallace da Rosa Candido',
      poloPassivo: 'DETRAN — Departamento de Trânsito do Estado do Rio de Janeiro e Outros',
      distrib:     '15/11/2025',
      ultMov:      '22/06/2026',
      descMov:     '22/06/2026 00:47 — Decorrido prazo do DETRAN em 19/06/2026 23:59 — Prazo da parte ré encerrado (PJe Push TJRJ 23/06/2026)',
      tipoPrazo:   'Prazo Processual',
      resp:        'Luiz Fernando / Kariny Barbosa',
      obs:         'Autuado em 15/11/2025. Prazo do DETRAN decorrido — verificar revelia ou despacho.'
    });
  }
  appendAgenda_(abaAg, {
    data: '30/06/2026', tipo: 'Prazo Processual',
    proc: '0804503-97.2025.8.19.0083 — Wallace × DETRAN e Outros',
    cliente: 'Wallace da Rosa Candido',
    tribunal: '5º Núcleo Justiça 4.0 — Causas Fazendárias — TJRJ',
    desc: 'Prazo do DETRAN DECORRIDO em 19/06/2026. Verificar despacho do juiz — possível decretação de revelia. Acessar PJe/TJRJ.',
    resp: 'Luiz Fernando / Kariny Barbosa', prioridade: '🟠 Alta'
  });

  SpreadsheetApp.getUi().alert(
    '✅ Todas as atualizações pendentes aplicadas!\n\n' +
    'BLOCO A — E-mails 17–20/06:\n' +
    '• Wilber × União (5002092-77): intimação Evento 11 — prazo 11/07\n' +
    '• Bruna/Luisa × Estado RJ (3110375-04): processo novo inserido\n\n' +
    'BLOCO B — E-mails 23/06:\n' +
    '• Ademir × GOL (0812492-61): movimentação 22/06 registrada\n' +
    '• Vitor × Azul (0862248-73): ⚠️ IMPROCEDENTE — prazo recurso 07/07\n' +
    '• Wallace × DETRAN (0804503-97): processo novo inserido\n\n' +
    '⚠️ URGENTE: verificar recurso do Vitor (Azul) — prazo 07/07/2026!'
  );
}

// Helper interno: insere novo processo na aba Processos
function inserirProcessoGenerico_(aba, cabRow, headers, p) {
  const linhas = aba.getDataRange().getValues();
  let linhaIns = linhas.length + 1;
  for (let r = cabRow + 1; r < linhas.length; r++) {
    const v = String(linhas[r][0]).trim();
    if (v === '' || v.startsWith('⚖')) { linhaIns = r + 1; break; }
  }
  const nova = new Array(headers.length).fill('');
  function s(col, val) { const i = headers.indexOf(col); if (i >= 0) nova[i] = val || ''; }
  s('Nº Processo',             p.num);
  s('ID',                      '—');
  s('Cliente',                 p.cliente);
  s('Área',                    p.area);
  s('Tipo de Ação',            p.tipo);
  s('Tribunal / Órgão',        p.orgao);
  s('Status',                  'Ativo');
  s('Fase',                    p.fase);
  s('Polo Ativo',              p.poloAtivo);
  s('Polo Passivo',            p.poloPassivo);
  s('Valor',                   'A definir');
  s('Distribuição',            p.distrib);
  s('Últ. Mov.',               p.ultMov);
  s('Desc. Últ. Movimentação', p.descMov);
  s('Tipo Prazo',              p.tipoPrazo);
  s('Responsável',             p.resp);
  s('Observações',             p.obs);
  aba.insertRowBefore(linhaIns);
  aba.getRange(linhaIns, 1, 1, nova.length).setValues([nova]);
  Logger.log('Inserido: ' + p.num + ' (' + p.cliente + ')');
}


// ████████████████████████████████████████████████████████████
// FASE 1 — KPIs / PASTAS / PRAZOS / BACKUP / MIGRAÇÃO
// ████████████████████████████████████████████████████████████

// ============================================================
// SINCRONIZAÇÃO DE KPIs
// ============================================================
function atualizarKPIs() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const totalProspectos = contarProspectosAtivos(ss);
    const totalClientes   = contarLinhas(ss, 'Clientes',  8,  'Ativo',  'CLI-');
    const totalProcessos  = contarLinhas(ss, 'Processos', 7,  'Ativo',  '');
    const prazosNaSemana  = contarPrazosNaSemana(ss);

    // Novos KPIs de agenda (FASE 3)
    const kpis = _f3_kpisAgenda_(ss);

    const dash = getSheet_(ss, 'Dashboard');
    if (dash) {
      // KPIs originais: linha 3, cols A/E/I/M
      dash.getRange('A3').setValue(totalProspectos);
      dash.getRange('E3').setValue(totalClientes);
      dash.getRange('I3').setValue(totalProcessos);
      dash.getRange('M3').setValue(prazosNaSemana);

      // KPIs de agenda: linha 3, cols Q/U/Y/AC/AG/AK/AO
      // (adicionar labels nessas células no Dashboard para visualização)
      dash.getRange('Q3').setValue(kpis.hoje);
      dash.getRange('U3').setValue(kpis.amanha);
      dash.getRange('Y3').setValue(kpis.semana);
      dash.getRange('AC3').setValue(kpis.vencidos);
      dash.getRange('AG3').setValue(kpis.semResp);
      dash.getRange('AK3').setValue(kpis.pendConf);
      dash.getRange('AO3').setValue(kpis.processosParados);
    }

    SpreadsheetApp.flush();
    registrarLog('KPIs atualizados: Prospectos=' + totalProspectos
      + ' | Clientes=' + totalClientes
      + ' | Processos=' + totalProcessos
      + ' | Prazos/semana=' + prazosNaSemana
      + ' | Hoje=' + kpis.hoje
      + ' | Amanhã=' + kpis.amanha
      + ' | 7d=' + kpis.semana
      + ' | Vencidos=' + kpis.vencidos
      + ' | SemResp=' + kpis.semResp
      + ' | PendConf=' + kpis.pendConf
      + ' | Parados=' + kpis.processosParados);

  } catch (err) {
    registrarLog('ERRO atualizarKPIs: ' + err.message);
  }
}

function contarProspectosAtivos(ss) {
  const aba = getSheet_(ss, 'Prospectos');
  if (!aba) return 0;
  const dados = aba.getDataRange().getValues();
  const ESTAGIOS_INATIVOS = ['Convertido', 'Perdido', 'Descartado', 'Encerrado'];
  let count = 0;
  for (let i = 1; i < dados.length; i++) {
    const id     = String(dados[i][0]).trim();
    const estagio = String(dados[i][7]).trim(); // Coluna H = Estágio
    if (!id.startsWith('PRO-')) continue;
    if (!ESTAGIOS_INATIVOS.includes(estagio)) count++;
  }
  return count;
}

function contarLinhas(ss, nomeAba, colStatus, valorStatus, prefixoId) {
  const aba = getSheet_(ss, nomeAba);
  if (!aba) return 0;
  const dados = aba.getDataRange().getValues();
  let count = 0;
  for (let i = 1; i < dados.length; i++) {
    const id     = String(dados[i][0]).trim();
    const status = String(dados[i][colStatus - 1]).trim();
    if (!id || id.startsWith('ID') || id.startsWith('Nº') || id.startsWith('⚖')) continue;
    if (prefixoId && !id.startsWith(prefixoId)) continue;
    if (status === valorStatus) count++;
  }
  return count;
}

function contarPrazosNaSemana(ss) {
  const aba = getSheet_(ss, 'Agenda');
  if (!aba) return 0;
  const dados = aba.getDataRange().getValues();
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const fimSemana = new Date(hoje); fimSemana.setDate(hoje.getDate() + 7);
  let count = 0;
  for (let i = 1; i < dados.length; i++) {
    const celData = dados[i][0];
    const status  = String(dados[i][8]).trim(); // Coluna I = Status
    if (!celData || status === 'Realizado' || status === 'Cancelado') continue;
    if (String(celData).includes('AGENDA')) continue; // Linha seção
    const data = new Date(celData); if (isNaN(data.getTime())) continue;
    data.setHours(0,0,0,0);
    if (data >= hoje && data <= fimSemana) count++;
  }
  return count;
}

// ============================================================
// CRIAÇÃO AUTOMÁTICA DE PASTA AO CADASTRAR CLIENTE
// ============================================================
function onEditTrigger(e) {
  try {
    const sheet = e.source.getActiveSheet();
    if (!ehAba_(sheet, 'Clientes')) return;

    const row = e.range.getRow();
    const col = e.range.getColumn();

    // Linha de dados começa na linha 5 (linhas 1-4 são cabeçalho)
    // Coluna B (2) = Nome / Razão Social
    if (row < 5 || col !== 2) return;

    const nome = String(sheet.getRange(row, 2).getValue()).trim();
    const area = String(sheet.getRange(row, 9).getValue()).trim() || 'A Definir';
    const id   = String(sheet.getRange(row, 1).getValue()).trim();

    if (!nome || !id.startsWith('CLI-')) return;

    const nomePasta = nome + ' — ' + area;
    const resultado = criarPastaComSubpastas(nomePasta);

    if (resultado.criada) {
      // Registra o link da pasta na coluna Observações (col R = 18)
      const obsAtual = sheet.getRange(row, 18).getValue();
      if (!obsAtual) {
        sheet.getRange(row, 18).setValue('📁 ' + resultado.url);
      }
      registrarLog('PASTA CRIADA automaticamente: ' + nomePasta);
    }

    // Não recalcula KPIs de forma síncrona a cada célula editada
    // (colar várias linhas dispararia N recálculos). Marca como
    // "sujo" e agenda um único recálculo ~1 min depois.
    marcarKPIsParaRecalculo_();

  } catch (err) {
    registrarLog('ERRO onEditTrigger: ' + err.message);
  }
}

function criarPastaComSubpastas(nomePasta) {
  const pastaClientes = DriveApp.getFolderById(CFG.PASTA_CLIENTES_ID);

  // Evita duplicata
  const iter = pastaClientes.getFoldersByName(nomePasta);
  if (iter.hasNext()) {
    const existente = iter.next();
    return { criada: false, url: existente.getUrl() };
  }

  // Cria pasta principal
  const nova = pastaClientes.createFolder(nomePasta);

  // Cria 5 subpastas padrão
  CFG.SUBPASTAS.forEach(function(sub) { nova.createFolder(sub); });

  return { criada: true, url: nova.getUrl() };
}

// ============================================================
// ALERTAS DE PRAZO POR E-MAIL (diário, 8h)
// ============================================================
function verificarPrazos() {
  try {
    const ss  = SpreadsheetApp.getActiveSpreadsheet();
    const aba = getSheet_(ss, 'Agenda');
    if (!aba) return;

    const linhas = aba.getDataRange().getValues();
    const cab    = encontrarCabecalho_(linhas, 'Data');
    if (!cab) {
      registrarLog('verificarPrazos: cabeçalho não encontrado na aba Agenda.');
      return;
    }

    const h = cab.headers;
    // Suporta tanto o layout antigo quanto o SCHEMA novo
    const colDt  = h.indexOf('Data') >= 0 ? h.indexOf('Data') : h.indexOf('Data fatal');
    const colSt  = h.indexOf('Status');
    const colTp  = h.indexOf('Tipo') >= 0 ? h.indexOf('Tipo') : h.indexOf('Tipo de prazo');
    const colPrc = h.indexOf('Nº Processo / Ref.') >= 0
                   ? h.indexOf('Nº Processo / Ref.') : h.indexOf('Processo vinculado');
    const colCli = h.indexOf('Cliente');
    const colDsc = h.indexOf('Descrição');
    const colRsp = h.indexOf('Responsável');
    const colPri = h.indexOf('Prioridade');
    const colCnf = h.indexOf('Confirmado por humano');
    const colAlt = h.indexOf('Enviado alerta');
    if (colDt < 0) { registrarLog('verificarPrazos: coluna "Data" não encontrada.'); return; }

    const hoje   = new Date(); hoje.setHours(0, 0, 0, 0);
    const limite = new Date(hoje); limite.setDate(hoje.getDate() + CFG.DIAS_ALERTA);

    const urgentes = []; // ≤ F3.DIAS_URGENTE dias, confirmados
    const normais  = []; // 3–CFG.DIAS_ALERTA dias, confirmados
    const vencidos = []; // já passaram, status aberto
    const naoConf  = []; // "Pendente de conferência" dentro da janela de alerta

    const idxParaMarcar = [];

    for (let i = cab.cabRow + 1; i < linhas.length; i++) {
      const celData = linhas[i][colDt];
      const status  = colSt >= 0 ? String(linhas[i][colSt] || '').trim() : '';
      if (!celData || String(celData).includes('AGENDA')) continue;
      if (status === F3.STATUS_REALIZADO || status === F3.STATUS_CANCELADO) continue;

      const data = new Date(celData);
      if (isNaN(data.getTime())) continue;
      data.setHours(0, 0, 0, 0);

      // Fora da janela de alerta — sem limites negativos (vencidos sempre inclusos)
      if (data > limite) continue;

      const dias = Math.ceil((data - hoje) / 86400000);
      const item = {
        linha      : i + 1,
        data       : data,
        dias       : dias,
        tipo       : colTp  >= 0 ? String(linhas[i][colTp]  || '').trim() : '',
        processo   : colPrc >= 0 ? String(linhas[i][colPrc] || '').trim() : '',
        cliente    : colCli >= 0 ? String(linhas[i][colCli] || '').trim() : '',
        descricao  : colDsc >= 0 ? String(linhas[i][colDsc] || '').trim() : '',
        responsavel: colRsp >= 0 ? String(linhas[i][colRsp] || '').trim() : '',
        prioridade : colPri >= 0 ? String(linhas[i][colPri] || '').trim() : '',
        confirmado : colCnf >= 0 ? String(linhas[i][colCnf] || '').trim() : '',
        status     : status
      };

      if (status === F3.STATUS_PENDENTE) {
        naoConf.push(item);        // pendente de conferência humana
      } else if (dias < 0) {
        vencidos.push(item);
      } else if (dias <= F3.DIAS_URGENTE) {
        urgentes.push(item);
      } else {
        normais.push(item);
      }

      idxParaMarcar.push(i);
    }

    if (!urgentes.length && !normais.length && !vencidos.length && !naoConf.length) {
      registrarLog('verificarPrazos: nenhum prazo a alertar hoje.');
      return;
    }

    _f3_enviarEmailPrazos_(urgentes, normais, vencidos, naoConf, ss.getId());

    // Registra "Enviado alerta" nas linhas onde o campo existe e ainda não foi preenchido
    if (colAlt >= 0) {
      const ts = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
      idxParaMarcar.forEach(function(i) {
        if (!String(linhas[i][colAlt] || '').trim()) {
          aba.getRange(i + 1, colAlt + 1).setValue(ts);
        }
      });
    }

  } catch (err) {
    registrarLog('ERRO verificarPrazos: ' + err.message);
  }
}

function _enviarEmailPrazos(urgentes, normais, vencidos, ssId) {
  const hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy');

  function tabelaItens(itens, corHeader) {
    let t = '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
      + '<tr style="background:' + corHeader + ';color:#fff;">'
      + '<th style="padding:7px 10px;text-align:left;">Data</th>'
      + '<th style="padding:7px 10px;text-align:left;">Cliente</th>'
      + '<th style="padding:7px 10px;text-align:left;">Ação Necessária</th>'
      + '<th style="padding:7px 10px;text-align:left;">Responsável</th>'
      + '</tr>';
    itens.forEach(function(p, idx) {
      const bg  = idx % 2 === 0 ? '#ffffff' : '#f9f9f9';
      const dt  = Utilities.formatDate(p.data, 'America/Sao_Paulo', 'dd/MM/yyyy');
      const lag = p.dias < 0
        ? '<span style="color:#c62828;font-weight:bold;">' + Math.abs(p.dias) + 'd VENCIDO</span>'
        : '<strong>' + dt + '</strong> (' + p.dias + 'd)';
      t += '<tr style="background:' + bg + ';">'
        + '<td style="padding:7px 10px;">' + lag + '</td>'
        + '<td style="padding:7px 10px;">' + p.cliente + '</td>'
        + '<td style="padding:7px 10px;">' + p.descricao + '</td>'
        + '<td style="padding:7px 10px;">' + p.responsavel + '</td>'
        + '</tr>';
    });
    return t + '</table>';
  }

  let corpo = '<div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;">'
    + '<div style="background:#1a237e;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">'
    + '<h2 style="margin:0 0 4px;">⚖️ Neves Marques Advocacia</h2>'
    + '<p style="margin:0;font-size:14px;">Relatório de Prazos — ' + hoje + '</p>'
    + '</div>';

  if (vencidos.length) {
    corpo += '<div style="background:#fce4ec;border-left:5px solid #880e4f;padding:16px 20px;margin:12px 0;">'
      + '<h3 style="margin:0 0 10px;color:#880e4f;">⛔ VENCIDOS — ' + vencidos.length + ' prazo(s) em atraso</h3>'
      + tabelaItens(vencidos, '#880e4f') + '</div>';
  }

  if (urgentes.length) {
    corpo += '<div style="background:#ffebee;border-left:5px solid #c62828;padding:16px 20px;margin:12px 0;">'
      + '<h3 style="margin:0 0 10px;color:#c62828;">🔴 URGENTE — ' + urgentes.length + ' prazo(s) em até 2 dias</h3>'
      + tabelaItens(urgentes, '#c62828') + '</div>';
  }

  if (normais.length) {
    corpo += '<div style="background:#fff8e1;border-left:5px solid #f57f17;padding:16px 20px;margin:12px 0;">'
      + '<h3 style="margin:0 0 10px;color:#f57f17;">🟡 ATENÇÃO — ' + normais.length + ' prazo(s) nos próximos 7 dias</h3>'
      + tabelaItens(normais, '#f57f17') + '</div>';
  }

  corpo += '<div style="background:#f5f5f5;padding:14px 20px;border-radius:0 0 8px 8px;font-size:12px;color:#666;">'
    + '<a href="https://docs.google.com/spreadsheets/d/' + ssId + '" style="color:#1a237e;font-weight:bold;">📊 Abrir Dashboard</a>'
    + ' &nbsp;|&nbsp; Neves Marques Advocacia — OAB/RJ 253.413 · OAB/RJ 241.456'
    + '</div></div>';

  const numUrgentes = vencidos.length + urgentes.length;
  const assunto = numUrgentes > 0
    ? '🔴 URGENTE: ' + numUrgentes + ' prazo(s) crítico(s) — ' + hoje
    : '🟡 ' + normais.length + ' prazo(s) esta semana — ' + hoje;

  const destinos = [CFG.EMAIL_LUIZ, CFG.EMAIL_KARINY]
    .filter(function(e) { return e && !e.includes('PREENCHA'); })
    .join(',');

  if (destinos) {
    GmailApp.sendEmail(destinos, assunto, 'Visualize em HTML.', { htmlBody: corpo });
    registrarLog('E-mail de prazos enviado para: ' + destinos
      + ' | Vencidos=' + vencidos.length
      + ' Urgentes=' + urgentes.length
      + ' Normais=' + normais.length);
  }
}

// ============================================================
// BACKUP SEMANAL
// ============================================================
function backupSemanal() {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const hoje  = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd HH-mm');
    const nome  = 'Dashboard - Escritório [Backup ' + hoje + ']';
    const arq   = DriveApp.getFileById(ss.getId());
    const pasta = _pastaBackups_(arq);
    arq.makeCopy(nome, pasta);
    registrarLog('Backup criado: ' + nome + ' (pasta: ' + pasta.getName() + ')');
    _expurgarBackupsAntigos_(pasta, CFG.MAX_BACKUPS);
  } catch (err) {
    registrarLog('ERRO backupSemanal: ' + err.message);
  }
}

// Localiza (ou cria) uma subpasta dedicada de backups na mesma pasta
// onde o Dashboard está; cai para a raiz do Drive se não houver pai.
function _pastaBackups_(arqPlanilha) {
  const NOME = '🗄️ Backups - Dashboard';
  const pais = arqPlanilha.getParents();
  const parent = pais.hasNext() ? pais.next() : DriveApp.getRootFolder();
  const it = parent.getFoldersByName(NOME);
  return it.hasNext() ? it.next() : parent.createFolder(NOME);
}

// Mantém apenas os N backups mais recentes; manda o excedente p/ lixeira.
function _expurgarBackupsAntigos_(pasta, manter) {
  manter = manter || 8;
  const arquivos = [];
  const it = pasta.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (it.hasNext()) {
    const f = it.next();
    if (f.getName().indexOf('[Backup') !== -1) {
      arquivos.push({ f: f, data: f.getDateCreated() });
    }
  }
  arquivos.sort(function(a, b) { return b.data - a.data; }); // mais recente primeiro
  for (let i = manter; i < arquivos.length; i++) {
    arquivos[i].f.setTrashed(true);
    registrarLog('Backup antigo p/ lixeira: ' + arquivos[i].f.getName());
  }
}

// ============================================================
// MIGRAÇÃO: RENOMEAR PASTAS EXISTENTES (rodar 1x)
// ============================================================
function migrarRenomearPastas() {
  const raiz   = DriveApp.getFolderById(CFG.PASTA_CLIENTES_ID);
  const iter   = raiz.getFolders();
  const log    = [];
  let renomeadas = 0;

  while (iter.hasNext()) {
    const pasta     = iter.next();
    const nomeAtual = pasta.getName().trim(); // remove espaços extras
    const mapa      = CFG.RENOMEAR[nomeAtual];

    if (mapa) {
      const novoNome = mapa.nome + ' — ' + mapa.area;
      if (pasta.getName() !== novoNome) {
        pasta.setName(novoNome);
        log.push('✅ "' + nomeAtual + '"  →  "' + novoNome + '"');
        renomeadas++;
      } else {
        log.push('✔ Já correto: "' + novoNome + '"');
      }
    } else {
      log.push('⏭ Sem mapeamento — mantida: "' + nomeAtual + '"');
    }
  }

  const resumo = renomeadas + ' pasta(s) renomeada(s).\n\n' + log.join('\n');
  SpreadsheetApp.getUi().alert('Migração de Nomes — Resultado', resumo,
    SpreadsheetApp.getUi().ButtonSet.OK);
  registrarLog('migrarRenomearPastas: ' + renomeadas + ' renomeadas.\n' + log.join('\n'));
}

// ============================================================
// MIGRAÇÃO: CRIAR SUBPASTAS EM TODAS AS PASTAS (rodar 1x)
// ============================================================
function migrarCriarSubpastas() {
  const raiz = DriveApp.getFolderById(CFG.PASTA_CLIENTES_ID);
  const iter = raiz.getFolders();
  const log  = [];
  let totalCriadas = 0;

  while (iter.hasNext()) {
    const pasta   = iter.next();
    const criadas = [];
    const existem = [];

    CFG.SUBPASTAS.forEach(function(sub) {
      const subIter = pasta.getFoldersByName(sub);
      if (subIter.hasNext()) {
        existem.push(sub);
      } else {
        pasta.createFolder(sub);
        criadas.push(sub);
        totalCriadas++;
      }
    });

    log.push('📁 ' + pasta.getName()
      + '\n   + Criadas: ' + (criadas.length ? criadas.join(', ') : 'nenhuma (todas já existiam)')
      + (existem.length ? '\n   ✔ Já existiam: ' + existem.join(', ') : ''));
  }

  const resumo = totalCriadas + ' subpasta(s) criada(s).\n\n' + log.join('\n\n');
  SpreadsheetApp.getUi().alert('Migração de Subpastas — Resultado', resumo,
    SpreadsheetApp.getUi().ButtonSet.OK);
  registrarLog('migrarCriarSubpastas: ' + totalCriadas + ' criadas.');
}


// ████████████████████████████████████████████████████████████
// FASE 2 — GERAÇÃO DE DOCUMENTOS (Procuração / Contrato)
// ████████████████████████████████████████████████████████████

function gerarProcuracao() {
  _gerarDocumento('PROCURACAO');
}

function gerarContrato() {
  _gerarDocumento('CONTRATO');
}

function _gerarDocumento(tipo) {
  const ui = SpreadsheetApp.getUi();

  try {
    const ss  = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getActiveSheet();

    // Valida que o usuário está na aba Clientes
    if (!ehAba_(aba, 'Clientes')) {
      ui.alert('⚠️ Atenção',
        'Para gerar um documento, primeiro selecione uma linha na aba "Clientes".',
        ui.ButtonSet.OK);
      return;
    }

    const row = ss.getActiveRange().getRow();
    if (row < 5) {
      ui.alert('⚠️ Atenção',
        'Selecione a linha de um cliente (linhas de dados começam na linha 5).',
        ui.ButtonSet.OK);
      return;
    }

    // Lê e parseia os dados do cliente
    const dados = _lerDadosCliente(aba, row);

    if (!dados.nome) {
      ui.alert('⚠️ Cliente não identificado',
        'A coluna "Nome" está vazia nesta linha. Preencha os dados do cliente antes de gerar o documento.',
        ui.ButtonSet.OK);
      return;
    }

    // Confirma a ação com o usuário
    const nomeTipo = tipo === 'PROCURACAO' ? 'Procuração Ad Judicia' : 'Contrato de Honorários';
    const conf = ui.alert(
      '📄 Gerar ' + nomeTipo,
      'Deseja gerar ' + nomeTipo + ' para:\n\n'
      + '👤 Cliente: ' + dados.nome + '\n'
      + '📋 Contrato: ' + (dados.nrContrato || '—') + '\n'
      + '⚖️ Área: ' + (dados.area || '—') + '\n'
      + '👨‍⚖️ Responsável: ' + (dados.responsavel || '—') + '\n\n'
      + 'O documento será salvo em:\n📁 ' + dados.nome + ' / 📋 Contratos e Procurações',
      ui.ButtonSet.YES_NO);

    if (conf !== ui.Button.YES) return;

    // Localiza subpasta do cliente
    const pastaDestino = _localizarSubpasta(dados.nome, '📋 Contratos e Procurações');

    // Define o nome do arquivo
    const dataStr  = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
    const nomeArq  = nomeTipo + ' — ' + dados.nome + ' — ' + dataStr;

    // Copia o template para a pasta do cliente
    const pasta = pastaDestino || DriveApp.getFolderById(CFG.PASTA_CLIENTES_ID);
    const copia = DriveApp.getFileById(TEMPLATES[tipo]).makeCopy(nomeArq, pasta);

    // Abre e preenche os marcadores
    const doc = DocumentApp.openById(copia.getId());
    _substituirMarcadores(doc, dados);
    doc.saveAndClose();

    registrarLog('Documento gerado: ' + nomeTipo
      + ' | Cliente: ' + dados.nome
      + ' | ID: ' + dados.id);

    // Exibe o link do documento gerado
    ui.alert('✅ Documento gerado com sucesso!',
      nomeTipo + ' para ' + dados.nome + ' foi criado.\n\n'
      + '📂 Salvo em: 📋 Contratos e Procurações\n\n'
      + 'Acesse e revise antes de imprimir:\n'
      + copia.getUrl(),
      ui.ButtonSet.OK);

  } catch (err) {
    registrarLog('ERRO _gerarDocumento (' + tipo + '): ' + err.message);
    ui.alert('❌ Erro',
      'Ocorreu um erro ao gerar o documento:\n' + err.message
      + '\n\nVerifique o Log para detalhes.',
      ui.ButtonSet.OK);
  }
}

// Colunas da aba Clientes:
// A=ID  B=Nome  C=CPF  D=Nascimento  E=Endereço  F=Telefone  G=Email
// H=Status  I=Área  J=Nº Contrato  K=Início  L=Tipo Honorário
// M=Valor  N=Forma Pgto  O=Vencimento  P=Responsável  Q=Como Conheceu  R=Obs
function _lerDadosCliente(aba, row) {
  const r = aba.getRange(row, 1, 1, 18).getValues()[0];

  const id          = String(r[0]  || '').trim();
  const nome        = String(r[1]  || '').trim();
  const cpf         = String(r[2]  || '').trim();
  const nascimento  = r[3] ? Utilities.formatDate(new Date(r[3]), 'America/Sao_Paulo', 'dd/MM/yyyy') : '—';
  const endereco    = String(r[4]  || '').trim();
  const telefone    = String(r[5]  || '').trim();
  const email       = String(r[6]  || '').trim();
  const area        = String(r[8]  || '').trim();
  const nrContrato  = String(r[9]  || '').trim();
  const tipoHon     = String(r[11] || '').trim();
  const valorHon    = String(r[12] || '').trim();
  const formaPgto   = String(r[13] || '').trim();
  const vencimento  = String(r[14] || '').trim();
  const responsavel = String(r[15] || '').trim();
  const obs         = String(r[17] || '').trim();

  // Parseia campos adicionais das Observações
  const estadoCivil = _extrairEstadoCivil(obs);
  const profissao   = _extrairProfissao(obs);
  const rg          = _extrairRG(obs);
  const causa       = _extrairCausa(obs, area, nome);
  const cidade      = _extrairCidade(endereco);

  // OAB do advogado responsável
  const oab = responsavel.toLowerCase().includes('kariny')
    ? 'OAB/RJ nº 241.456'
    : 'OAB/RJ nº 253.413';

  return {
    id, nome, cpf, nascimento, endereco, telefone, email,
    area, nrContrato, tipoHon, valorHon, valor: valorHon, formaPgto, vencimento,
    responsavel, obs, estadoCivil, profissao, rg, causa, cidade, oab
  };
}

function _extrairEstadoCivil(obs) {
  const padroes = ['Solteiro', 'Solteira', 'Casado', 'Casada',
                   'Divorciado', 'Divorciada', 'Viúvo', 'Viúva',
                   'Separado', 'Separada', 'União Estável'];
  for (let i = 0; i < padroes.length; i++) {
    if (obs.toLowerCase().indexOf(padroes[i].toLowerCase()) !== -1) return padroes[i];
  }
  return 'Estado civil não informado';
}

function _extrairProfissao(obs) {
  const match = obs.match(/(?:Solteiro[a]?|Casado[a]?|Divorciado[a]?|Viúvo[a]?|Separado[a]?)[,\s]+([^—\n\-]+)/i);
  if (match && match[1]) return match[1].trim().replace(/^[,\s]+/, '');
  return 'Profissão não informada';
}

function _extrairRG(obs) {
  const match = obs.match(/\bRG[:\s]+([0-9A-Za-z.\-\/]+(?:\s+[A-Z\/]+)?)/i);
  return match ? match[1].trim() : 'RG não informado';
}

function _extrairCausa(obs, area, nome) {
  const matchProc = obs.match(/(?:proc\.?|processo[:\s])\s*([\d]{4,7}[\d.\-]+)/i);
  if (matchProc) return (area || 'Ação judicial') + ' — Processo nº ' + matchProc[1].trim();
  if (area) return area;
  return 'Matéria jurídica a especificar';
}

function _extrairCidade(endereco) {
  const match = endereco.match(/,\s*([^,\/]+)\/[A-Z]{2}/);
  if (match) return match[1].trim();
  return ESCRITORIO.CIDADE;
}

function _substituirMarcadores(doc, dados) {
  const agora      = new Date();
  const dataExtenso = _dataExtenso(agora);
  const dataGeracao = Utilities.formatDate(agora, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');

  const map = {
    'ID_CLIENTE'           : dados.id            || '—',
    'NOME_CLIENTE'         : dados.nome          || '—',
    'ESTADO_CIVIL'         : dados.estadoCivil   || '—',
    'PROFISSAO'            : dados.profissao     || '—',
    'CPF_CLIENTE'          : dados.cpf           || '—',
    'RG_CLIENTE'           : dados.rg            || '—',
    'ENDERECO_CLIENTE'     : dados.endereco      || '—',
    'TELEFONE_CLIENTE'     : dados.telefone      || '—',
    'EMAIL_CLIENTE'        : dados.email         || '—',
    'AREA_DIREITO'         : dados.area          || '—',
    'NR_CONTRATO'          : dados.nrContrato    || '—',
    'TIPO_HONORARIO'       : dados.tipoHon       || '—',
    'VALOR_HONORARIO'      : dados.valorHon      || 'A definir',
    'FORMA_PAGAMENTO'      : dados.formaPgto     || '—',
    'VENCIMENTO'           : dados.vencimento    || '—',
    'ADVOGADO_RESPONSAVEL' : dados.responsavel   || '—',
    'OAB_ADVOGADO'         : dados.oab           || '—',
    'DESCRICAO_CAUSA'      : dados.causa         || '—',
    'CIDADE'               : dados.cidade        || ESCRITORIO.CIDADE,
    'DATA_EXTENSO'         : dataExtenso,
    'DATA_GERACAO'         : dataGeracao,
    'ENDERECO_ESCRITORIO'  : ESCRITORIO.ENDERECO,
    'COMARCA_FORO'         : ESCRITORIO.COMARCA
  };

  const body = doc.getBody();
  const chaves = Object.keys(map);
  for (let i = 0; i < chaves.length; i++) {
    const marcador = '{{' + chaves[i] + '}}';
    body.replaceText(marcador.replace(/\{/g, '\\{').replace(/\}/g, '\\}'), map[chaves[i]]);
  }
}

function _localizarSubpasta(nomeCliente, nomeSubpasta) {
  try {
    const raiz = DriveApp.getFolderById(CFG.PASTA_CLIENTES_ID);
    const iter = raiz.getFolders();

    // Fragmentos do nome para busca flexível (primeiro e último sobrenome)
    const partes     = nomeCliente.trim().split(/\s+/);
    const primeiroNome = partes[0].toLowerCase();
    const ultimoNome   = partes[partes.length - 1].toLowerCase();

    while (iter.hasNext()) {
      const pasta    = iter.next();
      const nomePasta = pasta.getName().toLowerCase();

      if (nomePasta.indexOf(primeiroNome) !== -1 ||
          (ultimoNome.length > 3 && nomePasta.indexOf(ultimoNome) !== -1)) {

        // Encontrou pasta do cliente — busca subpasta
        const subIter = pasta.getFoldersByName(nomeSubpasta);
        if (subIter.hasNext()) return subIter.next();

        // Cria subpasta se não existir
        registrarLog('Subpasta criada em ' + pasta.getName() + ': ' + nomeSubpasta);
        return pasta.createFolder(nomeSubpasta);
      }
    }
  } catch (err) {
    registrarLog('AVISO _localizarSubpasta: ' + err.message);
  }
  return null;
}

function _dataExtenso(data) {
  const meses = [
    'janeiro', 'fevereiro', 'março', 'abril',
    'maio', 'junho', 'julho', 'agosto',
    'setembro', 'outubro', 'novembro', 'dezembro'
  ];
  const d = data || new Date();
  return d.getDate() + ' de ' + meses[d.getMonth()] + ' de ' + d.getFullYear();
}


// ████████████████████████████████████████████████████████████
// FASE 3 — RELATÓRIO SEMANAL / INATIVOS / ANIVERSÁRIOS
// ████████████████████████████████████████████████████████████

function relatorioSemanal() {
  try {
    const ss   = SpreadsheetApp.getActiveSpreadsheet();
    const hoje = new Date();

    // Janela da semana (segunda a domingo)
    const seg = new Date(hoje);
    seg.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7)); // Segunda-feira
    seg.setHours(0,0,0,0);
    const dom = new Date(seg);
    dom.setDate(seg.getDate() + 6);
    dom.setHours(23,59,59,0);

    // Coleta dados de cada aba
    const kpis        = _r3_kpis(ss);
    const financeiro  = _r3_financeiro(ss);
    const agenda      = _r3_agenda(ss, seg, dom);
    const inativos    = _r3_processosInativos(ss);
    const porAdvogado = _r3_porAdvogado(ss);
    const porArea     = _r3_porArea(ss);
    const prospectos  = _r3_prospectos(ss);
    const aniversarios = _r3_aniversarios(ss, seg, dom);

    const html = _r3_html({
      kpis, financeiro, agenda, inativos, porAdvogado,
      porArea, prospectos, aniversarios, seg, dom
    });

    const dataStr  = Utilities.formatDate(hoje, 'America/Sao_Paulo', 'dd/MM/yyyy');
    const assunto  = '📊 Relatório Semanal — Neves Marques Advocacia — ' + dataStr;
    const destinos = _r3_destinos();

    if (destinos) {
      GmailApp.sendEmail(destinos, assunto, 'Visualize em HTML.', { htmlBody: html });
      registrarLog('Relatório semanal enviado: ' + dataStr);
    }
  } catch (err) {
    registrarLog('ERRO relatorioSemanal: ' + err.message);
  }
}

function _r3_kpis(ss) {
  return {
    prospectos : contarProspectosAtivos(ss),
    clientes   : contarLinhas(ss, 'Clientes',  8, 'Ativo', 'CLI-'),
    processos  : contarLinhas(ss, 'Processos', 7, 'Ativo', ''),
    prazos     : contarPrazosNaSemana(ss)
  };
}

function _r3_financeiro(ss) {
  const aba = getSheet_(ss, 'Financeiro');
  if (!aba) return { recebido: 0, pendente: 0 };

  const dados    = aba.getDataRange().getValues();
  const mesAtual = new Date().getMonth();
  const anoAtual = new Date().getFullYear();
  let recebido = 0, pendente = 0;

  for (let i = 1; i < dados.length; i++) {
    const valorStr = String(dados[i][9] || '').replace(/[R$\s\.]/g, '').replace(',', '.');
    const valor    = parseFloat(valorStr) || 0;
    const status   = String(dados[i][12] || '').trim();
    if (!valor) continue;

    if (status === 'Pago') {
      const pgto = dados[i][10] ? new Date(dados[i][10]) : null;
      if (pgto && pgto.getMonth() === mesAtual && pgto.getFullYear() === anoAtual) {
        recebido += valor;
      }
    } else if (status === 'Pendente' || status === 'Em aberto' || status === 'A receber') {
      pendente += valor;
    }
  }
  return { recebido, pendente };
}

function _r3_agenda(ss, inicio, fim) {
  const aba = getSheet_(ss, 'Agenda');
  if (!aba) return [];
  const dados  = aba.getDataRange().getValues();
  const result = [];

  for (let i = 1; i < dados.length; i++) {
    const celData = dados[i][0];
    const status  = String(dados[i][8] || '').trim();
    if (!celData || status === 'Realizado' || status === 'Cancelado') continue;
    if (String(celData).includes('AGENDA')) continue;

    const data = new Date(celData);
    if (isNaN(data.getTime())) continue;
    data.setHours(12,0,0,0);

    if (data >= inicio && data <= fim) {
      result.push({
        data       : data,
        tipo       : String(dados[i][2] || '').trim(),
        cliente    : String(dados[i][4] || '').trim(),
        descricao  : String(dados[i][6] || '').trim(),
        responsavel: String(dados[i][7] || '').trim(),
        prioridade : String(dados[i][9] || '').trim()
      });
    }
  }
  result.sort(function(a,b) { return a.data - b.data; });
  return result;
}

function _r3_processosInativos(ss) {
  const aba   = getSheet_(ss, 'Processos');
  if (!aba) return [];
  const dados = aba.getDataRange().getValues();
  const hoje  = new Date(); hoje.setHours(0,0,0,0);
  const result = [];

  for (let i = 1; i < dados.length; i++) {
    const nrProc = String(dados[i][0] || '').trim();
    const status = String(dados[i][6] || '').trim();
    const ultMov = dados[i][12]; // Coluna M = Últ. Mov.
    if (!nrProc || nrProc.startsWith('Nº') || nrProc.startsWith('⚖')) continue;
    if (status !== 'Ativo') continue;

    if (ultMov) {
      const dataUlt = new Date(ultMov);
      if (!isNaN(dataUlt.getTime())) {
        dataUlt.setHours(0,0,0,0);
        const diasParado = Math.floor((hoje - dataUlt) / 86400000);
        if (diasParado >= FASE3.DIAS_INATIVO) {
          result.push({
            processo   : nrProc,
            cliente    : String(dados[i][2] || '').trim(),
            fase       : String(dados[i][7] || '').trim(),
            ultMov     : dataUlt,
            diasParado : diasParado,
            responsavel: String(dados[i][19] || '').trim() // Coluna T
          });
        }
      }
    }
  }
  result.sort(function(a,b) { return b.diasParado - a.diasParado; });
  return result;
}

function _r3_porAdvogado(ss) {
  const dist = {};

  // Contagem de processos
  const abaP = getSheet_(ss, 'Processos');
  if (abaP) {
    abaP.getDataRange().getValues().forEach(function(row) {
      const nr   = String(row[0] || '').trim();
      const stat = String(row[6] || '').trim();
      const resp = String(row[19] || '').trim();
      if (!nr || nr.startsWith('Nº') || nr.startsWith('⚖') || !resp) return;
      if (stat !== 'Ativo') return;
      if (!dist[resp]) dist[resp] = { processos: 0, clientes: 0 };
      dist[resp].processos++;
    });
  }

  // Contagem de clientes
  const abaC = getSheet_(ss, 'Clientes');
  if (abaC) {
    abaC.getDataRange().getValues().forEach(function(row) {
      const id   = String(row[0] || '').trim();
      const stat = String(row[7] || '').trim();
      const resp = String(row[15] || '').trim();
      if (!id.startsWith('CLI-') || !resp) return;
      if (stat !== 'Ativo') return;
      if (!dist[resp]) dist[resp] = { processos: 0, clientes: 0 };
      dist[resp].clientes++;
    });
  }

  return dist;
}

function _r3_porArea(ss) {
  const aba  = getSheet_(ss, 'Processos');
  if (!aba) return {};
  const areas = {};
  aba.getDataRange().getValues().forEach(function(row) {
    const nr   = String(row[0] || '').trim();
    const stat = String(row[6] || '').trim();
    const area = String(row[3] || '').trim();
    if (!nr || nr.startsWith('Nº') || nr.startsWith('⚖') || !area) return;
    if (stat !== 'Ativo') return;
    areas[area] = (areas[area] || 0) + 1;
  });
  return areas;
}

function _r3_prospectos(ss) {
  const aba  = getSheet_(ss, 'Prospectos');
  if (!aba) return [];
  const INATIVOS = ['Convertido', 'Perdido', 'Descartado', 'Encerrado'];
  const result = [];
  aba.getDataRange().getValues().forEach(function(row) {
    const id      = String(row[0] || '').trim();
    const estagio = String(row[7] || '').trim();
    if (!id.startsWith('PRO-')) return;
    if (INATIVOS.indexOf(estagio) !== -1) return;
    result.push({
      nome       : String(row[1] || '').trim(),
      area       : String(row[4] || '').trim(),
      estagio    : estagio,
      prob       : String(row[8] || '').trim(),
      proxAcao   : String(row[9] || '').trim(),
      dataAcao   : row[10],
      responsavel: String(row[11] || '').trim()
    });
  });
  return result;
}

function _r3_aniversarios(ss, inicio, fim) {
  const aba = getSheet_(ss, 'Clientes');
  if (!aba) return [];
  const result = [];
  const anoAtual = new Date().getFullYear();
  aba.getDataRange().getValues().forEach(function(row) {
    const id   = String(row[0] || '').trim();
    const nasc = row[3];
    if (!id.startsWith('CLI-') || !nasc) return;
    const dataNasc = new Date(nasc);
    if (isNaN(dataNasc.getTime())) return;
    const aniv = new Date(anoAtual, dataNasc.getMonth(), dataNasc.getDate());
    aniv.setHours(12,0,0,0);
    if (aniv >= inicio && aniv <= fim) {
      result.push({
        nome       : String(row[1] || '').trim(),
        aniversario: aniv,
        telefone   : String(row[5] || '').trim(),
        responsavel: String(row[15] || '').trim()
      });
    }
  });
  return result;
}

function _r3_destinos() {
  return [CFG.EMAIL_LUIZ, CFG.EMAIL_KARINY]
    .filter(function(e) { return e && !e.includes('PREENCHA'); })
    .join(',');
}

function _r3_html(ctx) {
  const { kpis, financeiro, agenda, inativos, porAdvogado, porArea, prospectos, aniversarios, seg, dom } = ctx;

  const dtSeg = Utilities.formatDate(seg, 'America/Sao_Paulo', 'dd/MM/yyyy');
  const dtDom = Utilities.formatDate(dom, 'America/Sao_Paulo', 'dd/MM/yyyy');
  const ssId  = SpreadsheetApp.getActiveSpreadsheet().getId();

  function th(txt) {
    return '<th style="background:#37474f;color:#fff;padding:9px 12px;text-align:left;font-size:12px;">' + txt + '</th>';
  }
  function td(txt, extra) {
    return '<td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;' + (extra||'') + '">' + txt + '</td>';
  }
  function card(titulo, conteudo, corBorda) {
    const borda = corBorda ? 'border-left:5px solid ' + corBorda + ';' : '';
    return '<div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:20px 24px;margin:10px 0;' + borda + '">'
      + '<p style="margin:0 0 14px;font-weight:bold;color:#37474f;font-size:14px;">' + titulo + '</p>'
      + conteudo + '</div>';
  }
  function tabela(headers, linhas) {
    let t = '<table style="width:100%;border-collapse:collapse;"><tr>' + headers.map(th).join('') + '</tr>';
    linhas.forEach(function(cols, idx) {
      const bg = idx % 2 === 0 ? '#fff' : '#f9fafb';
      t += '<tr style="background:' + bg + ';">' + cols.map(function(c, ci) {
        return td(c.txt || c, c.style || '');
      }).join('') + '</tr>';
    });
    return t + '</table>';
  }
  function moeda(v) {
    return 'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function kpiBox(label, val, cor) {
    return '<div style="display:inline-block;background:' + cor + ';color:#fff;border-radius:8px;padding:16px 20px;margin:6px;text-align:center;min-width:120px;">'
      + '<div style="font-size:30px;font-weight:bold;">' + val + '</div>'
      + '<div style="font-size:11px;margin-top:4px;opacity:0.9;">' + label + '</div>'
      + '</div>';
  }

  let html = '<div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;">';

  html += '<div style="background:linear-gradient(135deg,#1a237e,#283593);color:#fff;padding:22px 26px;border-radius:8px 8px 0 0;">'
    + '<h2 style="margin:0 0 6px;">⚖️ Neves Marques Advocacia</h2>'
    + '<p style="margin:0;font-size:14px;opacity:0.9;">📊 Relatório Executivo Semanal — ' + dtSeg + ' a ' + dtDom + '</p>'
    + '</div>';

  html += '<div style="background:#fafafa;border:1px solid #e0e0e0;padding:20px;text-align:center;margin:10px 0;border-radius:8px;">'
    + kpiBox('Prospectos', kpis.prospectos, '#6a1b9a')
    + kpiBox('Clientes Ativos', kpis.clientes, '#1565c0')
    + kpiBox('Processos Ativos', kpis.processos, '#2e7d32')
    + kpiBox('Prazos esta Semana', kpis.prazos, kpis.prazos > 0 ? '#c62828' : '#546e7a')
    + '</div>';

  html += card('💰 RESUMO FINANCEIRO — MÊS ATUAL',
    tabela(['', 'Valor'], [
      [{ txt:'✅ Honorários Recebidos', style:'color:#2e7d32;font-weight:bold;' }, { txt: moeda(financeiro.recebido), style:'text-align:right;font-weight:bold;color:#2e7d32;' }],
      [{ txt:'⏳ Honorários Pendentes', style:'color:#e65100;' }, { txt: moeda(financeiro.pendente), style:'text-align:right;color:#e65100;' }],
      [{ txt:'📊 Total em Carteira', style:'font-weight:bold;' }, { txt: moeda(financeiro.recebido + financeiro.pendente), style:'text-align:right;font-weight:bold;' }]
    ])
  );

  const agendaConteudo = agenda.length === 0
    ? '<p style="color:#9e9e9e;font-style:italic;">Nenhum compromisso registrado para esta semana.</p>'
    : tabela(['Data', 'Tipo', 'Cliente', 'Ação Necessária', 'Responsável'],
        agenda.map(function(item) {
          const dt  = Utilities.formatDate(item.data, 'America/Sao_Paulo', 'dd/MM (EEE)');
          const cor = item.prioridade === '🔴 Alta' ? 'color:#c62828;font-weight:bold;'
                    : item.prioridade === '🟡 Média' ? 'color:#f57f17;' : '';
          return [
            { txt: dt, style: cor },
            item.tipo, item.cliente, item.descricao, item.responsavel
          ];
        }));
  html += card('📅 AGENDA DA SEMANA (' + agenda.length + ' item(ns))', agendaConteudo);

  if (inativos.length > 0) {
    const linhasInat = inativos.map(function(p) {
      const dtMov = Utilities.formatDate(p.ultMov, 'America/Sao_Paulo', 'dd/MM/yyyy');
      const cor   = p.diasParado > 60 ? 'color:#c62828;font-weight:bold;' : 'color:#e65100;font-weight:bold;';
      return [
        { txt: p.processo, style: 'font-size:11px;' },
        p.cliente, p.fase, dtMov,
        { txt: p.diasParado + 'd', style: cor },
        p.responsavel
      ];
    });
    html += card(
      '⚠️ PROCESSOS SEM MOVIMENTAÇÃO (+' + FASE3.DIAS_INATIVO + ' dias) — ' + inativos.length + ' processo(s)',
      tabela(['Processo', 'Cliente', 'Fase', 'Última Mov.', 'Parado', 'Resp.'], linhasInat),
      '#e65100'
    );
  }

  const respKeys = Object.keys(porAdvogado);
  if (respKeys.length > 0) {
    html += card('👥 DISTRIBUIÇÃO POR ADVOGADO',
      tabela(['Advogado', 'Clientes Ativos', 'Processos Ativos'],
        respKeys.map(function(r) {
          const d = porAdvogado[r];
          return [
            { txt: r, style: 'font-weight:bold;' },
            { txt: String(d.clientes || 0), style: 'text-align:center;' },
            { txt: String(d.processos || 0), style: 'text-align:center;' }
          ];
        })
      )
    );
  }

  const areasKeys = Object.keys(porArea).sort(function(a,b) { return porArea[b] - porArea[a]; });
  if (areasKeys.length > 0) {
    html += card('⚖️ PROCESSOS POR ÁREA DO DIREITO',
      tabela(['Área', 'Processos Ativos'],
        areasKeys.map(function(a) {
          return [a, { txt: String(porArea[a]), style: 'text-align:right;font-weight:bold;' }];
        })
      )
    );
  }

  if (prospectos.length > 0) {
    html += card('🎯 FUNIL DE CONVERSÃO (' + prospectos.length + ' prospecto(s))',
      tabela(['Nome', 'Área', 'Estágio', 'Prob.', 'Próxima Ação', 'Resp.'],
        prospectos.map(function(p) {
          const dtAcao = p.dataAcao ? Utilities.formatDate(new Date(p.dataAcao), 'America/Sao_Paulo', 'dd/MM') : '—';
          return [
            { txt: p.nome, style: 'font-weight:bold;' },
            p.area, p.estagio,
            { txt: p.prob, style: 'text-align:center;' },
            p.proxAcao + ' (' + dtAcao + ')',
            p.responsavel
          ];
        })
      ),
      '#6a1b9a'
    );
  }

  if (aniversarios.length > 0) {
    html += card('🎂 ANIVERSÁRIOS DESTA SEMANA',
      tabela(['Cliente', 'Data', 'Telefone', 'Responsável'],
        aniversarios.map(function(a) {
          const dt = Utilities.formatDate(a.aniversario, 'America/Sao_Paulo', 'dd/MM (EEEE)');
          return [
            { txt: a.nome, style: 'font-weight:bold;' },
            { txt: '🎂 ' + dt, style: 'color:#7b1fa2;' },
            a.telefone, a.responsavel
          ];
        })
      ),
      '#7b1fa2'
    );
  }

  const agora = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
  html += '<div style="background:#37474f;color:#cfd8dc;padding:16px 24px;border-radius:0 0 8px 8px;font-size:12px;">'
    + '<a href="https://docs.google.com/spreadsheets/d/' + ssId + '" style="color:#90caf9;font-weight:bold;">📊 Abrir Dashboard</a>'
    + ' &nbsp;|&nbsp; Luiz Fernando OAB/RJ 253.413 · Kariny Barbosa OAB/RJ 241.456'
    + '<br><span style="opacity:0.6;">Gerado automaticamente em ' + agora + '</span>'
    + '</div></div>';

  return html;
}

// ----- Alerta de processos sem movimentação -----
function alertarProcessosSemMovimento() {
  try {
    const ss      = SpreadsheetApp.getActiveSpreadsheet();
    const inativos = _r3_processosInativos(ss);

    if (inativos.length === 0) {
      registrarLog('alertarProcessosSemMovimento: nenhum processo inativo.');
      try {
        SpreadsheetApp.getUi().alert('✅ Tudo em dia!',
          'Nenhum processo sem movimentação há mais de ' + FASE3.DIAS_INATIVO + ' dias.',
          SpreadsheetApp.getUi().ButtonSet.OK);
      } catch(e) {}
      return;
    }

    const hoje    = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy');
    const assunto = '⚠️ ' + inativos.length + ' processo(s) sem movimentação há +' + FASE3.DIAS_INATIVO + ' dias — ' + hoje;

    function th(t) { return '<th style="background:#bf360c;color:#fff;padding:9px 12px;text-align:left;font-size:12px;">' + t + '</th>'; }
    function td(t, s) { return '<td style="padding:8px 12px;border-bottom:1px solid #fbe9e7;font-size:13px;' + (s||'') + '">' + t + '</td>'; }

    let html = '<div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;">'
      + '<div style="background:#bf360c;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">'
      + '<h2 style="margin:0 0 4px;">⚖️ Neves Marques Advocacia</h2>'
      + '<p style="margin:0;font-size:14px;">⚠️ Processos sem movimentação — ' + hoje + '</p>'
      + '</div>'
      + '<div style="background:#fff;padding:20px 24px;">'
      + '<p style="color:#bf360c;font-weight:bold;margin:0 0 14px;">'
      + inativos.length + ' processo(s) sem movimentação há mais de ' + FASE3.DIAS_INATIVO + ' dias. Verifique os portais dos tribunais.</p>'
      + '<table style="width:100%;border-collapse:collapse;">'
      + '<tr>' + ['Processo','Cliente','Fase Atual','Última Mov.','Dias Parado','Responsável'].map(th).join('') + '</tr>';

    inativos.forEach(function(p, i) {
      const bg  = i % 2 === 0 ? '#fff' : '#fbe9e7';
      const dtM = Utilities.formatDate(p.ultMov, 'America/Sao_Paulo', 'dd/MM/yyyy');
      const cor = p.diasParado > 60 ? 'color:#c62828;font-weight:bold;' : 'color:#e65100;font-weight:bold;';
      html += '<tr style="background:' + bg + ';">'
        + td(p.processo, 'font-size:11px;')
        + td(p.cliente)
        + td(p.fase)
        + td(dtM)
        + td(p.diasParado + ' dias', cor)
        + td(p.responsavel)
        + '</tr>';
    });

    const ssId = SpreadsheetApp.getActiveSpreadsheet().getId();
    html += '</table></div>'
      + '<div style="background:#f5f5f5;padding:14px 24px;border-radius:0 0 8px 8px;font-size:12px;color:#666;">'
      + '<a href="https://docs.google.com/spreadsheets/d/' + ssId + '" style="color:#1a237e;font-weight:bold;">📊 Abrir Dashboard → Aba Processos</a>'
      + '</div></div>';

    const destinos = _r3_destinos();
    if (destinos) {
      GmailApp.sendEmail(destinos, assunto, 'Visualize em HTML.', { htmlBody: html });
      registrarLog('Alerta processos inativos enviado: ' + inativos.length + ' processo(s).');
    }

  } catch (err) {
    registrarLog('ERRO alertarProcessosSemMovimento: ' + err.message);
  }
}

// ----- Aniversários de clientes -----
function verificarAniversariosClientes() {
  try {
    const ss  = SpreadsheetApp.getActiveSpreadsheet();
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const limite = new Date(hoje);
    limite.setDate(hoje.getDate() + FASE3.DIAS_ANIVERSARIO);
    limite.setHours(23,59,59,0);

    const anivs = _r3_aniversarios(ss, hoje, limite);
    if (anivs.length === 0) return;

    const dataStr = Utilities.formatDate(hoje, 'America/Sao_Paulo', 'dd/MM/yyyy');
    const assunto = '🎂 ' + anivs.length + ' aniversário(s) de cliente(s) nos próximos '
      + FASE3.DIAS_ANIVERSARIO + ' dias — ' + dataStr;

    let corpo = '🎂 ANIVERSÁRIOS DE CLIENTES — OPORTUNIDADE DE RELACIONAMENTO\n\n';
    anivs.forEach(function(a) {
      const dt = Utilities.formatDate(a.aniversario, 'America/Sao_Paulo', 'dd/MM');
      corpo += '• ' + a.nome + '\n'
        + '  📅 Aniversário: ' + dt
        + '\n  📱 Telefone: ' + (a.telefone || 'Não informado')
        + '\n  👨‍⚖️ Responsável: ' + a.responsavel + '\n\n';
    });
    corpo += 'Uma mensagem de parabéns fortalece o relacionamento e gera indicações!';

    const destinos = _r3_destinos();
    if (destinos) {
      GmailApp.sendEmail(destinos, assunto, corpo);
      registrarLog('Alerta aniversários: ' + anivs.length + ' cliente(s).');
    }
  } catch (err) {
    registrarLog('ERRO verificarAniversariosClientes: ' + err.message);
  }
}


// ████████████████████████████████████████████████████████████
// FASE 4 — INTEGRAÇÃO COM IA (CLAUDE / ANTHROPIC)
// ████████████████████████████████████████████████████████████

function configurarApiClaude() {
  const ui   = SpreadsheetApp.getUi();
  const resp = ui.prompt(
    '🔑 Chave API Claude (Anthropic)',
    'Cole aqui sua chave de API:\n(Obtenha em console.anthropic.com → API Keys)\n\nA chave começa com "sk-ant-"',
    ui.ButtonSet.OK_CANCEL
  );

  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const chave = resp.getResponseText().trim();
  if (!chave.startsWith('sk-ant-')) {
    ui.alert('❌ Chave inválida', 'A chave deve começar com sk-ant-\nVerifique em console.anthropic.com', ui.ButtonSet.OK);
    return;
  }

  PropertiesService.getScriptProperties().setProperty('CLAUDE_API_KEY', chave);
  ui.alert('✅ Chave salva com segurança!',
    'A chave foi armazenada de forma segura nas propriedades do script.\n\nVocê já pode usar as funções de IA.',
    ui.ButtonSet.OK);
}

function _f4_getApiKey() {
  const key = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!key) {
    SpreadsheetApp.getUi().alert(
      '⚠️ API não configurada',
      'Primeiro configure: ⚖️ Neves Marques → 🤖 IA — Claude → 🔑 Configurar Chave API',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
  return key || null;
}

function _f4_chamarClaude(prompt, usarModeloPro) {
  const apiKey = _f4_getApiKey();
  if (!apiKey) return null;

  const modelo  = usarModeloPro ? F4.MODELO_PRO : F4.MODELO;
  const url     = 'https://api.anthropic.com/v1/messages';

  const payload = {
    model      : modelo,
    max_tokens : F4.MAX_TOKENS,
    system     : 'Você é um assistente jurídico especializado em direito brasileiro. ' +
                 'Responda sempre em português, de forma técnica e objetiva. ' +
                 'Quando solicitado, formate respostas como JSON válido sem markdown extra.',
    messages   : [{ role: 'user', content: prompt }]
  };

  const options = {
    method          : 'post',
    contentType     : 'application/json',
    headers         : {
      'x-api-key'         : apiKey,
      'anthropic-version' : '2023-06-01'
    },
    payload         : JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const code     = response.getResponseCode();
    const data     = JSON.parse(response.getContentText());

    if (code !== 200) {
      const msg = (data.error && data.error.message) || 'Erro HTTP ' + code;
      throw new Error(msg);
    }

    return data.content[0].text;
  } catch (e) {
    SpreadsheetApp.getActive().toast('Erro API Claude: ' + e.message, '❌ Erro', 10);
    registrarLog('FASE4', 'Erro chamada Claude: ' + e.message, 'ERRO');
    return null;
  }
}

// ATENÇÃO: requer "Drive API" ativado em Serviços Avançados
function _f4_lerArquivo(fileId) {
  const file     = DriveApp.getFileById(fileId);
  const mimeType = file.getMimeType();

  if (mimeType === 'application/vnd.google-apps.document') {
    return DocumentApp.openById(fileId).getBody().getText();
  }

  if (mimeType === 'application/pdf') {
    try {
      const blob      = file.getBlob();
      const resource  = {
        title    : '_ocr_temp_' + fileId,
        mimeType : 'application/vnd.google-apps.document'
      };
      const converted = Drive.Files.insert(resource, blob, { ocr: true, ocrLanguage: 'pt' });
      const texto     = DocumentApp.openById(converted.id).getBody().getText();
      DriveApp.getFileById(converted.id).setTrashed(true);
      return texto;
    } catch (e) {
      return '[Não foi possível ler o PDF "' + file.getName() + '": ' + e.message + ']';
    }
  }

  if (mimeType === 'text/plain') {
    return file.getBlob().getDataAsString('UTF-8');
  }

  return '[Tipo de arquivo não suportado para leitura: ' + mimeType + ']';
}

function _f4_localizarPastaAndamentos(nomeCliente) {
  const pastaMae = DriveApp.getFolderById(CFG.PASTA_CLIENTES_ID);
  const partes   = nomeCliente.toLowerCase().trim().split(/\s+/);
  const primeiro = partes[0];
  const ultimo   = partes[partes.length - 1];

  let pastaCliente = null;
  const itClientes = pastaMae.getFolders();
  while (itClientes.hasNext()) {
    const f    = itClientes.next();
    const nome = f.getName().toLowerCase();
    if (nome.includes(primeiro) && nome.includes(ultimo)) {
      pastaCliente = f;
      break;
    }
  }

  if (!pastaCliente) return null;

  const itSub = pastaCliente.getFolders();
  while (itSub.hasNext()) {
    const sub = itSub.next();
    if (sub.getName() === F4.SUBPASTA_AND) return sub;
  }

  return null;
}

function _f4_coletarAndamentos(nomeCliente, limite) {
  limite       = limite || 3;
  const pasta  = _f4_localizarPastaAndamentos(nomeCliente);
  if (!pasta) return { textos: [], arquivos: [] };

  const arquivos = [];
  const iter     = pasta.getFiles();
  while (iter.hasNext()) {
    const f = iter.next();
    arquivos.push({ id: f.getId(), nome: f.getName(), data: f.getLastUpdated() });
  }

  arquivos.sort((a, b) => b.data - a.data);
  const recentes = arquivos.slice(0, limite);

  const charPorArq = Math.floor(F4.MAX_CHARS / Math.max(recentes.length, 1));
  const textos = recentes.map(arq => {
    const conteudo = _f4_lerArquivo(arq.id);
    return '\n--- ARQUIVO: ' + arq.nome + ' ---\n' + conteudo.slice(0, charPorArq);
  });

  return { textos, arquivos: recentes };
}

function _f4_buscarProcessos(idCliente) {
  const aba  = getSheet_(SpreadsheetApp.getActive(), 'Processos');
  if (!aba) return '';

  const dados  = aba.getDataRange().getValues();
  const linhas = [];

  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i].join(' ').toLowerCase();
    if (!linha.includes(String(idCliente).toLowerCase())) continue;

    const nr      = dados[i][1]  || '';
    const tipo    = dados[i][2]  || '';
    const vara    = dados[i][3]  || '';
    const status  = dados[i][6]  || '';
    const ultMov  = dados[i][12] || '';
    linhas.push('• Nº ' + nr + ' | ' + tipo + ' | ' + vara + ' | Status: ' + status + ' | Últ. mov.: ' + ultMov);
  }

  return linhas.join('\n');
}

function analisarClienteSelecionado() {
  const ss   = SpreadsheetApp.getActive();
  const aba  = ss.getActiveSheet();
  const row  = aba.getActiveRange().getRow();

  if (!ehAba_(aba, 'Clientes') || row < 5) {
    ss.toast('Selecione uma linha na aba "Clientes" (linha 5 ou abaixo)', '⚠️ Atenção', 5);
    return;
  }

  const dados = _lerDadosCliente(aba, row);
  if (!dados.nome) {
    ss.toast('Linha sem nome de cliente', '⚠️ Atenção', 5);
    return;
  }

  ss.toast('Analisando ' + dados.nome + '...', '🤖 IA em andamento', 45);

  const andamentos     = _f4_coletarAndamentos(dados.nome, 3);
  const processosTexto = _f4_buscarProcessos(dados.id);

  const prompt =
    'Analise os dados deste cliente de um escritório de advocacia brasileiro e retorne um JSON.\n\n' +
    'DADOS DO CLIENTE:\n' +
    '- Nome: ' + dados.nome + '\n' +
    '- Área: ' + dados.area + '\n' +
    '- Honorários: ' + dados.tipoHon + ' — R$ ' + dados.valor + '\n' +
    '- Responsável: ' + dados.responsavel + '\n\n' +
    'PROCESSOS:\n' + (processosTexto || 'Nenhum processo cadastrado') + '\n\n' +
    'ANDAMENTOS RECENTES (Drive):\n' + (andamentos.textos.join('\n') || 'Nenhum documento na pasta de andamentos') + '\n\n' +
    'Retorne APENAS o JSON abaixo, sem markdown:\n' +
    '{\n' +
    '  "resumo": "2-3 frases sobre a situação atual",\n' +
    '  "urgencias": ["item urgente 1", "item urgente 2"],\n' +
    '  "proximos_passos": ["ação 1", "ação 2", "ação 3"],\n' +
    '  "riscos": ["risco 1"],\n' +
    '  "oportunidades": "texto sobre oportunidades",\n' +
    '  "score_saude": 7,\n' +
    '  "justificativa_score": "explicação do score"\n' +
    '}';

  const resposta = _f4_chamarClaude(prompt, false);
  if (!resposta) return;

  try {
    const json = JSON.parse(resposta.replace(/```json\n?|\n?```/g, '').trim());
    _f4_salvarInsight(dados, json, andamentos.arquivos.length);
    _f4_mostrarInsight(dados.nome, json);
  } catch (e) {
    _f4_salvarInsightTexto(dados, resposta);
    SpreadsheetApp.getUi().alert('📋 Análise — ' + dados.nome, resposta, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

function analisarTodosProcessos() {
  const ui   = SpreadsheetApp.getUi();
  const conf = ui.alert(
    '⚡ Analisar Todos os Processos',
    'Irá analisar todos os clientes com status "Ativo".\n' +
    'Pode levar vários minutos e consumirá créditos da API Claude.\n\n' +
    'Deseja continuar?',
    ui.ButtonSet.YES_NO
  );
  if (conf !== ui.Button.YES) return;

  const ss          = SpreadsheetApp.getActive();
  const abaClientes = getSheet_(ss, 'Clientes');
  const dados       = abaClientes.getDataRange().getValues();
  let   processados = 0;
  let   erros       = 0;

  for (let i = 4; i < dados.length; i++) {
    const nome   = String(dados[i][1] || '').trim();
    const status = String(dados[i][7] || '').trim();
    if (!nome || status !== 'Ativo') continue;

    try {
      ss.toast('Analisando ' + nome + ' (' + (processados + 1) + ')...', '🤖 Análise em lote', 30);

      const dc         = _lerDadosCliente(abaClientes, i + 1);
      const andamentos = _f4_coletarAndamentos(nome, 2);
      const processos  = _f4_buscarProcessos(dc.id);

      const prompt =
        'Análise rápida do cliente ' + nome + ' (escritório advocacia brasileiro).\n' +
        'Área: ' + dc.area + ' | Honorários: ' + dc.tipoHon + ' R$' + dc.valor + '\n' +
        'Processos: ' + (processos || 'nenhum') + '\n' +
        'Andamentos: ' + (andamentos.textos[0] || 'nenhum') + '\n\n' +
        'Retorne APENAS este JSON (sem markdown):\n' +
        '{"resumo":"...","urgencias":[],"proximos_passos":[],"score_saude":5,"justificativa_score":"..."}';

      const resposta = _f4_chamarClaude(prompt, false);
      if (resposta) {
        try {
          const json = JSON.parse(resposta.replace(/```json\n?|\n?```/g, '').trim());
          _f4_salvarInsight(dc, json, andamentos.arquivos.length);
        } catch (e2) {
          _f4_salvarInsightTexto(dc, resposta);
        }
        processados++;
      }

      Utilities.sleep(1200); // respeitar rate limit da API
    } catch (e) {
      erros++;
      registrarLog('FASE4', 'Erro ao analisar ' + nome + ': ' + e.message, 'ERRO');
    }
  }

  ui.alert('✅ Análise Concluída',
    'Clientes analisados: ' + processados + '\nErros: ' + erros + '\n\nVeja os resultados na aba "🤖 IA Insights".',
    ui.ButtonSet.OK);
}

function gerarRascunhoPeticao() {
  const ui  = SpreadsheetApp.getUi();
  const ss  = SpreadsheetApp.getActive();
  const aba = ss.getActiveSheet();
  const row = aba.getActiveRange().getRow();

  if (!ehAba_(aba, 'Clientes') || row < 5) {
    ss.toast('Selecione um cliente na aba "Clientes" (linha 5 ou abaixo)', '⚠️ Atenção', 5);
    return;
  }

  const tipoResp = ui.prompt(
    '📝 Tipo de Petição',
    'Qual petição deseja redigir?\n\nExemplos:\n' +
    '• Petição Inicial de Alimentos\n• Contestação\n• Recurso de Apelação\n' +
    '• Embargos de Declaração\n• Agravo de Instrumento\n• Pedido de Tutela de Urgência\n• Manifestação',
    ui.ButtonSet.OK_CANCEL
  );
  if (tipoResp.getSelectedButton() !== ui.Button.OK) return;

  const tipoPeticao = tipoResp.getResponseText().trim();
  if (!tipoPeticao) return;

  const instrResp = ui.prompt(
    '📋 Contexto Adicional (opcional)',
    'Descreva argumentos principais, fatos relevantes ou instruções específicas:\n(pode deixar em branco)',
    ui.ButtonSet.OK_CANCEL
  );
  const contextoExtra = instrResp.getSelectedButton() === ui.Button.OK
    ? instrResp.getResponseText().trim()
    : '';

  const dados      = _lerDadosCliente(aba, row);
  const andamentos = _f4_coletarAndamentos(dados.nome, 2);
  const processos  = _f4_buscarProcessos(dados.id);

  ss.toast('Redigindo ' + tipoPeticao + '...', '🤖 IA redigindo petição', 90);

  const prompt =
    'Você é um advogado brasileiro especialista em ' + dados.area + '.\n' +
    'Redija um rascunho profissional e completo de:\n\n' +
    tipoPeticao.toUpperCase() + '\n\n' +
    'DADOS DO CLIENTE:\n' +
    'Nome: ' + dados.nome + ' | CPF: ' + dados.cpf + '\n' +
    'Endereço: ' + dados.endereco + '\n' +
    'Área: ' + dados.area + '\n' +
    'Processos: ' + (processos || 'a qualificar') + '\n\n' +
    'ANDAMENTOS RECENTES:\n' + (andamentos.textos.join('\n') || 'Não disponíveis') + '\n\n' +
    'CONTEXTO E INSTRUÇÕES ADICIONAIS:\n' + (contextoExtra || 'Nenhum') + '\n\n' +
    'REGRAS DE FORMATAÇÃO:\n' +
    '- Use linguagem jurídica formal brasileira\n' +
    '- Estrutura: Excelentíssimo(a) Senhor(a) [cargo], qualificação das partes, DOS FATOS, DO DIREITO, DOS PEDIDOS, fechamento com local/data\n' +
    '- Deixe [PREENCHER] onde faltar dado específico do processo (nº, vara, comarca)\n' +
    '- Cite artigos de lei, doutrina e jurisprudência pertinentes\n' +
    '- Advogado: ' + dados.responsavel + ' (a OAB será preenchida manualmente)\n' +
    '- Entre 800 e 2000 palavras\n' +
    '- NÃO use markdown, escreva em texto puro';

  const rascunho = _f4_chamarClaude(prompt, true);
  if (!rascunho) return;

  _f4_salvarRascunhoDoc(dados, tipoPeticao, rascunho);
}

function _f4_salvarRascunhoDoc(dados, tipoPeticao, conteudo) {
  const ui = SpreadsheetApp.getUi();

  try {
    const nomeDoc = 'RASCUNHO — ' + tipoPeticao + ' — ' + dados.nome + ' — ' +
                    Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd-MM-yyyy');

    const doc  = DocumentApp.create(nomeDoc);
    const body = doc.getBody();

    const aviso = body.insertParagraph(0, '⚠️ RASCUNHO GERADO POR INTELIGÊNCIA ARTIFICIAL — REVISAR E VALIDAR ANTES DE PROTOCOLAR');
    aviso.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    aviso.setForegroundColor('#cc0000');
    aviso.setFontSize(10);
    body.insertParagraph(1, '').appendHorizontalRule();

    const cab = body.appendParagraph('NEVES MARQUES ADVOCACIA');
    cab.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    cab.setAlignment(DocumentApp.HorizontalAlignment.CENTER);

    const sub = body.appendParagraph(
      'Luiz Fernando Batista Neves — OAB/RJ 253.413   |   Kariny Marques Barbosa — OAB/RJ 241.456'
    );
    sub.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    sub.setFontSize(10);

    body.appendParagraph('').appendHorizontalRule();
    body.appendParagraph('');

    conteudo.split('\n').forEach(linha => {
      body.appendParagraph(linha || ' ');
    });

    doc.saveAndClose();

    // Mover para pasta ⚖️ Peças Processuais do cliente
    const pasta  = _localizarSubpasta(dados.nome, F4.SUBPASTA_PEC);
    const docArq = DriveApp.getFileById(doc.getId());

    if (pasta) {
      pasta.addFile(docArq);
      DriveApp.getRootFolder().removeFile(docArq);
    }

    registrarLog('FASE4', 'Rascunho gerado: ' + nomeDoc, 'OK');

    const url = 'https://docs.google.com/document/d/' + doc.getId() + '/edit';
    ui.alert(
      '✅ Rascunho Criado com Sucesso!',
      'Salvo em: ' + F4.SUBPASTA_PEC + ' → ' + dados.nome + '\n\n' +
      'Arquivo: ' + nomeDoc + '\n\n' +
      '⚠️ IMPORTANTE: Revise todo o conteúdo antes de protocolar.\n\n' +
      'URL: ' + url,
      ui.ButtonSet.OK
    );
  } catch (e) {
    registrarLog('FASE4', 'Erro ao salvar rascunho: ' + e.message, 'ERRO');
    ui.alert(
      '⚠️ Rascunho gerado (não foi possível salvar no Drive)',
      'Copie o conteúdo abaixo:\n\n' + conteudo.slice(0, 800) + '\n\n[... continua]',
      ui.ButtonSet.OK
    );
  }
}

function _f4_salvarInsight(dados, json, qtdArquivos) {
  const ss  = SpreadsheetApp.getActive();
  let   aba = ss.getSheetByName(F4.ABA_INSIGHTS);
  if (!aba) aba = _f4_criarAbaInsights(ss);

  const score = Number(json.score_saude) || 0;
  const cor   = score >= 8 ? '#1b5e20' : score >= 5 ? '#f9a825' : '#b71c1c';

  const novaLinha = aba.getLastRow() + 1;
  aba.getRange(novaLinha, 1, 1, 10).setValues([[
    Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'),
    dados.id  || '',
    dados.nome || '',
    dados.area || '',
    json.resumo || '',
    (json.urgencias      || []).join(' | '),
    (json.proximos_passos || []).join(' | '),
    score || '—',
    json.justificativa_score || '',
    qtdArquivos || 0
  ]]);

  aba.getRange(novaLinha, 8)
     .setBackground(cor)
     .setFontColor('#ffffff')
     .setFontWeight('bold')
     .setHorizontalAlignment('center');

  aba.setRowHeight(novaLinha, 90);
  aba.getRange(novaLinha, 5, 1, 5).setWrap(true).setVerticalAlignment('top');

  registrarLog('FASE4', 'Insight salvo: ' + dados.nome + ' (score: ' + score + ')', 'OK');
}

function _f4_salvarInsightTexto(dados, texto) {
  const ss  = SpreadsheetApp.getActive();
  let   aba = ss.getSheetByName(F4.ABA_INSIGHTS);
  if (!aba) aba = _f4_criarAbaInsights(ss);

  const novaLinha = aba.getLastRow() + 1;
  aba.getRange(novaLinha, 1, 1, 10).setValues([[
    Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'),
    dados.id || '', dados.nome || '', dados.area || '',
    texto.slice(0, 800), '', '', '—', 'Resposta em texto livre', 0
  ]]);
  aba.setRowHeight(novaLinha, 90);
  aba.getRange(novaLinha, 5).setWrap(true);
}

function _f4_criarAbaInsights(ss) {
  const aba = ss.insertSheet(F4.ABA_INSIGHTS);

  const headers = [
    'Data Análise', 'ID', 'Cliente', 'Área', 'Resumo IA',
    'Urgências', 'Próximos Passos', 'Score\n(1-10)', 'Justificativa do Score', 'Docs\nAnalisados'
  ];

  const hRange = aba.getRange(1, 1, 1, headers.length);
  hRange.setValues([headers])
        .setBackground('#1a237e')
        .setFontColor('#ffffff')
        .setFontWeight('bold')
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle')
        .setWrap(true);

  aba.setRowHeight(1, 55);
  aba.setFrozenRows(1);

  const larguras = [130, 55, 190, 130, 310, 230, 280, 75, 250, 75];
  larguras.forEach((w, i) => aba.setColumnWidth(i + 1, w));

  return aba;
}

function verPainelInsights() {
  const ss  = SpreadsheetApp.getActive();
  const aba = ss.getSheetByName(F4.ABA_INSIGHTS);

  if (!aba) {
    SpreadsheetApp.getUi().alert(
      '📊 Nenhum insight ainda',
      'Execute primeiro:\n"🤖 IA — Claude → 📊 Analisar Cliente Selecionado"\nou\n"⚡ Analisar Todos os Processos"',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }

  ss.setActiveSheet(aba);
  ss.toast('Painel de IA Insights', '📊', 3);
}

function _f4_mostrarInsight(nome, json) {
  const score   = json.score_saude || '?';
  const emoji   = score >= 8 ? '🟢' : score >= 5 ? '🟡' : '🔴';
  const corFundo = score >= 8 ? '#e8f5e9' : score >= 5 ? '#fffde7' : '#ffebee';
  const urg     = (json.urgencias || []).map(u => '<li>' + u + '</li>').join('') || '<li>Nenhuma urgência identificada</li>';
  const passos  = (json.proximos_passos || []).map((p, i) => '<li>' + (i + 1) + '. ' + p + '</li>').join('');
  const riscos  = (json.riscos || []).map(r => '<li>' + r + '</li>').join('') || '<li>Nenhum risco crítico identificado</li>';

  const html = HtmlService.createHtmlOutput(
    '<style>' +
    'body{font-family:Arial,sans-serif;padding:20px;font-size:13px;color:#212121}' +
    'h2{color:#1a237e;margin-bottom:4px}' +
    '.score-box{background:' + corFundo + ';border-radius:8px;padding:12px;text-align:center;margin:12px 0}' +
    '.score-num{font-size:2.2em;font-weight:bold;color:#1a237e}' +
    '.section{margin:12px 0}' +
    '.label{font-weight:bold;color:#455a64;font-size:0.8em;text-transform:uppercase;letter-spacing:.5px}' +
    '.content{margin-top:5px;line-height:1.65}' +
    '.urg{color:#c62828} .opp{color:#2e7d32} .risk{color:#e65100}' +
    'ul{margin:4px 0;padding-left:20px}' +
    'hr{border:none;border-top:1px solid #e0e0e0;margin:12px 0}' +
    '</style>' +
    '<h2>🤖 Análise IA — ' + nome + '</h2>' +
    '<div class="score-box"><div class="score-num">' + emoji + ' ' + score + ' / 10</div>' +
    '<div style="font-size:0.85em;color:#555;margin-top:4px">' + (json.justificativa_score || '') + '</div></div>' +
    '<div class="section"><span class="label">Resumo da Situação</span>' +
    '<div class="content">' + (json.resumo || '—') + '</div></div><hr>' +
    '<div class="section urg"><span class="label">⚠️ Urgências</span><ul>' + urg + '</ul></div>' +
    '<div class="section"><span class="label">📋 Próximos Passos</span><ul>' + passos + '</ul></div>' +
    '<div class="section risk"><span class="label">⚡ Riscos</span><ul>' + riscos + '</ul></div>' +
    '<div class="section opp"><span class="label">💡 Oportunidades</span>' +
    '<div class="content">' + (json.oportunidades || '—') + '</div></div><hr>' +
    '<small style="color:#9e9e9e">Resultado salvo na aba ' + F4.ABA_INSIGHTS + '</small>'
  ).setWidth(540).setHeight(580);

  SpreadsheetApp.getUi().showModalDialog(html, '🤖 Análise IA — ' + nome);
}


// ████████████████████████████████████████████████████████████
// CONFIGURAÇÃO DE TRIGGERS — INSTALA TODAS AS AUTOMAÇÕES
// Execute UMA vez (menu ⚙️ Sistema → Instalar gatilhos).
// ████████████████████████████████████████████████████████████

function configurarTriggers() {
  // Limpa todos os triggers existentes (evita duplicatas)
  ScriptApp.getProjectTriggers().forEach(function(t) {
    ScriptApp.deleteTrigger(t);
  });

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // onEdit — cria pasta ao cadastrar novo cliente
  ScriptApp.newTrigger('onEditTrigger')
    .forSpreadsheet(ss).onEdit().create();

  // === DIÁRIO 7h — ANDAMENTO PROCESSUAL (leitura de e-mails) ===
  ScriptApp.newTrigger('processarEmailsJudiciais')
    .timeBased().everyDays(1).atHour(7).inTimezone('America/Sao_Paulo').create();

  // === DIÁRIOS — 8h ===
  ScriptApp.newTrigger('verificarPrazos')
    .timeBased().everyDays(1).atHour(8).inTimezone('America/Sao_Paulo').create();

  ScriptApp.newTrigger('verificarAniversariosClientes')
    .timeBased().everyDays(1).atHour(8).inTimezone('America/Sao_Paulo').create();

  ScriptApp.newTrigger('atualizarKPIs')
    .timeBased().everyDays(1).atHour(8).inTimezone('America/Sao_Paulo').create();

  // === SEXTA-FEIRA — 8h ===
  ScriptApp.newTrigger('alertarProcessosSemMovimento')
    .timeBased().everyWeeks(1)
    .onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(8)
    .inTimezone('America/Sao_Paulo').create();

  // === SEGUNDA-FEIRA — 7h ===
  ScriptApp.newTrigger('relatorioSemanal')
    .timeBased().everyWeeks(1)
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7)
    .inTimezone('America/Sao_Paulo').create();

  ScriptApp.newTrigger('backupSemanal')
    .timeBased().everyWeeks(1)
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7)
    .inTimezone('America/Sao_Paulo').create();

  try {
    SpreadsheetApp.getUi().alert(
      '✅ Automações Completas Configuradas',
      'DIÁRIO às 7h:\n'
      + '  • Andamento Processual (lê e-mails judiciais e atualiza Processos/Agenda)\n\n'
      + 'DIÁRIO às 8h:\n'
      + '  • Alertas de prazo processual\n'
      + '  • Aniversários de clientes\n'
      + '  • Atualização de KPIs\n\n'
      + 'SEXTA-FEIRA às 8h:\n'
      + '  • Processos sem movimentação (+30 dias)\n\n'
      + 'SEGUNDA-FEIRA às 7h:\n'
      + '  • Relatório Executivo Semanal\n'
      + '  • Backup automático do Dashboard\n\n'
      + 'AO CADASTRAR CLIENTE:\n'
      + '  • Criação automática de pasta + subpastas no Drive',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (e) { Logger.log('Triggers criados (sem UI disponível)'); }

  registrarLog('Triggers completos (Andamento Processual + Fases 1+2+3) configurados.');
}

// Atalho compatível com instruções antigas — instala tudo.
function configurarTriggerDiario() {
  configurarTriggers();
}


// ████████████████████████████████████████████████████████████
// LOG DE AUDITORIA
// ████████████████████████████████████████████████████████████

/**
 * Aceita duas formas de chamada:
 *   registrarLog('mensagem')
 *   registrarLog('CATEGORIA', 'mensagem', 'NÍVEL')   (usado pela Fase 4)
 */
function registrarLog(a, b, c) {
  try {
    let mensagem;
    if (b === undefined) {
      mensagem = String(a);
    } else {
      mensagem = '[' + a + '] ' + b + (c ? ' (' + c + ')' : '');
    }

    const ss  = SpreadsheetApp.getActiveSpreadsheet();
    let   aba = ss.getSheetByName('🔧 Log');

    if (!aba) {
      aba = ss.insertSheet('🔧 Log');
      aba.getRange(1, 1, 1, 3)
        .setValues([['Data/Hora', 'Mensagem', 'Usuário']])
        .setFontWeight('bold')
        .setBackground('#455a64')
        .setFontColor('#ffffff');
      aba.setColumnWidth(1, 160);
      aba.setColumnWidth(2, 500);
      aba.setColumnWidth(3, 200);
      aba.setTabColor('#607d8b');
      aba.setFrozenRows(1);
    }

    const agora   = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss');
    const usuario = Session.getActiveUser().getEmail() || 'trigger-automatico';
    aba.appendRow([agora, mensagem, usuario]);
  } catch (e) {
    console.error('registrarLog falhou: ' + e.message);
  }
}

function verLog() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName('🔧 Log');
  if (aba) {
    ss.setActiveSheet(aba);
  } else {
    SpreadsheetApp.getUi().alert('Nenhum log encontrado. Execute alguma função primeiro.');
  }
}


// ████████████████████████████████████████████████████████████
// UTILITÁRIOS COMPARTILHADOS
// ████████████████████████████████████████████████████████████

/**
 * Retorna a planilha: usa getActiveSpreadsheet() quando o script
 * está vinculado à planilha (execução manual ou trigger), com
 * fallback para openById (execução externa).
 */
function getPlanilha_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
  } catch(e) {}
  return SpreadsheetApp.openById(CONFIG.spreadsheetId);
}

/**
 * Busca uma aba cujo nome CONTENHA a palavra-chave (case-insensitive).
 * Resolve o problema de abas com prefixos emoji (ex: "⚖ Processos").
 */
function getSheet_(ss, keyword) {
  const s = resolverAba_(ss, keyword);
  if (!s) {
    Logger.log(`Aba "${keyword}" não encontrada. Abas disponíveis: ${ss.getSheets().map(x => '"' + x.getName() + '"').join(', ')}`);
  }
  return s;
}

/**
 * Camada centralizada de resolução de abas (FASE 1).
 * Tolerante a emoji, acentos, maiúsculas/minúsculas, espaços e pequenas
 * variações de nome. Aceita uma palavra-chave ou uma lista de aliases.
 */
function resolverAba_(ss, aliases) {
  const alvos = (Array.isArray(aliases) ? aliases : [aliases]).map(_normNome_).filter(Boolean);
  const sheets = ss.getSheets();
  // 1) match exato normalizado
  for (const s of sheets) {
    if (alvos.indexOf(_normNome_(s.getName())) >= 0) return s;
  }
  // 2) a aba contém o alias (>=3 chars), ou o alias contém o nome
  //    da aba (>=3 chars). O mínimo evita falso-positivo com abas de
  //    nome muito curto (ex.: uma aba "A" casar com "agenda").
  for (const s of sheets) {
    const n = _normNome_(s.getName());
    if (!n) continue;
    const ok = alvos.some(a =>
      (a.length >= 3 && n.indexOf(a) >= 0) ||
      (n.length >= 3 && a.indexOf(n) >= 0));
    if (ok) return s;
  }
  return null;
}

/** Normaliza um nome de aba: remove acento, emoji, símbolos e caixa. */
function _normNome_(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // tira acentos
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');                        // tira emoji/espaço/símbolo
}

// ──────────────────────────────────────────────────────────
// FASE 1 — AUDITORIA E CRIAÇÃO DE ABAS (não destrutivo)
// ──────────────────────────────────────────────────────────

/**
 * Lê a estrutura REAL da planilha e compara com o SCHEMA proposto.
 * Não altera nada — apenas relata o que existe, o que falta e o que
 * será criado. Grava o relatório na aba "🧱 Auditoria Estrutura".
 */
function auditarEstrutura() {
  const ss = getPlanilha_();
  const linhas = [['Aba (SCHEMA)', 'Situação', 'Aba real', 'Colunas propostas faltantes']];

  Object.keys(SCHEMA).forEach(function(k) {
    const def = SCHEMA[k];
    const aba = resolverAba_(ss, def.aliases);
    if (!aba) {
      linhas.push([def.nome,
        def.existente ? '❌ AUSENTE (esperada — verifique!)' : '➕ ausente (será criada)',
        '—', def.headers.join(', ')]);
      return;
    }
    const reais = _lerCabecalhoReal_(aba, def.headers);
    const faltantes = def.headers.filter(function(h) {
      return !reais.some(function(hr) { return _normNome_(hr) === _normNome_(h); });
    });
    linhas.push([def.nome,
      faltantes.length ? '⚠️ ' + faltantes.length + ' coluna(s) a propor' : '✅ completa',
      aba.getName() + ' (' + reais.length + ' col.)',
      faltantes.join(', ') || '—']);
  });

  const rel = _abaRelatorio_(ss, '🧱 Auditoria Estrutura');
  rel.clearContents();
  rel.getRange(1, 1, linhas.length, 4).setValues(linhas);
  rel.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#37474f').setFontColor('#fff');
  rel.setFrozenRows(1);
  rel.autoResizeColumns(1, 4);
  ss.setActiveSheet(rel);
  registrarLog('Auditoria de estrutura executada (' + (linhas.length - 1) + ' abas avaliadas).');
}

/**
 * Cria SOMENTE as abas novas do SCHEMA que ainda não existem.
 * Nunca cria nem altera as abas "existente:true" (Clientes, Processos,
 * Agenda, Financeiro) — essas são tratadas só na auditoria, para não
 * conflitar com as colunas que a automação já usa.
 */
function criarAbasNovas() {
  const ss = getPlanilha_();
  const criadas = [], puladas = [];

  Object.keys(SCHEMA).forEach(function(k) {
    const def = SCHEMA[k];
    const aba = resolverAba_(ss, def.aliases);
    if (aba) { puladas.push(def.nome + ' (já existe: "' + aba.getName() + '")'); return; }
    if (def.existente) { puladas.push(def.nome + ' (esperada e AUSENTE — não criada por segurança)'); return; }
    _criarAbaComCabecalho_(ss, def);
    if (k === 'CONFIGURACOES') _semearConfiguracoes_(ss);
    criadas.push(def.nome);
  });

  registrarLog('criarAbasNovas: ' + criadas.length + ' criada(s) — ' + criadas.join(', '));
  try {
    SpreadsheetApp.getUi().alert('🧱 Estrutura de Dados',
      'Abas criadas (' + criadas.length + '):\n' + (criadas.join('\n') || '— nenhuma —') +
      '\n\nNão alteradas (' + puladas.length + '):\n' + puladas.join('\n') +
      '\n\nAs abas já em uso (Clientes, Processos, Agenda, Financeiro) NÃO são\n' +
      'modificadas automaticamente. Rode "Auditar Estrutura" para ver as\n' +
      'colunas sugeridas e decidir com calma.',
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {}
}

/** Tenta achar a linha de cabeçalho real (nem sempre é a linha 1). */
function _lerCabecalhoReal_(aba, headersEsperados) {
  const maxLin = Math.min(aba.getLastRow(), 12);
  const maxCol = aba.getLastColumn();
  if (maxLin < 1 || maxCol < 1) return [];
  const bloco = aba.getRange(1, 1, maxLin, maxCol).getValues();
  const alvo = headersEsperados.map(_normNome_);
  let melhor = [], melhorScore = -1;
  for (let r = 0; r < bloco.length; r++) {
    const linha = bloco[r].map(String);
    const score = linha.reduce(function(acc, c) {
      return acc + (alvo.indexOf(_normNome_(c)) >= 0 ? 1 : 0);
    }, 0);
    if (score > melhorScore) { melhorScore = score; melhor = linha; }
  }
  return melhor.filter(function(c) { return String(c).trim() !== ''; });
}

function _criarAbaComCabecalho_(ss, def) {
  const aba = ss.insertSheet(def.nome);
  aba.getRange(1, 1, 1, def.headers.length)
     .setValues([def.headers])
     .setFontWeight('bold')
     .setBackground(def.cor || '#37474f')
     .setFontColor('#ffffff');
  aba.setFrozenRows(1);
  if (def.cor) aba.setTabColor(def.cor);
  return aba;
}

function _abaRelatorio_(ss, nome) {
  return resolverAba_(ss, nome) || ss.insertSheet(nome);
}

/** Popula a aba Configurações com os valores atuais do código (documentação viva). */
function _semearConfiguracoes_(ss) {
  const aba = resolverAba_(ss, SCHEMA.CONFIGURACOES.aliases);
  if (!aba || aba.getLastRow() > 1) return;
  const rows = [
    ['spreadsheetId',     CONFIG.spreadsheetId,     'ID da planilha Dashboard',            'Geral'],
    ['labelProcessado',   CONFIG.labelProcessado,   'Etiqueta Gmail — e-mail processado',  'Gmail'],
    ['labelRevisar',      CONFIG.labelRevisar,      'Etiqueta Gmail — revisar manualmente','Gmail'],
    ['diasRetroativos',   CONFIG.diasRetroativos,   'Janela de busca de e-mails (dias)',   'Andamento'],
    ['PASTA_CLIENTES_ID', CFG.PASTA_CLIENTES_ID,    'Pasta raiz dos clientes no Drive',    'Drive'],
    ['EMAIL_LUIZ',        CFG.EMAIL_LUIZ,           'E-mail interno — Luiz',               'Alertas'],
    ['EMAIL_KARINY',      CFG.EMAIL_KARINY,         'E-mail interno — Kariny',             'Alertas'],
    ['DIAS_ALERTA',       CFG.DIAS_ALERTA,          'Antecedência de alerta de prazo',     'Prazos'],
    ['MAX_BACKUPS',       CFG.MAX_BACKUPS,          'Backups semanais mantidos',           'Backup'],
    ['TEMPLATE_PROCURACAO', TEMPLATES.PROCURACAO,   'ID do template de Procuração',        'Documentos'],
    ['TEMPLATE_CONTRATO',   TEMPLATES.CONTRATO,     'ID do template de Contrato',          'Documentos'],
    ['IA_MODELO',         F4.MODELO,                'Modelo de IA padrão',                 'IA'],
    ['IA_MODELO_PRO',     F4.MODELO_PRO,            'Modelo de IA para petições',          'IA']
  ];
  aba.getRange(2, 1, rows.length, 4).setValues(rows);
  aba.autoResizeColumns(1, 4);
}

function buildGmailQuery_(desde) {
  const from    = CONFIG.remetentes.map(r => 'from:' + r).join(' OR ');
  const excluir = '-label:' + CONFIG.labelProcessado + ' -label:' + CONFIG.labelRevisar;
  if (desde instanceof Date) {
    const y = desde.getFullYear();
    const m = String(desde.getMonth() + 1).padStart(2, '0');
    const d = String(desde.getDate()).padStart(2, '0');
    return '(' + from + ') after:' + y + '/' + m + '/' + d + ' ' + excluir;
  }
  return '(' + from + ') newer_than:' + CONFIG.diasRetroativos + 'd ' + excluir;
}

function garantirLabelProcessado_() {
  try {
    GmailApp.getUserLabelByName(CONFIG.labelProcessado) ||
    GmailApp.createLabel(CONFIG.labelProcessado);
  } catch(e) {}
}

function jaProcessado_(thread) {
  return thread.getLabels().some(l => l.getName() === CONFIG.labelProcessado);
}

function marcarComoProcessado_(thread) {
  try {
    const label = GmailApp.getUserLabelByName(CONFIG.labelProcessado);
    if (label) thread.addLabel(label);
  } catch(e) {}
}

function remetenteReconhecido_(from) {
  return CONFIG.remetentes.some(r => from.includes(r.split('@')[0]) || from.includes(r));
}

function encontrarCabecalho_(linhas, primeiraColuna) {
  for (let r = 0; r < linhas.length; r++) {
    if (String(linhas[r][0]).trim() === primeiraColuna) {
      return { cabRow: r, headers: linhas[r].map(h => String(h).trim()) };
    }
  }
  return null;
}

function setCell_(aba, linha1, headers, colNome, valor) {
  const col = headers.indexOf(colNome);
  if (col >= 0) aba.getRange(linha1, col + 1).setValue(valor);
}

function atualizarLinhaPorNumero_(aba, linhas, headers, numProc, dataMovStr, descMov) {
  for (let r = 0; r < linhas.length; r++) {
    if (normNum_(String(linhas[r][0])) === normNum_(numProc)) {
      const r1 = r + 1;
      setCell_(aba, r1, headers, 'Últ. Mov.', dataMovStr);
      setCell_(aba, r1, headers, 'Desc. Últ. Movimentação', descMov);
      Logger.log(`Atualizado: ${numProc} — ${dataMovStr}`);
      return;
    }
  }
  Logger.log(`Não encontrado: ${numProc}`);
}

function buscarEAtualizarCelula_(aba, linhas, headers, numProc, colIdx, valor) {
  for (let r = 0; r < linhas.length; r++) {
    if (normNum_(String(linhas[r][0])) === normNum_(numProc)) {
      if (colIdx >= 0) aba.getRange(r + 1, colIdx + 1).setValue(valor);
      return;
    }
  }
}

function appendAgenda_(abaAg, item) {
  if (!abaAg) return;
  const linhas = abaAg.getDataRange().getValues();
  const cab = encontrarCabecalho_(linhas, 'Data');
  if (!cab) return;
  const h = cab.headers;

  // Evita duplicação: mesmo número de processo + mesma data (normalizada),
  // usando o índice real das colunas (não posições fixas).
  const colData = h.indexOf('Data');
  const colRef  = h.indexOf('Nº Processo / Ref.');
  const numItem = normNum_(item.proc.split(' ')[0]);
  for (let r = cab.cabRow + 1; r < linhas.length; r++) {
    const dataCel = normalizarDataParaTexto_(linhas[r][colData >= 0 ? colData : 0]);
    const refCel  = normNum_(String(linhas[r][colRef >= 0 ? colRef : 0]));
    if (numItem.length > 0 && dataCel === item.data && refCel.includes(numItem)) return;
  }

  const capturaStr2 = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
  const linha = new Array(h.length).fill('');
  function s(col, val) { const i = h.indexOf(col); if (i >= 0) linha[i] = val; }
  s('Data',                  item.data);
  s('Data fatal',            item.data);
  s('Tipo',                  item.tipo);
  s('Tipo de prazo',         item.tipo);
  s('Nº Processo / Ref.',    item.proc);
  s('Processo vinculado',    item.proc ? item.proc.split(' ')[0] : '');
  s('Cliente',               item.cliente || '');
  s('Tribunal / Local',      item.tribunal || '');
  s('Descrição',             item.desc || '');
  s('Responsável',           item.resp || '');
  s('Status',                F3.STATUS_PENDENTE);
  s('Prioridade',            item.prioridade || '🟡 Média');
  s('Origem do prazo',       'Captura automática — e-mail judicial');
  s('Data de captura',       capturaStr2);
  s('Confirmado por humano', '');
  s('Enviado alerta',        '');
  abaAg.appendRow(linha);
}

function gerarAlerta_(dados, linhaProc, headers) {
  const cliente = linhaProc ? linhaProc[headers.indexOf('Cliente')] : dados.poloAtivo;
  return `⚠️ ATENÇÃO — Processo ${dados.numProcesso} (${cliente}): ${dados.descMovimentacao}`;
}

function enviarAlertaEmail_(alertas) {
  const corpo = alertas.join('\n\n');
  GmailApp.sendEmail(
    'nevesmarquesadv@gmail.com',
    '⚠️ Alerta Processual — Decisão/Sentença detectada',
    `Os processos abaixo tiveram movimentação importante:\n\n${corpo}\n\n--- Neves Marques Advocacia`
  );
}

function detectarFase_(desc) {
  const d = desc.toLowerCase();
  if (d.includes('improcedente'))  return 'Sentença — Improcedente';
  if (d.includes('procedente'))    return 'Sentença — Procedente';
  if (d.includes('julgado'))       return 'Sentença';
  if (d.includes('acórdão'))       return 'Acórdão';
  if (d.includes('recurso'))       return 'Recurso';
  if (d.includes('audiência'))     return 'Audiência';
  if (d.includes('citação'))       return 'Citação';
  if (d.includes('revelia'))       return 'Revelia';
  return 'Em andamento';
}

function inferirArea_(dados) {
  const txt = ((dados.classe || '') + (dados.assunto || '') + (dados.poloPassivo || '')).toLowerCase();
  if (txt.includes('previdenci') || txt.includes('inss'))     return 'Direito Previdenciário';
  if (txt.includes('consumidor') || txt.includes('voo') || txt.includes('aéreo')) return 'Direito do Consumidor';
  if (txt.includes('fazenda') || txt.includes('estado') || txt.includes('município')) return 'Direito Administrativo';
  if (txt.includes('família'))    return 'Direito de Família';
  if (txt.includes('trabalho'))   return 'Direito Trabalhista';
  if (txt.includes('detran') || txt.includes('trânsito')) return 'Direito Administrativo / Trânsito';
  return 'Direito Cível';
}

function calcularPrazo_(dataBase, diasUteis) {
  const d = new Date(dataBase);
  let contagem = 0;
  while (contagem < diasUteis) {
    d.setDate(d.getDate() + 1);
    const diaSemana = d.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) contagem++;
  }
  return d;
}

function parseDateBR_(str) {
  if (!str) return new Date();
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return new Date();
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
}

function matchFirst_(texto, regex) {
  const m = texto.match(regex);
  return m ? m[1].trim() : null;
}

function limpar_(str) {
  if (!str) return '';
  return str.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function normNum_(str) {
  return str.replace(/[^0-9]/g, '');
}

// ──────────────────────────────────────────────────────────
// HELPERS DO PACOTE DE SEGURANÇA (itens 1–5)
// ──────────────────────────────────────────────────────────

/**
 * Compara o nome de uma aba a uma palavra-chave de forma tolerante
 * a emoji/acentos/espaços (ex.: "👥 Clientes" casa com "Clientes").
 */
function ehAba_(sheet, keyword) {
  if (!sheet) return false;
  const nome = String(sheet.getName()).toLowerCase().trim();
  const kw   = String(keyword).toLowerCase().trim();
  return nome === kw || nome.includes(kw);
}

/**
 * Converte um valor de célula (Date ou texto) para "dd/MM/yyyy".
 * Usado na deduplicação de prazos para comparar datas com segurança.
 */
function normalizarDataParaTexto_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, 'America/Sao_Paulo', 'dd/MM/yyyy');
  }
  const s = String(v || '').trim();
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return ('0' + m[1]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + m[3];
  return s;
}

// ----- R5: recálculo de KPIs com "debounce" (1 trigger pendente) -----

function marcarKPIsParaRecalculo_() {
  try {
    const props = PropertiesService.getScriptProperties();
    props.setProperty('KPIS_DIRTY', '1');
    const jaTem = ScriptApp.getProjectTriggers().some(function(t) {
      return t.getHandlerFunction() === 'recalcularKPIsSeNecessario';
    });
    if (!jaTem) {
      ScriptApp.newTrigger('recalcularKPIsSeNecessario')
        .timeBased().after(60 * 1000).create();
    }
  } catch (e) {
    // Em último caso, recalcula de forma síncrona para não perder a atualização.
    try { atualizarKPIs(); } catch (e2) {}
  }
}

function recalcularKPIsSeNecessario() {
  // Remove este gatilho one-shot (evita acúmulo de triggers).
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'recalcularKPIsSeNecessario') ScriptApp.deleteTrigger(t);
  });
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('KPIS_DIRTY') === '1') {
    props.deleteProperty('KPIS_DIRTY');
    atualizarKPIs();
  }
}

// ----- R1: revisão humana de e-mails que o parser não interpretou -----

function garantirLabelRevisar_() {
  try {
    GmailApp.getUserLabelByName(CONFIG.labelRevisar) ||
    GmailApp.createLabel(CONFIG.labelRevisar);
  } catch (e) {}
}

function jaParaRevisar_(thread) {
  return thread.getLabels().some(l => l.getName() === CONFIG.labelRevisar);
}

function marcarParaRevisar_(thread) {
  try {
    const label = GmailApp.getUserLabelByName(CONFIG.labelRevisar);
    if (label) thread.addLabel(label);
  } catch (e) {}
}

function enviarAvisoRevisao_(threads) {
  try {
    const destinos = _r3_destinos() || CFG.EMAIL_LUIZ;
    if (!destinos) return;

    let lista = '';
    threads.forEach(function(t) {
      const assunto = t.getFirstMessageSubject() || '(sem assunto)';
      const url     = t.getPermalink();
      lista += '• ' + assunto + '\n  ' + url + '\n\n';
    });

    const corpo =
      'Os e-mails abaixo são de remetentes judiciais reconhecidos (PJe / EPROC / ' +
      'Recorte Digital), mas a automação NÃO conseguiu extrair os dados ' +
      '(número do processo, movimentação, etc.).\n\n' +
      'Isso geralmente indica que o tribunal mudou o layout do e-mail. ' +
      'Eles foram marcados com a etiqueta "' + CONFIG.labelRevisar + '" no Gmail e ' +
      'NÃO foram lançados automaticamente — revise manualmente para não perder prazo:\n\n' +
      lista +
      '--- Neves Marques Advocacia (verificação automática)';

    GmailApp.sendEmail(destinos,
      '⚠️ ' + threads.length + ' e-mail(s) judicial(is) precisam de revisão manual',
      corpo);
    registrarLog('Aviso de revisão enviado: ' + threads.length + ' e-mail(s) p/ ' + destinos);
  } catch (e) {
    registrarLog('ERRO enviarAvisoRevisao_: ' + e.message);
  }
}


// ████████████████████████████████████████████████████████████
// FASE 2 — INGESTÃO INTELIGENTE DE E-MAILS
// Cursor incremental, dry-run, deduplicação por hash SHA-256,
// classificação em 13 tipos e fila de triagem.
// ████████████████████████████████████████████████████████████

// ──────────────────────────────────────────────────────────
// CONTROLE DE CURSOR E MODO DE EXECUÇÃO
// ──────────────────────────────────────────────────────────

function _f2_isDryRun_() {
  return PropertiesService.getScriptProperties().getProperty(F2.PROP_DRY_RUN) === '1';
}

function alternarModoTeste() {
  const props = PropertiesService.getScriptProperties();
  const ativo = props.getProperty(F2.PROP_DRY_RUN) === '1';
  if (ativo) {
    props.deleteProperty(F2.PROP_DRY_RUN);
    SpreadsheetApp.getUi().alert(
      'Modo Teste DESATIVADO.\n' +
      'A próxima execução de "Processar E-mails" voltará a gravar na planilha normalmente.'
    );
  } else {
    props.setProperty(F2.PROP_DRY_RUN, '1');
    SpreadsheetApp.getUi().alert(
      'Modo Teste ATIVADO.\n' +
      'A próxima execução de "Processar E-mails" apenas registrará no Log — ' +
      'nenhuma alteração será feita na planilha nem no Gmail.'
    );
  }
}

function reprocessarEmailsPorPeriodo() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt(
    'Reprocessar por Período',
    'Informe a data de início no formato DD/MM/AAAA (ex: 01/06/2026).\n' +
    'Os e-mails a partir dessa data serão reprocessados.\n' +
    'Andamentos já registrados na aba Andamentos (mesmo hash) serão ignorados automaticamente.',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const str = resp.getResponseText().trim();
  const partes = str.split('/');
  if (partes.length !== 3) {
    ui.alert('Data inválida. Use o formato DD/MM/AAAA.');
    return;
  }
  const desde = new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
  if (isNaN(desde.getTime())) {
    ui.alert('Data inválida: ' + str);
    return;
  }

  PropertiesService.getScriptProperties().setProperty(F2.PROP_LAST_RUN, desde.toISOString());
  ui.alert('Cursor redefinido para ' + str + '.\nIniciando processamento...');
  processarEmailsJudiciais();
}

// ──────────────────────────────────────────────────────────
// HASH DE DEDUPLICAÇÃO
// SHA-256 sobre número do processo + data + remetente + assunto + trecho.
// Evita que o mesmo andamento seja gravado mais de uma vez (re-execuções,
// reprocessamentos manuais, e-mails duplicados pelo tribunal).
// ──────────────────────────────────────────────────────────

function _f2_computarHash_(dados, msg) {
  const entrada = [
    normNum_(dados.numProcesso || ''),
    dados.ultimaMovData
      ? Utilities.formatDate(dados.ultimaMovData, 'America/Sao_Paulo', 'yyyyMMdd')
      : '',
    msg ? msg.getFrom()    : '',
    msg ? msg.getSubject() : '',
    (dados.descMovimentacao || '').substring(0, 120)
  ].join('|');

  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    entrada,
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function _f2_verificarDuplicata_(ss, hash) {
  try {
    const aba = resolverAba_(ss, SCHEMA.ANDAMENTOS.aliases);
    if (!aba) return false; // aba Andamentos ainda não criada → não bloqueia

    const dados     = aba.getDataRange().getValues();
    const cabecalho = dados[0] || [];
    const colHash   = cabecalho.indexOf('Hash de deduplicação');
    if (colHash < 0) return false;

    for (let r = 1; r < dados.length; r++) {
      if (String(dados[r][colHash]).trim() === hash) return true;
    }
    return false;
  } catch (e) {
    Logger.log('[F2] _f2_verificarDuplicata_ erro: ' + e.message);
    return false; // em caso de erro, não bloqueia o processamento
  }
}

// ──────────────────────────────────────────────────────────
// GRAVAR NA ABA ANDAMENTOS
// Registra cada movimentação capturada com metadados completos.
// Funciona mesmo que a aba Andamentos ainda não exista (falha silenciosa).
// ──────────────────────────────────────────────────────────

function _f2_gravarAndamento_(ss, dados, msg, hash, classif, ehNovo) {
  try {
    const aba = resolverAba_(ss, SCHEMA.ANDAMENTOS.aliases);
    if (!aba) return;

    const h = aba.getDataRange().getValues()[0] || [];
    function col(nome) { return h.indexOf(nome); }

    const linkEmail = msg ? 'https://mail.google.com/mail/u/0/#all/' + msg.getId() : '';
    const agora     = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
    const dataAnd   = dados.ultimaMovData
      ? Utilities.formatDate(dados.ultimaMovData, 'America/Sao_Paulo', 'dd/MM/yyyy')
      : agora;
    const classifFinal = ehNovo ? 'triagem' : classif;

    const nova = new Array(h.length).fill('');
    function s(nome, val) { const i = col(nome); if (i >= 0) nova[i] = String(val || ''); }

    s('ID interno',           'AND-' + new Date().getTime());
    s('Processo vinculado',   dados.numProcesso  || '');
    s('Data do andamento',    dataAnd);
    s('Sistema de origem',    _f2_nomeSistema_(dados.tipo));
    s('Resumo do andamento',  (dados.descMovimentacao || '').substring(0, 500));
    s('Texto bruto',          ''); // corpo completo não gravado (excede limite de célula)
    s('Link do e-mail',       linkEmail);
    s('Hash de deduplicação', hash);
    s('Classificação por IA', classifFinal);
    s('Relevância',           _f2_relevancia_(classifFinal));
    s('Ação sugerida',        _f2_acaoSugerida_(classifFinal));
    s('Criado em',            agora);

    aba.appendRow(nova);
  } catch (e) {
    Logger.log('[F2] _f2_gravarAndamento_ erro: ' + e.message);
  }
}

function _f2_nomeSistema_(tipo) {
  if (tipo === 'pje_push')        return 'PJe Push (TJRJ)';
  if (tipo === 'eproc')           return 'EPROC (JFRJ/TRF2)';
  if (tipo === 'recorte_digital') return 'Recorte Digital (OAB/RJ)';
  return 'Desconhecido';
}

// ──────────────────────────────────────────────────────────
// CLASSIFICAÇÃO DE MOVIMENTAÇÕES (13 TIPOS)
// Heurística por palavras-chave após normalizar acentos.
// A IA (Fase 4) pode sobrescrever em segundo passo se necessário.
// ──────────────────────────────────────────────────────────

function _f2_classificarMovimento_(desc) {
  if (!desc) return F2.TIPOS.ANDAMENTO;
  const d = desc.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (/\b(audiencia|sessao de julgamento|julgamento oral|designad[ao] audiencia)\b/.test(d))
    return F2.TIPOS.AUDIENCIA;
  if (/\b(sentenca|julgad[ao]|procedente|improcedente|extint[ao]|homo[lo]+gad[ao])\b/.test(d))
    return F2.TIPOS.SENTENCA;
  if (/\b(decisao|decidi[do]|deferi[do]|indeferi[do]|negad[ao] seguimento)\b/.test(d))
    return F2.TIPOS.DECISAO;
  if (/\b(prazo fatal|prazo processual|data limite|\d+ dias? uteis?|\d+ dias? para)\b/.test(d))
    return F2.TIPOS.PRAZO;
  if (/\b(intima[cç][ao]|intimad[ao]|citac[ao]|citad[ao]|mandado de citacao)\b/.test(d))
    return F2.TIPOS.INTIMACAO;
  if (/\b(publicac[ao]|dje|diario da justica|publicad[ao]|disponibilizac[ao])\b/.test(d))
    return F2.TIPOS.PUBLICACAO;
  if (/\b(despacho|determino|determine|vista ao|vistas ao|abra-se vista)\b/.test(d))
    return F2.TIPOS.DESPACHO;
  if (/\b(juntad[ao]|peticao juntada|documento juntad[ao]|juntada de)\b/.test(d))
    return F2.TIPOS.JUNTADA;
  if (/\b(certidao|certifico|certifica[cç][ao])\b/.test(d))
    return F2.TIPOS.CERTIDAO;
  if (/\b(ato ordinatorio|ordinatorio|secretaria expediu|secretaria informa)\b/.test(d))
    return F2.TIPOS.ATO_ORDINATORIO;
  if (/\b(comunicacao administrativa|cancelamento|suspensao do processo|arquivamento)\b/.test(d))
    return F2.TIPOS.COM_ADMINISTRATIVA;
  if (/\b(recibo de protocolo|confirmacao de recebimento|lembrete automatico)\b/.test(d))
    return F2.TIPOS.IRRELEVANTE;
  return F2.TIPOS.ANDAMENTO;
}

function _f2_relevancia_(classif) {
  const alta  = [F2.TIPOS.SENTENCA, F2.TIPOS.PRAZO, F2.TIPOS.INTIMACAO, F2.TIPOS.AUDIENCIA];
  const media = [F2.TIPOS.DECISAO, F2.TIPOS.PUBLICACAO, F2.TIPOS.DESPACHO];
  if (alta.indexOf(classif)  >= 0) return '🔴 Alta';
  if (media.indexOf(classif) >= 0) return '🟡 Média';
  if (classif === F2.TIPOS.IRRELEVANTE) return '⚪ Baixa';
  if (classif === 'triagem') return '🔵 Triagem';
  return '🟢 Normal';
}

function _f2_acaoSugerida_(classif) {
  const acoes = {
    sentenca:          'Revisar decisão e comunicar cliente — avaliar recurso',
    prazo:             'Verificar data limite e providenciar peça ou manifestação',
    intimacao:         'Verificar conteúdo da intimação no sistema de origem',
    audiencia:         'Confirmar data/hora no sistema e preparar cliente',
    decisao:           'Analisar decisão e verificar necessidade de manifestação',
    publicacao:        'Conferir texto publicado no diário e contar prazos',
    despacho:          'Cumprir determinação do despacho no prazo',
    juntada:           'Verificar documento juntado e tomar providências',
    certidao:          'Conferir certidão emitida',
    ato_ordinatorio:   'Verificar ato da secretaria',
    com_administrativa:'Verificar comunicação administrativa',
    irrelevante:       '',
    andamento:         'Verificar andamento no sistema de origem',
    triagem:           'PROCESSO NOVO — vincular ao cliente correto antes de prosseguir'
  };
  return acoes[classif] || '';
}

// ──────────────────────────────────────────────────────────
// TRIAGEM — label Gmail para processos novos (sem cliente vinculado)
// ──────────────────────────────────────────────────────────

function _f2_garantirLabelTriagem_() {
  try {
    GmailApp.getUserLabelByName(F2.LABEL_TRIAGEM) ||
    GmailApp.createLabel(F2.LABEL_TRIAGEM);
  } catch (e) {}
}

function _f2_marcarTriagem_(thread) {
  try {
    const label = GmailApp.getUserLabelByName(F2.LABEL_TRIAGEM);
    if (label) thread.addLabel(label);
  } catch (e) {
    Logger.log('[F2] _f2_marcarTriagem_ erro: ' + e.message);
  }
}


// ████████████████████████████████████████████████████████████
// FASE 3 — PRAZOS, AGENDA E ALERTAS
// Confirmação humana obrigatória, status "Pendente de conferência",
// 7 KPIs de agenda, alertas configuráveis por antecedência.
// ████████████████████████████████████████████████████████████

// ──────────────────────────────────────────────────────────
// CONFIRMAÇÃO MANUAL DE PRAZO
// Selecione uma linha na aba Agenda e use o menu
// 🔔 Alertas → ✅ Confirmar Prazo Selecionado.
// Permite revisar/corrigir a data antes de confirmar.
// ──────────────────────────────────────────────────────────
function confirmarPrazo() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const aba   = ss.getActiveSheet();
  const range = ss.getActiveRange();
  const ui    = SpreadsheetApp.getUi();

  if (!ehAba_(aba, 'Agenda')) {
    ui.alert('Selecione uma linha na aba Agenda antes de confirmar o prazo.');
    return;
  }

  const linhas = aba.getDataRange().getValues();
  const cab    = encontrarCabecalho_(linhas, 'Data');
  if (!cab) {
    ui.alert('Cabeçalho não encontrado na aba Agenda.');
    return;
  }

  const h     = cab.headers;
  const linha = range.getRow();
  if (linha <= cab.cabRow + 1) {
    ui.alert('Selecione uma linha de dados — não o cabeçalho.');
    return;
  }

  const colSt  = h.indexOf('Status');
  const colDt  = h.indexOf('Data') >= 0 ? h.indexOf('Data') : h.indexOf('Data fatal');
  const colCnf = h.indexOf('Confirmado por humano');
  const status = colSt >= 0 ? String(linhas[linha - 1][colSt] || '').trim() : '';

  if (status === F3.STATUS_REALIZADO || status === F3.STATUS_CANCELADO) {
    ui.alert('Este prazo já está como "' + status + '". Nenhuma alteração feita.');
    return;
  }

  const dataAtual = colDt >= 0
    ? normalizarDataParaTexto_(linhas[linha - 1][colDt])
    : '';

  const resp = ui.prompt(
    '✅ Confirmar Prazo',
    'Data atual registrada: ' + (dataAtual || '(coluna Data não encontrada)') + '\n\n' +
    'Para MANTER a data, deixe em branco e clique OK.\n' +
    'Para CORRIGIR a data, informe a nova data (DD/MM/AAAA):',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const novaDataStr = resp.getResponseText().trim();
  let novaData = null;
  if (novaDataStr) {
    const p = novaDataStr.split('/');
    if (p.length !== 3) {
      ui.alert('Formato inválido. Use DD/MM/AAAA. Confirmação cancelada.');
      return;
    }
    novaData = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
    if (isNaN(novaData.getTime())) {
      ui.alert('Data inválida: ' + novaDataStr + '. Confirmação cancelada.');
      return;
    }
  }

  // Aplica as alterações
  const usuario  = Session.getActiveUser().getEmail() || 'usuário';
  const agora    = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
  const confirma = usuario + ' em ' + agora;

  function setCel(nomeCol, valor) {
    const idx = h.indexOf(nomeCol);
    if (idx >= 0) aba.getRange(linha, idx + 1).setValue(valor);
  }

  setCel('Status', F3.STATUS_CONFIRMADO);
  if (colCnf >= 0) aba.getRange(linha, colCnf + 1).setValue(confirma);

  if (novaData) {
    const dtFmt = Utilities.formatDate(novaData, 'America/Sao_Paulo', 'dd/MM/yyyy');
    setCel('Data',       dtFmt);
    setCel('Data fatal', dtFmt);
  }

  SpreadsheetApp.flush();
  const logMsg = 'Prazo confirmado por ' + confirma
    + (novaData ? ' | Data revisada para: '
       + Utilities.formatDate(novaData, 'America/Sao_Paulo', 'dd/MM/yyyy') : '');
  registrarLog(logMsg);
  ui.alert('✅ Prazo confirmado com sucesso!\n\n' + logMsg);
}

// ──────────────────────────────────────────────────────────
// 7 KPIs DE AGENDA
// Chamado por atualizarKPIs(). Tolerante à ausência da aba
// ou de colunas específicas (retorna zeros).
// ──────────────────────────────────────────────────────────
function _f3_kpisAgenda_(ss) {
  const zero = { hoje: 0, amanha: 0, semana: 0, vencidos: 0,
                 semResp: 0, pendConf: 0, processosParados: 0 };
  try {
    const abaAg = getSheet_(ss, 'Agenda');
    if (!abaAg) return zero;

    const linhas = abaAg.getDataRange().getValues();
    const cab    = encontrarCabecalho_(linhas, 'Data');
    if (!cab) return zero;

    const h      = cab.headers;
    const colDt  = h.indexOf('Data') >= 0 ? h.indexOf('Data') : h.indexOf('Data fatal');
    const colSt  = h.indexOf('Status');
    const colRsp = h.indexOf('Responsável');
    if (colDt < 0) return zero;

    const agora   = new Date(); agora.setHours(0, 0, 0, 0);
    const amanha  = new Date(agora); amanha.setDate(agora.getDate() + 1);
    const em7dias = new Date(agora); em7dias.setDate(agora.getDate() + 7);

    let hoje = 0, amanha_ = 0, semana = 0, vencidos = 0, semResp = 0, pendConf = 0;

    for (let r = cab.cabRow + 1; r < linhas.length; r++) {
      const celData = linhas[r][colDt];
      const status  = colSt  >= 0 ? String(linhas[r][colSt]  || '').trim() : '';
      const resp    = colRsp >= 0 ? String(linhas[r][colRsp] || '').trim() : '';

      if (!celData || String(celData).includes('AGENDA')) continue;
      if (status === F3.STATUS_REALIZADO || status === F3.STATUS_CANCELADO) continue;

      const data = new Date(celData);
      if (isNaN(data.getTime())) continue;
      data.setHours(0, 0, 0, 0);

      if      (data < agora)                          { vencidos++; }
      else if (data.getTime() === agora.getTime())    { hoje++; }
      else if (data.getTime() === amanha.getTime())   { amanha_++; }
      else if (data > agora && data <= em7dias)       { semana++; }

      if (!resp)                            semResp++;
      if (status === F3.STATUS_PENDENTE)    pendConf++;
    }

    const processosParados = _r3_processosInativos(ss).length;
    return { hoje, amanha: amanha_, semana, vencidos, semResp, pendConf, processosParados };

  } catch (e) {
    Logger.log('[F3] _f3_kpisAgenda_ erro: ' + e.message);
    return zero;
  }
}

// ──────────────────────────────────────────────────────────
// E-MAIL DE PRAZOS — versão FASE 3
// Inclui seção de "Pendentes de conferência" além de
// urgentes, normais e vencidos.
// ──────────────────────────────────────────────────────────
function _f3_enviarEmailPrazos_(urgentes, normais, vencidos, naoConf, ssId) {
  const hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy');

  function tabela(itens, corHeader) {
    let t = '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
      + '<tr style="background:' + corHeader + ';color:#fff;">'
      + '<th style="padding:7px 10px;text-align:left;">Data / Situação</th>'
      + '<th style="padding:7px 10px;text-align:left;">Cliente</th>'
      + '<th style="padding:7px 10px;text-align:left;">Ação Necessária</th>'
      + '<th style="padding:7px 10px;text-align:left;">Responsável</th>'
      + '<th style="padding:7px 10px;text-align:left;">Confirmado</th>'
      + '</tr>';
    itens.forEach(function(p, idx) {
      const bg  = idx % 2 === 0 ? '#ffffff' : '#f9f9f9';
      const dt  = Utilities.formatDate(p.data, 'America/Sao_Paulo', 'dd/MM/yyyy');
      const lag = p.dias < 0
        ? '<span style="color:#c62828;font-weight:bold;">' + Math.abs(p.dias) + 'd VENCIDO</span>'
        : '<strong>' + dt + '</strong> (' + p.dias + 'd)';
      const confTxt = p.confirmado
        ? '<span style="color:#2e7d32;font-size:11px;">✅ ' + p.confirmado + '</span>'
        : '<span style="color:#e65100;font-size:11px;">⏳ Aguardando</span>';
      t += '<tr style="background:' + bg + ';">'
        + '<td style="padding:7px 10px;">' + lag + '</td>'
        + '<td style="padding:7px 10px;">' + (p.cliente || p.processo) + '</td>'
        + '<td style="padding:7px 10px;font-size:12px;">' + p.descricao.substring(0, 200) + '</td>'
        + '<td style="padding:7px 10px;">' + (p.responsavel || '—') + '</td>'
        + '<td style="padding:7px 10px;">' + confTxt + '</td>'
        + '</tr>';
    });
    return t + '</table>';
  }

  let corpo = '<div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;">'
    + '<div style="background:#1a237e;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">'
    + '<h2 style="margin:0 0 4px;">⚖️ Neves Marques Advocacia</h2>'
    + '<p style="margin:0;font-size:14px;">Relatório de Prazos — ' + hoje + '</p>'
    + '</div>';

  if (naoConf.length) {
    corpo += '<div style="background:#e8eaf6;border-left:5px solid #3949ab;padding:16px 20px;margin:12px 0;">'
      + '<h3 style="margin:0 0 10px;color:#1a237e;">⚠️ PENDENTES DE CONFERÊNCIA — '
      + naoConf.length + ' prazo(s) aguardando confirmação humana</h3>'
      + '<p style="margin:0 0 10px;font-size:13px;color:#555;">'
      + 'Estes prazos foram capturados automaticamente. Nenhum deve ser tratado como definitivo '
      + 'sem confirmação manual (menu ✅ Confirmar Prazo Selecionado).</p>'
      + tabela(naoConf, '#3949ab') + '</div>';
  }

  if (vencidos.length) {
    corpo += '<div style="background:#fce4ec;border-left:5px solid #880e4f;padding:16px 20px;margin:12px 0;">'
      + '<h3 style="margin:0 0 10px;color:#880e4f;">⛔ VENCIDOS — ' + vencidos.length + ' prazo(s) em atraso</h3>'
      + tabela(vencidos, '#880e4f') + '</div>';
  }

  if (urgentes.length) {
    corpo += '<div style="background:#ffebee;border-left:5px solid #c62828;padding:16px 20px;margin:12px 0;">'
      + '<h3 style="margin:0 0 10px;color:#c62828;">🔴 URGENTE — ' + urgentes.length
      + ' prazo(s) em até ' + F3.DIAS_URGENTE + ' dias</h3>'
      + tabela(urgentes, '#c62828') + '</div>';
  }

  if (normais.length) {
    corpo += '<div style="background:#fff8e1;border-left:5px solid #f57f17;padding:16px 20px;margin:12px 0;">'
      + '<h3 style="margin:0 0 10px;color:#f57f17;">🟡 ATENÇÃO — ' + normais.length
      + ' prazo(s) nos próximos ' + CFG.DIAS_ALERTA + ' dias</h3>'
      + tabela(normais, '#f57f17') + '</div>';
  }

  corpo += '<div style="background:#f5f5f5;padding:14px 20px;border-radius:0 0 8px 8px;font-size:12px;color:#666;">'
    + '<a href="https://docs.google.com/spreadsheets/d/' + ssId
    + '" style="color:#1a237e;font-weight:bold;">📊 Abrir Dashboard</a>'
    + ' &nbsp;|&nbsp; Neves Marques Advocacia — OAB/RJ 253.413 · OAB/RJ 241.456'
    + '</div></div>';

  const numCriticos = vencidos.length + urgentes.length + naoConf.length;
  const assunto = numCriticos > 0
    ? '🔴 ' + numCriticos + ' prazo(s) crítico(s) — ' + hoje
    : '🟡 ' + normais.length + ' prazo(s) esta semana — ' + hoje;

  const destinos = [CFG.EMAIL_LUIZ, CFG.EMAIL_KARINY]
    .filter(function(e) { return e && !e.includes('PREENCHA'); })
    .join(',');

  if (destinos) {
    GmailApp.sendEmail(destinos, assunto, 'Visualize em HTML.', { htmlBody: corpo });
    registrarLog('E-mail de prazos (F3) enviado para: ' + destinos
      + ' | NãoConf=' + naoConf.length
      + ' Vencidos=' + vencidos.length
      + ' Urgentes=' + urgentes.length
      + ' Normais=' + normais.length);
  }
}
