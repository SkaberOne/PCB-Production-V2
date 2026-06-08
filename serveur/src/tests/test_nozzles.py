"""Tests du modèle de portée des nozzles (utils/nozzles.py).

Verrouille les observations physiques d'Eric (2026-06) :
  PnP 1 (8 nozzles)  : colonne tout à gauche atteinte par nozzles 1..4 ;
                       colonne tout à droite atteinte par nozzles 5..8.
  PnP 2 (10 nozzles) : colonne tout à gauche atteinte par nozzles 1..5 ;
                       colonne tout à droite atteinte par nozzles 6..10.
"""

from src.utils.nozzles import (
    deduce_nozzle_type,
    default_nozzle_layout,
    normalize_nozzle_layout,
    nozzle_layout_red_positions,
    nozzle_reach_columns,
    nozzle_reach_left_limit,
    nozzle_reach_right_limit,
)


def _reaches(nozzle_index, num_nozzles, columns, column):
    span = nozzle_reach_columns(nozzle_index, num_nozzles, columns)
    return span is not None and span[0] <= column <= span[1]


class TestNozzleReachLimits:
    def test_pnp1_limits(self):
        assert nozzle_reach_left_limit(8) == 4
        assert nozzle_reach_right_limit(8) == 5

    def test_pnp2_limits(self):
        assert nozzle_reach_left_limit(10) == 5
        assert nozzle_reach_right_limit(10) == 6


class TestNozzleReachPnp1:
    N, C = 8, 40

    def test_leftmost_column_reached_by_1_to_4(self):
        for nozzle in range(1, 5):
            assert _reaches(nozzle, self.N, self.C, 1), nozzle
        for nozzle in range(5, 9):
            assert not _reaches(nozzle, self.N, self.C, 1), nozzle

    def test_rightmost_column_reached_by_5_to_8(self):
        for nozzle in range(5, 9):
            assert _reaches(nozzle, self.N, self.C, self.C), nozzle
        for nozzle in range(1, 5):
            assert not _reaches(nozzle, self.N, self.C, self.C), nozzle


class TestNozzleReachPnp2:
    N, C = 10, 40

    def test_leftmost_column_reached_by_1_to_5(self):
        for nozzle in range(1, 6):
            assert _reaches(nozzle, self.N, self.C, 1), nozzle
        for nozzle in range(6, 11):
            assert not _reaches(nozzle, self.N, self.C, 1), nozzle

    def test_rightmost_column_reached_by_6_to_10(self):
        for nozzle in range(6, 11):
            assert _reaches(nozzle, self.N, self.C, self.C), nozzle
        for nozzle in range(1, 6):
            assert not _reaches(nozzle, self.N, self.C, self.C), nozzle


class TestNozzleReachEdgeCases:
    def test_invalid_params_return_none(self):
        assert nozzle_reach_columns(0, 8, 40) is None
        assert nozzle_reach_columns(9, 8, 40) is None
        assert nozzle_reach_columns(1, 0, 40) is None
        assert nozzle_reach_columns(1, 8, 0) is None

    def test_every_column_reachable_by_some_nozzle(self):
        # Couverture : chaque colonne du banc est servie par au moins un nozzle.
        n, c = 8, 40
        for column in range(1, c + 1):
            assert any(_reaches(i, n, c, column) for i in range(1, n + 1)), column


class TestDeduceNozzleType:
    def test_by_footprint(self):
        assert deduce_nozzle_type("0201") == 501
        assert deduce_nozzle_type("R0402") == 502
        assert deduce_nozzle_type("0603") == 502
        assert deduce_nozzle_type("0805") == 503
        assert deduce_nozzle_type("SOT-23") == 503
        assert deduce_nozzle_type("SOIC-8") == 504
        assert deduce_nozzle_type("TSSOP-20") == 504
        assert deduce_nozzle_type("LQFP-64") == 505
        assert deduce_nozzle_type("QFN-32") == 505

    def test_feeder_size_fallback_when_unknown_footprint(self):
        assert deduce_nozzle_type("MYSTERY", 8) == 502
        assert deduce_nozzle_type(None, 16) == 505
        assert deduce_nozzle_type(None, None) is None


class TestDefaultNozzleLayout:
    def test_default_is_ascending_blocks_503_504_505(self):
        # Rangé du plus petit au plus grand, gauche→droite, en blocs croissants ;
        # le reste de la division va aux plus gros types.
        assert default_nozzle_layout(0) == []
        assert default_nozzle_layout(3) == [503, 504, 505]
        assert default_nozzle_layout(5) == [503, 504, 504, 505, 505]
        assert default_nozzle_layout(10) == [503, 503, 503, 504, 504, 504, 505, 505, 505, 505]
        # toujours non décroissant
        for n in range(1, 40):
            layout = default_nozzle_layout(n)
            assert layout == sorted(layout)

    def test_normalize_pads_and_clamps(self):
        # trop court → complété par le défaut ; type inconnu → remplacé par défaut
        assert normalize_nozzle_layout([505], 3) == [505, 504, 505]
        # n=2 → défaut [504, 505] ; index0 invalide (999) → 504, index1 = 504
        assert normalize_nozzle_layout([999, 504], 2) == [504, 504]
        # trop long → tronqué
        assert normalize_nozzle_layout([503, 504, 505, 503], 2) == [503, 504]


class TestNozzleLayoutRedPositions:
    def test_red_when_type_cannot_cover_its_columns(self):
        # 8 nozzles, 40 colonnes. Un composant 505 placé en colonne 1.
        # Si les positions de type 505 sont toutes à droite (ne couvrent pas col 1),
        # elles passent rouges.
        layout = [503, 503, 503, 503, 505, 505, 505, 505]  # 505 en positions 5..8
        # nozzle 5..8 (505) atteignent col 1 ? nozzle 5 atteint dès col 2 → non.
        needed = {505: {1}}
        red = nozzle_layout_red_positions(layout, needed, num_nozzles=8, columns_per_ramp=40)
        assert red == [5, 6, 7, 8]

    def test_no_red_when_a_same_type_nozzle_covers(self):
        # Type 505 présent à gauche (position 1..4) ET droite : col 1 couverte → pas rouge.
        layout = [505, 505, 505, 505, 503, 503, 503, 503]
        needed = {505: {1}}
        red = nozzle_layout_red_positions(layout, needed, num_nozzles=8, columns_per_ramp=40)
        assert red == []
