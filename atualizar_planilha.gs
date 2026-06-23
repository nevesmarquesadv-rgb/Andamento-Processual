/**
 * ============================================================
 * ANDAMENTO PROCESSUAL — Neves Marques Advocacia
 * Script Google Apps Script com automação diária via trigger
 * ============================================================
 *
 * INSTALAÇÃO (fazer uma única vez):
 *  1. Abra a planilha "Dashboard - Escritório"
 *  2. Clique em "Extensões" > "Apps Script"
 *  3. Apague o conteúdo existente e cole todo este arquivo
 *  4. Clique em "Executar" > selecione "configurarTriggerDiario"
 *  5. Autorize o acesso quando solicitado
 *  6. Pronto — o script rodará automaticamente todo dia às 7h
 *
 * Para atualizar manualmente a qualquer momento:
 *  Execute a função "processarEmailsJudiciais"
 * ============================================================
 */

// ──────────────────────────────────────────────────────────
// CONFIGURAÇÃO
// ──────────────────────────────────────────────────────────
const CONFIG = {
  spreadsheetId: '1X8BX-jsHsN5AcjdxmpePp2baVqGA3hKMZcWHPxZrO44',
  abaProcessos:  'Processos',
  abaAgenda:     'Agenda',
  diasRetroativos: 2,   // quantos dias para trás buscar e-mails não processados
  labelProcessado: 'PJe-Processado',

  // Remetentes judiciais reconhecidos
  remetentes: [
    'tjrj.pjeadm-LD@tjrj.jus.br',
    'eproc.noreply@tjrj.jus.br',
    'eproc-bounce@jfrj.jus.br',
    'rd_oabrj@recortedigital.adv.br'
  ]
};

// ──────────────────────────────────────────────────────────
// PONTO DE ENTRADA PRINCIPAL
// ──────────────────────────────────────────────────────────
function processarEmailsJudiciais() {
  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  garantirLabelProcessado_();

  const query = buildGmailQuery_();
  const threads = GmailApp.search(query, 0, 50);
  Logger.log(`Encontrados ${threads.length} threads para processar`);

  let totalAtualizados = 0;
  let totalNovos = 0;
  let alertasUrgentes = [];

  for (const thread of threads) {
    if (jaProcessado_(thread)) continue;

    for (const msg of thread.getMessages()) {
      const remetente = msg.getFrom();
      if (!remetenteReconhecido_(remetente)) continue;

      const corpo = msg.getPlainBody() + msg.getBody();
      const dados = extrairDadosEmail_(corpo, remetente, msg.getDate());
      if (!dados) continue;

      const resultado = aplicarNaPlanilha_(ss, dados);
      if (resultado.novo)       totalNovos++;
      if (resultado.atualizado) totalAtualizados++;
      if (resultado.alerta)     alertasUrgentes.push(resultado.alerta);
    }

    marcarComoProcessado_(thread);
  }

  Logger.log(`Resultado: ${totalAtualizados} atualizados, ${totalNovos} novos processos`);

  if (alertasUrgentes.length > 0) {
    enviarAlertaEmail_(alertasUrgentes);
  }
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

  const abaProc = ss.getSheetByName(CONFIG.abaProcessos);
  if (!abaProc) return resultado;

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
  const abaAg = ss.getSheetByName(CONFIG.abaAgenda);
  if (!abaAg) return;

  const todasLinhas = abaAg.getDataRange().getValues();
  const cab = encontrarCabecalho_(todasLinhas, 'Data');
  if (!cab) return;

  const { headers: hAg } = cab;

  // Evita duplicação
  for (let r = 0; r < todasLinhas.length; r++) {
    if (normNum_(String(todasLinhas[r][0])) === normNum_(dados.numProcesso) &&
        String(todasLinhas[r][hAg.indexOf('Nº Processo / Ref.')]).includes(dados.numProcesso)) return;
  }

  const cliente    = linhaProc ? linhaProc[headers.indexOf('Cliente')] : (dados.poloAtivo || 'A identificar');
  const tribunal   = linhaProc ? linhaProc[headers.indexOf('Tribunal / Órgão')] : (dados.orgao || '');
  const responsavel= linhaProc ? linhaProc[headers.indexOf('Responsável')] : '';

  const prazoData  = urgente ? calcularPrazo_(dados.ultimaMovData, 15) : calcularPrazo_(dados.ultimaMovData, 7);
  const prazoStr   = Utilities.formatDate(prazoData, 'America/Sao_Paulo', 'dd/MM/yyyy');

  const novaLinha  = new Array(hAg.length).fill('');
  function s(col, val) { const i = hAg.indexOf(col); if (i >= 0) novaLinha[i] = val; }

  s('Data',               prazoStr);
  s('Tipo',               urgente ? 'Prazo Processual' : 'Acompanhamento');
  s('Nº Processo / Ref.', `${dados.numProcesso} — ${cliente}`);
  s('Cliente',            String(cliente));
  s('Tribunal / Local',   String(tribunal));
  s('Descrição',          dados.descMovimentacao.substring(0, 300));
  s('Responsável',        String(responsavel));
  s('Status',             'Pendente');
  s('Prioridade',         urgente ? '🔴 Alta' : '🟡 Média');

  abaAg.appendRow(novaLinha);
}

// ──────────────────────────────────────────────────────────
// ATUALIZAÇÕES MANUAIS — E-MAILS DE HOJE (23/06/2026)
// Execute "aplicarAtualizacoesDeHoje" para registrar os
// 3 e-mails do PJe Push recebidos hoje.
// ──────────────────────────────────────────────────────────
function aplicarAtualizacoesDeHoje() {
  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const abaProc = ss.getSheetByName(CONFIG.abaProcessos);
  const abaAg   = ss.getSheetByName(CONFIG.abaAgenda);

  const todasLinhas = abaProc.getDataRange().getValues();
  const cab = encontrarCabecalho_(todasLinhas, 'Nº Processo');
  if (!cab) { Logger.log('Cabeçalho não encontrado'); return; }
  const { cabRow, headers } = cab;

  // ── 1. ADEMIR × GOL (0812492-61) ──────────────────────
  // Expedição de documentos + Juntada de Petição em 22/06
  atualizarLinhaPorNumero_(abaProc, todasLinhas, headers,
    '0812492-61.2026.8.19.0038',
    '22/06/2026',
    '22/06/2026 14:15 — Expedição de Outros documentos | 22/06/2026 14:10 — Juntada de Petição de petição (PJe Push TJRJ)'
  );
  // Acompanhar o que foi expedido (pode ser intimação para audiência)
  appendAgenda_(abaAg, {
    data: '30/06/2026', tipo: 'Acompanhamento',
    proc: '0812492-61.2026.8.19.0038 — Ademir × GOL',
    cliente: 'Ademir Belarmino de Souza',
    tribunal: '4º JECível — Nova Iguaçu',
    desc: 'Verificar documentos expedidos em 22/06 e petição juntada — possível designação de audiência ou intimação. Acessar PJe/TJRJ.',
    resp: 'Kariny Barbosa', prioridade: '🟡 Média'
  });

  // ── 2. VITOR × AZUL (0862248-73) — ⚠️ JULGADO IMPROCEDENTE ──
  atualizarLinhaPorNumero_(abaProc, todasLinhas, headers,
    '0862248-73.2025.8.19.0038',
    '22/06/2026',
    '22/06/2026 17:02 — JULGADO IMPROCEDENTE O PEDIDO | Homologação de Decisão de Juiz Leigo | Expedição de documentos (PJe Push TJRJ 22/06/2026)'
  );
  // Atualiza fase
  const idxFase = headers.indexOf('Fase');
  buscarEAtualizarCelula_(abaProc, todasLinhas, headers, '0862248-73.2025.8.19.0038', idxFase, 'Sentença — Improcedente');

  // PRAZO URGENTE: Recurso Inominado — 15 dias da ciência
  appendAgenda_(abaAg, {
    data: '07/07/2026', tipo: 'Prazo Processual',
    proc: '0862248-73.2025.8.19.0038 — Vitor × Azul',
    cliente: 'Vitor Aguiar Vidon de Oliveira',
    tribunal: '2º JECível — Nova Iguaçu',
    desc: '🚨 PRAZO FATAL — Pedido JULGADO IMPROCEDENTE em 22/06/2026 (homologação de juiz leigo). Verificar publicação oficial e decidir com cliente sobre Recurso Inominado (prazo: 15 dias da ciência). Avaliar fundamentos para recurso.',
    resp: 'Kariny Barbosa', prioridade: '🔴 Alta'
  });

  // ── 3. WALLACE × DETRAN (0804503-97) — PROCESSO NOVO ──
  // Não está na planilha. Inserir como novo processo.
  const jaExiste = todasLinhas.some(r => normNum_(String(r[0])) === normNum_('0804503-97.2025.8.19.0083'));
  if (!jaExiste) {
    const linhasAtual = abaProc.getDataRange().getValues();
    let linhaIns = linhasAtual.length + 1;
    for (let r = cabRow + 1; r < linhasAtual.length; r++) {
      const v = String(linhasAtual[r][0]).trim();
      if (v === '' || v.startsWith('⚖')) { linhaIns = r + 1; break; }
    }
    const novaLinha = new Array(headers.length).fill('');
    function s(col, val) { const i = headers.indexOf(col); if (i >= 0) novaLinha[i] = val; }
    s('Nº Processo',             '0804503-97.2025.8.19.0083');
    s('ID',                      '—');
    s('Cliente',                 'Wallace da Rosa Candido');
    s('Área',                    'Direito Administrativo / Trânsito');
    s('Tipo de Ação',            'Procedimento Comum Cível — Indenização por Dano Moral');
    s('Tribunal / Órgão',        '5º Núcleo de Justiça 4.0 — Causas Fazendárias até 60 SM — TJRJ');
    s('Status',                  'Ativo');
    s('Fase',                    'Instrução');
    s('Polo Ativo',              'Wallace da Rosa Candido');
    s('Polo Passivo',            'DETRAN — Departamento de Trânsito do Estado do Rio de Janeiro e Outros');
    s('Valor',                   'A definir');
    s('Distribuição',            '15/11/2025');
    s('Últ. Mov.',               '22/06/2026');
    s('Desc. Últ. Movimentação', '22/06/2026 00:47 — Decorrido prazo do DETRAN em 19/06/2026 23:59 — Prazo da parte ré encerrado (PJe Push TJRJ 23/06/2026)');
    s('Tipo Prazo',              'Prazo Processual');
    s('Observações',             'Inserido automaticamente. Autuado em 15/11/2025. Prazo do DETRAN decorrido — verificar se cabe decretação de revelia ou despacho do juiz.');
    abaProc.insertRowBefore(linhaIns);
    abaProc.getRange(linhaIns, 1, 1, novaLinha.length).setValues([novaLinha]);
    Logger.log('Processo Wallace/DETRAN inserido');
  }

  appendAgenda_(abaAg, {
    data: '30/06/2026', tipo: 'Prazo Processual',
    proc: '0804503-97.2025.8.19.0083 — Wallace × DETRAN e Outros',
    cliente: 'Wallace da Rosa Candido',
    tribunal: '5º Núcleo Justiça 4.0 — Causas Fazendárias — TJRJ',
    desc: 'Prazo do DETRAN DECORRIDO em 19/06/2026. Verificar se há despacho do juiz decretando revelia ou determinando próximo passo. Acessar PJe/TJRJ para acompanhar.',
    resp: 'Luiz Fernando / Kariny Barbosa', prioridade: '🟠 Alta'
  });

  SpreadsheetApp.getUi().alert(
    '✅ Atualizações de 23/06/2026 aplicadas!\n\n' +
    '• Ademir × GOL (0812492-61): movimentação de 22/06 registrada\n' +
    '• Vitor × Azul (0862248-73): ⚠️ JULGADO IMPROCEDENTE — prazo recurso 07/07\n' +
    '• Wallace × DETRAN (0804503-97): processo novo inserido — prazo DETRAN decorrido\n\n' +
    '⚠️ ATENÇÃO: Verificar urgentemente o recurso do processo do Vitor (Azul)!'
  );
}

// ──────────────────────────────────────────────────────────
// CONFIGURAR GATILHO DIÁRIO (executar uma única vez)
// ──────────────────────────────────────────────────────────
function configurarTriggerDiario() {
  // Remove triggers existentes do mesmo tipo para evitar duplicação
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    if (t.getHandlerFunction() === 'processarEmailsJudiciais') {
      ScriptApp.deleteTrigger(t);
    }
  }

  // Cria trigger: todo dia às 7h (horário de Brasília)
  ScriptApp.newTrigger('processarEmailsJudiciais')
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .inTimezone('America/Sao_Paulo')
    .create();

  Logger.log('✅ Trigger diário configurado: processarEmailsJudiciais roda todo dia às 7h (Brasília)');

  try {
    SpreadsheetApp.getUi().alert(
      '✅ Automação configurada!\n\n' +
      'O script "processarEmailsJudiciais" rodará automaticamente\n' +
      'todos os dias às 7h (horário de Brasília).\n\n' +
      'Ele irá:\n' +
      '• Ler os e-mails judiciais da caixa de entrada\n' +
      '• Atualizar a aba Processos com novas movimentações\n' +
      '• Adicionar prazos na aba Agenda\n' +
      '• Enviar alerta por e-mail em casos urgentes (sentença, etc.)\n\n' +
      'Para atualizar manualmente a qualquer hora, execute\n' +
      '"processarEmailsJudiciais" no Apps Script.'
    );
  } catch(e) { Logger.log('Trigger criado (sem UI disponível)'); }
}

// ──────────────────────────────────────────────────────────
// UTILITÁRIOS INTERNOS
// ──────────────────────────────────────────────────────────
function buildGmailQuery_() {
  const from = CONFIG.remetentes.map(r => `from:${r}`).join(' OR ');
  return `(${from}) newer_than:${CONFIG.diasRetroativos}d -label:${CONFIG.labelProcessado}`;
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
  // Evita duplicação pelo número do processo + data
  for (const r of linhas) {
    if (String(r[0]) === item.data && String(r[3]).includes(item.proc.split(' ')[0])) return;
  }
  const cab = encontrarCabecalho_(linhas, 'Data');
  if (!cab) return;
  const h = cab.headers;
  const linha = new Array(h.length).fill('');
  function s(col, val) { const i = h.indexOf(col); if (i >= 0) linha[i] = val; }
  s('Data', item.data);
  s('Tipo', item.tipo);
  s('Nº Processo / Ref.', item.proc);
  s('Cliente', item.cliente || '');
  s('Tribunal / Local', item.tribunal || '');
  s('Descrição', item.desc || '');
  s('Responsável', item.resp || '');
  s('Status', 'Pendente');
  s('Prioridade', item.prioridade || '🟡 Média');
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
