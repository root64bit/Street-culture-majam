export function safeAuthRedirect(value: string | null | undefined) {
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\x00-\x1f]/.test(value))
    return '/account';
  try {
    const url = new URL(value, 'https://www.streetculturevault.com');
    return url.origin === 'https://www.streetculturevault.com'
      ? `${url.pathname}${url.search}${url.hash}`
      : '/account';
  } catch {
    return '/account';
  }
}
