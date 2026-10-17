import hashlib
import json
import os
import numpy as np

from app.core.embeddings import model_name
from app.services.features import FEATURE_NAMES, build_resume_side, compute_features
from app.services.rules import normalize_level
from training.fairness import assert_fair_features, sanitise_resume


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


def _digest(obj) -> str:
    return hashlib.md5(json.dumps(obj, sort_keys=True).encode()).hexdigest()


def row_keys(r):
    """(role key, resume key) - identical content gives identical keys, whatever the ids say."""
    return _digest(r["role"]), _digest(r["resume"])


def gold_keys(gold_path):
    """Role and resume fingerprints of the gold set (empty sets when the file does not exist)."""
    roles, resumes = set(), set()
    if gold_path and os.path.exists(gold_path):
        for r in load_rows(gold_path):
            rk, sk = row_keys(r)
            roles.add(rk)
            resumes.add(sk)
    return roles, resumes


def drop_gold_overlap(rows, gold_path):
    """Training/eval-split data must never share a role or a resume with the gold set. -> (clean rows, dropped count)."""
    roles, resumes = gold_keys(gold_path)
    clean = [r for r in rows if row_keys(r)[0] not in roles and row_keys(r)[1] not in resumes]
    return clean, len(rows) - len(clean)


def build_matrix(rows, cache_dir="training/data/.cache", verbose=True):
    """-> dict(X, y, groups, splits, weights, kinds, exp, min_exp, level). Cached per (embedder, feature list, data). + naya line Resumes are sanitised first (no protected keys, no institution), see training/fairness.py."""
    assert_fair_features(FEATURE_NAMES)
    os.makedirs(cache_dir, exist_ok=True)
    key = hashlib.md5(("v4-fair-level|" + model_name() + "|" + ",".join(FEATURE_NAMES) + "|" + _fingerprint(rows)).encode()).hexdigest()[:16]
    path = os.path.join(cache_dir, f"features-{key}.npz")
    if os.path.exists(path):
        z = np.load(path, allow_pickle=True)
        if verbose:
            print(f"[features] loaded cache {path}")
        return {k: z[k] for k in z.files}

    X, y, groups, splits, kinds, exp, min_exp, weights, level = [], [], [], [], [], [], [], [], []
    side_cache = {}
    for i, r in enumerate(rows):
        resume = sanitise_resume(r["resume"])
        rk = json.dumps(resume, sort_keys=True)
        if rk not in side_cache:
            if len(side_cache) > 500:
                side_cache.clear()
            side_cache[rk] = build_resume_side(resume)
        res = compute_features(resume, r["role"]["title"], r["role"]["requirements"], side=side_cache[rk])
        X.append(res.vector())
        y.append(int(r["label"]))
        groups.append(r["group"])
        splits.append(r.get("split_group", r["group"]))   # what the train/test split keeps together (real data: the RESUME)
        weights.append(float(r.get("weight", 1.0)))
        level.append(normalize_level(r["role"]["requirements"]))     # the experience gate is off for fresher / any roles
        kinds.append(r.get("kind", r.get("_src", "?")))
        exp.append(res.detail["experienceYears"] or 0.0)
        min_exp.append(res.detail["minExperienceYears"] or 0.0)
        if verbose and (i + 1) % 500 == 0:
            print(f"[features] {i + 1}/{len(rows)}")
    out = dict(X=np.array(X, dtype=np.float64), y=np.array(y), groups=np.array(groups), splits=np.array(splits), weights=np.array(weights), kinds=np.array(kinds),
           exp=np.array(exp), min_exp=np.array(min_exp), level=np.array(level)))
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


def _in_test(key: str, frac: float, seed: int) -> bool:
    return int(hashlib.md5(f"{seed}|{key}".encode()).hexdigest(), 16) % 10000 < frac * 10000


def split_disjoint(role_groups, resume_groups, test_frac=0.2, seed=7):
    """Role-wise AND resume-wise split. A pair is TEST only if its role and its resume are both test; TRAIN only if both
    are train; pairs that mix the two sides are left out of both, so no role and no resume is ever seen on both sides.
    The side of a key depends only on (seed, key): stable when data is added, independent of row order.
    -> (train_mask, test_mask)"""
    role_test = np.array([_in_test(g, test_frac, seed) for g in np.asarray(role_groups).tolist()])
    res_test = np.array([_in_test(g, test_frac, seed) for g in np.asarray(resume_groups).tolist()])
    return ~role_test & ~res_test, role_test & res_test


def holdout_split(M, test_frac=0.2, seed=7):
    """The ONE split used by train.py and evaluate.py (M from build_matrix: groups = role, splits = resume)."""
    return split_disjoint(M["groups"], M["splits"], test_frac, seed)


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


def ranking_metrics(y_true, y_prob, groups, k=5):
    """The product RANKS candidates per role, so per-role ranking quality matters as much as accuracy.
    -> mean precision@k, NDCG@k and MRR over roles that have at least one eligible candidate."""
    y_true, y_prob, groups = np.asarray(y_true), np.asarray(y_prob), np.asarray(groups)
    prec, ndcg, mrr = [], [], []
    for g in np.unique(groups):
        idx = np.where(groups == g)[0]
        yt = y_true[idx]
        if yt.sum() == 0 or len(idx) < 2:
            continue
        order = np.argsort(-y_prob[idx], kind="stable")
        ranked = yt[order]
        top = ranked[:k]
        prec.append(top.mean())
        dcg = float(sum(r / np.log2(i + 2) for i, r in enumerate(top)))
        ideal = np.sort(yt)[::-1][:k]
        idcg = float(sum(r / np.log2(i + 2) for i, r in enumerate(ideal)))
        ndcg.append(dcg / idcg if idcg else 0.0)
        hit = np.where(ranked == 1)[0]
        mrr.append(1.0 / (hit[0] + 1) if len(hit) else 0.0)
    f = lambda a: round(float(np.mean(a)), 4) if a else None
    return {"roles": len(prec), f"precision@{k}": f(prec), f"ndcg@{k}": f(ndcg), "mrr": f(mrr)}


def calibration_error(y_true, y_prob, bins=10):
    """Expected calibration error: when the model says 70%, is ~70% of the time the candidate really a fit?"""
    y_true, y_prob = np.asarray(y_true, dtype=float), np.asarray(y_prob, dtype=float)
    edges = np.linspace(0, 1, bins + 1)
    ece = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (y_prob >= lo) & ((y_prob < hi) | (hi == 1.0))
        if m.any():
            ece += m.mean() * abs(y_true[m].mean() - y_prob[m].mean())
    return round(float(ece), 4)