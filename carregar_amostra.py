#!/usr/bin/env python3
"""Carrega a população do TSV no PostgreSQL e gera amostras consultáveis."""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Iterator, Sequence

try:
    import psycopg
    from psycopg import sql
except ImportError:  # mensagem mais útil que o traceback padrão
    print(
        "Dependência ausente. Execute: python3 -m pip install -r requirements.txt",
        file=sys.stderr,
    )
    raise SystemExit(2)


DEFAULT_FILE = Path(__file__).with_name("PopulacaoMP - ClassificacaoMP.tsv")
DEFAULT_DATABASE_URL = "postgresql://amostras:amostras@localhost:55432/amostras"
TABLE = "populacao_mp"
EXPECTED_HEADER = [
    "descricao_produto",
    "data_emissao",
    "unidade_comercial",
    "valor_unitario_comercial",
    "ncm_produto",
    "n_tokens",
    "grupo_tamanho",
    "Grupos",
    "Checagem",
    "Categorias de grupos",
]

CREATE_TABLE = f"""
CREATE TABLE IF NOT EXISTS {TABLE} (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    descricao_produto TEXT NOT NULL,
    data_emissao DATE NOT NULL,
    unidade_comercial TEXT NOT NULL,
    valor_unitario_comercial NUMERIC(18, 2) NOT NULL,
    ncm_produto TEXT NOT NULL,
    grupos TEXT,
    checagem TEXT
);
-- Migração de bancos criados por versões anteriores do carregador.
ALTER TABLE {TABLE} DROP COLUMN IF EXISTS categoria_grupo;
ALTER TABLE {TABLE} DROP COLUMN IF EXISTS carregado_em;
ALTER TABLE {TABLE} DROP COLUMN IF EXISTS grupo_tamanho;
ALTER TABLE {TABLE} DROP COLUMN IF EXISTS n_tokens;
ALTER TABLE {TABLE} DROP COLUMN IF EXISTS linha_origem;
CREATE INDEX IF NOT EXISTS populacao_mp_grupos_idx
    ON {TABLE} (grupos);
CREATE INDEX IF NOT EXISTS populacao_mp_data_idx
    ON {TABLE} (data_emissao);
CREATE INDEX IF NOT EXISTS populacao_mp_ncm_idx
    ON {TABLE} (ncm_produto);
"""

COPY_SQL = f"""COPY {TABLE} (
    descricao_produto, data_emissao, unidade_comercial,
    valor_unitario_comercial, ncm_produto, grupos, checagem
) FROM STDIN"""


class DataError(ValueError):
    """Erro de validação acompanhado pela linha do arquivo."""


def null_if_empty(value: str) -> str | None:
    """Preserva classes como '-' e converte apenas células vazias em NULL."""
    value = value.strip()
    return None if value == "" else value


def parse_brl(value: str, line_number: int) -> Decimal:
    normalized = re.sub(r"\s+", "", value).removeprefix("R$")
    normalized = normalized.replace(".", "").replace(",", ".")
    try:
        return Decimal(normalized)
    except InvalidOperation as exc:
        raise DataError(
            f"Linha {line_number}: valor monetário inválido: {value!r}"
        ) from exc


def records(path: Path) -> Iterator[tuple[object, ...]]:
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.reader(source, delimiter="\t")
        try:
            header = next(reader)
        except StopIteration as exc:
            raise DataError("O arquivo TSV está vazio.") from exc
        if header != EXPECTED_HEADER:
            raise DataError(
                "Cabeçalho inesperado.\n"
                f"Esperado: {EXPECTED_HEADER}\nRecebido: {header}"
            )

        for line_number, row in enumerate(reader, start=2):
            if not any(field.strip() for field in row):
                continue
            if len(row) != len(EXPECTED_HEADER):
                raise DataError(
                    f"Linha {line_number}: esperadas 10 colunas, recebidas {len(row)}."
                )
            if not all(row[index].strip() for index in (0, 1, 2, 3, 4)):
                raise DataError(
                    f"Linha {line_number}: uma coluna obrigatória está vazia."
                )
            try:
                emission_date = date.fromisoformat(row[1].strip())
            except ValueError as exc:
                raise DataError(
                    f"Linha {line_number}: data inválida: {row[1]!r}"
                ) from exc

            yield (
                row[0].strip(),
                emission_date,
                row[2].strip(),
                parse_brl(row[3], line_number),
                row[4].strip(),
                null_if_empty(row[7]),
                null_if_empty(row[8]),
            )


def connect(database_url: str):
    try:
        return psycopg.connect(database_url)
    except psycopg.OperationalError as exc:
        raise SystemExit(f"Não foi possível conectar ao PostgreSQL: {exc}") from exc


def load(database_url: str, path: Path, append: bool) -> None:
    if not path.is_file():
        raise SystemExit(f"Arquivo não encontrado: {path}")

    count = 0
    with connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(CREATE_TABLE)
            if not append:
                cursor.execute(f"TRUNCATE TABLE {TABLE} RESTART IDENTITY")
            with cursor.copy(COPY_SQL) as copy:
                try:
                    for record in records(path):
                        copy.write_row(record)
                        count += 1
                except DataError as exc:
                    raise SystemExit(f"Carga cancelada: {exc}") from exc

    mode = "acrescentados" if append else "carregados"
    print(f"OK: {count} registros {mode} na tabela {TABLE}.")


def sample_query(
    size: int,
    seed: str,
    group: str | None,
) -> tuple[sql.Composed, list[object]]:
    filters: list[sql.Composed] = []
    params: list[object] = []
    if group:
        filters.append(sql.SQL("grupos = %s"))
        params.append(group)
    where = sql.SQL(" WHERE ") + sql.SQL(" AND ").join(filters) if filters else sql.SQL("")
    query = sql.SQL(
        "SELECT id, descricao_produto, data_emissao, unidade_comercial, "
        "valor_unitario_comercial, ncm_produto, grupos, checagem "
        "FROM {}{} ORDER BY md5(id::text || %s) LIMIT %s"
    ).format(sql.Identifier(TABLE), where)
    params.extend([seed, size])
    return query, params


def sample(
    database_url: str,
    size: int,
    seed: str,
    group: str | None,
    output: Path,
) -> None:
    query, params = sample_query(size, seed, group)
    with connect(database_url) as connection, connection.cursor() as cursor:
        cursor.execute(query, params)
        rows = cursor.fetchall()
        header = [column.name for column in cursor.description]

    with output.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.writer(destination, delimiter="\t", lineterminator="\n")
        writer.writerow(header)
        writer.writerows(rows)
    print(f"OK: {len(rows)} registros gravados em {output} (semente={seed!r}).")


def status(database_url: str) -> None:
    query = sql.SQL(
        "SELECT COUNT(*), MIN(data_emissao), MAX(data_emissao), "
        "COUNT(DISTINCT grupos) FROM {}"
    ).format(sql.Identifier(TABLE))
    try:
        with connect(database_url) as connection, connection.cursor() as cursor:
            cursor.execute(query)
            total, first_date, last_date, groups = cursor.fetchone()
    except psycopg.errors.UndefinedTable as exc:
        raise SystemExit("A tabela ainda não existe. Execute o comando 'carregar'.") from exc
    print(f"Registros: {total}")
    print(f"Período: {first_date} a {last_date}")
    print(f"Grupos distintos: {groups}")


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(
        description="Carga do TSV no PostgreSQL e geração de amostras."
    )
    root.add_argument(
        "--database-url",
        default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL),
        help="URL do PostgreSQL (ou variável DATABASE_URL).",
    )
    commands = root.add_subparsers(dest="command", required=True)

    load_parser = commands.add_parser("carregar", help="Cria a tabela e carrega o TSV.")
    load_parser.add_argument("--arquivo", type=Path, default=DEFAULT_FILE)
    load_parser.add_argument(
        "--acrescentar",
        action="store_true",
        help="Acrescenta registros; por padrão a tabela é substituída.",
    )

    commands.add_parser("status", help="Mostra um resumo dos dados carregados.")

    sample_parser = commands.add_parser("amostra", help="Gera uma amostra em TSV.")
    sample_parser.add_argument("--tamanho", type=int, required=True)
    sample_parser.add_argument("--semente", default="regra-ouro")
    sample_parser.add_argument("--grupo", help="Filtra por grupos.")
    sample_parser.add_argument("--saida", type=Path, default=Path("amostra.tsv"))
    return root


def main(argv: Sequence[str] | None = None) -> None:
    args = parser().parse_args(argv)
    if args.command == "carregar":
        load(args.database_url, args.arquivo, args.acrescentar)
    elif args.command == "status":
        status(args.database_url)
    elif args.command == "amostra":
        if args.tamanho <= 0:
            raise SystemExit("--tamanho deve ser maior que zero.")
        sample(
            args.database_url,
            args.tamanho,
            args.semente,
            args.grupo,
            args.saida,
        )


if __name__ == "__main__":
    main()
