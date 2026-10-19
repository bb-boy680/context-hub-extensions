// src/index.ts
var ENDPOINT = "https://skills.sh/api/search";
var SITE = "https://www.skills.sh";
var MAX_RESULTS = 200;
var MIN_QUERY = 2;
function refusal(status, body) {
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed.error === "string" && parsed.error !== "") return parsed.error;
  } catch {
  }
  return `skills.sh answered ${status}`;
}
function rowOf(entry) {
  const name = typeof entry.skillId === "string" ? entry.skillId : entry.name;
  const source = typeof entry.source === "string" ? entry.source : void 0;
  if (typeof name !== "string" || name === "" || source === void 0) return null;
  return {
    name,
    source,
    package: source,
    ...typeof entry.installs === "number" ? { installs: entry.installs } : {}
  };
}
function descriptionOf(html) {
  const found = /<meta name="description" content="([^"]*)"/.exec(html);
  if (found === null || found[1] === "") return null;
  return found[1].replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function apply(scope) {
  const net = scope.host.net;
  if (net === null) {
    scope.host.log(
      "warn",
      "skills.sh: this form cannot reach the network, so the registry stays out"
    );
    return;
  }
  const known = /* @__PURE__ */ new Map();
  const registry = {
    id: "skills.sh",
    name: "skills.sh",
    minQuery: MIN_QUERY,
    async search({ query, offset, limit }) {
      const want = Math.min(offset + limit + 1, MAX_RESULTS);
      const reply = await net.request(
        `${ENDPOINT}?q=${encodeURIComponent(query)}&limit=${want}`
      );
      if (reply.status !== 200) throw new Error(refusal(reply.status, reply.body));
      const parsed = JSON.parse(reply.body);
      const entries = Array.isArray(parsed.skills) ? parsed.skills : [];
      const rows = entries.map(rowOf).filter((row) => row !== null);
      return {
        items: rows.slice(offset, offset + limit),
        hasMore: rows.length > offset + limit
      };
    },
    async describe(skill) {
      const source = skill.source;
      if (source === void 0) return {};
      const key = `${source}/${skill.name}`;
      const remembered = known.get(key);
      if (remembered !== void 0) {
        return remembered === null ? {} : { description: remembered };
      }
      const reply = await net.request(`${SITE}/${key}`);
      if (reply.status !== 200) throw new Error(refusal(reply.status, reply.body));
      const description = descriptionOf(reply.body);
      known.set(key, description);
      return description === null ? {} : { description };
    }
  };
  scope.skillRegistries.register(registry);
}
export {
  apply
};
