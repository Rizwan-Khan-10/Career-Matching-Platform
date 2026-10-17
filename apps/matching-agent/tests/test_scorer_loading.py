"""The scorer never falls back silently in production (minilm); TEST_MODEL is for the hash backend only."""
import json
import os
import tempfile
import unittest
from unittest import mock

os.environ.setdefault("EMBEDDING_BACKEND", "hash")

from app.core import config, embeddings
from app.services import scorer
from app.services.features import FEATURE_NAMES


class ScorerLoadingTest(unittest.TestCase):
    def setUp(self):
        self._old_model = scorer._model
        scorer._model = None
        self.addCleanup(lambda: setattr(scorer, "_model", self._old_model))
        self.dir = tempfile.mkdtemp()

    def _file(self, payload):
        path = os.path.join(self.dir, "scorer.json")
        with open(path, "w", encoding="utf-8") as f:
            f.write(payload if isinstance(payload, str) else json.dumps(payload))
        return path

    def _valid(self, **over):
        return {"version": "t-1", "embedding_model": "m-1", "features": FEATURE_NAMES,
                "weights": {n: 0.1 for n in FEATURE_NAMES}, "bias": -1.0, "threshold": 0.5, **over}

    def _prod(self, path):
        return mock.patch.multiple(config, EMBEDDING_BACKEND="minilm", SCORER_PATH=path)

    def test_minilm_missing_scorer_fails_at_startup(self):
        with self._prod(os.path.join(self.dir, "nope.json")):
            with self.assertRaises(scorer.ScorerError) as ctx:
                scorer.ensure_loaded()
        self.assertIn("not found", str(ctx.exception))

    def test_minilm_corrupt_scorer_fails(self):
        with self._prod(self._file("{not json")):
            with self.assertRaises(scorer.ScorerError):
                scorer.ensure_loaded()

    def test_minilm_feature_mismatch_fails(self):
        with self._prod(self._file(self._valid(features=["only_one"]))):
            with self.assertRaises(scorer.ScorerError) as ctx:
                scorer.ensure_loaded()
        self.assertIn("feature list", str(ctx.exception))

    def test_minilm_embedder_mismatch_fails(self):
        with self._prod(self._file(self._valid())), mock.patch.object(scorer, "model_name", return_value="other-embedder"):
            with self.assertRaises(scorer.ScorerError) as ctx:
                scorer.ensure_loaded()
        self.assertIn("embedder", str(ctx.exception))

    def test_minilm_valid_scorer_loads(self):
        with self._prod(self._file(self._valid())), mock.patch.object(scorer, "model_name", return_value="m-1"):
            self.assertEqual(scorer.ensure_loaded()["version"], "t-1")

    def test_base_feature_artifact_still_loads(self):
        base = scorer.BASE_FEATURE_NAMES
        with self._prod(self._file(self._valid(features=base, weights={n: 0.1 for n in base}))), \
                mock.patch.object(scorer, "model_name", return_value="m-1"):
            self.assertEqual(scorer.ensure_loaded()["version"], "t-1")

    def test_hash_backend_uses_test_model_when_scorer_is_unusable(self):
        with mock.patch.multiple(config, EMBEDDING_BACKEND="hash", SCORER_PATH=os.path.join(self.dir, "nope.json")):
            self.assertIs(scorer.ensure_loaded(), scorer.TEST_MODEL)


class HashBackendGuardTest(unittest.TestCase):
    def test_hash_is_refused_in_production(self):
        with mock.patch.object(embeddings, "EMBEDDING_BACKEND", "hash"), mock.patch.object(embeddings, "IS_PRODUCTION", True):
            with self.assertRaises(RuntimeError):
                embeddings.check_backend_allowed()

    def test_hash_is_fine_outside_production(self):
        with mock.patch.object(embeddings, "EMBEDDING_BACKEND", "hash"), mock.patch.object(embeddings, "IS_PRODUCTION", False):
            embeddings.check_backend_allowed()

    def test_minilm_is_fine_in_production(self):
        with mock.patch.object(embeddings, "EMBEDDING_BACKEND", "minilm"), mock.patch.object(embeddings, "IS_PRODUCTION", True):
            embeddings.check_backend_allowed()


if __name__ == "__main__":
    unittest.main()