"""Expands the hand-labelled tables below into gold_pairs.jsonl (200 pairs = 20 roles x 10 resumes).

    python -m training.gold.build_gold          # rewrites training/gold/gold_pairs.jsonl

The LABELS are the hand-made part (the `LABELS` table). Reviewers: change a 1/0 there, re-run, commit both files.
The set is used ONLY by training/evaluate.py. train.py refuses gold rows and drops any training row that shares a
role or a resume with the gold set.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "gold_pairs.jsonl")

# ------------------------------------------------------------------ roles: id -> (title, level, track, stacks, required, preferred, minExp, qualification)
ROLES = {
    "F1": ("Java Backend Developer", "fresher", "backend", ["java"], ["Java", "Spring Boot", "SQL", "REST API", "Git"], ["Docker", "Hibernate"], 0, "B.Tech"),
    "F2": ("Python Backend Developer", "fresher", "backend", ["python"], ["Python", "Django", "SQL", "REST API", "Git"], ["Docker", "Redis"], 0, "B.Tech"),
    "F3": ("Frontend Developer", "fresher", "frontend", ["javascript"], ["JavaScript", "React", "HTML", "CSS", "Git"], ["TypeScript", "Tailwind CSS"], 0, "B.Tech"),
    "F4": ("Full Stack Developer", "fresher", "fullstack", ["javascript"], ["JavaScript", "React", "Node.js", "REST API", "Git"], ["MongoDB", "TypeScript"], 0, "B.Tech"),
    "F5": ("Android Developer", "fresher", "mobile", ["android"], ["Android SDK", "Kotlin", "REST API", "Git"], ["Jetpack Compose", "Room"], 0, "B.Tech"),
    "F6": ("Data Analyst", "fresher", "data_ml", ["data_analyst"], ["SQL", "Python", "Excel", "Data Visualization"], ["Statistics", "Power BI"], 0, "Bachelor's degree"),
    "F7": ("Machine Learning Engineer", "fresher", "data_ml", ["ml_ai"], ["Python", "Machine Learning", "scikit-learn", "pandas", "NumPy"], ["TensorFlow", "PyTorch"], 0, "B.Tech"),
    "F8": ("DevOps Engineer", "fresher", "devops_cloud", ["general"], ["Linux", "Docker", "Git", "CI/CD", "AWS"], ["Kubernetes", "Terraform"], 0, "B.Tech"),
    "F9": ("QA Automation Engineer", "fresher", "qa", ["automation"], ["Selenium", "Java", "TestNG", "SQL", "Git"], ["Jenkins"], 0, "B.Tech"),
    "F10": (".NET Developer", "fresher", "backend", ["dotnet"], ["C#", ".NET", "ASP.NET Core", "SQL Server", "REST API"], ["Azure"], 0, "B.Tech"),
    "E1": ("Senior Java Backend Developer", "experienced", "backend", ["java"], ["Java", "Spring Boot", "Microservices", "Kafka", "PostgreSQL", "Docker"], ["Kubernetes", "AWS"], 4, "B.Tech"),
    "E2": ("Python Backend Developer", "experienced", "backend", ["python"], ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Celery"], ["AWS"], 3, "B.Tech"),
    "E3": ("Senior Frontend Developer", "experienced", "frontend", ["javascript"], ["React", "TypeScript", "Redux", "Jest", "HTML", "CSS"], ["Next.js"], 4, "B.Tech"),
    "E4": ("Full Stack Developer", "experienced", "fullstack", ["javascript"], ["React", "Node.js", "TypeScript", "PostgreSQL", "Docker"], ["AWS"], 3, "B.Tech"),
    "E5": ("iOS Developer", "experienced", "mobile", ["ios"], ["Swift", "SwiftUI", "UIKit", "Core Data", "REST API"], ["Combine"], 3, "B.Tech"),
    "E6": ("Data Engineer", "experienced", "data_ml", ["data_engineer"], ["Python", "SQL", "Spark", "Airflow", "AWS", "Kafka"], ["dbt"], 3, "B.Tech"),
    "E7": ("ML / AI Engineer", "experienced", "data_ml", ["ml_ai"], ["Python", "PyTorch", "NLP", "MLOps", "Docker", "SQL"], ["LLM", "Kubernetes"], 3, "B.Tech"),
    "E8": ("DevOps / Cloud Engineer", "experienced", "devops_cloud", ["aws"], ["AWS", "Kubernetes", "Terraform", "Docker", "CI/CD", "Linux"], ["Prometheus"], 4, "B.Tech"),
    "E9": ("QA Automation Engineer", "experienced", "qa", ["automation"], ["Selenium", "Java", "TestNG", "REST Assured", "CI/CD", "SQL"], ["JMeter"], 3, "B.Tech"),
    "E10": ("Go Backend Developer", "experienced", "backend", ["go"], ["Go", "gRPC", "PostgreSQL", "Docker", "Kubernetes", "REST API"], ["Kafka"], 3, "B.Tech"),
}

# ------------------------------------------------------------------ resumes: id -> title, skills, years, education, projects, (exp title, exp description)
# No names, photos, institutions or genders anywhere (fairness rule).
RESUMES = {
    "c01": ("Java Backend Developer (Fresher)", "Java,Spring Boot,Hibernate,MySQL,REST API,Git,Docker", 0.5, "B.Tech in Computer Science",
            [("Library Management API", "REST API in Spring Boot with MySQL, JWT auth, packaged with Docker")], ("Java Developer Intern", "Built REST endpoints with Spring Boot and Hibernate")),
    "c02": ("Computer Science Student", "Java,C,HTML,MySQL", 0, "B.Tech in Computer Science",
            [("Console Banking App", "Java console application with file storage")], None),
    "c03": ("Python Backend Developer (Fresher)", "Python,Django,PostgreSQL,REST API,Git,Docker,Redis", 0.5, "B.Tech in Information Technology",
            [("E-commerce Backend", "Django REST API with PostgreSQL and Redis caching")], ("Backend Intern", "Developed Django APIs and wrote SQL queries")),
    "c04": ("Python API Developer (Fresher)", "Python,FastAPI,SQL,Git,REST API,Docker", 0, "B.E in Computer Science",
            [("Task Tracker API", "FastAPI service with SQLite and pytest, containerised with Docker")], None),
    "c05": ("Data Science Fresher", "Python,pandas,NumPy,scikit-learn,SQL,Excel,Matplotlib,Jupyter", 0, "B.Sc in Statistics",
            [("Sales Dashboard", "Cleaned sales data with pandas and SQL and built matplotlib charts"), ("House Price Prediction", "Regression model with scikit-learn")], None),
    "c06": ("Frontend Developer (Fresher)", "JavaScript,React,HTML,CSS,TypeScript,Tailwind CSS,Git", 0.5, "B.Tech in Computer Science",
            [("Portfolio Website", "Responsive React site styled with Tailwind CSS"), ("Weather App", "React app consuming a public REST API")], ("Frontend Intern", "Built React components and fixed CSS bugs")),
    "c07": ("Web Design Student", "HTML,CSS,jQuery,Bootstrap,basic JavaScript", 0, "BCA",
            [("College Event Page", "Static HTML/CSS page using Bootstrap")], None),
    "c08": ("MERN Stack Developer (Fresher)", "JavaScript,React,Node.js,Express,MongoDB,REST API,HTML,CSS,Git", 0.5, "B.Tech in Computer Science",
            [("Chat Application", "Real-time chat with React, Node.js, Express and MongoDB"), ("Job Board", "MERN job listing site with auth")], ("Web Developer Intern", "Built React pages and Express APIs")),
    "c09": ("Android Developer (Fresher)", "Kotlin,Android SDK,Jetpack Compose,Room,REST API,Git,Firebase", 0.5, "B.Tech in Computer Science",
            [("Expense Tracker", "Kotlin app with Jetpack Compose and Room database"), ("News Reader", "Android app consuming a REST API with Retrofit")], ("Android Intern", "Developed screens in Kotlin and fixed crashes")),
    "c10": ("Android Developer (Fresher)", "Java,Kotlin,Android Studio,Android SDK,XML,SQLite,Firebase,REST API,Git", 0, "B.E in Computer Science",
            [("Quiz App", "Android quiz app in Java with SQLite and Firebase"), ("Notes App", "Notes app with a small Kotlin module")], None),
    "c11": ("Data Analyst (Fresher)", "SQL,Excel,Power BI,Python,Tableau,Statistics,Data Visualization", 0.5, "B.Com with Data Analytics certificate",
            [("Retail Sales Analysis", "SQL queries and a Power BI dashboard for sales trends")], ("Data Analyst Intern", "Prepared Excel reports and Power BI dashboards")),
    "c12": ("Data Entry Executive", "Excel,Word,Tally,data entry,basic SQL", 1, "B.Com",
            [], ("Data Entry Operator", "Entered and verified records in Excel and Tally")),
    "c13": ("DevOps Engineer (Fresher)", "Linux,Docker,Git,Jenkins,AWS,Bash,GitHub Actions,Terraform,CI/CD", 0.5, "B.Tech in Computer Science",
            [("CI/CD Pipeline", "GitHub Actions pipeline building Docker images and deploying to AWS EC2")], ("DevOps Intern", "Automated deployments with Jenkins and Bash")),
    "c14": ("QA Automation Engineer (Fresher)", "Selenium,Java,TestNG,SQL,Git,Postman,Jenkins", 0.5, "B.Tech in Information Technology",
            [("Test Framework", "Selenium + TestNG automation framework for a demo shop")], ("QA Intern", "Wrote Selenium tests and ran them in Jenkins")),
    "c15": ("Manual Tester (Fresher)", "manual testing,test cases,JIRA,SQL,Postman", 0.5, "BCA",
            [], ("Testing Intern", "Wrote test cases and logged defects in JIRA")),
    "c16": (".NET Developer (Fresher)", "C#,.NET,ASP.NET Core,SQL Server,Entity Framework,REST API,Git", 0.5, "B.Tech in Computer Science",
            [("Inventory API", "ASP.NET Core Web API with Entity Framework and SQL Server")], (".NET Intern", "Built API endpoints in C#")),
    "c17": ("Computer Science Student", "C++,DSA,OOP,DBMS,Operating Systems,Git", 0, "B.Tech in Computer Science",
            [("Compiler Basics", "Tokenizer and parser in C++")], None),
    "c18": ("Mechanical Engineer", "AutoCAD,SolidWorks,MATLAB,Excel", 0, "B.Tech in Mechanical Engineering",
            [("Gearbox Design", "3D model and stress analysis in SolidWorks")], None),
    "c19": ("Machine Learning Fresher", "Python,TensorFlow,PyTorch,scikit-learn,pandas,NumPy,NLP,Machine Learning", 0.5, "B.Tech in Computer Science",
            [("Sentiment Analysis", "NLP classifier trained with PyTorch on product reviews"), ("Churn Prediction", "scikit-learn model with pandas feature engineering")], ("ML Intern", "Trained and evaluated classification models")),
    "c20": ("Full Stack Developer (Fresher)", "Java,Spring Boot,React,MySQL,REST API,Git", 0.5, "B.Tech in Computer Science",
            [("Student Portal", "Spring Boot REST API with React front end and MySQL")], ("Software Intern", "Built REST endpoints and React pages")),
    "c21": ("iOS Developer (Fresher)", "Swift,SwiftUI,UIKit,Xcode,REST API,Git", 0.5, "B.Tech in Computer Science",
            [("Habit Tracker", "SwiftUI app with local storage")], ("iOS Intern", "Built SwiftUI screens")),
    "d01": ("Senior Java Developer", "Java,Spring Boot,Microservices,Kafka,PostgreSQL,Docker,Kubernetes,AWS", 6, "B.Tech in Computer Science",
            [("Payments Platform", "Event-driven payment microservices using Spring Boot and Kafka")], ("Senior Software Engineer", "Designed Spring Boot microservices with Kafka and PostgreSQL, deployed on Kubernetes")),
    "d02": ("Java Developer", "Java,Spring Boot,MySQL,REST API,Docker", 2, "B.Tech in Computer Science",
            [("Booking System", "Spring Boot REST services with MySQL")], ("Software Engineer", "Developed REST APIs in Spring Boot")),
    "d03": ("Python Backend Engineer", "Python,FastAPI,PostgreSQL,Redis,Docker,Celery,AWS", 4, "B.Tech in Computer Science",
            [("Notification Platform", "FastAPI service with Celery workers and Redis queues")], ("Backend Engineer", "Built FastAPI services with PostgreSQL, Redis and Celery on AWS")),
    "d04": ("Django Developer", "Python,Django,MySQL,REST API,Celery,Redis,Docker", 3, "B.E in Computer Science",
            [("CRM Backend", "Django REST backend with Celery tasks")], ("Python Developer", "Developed Django APIs and Celery jobs")),
    "d05": ("Senior Frontend Engineer", "React,TypeScript,Redux,Jest,Webpack,Next.js,HTML,CSS", 5, "B.Tech in Computer Science",
            [("Design System", "Reusable React component library in TypeScript tested with Jest")], ("Senior Frontend Engineer", "Led React and TypeScript apps with Redux and Jest")),
    "d06": ("Frontend Developer", "React,JavaScript,HTML,CSS", 1.5, "B.Tech in Computer Science",
            [("Landing Pages", "Marketing pages in React and CSS")], ("Frontend Developer", "Built React pages")),
    "d07": ("Full Stack Engineer", "React,Redux,Jest,Node.js,TypeScript,PostgreSQL,Docker,AWS,MongoDB,HTML,CSS", 4, "B.Tech in Computer Science",
            [("SaaS Dashboard", "React and Node.js app with PostgreSQL deployed with Docker on AWS")], ("Full Stack Engineer", "Built React front ends and Node.js TypeScript APIs with PostgreSQL")),
    "d08": ("iOS Engineer", "Swift,SwiftUI,UIKit,Core Data,REST API,Combine,Xcode", 4, "B.Tech in Computer Science",
            [("Banking App", "UIKit and SwiftUI app with Core Data caching")], ("iOS Engineer", "Developed Swift apps using UIKit, SwiftUI and Combine")),
    "d09": ("Data Engineer", "Python,SQL,Spark,Airflow,AWS,Kafka,dbt,Snowflake", 5, "B.Tech in Computer Science",
            [("Streaming Pipeline", "Kafka to Spark to Snowflake pipeline orchestrated by Airflow")], ("Data Engineer", "Built Airflow and Spark pipelines on AWS")),
    "d10": ("Data Analyst", "SQL,Tableau,Python,Excel,Power BI,Statistics,Data Visualization", 4, "B.Sc in Mathematics",
            [("Churn Dashboard", "Tableau dashboards and SQL analysis of customer churn")], ("Data Analyst", "Built dashboards and ad-hoc SQL analyses")),
    "d11": ("Machine Learning Engineer", "Python,PyTorch,NLP,MLOps,Docker,SQL,Hugging Face,LLM", 4, "M.Tech in Computer Science",
            [("Document QA", "Retrieval-augmented question answering with LLMs")], ("ML Engineer", "Trained NLP models with PyTorch and deployed them with Docker and MLflow")),
    "d12": ("Senior DevOps Engineer", "AWS,Kubernetes,Terraform,Docker,Jenkins,Linux,Prometheus,Ansible,CI/CD", 6, "B.Tech in Computer Science",
            [("Cluster Automation", "Terraform modules and Kubernetes clusters on AWS with Prometheus monitoring")], ("DevOps Engineer", "Ran CI/CD, Kubernetes and Terraform for production workloads")),
    "d13": ("System Administrator", "Windows Server,Active Directory,VMware,Networking,Linux,Bash", 5, "B.Sc in Computer Science",
            [], ("System Administrator", "Managed servers, Active Directory and VMware")),
    "d14": ("Senior QA Automation Engineer", "Selenium,Java,TestNG,REST Assured,Jenkins,SQL,JMeter,CI/CD", 5, "B.Tech in Computer Science",
            [("API Test Suite", "REST Assured and TestNG suite running in Jenkins")], ("QA Automation Engineer", "Maintained Selenium and REST Assured frameworks with CI/CD")),
    "d15": ("Manual QA Engineer", "manual testing,JIRA,test plans,SQL,Postman", 4, "B.Sc in Computer Science",
            [], ("QA Engineer", "Wrote test plans and executed manual regression")),
    "d16": ("Go Backend Engineer", "Go,gRPC,PostgreSQL,Docker,Kubernetes,REST API,Kafka", 4, "B.Tech in Computer Science",
            [("Order Service", "Go gRPC microservice with PostgreSQL deployed on Kubernetes")], ("Backend Engineer", "Built Go microservices with gRPC and Kafka")),
    "d17": ("PHP Developer", "PHP,Laravel,MySQL,jQuery,REST API", 5, "BCA",
            [("Booking Portal", "Laravel application with MySQL")], ("PHP Developer", "Developed Laravel applications")),
    "d18": (".NET Developer", "C#,.NET Core,ASP.NET Core,SQL Server,Azure,Microservices,REST API", 6, "B.Tech in Computer Science",
            [("Claims Platform", "ASP.NET Core microservices on Azure")], (".NET Developer", "Built C# microservices with SQL Server on Azure")),
    "d19": ("Java Backend Engineer", "Java,Spring Boot,Microservices,PostgreSQL,Docker,Kafka", 4, "B.Tech in Computer Science",
            [("Inventory Service", "Spring Boot microservices communicating over Kafka")], ("Java Backend Engineer", "Developed Spring Boot microservices with Kafka and PostgreSQL")),
    "d20": ("Senior Python Developer", "Python,Django,FastAPI,PostgreSQL,Redis,Docker,Celery,AWS", 6, "B.Tech in Computer Science",
            [("Billing Backend", "Django and FastAPI services with Celery on AWS")], ("Senior Python Developer", "Led Django and FastAPI backends with PostgreSQL and Redis")),
    "d21": ("Senior Frontend Engineer", "React,TypeScript,Redux,Jest,HTML,CSS,Next.js", 6, "B.Tech in Computer Science",
            [("E-commerce Storefront", "Next.js and React storefront with Redux and Jest tests")], ("Frontend Lead", "Led React and TypeScript development")),
    "d22": ("Cloud / DevOps Engineer", "AWS,Kubernetes,Terraform,Docker,GitHub Actions,Linux,CI/CD", 4, "B.Tech in Computer Science",
            [("Infra as Code", "Terraform for AWS with EKS and GitHub Actions pipelines")], ("DevOps Engineer", "Managed AWS, Kubernetes and CI/CD pipelines")),
    "d23": ("Data Engineer", "Python,SQL,Spark,Airflow,AWS,Kafka", 3, "B.Tech in Computer Science",
            [("ETL Platform", "Airflow-managed Spark jobs on AWS")], ("Data Engineer", "Built batch and Kafka streaming pipelines")),
    "d24": ("Senior ML Engineer", "Python,PyTorch,NLP,MLOps,Docker,SQL,Kubernetes,LLM", 5, "M.Tech in Computer Science",
            [("Intent Classifier", "Transformer-based NLP service deployed on Kubernetes")], ("ML Engineer", "Trained NLP models and ran MLOps pipelines")),
    "d25": ("QA Automation Engineer", "Selenium,Java,TestNG,REST Assured,Jenkins,SQL,CI/CD", 4, "B.Tech in Computer Science",
            [("E2E Suite", "Selenium and TestNG end-to-end suite in CI/CD")], ("QA Automation Engineer", "Automated UI and API tests")),
    "d26": ("Go Developer", "Go,gRPC,PostgreSQL,Docker,Kubernetes,REST API", 3, "B.Tech in Computer Science",
            [("URL Shortener", "Go REST and gRPC services with PostgreSQL")], ("Go Developer", "Developed Go services on Kubernetes")),
    "d27": ("Senior iOS Engineer", "Swift,SwiftUI,UIKit,Core Data,REST API,Combine,Xcode", 5, "B.Tech in Computer Science",
            [("Fitness App", "SwiftUI app with Combine and Core Data")], ("iOS Engineer", "Shipped Swift apps to the App Store")),
    "d28": ("Full Stack Engineer", "React,Node.js,TypeScript,PostgreSQL,Docker,AWS,REST API", 5, "B.Tech in Computer Science",
            [("Booking Platform", "React and Node.js TypeScript platform on AWS")], ("Full Stack Engineer", "Built React front ends and Node.js APIs with PostgreSQL")),
    "d29": ("Java Tech Lead", "Java,Spring Boot,Microservices,Kafka,PostgreSQL,Docker,Kubernetes", 8, "B.Tech in Computer Science",
            [("Core Banking Services", "Spring Boot microservices at scale")], ("Tech Lead", "Led a Java and Spring Boot team")),
}

# ------------------------------------------------------------------ HAND LABELS: role -> {resume: 1 (eligible) | 0 (not eligible)}
LABELS = {
    "F1": {"c01": 1, "c20": 1, "d02": 1, "d01": 1, "c02": 0, "c03": 0, "c16": 0, "c17": 0, "c04": 0, "c18": 0},
    "F2": {"c03": 1, "c04": 1, "d04": 1, "d20": 1, "c05": 0, "c01": 0, "c19": 0, "c07": 0, "c12": 0, "c20": 0},
    "F3": {"c06": 1, "c08": 1, "d06": 1, "d21": 1, "c07": 0, "c20": 0, "c01": 0, "c04": 0, "c12": 0, "c17": 0},
    "F4": {"c08": 1, "d07": 1, "d28": 1, "c20": 0, "c06": 0, "d21": 0, "c01": 0, "c03": 0, "c07": 0, "c16": 0},
    "F5": {"c09": 1, "c10": 1, "c20": 0, "c08": 0, "c06": 0, "c01": 0, "c13": 0, "c17": 0, "c16": 0, "d27": 0},
    "F6": {"c11": 1, "c05": 1, "d10": 1, "c19": 0, "c12": 0, "c03": 0, "c06": 0, "c15": 0, "c17": 0, "d09": 0},
    "F7": {"c19": 1, "c05": 1, "d11": 1, "d24": 1, "c11": 0, "d09": 0, "c03": 0, "c17": 0, "c12": 0, "c06": 0},
    "F8": {"c13": 1, "d12": 1, "d22": 1, "d13": 0, "c03": 0, "c14": 0, "c01": 0, "c17": 0, "c04": 0, "d01": 0},
    "F9": {"c14": 1, "d14": 1, "d25": 1, "c15": 0, "d15": 0, "c01": 0, "c02": 0, "c17": 0, "c03": 0, "c13": 0},
    "F10": {"c16": 1, "d18": 1, "c01": 0, "c02": 0, "c17": 0, "c20": 0, "c03": 0, "d17": 0, "c06": 0, "c08": 0},
    "E1": {"d01": 1, "d19": 1, "d29": 1, "d02": 0, "c01": 0, "c20": 0, "d18": 0, "d03": 0, "d16": 0, "d17": 0},
    "E2": {"d03": 1, "d04": 1, "d20": 1, "d11": 0, "d09": 0, "c03": 0, "c04": 0, "d19": 0, "d07": 0, "d17": 0},
    "E3": {"d05": 1, "d21": 1, "d07": 1, "d06": 0, "c06": 0, "c08": 0, "d01": 0, "d17": 0, "d02": 0, "d12": 0},
    "E4": {"d07": 1, "d28": 1, "d05": 0, "d03": 0, "d01": 0, "d06": 0, "c08": 0, "c20": 0, "d04": 0, "d18": 0},
    "E5": {"d08": 1, "d27": 1, "c21": 0, "c09": 0, "d06": 0, "c06": 0, "d01": 0, "d07": 0, "d12": 0, "d16": 0},
    "E6": {"d09": 1, "d23": 1, "d03": 0, "d10": 0, "d11": 0, "d01": 0, "d16": 0, "d12": 0, "c05": 0, "c11": 0},
    "E7": {"d11": 1, "d24": 1, "d09": 0, "d10": 0, "d03": 0, "c19": 0, "c05": 0, "d01": 0, "d12": 0, "d16": 0},
    "E8": {"d12": 1, "d22": 1, "d13": 0, "d01": 0, "d16": 0, "c13": 0, "d03": 0, "d07": 0, "d18": 0, "d14": 0},
    "E9": {"d14": 1, "d25": 1, "d15": 0, "c14": 0, "d19": 0, "d02": 0, "d03": 0, "d01": 0, "c15": 0, "d17": 0},
    "E10": {"d16": 1, "d26": 1, "d01": 0, "d19": 0, "d03": 0, "d04": 0, "d12": 0, "d07": 0, "d17": 0, "d09": 0},
}


def _split(csv: str) -> list:
    return [s.strip() for s in csv.split(",") if s.strip()]


def _resume(rid: str) -> dict:
    title, skills, years, edu, projects, exp = RESUMES[rid]
    experience = []
    if exp:
        start = 2026 - max(1, int(round(years + 0.49)))
        experience.append({"title": exp[0], "company": "Company", "startDate": f"Jan {start}", "endDate": "Present", "description": exp[1]})
    return {"currentTitle": title, "summary": None, "skills": _split(skills), "experience": experience,
            "projects": [{"name": n, "description": d} for n, d in projects], "education": edu, "certifications": [],
            "cgpa": None, "experienceYears": float(years)}


def _role(role_id: str) -> dict:
    title, level, track, stacks, req, pref, min_exp, qual = ROLES[role_id]
    return {"title": title, "requirements": {
        "title": title, "summary": None, "requiredSkills": req, "preferredSkills": pref, "minExperienceYears": float(min_exp),
        "qualifications": qual, "responsibilities": [], "level": level, "track": track, "stacks": stacks}}


def build_rows() -> list:
    rows = []
    for role_id, labels in LABELS.items():
        level = ROLES[role_id][1]
        for rid, y in labels.items():
            rows.append({"group": f"gold-{role_id}", "split_group": f"gold-{rid}", "kind": f"gold-{level}", "label": int(y),
                         "weight": 1.0, "role": _role(role_id), "resume": _resume(rid)})
    return rows


def main():
    rows = build_rows()
    assert len(rows) == 200, len(rows)
    with open(OUT, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    pos = sum(r["label"] for r in rows)
    print(f"wrote {len(rows)} pairs ({pos} eligible, {len(rows) - pos} not) -> {OUT}")


if __name__ == "__main__":
    main()