// Hosted plan-review deployments can bind visitors to a single shared
// architect session when PUBLIC_DEMO=1 is configured in the environment,
// avoiding production AUTH_DISABLED warnings while keeping the register open.
export const SHARED_REVIEWER_EMAIL = 'reviewer@blueprintos.invalid'

export function isSharedReviewerMode(): boolean {
  return process.env.PUBLIC_DEMO === '1' // guard:allow-env-credential — environment toggle for hosted preview
}
