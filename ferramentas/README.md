# Conversão de autos em PDF para Markdown

`pdf_para_markdown.py` converte processos judiciais em PDF — inclusive os
digitalizados, sem camada de texto — em arquivos `.md` de transcrição
integral, página a página.

A ferramenta foi escrita para execução **local**, na máquina do escritório.
Autos judiciais frequentemente contêm dados pessoais e sigilosos, de modo que
a conversão local evita o trânsito desnecessário do arquivo por serviços de
terceiros. Também é a opção tecnicamente mais adequada: arquivos da ordem de
centenas de megabytes e milhares de páginas exigem processamento demorado, que
convém manter sob controle direto e retomável.

## 1. Como funciona

Para cada página, o programa procede nesta ordem:

1. **Camada de texto do PDF** — quando o documento é nativo ou já passou por
   OCR no sistema do tribunal. É instantâneo e fiel ao original.
2. **OCR (Tesseract)** — quando a página é mera imagem digitalizada. A página é
   renderizada a 300 dpi e submetida ao reconhecimento óptico em português.

O resultado de cada página é gravado em cache. Uma execução interrompida —
por desligamento, falta de energia ou encerramento voluntário — é retomada
exatamente de onde parou com a opção `--retomar`, sem refazer o já convertido.

## 2. Instalação dos pré-requisitos

### 2.1. Python e a biblioteca de leitura de PDF

Instale o Python 3.9 ou superior (<https://www.python.org/downloads/>,
marcando a opção *Add Python to PATH* no Windows) e, em seguida, execute no
terminal:

```
pip install pymupdf
```

### 2.2. Tesseract OCR (necessário apenas para páginas digitalizadas)

| Sistema | Comando / procedimento |
|---------|------------------------|
| **Windows** | Instalador em <https://github.com/UB-Mannheim/tesseract/wiki>. Durante a instalação, em *Additional language data*, marque **Portuguese**. Ao final, confirme que a pasta do Tesseract consta do `PATH`. |
| **macOS** | `brew install tesseract tesseract-lang` |
| **Linux (Debian/Ubuntu)** | `sudo apt install tesseract-ocr tesseract-ocr-por` |

Verifique a instalação com `tesseract --list-langs`; a lista deve conter `por`.

Sem o Tesseract o programa **não falha**: converte tudo o que possui camada de
texto e sinaliza na saída as páginas digitalizadas pendentes. Instalado o
motor posteriormente, basta reexecutar com `--retomar` para completá-las.

## 3. Uso

### 3.1. Diagnóstico prévio (recomendado)

Antes de converter um arquivo volumoso, verifique o que se tem em mãos:

```
python3 pdf_para_markdown.py "0039805-33.2007.4.01.3400-processo.pdf" --diagnostico
```

O relatório informa o número de páginas, a proporção que já possui texto
pesquisável, quantas exigirão OCR, se o Tesseract e o idioma português estão
disponíveis e uma estimativa de tempo. É por ele que se decide o método.

### 3.2. Conversão integral

```
python3 pdf_para_markdown.py "0039805-33.2007.4.01.3400-processo.pdf" \
    --retomar --por-arquivo 500
```

- `--retomar` — permite interromper e continuar depois, essencial em autos
  extensos;
- `--por-arquivo 500` — divide a saída em arquivos de 500 páginas
  (`..._parte001.md`, `..._parte002.md` …), evitando um único `.md` grande
  demais para editores e ferramentas de busca.

### 3.3. Conversão seletiva

Para trabalhar apenas com determinadas peças, uma vez conhecidos os
respectivos intervalos:

```
python3 pdf_para_markdown.py processo.pdf --paginas 1-48,300-337 --saida inicial_e_sentenca.md
```

### 3.4. Opções relevantes

| Opção | Finalidade |
|-------|-----------|
| `--ocr auto\|sempre\|nunca` | `auto` (padrão) só aplica OCR onde falta texto; `sempre` reprocessa tudo por OCR (útil quando a camada de texto do tribunal é de má qualidade); `nunca` desativa o OCR. |
| `--processos N` | Páginas processadas em paralelo no OCR. O padrão é o número de núcleos menos um. |
| `--dpi 400` | Aumenta a resolução do OCR em digitalizações ruins, ao custo de tempo. |
| `--preservar-quebras` | Mantém cada quebra de linha do original como quebra forçada de Markdown — indicado para quadros, formulários, cálculos e listagens de movimentação. |
| `--sem-marcacao-de-pagina` | Suprime os títulos `## Página N`, gerando texto corrido. |
| `--senha` | Informa a senha de PDFs protegidos. |
| `--limpar-cache` | Descarta o cache ao final da conversão bem-sucedida. |

## 4. Formato da saída

Cada arquivo `.md` abre com um cabeçalho de identificação (arquivo de origem,
intervalo de páginas, data da conversão e método empregado) e prossegue com
uma seção por página:

```markdown
## Página 137

<!-- fonte: OCR -->

Vistos etc. Trata-se de ação ordinária ajuizada por ...

---
```

O comentário `<!-- fonte: ... -->` registra a procedência de cada trecho —
camada de texto ou OCR —, o que permite aferir a confiabilidade da
transcrição. O texto proveniente de OCR está sujeito a erros de
reconhecimento, sobretudo em documentos manuscritos, carimbos, assinaturas e
digitalizações de baixa qualidade. **Para fins processuais prevalece sempre o
inteiro teor do documento original**; a transcrição serve à pesquisa, à
análise e à elaboração de peças.

## 5. Desempenho esperado

Páginas com camada de texto são convertidas às centenas por segundo. O OCR
consome cerca de 1 a 3 segundos por página, por núcleo de processamento —
autos de 5.000 páginas integralmente digitalizados demandam, portanto, algo
entre uma e três horas em um computador comum. Daí a importância de `--retomar`
e da divisão da saída em partes.
