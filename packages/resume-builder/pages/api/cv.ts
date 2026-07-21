import type { NextApiRequest, NextApiResponse } from 'next';
import puppeteer from 'puppeteer';
import { renderToStaticMarkup } from 'react-dom/server';

import { CV1 } from '../../components/CV';
import { data } from '../../data/cv_data';


const handler = async (_: NextApiRequest, res: NextApiResponse) => {
  // const args = ['--no-sandbox', '--disable-setuid-sandbox'];
  console.log('download api called.');
  const args = ['--no-sandbox', '--disable-dev-shm-usage'];

  let browser;
  try {
    // browser = await puppeteer.launch({ args, pipe: true });
    const resumeData = _.body['resumeData'] ? _.body['resumeData'] : data;
    const env = _.body['env'];
    const apiKey = _.body['apiKey'];
    console.log(`env: ${env}, apiKey: ${apiKey}`);
    const html = `
    <!doctype html>
    <html lang="en">
    <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Revanth Madasu - CV</title>
    <link rel="stylesheet" href="http://localhost:3000/build.css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
    html,
    body {
      padding: 0;
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen,
      Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, sans-serif;
    }
    
    a {
      color: inherit;
      text-decoration: none;
    }
    
    * {
      box-sizing: border-box;
    }
    
    @tailwind base;
    @tailwind components;
    @tailwind utilities;
    </style>
    </head>
    <body style="padding: 40px 60px;">
    ${renderToStaticMarkup(CV1(resumeData))}
    </body>
    </html>`;
    let buffer: Buffer;
    if (env === 'production') {
      console.log('api in prod mode. pdf will be created from pdfshift');
      const pdfShiftRes = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`api:${apiKey}`).toString('base64'),
          'Content-type': 'application/json'
        },
        body: JSON.stringify({
          source: html,
          landscape: false,
          use_print: false,
          zoom: 0.85
        })
      })
      console.log('response received');
      if (!pdfShiftRes.ok) {
        console.log('response not ok');
        const errorData = await pdfShiftRes.json();
        res.status(pdfShiftRes.status).json({ error: errorData });
      } else {
        console.log('response ok');
        const aryBuffer = await pdfShiftRes.arrayBuffer();
        buffer = Buffer.from(aryBuffer);
        console.log('buffer created.')
      }
    } 
    else {
      console.log('not in prod, pdf will be created from puppeteer');
      browser = await puppeteer.launch({ args, headless: true });
      const page = await browser.newPage();
      await page.setContent(html);
      buffer = await page.pdf({
        scale: 0.85,
        pageRanges: '1-2',
      });
    }
    if (_.query['download']) {
        const fileName = _.body['fileName'] || 'revanth_madasu.pdf';
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.send(buffer);
  } catch (err) {
    const e = err as Error;
    console.log(`Error: ${e?.message}`);
    res.statusCode = 500;
    return res.json({ error: e?.message });
  } finally {
    if (browser) await browser.close();
    console.log('exiting from download api');
  }
};

export default handler;
