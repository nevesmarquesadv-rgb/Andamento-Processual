/**
 * ATUALIZAÇÕES DOS E-MAILS — 17 A 20/06/2026
 * Fonte: E-mails judiciais encaminhados para nevesmarquesadv@gmail.com
 *
 * Para executar:
 *  1. Abra a planilha "Dashboard - Escritório"
 *  2. Clique em "Extensões" > "Apps Script"
 *  3. Cole este código e clique em "Executar" (▶)
 */

function atualizarAndamentos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // =========================================================
  // 1. ATUALIZAR PROCESSO WILBER — aba Processos
  // =========================================================
  atualizarWilber(ss);

  // =========================================================
  // 2. INSERIR NOVO PROCESSO — Bruna/Luisa × Estado RJ
  // =========================================================
  inserirProcessoBruna(ss);

  // =========================================================
  // 3. AGENDA — novos itens para ambos os processos
  // =========================================================
  inserirAgenda(ss);

  SpreadsheetApp.getUi().alert(
    '✅ Planilha atualizada com sucesso!\n\n' +
    '• Processo Wilber (5002092-77): movimentação de 20/06 registrada\n' +
    '• Novo processo Bruna/Luisa (3110375-04) inserido\n' +
    '• 2 itens adicionados na Agenda'
  );
}

// ---------------------------------------------------------
// WILBER: atualiza "Últ. Mov." e "Desc. Últ. Movimentação"
// ---------------------------------------------------------
function atualizarWilber(ss) {
  const aba = ss.getSheetByName('Processos');
  if (!aba) { Logger.log('Aba "Processos" não encontrada'); return; }

  const NUM_PROCESSO = '5002092-77.2026.4.02.5102';
  const dados = aba.getDataRange().getValues();

  // Localiza cabeçalho
  let cabRow = -1;
  let colNumProc = -1, colUltMov = -1, colDescMov = -1, colTipoPrazo = -1, colDataLimite = -1;
  for (let r = 0; r < dados.length; r++) {
    const row = dados[r];
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c]).trim();
      if (cell === 'Nº Processo') { cabRow = r; colNumProc = c; }
      if (cabRow === r) {
        if (cell === 'Últ. Mov.') colUltMov = c;
        if (cell === 'Desc. Últ. Movimentação') colDescMov = c;
        if (cell === 'Tipo Prazo') colTipoPrazo = c;
        if (cell === 'Data Limite') colDataLimite = c;
      }
    }
    if (colNumProc >= 0 && colUltMov >= 0) break;
  }

  if (cabRow < 0) { Logger.log('Cabeçalho de Processos não localizado'); return; }

  // Localiza linha do Wilber
  for (let r = cabRow + 1; r < dados.length; r++) {
    if (String(dados[r][colNumProc]).trim() === NUM_PROCESSO) {
      const linha = r + 1; // 1-based
      if (colUltMov >= 0)   aba.getRange(linha, colUltMov + 1).setValue('20/06/2026');
      if (colDescMov >= 0)  aba.getRange(linha, colDescMov + 1).setValue(
        'Expedida/certificada a intimação eletrônica — Evento 11 (JFRJ/EPROC — 20/06/2026)'
      );
      if (colTipoPrazo >= 0) aba.getRange(linha, colTipoPrazo + 1).setValue('Intimação Eletrônica');
      if (colDataLimite >= 0) aba.getRange(linha, colDataLimite + 1).setValue('11/07/2026');
      Logger.log('Wilber atualizado na linha ' + linha);
      return;
    }
  }
  Logger.log('Processo do Wilber não encontrado: ' + NUM_PROCESSO);
}

// ---------------------------------------------------------
// BRUNA/LUISA: insere novo processo na aba Processos
// ---------------------------------------------------------
function inserirProcessoBruna(ss) {
  const aba = ss.getSheetByName('Processos');
  if (!aba) { Logger.log('Aba "Processos" não encontrada'); return; }

  const NUM_PROCESSO = '3110375-04.2026.8.19.0001';
  const dados = aba.getDataRange().getValues();

  // Verifica se já existe
  for (let r = 0; r < dados.length; r++) {
    if (String(dados[r][0]).trim() === NUM_PROCESSO) {
      Logger.log('Processo Bruna já existe na planilha — pulando inserção');
      return;
    }
  }

  // Encontra coluna de cabeçalho para mapear campos
  let cabRow = -1;
  let headers = [];
  for (let r = 0; r < dados.length; r++) {
    if (String(dados[r][0]).trim() === 'Nº Processo') {
      cabRow = r;
      headers = dados[r].map(h => String(h).trim());
      break;
    }
  }

  if (cabRow < 0) { Logger.log('Cabeçalho não encontrado para inserção'); return; }

  // Encontra a próxima linha vazia após o último processo do escritório
  // (antes da linha "PROCESSOS — LUIZ FERNANDO..." se existir)
  let linhaInsercao = -1;
  for (let r = cabRow + 1; r < dados.length; r++) {
    const v = String(dados[r][0]).trim();
    if (v === '' || v.startsWith('⚖')) {
      linhaInsercao = r + 1; // 1-based, insere ANTES desta linha
      break;
    }
  }
  if (linhaInsercao < 0) linhaInsercao = dados.length + 1;

  // Monta linha com os dados do novo processo
  const novaLinha = new Array(headers.length).fill('');

  function set(col, val) {
    const idx = headers.indexOf(col);
    if (idx >= 0) novaLinha[idx] = val;
  }

  set('Nº Processo',             '3110375-04.2026.8.19.0001');
  set('ID',                      '—');
  set('Cliente',                 'Bruna Martins Ribeiro Ferreira / Luisa Ribeiro Ferreira');
  set('Área',                    'Direito Cível');
  set('Tipo de Ação',            'Procedimento Comum Cível — Fazenda Pública');
  set('Tribunal / Órgão',        '17ª Vara da Fazenda Pública da Comarca da Capital — TJRJ');
  set('Status',                  'Ativo');
  set('Fase',                    'Distribuição');
  set('Polo Ativo',              'Bruna Martins Ribeiro Ferreira e Luisa Ribeiro Ferreira');
  set('Polo Passivo',            'Estado do Rio de Janeiro');
  set('Valor',                   'A definir');
  set('Distribuição',            '17/06/2026');
  set('Últ. Mov.',               '17/06/2026');
  set('Desc. Últ. Movimentação', 'Distribuído por sorteio em 17/06/2026 (14h26) — Magistrado: Manoel Tavares Cavalcanti — Publicação DJE/TJRJ em 22/06/2026 — Chave EPROC: 397388264626');
  set('Prox. Prazo',             'Acompanhar despacho inicial e intimações');
  set('Tipo Prazo',              'Prazo Processual');
  set('Data Limite',             '');
  set('Responsável',             'Kariny Barbosa / Luiz Fernando');
  set('Observações',             'Novo processo distribuído em 17/06/2026 · Publicado DJ RJ 22/06/2026 · Advogados: Kariny Barbosa OAB 241456/RJ e Luiz Fernando OAB 253413/RJ');

  aba.insertRowBefore(linhaInsercao);
  aba.getRange(linhaInsercao, 1, 1, novaLinha.length).setValues([novaLinha]);
  Logger.log('Processo Bruna inserido na linha ' + linhaInsercao);
}

// ---------------------------------------------------------
// AGENDA: insere 2 novos itens de acompanhamento
// ---------------------------------------------------------
function inserirAgenda(ss) {
  const aba = ss.getSheetByName('Agenda');
  if (!aba) { Logger.log('Aba "Agenda" não encontrada'); return; }

  const dados = aba.getDataRange().getValues();
  let cabRow = -1;
  let headers = [];
  for (let r = 0; r < dados.length; r++) {
    if (String(dados[r][0]).trim() === 'Data') {
      cabRow = r;
      headers = dados[r].map(h => String(h).trim());
      break;
    }
  }

  if (cabRow < 0) { Logger.log('Cabeçalho da Agenda não encontrado'); return; }

  const itens = [
    // Item 1 — Wilber: prazo da intimação
    {
      'Data':              '11/07/2026',
      'Hora':              '—',
      'Tipo':              'Prazo Processual',
      'Nº Processo / Ref.': '5002092-77.2026.4.02.5102 — Wilber × União/Fazenda Nacional',
      'Cliente':           'Wilber Moreira Fonseca',
      'Tribunal / Local':  '5ª VF — Niterói (JEF Tributária) / TRF2',
      'Descrição':         'PRAZO FATAL — Intimação eletrônica expedida (Evento 11, 20/06/2026). Verificar conteúdo da intimação no EPROC/JFRJ e providenciar manifestação/resposta',
      'Responsável':       'Luiz Fernando',
      'Status':            'Pendente',
      'Prioridade':        '🔴 Alta',
      'Observações':       'Intimação eletrônica certificada em 20/06/2026 — prazo de 15 dias úteis — acesse EPROC/JFRJ para ver o conteúdo integral'
    },
    // Item 2 — Bruna/Luisa: novo processo, acompanhar despacho
    {
      'Data':              '30/06/2026',
      'Hora':              '—',
      'Tipo':              'Acompanhamento',
      'Nº Processo / Ref.': '3110375-04.2026.8.19.0001 — Bruna e Luisa × Estado do Rio de Janeiro',
      'Cliente':           'Bruna Martins Ribeiro Ferreira / Luisa Ribeiro Ferreira',
      'Tribunal / Local':  '17ª Vara da Fazenda Pública da Comarca da Capital — TJRJ',
      'Descrição':         'Processo novo distribuído em 17/06/2026. Verificar despacho inicial e eventuais intimações no eproc.tjrj. Publicação DJE em 22/06/2026 — Magistrado: Manoel Tavares Cavalcanti',
      'Responsável':       'Kariny Barbosa / Luiz Fernando',
      'Status':            'Pendente',
      'Prioridade':        '🟡 Média',
      'Observações':       'Procedimento Comum Cível · Polo Ativo: Bruna e Luisa Ribeiro Ferreira · Polo Passivo: Estado RJ · Chave EPROC: 397388264626'
    }
  ];

  // Verifica quais itens já existem (evita duplicação)
  const processosExistentes = dados.slice(cabRow + 1).map(r => String(r[0]).trim() + String(r[3]).trim());

  let inseridos = 0;
  for (const item of itens) {
    const chave = (item['Data'] || '') + (item['Nº Processo / Ref.'] || '');
    if (processosExistentes.includes(chave)) {
      Logger.log('Item de agenda já existe, pulando: ' + item['Data']);
      continue;
    }

    const novaLinha = headers.map(h => item[h] || '');
    aba.appendRow(novaLinha);
    inseridos++;
    Logger.log('Agenda: item inserido — ' + item['Data'] + ' | ' + item['Nº Processo / Ref.']);
  }

  Logger.log(inseridos + ' item(ns) inserido(s) na Agenda');
}
