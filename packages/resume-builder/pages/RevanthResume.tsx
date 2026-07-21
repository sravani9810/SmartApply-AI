import type { NextPage } from 'next'
import { CV1 } from '../components/CV'
import { data } from '../data/cv_data'

const Resume: NextPage = () => {
  return (
    <div className="mt-8 md:mt-20 max-w-4xl mx-auto px-6 md:px-10">
      <CV1 {...data}/>
    </div>
  )
}

export default Resume
