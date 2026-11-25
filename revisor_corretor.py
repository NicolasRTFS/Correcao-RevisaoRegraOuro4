#!/usr/bin/env python3
"""Interface local para revisar e corrigir as extrações da amostra.

O servidor usa apenas a biblioteca padrão. A interface é aberta no navegador e
os dados corrigidos são sempre escritos em um arquivo diferente do original.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import threading
import webbrowser
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Sequence
from urllib.parse import parse_qs, urlparse


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_SOURCE = BASE_DIR / "PopulacaoMP - Extracao.tsv"
DEFAULT_OUTPUT = BASE_DIR / "PopulacaoMP - Extracao corrigida.tsv"
STATIC_DIR = BASE_DIR / "interface"

DESCRIPTION_FIELD = "descricao_produto"
EDITABLE_FIELDS = (
    "Categoria",
    "Marca",
    "Modelo",
    "Ano",
    "Estado de uso",
    "Chassi",
    "Motor",
    "Numero_serie",
)


class StoreError(ValueError):
    """Erro de validação que pode ser mostrado diretamente na interface."""


def _atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(
        "w", encoding="utf-8", newline="", dir=path.parent, delete=False
    ) as temporary:
        temporary.write(content)
        temporary_path = Path(temporary.name)
    os.replace(temporary_path, path)


@dataclass
class CorrectionStore:
    source: Path
    output: Path
    state_path: Path

    def __post_init__(self) -> None:
        self.lock = threading.RLock()
        if not self.source.is_file():
            raise StoreError(f"Arquivo de dados não encontrado: {self.source}")

        self.headers, self.original_records = self._read_records(self.source)
        if self.output.exists():
            output_headers, self.records = self._read_records(self.output)
            if output_headers != self.headers:
                raise StoreError("O arquivo corrigido possui um cabeçalho diferente do original.")
            if len(self.records) != len(self.original_records):
                raise StoreError("O arquivo corrigido possui quantidade de registros diferente do original.")
        else:
            self.records = [dict(record) for record in self.original_records]
        self.review_base_records: list[dict[str, str]] | None = None
        self.criteria: list[dict[str, str]] = []

        self.states: list[dict[str, Any]] = [self._empty_state() for _ in self.records]
        self.progress = {
            "correcao": {
                "indice_atual": 0,
                "ultimo_liberado": False,
                "checkpoint_automatico": False,
            },
            "revisao": {
                "indice_atual": 0,
                "ultimo_liberado": False,
                "checkpoint_automatico": False,
            },
        }
        if self.state_path.exists():
            try:
                stored = json.loads(self.state_path.read_text(encoding="utf-8"))
                raw_states = stored.get("registros", [])
                for index, state in enumerate(raw_states[: len(self.states)]):
                    self.states[index] = self._clean_state(state, self.records[index])
                if isinstance(stored.get("criterios"), list):
                    self.criteria = self._clean_criteria(stored["criterios"])
                else:
                    # Migra a versão em que os critérios ficavam presos ao
                    # registro no qual haviam sido cadastrados.
                    migrated: list[dict[str, str]] = []
                    seen: set[tuple[str, str]] = set()
                    for state in self.states:
                        for criterion in state.get("criterios", []):
                            key = (criterion["texto"], criterion["autor"])
                            if key not in seen:
                                seen.add(key)
                                migrated.append(criterion)
                    self.criteria = migrated[:100]
                self.progress = self._clean_progress(stored.get("progresso"))
            except (json.JSONDecodeError, OSError, TypeError):
                # Um TSV corrigido válido continua utilizável mesmo se o sidecar
                # visual tiver sido apagado ou danificado.
                pass
        for state in self.states:
            state.pop("criterios", None)

    @staticmethod
    def _read_records(path: Path) -> tuple[list[str], list[dict[str, str]]]:
        with path.open("r", encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source, delimiter="\t")
            if not reader.fieldnames:
                raise StoreError("O arquivo de dados não possui cabeçalho.")
            required = {DESCRIPTION_FIELD, *EDITABLE_FIELDS}
            missing = required.difference(reader.fieldnames)
            if missing:
                raise StoreError(
                    "Colunas ausentes no arquivo: " + ", ".join(sorted(missing))
                )
            headers = list(reader.fieldnames)
            records = [
                {header: (row.get(header) or "") for header in headers}
                for row in reader
            ]
        return headers, records

    @staticmethod
    def _empty_state() -> dict[str, Any]:
        return {
            "status": "pendente",
            "spans": {},
            "comentarios": [],
            "criterios": [],
        }

    def _clean_progress(self, raw_progress: Any) -> dict[str, dict[str, Any]]:
        result: dict[str, dict[str, Any]] = {}
        last_index = max(0, len(self.records) - 1)
        for mode in ("correcao", "revisao"):
            raw_mode = (
                raw_progress.get(mode, {}) if isinstance(raw_progress, dict) else {}
            )
            index = raw_mode.get("indice_atual", 0)
            if not isinstance(index, int) or isinstance(index, bool):
                index = 0
            result[mode] = {
                "indice_atual": min(max(index, 0), last_index),
                "ultimo_liberado": raw_mode.get("ultimo_liberado") is True,
                "checkpoint_automatico": raw_mode.get("checkpoint_automatico") is True,
            }
        return result

    @staticmethod
    def _clean_criteria(raw_criteria: Any) -> list[dict[str, str]]:
        criteria: list[dict[str, str]] = []
        if not isinstance(raw_criteria, list):
            return criteria
        for criterion in raw_criteria[:100]:
            if isinstance(criterion, str) and criterion.strip():
                criteria.append(
                    {
                        "texto": criterion.strip()[:5000],
                        "autor": "nao_identificado",
                    }
                )
            elif isinstance(criterion, dict):
                text = criterion.get("texto")
                author = criterion.get("autor")
                if isinstance(text, str) and text.strip():
                    if not isinstance(author, str) or author not in {
                        "corretor",
                        "revisor",
                        "nao_identificado",
                    }:
                        author = "nao_identificado"
                    criteria.append(
                        {"texto": text.strip()[:5000], "autor": author}
                    )
        return criteria

    @staticmethod
    def _clean_state(state: Any, record: dict[str, str]) -> dict[str, Any]:
        if not isinstance(state, dict):
            return CorrectionStore._empty_state()
        status = state.get("status", "pendente")
        # Migração dos marcadores usados por versões anteriores.
        if status == "corrigir":
            status = "atencao"
        elif status == "revisado":
            status = "pendente"
        if status not in {"pendente", "atencao"}:
            status = "pendente"
        description = record[DESCRIPTION_FIELD]
        spans: dict[str, dict[str, int]] = {}
        raw_spans = state.get("spans", {})
        if isinstance(raw_spans, dict):
            for field, span in raw_spans.items():
                # Categoria é uma classe fechada escolhida pelo dropdown; ela
                # nunca representa um trecho livre da descrição.
                if (
                    field == "Categoria"
                    or field not in EDITABLE_FIELDS
                    or not isinstance(span, dict)
                ):
                    continue
                start, end = span.get("start"), span.get("end")
                if (
                    isinstance(start, int)
                    and isinstance(end, int)
                    and 0 <= start < end <= len(description)
                ):
                    spans[field] = {"start": start, "end": end}
        comments: list[dict[str, str]] = []
        raw_comments = state.get("comentarios", [])
        if isinstance(raw_comments, list):
            for comment in raw_comments[:100]:
                if isinstance(comment, str) and comment.strip():
                    # Comentários de versões anteriores não registravam a fase.
                    comments.append(
                        {
                            "texto": comment.strip()[:5000],
                            "autor": "nao_identificado",
                        }
                    )
                elif isinstance(comment, dict):
                    text = comment.get("texto")
                    author = comment.get("autor")
                    if isinstance(text, str) and text.strip():
                        if not isinstance(author, str) or author not in {
                            "corretor",
                            "revisor",
                            "nao_identificado",
                        }:
                            author = "nao_identificado"
                        comments.append(
                            {"texto": text.strip()[:5000], "autor": author}
                        )
        criteria = CorrectionStore._clean_criteria(state.get("criterios", []))
        return {
            "status": status,
            "spans": spans,
            "comentarios": comments,
            "criterios": criteria,
        }

    def _validate_mode(self, mode: str) -> None:
        if mode not in {"correcao", "revisao"}:
            raise StoreError("Modo de trabalho inválido.")
        if mode == "revisao" and not self.output.exists():
            raise StoreError(
                "Ainda não há um arquivo de correção para revisar. "
                "Faça e salve ao menos uma correção primeiro."
            )
        if mode == "revisao" and self.review_base_records is None:
            # Congela a versão produzida pela correção para que "Restaurar
            # campo" no modo de revisão volte ao início dessa fase, e não ao
            # conjunto bruto original.
            self.review_base_records = [dict(record) for record in self.records]

    def summary(self, mode: str = "correcao") -> dict[str, Any]:
        with self.lock:
            if mode == "correcao" and not self.output.exists():
                # Entrar na fase de correção já cria uma cópia integral. Assim,
                # a revisão recebe todos os registros, inclusive os que não
                # precisaram ser alterados.
                self._save()
            self._validate_mode(mode)
            statuses = [state["status"] for state in self.states]
            return {
                "total": len(self.records),
                "atencao": statuses.count("atencao"),
                "pendentes": statuses.count("pendente"),
                "arquivo_saida": str(self.output),
                "campos": list(EDITABLE_FIELDS),
                "indice_atual": self.progress[mode]["indice_atual"],
                "ultimo_liberado": self.progress[mode]["ultimo_liberado"],
                "checkpoint_automatico": self.progress[mode]["checkpoint_automatico"],
            }

    def set_progress(
        self,
        mode: str,
        index: int,
        reached_last_manually: bool = False,
        set_checkpoint: bool = False,
        checkpoint_mode: str | None = None,
    ) -> dict[str, Any]:
        with self.lock:
            self._validate_mode(mode)
            self._validate_index(index)
            if checkpoint_mode not in {None, "fixo", "automatico"}:
                raise StoreError("Modo de checkpoint inválido.")
            if checkpoint_mode is not None:
                self.progress[mode]["checkpoint_automatico"] = (
                    checkpoint_mode == "automatico"
                )
            if set_checkpoint:
                self.progress[mode]["indice_atual"] = index
            elif self.progress[mode]["checkpoint_automatico"]:
                self.progress[mode]["indice_atual"] = max(
                    self.progress[mode]["indice_atual"], index
                )
            if reached_last_manually and index == len(self.records) - 1:
                self.progress[mode]["ultimo_liberado"] = True
            self._save_state()
            return self.summary(mode)

    def get(self, index: int, mode: str = "correcao") -> dict[str, Any]:
        with self.lock:
            self._validate_mode(mode)
            self._validate_index(index)
            state = json.loads(json.dumps(self.states[index]))
            state["criterios"] = json.loads(json.dumps(self.criteria))
            return {
                "index": index,
                "registro": dict(self.records[index]),
                "registro_original": dict(
                    self.original_records[index]
                    if mode == "correcao"
                    else self.review_base_records[index]  # type: ignore[index]
                ),
                "estado": state,
                "resumo": self.summary(mode),
            }

    def update(
        self, index: int, payload: dict[str, Any], mode: str = "correcao"
    ) -> dict[str, Any]:
        with self.lock:
            self._validate_mode(mode)
            self._validate_index(index)
            raw_record = payload.get("registro")
            if not isinstance(raw_record, dict):
                raise StoreError("O registro enviado é inválido.")

            record = dict(self.records[index])
            for field in (DESCRIPTION_FIELD, *EDITABLE_FIELDS):
                value = raw_record.get(field, record[field])
                if not isinstance(value, str):
                    raise StoreError(f"O campo {field!r} precisa ser texto.")
                record[field] = value

            if "criterios" in payload:
                self.criteria = self._clean_criteria(payload["criterios"])

            raw_state = {
                "status": payload.get("status", self.states[index]["status"]),
                "spans": payload.get("spans", self.states[index]["spans"]),
                "comentarios": payload.get(
                    "comentarios", self.states[index]["comentarios"]
                ),
            }
            state = self._clean_state(raw_state, record)
            state.pop("criterios", None)

            self.records[index] = record
            self.states[index] = state
            self._save()
            if mode == "correcao":
                # Uma nova alteração da correção passa a compor a próxima base
                # da revisão.
                self.review_base_records = None
            return self.get(index, mode)

    def _validate_index(self, index: int) -> None:
        if not 0 <= index < len(self.records):
            raise StoreError("Registro fora dos limites da amostra.")

    def _save(self) -> None:
        from io import StringIO

        tsv = StringIO(newline="")
        writer = csv.DictWriter(
            tsv,
            fieldnames=self.headers,
            delimiter="\t",
            lineterminator="\n",
            extrasaction="ignore",
        )
        writer.writeheader()
        writer.writerows(self.records)
        _atomic_write_text(self.output, tsv.getvalue())
        self._save_state()

    def _save_state(self) -> None:
        _atomic_write_text(
            self.state_path,
            json.dumps(
                {
                    "versao": 3,
                    "registros": self.states,
                    "criterios": self.criteria,
                    "progresso": self.progress,
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
        )


class AppHandler(BaseHTTPRequestHandler):
    store: CorrectionStore

    def do_GET(self) -> None:  # noqa: N802 - API da biblioteca padrão
        parsed = urlparse(self.path)
        if parsed.path == "/api/resumo":
            try:
                mode = parse_qs(parsed.query).get("modo", ["correcao"])[0]
                self._json(self.store.summary(mode))
            except StoreError as exc:
                self._json({"erro": str(exc)}, HTTPStatus.CONFLICT)
            return
        if parsed.path == "/api/registro":
            try:
                query = parse_qs(parsed.query)
                raw_index = query.get("indice", ["0"])[0]
                mode = query.get("modo", ["correcao"])[0]
                self._json(self.store.get(int(raw_index), mode))
            except (ValueError, StoreError) as exc:
                self._json({"erro": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        if parsed.path in {"/", "/index.html"}:
            self._static("index.html", "text/html; charset=utf-8")
            return
        if parsed.path == "/app.js":
            self._static("app.js", "text/javascript; charset=utf-8")
            return
        if parsed.path == "/styles.css":
            self._static("styles.css", "text/css; charset=utf-8")
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:  # noqa: N802 - API da biblioteca padrão
        parsed = urlparse(self.path)
        if parsed.path not in {"/api/registro", "/api/progresso"}:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 1_000_000:
                raise StoreError("Requisição grande demais.")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise StoreError("Conteúdo inválido.")
            index = int(payload.get("index", -1))
            mode = payload.get("modo", "correcao")
            if not isinstance(mode, str):
                raise StoreError("Modo de trabalho inválido.")
            if parsed.path == "/api/progresso":
                reached_last = payload.get("ultimo_alcancado_manualmente") is True
                set_checkpoint = payload.get("definir_checkpoint") is True
                checkpoint_mode = payload.get("modo_checkpoint")
                if checkpoint_mode is not None and not isinstance(checkpoint_mode, str):
                    raise StoreError("Modo de checkpoint inválido.")
                self._json(
                    self.store.set_progress(
                        mode,
                        index,
                        reached_last_manually=reached_last,
                        set_checkpoint=set_checkpoint,
                        checkpoint_mode=checkpoint_mode,
                    )
                )
                return
            self._json(self.store.update(index, payload, mode))
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError, StoreError) as exc:
            self._json({"erro": str(exc)}, HTTPStatus.BAD_REQUEST)

    def _static(self, filename: str, content_type: str) -> None:
        path = STATIC_DIR / filename
        try:
            content = path.read_bytes()
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def _json(self, data: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        content = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format: str, *args: Any) -> None:
        # Mantém o terminal legível; erros HTTP continuam aparecendo na interface.
        return


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="Abre a interface local de correção e revisão das extrações."
    )
    result.add_argument("--arquivo", type=Path, default=DEFAULT_SOURCE)
    result.add_argument("--saida", type=Path, default=DEFAULT_OUTPUT)
    result.add_argument("--estado", type=Path)
    result.add_argument("--host", default="127.0.0.1")
    result.add_argument("--porta", type=int, default=8765)
    result.add_argument("--nao-abrir", action="store_true")
    return result


def main(argv: Sequence[str] | None = None) -> None:
    args = parser().parse_args(argv)
    output = args.saida.resolve()
    source = args.arquivo.resolve()
    if source == output:
        raise SystemExit("O arquivo de saída precisa ser diferente do original.")
    state_path = (
        args.estado.resolve()
        if args.estado
        else output.with_suffix(output.suffix + ".estado.json")
    )
    try:
        store = CorrectionStore(source, output, state_path)
    except StoreError as exc:
        raise SystemExit(str(exc)) from exc

    handler = type("ConfiguredAppHandler", (AppHandler,), {"store": store})
    server = ThreadingHTTPServer((args.host, args.porta), handler)
    address = f"http://{args.host}:{server.server_port}"
    print(f"Interface disponível em {address}")
    print(f"As correções serão salvas em: {output}")
    if not args.nao_abrir:
        threading.Timer(0.5, webbrowser.open, args=(address,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nInterface encerrada.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
