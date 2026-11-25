-- Resumo da população
SELECT
    COUNT(*) AS total,
    MIN(data_emissao) AS primeira_emissao,
    MAX(data_emissao) AS ultima_emissao,
    ROUND(AVG(valor_unitario_comercial), 2) AS valor_medio
FROM populacao_mp;

-- Quantidade por grupo
SELECT grupos, COUNT(*) AS quantidade
FROM populacao_mp
GROUP BY grupos
ORDER BY quantidade DESC;

-- Amostra aleatória simples de 100 registros (muda a cada execução)
SELECT *
FROM populacao_mp
ORDER BY random()
LIMIT 100;

-- Amostra reprodutível de 100 registros. Troque 'regra-ouro' por outra semente.
SELECT *
FROM populacao_mp
ORDER BY md5(id::text || 'regra-ouro')
LIMIT 100;
