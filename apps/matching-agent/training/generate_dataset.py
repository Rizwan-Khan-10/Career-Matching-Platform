"""Builds a labelled (resume, role) dataset.

    python -m training.generate_dataset --roles 500 --out training/data/dataset.jsonl

LABELS come from a hidden concept-level ground truth (see skill_taxonomy.py):
  credit(required concept) = 1.0 if the resume has it (skill list OR project/experience text)
                             0.5 if the resume has a close substitute (RELATED)
                             0.0 otherwise
  eligible  <=>  mean credit >= 0.75  AND  experience >= min_exp - 0.5  AND  education level ok
(+ 3% label noise so the model can't overfit to a perfectly clean rule)

The model never sees concepts, only the surface strings -> it must use semantic similarity.

THIS IS A BOOTSTRAP. Real recruiter decisions are better: append them as extra jsonl lines in the same
format (see README) and retrain with `--extra`.
"""
import argparse
import json
import random

from training.skill_taxonomy import (
    CONCEPTS, RELATED_SET, TITLES, EDUCATION, QUALIFICATIONS,
    PROJECT_TEMPLATES, PROJECT_WHAT,
)

DOMAINS = list(TITLES.keys())
BY_DOMAIN = {}
for cid, (dom, _) in CONCEPTS.items():
    BY_DOMAIN.setdefault(dom, []).append(cid)
EXPERIENCE_CHOICES = [0, 0, 0.5, 1, 1, 1.5, 2, 2, 3, 3, 4, 5, 6, 8, 10]


def rsample(rng, pool, k):
    """random.sample that never asks for more items than exist."""
    pool = list(pool)
    return rng.sample(pool, max(0, min(k, len(pool))))


def surface(rng, cid):
    return rng.choice(CONCEPTS[cid][1])


def make_role(rng, rid, domain=None):
    domain = domain or rng.choice(DOMAINS)
    pool = BY_DOMAIN[domain]
    n_req = rng.randint(4, min(8, len(pool)))
    req = rsample(rng, pool, n_req)
    if rng.random() < 0.3:
        req.append(rng.choice(BY_DOMAIN["common"]))
    rest = [c for c in pool if c not in req]
    pref = rsample(rng, rest, min(len(rest), rng.randint(0, 3)))
    qual, qual_level = rng.choice(QUALIFICATIONS)
    min_exp = rng.choice([0, 0, 1, 2, 2, 3, 5])
    return {
        "id": f"role{rid}", "domain": domain,
        "title": rng.choice(TITLES[domain]),
        "requirements": {
            "requiredSkills": [surface(rng, c) for c in req],
            "preferredSkills": [surface(rng, c) for c in pref],
            "minExperienceYears": min_exp if min_exp else None,
            "qualifications": qual or None,
        },
        "_req": req, "_qual_level": qual_level,
    }


def make_resume(rng, concepts, domain, exp=None, edu=None):
    """concepts: set of concept ids the candidate truly has."""
    concepts = list(dict.fromkeys(concepts))
    # some concepts only appear inside project text (evidence-only), the rest in the skill list
    evidence_only = {c for c in concepts if rng.random() < 0.25}
    listed = [c for c in concepts if c not in evidence_only]
    skills = [surface(rng, c) for c in listed]
    projects = []
    carriers = list(evidence_only) + [c for c in listed if rng.random() < 0.4]
    rng.shuffle(carriers)
    for i in range(0, len(carriers), 3):
        chunk = carriers[i:i + 3]
        while len(chunk) < 3:
            chunk.append(chunk[-1])
        a, b, c = (surface(rng, x) for x in chunk)
        what = rng.choice(PROJECT_WHAT.get(domain, PROJECT_WHAT["common"]))
        projects.append({"name": what.title(), "description": rng.choice(PROJECT_TEMPLATES).format(what=what, a=a, b=b, c=c)})
        if len(projects) >= 3:
            break
    exp = rng.choice(EXPERIENCE_CHOICES) if exp is None else exp
    edu_s, edu_lvl = edu or rng.choice(EDUCATION)
    experience = []
    if exp >= 1:
        experience.append({"title": rng.choice(TITLES[domain]), "company": "Acme Pvt Ltd",
                           "description": "Worked on " + rng.choice(PROJECT_WHAT.get(domain, PROJECT_WHAT["common"]))})
    resume = {"skills": skills, "projects": projects, "experience": experience, "experienceYears": exp,
              "education": edu_s, "cgpa": round(rng.uniform(6.0, 9.5), 1)}
    return resume, set(concepts), edu_lvl


def credit(has, concept):
    if concept in has:
        return 1.0
    if any(frozenset((concept, h)) in RELATED_SET for h in has):
        return 0.5
    return 0.0


def label(role, has, exp, edu_lvl, rng, noise=0.03):
    cov = sum(credit(has, c) for c in role["_req"]) / len(role["_req"])
    min_exp = role["requirements"]["minExperienceYears"] or 0
    ok_exp = exp >= min_exp - 0.5
    ok_edu = (not role["_qual_level"]) or edu_lvl >= role["_qual_level"] or edu_lvl == 0
    y = int(cov >= 0.75 and ok_exp and ok_edu)
    if rng.random() < noise:
        y = 1 - y
    return y, cov


def sample_pair(rng, role, kind):
    dom, req = role["domain"], role["_req"]
    min_exp = role["requirements"]["minExperienceYears"] or 0
    other = rng.choice([d for d in DOMAINS if d != dom])
    if kind == "tailored":          # covers (almost) everything, experience ok
        have = set(rsample(rng, req, max(1, int(len(req) * rng.uniform(0.85, 1.0))))) | set(rsample(rng, BY_DOMAIN[dom], rng.randint(0, 4)))
        exp = max(min_exp, 0) + rng.choice([0, 0.5, 1, 2, 4])
    elif kind == "partial":         # covers half-ish
        have = set(rsample(rng, req, max(1, int(len(req) * rng.uniform(0.4, 0.8))))) | set(rsample(rng, BY_DOMAIN[dom], rng.randint(1, 5)))
        exp = max(min_exp, 0) + rng.choice([0, 1, 2])
    elif kind == "same_domain":     # random person of the same domain
        have = set(rsample(rng, BY_DOMAIN[dom], rng.randint(3, min(10, len(BY_DOMAIN[dom])))))
        exp = rng.choice(EXPERIENCE_CHOICES)
    elif kind == "other_domain":
        have = set(rsample(rng, BY_DOMAIN[other], rng.randint(4, min(10, len(BY_DOMAIN[other]))))) | set(rsample(rng, BY_DOMAIN["common"], rng.randint(0, 2)))
        exp = rng.choice(EXPERIENCE_CHOICES)
        dom = other
    else:                           # "junior": right skills, too little experience
        have = set(rsample(rng, req, max(1, int(len(req) * rng.uniform(0.85, 1.0)))))
        exp = max(0, min_exp - rng.choice([1.5, 2, 3])) if min_exp else rng.choice([0, 0.5])
    return make_resume(rng, have, dom if kind != "other_domain" else other, exp=exp), exp


def build(n_roles, per_role, seed):
    rng = random.Random(seed)
    kinds = ["tailored"] * 3 + ["partial"] * 3 + ["same_domain"] * 2 + ["other_domain"] * 2 + ["junior"] * 2
    rows = []
    for rid in range(n_roles):
        role = make_role(rng, rid, DOMAINS[rid % len(DOMAINS)])
        for k in range(per_role):
            kind = kinds[k % len(kinds)]
            (resume, has, edu_lvl), exp = sample_pair(rng, role, kind)
            y, cov = label(role, has, exp, edu_lvl, rng)
            rows.append({
                "group": role["id"], "kind": kind, "label": y, "truth_coverage": round(cov, 3),
                "role": {"title": role["title"], "requirements": role["requirements"]},
                "resume": resume,
            })
    return rows


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--roles", type=int, default=500)
    ap.add_argument("--per-role", type=int, default=12)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default="training/data/dataset.jsonl")
    a = ap.parse_args()
    rows = build(a.roles, a.per_role, a.seed)
    with open(a.out, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    pos = sum(r["label"] for r in rows)
    print(f"wrote {len(rows)} pairs to {a.out}  (eligible={pos}, not eligible={len(rows) - pos})")