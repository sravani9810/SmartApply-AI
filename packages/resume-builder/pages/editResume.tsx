import type { NextPage } from 'next';
import React, { useCallback, useMemo, useState, useRef, useEffect, useContext } from 'react';
import { PersonalData, ResumeData, WorkExperience, Education } from '../types/cv_types';
import { CV1 } from '../components/CV';
import DescriptionTextBox from '../components/DescriptionTextBox';
import { PdfShiftApiKey } from '../constants/keys';
import Modal from '../components/modal';
import { ToastContext } from '../contexts/ToastContext';
import { ToastType } from '../types/ToastType';
import { EmptyData, data } from '../data/cv_data';


const EditResume: NextPage = () => {
  const env = process?.env?.NODE_ENV;
  // const env = "production";
  const {addToast} = useContext(ToastContext);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newSkillset, setNewSkillset] = useState({
      type: '',
      label: '',
      skills: [{ skill: '', level: '' }],
  });

  const [resumeData, setResumeData] = useState<ResumeData>({
        personal: {
          name: '',
          website: {
            readable: '',
            link: '',
          },
          email: '',
          github: {
            readable: '',
            link: '',
          },
          linkedin: {
            readable: '',
            link: '',
          },
          skillset: [],
        },
        work_experience: [
          {
              company: '',
              position: '',
              url: '',
              location: '',
              start: '',
              end: '',
              description: [''],
          },
        ],
        education: [
          {
              degree: '',
              university: '',
              url: '',
              location: '',
              start: '',
              end: '',
              description: [''],
          },
        ]
    });

  const setPersonalData = useCallback((personalData: PersonalData) => {
    setResumeData({
      personal: personalData,
      education: resumeData.education,
      work_experience: resumeData.work_experience
    });
  }, [resumeData, setResumeData])

  const personalData = useMemo(() => {
    return resumeData.personal;
  }, [resumeData]);

  const setWorkExperience = useCallback((workExperience: WorkExperience[]) => {
    setResumeData({
      personal: resumeData.personal,
      education: resumeData.education,
      work_experience: workExperience
    });
  }, [resumeData, setResumeData])

  const workExperience = useMemo(() => {
    return resumeData.work_experience
  }, [resumeData]);

  const setEducation = useCallback((education: Education[]) => {
    setResumeData({
      personal: resumeData.personal,
      education,
      work_experience: resumeData.work_experience
    });
  }, [resumeData, setResumeData])

  const education = useMemo(() => {
    return resumeData.education
  }, [resumeData]);
    
  const handlePersonalDataChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const newPerData = {...personalData};
    const keys = name.split(".");
    let targetRef: any = newPerData;
    for (let i=0; i<keys.length-1; ++i) {
        targetRef = targetRef[keys[i]]
    }
    targetRef[keys[keys.length-1]] = value;
    setPersonalData({
        ...newPerData
      });
  };

  const handleDescriptionChange = useCallback((type: string, index: number, descItems: string[]) => {
    if (type === 'work_experience') {
      workExperience[index].description = descItems;
      setWorkExperience([...workExperience]);
    } else if (type === 'education') {
      education[index].description = descItems;
      setEducation([...education]);
    }
  }, [setWorkExperience, setEducation, workExperience, education]);

  const loadJsonDataToResume = useCallback((loadingResumeData: ResumeData) => {
    console.log('Setting Resume Data');
    setResumeData({...loadingResumeData});
  }, [setResumeData]);

  const onImportData = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e && e.target && e.target.files) {
      const selectedFile = e.target.files[0];
      if (selectedFile) {
        console.log(`Selected file: ${selectedFile.name}`);
        try {
          const reader = new FileReader();
          reader.onload = (event) => {
            console.log("file loaded");
            const fileContent = event.target?.result;
            if (fileContent) {
              const resumeObject: ResumeData = JSON.parse(fileContent as string);
              loadJsonDataToResume(resumeObject);
            }
          };
          addToast("Resume loaded successfully.", ToastType.SUCCESS);
          reader.readAsText(selectedFile);
        } catch (error) {
          console.error('Error reading or parsing the JSON file:', error);
        }
      }
    }
  }, [loadJsonDataToResume, addToast]);

  const [apiKey, setApiKey] = useState('');
  const [isApiKeyModalVisible, setIsApiKeyModalVisible] = useState(false);

  
  const [downloadLoading, setDownloadLoading] = useState(false);

  
  const downloadResume = async (resumeData: ResumeData, apiKey: string) => {
    let fileName = resumeData.personal.name ? (resumeData.personal.name.replaceAll(' ', '_')) : 'untitled';
    let downloadApi;
    console.log(`env: ${env}`)

    downloadApi = fetch('/api/cv', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({'resumeData': resumeData, 'fileName': `${fileName}.pdf`, 'apiKey': apiKey, 'env': env})
    });
    setDownloadLoading(true);
    downloadApi.then(res => {
      console.log('data received');
      if (res?.error) {
        addToast(res.error, ToastType.ERROR);
        setApiKey('');
      } else if (!res.ok) {
        addToast(res.statusText + ". Try with a different api key", ToastType.ERROR);
        setApiKey('');
      } else {
        res.blob().then(blob => {
          console.log('blob received');
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName; 
          a.click();
          window.URL.revokeObjectURL(url);
          localStorage.setItem(PdfShiftApiKey, apiKey);
        });
      }
      setDownloadLoading(false);
    }).catch((err) => {
      addToast("Error in downloading resume. See console for more details.", ToastType.ERROR)
      setDownloadLoading(false);
      console.error('error received');
      console.error(err);
    });
  };
  
  const onResumeDownloadClick = useCallback(() => {
    if (env === 'production' && !apiKey) {
      setIsApiKeyModalVisible(true);
    } else {
      downloadResume(resumeData, apiKey);
    }
  }, [downloadResume, apiKey, resumeData]);
  
  const onCloseApiKeyModal = useCallback(() => {
    setIsApiKeyModalVisible(false);
  }, [setIsApiKeyModalVisible]);
  
  const handleSubmitApiKey = useCallback(apiKeyRes => {
    setApiKey(apiKeyRes);
    setIsApiKeyModalVisible(false);
    addToast("PDFShift Api key submitted", ToastType.SUCCESS);
    downloadResume(resumeData, apiKeyRes);
  }, [setApiKey, resumeData, setIsApiKeyModalVisible, addToast, downloadResume]);

  const onLoadSampleData = useCallback(() => {
    loadJsonDataToResume(data);
    addToast("Loaded Sample Data", ToastType.SUCCESS);
    fileInputRef.current.value = '';
  }, [loadJsonDataToResume, fileInputRef]);

  const onResetClick = useCallback(() => {
    loadJsonDataToResume(EmptyData);
    addToast("Resume reset", ToastType.SUCCESS);
    fileInputRef.current.value = '';
  }, [loadJsonDataToResume, fileInputRef]);
  
  const onFileUploadClick = useCallback(() => {
    if (fileInputRef && fileInputRef.current)
    fileInputRef.current.click();
}, [fileInputRef]);

const onFileDownloadClick = useCallback((resumeData: ResumeData) => {
  const resumeDataStr = JSON.stringify(resumeData, null, "\t");
  const blob = new Blob([resumeDataStr], { type: "application/json" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  if (resumeData.personal.name) {
    a.download = resumeData.personal.name.replace(" ", "_") + '_resume_data';
  } else {
    a.download = 'untitled';
  }
  a.click();
  window.URL.revokeObjectURL(url);
  addToast("Downloaded resume data. Import this json to load resume.", ToastType.SUCCESS)
}, [addToast]);

const handleSkillsetChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
  const { name, value } = e.target;
  const updatedSkillset = [...personalData.skillset];
  updatedSkillset[index][name] = value;
  setPersonalData({
    ...personalData,
    skillset: updatedSkillset,
  });
};

const handleSkillChange = (e: React.ChangeEvent<HTMLInputElement>, skillSetIndex: number, skillIndex: number) => {
  const { name, value } = e.target;
  personalData.skillset[skillSetIndex].skills[skillIndex][name] = value;
  setPersonalData({
    ...personalData,
  });
};

const addSkill = (index: number) => {
  const updatedSkillset = [...personalData.skillset];
  updatedSkillset[index].skills.push({ skill: '', level: '' });
  setPersonalData({
    ...personalData,
    skillset: updatedSkillset,
  });
};

const deleteSkill = (skillsetIndex: number, skillIndex: number) => {
  const updatedSkillset = [...personalData.skillset];
  updatedSkillset[skillsetIndex].skills.splice(skillIndex, 1);
  setPersonalData({
    ...personalData,
    skillset: updatedSkillset,
  });
};

const addSkillset = () => {
  setPersonalData({
    ...personalData,
    skillset: [...personalData.skillset, newSkillset],
  });
  setNewSkillset({
    type: '',
    label: '',
    skills: [{ skill: '', level: '' }],
  });
};

const deleteSkillset = (index: number) => {
  const updatedSkillset = [...personalData.skillset];
  updatedSkillset.splice(index, 1);
  setPersonalData({
    ...personalData,
    skillset: updatedSkillset,
  });
};

const handleWorkExperienceChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
  const { name, value } = e.target;
  const updatedWorkExperience = [...workExperience];
  updatedWorkExperience[index][name] = value;
  setWorkExperience(updatedWorkExperience);
};

const addWorkExperience = () => {
  setWorkExperience([...workExperience, {
    company: '',
    position: '',
    url: '',
    location: '',
    start: '',
    end: '',
    description: [''],
  }]);
};

const deleteWorkExperience = (index: number) => {
  const updatedWorkExperience = [...workExperience];
  updatedWorkExperience.splice(index, 1);
  setWorkExperience(updatedWorkExperience);
};

// Method to handle changes in education fields
const handleEducationChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
  const { name, value } = e.target;
  const updatedEducation = [...education];
  updatedEducation[index][name] = value;
  setEducation(updatedEducation);
};

// Method to add a new education entry
const addEducation = () => {
  setEducation([...education, {
    degree: '',
    university: '',
    url: '',
    location: '',
    start: '',
    end: '',
    description: [''],
  }]);
};

// Method to delete an education entry
const deleteEducation = (index: number) => {
  const updatedEducation = [...education];
  updatedEducation.splice(index, 1);
  setEducation(updatedEducation);
};

useEffect(() => {
  if (typeof window !== 'undefined') {
    const storedApiKey = localStorage.getItem(PdfShiftApiKey);
    if (storedApiKey) {
        setApiKey(storedApiKey);
    }
  }
}, []);

return (
    <>
      <div className="container h-screen">
        <div className="flex h-full">
          <div className="flex-none w-96 h-full overflow-auto resume-data-input">
            <div className="bg-gray-900 text-white p-8 rounded-lg shadow-lg">
              <h1 className="text-3xl font-bold mb-4">Resume Data</h1>

              <span className="flex flex-row place-content-between mt-4 mb-2">
                {/* <span className="text-2xl">
                  Personal Data
                </span> */}
                <button className="bg-green-500/50 p-1 rounded" onClick={onLoadSampleData}>
                  <span className="flex flex-row">
                    <span className='pl-1'>
                      Sample
                    </span>
                  </span>
                </button>
                <button className="bg-orange-500/50 p-2 rounded" onClick={onFileUploadClick}>
                  <input type="file" ref={fileInputRef} className='hidden' onChange={onImportData}/>
                  <span className="flex flex-row">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                    </svg>
                    <span className='pl-1'>
                      Import
                    </span>
                  </span>
                </button>
                <button className="bg-blue-500/50 p-1 rounded" onClick={() => onFileDownloadClick(resumeData)}>
                  <span className="flex flex-row">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    <span className='pl-1'>
                      Export
                    </span>
                  </span>
                </button>
                <button className="p-1 rounded" onClick={onResetClick}>
                  <span className="flex flex-row">
                    <svg width="28px" height="28px" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                      <g fill="none" fillRule="evenodd" stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round" transform="matrix(0 1 1 0 2.5 2.5)">
                        <path d="m13 11 3 3v-6c0-3.36502327-2.0776-6.24479706-5.0200433-7.42656457-.9209869-.36989409-1.92670197-.57343543-2.9799567-.57343543-4.418278 0-8 3.581722-8 8s3.581722 8 8 8c1.48966767 0 3.4724708-.3698516 5.0913668-1.5380762" transform="matrix(-1 0 0 -1 16 16)"/>
                        <path d="m5 5 6 6"/>
                        <path d="m11 5-6 6"/>
                      </g>
                    </svg>
                  </span>
                </button>
              </span>
              <label className="block mb-2">Name:</label>
              <input
                  type="text"
                  name="name"
                  value={personalData.name}
                  onChange={handlePersonalDataChange}
                  className="w-full bg-gray-800 border border-gray-600 rounded-md p-2 mb-4"
              />

              {/* Other personal data fields go here, similar to 'Name' */}
              <label className="block mb-2">Website Readable:</label>
              <input
              type="text"
              name="website.readable"
              value={personalData.website.readable}
              onChange={handlePersonalDataChange}
              className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mb-2"
              />
              <label className="block mb-2">Website Link:</label>
              <input
              type="text"
              name="website.link"
              value={personalData.website.link}
              onChange={handlePersonalDataChange}
              className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mb-2"
              />
              <label className="block mb-2">Email</label>
              <input
              type="text"
              name="email"
              value={personalData.email}
              onChange={handlePersonalDataChange}
              className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mb-2"
              />
              {/* <label className="block mb-2">Email Link:</label>
              <input
              type="text"
              name="email.link"
              value={personalData.email.link}
              onChange={handlePersonalDataChange}
              className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mb-2"
              /> */}
              <label className="block mb-2">GitHub Readable:</label>
              <input
              type="text"
              name="github.readable"
              value={personalData.github.readable}
              onChange={handlePersonalDataChange}
              className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mb-2"
              />
              <label className="block mb-2">GitHub Link:</label>
              <input
              type="text"
              name="github.link"
              value={personalData.github.link}
              onChange={handlePersonalDataChange}
              className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mb-2"
              />
              <label className="block mb-2">LinkedIn Readable:</label>
              <input
              type="text"
              name="linkedin.readable"
              value={personalData.linkedin.readable}
              onChange={handlePersonalDataChange}
              className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mb-2"
              />
              <label className="block mb-2">LinkedIn Link:</label>
              <input
              type="text"
              name="linkedin.link"
              value={personalData.linkedin.link}
              onChange={handlePersonalDataChange}
              className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mb-2"
              />
              <h2 className="text-2xl mt-4 mb-2">Skillset</h2>
              {personalData.skillset.map((skillset, skillsetIndex) => (
                  <div key={skillsetIndex} className="bg-gray-800 p-4 mb-4 rounded-md">
                  <label className="block mb-2">Type:</label>
                  <input
                      type="text"
                      name="type"
                      value={skillset.type}
                      onChange={(e) => handleSkillsetChange(e, skillsetIndex)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mb-2"
                  />
                  <label className="block mb-2">Label:</label>
                  <input
                      type="text"
                      name="label"
                      value={skillset.label}
                      onChange={(e) => handleSkillsetChange(e, skillsetIndex)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mb-2"
                  />
                  <h3 className="text-xl mt-2 mb-2">Skills</h3>
                  {skillset.skills.map((skill, skillIndex) => (
                    <div key={skillIndex} className="bg-gray-700 p-2 mb-2 rounded-md">
                    <label className="block mb-2">Skill:</label>
                    <input
                        type="text"
                        name="skill"
                        value={skill.skill}
                        onChange={(e) =>
                        handleSkillChange(e, skillsetIndex, skillIndex)
                        }
                        className="w-full bg-gray-600 border border-gray-500 rounded-md p-1 mb-1"
                    />
                    <label className="block mb-2">Level:</label>
                    <input
                        type="text"
                        name="level"
                        value={skill.level}
                        onChange={(e) =>
                            handleSkillChange(e, skillsetIndex, skillIndex)
                        }
                        className="w-full bg-gray-600 border border-gray-500 rounded-md p-1 mb-1"
                    />
                    <button
                        onClick={() => deleteSkill(skillsetIndex, skillIndex)}
                        className="text-red-500 hover:text-red-600 font-bold mt-2"
                    >
                        Delete Skill
                    </button>
                    </div>
                  ))}
                  <button
                      onClick={() => addSkill(skillsetIndex)}
                      className="text-blue-500 hover:text-blue-600 font-bold mt-2"
                  >
                      Add Skill
                  </button>
                  <button
                      onClick={() => deleteSkillset(skillsetIndex)}
                      className="text-red-500 hover:text-red-600 font-bold mt-2 ml-2"
                  >
                      Delete Skillset
                  </button>
                  </div>
              ))}
              <button
                  onClick={addSkillset}
                  className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md"
              >
                  Add Skillset
              </button>

              {/* Work Experience Section */}
              <h2 className="text-2xl mt-4 mb-2">Work Experience</h2>
              {workExperience.map((experience, index) => (
                <div key={index} className="bg-gray-800 p-4 mb-4 rounded-md">
                  <label className="block mb-2">Company:</label>
                  <input
                      type="text"
                      name="company"
                      value={experience.company}
                      onChange={(e) => handleWorkExperienceChange(e, index)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mb-2"
                  />
                  <label className="block mb-2">Position:</label>
                  <input
                      type="text"
                      name="position"
                      value={experience.position}
                      onChange={(e) => handleWorkExperienceChange(e, index)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mb-2"
                  />
                  <label className="block mb-2">URL:</label>
                  <input
                      type="text"
                      name="url"
                      value={experience.url}
                      onChange={(e) => handleWorkExperienceChange(e, index)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mb-2"
                  />
                  <label className="block mb-2">Location:</label>
                  <input
                      type="text"
                      name="location"
                      value={experience.location}
                      onChange={(e) => handleWorkExperienceChange(e, index)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mb-2"
                  />
                  <label className="block mb-2">Start Date:</label>
                  <input
                      type="text"
                      name="start"
                      value={experience.start}
                      onChange={(e) => handleWorkExperienceChange(e, index)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mb-2"
                  />
                  <label className="block mb-2">End Date:</label>
                  <input
                      type="text"
                      name="end"
                      value={experience.end}
                      onChange={(e) => handleWorkExperienceChange(e, index)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mb-2"
                  />
                  <h3 className="text-xl mt-2 mb-2">Description</h3>
                  <DescriptionTextBox descItems={workExperience[index].description} type='work_experience' index={index} handleDescriptionChange={handleDescriptionChange}/>
                  <button
                      onClick={() => deleteWorkExperience(index)}
                      className="text-red-500 hover:text-red-600 font-bold mt-2 ml-2"
                  >
                      Delete Experience
                  </button>
                  </div>
              ))}
              <button
                  onClick={() => addWorkExperience()}
                  className="text-blue-500 hover:text-blue-600 font-bold mt-2"
              >
                  Add Work Experience
              </button>

              {/* Education Section */}
              <h2 className="text-2xl mt-4 mb-2">Education</h2>
              {education.map((edu, index) => (
                <div key={index} className="bg-gray-800 p-4 mb-4 rounded-md">
                  <label className="block mb-2">Degree:</label>
                  <input
                  type="text"
                  name="degree"
                  value={edu.degree}
                  onChange={(e) => handleEducationChange(e, index)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mb-2"
                  />
                  {/* Add similar fields for university, location, URL, start, end */}
                  <h3 className="text-xl mt-2 mb-2">Description</h3>
                  <DescriptionTextBox descItems={education[index].description} type='education' index={index} handleDescriptionChange={handleDescriptionChange}/>
                  <button
                  onClick={() => deleteEducation(index)}
                  className="text-red-500 hover:text-red-600 font-bold mt-2 ml-2"
                  >
                  Delete Education
                  </button>
                </div>
              ))}
              <button
                  onClick={() => addEducation()}
                  className="text-blue-500 hover:text-blue-600 font-bold mt-2"
              >
                  Add Education
              </button>
            </div>
          </div>
          <div className="resume flex-auto h-full overflow-auto">
            <div className="h-full">
              <div className="p-8 rounded-lg">
              <span className="flex flex-row place-content-between mt-4 mb-2">
                <span className="text-3xl">
                  Resume
                </span>
                <button className="bg-blue-700 text-white p-2 rounded" onClick={onResumeDownloadClick}>
                  <span className="flex flex-row">
                    <span className={downloadLoading ? "animate-bounce" : ""}>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                    </span>
                    {/* <LoaderSpinner /> */}
                    <span className='pl-1'>
                      Download Resume
                    </span>
                  </span>
                </button>
              </span>
                <div className="bordered shadow-lg">
                  <CV1 {...resumeData} />
                </div>
              </div>
            </div>
          </div>
        </div>
        <Modal isVisible={isApiKeyModalVisible} onClose={onCloseApiKeyModal} onSubmit={handleSubmitApiKey}/>
      </div>
    </>
  );
};


export default EditResume;