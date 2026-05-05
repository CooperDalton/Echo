import { env } from './config';

export async function createGitHubClient() {
  const { Octokit } = await import('@octokit/rest');
  return new Octokit({ auth: env.GITHUB_TOKEN });
}
