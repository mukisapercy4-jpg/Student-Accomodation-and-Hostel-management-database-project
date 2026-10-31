import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Stitch, StitchToolClient } from '@google/stitch-sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STITCH_API_KEY = process.env.STITCH_API_KEY || '';
const STITCH_PROJECT_ID = process.env.STITCH_PROJECT_ID || '12932539486946854444';

async function syncStitchScreens() {
  if (!STITCH_API_KEY) {
    console.error('Error: STITCH_API_KEY environment variable is required.');
    process.exit(1);
  }
  console.log(`Connecting to Google Stitch for Project: ${STITCH_PROJECT_ID}...`);

  const client = new StitchToolClient({ apiKey: STITCH_API_KEY });
  const stitch = new Stitch(client);
  const project = stitch.project(STITCH_PROJECT_ID);

  try {
    const screens = await project.screens();
    console.log(`Found ${screens.length} screen(s) in Stitch project.`);

    const outputDir = path.resolve(__dirname, '../src/components/stitch');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    for (const screen of screens) {
      const name = screen.data?.title || screen.data?.name || `Screen_${screen.id}`;
      const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
      console.log(`- Fetching screen: ${name} (${screen.id})`);

      try {
        const html = await screen.html();
        if (html) {
          const outPath = path.join(outputDir, `${safeName}.html`);
          fs.writeFileSync(outPath, html, 'utf-8');
          console.log(`  Saved to: src/components/stitch/${safeName}.html`);
        }
      } catch (err) {
        console.warn(`  Could not export HTML for ${name}:`, err.message);
      }
    }

    console.log('\nStitch screen sync complete.');
  } catch (error) {
    console.error('Failed to sync from Stitch:', error.message);
  } finally {
    await client.close();
  }
}

syncStitchScreens();
