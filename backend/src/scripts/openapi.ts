import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { apiDocument } from '../app';
import { disconnectRedis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { closeQueues } from '../lib/queue';
async function main() {
  if (process.env.NODE_ENV !== 'test')
    throw new Error('Use NODE_ENV=test to generate contracts without external services');
  const target = resolve(__dirname, '../../openapi.json');
  const output = `${JSON.stringify(apiDocument, null, 2)}\n`;
  try {
    if (process.argv.includes('--write')) writeFileSync(target, output);
    else if (readFileSync(target, 'utf8') !== output)
      throw new Error('OpenAPI drift: run npm run openapi:generate and review the diff');
  } finally {
    await closeQueues();
    await disconnectRedis();
    await prisma.$disconnect();
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'OpenAPI generation failed');
  process.exitCode = 1;
});
