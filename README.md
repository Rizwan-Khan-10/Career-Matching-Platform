# Career Matching Platform

**🎯 Career Matching Platform** is a multi-agent AI platform that connects applicants and recruiters — automating resume/JD parsing, eligibility checks, and AI-powered skill matching, while giving applicants personalized guidance to improve their chances.

---

## 📌 Features

### 🧑‍🎓 For Applicants
- 📄 Upload and manage your resume
- ✅ Instant eligibility check against job requirements (CGPA, branch, experience, etc.)
- 🤖 AI-powered skill matching against open roles
- 💡 Personalized feedback and skill-gap guidance
- 🗺️ Career roadmaps and interview/role-specific preparation
- 💬 Chat with an AI career assistant
- 🔔 Real-time notifications on match results

### 🏢 For Recruiters
- 📝 Upload job descriptions and requirements
- 🔍 View AI-matched and eligible applicants
- 📊 Manage postings and track the recruitment pipeline
- 💬 Chat with an AI assistant for candidate insights

### 🛡️ For Admins
- 👥 Manage users, companies, and job postings
- 🧹 Review and moderate content
- ✅ Approve companies and job postings
- 📈 View platform-wide analytics

---

## ⚙️ Tech Stack

| Category | Technologies Used |
|---|---|
| Frontend | Next.js, TypeScript |
| Backend | NestJS (microservices), FastAPI (AI agents) |
| Reverse Proxy | Nginx |
| Database | PostgreSQL (Supabase) with pgvector |
| Cache / Queue | Redis (Streams, Pub/Sub, BullMQ) |
| File Storage | Cloudinary |
| Auth | JWT (access + refresh tokens) |

---

## 🔄 How It Works

1. Applicant uploads a resume → parsed for skills, education, CGPA, projects and experience.
2. Recruiter uploads a job description → parsed for role-wise requirements.
3. Backend runs rule-based eligibility checks (CGPA, branch, graduation year, experience).
4. AI agents run semantic skill matching between the applicant and the role.
5. Matched/eligible applicants show up on the recruiter's dashboard.
6. Applicant gets personalized feedback, a skill-gap breakdown, and prep guidance — delivered via notification and chat.

---

## 📱 Responsiveness

Built to work smoothly across desktops and mobile devices, with real-time updates via WebSocket and a clean, responsive UI.

---

## 🚀 Future Enhancements

- 🎓 ERP integration — connect with college systems
- 📊 Data-driven matching using real-world hiring data
- 🔍 Automated credential verification
- 🎤 AI-powered mock interview preparation
