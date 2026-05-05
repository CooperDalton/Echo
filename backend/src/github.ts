import { Octokit } from '@octokit/rest';

import { env } from './config';

export function createGitHubClient(): Octokit {
  return new Octokit({ auth: env.GITHUB_TOKEN });
}
