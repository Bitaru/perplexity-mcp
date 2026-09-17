export type Cookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  hostOnly: boolean;
  secure?: boolean;
  expires?: number;
};

function defaultPath(path: string): string {
  if (!path || path[0] !== "/") return "/";
  const slash = path.lastIndexOf("/");
  return slash <= 0 ? "/" : path.slice(0, slash);
}

export function parseSetCookie(header: string, requestUrl: string): Cookie | null {
  const url = new URL(requestUrl);
  const parts = header.split(";");
  const first = parts.shift()?.trim() ?? "";
  const equals = first.indexOf("=");
  if (equals < 1) return null;
  const name = first.slice(0, equals).trim();
  const value = first.slice(equals + 1).trim();
  if (!/^[-!#$%&'*+.^_`|~0-9A-Za-z]+$/.test(name) || /[\r\n]/.test(value)) return null;
  const cookie: Cookie = { name, value, domain: url.hostname.toLowerCase(), path: defaultPath(url.pathname), hostOnly: true };
  let maxAgeSeen = false;
  for (const raw of parts) {
    const index = raw.indexOf("=");
    const attribute = (index < 0 ? raw : raw.slice(0, index)).trim().toLowerCase();
    const attributeValue = index < 0 ? "" : raw.slice(index + 1).trim();
    if (attribute === "domain" && attributeValue) {
      const domain = attributeValue.replace(/^\./, "").toLowerCase();
      if (!/^[a-z0-9.-]+$/.test(domain) || (url.hostname !== domain && !url.hostname.endsWith(`.${domain}`))) return null;
      cookie.domain = domain;
      cookie.hostOnly = false;
    } else if (attribute === "path" && attributeValue.startsWith("/")) {
      if (attributeValue.length > 4096 || /[\r\n]/.test(attributeValue)) return null;
      cookie.path = attributeValue;
    } else if (attribute === "secure") {
      cookie.secure = true;
    } else if (attribute === "max-age") {
      const seconds = Number(attributeValue);
      const expiry = Date.now() + seconds * 1000;
      if (!Number.isFinite(seconds) || !Number.isInteger(seconds) || !Number.isFinite(expiry)) return null;
      maxAgeSeen = true;
      cookie.expires = seconds <= 0 ? 0 : expiry;
    } else if (attribute === "expires" && !maxAgeSeen) {
      const time = Date.parse(attributeValue);
      if (!Number.isNaN(time)) cookie.expires = time;
    }
  }
  return cookie;
}
function domainMatch(host: string, cookie: Cookie): boolean {
  return cookie.hostOnly ? host === cookie.domain : host === cookie.domain || host.endsWith(`.${cookie.domain}`);
}
function pathMatch(path: string, cookiePath: string): boolean {
  return path === cookiePath || path.startsWith(cookiePath.endsWith("/") ? cookiePath : `${cookiePath}/`);
}
export function mergeCookie(jar: Cookie[], incoming: Cookie): Cookie[] {
  const kept = jar.filter(item => item.name !== incoming.name || item.domain !== incoming.domain || item.path !== incoming.path);
  return incoming.expires !== undefined && incoming.expires <= Date.now() ? kept : [...kept, incoming];
}
export function cookieHeader(jar: Cookie[], requestUrl: string): string {
  const url = new URL(requestUrl);
  const now = Date.now();
  return jar.filter(cookie => (!cookie.secure || url.protocol === "https:") && domainMatch(url.hostname, cookie) && pathMatch(url.pathname, cookie.path) && (cookie.expires === undefined || cookie.expires > now)).sort((a, b) => b.path.length - a.path.length).map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
}
