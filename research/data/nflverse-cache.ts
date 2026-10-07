import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import zlib from 'zlib';
import { downloadNflverseFile, parseCsvObjects } from '../../scripts/lib/nflverse';

const CACHE_DIR = path.resolve(__dirname, 'nflverse');

export const NFLVERSE_URLS = {
  pbp_2024: 'https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2024.csv.gz',
  pbp_2025: 'https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2025.csv.gz',
  part_2023: 'https://github.com/nflverse/nflverse-data/releases/download/pbp_participation/pbp_participation_2023.csv',
  part_2024: 'https://github.com/nflverse/nflverse-data/releases/download/pbp_participation/pbp_participation_2024.csv',
  part_2025: 'https://github.com/nflverse/nflverse-data/releases/download/pbp_participation/pbp_participation_2025.csv',
  ftn_2024: 'https://github.com/nflverse/nflverse-data/releases/download/ftn_charting/ftn_charting_2024.csv',
  ftn_2025: 'https://github.com/nflverse/nflverse-data/releases/download/ftn_charting/ftn_charting_2025.csv',
};

/**
 * Ensures a file is cached locally in research/data/nflverse/ and returns a Readable stream.
 * Decompresses on the fly if the file is .gz.
 */
export async function getCachedNflverseStream(
  key: keyof typeof NFLVERSE_URLS
): Promise<NodeJS.ReadableStream> {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  const url = NFLVERSE_URLS[key];
  const filename = path.basename(url);
  const localPath = path.join(CACHE_DIR, filename);

  if (!fs.existsSync(localPath)) {
    console.log(`Caching ${filename} from ${url}...`);
    // Download raw stream and save to disk
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
      throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
    }
    const fileStream = fs.createWriteStream(localPath);
    const webStream = Readable.fromWeb(res.body as any);
    await new Promise((resolve, reject) => {
      webStream.pipe(fileStream).on('finish', resolve).on('error', reject);
    });
    console.log(`Saved ${filename} (${fs.statSync(localPath).size} bytes).`);
  }

  const fileStream = fs.createReadStream(localPath);
  if (filename.endsWith('.gz')) {
    return fileStream.pipe(zlib.createGunzip());
  }
  return fileStream;
}
