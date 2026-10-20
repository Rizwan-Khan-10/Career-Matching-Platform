# Gold-set errors of `blr-2026-10-20-real2069`

embedder `all-MiniLM-L6-v2`, 24 errors on 200 pairs

## false negative: Senior Java Backend Developer <- Java Backend Engineer (gold-E1 / gold-d19)
- probability 0.362 (threshold 0.4), gates: none
- features: req_cov=1.0, req_exact=1.0, global_sim=0.788, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: none
- hint: model: features look reasonable, needs better data/features

## false negative: Go Backend Developer <- Go Developer (gold-E10 / gold-d26)
- probability 0.334 (threshold 0.4), gates: none
- features: req_cov=1.0, req_exact=1.0, global_sim=0.789, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: none
- hint: model: features look reasonable, needs better data/features

## false negative: Python Backend Developer <- Django Developer (gold-E2 / gold-d04)
- probability 0.338 (threshold 0.4), gates: none
- features: req_cov=0.874, req_exact=0.667, global_sim=0.739, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: fastapi [evidence: project/experience text 0.4256]; postgresql [semantic: mysql 0.7274]
- hint: alias candidate: postgresql ~ mysql (0.73)

## false negative: Senior Frontend Developer <- Full Stack Engineer (gold-E3 / gold-d07)
- probability 0.257 (threshold 0.4), gates: none
- features: req_cov=1.0, req_exact=1.0, global_sim=0.751, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: none
- hint: model: features look reasonable, needs better data/features

## false negative: Java Backend Developer <- Java Developer (gold-F1 / gold-d02)
- probability 0.349 (threshold 0.4), gates: none
- features: req_cov=0.764, req_exact=0.6, global_sim=0.807, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: sql [semantic: mysql 0.7378]; git [none: None 0.1743]
- hint: alias candidate: sql ~ mysql (0.74)

## false negative: Java Backend Developer <- Senior Java Developer (gold-F1 / gold-d01)
- probability 0.289 (threshold 0.4), gates: none
- features: req_cov=0.521, req_exact=0.4, global_sim=0.719, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: sql [semantic: postgresql 0.6614]; rest api [none: None 0.3138]; git [none: None 0.1743]
- hint: alias candidate: sql ~ postgresql (0.66)

## false negative: Python Backend Developer <- Python API Developer (Fresher) (gold-F2 / gold-c04)
- probability 0.346 (threshold 0.4), gates: none
- features: req_cov=0.871, req_exact=0.8, global_sim=0.764, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: django [semantic: fastapi 0.5736]
- hint: model: features look reasonable, needs better data/features

## false negative: Python Backend Developer <- Django Developer (gold-F2 / gold-d04)
- probability 0.353 (threshold 0.4), gates: none
- features: req_cov=0.764, req_exact=0.6, global_sim=0.793, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: sql [semantic: mysql 0.7378]; git [none: None 0.1743]
- hint: alias candidate: sql ~ mysql (0.74)

## false negative: Python Backend Developer <- Senior Python Developer (gold-F2 / gold-d20)
- probability 0.294 (threshold 0.4), gates: none
- features: req_cov=0.521, req_exact=0.4, global_sim=0.823, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: sql [semantic: postgresql 0.6614]; rest api [none: None 0.3118]; git [none: None 0.1743]
- hint: alias candidate: sql ~ postgresql (0.66)

## false negative: Frontend Developer <- Senior Frontend Engineer (gold-F3 / gold-d21)
- probability 0.269 (threshold 0.4), gates: none
- features: req_cov=0.697, req_exact=0.6, global_sim=0.82, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: javascript [semantic: typescript 0.6206]; git [none: None 0.1456]
- hint: alias candidate: javascript ~ typescript (0.62)

## false negative: Full Stack Developer <- Full Stack Engineer (gold-F4 / gold-d07)
- probability 0.324 (threshold 0.4), gates: none
- features: req_cov=0.497, req_exact=0.4, global_sim=0.796, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: javascript [semantic: typescript 0.6206]; rest api [none: None 0.3118]; git [none: None 0.1743]
- hint: alias candidate: javascript ~ typescript (0.62)

## false negative: Full Stack Developer <- Full Stack Engineer (gold-F4 / gold-d28)
- probability 0.351 (threshold 0.4), gates: none
- features: req_cov=0.697, req_exact=0.6, global_sim=0.809, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: javascript [semantic: typescript 0.6206]; git [none: None 0.1743]
- hint: alias candidate: javascript ~ typescript (0.62)

## false negative: Data Analyst <- Data Science Fresher (gold-F6 / gold-c05)
- probability 0.298 (threshold 0.4), gates: none
- features: req_cov=0.788, req_exact=0.75, global_sim=0.493, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: data visualization [evidence: project/experience text 0.3419]
- hint: model: features look reasonable, needs better data/features

## false negative: Machine Learning Engineer <- Data Science Fresher (gold-F7 / gold-c05)
- probability 0.253 (threshold 0.4), gates: none
- features: req_cov=0.802, req_exact=0.8, global_sim=0.613, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: machine learning [evidence: project/experience text 0.3031]
- hint: model: features look reasonable, needs better data/features

## false negative: Machine Learning Engineer <- Machine Learning Engineer (gold-F7 / gold-d11)
- probability 0.337 (threshold 0.4), gates: none
- features: req_cov=0.38, req_exact=0.2, global_sim=0.713, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: machine learning [evidence: project/experience text 0.2902]; scikit-learn [none: None 0.3872]; pandas [none: None 0.3419]; numpy [none: None 0.3761]
- hint: model: features look reasonable, needs better data/features

## false negative: Machine Learning Engineer <- Senior ML Engineer (gold-F7 / gold-d24)
- probability 0.254 (threshold 0.4), gates: none
- features: req_cov=0.38, req_exact=0.2, global_sim=0.634, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: machine learning [evidence: project/experience text 0.3613]; scikit-learn [none: None 0.3872]; pandas [none: None 0.3419]; numpy [none: None 0.3761]
- hint: model: features look reasonable, needs better data/features

## false positive: Full Stack Developer <- Senior Java Developer (gold-E4 / gold-d01)
- probability 0.405 (threshold 0.4), gates: none
- features: req_cov=0.4, req_exact=0.4, global_sim=0.631, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: react [none: None 0.0927]; node.js [none: None 0.3187]; typescript [none: None 0.4065]
- hint: gate missing: clear gap in required skills or experience

## false positive: Data Engineer <- Senior Java Developer (gold-E6 / gold-d01)
- probability 0.426 (threshold 0.4), gates: none
- features: req_cov=0.495, req_exact=0.333, global_sim=0.58, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: python [semantic: java 0.5779]; sql [semantic: postgresql 0.6614]; apache spark [none: None 0.292]; airflow [none: None 0.1901]
- hint: gate missing: clear gap in required skills or experience

## false positive: Java Backend Developer <- Python Backend Developer (Fresher) (gold-F1 / gold-c03)
- probability 0.408 (threshold 0.4), gates: none
- features: req_cov=0.653, req_exact=0.4, global_sim=0.653, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: java [semantic: python 0.5779]; spring boot [none: None 0.2635]; sql [evidence: project/experience text 0.3551]
- hint: model: features look reasonable, needs better data/features

## false positive: Python Backend Developer <- Java Backend Developer (Fresher) (gold-F2 / gold-c01)
- probability 0.401 (threshold 0.4), gates: none
- features: req_cov=0.638, req_exact=0.4, global_sim=0.633, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: python [semantic: java 0.5779]; django [none: None 0.2004]; sql [semantic: mysql 0.7378]
- hint: model: features look reasonable, needs better data/features

## false positive: Frontend Developer <- Full Stack Developer (Fresher) (gold-F3 / gold-c20)
- probability 0.418 (threshold 0.4), gates: none
- features: req_cov=0.48, req_exact=0.4, global_sim=0.715, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: javascript [semantic: java 0.5894]; html [none: None 0.2209]; css [none: None 0.228]
- hint: gate missing: clear gap in required skills or experience

## false positive: Full Stack Developer <- Full Stack Developer (Fresher) (gold-F4 / gold-c20)
- probability 0.549 (threshold 0.4), gates: none
- features: req_cov=0.696, req_exact=0.6, global_sim=0.782, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: javascript [semantic: java 0.5894]; node.js [evidence: project/experience text 0.3228]
- hint: model: features look reasonable, needs better data/features

## false positive: Full Stack Developer <- Frontend Developer (Fresher) (gold-F4 / gold-c06)
- probability 0.436 (threshold 0.4), gates: none
- features: req_cov=0.827, req_exact=0.6, global_sim=0.729, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: node.js [semantic: javascript 0.5315]; rest api [evidence: project/experience text 0.425]
- hint: model: features look reasonable, needs better data/features

## false positive: Android Developer <- Java Backend Developer (Fresher) (gold-F5 / gold-c01)
- probability 0.424 (threshold 0.4), gates: none
- features: req_cov=0.602, req_exact=0.5, global_sim=0.588, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: android sdk [none: None 0.2502]; kotlin [semantic: java 0.5927]
- hint: model: features look reasonable, needs better data/features

