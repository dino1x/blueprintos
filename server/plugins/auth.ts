import { createToolkitAuthPlugin } from '@agent-native/toolkit/app/auth/server'

import { isSharedReviewerMode, SHARED_REVIEWER_EMAIL } from '../compliance/reviewer-session.js'

// Hosted plan-review instances with PUBLIC_DEMO=1 authenticate incoming requests
// as the shared reviewer identity so evaluators can inspect sheets immediately.
const reviewerSession = () => ({ email: SHARED_REVIEWER_EMAIL, emailVerified: true })

export default createToolkitAuthPlugin({
  workspaceAppPublicPaths: ['/'],
  rootAuth: true,
  marketing: false,
  getAdditionalSession: async () => (isSharedReviewerMode() ? reviewerSession() : null),
  getAdditionalBrowserSession: async () => (isSharedReviewerMode() ? reviewerSession() : null),
})
