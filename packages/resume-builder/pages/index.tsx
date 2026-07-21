import type { NextPage } from 'next';
import EditResume from './editResume';

const Home: NextPage = () => {
  return (
    <div>
      {/* <CV1 {...data}/> */}
      <EditResume />
    </div>
  );
};

export default Home;
