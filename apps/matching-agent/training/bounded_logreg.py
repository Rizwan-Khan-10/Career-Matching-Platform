"""Logistic regression with SIGN CONSTRAINTS (scipy L-BFGS-B), so the scorer stays sane and explainable.

Plain sklearn LogisticRegression happily learns things like  global_sim: -2.47, req_exact: -1.59,
has_req_skills: -10.2 - an artefact of correlated features and of a constant column
in the training data. Here every "more of this is good" feature is forced to have weight >= 0, and columns
that never vary in the training data get weight 0 (they are constants -> the bias already covers them).
"""
import numpy as np
from scipy.optimize import minimize


def fit(X, y, sample_weight=None, C=1.0, nonneg=None):
    """-> (coef_raw[d], bias_raw). nonneg: bool mask (len d) of features whose weight must be >= 0."""
    X = np.asarray(X, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    n, d = X.shape
    w = np.ones(n) if sample_weight is None else np.asarray(sample_weight, dtype=np.float64)
    nonneg = np.zeros(d, dtype=bool) if nonneg is None else np.asarray(nonneg, dtype=bool)

    mu, sd = X.mean(axis=0), X.std(axis=0)
    const = sd < 1e-9
    sd[const] = 1.0
    Z = (X - mu) / sd
    l2 = 1.0 / C

    def objective(theta):
        coef, b = theta[:d], theta[d]
        z = Z @ coef + b
        loss = float((w * (np.logaddexp(0.0, z) - y * z)).sum() + 0.5 * l2 * float(coef @ coef))
        p = 1.0 / (1.0 + np.exp(-np.clip(z, -35, 35)))
        r = w * (p - y)
        grad = np.concatenate([Z.T @ r + l2 * coef, [r.sum()]])
        return loss, grad

    bounds = [((0.0, 0.0) if const[j] else ((0.0, None) if nonneg[j] else (None, None))) for j in range(d)] + [(None, None)]
    res = minimize(objective, np.zeros(d + 1), jac=True, method="L-BFGS-B", bounds=bounds, options={"maxiter": 2000})
    coef_std, b_std = res.x[:d], res.x[d]
    coef = coef_std / sd
    bias = b_std - float((coef_std * mu / sd).sum())
    coef[const] = 0.0
    bias = float(bias + (coef_std[const] * mu[const] / sd[const]).sum()) if const.any() else bias
    return coef, float(bias)


def predict_proba(X, coef, bias):
    z = np.asarray(X, dtype=np.float64) @ coef + bias
    return 1.0 / (1.0 + np.exp(-np.clip(z, -35, 35)))