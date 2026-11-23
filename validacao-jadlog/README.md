# Validação JADLOG

Valida a base de cadastro de itens (SKUs comerciais) contra as restrições da JADLOG e gera a lista de SKUs que a JADLOG **não** atende.

## Regras
1. Peso bruto do SKU (coluna J) até 24 kg.
2. Nenhum lado de nenhum volume (colunas X, Y, Z) pode ser igual ou maior que 1.700 mm.
3. Soma A + L + P de cada volume não pode passar de 2.400 mm.
4. Descrição (coluna D) com PIA, COLCHÃO, CADEIRA(S), COOKTOP, CUBA, FORNO ELÉTRICO ou SOFÁ = não apto.
5. Peso ou dimensão zerada no cadastro = não apto (opcional na página).

Cada linha da planilha é um volume; linhas com o mesmo código modelo (coluna C) formam um SKU. Se qualquer volume falhar, o SKU todo fica não apto.

## Arquivos
- `validador-jadlog.html`: página de upload e validação (roda no navegador, usa SheetJS).
- `gerar_lista.py`: mesma lógica em Python. Uso: `python3 gerar_lista.py base.xlsx base.json saida.xlsx`

Os dados da planilha não ficam versionados aqui.
