import type { NextApiRequest, NextApiResponse } from 'next';
import { getResume, saveResume, deleteResume } from '../../../utils/resumeStore';

/** GET one résumé, PUT to overwrite it (Save), DELETE to remove it. */
const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const id = String(req.query.id);
  try {
    if (req.method === 'GET') {
      const r = await getResume(id);
      if (!r) {
        res.status(404).json({ error: 'Résumé not found' });
        return;
      }
      res.status(200).json(r);
      return;
    }
    if (req.method === 'PUT') {
      const { title, data } = req.body || {};
      if (!data) {
        res.status(400).json({ error: 'data (ResumeData) is required' });
        return;
      }
      res.status(200).json(await saveResume(id, title, data));
      return;
    }
    if (req.method === 'DELETE') {
      await deleteResume(id);
      res.status(204).end();
      return;
    }
    res.setHeader('Allow', 'GET, PUT, DELETE');
    res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e?.message });
  }
};

export default handler;
