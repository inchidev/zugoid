/** Mail providers whose domain says nothing about where someone works. A Company never lists one. */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.de', 'gmx.net', 'web.de',
  'mail.com', 'zoho.com', 'yandex.ru', 'yandex.com', 'ya.ru', 'mail.ru', 'bk.ru', 'inbox.ru', 'list.ru', 'rambler.ru', 'qq.com',
  '163.com', 'fastmail.com', 'hey.com', 'tutanota.com', 'tuta.io',
])

/** A Company domain as stored: lowercased, without a scheme, path or leading `@` or `www.`. Null if it is not a domain. */
export function normalizeCompanyDomain(value: string): string | null {
  const domain = value.trim().toLowerCase().replace(/^[a-z]+:\/\//u, '').replace(/^@/u, '').replace(/^www\./u, '').split(/[/?#]/u)[0] ?? ''
  return /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(domain) ? domain : null
}

export function emailDomain(address: string): string {
  return address.slice(address.lastIndexOf('@') + 1).toLowerCase()
}
