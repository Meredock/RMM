import { promises as dns } from "dns";

// Passive / light-touch website reconnaissance: DNS, IPs, CMS/tech fingerprint,
// security headers, and subdomains from Certificate Transparency logs. No port
// scanning, brute-forcing, or exploitation — only the lookups a browser/dig do.

export interface DnsRecord {
  type: string;
  records: string[];
}
export interface SecurityHeader {
  name: string;
  present: boolean;
  value: string | null;
}
export interface Subdomain {
  name: string;
  ip: string | null;
}
export interface ScanResult {
  domain: string;
  scannedAt: string;
  dns: DnsRecord[];
  ips: string[];
  http: {
    url: string;
    finalUrl: string;
    status: number | null;
    https: boolean;
    server: string | null;
    poweredBy: string | null;
    title: string | null;
    securityHeaders: SecurityHeader[];
    cookies: string[];
  } | null;
  cms: string | null;
  tech: string[];
  subdomains: Subdomain[];
  grade: { score: number; max: number; notes: string[] };
  errors: string[];
}

const SECURITY_HEADERS = [
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
];

export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  return d.replace(/^www\./, "");
}

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((res) => setTimeout(() => res(fallback), ms))]);
}

async function resolveRecords(domain: string): Promise<{ dns: DnsRecord[]; ips: string[] }> {
  const lookups: [string, () => Promise<string[]>][] = [
    ["A", () => dns.resolve4(domain)],
    ["AAAA", () => dns.resolve6(domain)],
    ["MX", async () => (await dns.resolveMx(domain)).map((m) => `${m.priority} ${m.exchange}`)],
    ["NS", () => dns.resolveNs(domain)],
    ["TXT", async () => (await dns.resolveTxt(domain)).map((t) => t.join(""))],
    ["CNAME", () => dns.resolveCname(domain)],
    ["SOA", async () => { const s = await dns.resolveSoa(domain); return [`${s.nsname} ${s.hostmaster}`]; }],
  ];

  const results = await Promise.all(
    lookups.map(async ([type, fn]) => {
      try {
        const records = await withTimeout(fn(), 5000, [] as string[]);
        return { type, records };
      } catch {
        return { type, records: [] as string[] };
      }
    })
  );

  const dnsRecords = results.filter((r) => r.records.length > 0);
  const ips = [
    ...(dnsRecords.find((r) => r.type === "A")?.records ?? []),
    ...(dnsRecords.find((r) => r.type === "AAAA")?.records ?? []),
  ];
  return { dns: dnsRecords, ips };
}

function detectTech(html: string, headers: Headers): { cms: string | null; tech: string[] } {
  const tech = new Set<string>();
  let cms: string | null = null;
  const h = (k: string) => (headers.get(k) ?? "").toLowerCase();
  const body = html.toLowerCase();
  const genMatch = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i);
  const generator = genMatch?.[1] ?? "";

  const mark = (name: string, isCms = false) => { tech.add(name); if (isCms && !cms) cms = name; };

  if (body.includes("/wp-content/") || body.includes("/wp-includes/") || body.includes("wp-json") || /wordpress/i.test(generator)) mark("WordPress", true);
  if (/joomla/i.test(generator) || body.includes("/media/jui/") || body.includes("com_content")) mark("Joomla", true);
  if (/drupal/i.test(generator) || h("x-generator").includes("drupal") || h("x-drupal-cache") !== "") mark("Drupal", true);
  if (body.includes("cdn.shopify.com") || h("x-shopid") !== "" || body.includes("shopify")) mark("Shopify", true);
  if (h("x-wix-request-id") !== "" || body.includes("wix.com") || body.includes("_wixcss")) mark("Wix", true);
  if (body.includes("squarespace") || h("server").includes("squarespace")) mark("Squarespace", true);
  if (/ghost/i.test(generator) || body.includes("content=\"ghost")) mark("Ghost", true);
  if (body.includes("/skin/frontend/") || body.includes("magento") || h("x-magento-cache-debug") !== "") mark("Magento", true);
  if (body.includes("webflow")) mark("Webflow", true);

  // Server / framework / CDN
  const server = h("server");
  for (const s of ["nginx", "apache", "litespeed", "microsoft-iis", "cloudflare", "openresty", "caddy"]) {
    if (server.includes(s)) tech.add(s === "microsoft-iis" ? "IIS" : s.charAt(0).toUpperCase() + s.slice(1));
  }
  const powered = h("x-powered-by");
  if (powered.includes("php")) tech.add("PHP");
  if (powered.includes("asp.net")) tech.add("ASP.NET");
  if (powered.includes("express")) tech.add("Express");
  if (powered.includes("next.js") || body.includes("__next_data__") || body.includes("/_next/")) tech.add("Next.js");
  if (body.includes("/cdn-cgi/")) tech.add("Cloudflare");
  if (generator && ![...tech].some((t) => generator.toLowerCase().includes(t.toLowerCase()))) tech.add(generator);

  return { cms, tech: [...tech] };
}

async function probeHttp(domain: string): Promise<{ http: ScanResult["http"]; cms: string | null; tech: string[] }> {
  const tryFetch = async (url: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const res = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { "User-Agent": "FixsmithRMM-Recon/1.0" } });
      const text = (await res.text()).slice(0, 200_000);
      return { res, text };
    } finally {
      clearTimeout(timer);
    }
  };

  let result: { res: Response; text: string } | null = null;
  const startUrl = `https://${domain}`;
  try {
    result = await tryFetch(startUrl);
  } catch {
    try {
      result = await tryFetch(`http://${domain}`);
    } catch {
      return { http: null, cms: null, tech: [] };
    }
  }

  const { res, text } = result;
  const { cms, tech } = detectTech(text, res.headers);
  const titleMatch = text.match(/<title[^>]*>([^<]*)<\/title>/i);
  const cookies = (res.headers.get("set-cookie") ?? "").split(/,(?=[^;]+=)/).map((c) => c.split("=")[0].trim()).filter(Boolean);

  return {
    http: {
      url: startUrl,
      finalUrl: res.url,
      status: res.status,
      https: res.url.startsWith("https://"),
      server: res.headers.get("server"),
      poweredBy: res.headers.get("x-powered-by"),
      title: titleMatch?.[1]?.trim() ?? null,
      securityHeaders: SECURITY_HEADERS.map((name) => ({ name, present: res.headers.has(name), value: res.headers.get(name) })),
      cookies: [...new Set(cookies)],
    },
    cms,
    tech,
  };
}

async function findSubdomains(domain: string): Promise<Subdomain[]> {
  // Certificate Transparency logs via crt.sh — a passive, public source.
  let names: string[] = [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(`https://crt.sh/?q=${encodeURIComponent("%." + domain)}&output=json`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as { name_value: string }[];
      const set = new Set<string>();
      for (const row of data) {
        for (const n of row.name_value.split("\n")) {
          const name = n.trim().toLowerCase().replace(/^\*\./, "");
          if (name.endsWith(domain) && name !== domain) set.add(name);
        }
      }
      names = [...set].sort();
    }
  } catch {
    return [];
  }

  // Resolve up to 40 subdomains (concurrency-limited) to an IP.
  const limited = names.slice(0, 40);
  const out: Subdomain[] = [];
  for (let i = 0; i < limited.length; i += 8) {
    const batch = limited.slice(i, i + 8);
    const resolved = await Promise.all(
      batch.map(async (name) => {
        try {
          const ips = await withTimeout(dns.resolve4(name), 3000, [] as string[]);
          return { name, ip: ips[0] ?? null };
        } catch {
          return { name, ip: null };
        }
      })
    );
    out.push(...resolved);
  }
  // Include any beyond the resolve cap as name-only.
  for (const name of names.slice(40)) out.push({ name, ip: null });
  return out;
}

function grade(result: Omit<ScanResult, "grade">): ScanResult["grade"] {
  const notes: string[] = [];
  let score = 0;
  const max = 6;
  const http = result.http;
  if (http?.https) score++; else notes.push("No HTTPS");
  const sh = (n: string) => http?.securityHeaders.find((h) => h.name === n)?.present;
  if (sh("strict-transport-security")) score++; else notes.push("Missing HSTS");
  if (sh("content-security-policy")) score++; else notes.push("Missing Content-Security-Policy");
  if (sh("x-frame-options")) score++; else notes.push("Missing X-Frame-Options");
  if (sh("x-content-type-options")) score++; else notes.push("Missing X-Content-Type-Options");
  if (sh("referrer-policy")) score++; else notes.push("Missing Referrer-Policy");
  return { score, max, notes };
}

export async function scanSite(rawDomain: string): Promise<ScanResult> {
  const domain = normalizeDomain(rawDomain);
  const errors: string[] = [];

  const [dnsResult, httpResult, subdomains] = await Promise.all([
    resolveRecords(domain).catch((e) => { errors.push(`DNS: ${e}`); return { dns: [], ips: [] }; }),
    probeHttp(domain).catch((e) => { errors.push(`HTTP: ${e}`); return { http: null, cms: null, tech: [] }; }),
    findSubdomains(domain).catch((e) => { errors.push(`Subdomains: ${e}`); return [] as Subdomain[]; }),
  ]);

  const partial: Omit<ScanResult, "grade"> = {
    domain,
    scannedAt: new Date().toISOString(),
    dns: dnsResult.dns,
    ips: dnsResult.ips,
    http: httpResult.http,
    cms: httpResult.cms,
    tech: httpResult.tech,
    subdomains,
    errors,
  };
  return { ...partial, grade: grade(partial) };
}
