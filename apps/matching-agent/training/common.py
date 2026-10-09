import hashlib
import json
import os
import numpy as np

from app.core.embeddings import model_name
from app.services.features import FEATURE_NAMES, build_resume_side, compute_features


def load_rows(*paths):
    rows = []
    for p in paths:
        with open(p, "r", encoding="utf-8") as f:
            for i, line in enumerate(f):
                line = line.strip()
                if line:
                    r = json.loads(line)
                    r["_src"] = os.path.basename(p)
                    r.setdefault("group", f"{os.path.basename(p)}-{i}")
                    rows.append(r)
    return rows


def _fingerprint(rows) -> str:
    h = hashlib.md5()
    for r in rows:
        h.update(json.dumps([r["role"], r["resume"], r["label"]], sort_keys=True).encode())
    return h.hexdigest()


def build_matrix(rows, cache_dir="training/data/.cache", verbose=True):
    """-> dict(X, y, groups, kinds, exp, min_exp). Cached per (embedder, feature list, data)."""
    os.makedirs(cache_dir, exist_ok=True)
    key = hashlib.md5((model_name() + "|" + ",".join(FEATURE_NAMES) + "|" + _fingerprint(rows)).encode()).hexdigest()[:16]
    path = os.path.join(cache_dir, f"features-{key}.npz")
    if os.path.exists(path):
        z = np.load(path, allow_pickle=True)
        if verbose:
            print(f"[features] loaded cache {path}")
        return {k: z[k] for k in z.files}

    X, y, groups, kinds, exp, min_exp = [], [], [], [], [], []
    side_cache = {}
    for i, r in enumerate(rows):
        rk = json.dumps(r["resume"], sort_keys=True)
        if rk not in side_cache:
            if len(side_cache) > 500:
                side_cache.clear()
            side_cache[rk] = build_resume_side(r["resume"])
        res = compute_features(r["resume"], r["role"]["title"], r["role"]["requirements"], side=side_cache[rk])
        X.append(res.vector())
        y.append(int(r["label"]))
        groups.append(r["group"])
        kinds.append(r.get("kind", r.get("_src", "?")))
        exp.append(res.detail["experienceYears"] or 0.0)
        min_exp.append(res.detail["minExperienceYears"] or 0.0)
        if verbose and (i + 1) % 500 == 0:
            print(f"[features] {i + 1}/{len(rows)}")
    out = dict(X=np.array(X, dtype=np.float64), y=np.array(y), groups=np.array(groups), kinds=np.array(kinds),
               exp=np.array(exp), min_exp=np.array(min_exp))
    np.savez(path, **out)
    return out


def split_by_group(groups, test_frac=0.2, seed=7):
    """Deterministic group split: ALL pairs of one role land on the same side (no leakage)."""
    uniq = sorted(set(groups.tolist()))
    rng = np.random.RandomState(seed)
    rng.shuffle(uniq)
    test_groups = set(uniq[: max(1, int(len(uniq) * test_frac))])
    is_test = np.array([g in test_groups for g in groups.tolist()])
    return ~is_test, is_test


def metrics(y_true, y_pred, y_prob=None) -> dict:
    y_true, y_pred = np.asarray(y_true), np.asarray(y_pred)
    tp = int(((y_pred == 1) & (y_true == 1)).sum())
    fp = int(((y_pred == 1) & (y_true == 0)).sum())
    fn = int(((y_pred == 0) & (y_true == 1)).sum())
    tn = int(((y_pred == 0) & (y_true == 0)).sum())
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    out = {"n": int(len(y_true)), "accuracy": round((tp + tn) / max(len(y_true), 1), 4), "precision": round(prec, 4),
           "recall": round(rec, 4), "f1": round(f1, 4), "tp": tp, "fp": fp, "fn": fn, "tn": tn}
    if y_prob is not None and len(set(y_true.tolist())) == 2:
        from sklearn.metrics import roc_auc_score
        out["roc_auc"] = round(float(roc_auc_score(y_true, y_prob)), 4)
    return out


def best_threshold(y_true, y_prob, beta=1.0):
    """Threshold maximising F-beta (beta<1 favours precision: fewer wrong 'eligible' calls)."""
    best_t, best = 0.5, -1.0
    for t in np.linspace(0.05, 0.95, 91):
        pred = (y_prob >= t).astype(int)
        tp = ((pred == 1) & (y_true == 1)).sum()
        fp = ((pred == 1) & (y_true == 0)).sum()
        fn = ((pred == 0) & (y_true == 1)).sum()
        p = tp / (tp + fp) if tp + fp else 0.0
        r = tp / (tp + fn) if tp + fn else 0.0
        f = (1 + beta ** 2) * p * r / (beta ** 2 * p + r) if (beta ** 2 * p + r) else 0.0
        if f > best:
            best, best_t = f, float(t)
    return round(best_t, 3), round(float(best), 4)