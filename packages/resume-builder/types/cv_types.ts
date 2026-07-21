export interface SocialLink {
    readable: string;
    link: string;
  }
  
export interface Skill {
    skill: string;
    level: string;
    optional?: boolean;
    new?: boolean;
  }
  
  export interface SkillSetCategory {
    type: string;
    label: string;
    skills: Skill[];
  }
  
  export interface PersonalData {
    name: string;
    website: SocialLink;
    email: string;
    phone?: string;
    github: SocialLink;
    linkedin: SocialLink;
    skillset: SkillSetCategory[];
  }
  
  export interface WorkExperience {
    company: string;
    position: string;
    url: string;
    location: string;
    start: string;
    end: string;
    description: string[];
  }
  
  export interface Education {
    degree: string;
    university: string;
    url: string;
    location: string;
    start: string;
    end: string;
    description: string[];
  }
  
  export interface ResumeData {
    personal: PersonalData;
    /** Free-text summary paragraphs, rendered under a "Summary" heading. */
    summary?: string[];
    /**
     * Skill lines rendered as bullets under "Skills" (each string is one
     * bullet, e.g. pipe-separated tech). When present, these take precedence
     * over `personal.skillset` in the template.
     */
    skills?: string[];
    /** Personal / side projects, rendered under a "Personal Project" heading. */
    projects?: WorkExperience[];
    work_experience: WorkExperience[];
    education: Education[];
  }
  