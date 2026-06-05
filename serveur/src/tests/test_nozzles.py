"""Tests du modèle de portée des nozzles (utils/nozzles.py).

Verrouille les observations physiques d'Eric (2026-06) :
  PnP 1 (8 nozzles)  : colonne tout à gauche atteinte par nozzles 1..4 ;
                       colonne tout à droite atteinte par nozzles 5..8.
  PnP 2 (10 nozzles) : colonne tout à gauche atteinte par nozzles 1..5 ;
                       colonne tout à droite atteinte par nozzles 6..10.
"""

from src.utils.nozzles import (
    deduce_nozzle_class,
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


class TestDeduceNozzleClass:
    def test_small_to_large(self):
        assert deduce_nozzle_class(8) == 1
        assert deduce_nozzle_class(12) == 2
        assert deduce_nozzle_class(16) == 3
        assert deduce_nozzle_class(44) == 4
        assert deduce_nozzle_class(None) is None
