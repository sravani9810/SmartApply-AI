import type { NextPage } from 'next';
import Library from './library';

// The résumé library is the landing page: browse saved résumés + templates,
// then open one to edit it in place at /editResume.
const Home: NextPage = () => <Library />;

export default Home;
