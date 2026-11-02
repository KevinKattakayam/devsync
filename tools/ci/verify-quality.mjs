import { appendFileSync } from 'node:fs';
const sha = process.env.DEPLOY_SHA || '';
if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Supply a full reviewed commit SHA');
if (!process.env.GH_TOKEN || !process.env.GITHUB_REPOSITORY)
  throw new Error('Missing workflow repository credentials');
const response = await fetch(
  `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/workflows/main.yml/runs?head_sha=${sha}&status=success&per_page=1`,
  {
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
    },
  },
);
if (!response.ok) throw new Error(`Cannot verify quality status (${response.status})`);
const data = await response.json();
if (!data.workflow_runs?.some((run) => run.head_sha === sha && run.conclusion === 'success'))
  throw new Error('No successful complete Quality workflow for this commit');
if (!process.env.GITHUB_OUTPUT) throw new Error('Workflow output file unavailable');
appendFileSync(process.env.GITHUB_OUTPUT, `sha=${sha}\n`);
