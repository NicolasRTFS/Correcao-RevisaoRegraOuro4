# Correção, revisão e carga da amostra

Aplicação local para corrigir e revisar extrações de máquinas e veículos em
arquivos TSV. O programa preserva o arquivo original, salva uma versão
corrigida separadamente e oferece sugestões obtidas pela decodificação do
Chassi/VIN/PIN.

## Requisitos

- Python 3.10 ou mais recente;
- navegador moderno;
- PostgreSQL e Docker são opcionais e necessários somente para a etapa de
  carga e consulta da população.

## Instalação rápida

Crie um ambiente virtual e instale as dependências:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

No Windows, a ativação e a instalação podem ser feitas com:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Para iniciar a interface:

```bash
.venv/bin/python revisor_corretor.py
```

No Windows:

```powershell
python revisor_corretor.py
```

O navegador será aberto automaticamente em `http://127.0.0.1:8765`.
Para executar sem abrir uma nova janela automaticamente, use
`python3 revisor_corretor.py --nao-abrir`.

## Interface de correção e revisão

Para abrir o programa, execute:

```bash
python3 revisor_corretor.py
```

O navegador exibirá primeiro uma escolha entre **Correção** e **Revisão**.
O botão de lua no canto superior direito ativa o modo noturno; a preferência
fica salva no navegador. No tema escuro, o botão muda para um sol para retornar
ao modo claro.

- Em **Correção**, a descrição é somente para leitura e seleção; os campos
  extraídos continuam editáveis. Clique em uma caixa colorida e selecione o trecho correspondente na descrição para
  preencher o campo e aplicar a mesma cor ao texto. O botão **Restaurar campo**
  devolve somente o campo selecionado ao valor do arquivo original, inclusive
  quando esse valor for `-` e não estiver presente na descrição.
  **Categoria** também possui uma lista com as oito classificações permitidas e
  `-`. A Categoria nunca é preenchida por seleção na descrição: clicar nela ou
  pressionar `1` abre o dropdown. As letras digitadas em seguida filtram os
  nomes disponíveis, e esse filtro é limpo ao trocar de registro. Pressionar
  novamente qualquer atalho de `1` a `8` desmarca o respectivo campo. Pressionar
  `9` (na fileira superior ou no teclado numérico) ativa a pesquisa:
  o próximo trecho selecionado na descrição é pesquisado na internet, sem
  alterar nenhum campo. Pressionar `9` novamente antes da seleção cancela o
  recurso. Ao clicar no texto de qualquer
  outro campo, ele é selecionado e pode ser apagado com `Backspace` ou `Delete`.
  Quando a Categoria estiver preenchida, suas ocorrências na descrição são
  destacadas automaticamente em roxo, sem permitir que o usuário associe a
  Categoria a uma seleção livre. A comparação ignora maiúsculas, acentos e
  espaços, reconhecendo também palavras juntas ou separadas.
  Para **Motoniveladoras e Patrols**, tanto `Motoniveladora(s)` quanto
  `Patrol(s)` são reconhecidas separadamente, em qualquer combinação de letras
  maiúsculas e minúsculas.
  Para **Pa Carregadeira**, `Carregadeira(s)` e `Carregador(es)` também são
  reconhecidos sem exigir que `Pa` apareça na descrição. Em
  `Minicarregadeira`, o trecho `Carregadeira` é destacado; quando aparecer
  `Pa Carregadeira`, `Pá Carregadeira` ou `PaCarregadeira`, a expressão inteira
  é destacada. `Pa` e `PA` isolados também são reconhecidos.
  Ao manter o mouse sobre qualquer trecho destacado na descrição, um popup
  mostra o nome e o conteúdo atual do campo de extração correspondente.
  Em **Estado de uso**, as formas `Novo`, `Nova`, `Novos` e `Novas` são
  equivalentes para o destaque; o mesmo vale para `Usado`, `Usada`, `Usados` e
  `Usadas`. A comparação não diferencia letras maiúsculas de minúsculas e não
  altera o conteúdo armazenado no campo.
  O campo **Chassi** é validado com o comprimento esperado de 17 caracteres;
  quando estiver preenchido com outro comprimento, seu fundo fica vermelho.
  Se o Chassi tiver 17 caracteres e o campo **Ano** estiver vazio, o décimo
  caractere do VIN gera uma sugestão ao lado de Ano. Como os códigos se repetem
  a cada 30 anos, a data de emissão é usada para escolher o ano plausível mais
  recente. Enquanto estiver pendente, o décimo caractere pulsa na cor de Ano e
  o cartão de Ano pulsa em amarelo. Um duplo clique no campo aceita a sugestão;
  clicar uma vez e pressionar `X` mantém a sugestão disponível, sem aceitar o
  valor automaticamente. Depois que a sugestão é aceita, o décimo caractere
  permanece marcado na cor de Ano, mas deixa de pulsar.
  O mesmo Chassi também pode sugerir **Marca**, **código de Modelo**,
  **Categoria** e **Número de série** quando a regra do prefixo permite uma
  inferência segura. As sugestões aparecem ao lado dos campos vazios e podem
  ser aceitas pelo botão ou por duplo clique. Para Caterpillar, o número de
  série usa as posições 10 a 17; nos demais prefixos mapeados, normalmente são
  usados os seis últimos caracteres. Prefixos genéricos não sugerem Marca, e
  Motor nunca é preenchido automaticamente quando depende de consulta à
  fábrica. Nos prefixos com ano parcial, a indicação é apresentada como
  estimativa para conferência; nos casos em que a tabela manda consultar a
  fábrica, não é sugerido um ano.
  A caixa **Modo checagem** compara os valores atuais com todas as sugestões
  disponíveis, inclusive quando o campo está preenchido. Campos divergentes ou
  vazios ficam com fundo e contorno laranja pulsantes. Nesse modo, a sugestão
  também aparece ao lado de um valor preenchido divergente, mas só substitui o
  conteúdo se o usuário a aceitar.
- Em **Revisão**, as mesmas ferramentas de edição trabalham exclusivamente
  sobre o arquivo produzido na correção. Se esse arquivo ainda não existir, o
  programa informa isso na tela e não usa o conjunto original como substituto.
- **Despender atenção** marca o registro para a revisão e deixa os painéis de
  texto e entidades em amarelo-claro. Um segundo clique remove o marcador. Ele
  não remove nem filtra registros: todos os dados seguem para a revisão.
- O botão discreto **Comentários** permite adicionar várias observações e
  removê-las individualmente. Na Revisão, elas ficam reunidas em uma única
  notificação aberta pelo triângulo `!`, que permanece visível sempre que houver
  comentários. O triângulo aparece tanto na Correção quanto na Revisão e abre a
  notificação ao passar o mouse; nesse caso ela fecha ao retirar o cursor. Um
  clique no triângulo fixa a caixa aberta. Em ambos os casos, clicar fora fecha
  a notificação. Novos comentários também podem ser adicionados na Revisão e
  cada item é identificado como comentário do **Corretor** ou do **Revisor**.
- O botão **☷**, sempre visível ao lado de **Despender atenção**, permite
  registrar os critérios gerais utilizados no trabalho. A lista é compartilhada
  por todos os registros e pelos modos Correção e Revisão, sem ser reiniciada
  durante a navegação. Os itens aparecem numerados, identificados como sendo do
  corretor ou do revisor, e podem ser removidos.
- Para navegar pelo teclado, use `→`, `Espaço` ou `Enter` para avançar e `←`
  para voltar. Durante a edição de um campo, as teclas mantêm sua função normal.
- Correção e revisão possuem checkpoints independentes. A navegação mantém a
  posição visualizada durante a sessão, mas o retorno após encerrar usa somente
  o ponto confirmado em **Corrigido até aqui** ou **Revisado até aqui**. O botão
  **Primeiro** volta ao início; **Último** é liberado somente depois que o último
  registro tiver sido alcançado uma vez pela navegação normal.
  O checkpoint aparece em azul-escuro no contador e na barra de progresso; ao
  confirmá-lo, uma animação e um balão informam o número salvo.
  No botão, verde indica o modo fixo: um clique salva o registro atual como
  ponto de retorno. Azul indica o modo automático: dois cliques fazem o
  checkpoint acompanhar somente o maior registro visitado a partir dali;
  outro clique simples volta ao modo fixo. O botão **Voltar ao checkpoint**
  retorna diretamente ao registro marcado e fica desativado enquanto o usuário
  já estiver nele.
- As teclas `1` a `8` da fileira superior ou do teclado numérico selecionam os
  oito campos de extração na ordem mostrada na tela, quando o foco não estiver
  em um campo em edição. Tanto o `Enter` principal quanto o `Enter` numérico
  avançam para o próximo registro.
- Um segundo clique na caixa do campo ativo ou a tecla `Esc` retira a seleção
  sem apagar seu conteúdo.
- O clique com o botão direito em qualquer campo abre um menu com as ações
  **Restaurar campo** e **Limpar campo**.
- As alterações são salvas automaticamente em
  `PopulacaoMP - Extracao corrigida.tsv`. O arquivo original nunca é
  sobrescrito. Os realces e o andamento ficam no arquivo auxiliar
  `PopulacaoMP - Extracao corrigida.tsv.estado.json`.
  A cópia integral é criada ao entrar no modo de correção, portanto até os
  registros que não precisarem de mudanças seguem para a revisão.

Para escolher outros arquivos ou outra porta:

```bash
python3 revisor_corretor.py \
  --arquivo entrada.tsv \
  --saida versao-corrigida.tsv \
  --porta 9000
```

## Carga da população e geração de amostra

O programa importa `PopulacaoMP - ClassificacaoMP.tsv` para o PostgreSQL. Ele
converte datas para `DATE`, valores como `R$ 150.000,00` para `NUMERIC(18,2)` e
células realmente vazias para `NULL`. A classe `-` é preservada como consta no
arquivo de origem. Linhas inteiramente vazias e a coluna de instrução
`Categorias de grupos` são ignoradas. Os campos técnicos `n_tokens`,
`grupo_tamanho` e `linha_origem` também não são armazenados.

## 1. Preparação

É necessário ter Python 3.10+ e um PostgreSQL acessível. Para iniciar um banco
local com Docker Compose:

```bash
cp .env.example .env
docker compose up -d
```

Crie o ambiente Python e instale a única dependência:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Se usar outro PostgreSQL, defina a conexão:

```bash
export DATABASE_URL='postgresql://usuario:senha@servidor:5432/banco'
```

Neste projeto, o PostgreSQL do Docker é publicado apenas localmente na porta
`55432`, evitando conflito com instalações locais que usem `5432` ou `5433`.
No pgAdmin, use `localhost` como host e `55432` como porta.

## 2. Carga

```bash
.venv/bin/python carregar_amostra.py carregar
.venv/bin/python carregar_amostra.py status
```

Por padrão, uma nova carga substitui os dados anteriores de forma transacional.
Use `carregar --acrescentar` somente se quiser manter e duplicar os registros já
existentes.

## 3. Gerar uma amostra

Uma amostra reprodutível de 100 registros:

```bash
.venv/bin/python carregar_amostra.py amostra --tamanho 100 --saida amostra.tsv
```

A mesma semente sempre seleciona os mesmos IDs. Para obter outra amostra:

```bash
.venv/bin/python carregar_amostra.py amostra \
  --tamanho 100 --semente rodada-2 --saida amostra-2.tsv
```

Também é possível filtrar pelos valores exatos de um grupo:

```bash
.venv/bin/python carregar_amostra.py amostra \
  --tamanho 30 --grupo 'Escavadeira' --saida amostra-escavadeira.tsv
```

O arquivo [consultas.sql](consultas.sql) contém exemplos para executar no `psql`
ou em ferramentas como DBeaver e pgAdmin.
