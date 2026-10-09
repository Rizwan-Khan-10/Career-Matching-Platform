"""Ground-truth skill world used ONLY to synthesise a labelled dataset.

Each concept has several *surface forms* (how people actually write it). Ground truth is decided on
the concept level, the model under test only ever sees the surface strings -> it has to use
semantic similarity to get it right (keyword overlap alone will miss "K8s" vs "container orchestration").
"""

# concept -> (domain, [surface forms])
CONCEPTS = {
    # frontend
    "react": ("frontend", ["React", "ReactJS", "React.js", "React (hooks)"]),
    "angular": ("frontend", ["Angular", "AngularJS", "Angular 14"]),
    "vue": ("frontend", ["Vue", "Vue.js", "VueJS"]),
    "javascript": ("frontend", ["JavaScript", "JS", "ES6", "Vanilla JavaScript"]),
    "typescript": ("frontend", ["TypeScript", "TS"]),
    "html_css": ("frontend", ["HTML", "CSS", "HTML5 & CSS3", "HTML/CSS"]),
    "tailwind": ("frontend", ["Tailwind CSS", "TailwindCSS", "Bootstrap / Tailwind"]),
    "redux": ("frontend", ["Redux", "Redux Toolkit", "state management with Redux"]),
    "nextjs": ("frontend", ["Next.js", "NextJS", "Next.js SSR"]),
    "webpack": ("frontend", ["Webpack", "Vite", "frontend build tooling"]),
    # backend
    "nodejs": ("backend", ["Node.js", "NodeJS", "Node"]),
    "express": ("backend", ["Express", "Express.js", "ExpressJS"]),
    "django": ("backend", ["Django", "Django REST Framework", "Django ORM"]),
    "flask": ("backend", ["Flask", "Flask microservices"]),
    "fastapi": ("backend", ["FastAPI", "Fast API"]),
    "spring": ("backend", ["Spring Boot", "Spring Framework", "Spring MVC"]),
    "java": ("backend", ["Java", "Core Java", "Java 11"]),
    "rest": ("backend", ["REST API", "RESTful APIs", "RESTful services", "building REST endpoints"]),
    "graphql": ("backend", ["GraphQL", "GraphQL APIs"]),
    "microservices": ("backend", ["Microservices", "microservice architecture", "distributed services"]),
    "auth": ("backend", ["JWT authentication", "OAuth2", "authentication & authorization"]),
    # data
    "python": ("data", ["Python", "Python 3", "Python scripting"]),
    "sql": ("data", ["SQL", "MySQL", "T-SQL queries", "SQL query optimisation"]),
    "postgres": ("data", ["PostgreSQL", "Postgres", "relational databases (PostgreSQL)"]),
    "mongodb": ("data", ["MongoDB", "Mongo", "NoSQL (MongoDB)"]),
    "pandas": ("data", ["Pandas", "pandas & numpy", "data wrangling with Pandas"]),
    "excel": ("data", ["Excel", "Advanced Excel", "MS Excel (pivot tables)"]),
    "tableau": ("data", ["Tableau", "Tableau dashboards", "data visualisation (Tableau)"]),
    "powerbi": ("data", ["Power BI", "PowerBI", "Power BI dashboards"]),
    "spark": ("data", ["Apache Spark", "PySpark", "big data processing with Spark"]),
    "etl": ("data", ["ETL", "ETL pipelines", "data pipelines"]),
    "statistics": ("data", ["Statistics", "statistical analysis", "hypothesis testing"]),
    # ml
    "ml": ("ml", ["Machine Learning", "ML", "applied machine learning"]),
    "dl": ("ml", ["Deep Learning", "DL", "neural networks"]),
    "tensorflow": ("ml", ["TensorFlow", "TensorFlow/Keras", "Keras"]),
    "pytorch": ("ml", ["PyTorch", "Torch", "PyTorch Lightning"]),
    "sklearn": ("ml", ["scikit-learn", "sklearn", "Scikit Learn models"]),
    "nlp": ("ml", ["NLP", "Natural Language Processing", "text classification"]),
    "cv": ("ml", ["Computer Vision", "CV", "image classification", "OpenCV"]),
    "llm": ("ml", ["LLMs", "Large Language Models", "prompt engineering", "RAG pipelines"]),
    # devops
    "docker": ("devops", ["Docker", "Dockerized services", "containerization with Docker"]),
    "k8s": ("devops", ["Kubernetes", "K8s", "container orchestration"]),
    "aws": ("devops", ["AWS", "Amazon Web Services", "AWS EC2/S3"]),
    "azure": ("devops", ["Azure", "Microsoft Azure", "Azure DevOps"]),
    "gcp": ("devops", ["GCP", "Google Cloud", "Google Cloud Platform"]),
    "cicd": ("devops", ["CI/CD", "Jenkins pipelines", "GitHub Actions", "continuous integration"]),
    "terraform": ("devops", ["Terraform", "Infrastructure as Code", "IaC (Terraform)"]),
    "linux": ("devops", ["Linux", "Linux administration", "Ubuntu server administration", "Bash scripting"]),
    "monitoring": ("devops", ["Prometheus", "Grafana", "monitoring and alerting"]),
    # mobile
    "android": ("mobile", ["Android", "Android SDK", "Android development"]),
    "kotlin": ("mobile", ["Kotlin", "Kotlin coroutines"]),
    "flutter": ("mobile", ["Flutter", "Flutter apps", "Dart"]),
    "rn": ("mobile", ["React Native", "React-Native", "cross-platform mobile apps"]),
    "ios": ("mobile", ["iOS", "iOS development", "Swift", "SwiftUI"]),
    "firebase": ("mobile", ["Firebase", "Firebase Auth", "Firestore"]),
    # qa
    "selenium": ("qa", ["Selenium", "Selenium WebDriver", "browser automation"]),
    "manual_test": ("qa", ["Manual Testing", "test case design", "exploratory testing"]),
    "test_auto": ("qa", ["Test Automation", "automation testing", "automated test suites"]),
    "cypress": ("qa", ["Cypress", "Cypress E2E tests", "Playwright"]),
    "junit": ("qa", ["JUnit", "TestNG", "unit testing in Java"]),
    "jira": ("qa", ["JIRA", "bug tracking with JIRA", "defect management"]),
    "api_test": ("qa", ["Postman", "API testing", "REST Assured"]),
    # design
    "figma": ("design", ["Figma", "Figma prototypes", "Figma design systems"]),
    "ux_research": ("design", ["UX Research", "user research", "usability testing"]),
    "ui_design": ("design", ["UI Design", "interface design", "visual design"]),
    "wireframing": ("design", ["Wireframing", "wireframes and mockups", "Balsamiq"]),
    # shared / generic
    "git": ("common", ["Git", "GitHub", "Git version control"]),
    "agile": ("common", ["Agile", "Scrum", "Agile/Scrum methodology"]),
    "dsa": ("common", ["Data Structures and Algorithms", "DSA", "problem solving"]),
    "oop": ("common", ["OOP", "Object Oriented Programming", "OOPS concepts"]),
    "communication": ("common", ["Communication", "stakeholder communication", "team collaboration"]),
}

# near-substitutes -> partial credit (0.5) in the ground truth. symmetric.
RELATED = [
    ("react", "vue"), ("react", "angular"), ("vue", "angular"), ("react", "nextjs"), ("react", "rn"),
    ("javascript", "typescript"), ("tensorflow", "pytorch"), ("ml", "dl"), ("sql", "postgres"),
    ("django", "flask"), ("flask", "fastapi"), ("django", "fastapi"), ("nodejs", "express"),
    ("aws", "azure"), ("aws", "gcp"), ("azure", "gcp"), ("docker", "k8s"), ("tableau", "powerbi"),
    ("selenium", "cypress"), ("test_auto", "selenium"), ("android", "kotlin"), ("flutter", "rn"),
    ("nlp", "llm"), ("spark", "etl"), ("pandas", "python"), ("figma", "ui_design"), ("ux_research", "wireframing"),
    ("java", "spring"), ("junit", "test_auto"), ("api_test", "rest"), ("firebase", "mongodb"),
]
RELATED_SET = {frozenset(p) for p in RELATED}

TITLES = {
    "frontend": ["Frontend Developer", "React Developer", "UI Engineer", "Web Developer", "Front-End Engineer"],
    "backend": ["Backend Developer", "Software Engineer - Backend", "API Developer", "Node.js Developer", "Java Developer"],
    "data": ["Data Analyst", "Data Engineer", "Business Intelligence Analyst", "SQL Developer", "Analytics Engineer"],
    "ml": ["Machine Learning Engineer", "Data Scientist", "AI Engineer", "NLP Engineer", "Computer Vision Engineer"],
    "devops": ["DevOps Engineer", "Cloud Engineer", "Site Reliability Engineer", "Platform Engineer", "Infrastructure Engineer"],
    "mobile": ["Android Developer", "Mobile App Developer", "Flutter Developer", "iOS Developer", "React Native Developer"],
    "qa": ["QA Engineer", "Test Automation Engineer", "Software Tester", "SDET", "Quality Analyst"],
    "design": ["UI/UX Designer", "Product Designer", "UX Researcher", "Visual Designer", "Interaction Designer"],
}

EDUCATION = [
    ("B.Tech in Computer Science", 3), ("B.E. in Information Technology", 3), ("BCA", 3), ("B.Sc Computer Science", 3),
    ("MCA", 4), ("M.Tech in Computer Engineering", 4), ("MBA", 4), ("Master's in Data Science", 4),
    ("Diploma in Computer Engineering", 2), ("PhD in Computer Science", 5),
]

QUALIFICATIONS = [
    ("Bachelor's degree in Computer Science or related field", 3),
    ("B.Tech/B.E. in CS/IT", 3),
    ("Any graduate", 3),
    ("B.Tech or MCA", 3),
    ("Master's degree in Computer Science", 4),
    ("Diploma or Bachelor's degree", 2),
    ("", 0),
    ("", 0),
]

PROJECT_TEMPLATES = [
    "Built {what} using {a}, {b} and {c}.",
    "Developed {what} with {a} and {b}; deployed using {c}.",
    "Implemented {what} leveraging {a}, {b}.",
    "Designed and shipped {what} end to end ({a}, {b}, {c}).",
]
PROJECT_WHAT = {
    "frontend": ["a storefront UI", "an admin dashboard", "a portfolio website", "a real-time chat interface"],
    "backend": ["an inventory service", "a booking backend", "a payments API", "a task manager backend"],
    "data": ["a sales analytics report", "a customer churn analysis", "a data warehouse load", "a KPI dashboard"],
    "ml": ["a sentiment classifier", "a recommendation model", "a defect detection system", "a document Q&A bot"],
    "devops": ["a deployment pipeline", "a cloud migration", "an autoscaling setup", "a monitoring stack"],
    "mobile": ["a fitness tracker app", "a food delivery app", "an expense manager app", "a chat app"],
    "qa": ["a regression suite", "an end-to-end test framework", "a test plan for an e-commerce site", "an API test harness"],
    "design": ["a mobile banking redesign", "a design system", "a checkout flow", "an onboarding experience"],
    "common": ["a hackathon prototype", "a college project"],
}