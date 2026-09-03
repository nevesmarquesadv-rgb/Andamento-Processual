#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Converte autos processuais em PDF para Markdown (.md).

Projetado para arquivos volumosos (centenas de MB, milhares de paginas),
tipicamente digitalizados. Para cada pagina o script usa, nesta ordem:

  1. a camada de texto do PDF, quando existir (rapido e fiel);
  2. OCR via Tesseract sobre a imagem renderizada, quando a pagina nao
     tiver texto pesquisavel.

O progresso e gravado em cache por pagina, de modo que uma execucao
interrompida pode ser retomada de onde parou (--retomar).

Dependencias:
  pip install pymupdf
  Tesseract OCR + idioma portugues (apenas para paginas digitalizadas)

Uso tipico:
  python3 pdf_para_markdown.py processo.pdf --diagnostico
  python3 pdf_para_markdown.py processo.pdf --retomar --por-arquivo 500
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

try:  # PyMuPDF >= 1.24 expoe o modulo como "pymupdf"; antes, como "fitz".
    import pymupdf as fitz
except ImportError:  # pragma: no cover - compatibilidade / orientacao
    try:
        import fitz
    except ImportError:
        sys.exit(
            "Dependencia ausente: PyMuPDF.\n"
            "Instale com:  pip install pymupdf"
        )

FONTE_TEXTO = "camada de texto"
FONTE_OCR = "OCR"
FONTE_VAZIA = "pagina sem texto reconhecivel"
FONTE_SEM_OCR = "pagina digitalizada (OCR indisponivel)"


# --------------------------------------------------------------------------
# Utilitarios
# --------------------------------------------------------------------------

def log(mensagem: str) -> None:
    """Escreve no stderr, preservando o stdout para dados."""
    print(mensagem, file=sys.stderr, flush=True)


def formatar_duracao(segundos: float) -> str:
    segundos = int(segundos)
    horas, resto = divmod(segundos, 3600)
    minutos, seg = divmod(resto, 60)
    if horas:
        return f"{horas}h{minutos:02d}min"
    if minutos:
        return f"{minutos}min{seg:02d}s"
    return f"{seg}s"


def interpretar_intervalo(expressao: str, total: int) -> list[int]:
    """Converte "1-50,80,120-130" em lista de indices de pagina (base 1)."""
    paginas: list[int] = []
    for parte in expressao.split(","):
        parte = parte.strip()
        if not parte:
            continue
        if "-" in parte:
            inicio_txt, _, fim_txt = parte.partition("-")
            inicio = int(inicio_txt or 1)
            fim = int(fim_txt or total)
        else:
            inicio = fim = int(parte)
        if inicio > fim:
            inicio, fim = fim, inicio
        for n in range(max(1, inicio), min(total, fim) + 1):
            if n not in paginas:
                paginas.append(n)
    if not paginas:
        raise ValueError(f"Intervalo de paginas invalido: {expressao!r}")
    return sorted(paginas)


def limpar_texto(bruto: str, preservar_quebras: bool = False) -> str:
    """Normaliza o texto extraido preservando a fidelidade do conteudo.

    Por padrao as linhas seguem como no original; o Markdown as reune em
    paragrafos na renderizacao. Com ``preservar_quebras`` cada quebra vira
    uma quebra forcada de Markdown, o que importa em quadros, formularios,
    tabelas de calculo e listagens de movimentacao processual.
    """
    texto = bruto.replace("\r\n", "\n").replace("\r", "\n")
    texto = texto.replace("\xad", "")            # hifen condicional
    texto = texto.replace("\xa0", " ")           # espaco inquebravel
    texto = re.sub(r"[ \t]+\n", "\n", texto)     # espacos ao fim da linha
    # Reune palavra partida por hifen no fim da linha (quebra tipografica):
    # so quando a linha seguinte comeca por minuscula, para nao desfazer
    # hifens legitimos ("Vice-\nPresidente") nem numeracoes.
    texto = re.sub(r"(\w)-\n(?=[a-z\u00e0-\u00ff])", r"\1", texto)
    texto = re.sub(r"\n{3,}", "\n\n", texto)     # excesso de linhas em branco
    texto = texto.strip()
    if preservar_quebras:
        # Duplo espaco ao fim da linha = quebra forcada em Markdown.
        texto = re.sub(r"(?<=\S)\n(?=\S)", "  \n", texto)
    return texto


# --------------------------------------------------------------------------
# OCR
# --------------------------------------------------------------------------

def tesseract_disponivel() -> str | None:
    return shutil.which("tesseract")


def idiomas_tesseract() -> set[str]:
    binario = tesseract_disponivel()
    if not binario:
        return set()
    try:
        saida = subprocess.run(
            [binario, "--list-langs"],
            capture_output=True, text=True, timeout=60,
        )
    except (OSError, subprocess.SubprocessError):
        return set()
    linhas = (saida.stdout or "").splitlines()[1:]
    return {linha.strip() for linha in linhas if linha.strip()}


def ocr_em_imagem(png: bytes, idioma: str, psm: int, tempo_limite: int) -> str:
    """Executa o Tesseract sobre bytes PNG e devolve o texto reconhecido."""
    binario = tesseract_disponivel()
    if not binario:
        raise RuntimeError(
            "Tesseract nao encontrado no PATH. Instale-o (com o idioma "
            "portugues) ou use --ocr nunca."
        )
    resultado = subprocess.run(
        [binario, "stdin", "stdout", "-l", idioma, "--psm", str(psm)],
        input=png, capture_output=True, timeout=tempo_limite,
    )
    if resultado.returncode != 0:
        erro = resultado.stderr.decode("utf-8", "replace").strip()
        raise RuntimeError(f"Falha no OCR (codigo {resultado.returncode}): {erro}")
    return resultado.stdout.decode("utf-8", "replace")


# --------------------------------------------------------------------------
# Extracao
# --------------------------------------------------------------------------

class Conversor:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.documento = self._abrir()
        self.total = self.documento.page_count
        self.cache = Path(args.cache) if args.cache else Path(
            f"{args.saida}.cache"
        )
        self.estatisticas = {
            FONTE_TEXTO: 0, FONTE_OCR: 0, FONTE_VAZIA: 0, FONTE_SEM_OCR: 0,
        }
        # Se o OCR foi pedido mas o Tesseract nao esta disponivel, opera-se
        # em modo degradado: as paginas digitalizadas sao sinalizadas na
        # saida, sem renderizacao inutil nem interrupcao do lote.
        self.ocr_indisponivel = (
            args.ocr != "nunca" and tesseract_disponivel() is None
        )
        self.modo_ocr = "nunca" if self.ocr_indisponivel else args.ocr
        self.falhas_ocr = 0

    # -- ciclo de vida ----------------------------------------------------
    def _abrir(self) -> "fitz.Document":
        caminho = self.args.entrada
        try:
            documento = fitz.open(caminho)
        except Exception as erro:  # noqa: BLE001 - mensagem ao usuario
            sys.exit(f"Nao foi possivel abrir o PDF: {erro}")
        if documento.needs_pass:
            senha = self.args.senha or ""
            if not documento.authenticate(senha):
                sys.exit(
                    "PDF protegido por senha. Informe-a com --senha."
                )
        return documento

    def fechar(self) -> None:
        self.documento.close()

    # -- diagnostico ------------------------------------------------------
    def diagnosticar(self, amostra: int) -> None:
        total = self.total
        passo = max(1, total // amostra) if amostra and total > amostra else 1
        indices = list(range(0, total, passo))
        com_texto = 0
        caracteres = 0
        for indice in indices:
            texto = self.documento.load_page(indice).get_text("text").strip()
            if len(texto) >= self.args.limiar_texto:
                com_texto += 1
                caracteres += len(texto)
        analisadas = len(indices)
        proporcao = com_texto / analisadas if analisadas else 0.0
        estimativa_ocr = round(total * (1 - proporcao))
        tamanho_mb = Path(self.args.entrada).stat().st_size / (1024 * 1024)

        log("")
        log("=== Diagnostico do PDF ===")
        log(f"Arquivo ................. {Path(self.args.entrada).name}")
        log(f"Tamanho ................. {tamanho_mb:,.1f} MB")
        log(f"Paginas ................. {total:,}")
        log(f"Paginas analisadas ...... {analisadas:,} (amostragem)")
        log(f"Com camada de texto ..... {proporcao:6.1%}")
        if com_texto:
            log(f"Media de caracteres ..... {caracteres // com_texto:,} por pagina")
        log(f"Paginas que exigirao OCR  ~{estimativa_ocr:,}")
        binario = tesseract_disponivel()
        if binario:
            idiomas = idiomas_tesseract()
            marca = "OK" if self.args.idioma in idiomas else "AUSENTE"
            log(f"Tesseract ............... {binario}")
            log(f"Idioma {self.args.idioma!r} ............ {marca}")
        else:
            log("Tesseract ............... NAO INSTALADO")
        if estimativa_ocr:
            segundos = estimativa_ocr * 2.0 / max(1, self.args.processos)
            log(
                f"Tempo estimado de OCR ... ~{formatar_duracao(segundos)} "
                f"com {self.args.processos} processo(s) paralelo(s)"
            )
        log("")

    # -- extracao por pagina ---------------------------------------------
    def _arquivo_cache(self, numero: int) -> Path:
        return self.cache / f"pagina_{numero:06d}.txt"

    def _texto_da_camada(self, indice: int) -> str:
        return self.documento.load_page(indice).get_text("text")

    def _renderizar(self, indice: int) -> bytes:
        pagina = self.documento.load_page(indice)
        pixmap = pagina.get_pixmap(dpi=self.args.dpi, colorspace=fitz.csGRAY)
        return pixmap.tobytes("png")

    # -- orquestracao -----------------------------------------------------
    def processar(self, paginas: list[int]) -> dict[int, tuple[str, str]]:
        self.cache.mkdir(parents=True, exist_ok=True)
        resultados: dict[int, tuple[str, str]] = {}
        pendentes: list[int] = []

        for numero in paginas:
            arquivo = self._arquivo_cache(numero)
            if self.args.retomar and arquivo.exists():
                conteudo = arquivo.read_text(encoding="utf-8")
                fonte, _, texto = conteudo.partition("\n")
                if fonte not in self.estatisticas:
                    fonte = FONTE_TEXTO
                if fonte == FONTE_SEM_OCR and self.modo_ocr != "nunca":
                    # Pagina que ficou sem OCR em execucao anterior: agora ha
                    # motor disponivel, entao ela volta para a fila.
                    pendentes.append(numero)
                    continue
                resultados[numero] = (texto, fonte)
                self.estatisticas[fonte] += 1
            else:
                pendentes.append(numero)

        if resultados:
            log(f"Retomando: {len(resultados):,} pagina(s) ja em cache.")

        inicio = time.time()
        concluidas = 0
        lote = max(1, self.args.processos)

        for posicao in range(0, len(pendentes), lote):
            bloco = pendentes[posicao:posicao + lote]
            # A leitura da camada de texto e a renderizacao ficam na thread
            # principal (o documento PyMuPDF nao e seguro para acesso
            # concorrente); apenas o OCR, que domina o custo, e paralelizado.
            preparadas: list[tuple[int, str, object]] = []
            for numero in bloco:
                indice = numero - 1
                if self.modo_ocr == "sempre":
                    preparadas.append((numero, "ocr", self._renderizar(indice)))
                    continue
                texto = self._texto_da_camada(indice)
                if len(texto.strip()) >= self.args.limiar_texto:
                    preparadas.append((numero, "texto", texto))
                elif self.modo_ocr == "auto":
                    preparadas.append((numero, "ocr", self._renderizar(indice)))
                elif self.ocr_indisponivel and not texto.strip():
                    preparadas.append((numero, "sem_ocr", None))
                else:
                    preparadas.append((numero, "texto", texto))

            with ThreadPoolExecutor(max_workers=lote) as executor:
                for numero, texto, fonte in executor.map(
                    self._resolver, preparadas
                ):
                    resultados[numero] = (texto, fonte)
                    self.estatisticas[fonte] += 1
                    self._arquivo_cache(numero).write_text(
                        f"{fonte}\n{texto}", encoding="utf-8"
                    )

            concluidas += len(bloco)
            if concluidas % max(1, self.args.intervalo_log) < lote:
                decorrido = time.time() - inicio
                ritmo = concluidas / decorrido if decorrido else 0
                restantes = len(pendentes) - concluidas
                previsao = restantes / ritmo if ritmo else 0
                log(
                    f"  {concluidas:,}/{len(pendentes):,} paginas "
                    f"({ritmo:.1f} pag/s) — restam ~{formatar_duracao(previsao)}"
                )

        return resultados

    def _resolver(
        self, item: tuple[int, str, object]
    ) -> tuple[int, str, str]:
        """Resolve uma pagina ja preparada. Nunca propaga excecao: uma falha
        isolada nao pode inutilizar um lote de milhares de paginas."""
        numero, acao, carga = item
        if acao == "sem_ocr":
            return numero, "", FONTE_SEM_OCR
        if acao == "texto":
            limpo = limpar_texto(str(carga or ""), self.args.preservar_quebras)
            return numero, limpo, (FONTE_TEXTO if limpo else FONTE_VAZIA)
        try:
            reconhecido = ocr_em_imagem(
                bytes(carga or b""), self.args.idioma, self.args.psm,
                self.args.tempo_limite_ocr,
            )
        except subprocess.TimeoutExpired:
            log(f"  ! pagina {numero}: OCR excedeu o tempo limite")
            return numero, "", FONTE_SEM_OCR
        except Exception as erro:  # noqa: BLE001 - degradacao controlada
            self.falhas_ocr += 1
            if self.falhas_ocr <= 5:
                log(f"  ! pagina {numero}: falha no OCR — {erro}")
            elif self.falhas_ocr == 6:
                log("  ! demais falhas de OCR omitidas deste relato.")
            return numero, "", FONTE_SEM_OCR
        limpo = limpar_texto(reconhecido, self.args.preservar_quebras)
        return numero, limpo, (FONTE_OCR if limpo else FONTE_VAZIA)

    # -- escrita ----------------------------------------------------------
    def cabecalho(self, paginas: list[int], parte: int, partes: int) -> str:
        metadados = self.documento.metadata or {}
        titulo = (metadados.get("title") or "").strip()
        nome = Path(self.args.entrada).stem
        linhas = [f"# {titulo or nome}", ""]
        if partes > 1:
            linhas.append(f"**Parte {parte} de {partes}**  ")
        linhas.extend([
            f"**Arquivo de origem:** `{Path(self.args.entrada).name}`  ",
            f"**Paginas neste arquivo:** {paginas[0]}–{paginas[-1]} "
            f"(de {self.total:,} no total)  ",
            f"**Convertido em:** {datetime.now():%d/%m/%Y %H:%M}  ",
            "**Metodo:** camada de texto do PDF, com OCR (Tesseract) "
            "nas paginas digitalizadas  ",
            "",
            "> Transcricao automatica. Em caso de divergencia, prevalece o "
            "inteiro teor do documento original.",
            "",
            "---",
            "",
            "",
        ])
        return "\n".join(linhas)

    def escrever(
        self, resultados: dict[int, tuple[str, str]], paginas: list[int]
    ) -> list[Path]:
        por_arquivo = self.args.por_arquivo or len(paginas)
        blocos = [
            paginas[i:i + por_arquivo]
            for i in range(0, len(paginas), por_arquivo)
        ]
        base = Path(self.args.saida)
        gerados: list[Path] = []

        for ordem, bloco in enumerate(blocos, start=1):
            destino = base if len(blocos) == 1 else base.with_name(
                f"{base.stem}_parte{ordem:03d}{base.suffix}"
            )
            destino.parent.mkdir(parents=True, exist_ok=True)
            with destino.open("w", encoding="utf-8") as saida:
                saida.write(self.cabecalho(bloco, ordem, len(blocos)))
                for numero in bloco:
                    texto, fonte = resultados.get(numero, ("", FONTE_VAZIA))
                    if self.args.marcar_paginas:
                        saida.write(f"## Pagina {numero}\n\n")
                        saida.write(f"<!-- fonte: {fonte} -->\n\n")
                    if texto:
                        saida.write(texto)
                        saida.write("\n\n")
                    else:
                        saida.write(f"*[{fonte}]*\n\n")
                    if self.args.marcar_paginas:
                        saida.write("---\n\n")
            gerados.append(destino)
        return gerados


# --------------------------------------------------------------------------
# Interface de linha de comando
# --------------------------------------------------------------------------

def analisar_argumentos(argv: list[str] | None = None) -> argparse.Namespace:
    analisador = argparse.ArgumentParser(
        description="Converte autos processuais em PDF para Markdown.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Exemplos:\n"
            "  %(prog)s processo.pdf --diagnostico\n"
            "  %(prog)s processo.pdf --retomar --por-arquivo 500\n"
            "  %(prog)s processo.pdf --paginas 1-120 --saida inicial.md\n"
        ),
    )
    analisador.add_argument("entrada", help="caminho do arquivo PDF")
    analisador.add_argument(
        "-s", "--saida",
        help="arquivo .md de destino (padrao: mesmo nome do PDF)",
    )
    analisador.add_argument(
        "--paginas",
        help='intervalo a converter, ex.: "1-50,80,120-130" (padrao: todas)',
    )
    analisador.add_argument(
        "--ocr", choices=["auto", "sempre", "nunca"], default="auto",
        help=(
            "auto: OCR apenas nas paginas sem texto (padrao); "
            "sempre: OCR em todas; nunca: so a camada de texto"
        ),
    )
    analisador.add_argument(
        "--idioma", default="por", help="idioma do Tesseract (padrao: por)"
    )
    analisador.add_argument(
        "--dpi", type=int, default=300,
        help="resolucao de renderizacao para OCR (padrao: 300)",
    )
    analisador.add_argument(
        "--psm", type=int, default=3,
        help="modo de segmentacao de pagina do Tesseract (padrao: 3)",
    )
    analisador.add_argument(
        "--processos", type=int, default=max(1, (os.cpu_count() or 2) - 1),
        help="paginas processadas em paralelo no OCR (padrao: nucleos - 1)",
    )
    analisador.add_argument(
        "--por-arquivo", type=int, default=0, metavar="N",
        help="divide a saida em arquivos de N paginas (padrao: arquivo unico)",
    )
    analisador.add_argument(
        "--limiar-texto", type=int, default=20, metavar="N",
        help="minimo de caracteres para considerar que a pagina tem texto "
             "(padrao: 20)",
    )
    analisador.add_argument(
        "--retomar", action="store_true",
        help="aproveita o cache de execucoes anteriores e prossegue de onde parou",
    )
    analisador.add_argument(
        "--cache", help="diretorio de cache (padrao: <saida>.cache)"
    )
    analisador.add_argument(
        "--limpar-cache", action="store_true",
        help="remove o diretorio de cache ao final da conversao",
    )
    analisador.add_argument(
        "--sem-marcacao-de-pagina", dest="marcar_paginas",
        action="store_false",
        help="nao insere os titulos '## Pagina N' entre as paginas",
    )
    analisador.add_argument(
        "--preservar-quebras", action="store_true",
        help="converte cada quebra de linha do PDF em quebra forcada de "
             "Markdown (util em quadros, formularios e listagens)",
    )
    analisador.add_argument(
        "--senha", help="senha do PDF, se protegido"
    )
    analisador.add_argument(
        "--tempo-limite-ocr", type=int, default=300, metavar="SEG",
        help="tempo maximo de OCR por pagina, em segundos (padrao: 300)",
    )
    analisador.add_argument(
        "--intervalo-log", type=int, default=25, metavar="N",
        help="frequencia do relato de progresso, em paginas (padrao: 25)",
    )
    analisador.add_argument(
        "--diagnostico", action="store_true",
        help="apenas analisa o PDF e estima o esforco, sem converter",
    )
    analisador.add_argument(
        "--amostra", type=int, default=40, metavar="N",
        help="paginas amostradas no diagnostico (padrao: 40)",
    )

    args = analisador.parse_args(argv)
    if not Path(args.entrada).is_file():
        analisador.error(f"arquivo nao encontrado: {args.entrada}")
    if not args.saida:
        args.saida = str(Path(args.entrada).with_suffix(".md"))
    return args


def main(argv: list[str] | None = None) -> int:
    args = analisar_argumentos(argv)
    conversor = Conversor(args)

    try:
        if args.diagnostico:
            conversor.diagnosticar(args.amostra)
            return 0

        paginas = (
            interpretar_intervalo(args.paginas, conversor.total)
            if args.paginas else list(range(1, conversor.total + 1))
        )

        if conversor.ocr_indisponivel:
            log(
                "Aviso: Tesseract nao encontrado no PATH. A conversao prossegue "
                "em modo degradado: as paginas digitalizadas serao sinalizadas "
                "na saida, sem transcricao. Instale o Tesseract e reexecute com "
                "--retomar para completa-las (o que ja foi convertido sera "
                "aproveitado)."
            )
        elif args.ocr != "nunca":
            idiomas = idiomas_tesseract()
            if idiomas and args.idioma not in idiomas:
                sys.exit(
                    f"O idioma {args.idioma!r} nao esta instalado no Tesseract.\n"
                    f"Disponiveis: {', '.join(sorted(idiomas)) or '(nenhum)'}\n"
                    "Instale o pacote de idioma (ex.: tesseract-ocr-por) ou "
                    "informe outro com --idioma."
                )

        log(
            f"Convertendo {len(paginas):,} de {conversor.total:,} pagina(s) — "
            f"OCR: {args.ocr}, {args.processos} em paralelo."
        )
        inicio = time.time()
        resultados = conversor.processar(paginas)
        gerados = conversor.escrever(resultados, paginas)

        log("")
        log("=== Conversao concluida ===")
        for arquivo in gerados:
            tamanho = arquivo.stat().st_size / 1024
            log(f"  {arquivo}  ({tamanho:,.0f} KB)")
        log(
            f"Paginas por camada de texto: "
            f"{conversor.estatisticas[FONTE_TEXTO]:,}"
        )
        log(f"Paginas por OCR ...........: {conversor.estatisticas[FONTE_OCR]:,}")
        log(f"Paginas sem texto .........: {conversor.estatisticas[FONTE_VAZIA]:,}")
        sem_ocr = conversor.estatisticas[FONTE_SEM_OCR]
        if sem_ocr:
            log(f"Paginas digitalizadas sem OCR: {sem_ocr:,}  <-- exigem "
                "Tesseract instalado; reexecute com --retomar apos instala-lo")
        log(f"Tempo total ...............: {formatar_duracao(time.time() - inicio)}")

        if args.limpar_cache and conversor.cache.exists():
            shutil.rmtree(conversor.cache, ignore_errors=True)
            log(f"Cache removido: {conversor.cache}")
        elif conversor.cache.exists():
            log(f"Cache preservado em {conversor.cache} (use --limpar-cache "
                "para descarta-lo).")
        return 0
    except KeyboardInterrupt:
        log("\nInterrompido pelo usuario. Use --retomar para continuar.")
        return 130
    finally:
        conversor.fechar()


if __name__ == "__main__":
    raise SystemExit(main())
