import type { NextApiRequest, NextApiResponse } from 'next';
import { listResumes, createResume } from '../../../utils/resumeStore';

/** GET → list saved résumés (metadata). POST → create a new saved résumé. */
const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  try {
    if (req.method === 'GET') {
      res.status(200).json(await listResumes());
      return;
    }
    if (req.method === 'POST') {
      const { title, data } = req.body || {};
      if (!data) {
        res.status(400).json({ error: 'data (ResumeData) is required' });
        return;
      }
      const saved = await createResume(title, data);
      res.status(201).json(saved);
      return;
    }
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e?.message });
  }
};

export default handler;
