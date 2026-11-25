import unittest

from carregar_amostra import DEFAULT_FILE, records


class RecordsTest(unittest.TestCase):
    def test_preserva_hifen_e_posicao_das_colunas(self):
        by_description = {row[0]: row for row in records(DEFAULT_FILE)}

        description = "AITEM NO. 432621 - FRESADORA DE ASFALTO NOVA, MARCA AVANT, COM ENGATWE RAPIDO AVANT"
        row = by_description[description]
        self.assertEqual(row[5], "Rolo Compactador")
        self.assertEqual(row[6], "-")

        row = by_description["1ºTRAVESSA DO CHASSI"]
        self.assertEqual(row[5], "-")
        self.assertEqual(row[6], "-")


if __name__ == "__main__":
    unittest.main()
