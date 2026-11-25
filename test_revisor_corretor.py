import csv
import json
import tempfile
import unittest
from pathlib import Path

from revisor_corretor import CorrectionStore, StoreError


HEADERS = [
    "descricao_produto",
    "Categoria",
    "Marca",
    "Modelo",
    "Ano",
    "Estado de uso",
    "Chassi",
    "Motor",
    "Numero_serie",
]


class CorrectionStoreTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp_dir.name)
        self.source = self.directory / "origem.tsv"
        self.output = self.directory / "corrigida.tsv"
        self.state = self.directory / "estado.json"
        with self.source.open("w", encoding="utf-8", newline="") as destination:
            writer = csv.DictWriter(destination, fieldnames=HEADERS, delimiter="\t")
            writer.writeheader()
            writer.writerow(
                {
                    "descricao_produto": "ESCAVADEIRA MARCA ACME MODELO X1",
                    "Categoria": "ESCAVADEIRA",
                    "Marca": "ACME",
                    "Modelo": "X1",
                }
            )

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_salva_correcao_em_arquivo_separado(self):
        store = CorrectionStore(self.source, self.output, self.state)
        payload = store.get(0)
        payload["registro"]["Marca"] = "MARCA ACME"
        payload["spans"] = {"Marca": {"start": 11, "end": 21}}
        payload["status"] = "atencao"

        updated = store.update(0, payload)

        self.assertTrue(self.output.exists())
        self.assertEqual(updated["registro"]["Marca"], "MARCA ACME")
        self.assertEqual(updated["estado"]["status"], "atencao")
        self.assertIn("MARCA ACME", self.output.read_text(encoding="utf-8"))
        self.assertNotIn("\tMARCA ACME\t", self.source.read_text(encoding="utf-8"))
        metadata = json.loads(self.state.read_text(encoding="utf-8"))
        self.assertEqual(metadata["registros"][0]["spans"]["Marca"]["start"], 11)

    def test_descarta_span_fora_do_texto(self):
        store = CorrectionStore(self.source, self.output, self.state)
        payload = store.get(0)
        payload["spans"] = {"Marca": {"start": 10, "end": 999}}

        updated = store.update(0, payload)

        self.assertEqual(updated["estado"]["spans"], {})

    def test_categoria_nao_pode_ser_associada_a_trecho_livre(self):
        store = CorrectionStore(self.source, self.output, self.state)
        payload = store.get(0)
        payload["spans"] = {"Categoria": {"start": 0, "end": 10}}

        updated = store.update(0, payload)

        self.assertEqual(updated["estado"]["spans"], {})

    def test_migra_antigo_marcador_para_atencao(self):
        self.state.write_text(
            json.dumps({"versao": 1, "registros": [{"status": "corrigir", "spans": {}}]}),
            encoding="utf-8",
        )

        store = CorrectionStore(self.source, self.output, self.state)

        self.assertEqual(store.get(0)["estado"]["status"], "atencao")

    def test_persiste_varios_comentarios_e_permite_remocao(self):
        store = CorrectionStore(self.source, self.output, self.state)
        payload = store.get(0)
        payload["comentarios"] = [
            {"texto": "Primeiro comentário", "autor": "corretor"},
            {"texto": "Segundo comentário", "autor": "revisor"},
        ]

        store.update(0, payload)
        reopened = CorrectionStore(self.source, self.output, self.state)
        data = reopened.get(0)
        self.assertEqual(
            data["estado"]["comentarios"],
            [
                {"texto": "Primeiro comentário", "autor": "corretor"},
                {"texto": "Segundo comentário", "autor": "revisor"},
            ],
        )

        data["comentarios"] = [
            {"texto": "Segundo comentário", "autor": "revisor"}
        ]
        updated = reopened.update(0, data)
        self.assertEqual(
            updated["estado"]["comentarios"],
            [{"texto": "Segundo comentário", "autor": "revisor"}],
        )

    def test_persiste_criterios_numerados_com_autoria(self):
        store = CorrectionStore(self.source, self.output, self.state)
        payload = store.get(0)
        payload["criterios"] = [
            {"texto": "Critério de marca", "autor": "corretor"},
            {"texto": "Critério de modelo", "autor": "revisor"},
        ]

        updated = store.update(0, payload)
        reopened = CorrectionStore(self.source, self.output, self.state)

        self.assertEqual(updated["estado"]["criterios"], payload["criterios"])
        self.assertEqual(
            reopened.get(0)["estado"]["criterios"], payload["criterios"]
        )
        metadata = json.loads(self.state.read_text(encoding="utf-8"))
        self.assertEqual(metadata["criterios"], payload["criterios"])
        self.assertNotIn("criterios", metadata["registros"][0])

    def test_migra_criterios_presos_a_um_registro_para_lista_global(self):
        legacy_criteria = [
            {"texto": "Critério legado", "autor": "corretor"},
        ]
        self.state.write_text(
            json.dumps(
                {
                    "versao": 2,
                    "registros": [
                        {
                            "status": "pendente",
                            "spans": {},
                            "comentarios": [],
                            "criterios": legacy_criteria,
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )

        store = CorrectionStore(self.source, self.output, self.state)

        self.assertEqual(store.get(0)["estado"]["criterios"], legacy_criteria)

    def test_mantem_valor_original_disponivel_apos_correcao(self):
        store = CorrectionStore(self.source, self.output, self.state)
        payload = store.get(0)
        payload["registro"]["Marca"] = "OUTRA"
        store.update(0, payload)

        reopened = CorrectionStore(self.source, self.output, self.state)
        data = reopened.get(0)

        self.assertEqual(data["registro"]["Marca"], "OUTRA")
        self.assertEqual(data["registro_original"]["Marca"], "ACME")

    def test_revisao_exige_arquivo_de_correcao(self):
        store = CorrectionStore(self.source, self.output, self.state)

        with self.assertRaisesRegex(StoreError, "arquivo de correção"):
            store.get(0, "revisao")

        payload = store.get(0, "correcao")
        payload["registro"]["Marca"] = "CORRIGIDA"
        store.update(0, payload, "correcao")
        reviewed = store.get(0, "revisao")
        self.assertEqual(reviewed["registro"]["Marca"], "CORRIGIDA")
        self.assertEqual(reviewed["registro_original"]["Marca"], "CORRIGIDA")

        reviewed["registro"]["Marca"] = "REVISADA"
        store.update(0, reviewed, "revisao")
        after_review = store.get(0, "revisao")
        self.assertEqual(after_review["registro"]["Marca"], "REVISADA")
        self.assertEqual(after_review["registro_original"]["Marca"], "CORRIGIDA")

    def test_arquivo_de_correcao_contem_todos_os_registros(self):
        with self.source.open("a", encoding="utf-8", newline="") as destination:
            writer = csv.DictWriter(destination, fieldnames=HEADERS, delimiter="\t")
            writer.writerow({"descricao_produto": "SEGUNDO REGISTRO", "Categoria": "-"})
        store = CorrectionStore(self.source, self.output, self.state)

        store.summary("correcao")

        with self.output.open("r", encoding="utf-8", newline="") as source:
            rows = list(csv.DictReader(source, delimiter="\t"))
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1]["descricao_produto"], "SEGUNDO REGISTRO")

    def test_persiste_posicao_e_liberacao_do_ultimo_registro(self):
        with self.source.open("a", encoding="utf-8", newline="") as destination:
            writer = csv.DictWriter(destination, fieldnames=HEADERS, delimiter="\t")
            writer.writerow({"descricao_produto": "SEGUNDO REGISTRO", "Categoria": "-"})
        store = CorrectionStore(self.source, self.output, self.state)
        store.summary("correcao")

        summary = store.set_progress("correcao", 1, reached_last_manually=False)
        self.assertEqual(summary["indice_atual"], 0)
        self.assertFalse(summary["ultimo_liberado"])

        store.set_progress("correcao", 1, set_checkpoint=True)
        store.set_progress("correcao", 1, reached_last_manually=True)
        reopened = CorrectionStore(self.source, self.output, self.state)
        resumed = reopened.summary("correcao")
        self.assertEqual(resumed["indice_atual"], 1)
        self.assertTrue(resumed["ultimo_liberado"])

    def test_checkpoint_automatico_mantem_maior_registro_visitado(self):
        with self.source.open("a", encoding="utf-8", newline="") as destination:
            writer = csv.DictWriter(destination, fieldnames=HEADERS, delimiter="\t")
            writer.writerow({"descricao_produto": "SEGUNDO REGISTRO", "Categoria": "-"})
        store = CorrectionStore(self.source, self.output, self.state)
        store.summary("correcao")

        automatic = store.set_progress(
            "correcao", 0, set_checkpoint=True, checkpoint_mode="automatico"
        )
        self.assertTrue(automatic["checkpoint_automatico"])
        advanced = store.set_progress("correcao", 1)
        self.assertEqual(advanced["indice_atual"], 1)
        returned = store.set_progress("correcao", 0)
        self.assertEqual(returned["indice_atual"], 1)

        reopened = CorrectionStore(self.source, self.output, self.state)
        persisted = reopened.summary("correcao")
        self.assertTrue(persisted["checkpoint_automatico"])
        fixed = reopened.set_progress(
            "correcao", 0, set_checkpoint=True, checkpoint_mode="fixo"
        )
        self.assertFalse(fixed["checkpoint_automatico"])
        self.assertEqual(fixed["indice_atual"], 0)

    def test_exige_colunas_da_extracao(self):
        invalid = self.directory / "invalido.tsv"
        invalid.write_text("descricao_produto\ntexto\n", encoding="utf-8")
        with self.assertRaises(StoreError):
            CorrectionStore(invalid, self.output, self.state)


if __name__ == "__main__":
    unittest.main()
