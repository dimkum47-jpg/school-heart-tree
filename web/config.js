// Static public config only. Sensitive passwords and Firebase service accounts
// MUST be configured as Cloudflare Worker secrets, never here or in GitHub.
// Existing Firebase client template values are not required by this secured app.
export const config = {
  apiBase: 'https://REPLACE_ME.workers.dev'
};
