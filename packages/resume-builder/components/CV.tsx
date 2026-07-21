import * as Icons from '../assets/icons';
import { ResumeData, SkillSetCategory } from '../types/cv_types';
import { getBoldHtml } from '../utils/utils';

const NameComp = (props: {name: string}): JSX.Element => {
    const {name} = props;
    const name_splits = name.split(' ').map(name_split => <><span className="text-5xl">{name_split[0]}</span>{name_split.slice(1)} </>);
    return <>
        {name_splits}
    </>
}

const SkillSetComp = ({skillset}: {skillset: SkillSetCategory[]}): JSX.Element => {
    const agg = [
        {
            skill_type: 'Programming',
            included: ['programming']
        },
        {
            skill_type: 'Web',
            included: ['web', 'web-frameworks']  
        },
        {
            skill_type: 'Platform, Data & Other',
            included: ['Data, Platform & Other']
        }
    ];

    return <>
    {skillset.map(skillset_item => {
        const skills = skillset_item.skills;
        skills.sort((skill1, skill2) => Number(skill2.level) - Number(skill1.level) )

        return <>
            <div>
                <span>
                    <span className="font-semibold">{skillset_item.label}: </span>
                    {skills.map(skill => skill.skill).join(', ')}
                </span>
            </div>
        </>
    })}
    </>

}
export const CV1 = (data: ResumeData): JSX.Element => (
  <div id="resume" className="space-y-6 font-mono">
    <div id="intro" className="flex justify-between items-end">
      <div className="space-y-2">
        <h1 className="text-4xl mt-4 tracking-wide font-sans">
            <NameComp name={data.personal.name}></NameComp>
        </h1>
        <a
          target="_blank"
          rel="noopener noreferrer"
          href={data.personal.website.link}
          className="pl-2 border-b border-b-red-300"
        >
            {data.personal.website.readable}
        </a>
      </div>
      <ul className="flex flex-col items-end space-y-1">
        <li className="flex justify-end items-center space-x-2">
          <a target="_blank" rel="noopener noreferrer" href={'mailto:' + data.personal.email}>
            {data.personal.email}
          </a>
          <span className="text-red-500">{Icons.Mail()}</span>
        </li>
        <li className="flex justify-end items-center space-x-2">
          <a target="_blank" rel="noopener noreferrer" href={data.personal.github.link}>
            {data.personal.github.readable}
          </a>
          <span className="text-red-500">{Icons.GitHub()}</span>
        </li>
        <li className="flex justify-end items-center space-x-2">
          <a target="_blank" rel="noopener noreferrer" href={data.personal.linkedin.link}>
            {data.personal.linkedin.readable}
          </a>
          <span className="text-red-500">{Icons.LinkedIn()}</span>
        </li>
      </ul>
    </div>

    <div id="skills">
      <h2 className="text-xl uppercase tracking-wider mt-4 font-sans border-b-2 border-red-300 mb-2">
        <span className="text-3xl">S</span>kills
      </h2>
      <div className="pl-2">
        <div className="space-y-2">
            <SkillSetComp skillset = {data.personal.skillset} />
        </div>
      </div>
    </div>

    <div id="experience">
      <h2 className="text-xl uppercase tracking-wider mt-4 font-sans border-b-2 border-red-300 mb-2">
        <span className="text-3xl">E</span>xperience
      </h2>
      {data.work_experience.map((exp) => (
        <div className="pl-2 space-y-2 pb-2" key="">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>
                <span className="font-semibold">
                  <a target="_blank" rel="noopener noreferrer" href={exp.url}>
                    {exp.company}
                  </a>
                  ,{' '}
                </span>
                <span className="italic">{exp.position} </span> | {exp.location}
              </span>
              <span>{exp.start} - {exp.end}</span>
            </div>
            <div>
              <ul className="list-disc pl-8">
                {exp.description.map(descItem => getBoldHtml(descItem)).map((descItem) => (
                  <li key={descItem} dangerouslySetInnerHTML={{__html: descItem}}></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ))}
    </div>
    <div id="education">
      <h2 className="text-xl uppercase tracking-wider mt-4 font-sans border-b-2 border-red-300 mb-2">
        <span className="text-3xl">E</span>ducation
      </h2>
      {data.education.map((ed) => (
        <div className="pl-2 pb-2 space-y-2" key={ed.start+' - '+ed.end}>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="font-semibold">
                <a target="_blank" rel="noopener noreferrer">
                  {ed.university}
                </a>
              </span>
              <span>{ed.start+' - '+ed.end}</span>
            </div>
            <span className="italic">{ed.degree}</span>
            {ed.description.map(desc => getBoldHtml(desc)).map(desc => <p key={desc} dangerouslySetInnerHTML={{__html: desc}}></p>)}
          </div>
        </div>
      ))}
    </div>
  </div>
);
