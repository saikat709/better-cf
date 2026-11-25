const CODEFORCES_BASE_DOMAINS = [
  'codeforces.com',
  'codeforc.es',
  'codeforces.ml',
  'codeforces.ru',
] as const;

export const CODEFORCES_URL_MATCHES = [
  '*://*.codeforces.com/*',
  '*://*.codeforc.es/*',
  '*://*.codeforces.ml/*',
  '*://*.codeforces.ru/*',
] as const;

export const isCodeforcesHost = (hostname: string): boolean => {
  const normalized = hostname.trim().toLowerCase().replace(/^www\./, '');
  if (!normalized) return false;
  return CODEFORCES_BASE_DOMAINS.some(
    (domain) => normalized === domain || normalized.endsWith(`.${domain}`),
  );
};
