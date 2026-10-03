const BASE = { number: 42, title: 'Add login rate limiting', url: 'https://github.com/acme/app/pull/42' }

function prJson(statusCheckRollup: readonly object[]): string {
  return JSON.stringify({ ...BASE, statusCheckRollup })
}

const LINT_OK = {
  __typename: 'CheckRun',
  name: 'lint',
  status: 'COMPLETED',
  conclusion: 'SUCCESS',
  detailsUrl: 'https://github.com/acme/app/actions/runs/1001/job/1',
}

const TESTS_FAILED = {
  __typename: 'CheckRun',
  name: 'test',
  status: 'COMPLETED',
  conclusion: 'FAILURE',
  detailsUrl: 'https://github.com/acme/app/actions/runs/1002/job/7',
}

const TESTS_OK = { ...TESTS_FAILED, conclusion: 'SUCCESS' }

const TESTS_RUNNING = { ...TESTS_FAILED, status: 'IN_PROGRESS', conclusion: null }

const DEPLOY_PREVIEW = {
  __typename: 'StatusContext',
  context: 'vercel',
  state: 'SUCCESS',
  targetUrl: 'https://vercel.com/acme/app/xyz',
}

export const PR_FAILING = prJson([LINT_OK, TESTS_FAILED, DEPLOY_PREVIEW])
export const PR_PASSING = prJson([LINT_OK, TESTS_OK, DEPLOY_PREVIEW])
export const PR_PENDING = prJson([LINT_OK, TESTS_RUNNING])
