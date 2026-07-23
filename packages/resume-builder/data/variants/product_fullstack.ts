import { ResumeData } from "../../types/cv_types";

/**
 * "Product / full-stack" résumé variant — summary-first, clean prose bullets
 * (no heavy inline bolding), category-labelled skills. Tuned as the base
 * résumé for product companies with a full-stack tech stack.
 *
 * Source of truth: revanth_resume_product.docx (2026-07-23). This is the
 * current default; see `data/cv_data.ts`.
 */
export const data: ResumeData = {
  personal: {
    name: "Revanth Madasu",
    phone: "+1 816-859-2752",
    email: "revanthmadasu913@gmail.com",
    website: {
      readable: "revanthmadasu.tech",
      link: "https://revanthmadasu.tech",
    },
    github: {
      readable: "github.com/revanthmadasu",
      link: "https://github.com/revanthmadasu",
    },
    linkedin: {
      readable: "linkedin.com/in/revanth-madasu-465396107",
      link: "https://www.linkedin.com/in/revanth-madasu-465396107/",
    },
    // Fallback categories (used only if `skills` below is removed).
    skillset: [],
  },

  summary: [
    "Software engineer with nearly seven years of experience building large-scale distributed systems, full-stack products, and cloud-native infrastructure across OCI, AWS, and Azure. Built and operated mission-critical services with 99.99% availability across approximately 100 global regions, including petabyte-scale ingestion and search platforms, high-throughput microservices, observability, incident response, and production operations. Experienced in Java, Python, TypeScript, React, Angular, Spring Boot, FastAPI, Kafka, Kubernetes, and Terraform, with strong ownership across architecture, implementation, testing, deployment, and reliability.",
    "Founder and founding engineer of Scrollwise, an AI-native microlearning platform taken from concept to a production-ready pre-launch deployment. Designed multi-model generation pipelines on AWS Bedrock for educational content, images, structured layouts, and interactive SVG/Lottie experiences while independently owning product strategy, UX, full-stack engineering, and AWS infrastructure.",
  ],

  skills: [
    "<b>Programming Languages:</b> Java, Python, TypeScript, JavaScript, SQL, Bash",
    "<b>AI Engineering:</b> AWS Bedrock, Claude API, OpenAI API, Gemini, Ollama, Large Language Models, Prompt Engineering, Retrieval-Augmented Generation, Embeddings, Vector Databases, Multi-Model Orchestration, Agentic AI, Model Context Protocol, AI-Assisted Development",
    "<b>Backend &amp; Distributed Systems:</b> Spring Boot, Spring MVC, Spring Security, FastAPI, Node.js, Express.js, REST APIs, GraphQL, Apache Kafka, Microservices, Event-Driven Architecture, Distributed Systems",
    "<b>Frontend Engineering:</b> React, Angular, Next.js, TypeScript, Vite, TanStack Query, Redux, NgRx, RxJS, HTML5, CSS3, Responsive Web Design, Micro-Frontends",
    "<b>Cloud &amp; Infrastructure:</b> AWS, Oracle Cloud Infrastructure, Microsoft Azure, Docker, Kubernetes, Terraform, Ansible, Serverless Architecture, Infrastructure as Code",
    "<b>Databases, Storage &amp; Search:</b> PostgreSQL, Oracle, SQL Server, MongoDB, RocksDB, Elasticsearch, Lucene, SQLite, SQLAlchemy, Hibernate/JPA",
    "<b>Testing, Reliability &amp; Operations:</b> JUnit, Mockito, Jest, Cypress, Jasmine, GitHub Actions, Jenkins, CI/CD, Grafana, CloudWatch, New Relic, PagerDuty, Observability, Incident Response",
  ],

  projects: [
    {
      position: "Founder & Founding Engineer - Pre-launch",
      company: "Scrollwise.net",
      url: "https://scrollwise.net",
      location: "Remote",
      start: "05/2026",
      end: "Present",
      description: [
        "Building an AI-native microlearning platform independently from concept to a production-ready pre-launch deployment, owning product strategy, UX, system architecture, full-stack development, testing, cloud infrastructure, and release workflows.",
        "Engineered a prompt-driven, multi-model content-generation pipeline on AWS Bedrock that orchestrates specialized models to generate educational content, images, structured layouts, and interactive SVG/Lottie media, composing them into cohesive and visually engaging learning posts.",
        "Created a self-authoring template engine that generates new layouts when existing templates are insufficient, using model routing, quality validation, duplicate prevention, approval-based reconciliation, and theme-aware visual asset generation.",
        "Architected the frontend application using React 18, TypeScript, Vite, React Router, and TanStack Query, delivering a responsive swipe-based content feed, reusable data-driven SVG/Lottie renderers, light and dark themes, and role-protected administrative workflows.",
        "Designed asynchronous backend services using Python, FastAPI, Pydantic, and SQLAlchemy, implementing REST APIs, JWT access and refresh tokens, personalized feed ranking, user progress tracking, and ORM-backed persistence with PostgreSQL and SQLite.",
        "Architected and owned the platform on AWS using Lambda, API Gateway, ECS Fargate, RDS PostgreSQL, S3, CloudFront, Route 53, ACM, and IAM, supporting serverless APIs, event-driven content generation, secure domain routing, and scalable static application hosting.",
        "Built CI/CD workflows with GitHub Actions and Docker, including multi-architecture builds, path-based component deployments, least-privilege IAM, VPC networking, DNS/TLS automation, and structured application logging through CloudWatch.",
        "Designed a reusable visual experience system, including custom Lottie animations, animated generation states, modular UI templates, and theme-aware components, combining product engineering with high-quality interaction and visual design.",
        "Applied AI-assisted and agentic development workflows using Claude Code and OpenAI Codex to accelerate architecture, implementation, testing, debugging, and documentation while maintaining a modular, versioned, contract-driven monorepo.",
      ],
    },
  ],

  work_experience: [
    {
      position: "Software Development Engineer 2",
      company: "Oracle",
      url: "https://www.oracle.com/",
      location: "Austin, USA",
      start: "08/2024",
      end: "04/2026",
      description: [
        "Developed customer-facing distributed backend services for Oracle Cloud Infrastructure (OCI) Logging, delivering end-to-end features for a highly available, high-volume logging platform operating across ~100 global regions with a 99.99% SLA, supporting millions of search queries and API requests daily in a distributed microservices architecture.",
        "Designed and implemented Kafka-based data ingestion, indexing, and search services, developing Java and Python microservices using Spring Boot, REST APIs, and kRPC to process and query petabytes of log data with Elasticsearch, Lucene, RocksDB, SQL/NoSQL databases, and distributed caching.",
        "Engineered scalable, fault-tolerant backend systems by developing containerized microservices with Docker and Kubernetes, improving system reliability, distributed data processing, and performance for globally deployed cloud services.",
        "Developed an AI-powered operations assistant using open-source LLMs (Ollama), leveraging RAG, embeddings, and vector databases to retrieve knowledge from operational runbooks, architecture documentation, and incident playbooks, providing context-aware troubleshooting guidance and resolution recommendations during production incidents.",
        "Designed and evaluated AI engineering solutions using MCP, agentic AI workflows, fine-tuning, and prompt engineering, while integrating AI-assisted development tools including GitHub Copilot, OpenAI Codex, Claude, and Gemini to accelerate feature development, code generation, debugging, and developer productivity.",
        "Developed Angular-based micro-frontend modules using Angular, TypeScript, JavaScript, NgRx, and Jasmine, enabling engineers to efficiently search, visualize, and analyze distributed log data through responsive, high-performance user interfaces for Oracle Cloud Infrastructure Logging.",
        "Owned end-to-end feature delivery, authoring unit, integration, and canary tests using JUnit and Mockito, building continuous health validation that executes every 10 minutes to verify data ingestion, indexing, search, and service availability across ~100 global regions, while managing testing, deployments, and production rollouts.",
        "Primary 24×7 on-call engineer for Oracle Cloud Infrastructure Logging, participating in 12-hour day/night rotations and resolving 200+ Sev-2 production incidents by diagnosing CPU bottlenecks, disk mount failures, infrastructure issues, host failures, and traffic spikes, performing real-time scaling, throttling, fault isolation, and recovery to maintain 99.99% SLA.",
        "Improved production reliability and observability by developing Grafana dashboards, health metrics, monitoring alarms, operational runbooks, and Python/Shell automation, enabling faster incident detection, root cause analysis, troubleshooting, and operational response across distributed services.",
        "Led production deployments and operational excellence by deploying services across ~100 global regions, automating infrastructure and host configuration with Terraform and Ansible, authoring incident postmortems (RCAs/CAPAs), and collaborating with NOC, incident management, and engineering leadership during critical production escalations.",
        "Strengthened application security and platform stability by resolving Java dependency security vulnerabilities (SVE tickets), upgrading and validating libraries using Apache Maven and JFrog Artifactory, ensuring secure, compliant, and reliable production releases.",
        "Provided technical leadership by mentoring junior engineers, interns, and new hires, conducting system architecture reviews, design discussions, code reviews, and on-call training, while authoring technical design documents, operational runbooks, and incident postmortems (RCAs/CAPAs), and collaborating with cross-functional engineering, NOC, and incident management teams to drive reliable production operations.",
      ],
    },
    {
      position: "Fullstack Software Developer 2",
      company: "Zachry",
      url: "https://www.zachrygroup.com/",
      location: "",
      start: "05/2023",
      end: "06/2024",
      description: [
        "Developed end-to-end enterprise payroll applications for high-profile clients, designing and delivering scalable Java Spring Boot backend services and Angular web applications while collaborating with business analysts to translate complex payroll requirements into technical solutions.",
        "Architected and developed a secure payroll rule configuration platform using Angular, TypeScript, Angular Material, RxJS, HTML, CSS, and Bootstrap, enabling business users to configure and validate complex payroll policies including hours, rates, shifts, overtime, weekends, and time-off rules through responsive, dynamic user interfaces.",
        "Built secure, high-performance backend services using Java, Spring Boot, Spring Cloud, Hibernate, and JPA, designing REST APIs with OAuth 2.0/Bearer authentication and integrating with enterprise HCM systems and Oracle Time and Labor to support accurate payroll processing.",
        "Designed and deployed Azure WebJobs with CRON-based scheduling to automate payroll file generation, background processing, and data synchronization, supporting weekly payroll execution for approximately one million employees using Azure App Services.",
        "Developed optimized data processing workflows using Azure SQL Database, Microsoft SQL Server, Azure Blob Storage, stored procedures, and complex SQL queries, enabling secure storage, transfer, and processing of enterprise payroll data.",
        "Provided production support for enterprise payroll systems, monitoring scheduled jobs with Azure Monitor and Log Analytics, diagnosing production incidents, reprocessing payroll runs, resolving performance bottlenecks, and maintaining 99.9% system availability during critical payroll cycles.",
        "Improved software quality by developing unit and integration tests using JUnit and Mockito, achieving 85%+ test coverage and reducing production defects while supporting reliable enterprise software releases.",
      ],
    },
    {
      position: "Software Development Engineer",
      company: "Swiggy",
      url: "https://www.swiggy.com/",
      location: "Bengaluru, India",
      start: "02/2022",
      end: "12/2022",
      description: [
        "Developed customer-facing features for the Swiggy consumer platform, delivering high-quality web experiences across desktop web, mobile web, and embedded mobile applications using React, Next.js, TypeScript, JavaScript, Node.js, and Redux for a platform serving millions of users.",
        "Architected and built reusable web-view applications using React and Next.js, enabling independent deployment and seamless embedding within the Swiggy mobile application while improving feature delivery and maintainability.",
        "Independently developed and launched multiple high-impact product features, including the \"Roast Your Dost\" Friendship Day campaign, which engaged over 1 million users and was recognized among the Top 5 Friendship Day campaigns by Mad Over Marketing.",
        "Implemented modern frontend engineering practices including component-driven development, API integration, Jest, Cypress, code reviews, design reviews, technical documentation, and CI/CD pipelines using Jenkins and GitHub Actions, improving release quality and developer productivity.",
        "Owned production releases and on-call operations, coordinating with product, QA, and engineering teams to manage deployments, monitor application health using New Relic and PagerDuty, troubleshoot production incidents, perform root cause analysis, and ensure stable feature rollouts.",
        "Partnered closely with Product Managers, UX Designers, and cross-functional engineering teams to translate business requirements into intuitive, scalable user experiences that improved customer engagement across the Swiggy platform.",
      ],
    },
    {
      position: "Software Development Engineer",
      company: "Thomson Reuters",
      url: "https://www.thomsonreuters.com/",
      location: "Bengaluru, India",
      start: "10/2021",
      end: "02/2022",
      description: [
        "Developed full-stack legal applications, implementing product requirements using Angular, TypeScript, Python, and AWS, integrating RESTful backend services, resolving production issues, participating in code reviews, and delivering features through Agile development practices.",
        "Designed and implemented a scalable state management architecture using NgRx, reducing redundant API requests, improving UI responsiveness, and enhancing application performance.",
        "Developed and delivered the Assembled Renditions feature end-to-end, building the frontend experience, integrating backend services, and leading deployment in the Azure environment.",
        "Improved software quality by increasing unit test coverage from 62% to 85% using Jasmine and implementing end-to-end test automation with Cypress, supporting test-driven and behavior-driven development practices.",
        "Enhanced application usability by implementing reusable filtering and search capabilities across multiple data-driven pages, improving information discovery and user productivity.",
      ],
    },
    {
      position: "Software Engineer",
      company: "Colortokens",
      url: "https://colortokens.com/",
      location: "Bengaluru, India",
      start: "08/2019",
      end: "10/2021",
      description: [
        "Developed full-stack cybersecurity SaaS applications from the ground up, building scalable micro-frontend and microservices solutions using React, Angular, TypeScript, Java Spring Boot, Python, and GraphQL, while integrating multiple enterprise security products into a unified platform.",
        "Designed reusable micro-frontend components using Angular, React, NgRx, Redux, and RxJS, improving code reuse, maintainability, and feature delivery while collaborating closely with UX teams to deliver responsive user experiences.",
        "Developed secure backend APIs using Java Spring Boot and Python Flask, integrating Oracle and MongoDB within a distributed microservices architecture, and implementing role-based access control (RBAC) workflows for Security, Policy, Asset, and Read-only administrators.",
        "Led frontend development initiatives by driving UI architecture, API design, sprint planning, task allocation, and cross-functional collaboration with product managers and UX teams, while delivering customer-specific security solutions under aggressive timelines.",
        "Owned customer-driven feature delivery by working directly with enterprise customers and product managers to refine requirements and implement custom security solutions, including the rapid delivery of the User Access Group feature in two weeks, contributing to a two-year enterprise customer engagement.",
        "Managed application deployments across AWS and Azure using Docker, Kubernetes, Jenkins, and CI/CD pipelines, improving release reliability and supporting continuous delivery for multiple enterprise products.",
        "Provided on-call production support as the primary application contact, resolving customer-reported issues, production defects, and system outages while ensuring platform stability and timely incident resolution.",
        "Built interactive security visualization dashboards using D3.js and Chart.js, enabling customers to analyze network traffic, workload communication, security zones, and asset relationships through rich, data-driven visualizations.",
      ],
    },
    {
      position: "Software Engineer",
      company: "Capgemini",
      url: "https://www.capgemini.com/",
      location: "Chennai, India",
      start: "01/2019",
      end: "08/2019",
      description: [
        "Contributed to the development of enterprise web applications using Java, Spring Boot, Spring MVC, Hibernate/JPA, and Angular, supporting business reporting and analytics initiatives.",
        "Assisted in developing and maintaining RESTful APIs and backend services to retrieve, transform, and expose data from enterprise systems for reporting applications.",
        "Built and enhanced responsive user interfaces using Angular, HTML5, CSS3, JavaScript, and Bootstrap, implementing features such as filtering, sorting, and data visualization for business users.",
        "Wrote and optimized SQL queries and supported Oracle and PostgreSQL databases, improving data retrieval performance and ensuring accurate reporting.",
        "Participated in implementing data processing and reporting logic within Java-based backend services for large business datasets.",
      ],
    },
  ],

  education: [
    {
      degree: "Bachelor of Technology",
      university: "Jawaharlal Nehru Institute of Technology",
      url: "https://jntuh.ac.in/",
      location: "Hyderabad, India",
      start: "07/2015",
      end: "05/2019",
      description: ["Major in Information Technology"],
    },
    {
      degree: "Master of Science",
      university: "Southern Arkansas University",
      url: "https://web.saumag.edu/",
      location: "Magnolia, AR, USA",
      start: "01/2023",
      end: "05/2024",
      description: ["Major in Computer and Information Science"],
    },
  ],
};
