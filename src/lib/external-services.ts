/** Extra hard stop for disposable local QA, independent of provider flags/keys. */
export function assertExternalServicesAllowed() {
  if (process.env.SC_EXTERNAL_SERVICES === 'disabled') {
    throw new Error('External services are disabled in this environment.');
  }
}
