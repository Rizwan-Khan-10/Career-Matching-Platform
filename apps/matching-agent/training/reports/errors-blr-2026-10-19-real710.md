# Gold-set errors of `blr-2026-10-19-real710`

embedder `all-MiniLM-L6-v2`, 27 errors on 200 pairs

## false negative: Machine Learning Engineer <- Senior ML Engineer (gold-F7 / gold-d24)
- probability 0.395 (threshold 0.41), gates: none
- features: req_cov=0.38, req_exact=0.2, global_sim=0.634, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: machine learning [evidence: project/experience text 0.3613]; scikit-learn [none: None 0.3872]; pandas [none: None 0.3419]; numpy [none: None 0.3761]
- hint: model: features look reasonable, needs better data/features

## false positive: Go Backend Developer <- Senior Java Developer (gold-E10 / gold-d01)
- probability 0.443 (threshold 0.41), gates: none
- features: req_cov=0.517, req_exact=0.5, global_sim=0.716, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: go [semantic: java 0.4864]; grpc [none: None 0.2462]; rest api [none: None 0.3138]
- hint: gate missing: clear gap in required skills or experience

## false positive: Full Stack Developer <- Senior Java Developer (gold-E4 / gold-d01)
- probability 0.419 (threshold 0.41), gates: none
- features: req_cov=0.4, req_exact=0.4, global_sim=0.631, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: react [none: None 0.0927]; node.js [none: None 0.3187]; typescript [none: None 0.4065]
- hint: gate missing: clear gap in required skills or experience

## false positive: Data Engineer <- Senior Java Developer (gold-E6 / gold-d01)
- probability 0.456 (threshold 0.41), gates: none
- features: req_cov=0.495, req_exact=0.333, global_sim=0.58, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: python [semantic: java 0.5779]; sql [semantic: postgresql 0.6614]; apache spark [none: None 0.292]; airflow [none: None 0.1901]
- hint: gate missing: clear gap in required skills or experience

## false positive: Java Backend Developer <- Python Backend Developer (Fresher) (gold-F1 / gold-c03)
- probability 0.801 (threshold 0.41), gates: none
- features: req_cov=0.653, req_exact=0.4, global_sim=0.653, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: java [semantic: python 0.5779]; spring boot [none: None 0.2635]; sql [evidence: project/experience text 0.3551]
- hint: model: features look reasonable, needs better data/features

## false positive: Java Backend Developer <- .NET Developer (Fresher) (gold-F1 / gold-c16)
- probability 0.721 (threshold 0.41), gates: none
- features: req_cov=0.603, req_exact=0.4, global_sim=0.588, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: java [semantic: c# 0.4905]; spring boot [none: None 0.2868]; sql [evidence: project/experience text 0.217]
- hint: model: features look reasonable, needs better data/features

## false positive: Python Backend Developer <- Java Backend Developer (Fresher) (gold-F2 / gold-c01)
- probability 0.73 (threshold 0.41), gates: none
- features: req_cov=0.638, req_exact=0.4, global_sim=0.633, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: python [semantic: java 0.5779]; django [none: None 0.2004]; sql [semantic: mysql 0.7378]
- hint: model: features look reasonable, needs better data/features

## false positive: Python Backend Developer <- Full Stack Developer (Fresher) (gold-F2 / gold-c20)
- probability 0.722 (threshold 0.41), gates: none
- features: req_cov=0.638, req_exact=0.4, global_sim=0.633, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: python [semantic: java 0.5779]; django [none: None 0.2177]; sql [semantic: mysql 0.7378]
- hint: model: features look reasonable, needs better data/features

## false positive: Frontend Developer <- Web Design Student (gold-F3 / gold-c07)
- probability 0.426 (threshold 0.41), gates: none
- features: req_cov=0.58, req_exact=0.4, global_sim=0.659, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: javascript [semantic: basic javascript 0.7644]; react [none: None 0.3144]; git [none: None 0.0498]
- hint: gate missing: clear gap in required skills or experience

## false positive: Frontend Developer <- Full Stack Developer (Fresher) (gold-F3 / gold-c20)
- probability 0.714 (threshold 0.41), gates: none
- features: req_cov=0.48, req_exact=0.4, global_sim=0.715, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: javascript [semantic: java 0.5894]; html [none: None 0.2209]; css [none: None 0.228]
- hint: gate missing: clear gap in required skills or experience

## false positive: Full Stack Developer <- Full Stack Developer (Fresher) (gold-F4 / gold-c20)
- probability 0.847 (threshold 0.41), gates: none
- features: req_cov=0.696, req_exact=0.6, global_sim=0.782, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: javascript [semantic: java 0.5894]; node.js [evidence: project/experience text 0.3228]
- hint: model: features look reasonable, needs better data/features

## false positive: Full Stack Developer <- Frontend Developer (Fresher) (gold-F4 / gold-c06)
- probability 0.805 (threshold 0.41), gates: none
- features: req_cov=0.827, req_exact=0.6, global_sim=0.729, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: node.js [semantic: javascript 0.5315]; rest api [evidence: project/experience text 0.425]
- hint: model: features look reasonable, needs better data/features

## false positive: Full Stack Developer <- Senior Frontend Engineer (gold-F4 / gold-d21)
- probability 0.452 (threshold 0.41), gates: none
- features: req_cov=0.373, req_exact=0.2, global_sim=0.741, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: javascript [semantic: typescript 0.6206]; node.js [evidence: project/experience text 0.4051]; rest api [none: None 0.1983]; git [none: None 0.1456]
- hint: gate missing: clear gap in required skills or experience

## false positive: Full Stack Developer <- Java Backend Developer (Fresher) (gold-F4 / gold-c01)
- probability 0.698 (threshold 0.41), gates: none
- features: req_cov=0.48, req_exact=0.4, global_sim=0.653, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: javascript [semantic: java 0.5894]; react [none: None 0.1553]; node.js [none: None 0.3187]
- hint: gate missing: clear gap in required skills or experience

## false positive: Full Stack Developer <- Python Backend Developer (Fresher) (gold-F4 / gold-c03)
- probability 0.663 (threshold 0.41), gates: none
- features: req_cov=0.4, req_exact=0.4, global_sim=0.64, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: javascript [none: None 0.4369]; react [none: None 0.126]; node.js [none: None 0.2663]
- hint: gate missing: clear gap in required skills or experience

## false positive: Full Stack Developer <- .NET Developer (Fresher) (gold-F4 / gold-c16)
- probability 0.619 (threshold 0.41), gates: none
- features: req_cov=0.4, req_exact=0.4, global_sim=0.645, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: javascript [none: None 0.4085]; react [none: None 0.1085]; node.js [none: None 0.2108]
- hint: gate missing: clear gap in required skills or experience

## false positive: Android Developer <- Full Stack Developer (Fresher) (gold-F5 / gold-c20)
- probability 0.743 (threshold 0.41), gates: none
- features: req_cov=0.602, req_exact=0.5, global_sim=0.609, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: android sdk [none: None 0.2502]; kotlin [semantic: java 0.5927]
- hint: model: features look reasonable, needs better data/features

## false positive: Android Developer <- MERN Stack Developer (Fresher) (gold-F5 / gold-c08)
- probability 0.595 (threshold 0.41), gates: none
- features: req_cov=0.5, req_exact=0.5, global_sim=0.554, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: android sdk [none: None 0.2275]; kotlin [none: None 0.3994]
- hint: gate missing: clear gap in required skills or experience

## false positive: Android Developer <- Frontend Developer (Fresher) (gold-F5 / gold-c06)
- probability 0.64 (threshold 0.41), gates: none
- features: req_cov=0.475, req_exact=0.25, global_sim=0.534, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: android sdk [none: None 0.1363]; kotlin [none: None 0.3994]; rest api [evidence: project/experience text 0.425]
- hint: gate missing: clear gap in required skills or experience

## false positive: Android Developer <- Java Backend Developer (Fresher) (gold-F5 / gold-c01)
- probability 0.75 (threshold 0.41), gates: none
- features: req_cov=0.602, req_exact=0.5, global_sim=0.588, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: android sdk [none: None 0.2502]; kotlin [semantic: java 0.5927]
- hint: model: features look reasonable, needs better data/features

## false positive: Android Developer <- .NET Developer (Fresher) (gold-F5 / gold-c16)
- probability 0.631 (threshold 0.41), gates: none
- features: req_cov=0.5, req_exact=0.5, global_sim=0.515, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: android sdk [none: None 0.2275]; kotlin [none: None 0.2889]
- hint: gate missing: clear gap in required skills or experience

## false positive: Data Analyst <- Data Entry Executive (gold-F6 / gold-c12)
- probability 0.459 (threshold 0.41), gates: none
- features: req_cov=0.409, req_exact=0.25, global_sim=0.639, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: sql [semantic: basic sql 0.6719]; python [none: None 0.258]; data visualization [none: None 0.418]
- hint: gate missing: clear gap in required skills or experience

## false positive: Data Analyst <- Python Backend Developer (Fresher) (gold-F6 / gold-c03)
- probability 0.669 (threshold 0.41), gates: none
- features: req_cov=0.475, req_exact=0.25, global_sim=0.428, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: sql [evidence: project/experience text 0.3551]; excel [none: None 0.1455]; data visualization [none: None 0.2276]
- hint: gate missing: clear gap in required skills or experience

## false positive: DevOps Engineer <- Python Backend Developer (Fresher) (gold-F8 / gold-c03)
- probability 0.557 (threshold 0.41), gates: none
- features: req_cov=0.4, req_exact=0.4, global_sim=0.512, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: linux [none: None 0.2271]; ci cd [none: None 0.1261]; amazon web services [none: None 0.3118]
- hint: gate missing: clear gap in required skills or experience

## false positive: DevOps Engineer <- Java Backend Developer (Fresher) (gold-F8 / gold-c01)
- probability 0.649 (threshold 0.41), gates: none
- features: req_cov=0.4, req_exact=0.4, global_sim=0.519, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: linux [none: None 0.2918]; ci cd [none: None 0.1335]; amazon web services [none: None 0.3118]
- hint: gate missing: clear gap in required skills or experience

## false positive: QA Automation Engineer <- Java Backend Developer (Fresher) (gold-F9 / gold-c01)
- probability 0.672 (threshold 0.41), gates: none
- features: req_cov=0.564, req_exact=0.4, global_sim=0.507, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: selenium [none: None 0.1938]; testng [none: None 0.2148]; sql [semantic: mysql 0.7378]
- hint: gate missing: clear gap in required skills or experience

## false positive: QA Automation Engineer <- Python Backend Developer (Fresher) (gold-F9 / gold-c03)
- probability 0.645 (threshold 0.41), gates: none
- features: req_cov=0.453, req_exact=0.2, global_sim=0.491, exp_score=1.0, edu_score=1.0
- required skills not matched exactly: selenium [none: None 0.2296]; java [semantic: python 0.5779]; testng [none: None 0.1335]; sql [evidence: project/experience text 0.3551]
- hint: gate missing: clear gap in required skills or experience

