// Test documents are plain .txt (the services accept it). They never mention CGPA, branch, passing year or backlogs,
// so those values stay "unknown" for the academic rules (checkpoint 3).
export const BACKEND_JAVA = { track: 'backend', stack: 'java' } as const;
export const BACKEND_PYTHON = { track: 'backend', stack: 'python' } as const;
export const FULLSTACK_JAVA = { track: 'fullstack', stack: 'java' } as const;
export type Target = { track: string; stack: string };

export interface TextDoc {
  fileName: string;
  text: string;
}

export function javaBackendResume(name: string): TextDoc {
  return {
    fileName: 'resume-java-backend.txt',
    text: [
      name,
      'Backend Developer',
      '',
      'SUMMARY',
      'Backend developer focused on Java and Spring Boot. Builds REST APIs backed by SQL databases and ships them with Docker.',
      '',
      'SKILLS',
      'Java, Spring Boot, Hibernate, REST APIs, SQL, MySQL, Git, Docker, JUnit, Maven',
      '',
      'EXPERIENCE',
      'Backend Developer Intern, Acme Software (6 months)',
      '- Built REST APIs with Java and Spring Boot for an order management system.',
      '- Wrote SQL queries and JUnit tests, and deployed services with Docker.',
      '',
      'PROJECTS',
      'Library Management System: Java, Spring Boot, MySQL. REST API with authentication and role based access.',
      '',
      'EDUCATION',
      'Bachelor of Technology',
    ].join('\n'),
  };
}

export function pythonBackendResume(name: string): TextDoc {
  return {
    fileName: 'resume-python-backend.txt',
    text: [
      name,
      'Backend Developer',
      '',
      'SUMMARY',
      'Backend developer focused on Python and Django. Builds REST APIs backed by SQL databases and ships them with Docker.',
      '',
      'SKILLS',
      'Python, Django, Flask, REST APIs, SQL, PostgreSQL, Git, Docker, Pytest',
      '',
      'EXPERIENCE',
      'Backend Developer Intern, Acme Software (6 months)',
      '- Built REST APIs with Python and Django for an inventory system.',
      '- Wrote SQL queries and Pytest tests, and deployed services with Docker.',
      '',
      'PROJECTS',
      'Inventory Tracker: Python, Django, PostgreSQL. REST API with authentication and reports.',
      '',
      'EDUCATION',
      'Bachelor of Technology',
    ].join('\n'),
  };
}

export function fullstackJavaResume(name: string): TextDoc {
  return {
    fileName: 'resume-fullstack-java.txt',
    text: [
      name,
      'Full-stack Developer',
      '',
      'SUMMARY',
      'Full-stack developer who builds Java and Spring Boot back ends and React front ends.',
      '',
      'SKILLS',
      'Java, Spring Boot, REST APIs, SQL, JavaScript, React, HTML, CSS, Git',
      '',
      'EXPERIENCE',
      'Full-stack Developer Intern, Northwind Labs (6 months)',
      '- Built React screens with JavaScript, HTML and CSS.',
      '- Built REST APIs with Java and Spring Boot and SQL databases.',
      '',
      'PROJECTS',
      'Job Board: Java, Spring Boot, React, MySQL. Search, filters and an admin screen.',
      '',
      'EDUCATION',
      'Bachelor of Technology',
    ].join('\n'),
  };
}

export function jobDescription(title: string): TextDoc {
  return {
    fileName: 'job-description.txt',
    text: [
      `${title} - Acme Software`,
      '',
      'We are hiring freshers and early-career engineers.',
      'Required skills: Java, Spring Boot, REST APIs, SQL.',
      'Nice to have: Docker, Git.',
    ].join('\n'),
  };
}

export function textForm(doc: TextDoc, fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.append('file', new Blob([doc.text], { type: 'text/plain' }), doc.fileName);
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return form;
}