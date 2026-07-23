import { ResumeData } from '../../types/cv_types';
import { data as productFullstack } from './product_fullstack';
import { data as engineering } from './engineering';

/**
 * Built-in résumé "styles". These are read-only starting points shown in the
 * library as Templates; opening one loads its data into the editor, where it
 * can be tweaked and then "Saved as new" into the file-backed library.
 *
 * The currently active app/PDF default is whichever variant `data/cv_data.ts`
 * re-exports — this registry is only for the editor/library UI.
 */
export interface Template {
  id: string;
  title: string;
  data: ResumeData;
}

export const templates: Template[] = [
  { id: 'product_fullstack', title: 'Product / Full-stack', data: productFullstack },
  { id: 'engineering', title: 'Engineering', data: engineering },
];

export const templateMap: Record<string, Template> = templates.reduce(
  (acc, t) => {
    acc[t.id] = t;
    return acc;
  },
  {} as Record<string, Template>,
);
