"""Lets worker-level tests run on a bare machine: installs tiny stand-ins ONLY for packages that are missing."""
import copy
import importlib.util
import sys
import types


def _missing(name):
    return name not in sys.modules and importlib.util.find_spec(name) is None


def install():
    if _missing("pydantic"):
        m = types.ModuleType("pydantic")

        class BaseModel:
            def __init__(self, **kw):
                ann = {}
                for klass in reversed(type(self).__mro__):
                    ann.update(getattr(klass, "__annotations__", {}))
                for name in ann:
                    if name in kw:
                        setattr(self, name, kw.pop(name))
                    else:
                        setattr(self, name, copy.deepcopy(getattr(type(self), name, None)))
                for k, v in kw.items():           # extra="allow"
                    setattr(self, k, v)

            def model_dump(self):
                return dict(vars(self))

        m.BaseModel = BaseModel
        m.ConfigDict = lambda **kw: kw
        m.field_validator = lambda *a, **k: (lambda f: f)
        sys.modules["pydantic"] = m
    if _missing("redis") and "app.core.redis_stream" not in sys.modules:
        r = types.ModuleType("redis")
        r.from_url = lambda *a, **k: None
        r.exceptions = types.SimpleNamespace(ResponseError=Exception)
        sys.modules["redis"] = r
    if _missing("psycopg2"):
        sys.modules["psycopg2"] = types.ModuleType("psycopg2")
    if _missing("sentence_transformers"):
        st = types.ModuleType("sentence_transformers")
        st.SentenceTransformer = lambda *a, **k: types.SimpleNamespace(encode=lambda *a, **k: types.SimpleNamespace(tolist=lambda: [0.0] * 384))
        sys.modules["sentence_transformers"] = st