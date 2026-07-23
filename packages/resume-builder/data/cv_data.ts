import { ResumeData } from "../types/cv_types";

/**
 * Active default résumé.
 *
 * Résumés are maintained as named "styles" under `data/variants/`. The default
 * that the app, `/api/cv`, and the editor render is whichever variant is
 * re-exported here. To switch the default, change the import below:
 *
 *   - "./variants/product_fullstack" — product companies, full-stack stack,
 *      summary-first, clean prose, category-labelled skills. (current default)
 *   - "./variants/engineering"       — infra / distributed-systems focus,
 *      skills-first, heavily bolded inline tech. (previous default)
 */
export { data } from "./variants/product_fullstack";

export const EmptyData: ResumeData = {
  personal: {
    name: "",
    phone: "",
    website: { readable: "", link: "" },
    email: "",
    github: { readable: "", link: "" },
    linkedin: { readable: "", link: "" },
    skillset: [],
  },
  summary: [""],
  skills: [""],
  projects: [],
  work_experience: [
    {
      company: "",
      position: "",
      url: "",
      location: "",
      start: "",
      end: "",
      description: [""],
    },
  ],
  education: [
    {
      degree: "",
      university: "",
      url: "",
      location: "",
      start: "",
      end: "",
      description: [""],
    },
  ],
};
