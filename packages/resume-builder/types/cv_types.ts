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
    work_experience: WorkExperience[];
    education: Education[];
  }
  