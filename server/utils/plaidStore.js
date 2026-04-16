import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';

const CONFIG_PATH = fileURLToPath(new URL('../../data/plaid-config.json', import.meta.url));

async function read() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export async function getPlaidConfig() {
  return read();
}

export async function savePlaidConfig(patch) {
  const existing = await read();
  const updated = { ...existing, ...patch };
  await writeFile(CONFIG_PATH, JSON.stringify(updated, null, 2));
  return updated;
}

export async function hasPlaidConfig() {
  const config = await read();
  return Boolean(config.accessToken);
}
