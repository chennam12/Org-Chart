const $ = (selector) => document.querySelector(selector);
const companySelect = $("#companySelect");
const peopleSearch = $("#peopleSearch");
const chartViewport = $("#chartViewport");
const resetView = $("#resetView");
const companyFinder = $("#companyFinder");
const companyFinderForm = $("#companyFinderForm");
const companySuggestions = $("#companySuggestions");
const quickStartCompanies = $("#quickStartCompanies");
const finderStatus = $("#finderStatus");
const companyLogo = $("#companyLogo");
const companyName = $("#companyName");
const companyDescription = $("#companyDescription");
const companyMeta = $("#companyMeta");
const profileStats = $("#profileStats");
const leadershipGrid = $("#leadershipGrid");
const departmentGrid = $("#departmentGrid");
const directorySearch = $("#directorySearch");
const deptChips = $("#deptChips");
const directoryList = $("#directoryList");
const askForm = $("#askForm");
const askInput = $("#askInput");
const askAnswer = $("#askAnswer");

let companies = [];
let companyData = [];
let currentCompany = null;
let currentInference = null;
let model = null;
let searchValue = "";
let directoryQuery = "";
let directoryDept = "All";
let tracePath = new Set();
let tracedPersonId = null;

const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
const normalize = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const slugify = (value) => normalize(value).replace(/\s+/g, "-");

const departmentAliases = {
  engineering: "Engineering",
  eng: "Engineering",
  technology: "Engineering",
  tech: "Engineering",
  data: "Data",
  analytics: "Data",
  "data analytics": "Data",
  product: "Product",
  prod: "Product",
  sales: "Sales",
  commercial: "Sales",
  marketing: "Marketing",
  mktg: "Marketing",
  finance: "Finance",
  fin: "Finance",
  accounting: "Finance",
  people: "People",
  hr: "People",
  "human resources": "People",
  "customer success": "Customer Success",
  cs: "Customer Success",
  "client services": "Customer Success",
  operations: "Operations",
  ops: "Operations",
  security: "Security",
  infosec: "Security",
  "information security": "Security",
  legal: "Legal",
  compliance: "Legal",
};
const departmentTerms = {
  Engineering: [
    "engineering",
    "engineer",
    "technology",
    "tech",
    "devops",
    "software",
    "platform",
    "quality assurance",
    "qa",
  ],
  Data: [
    "data",
    "analytics",
    "analyst",
    "scientist",
    "business intelligence",
    "bi",
  ],
  Product: ["product", "design", "ux", "user experience", "research"],
  Sales: [
    "sales",
    "revenue",
    "account executive",
    "commercial",
    "business development",
  ],
  Marketing: ["marketing", "growth", "content", "brand", "demand generation"],
  Finance: [
    "finance",
    "financial",
    "accounting",
    "accountant",
    "fp&a",
    "payroll",
  ],
  People: ["people", "human resources", "hr ", "recruit", "talent acquisition"],
  "Customer Success": [
    "customer success",
    "customer support",
    "customer service",
    "client services",
    "implementation",
  ],
  Operations: ["operations", "operational", "supply chain", "workplace"],
  Security: [
    "security",
    "infosec",
    "information security",
    "incident response",
    "grc",
  ],
  Legal: [
    "legal",
    "counsel",
    "paralegal",
    "compliance",
    "contracts",
    "privacy",
  ],
};
const departmentColors = {
  Engineering: "#2f6f57",
  Data: "#3b6ea8",
  Product: "#8a5cb0",
  Sales: "#c0683a",
  Marketing: "#c2427a",
  Finance: "#7d7a2c",
  People: "#b08a2e",
  "Customer Success": "#2e8a8a",
  Operations: "#5d6b7a",
  Security: "#a33b3b",
  Legal: "#4b5563",
  Unclassified: "#9aa39c",
};

const deptColor = (department) =>
  departmentColors[department] || departmentColors.Unclassified;

function classifyDepartment(employee) {
  const explicit = normalize(employee.department);
  if (departmentAliases[explicit])
    return { department: departmentAliases[explicit], explicit: true };
  const title = ` ${normalize(employee.title)} `;
  const matches = Object.entries(departmentTerms)
    .filter(([, terms]) =>
      terms.some((term) => title.includes(` ${normalize(term)} `)),
    )
    .map(([department]) => department);
  return {
    department: matches.length === 1 ? matches[0] : null,
    explicit: false,
  };
}

const departmentOf = (employee) =>
  classifyDepartment(employee).department || "Unclassified";

function seniority(title) {
  const value = normalize(title);
  if (!value) return null;
  if (
    /\b(ceo|chief executive officer|founder ceo|founder and ceo|co founder and ceo)\b/.test(
      value,
    )
  )
    return 0;
  if (/\b(chief|president|svp|evp|vp|vice president|head)\b/.test(value))
    return 1;
  if (/\bdirector\b/.test(value)) return 2;
  if (
    /\bmanager\b/.test(value) &&
    !/\b(product manager|project manager|account manager|customer success manager)\b/.test(
      value,
    )
  )
    return 3;
  if (/\b(team lead|lead)\b/.test(value)) return 4;
  if (/\b(staff|principal|senior)\b/.test(value)) return 6;
  return 6;
}

const EXECUTIVE_FALLBACK_CONFIDENCE = 0.6;

function inferOrg(company) {
  const profiles = new Map(
    company.employees.map((employee) => {
      const classification = classifyDepartment(employee);
      return [
        employee.id,
        {
          department: classification.department,
          explicitDepartment: classification.explicit,
          team: normalize(employee.team),
          rank: seniority(employee.title),
        },
      ];
    }),
  );
  const ceos = company.employees.filter(
    (employee) => profiles.get(employee.id).rank === 0,
  );
  const edges = new Map();
  for (const employee of company.employees) {
    const person = profiles.get(employee.id);
    if (person.rank === null || person.rank === 0) continue;
    if (!person.department) {
      if (person.rank === 1 && ceos.length === 1)
        edges.set(employee.id, {
          managerId: ceos[0].id,
          confidence: EXECUTIVE_FALLBACK_CONFIDENCE,
        });
      continue;
    }
    const candidates = [];
    for (const candidate of company.employees) {
      if (candidate.id === employee.id) continue;
      const manager = profiles.get(candidate.id);
      if (
        manager.rank === null ||
        manager.rank >= person.rank ||
        manager.department !== person.department
      )
        continue;
      if (person.team && manager.team && person.team !== manager.team) continue;
      candidates.push({ candidate, manager });
    }
    let usableCandidates = candidates;
    if (person.rank >= 5) {
      usableCandidates = candidates.filter((item) =>
        [2, 3, 4].includes(item.manager.rank),
      );
      if (person.team) {
        usableCandidates = usableCandidates.filter(
          (item) => item.manager.team === person.team,
        );
        if (!usableCandidates.length) continue;
      } else if (usableCandidates.length !== 1) {
        continue;
      }
    }
    if (!usableCandidates.length) {
      if (person.rank === 1 && ceos.length === 1)
        edges.set(employee.id, {
          managerId: ceos[0].id,
          confidence: EXECUTIVE_FALLBACK_CONFIDENCE,
        });
      continue;
    }
    const closestRank = Math.max(
      ...usableCandidates.map((item) => item.manager.rank),
    );
    const closest = usableCandidates.filter(
      (item) => item.manager.rank === closestRank,
    );
    if (closest.length !== 1) continue;
    const { candidate: manager, manager: managerProfile } = closest[0];
    const teamMatch = Boolean(
      person.team && managerProfile.team && person.team === managerProfile.team,
    );
    const explicitMatch =
      person.explicitDepartment && managerProfile.explicitDepartment;
    const uniqueCandidate =
      usableCandidates.filter((item) => item.manager.rank === closestRank)
        .length === 1;
    const confidence = Math.min(
      0.95,
      0.57 +
        (teamMatch ? 0.18 : 0) +
        (explicitMatch ? 0.1 : 0) +
        (uniqueCandidate ? 0.1 : 0),
    );
    edges.set(employee.id, {
      managerId: manager.id,
      confidence: Math.round(confidence * 100),
    });
  }
  return { ceoId: ceos.length === 1 ? ceos[0].id : null, edges };
}

function buildModel() {
  const peopleById = new Map(
    currentCompany.employees.map((person) => [person.id, person]),
  );
  const children = new Map();
  const unresolved = [];
  for (const person of currentCompany.employees) {
    const edge = currentInference.edges.get(person.id);
    if (edge && peopleById.has(edge.managerId)) {
      if (!children.has(edge.managerId)) children.set(edge.managerId, []);
      children.get(edge.managerId).push(person);
    } else if (person.id !== currentInference.ceoId) {
      unresolved.push(person);
    }
  }
  for (const reports of children.values())
    reports.sort((a, b) => a.name.localeCompare(b.name));
  const root =
    currentCompany.employees.find(
      (person) => person.id === currentInference.ceoId,
    ) || null;
  const edgeValues = [...currentInference.edges.values()];
  const average = edgeValues.length
    ? Math.round(
        edgeValues.reduce((sum, edge) => sum + edge.confidence, 0) /
          edgeValues.length,
      )
    : 0;
  const departmentCount = new Set(
    currentCompany.employees
      .map(departmentOf)
      .filter((d) => d !== "Unclassified"),
  ).size;
  return {
    peopleById,
    children,
    unresolved,
    root,
    stats: {
      edgeCount: edgeValues.length,
      unresolvedCount: unresolved.length,
      average,
      departmentCount,
    },
  };
}

function initials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function companyHue(name) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

const avatar = (person) =>
  `<span class="avatar" style="--dept:${deptColor(departmentOf(person))}" aria-hidden="true">${escapeHTML(initials(person.name))}</span>`;

function personCard(person, root = false) {
  const edge = currentInference.edges.get(person.id);
  const department = departmentOf(person);
  const active =
    searchValue && normalize(person.name).includes(normalize(searchValue));
  const traced = tracePath.has(person.id) ? " on-path" : "";
  const dimmed = tracePath.size && !tracePath.has(person.id) ? " dimmed" : "";
  const confidence = edge
    ? `<span class="confidence">${edge.confidence}%</span>`
    : "";
  return `<div class="person-card${root ? " is-root" : ""}${active ? " is-active" : ""}${traced}${dimmed}" data-person="${escapeHTML(person.id)}" style="--dept:${deptColor(department)}">
    <span class="person-head">${avatar(person)}<span class="person-id"><span class="person-name">${escapeHTML(person.name)}</span><span class="person-title">${escapeHTML(person.title || "Title not provided")}</span></span></span>
    <span class="person-dept"><span>${escapeHTML(department)}</span>${confidence}</span>
  </div>`;
}

function hasSearchMatch(person, children, visited) {
  if (normalize(person.name).includes(normalize(searchValue))) return true;
  if (visited.has(person.id)) return false;
  visited.add(person.id);
  return (model.children.get(person.id) || []).some((child) =>
    hasSearchMatch(child, children, visited),
  );
}

function renderDescendants(person, depth = 0) {
  const reports = model.children.get(person.id) || [];
  const visible = searchValue
    ? reports.filter((report) =>
        hasSearchMatch(report, model.children, new Set()),
      )
    : reports;
  if (!visible.length || depth >= 5) return "";
  return `<ul>${visible.map((report) => `<li>${personCard(report)}${renderDescendants(report, depth + 1)}</li>`).join("")}</ul>`;
}

function renderBranch(person, root = false) {
  return `<div class="tree-root"><ul class="tree"><li>${personCard(person, root)}${renderDescendants(person)}</li></ul></div>`;
}

function pathToCeo(personId) {
  const path = [];
  const visited = new Set();
  let cursor = personId;
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    path.unshift(cursor);
    cursor = currentInference.edges.get(cursor)?.managerId;
  }
  return path[0] === currentInference.ceoId ? path : [];
}

function renderProfile() {
  const company = currentCompany;
  const { stats } = model;
  companyLogo.textContent = initials(company.name);
  companyLogo.style.setProperty("--logo-hue", companyHue(company.name));
  companyName.textContent = company.name;
  companyDescription.textContent = `${company.name} operates in ${company.industry.toLowerCase()} with ${company.employees.length} people on record. Reporting lines are inferred from titles, departments and teams; anything unclear is left unresolved.`;
  companyMeta.innerHTML = `<span class="company-pill">${escapeHTML(company.industry)}</span><span>${company.employees.length} people</span><span>${stats.departmentCount} departments</span>`;
  profileStats.innerHTML = [
    ["Employees", company.employees.length],
    ["Departments", stats.departmentCount],
    ["Inferred lines", stats.edgeCount],
    ["Unresolved", stats.unresolvedCount],
    ["Avg confidence", `${stats.average}%`],
  ]
    .map(
      ([label, value]) =>
        `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`,
    )
    .join("");
}

function renderChart() {
  if (!model.root) {
    chartViewport.innerHTML = `<div class="empty-state">A single CEO could not be identified for this company.</div>`;
    return;
  }
  if (searchValue) {
    const matched = currentCompany.employees.filter((person) =>
      normalize(person.name).includes(normalize(searchValue)),
    );
    if (!matched.length) {
      chartViewport.innerHTML = `<div class="empty-state">No people found for “${escapeHTML(searchValue)}”.</div>`;
      return;
    }
    const path = pathToCeo(matched[0].id);
    if (!path.length) {
      chartViewport.innerHTML = `<div class="empty-state">Found ${matched.length} match${matched.length === 1 ? "" : "es"}, but no complete inferred path to the CEO.</div>`;
      return;
    }
    chartViewport.innerHTML = `<div class="tree-root"><ul class="tree">${path
      .map((id, index) => {
        const person = model.peopleById.get(id);
        return `<li>${personCard(person, index === 0)}</li>`;
      })
      .join(
        "",
      )}</ul></div><div class="unresolved-row"><span class="unresolved-person">Showing reporting path for <b>${escapeHTML(matched[0].name)}</b></span></div>`;
    return;
  }
  const unresolved = model.unresolved;
  const unresolvedPeople = unresolved
    .slice(0, 12)
    .map(
      (person) =>
        `<span class="unresolved-person"><b>${escapeHTML(person.name)}</b> · ${escapeHTML(person.title || "Title missing")}</span>`,
    )
    .join("");
  chartViewport.innerHTML = `${renderBranch(model.root, true)}${unresolved.length ? `<div class="unresolved-row"><div class="unresolved-box"><strong>${unresolved.length} unresolved</strong><span>Not placed in the tree. The inference abstained where evidence was missing or ambiguous.</span></div>${unresolvedPeople}</div>` : ""}`;
}

function renderLeadership() {
  const leaders = currentCompany.employees
    .map((person) => ({ person, rank: seniority(person.title) }))
    .filter((item) => item.rank !== null && item.rank <= 2)
    .sort(
      (a, b) => a.rank - b.rank || a.person.name.localeCompare(b.person.name),
    );
  if (!leaders.length) {
    leadershipGrid.innerHTML = `<div class="empty-state">No senior leadership titles were found.</div>`;
    return;
  }
  leadershipGrid.innerHTML = leaders
    .map(({ person }) => {
      const edge = currentInference.edges.get(person.id);
      const manager = edge ? model.peopleById.get(edge.managerId) : null;
      const reports = (model.children.get(person.id) || []).length;
      const reportsLine = manager
        ? `Reports to <b>${escapeHTML(manager.name)}</b> · ${edge.confidence}%`
        : person.id === currentInference.ceoId
          ? "Top of the inferred chart"
          : "Reporting line unresolved";
      return `<article class="leader-card" style="--dept:${deptColor(departmentOf(person))}">
      <div class="leader-top">${avatar(person)}<div><strong>${escapeHTML(person.name)}</strong><span>${escapeHTML(person.title)}</span></div></div>
      <div class="leader-meta"><span>${escapeHTML(departmentOf(person))}</span><span>${reports} direct report${reports === 1 ? "" : "s"}</span></div>
      <div class="leader-reports">${reportsLine}</div>
    </article>`;
    })
    .join("");
}

function departmentGroups() {
  const groups = new Map();
  for (const person of currentCompany.employees) {
    const department = departmentOf(person);
    if (!groups.has(department)) groups.set(department, []);
    groups.get(department).push(person);
  }
  return [...groups.entries()].sort(([a, x], [b, y]) => {
    if (a === "Unclassified") return 1;
    if (b === "Unclassified") return -1;
    return y.length - x.length || a.localeCompare(b);
  });
}

function renderDepartments() {
  const total = currentCompany.employees.length;
  departmentGrid.innerHTML = departmentGroups()
    .map(([department, members]) => {
      const lead = [...members].sort(
        (a, b) =>
          (seniority(a.title) ?? 9) - (seniority(b.title) ?? 9) ||
          a.name.localeCompare(b.name),
      )[0];
      const teams = new Set(
        members.map((person) => normalize(person.team)).filter(Boolean),
      ).size;
      const share = Math.round((members.length / total) * 100);
      return `<button class="dept-card" type="button" data-dept="${escapeHTML(department)}" style="--dept:${deptColor(department)}">
      <div class="dept-top"><span class="dept-dot"></span><strong>${escapeHTML(department)}</strong><span>${members.length}</span></div>
      <div class="dept-bar"><i style="width:${share}%"></i></div>
      <div class="dept-lead">${lead ? `<b>${escapeHTML(lead.name)}</b> · ${escapeHTML(lead.title)}` : "No clear lead"}</div>
      <div class="dept-foot">${teams} team${teams === 1 ? "" : "s"} · ${share}% of company</div>
    </button>`;
    })
    .join("");
}

function renderDirectory() {
  const groups = departmentGroups();
  deptChips.innerHTML = [
    ["All", currentCompany.employees.length],
    ...groups.map(([d, m]) => [d, m.length]),
  ]
    .map(
      ([label, count]) =>
        `<button class="chip${directoryDept === label ? " is-active" : ""}" type="button" data-dept="${escapeHTML(label)}">${escapeHTML(label)}<small>${count}</small></button>`,
    )
    .join("");
  const query = normalize(directoryQuery);
  const matches = currentCompany.employees
    .filter((person) => {
      if (directoryDept !== "All" && departmentOf(person) !== directoryDept)
        return false;
      if (!query) return true;
      return normalize(
        [person.name, person.title, person.team, person.location].join(" "),
      ).includes(query);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const shown = matches.slice(0, 200);
  const rows = shown
    .map((person) => {
      const edge = currentInference.edges.get(person.id);
      const manager = edge ? model.peopleById.get(edge.managerId) : null;
      const managerCell = manager
        ? `${escapeHTML(manager.name)} <span class="confidence">${edge.confidence}%</span>`
        : person.id === currentInference.ceoId
          ? `<span class="muted">Top of chart</span>`
          : `<span class="muted">Unresolved</span>`;
      return `<tr>
      <td><div class="cell-person">${avatar(person)}<span><b>${escapeHTML(person.name)}</b><small>${escapeHTML(person.location || "Location unknown")}</small></span></div></td>
      <td>${escapeHTML(person.title || "—")}</td>
      <td><span class="dept-tag" style="--dept:${deptColor(departmentOf(person))}">${escapeHTML(departmentOf(person))}</span></td>
      <td>${escapeHTML(person.team || "—")}</td>
      <td>${managerCell}</td>
    </tr>`;
    })
    .join("");
  directoryList.innerHTML = matches.length
    ? `<table class="directory"><thead><tr><th>Person</th><th>Title</th><th>Function</th><th>Team</th><th>Reports to</th></tr></thead><tbody>${rows}</tbody></table>${matches.length > shown.length ? `<div class="directory-note">Showing ${shown.length} of ${matches.length}. Refine the filter to see more.</div>` : ""}`
    : `<div class="empty-state">No people match these filters.</div>`;
}

function renderAll() {
  renderProfile();
  renderChart();
  renderLeadership();
  renderDepartments();
  renderDirectory();
}

function answerQuestion(question) {
  const raw = normalize(question);
  if (!raw) return "";
  const stop = new Set([
    "who",
    "does",
    "do",
    "the",
    "a",
    "an",
    "of",
    "is",
    "in",
    "at",
    "report",
    "reports",
    "to",
    "runs",
    "run",
    "leads",
    "lead",
    "heads",
    "head",
    "owns",
    "own",
    "manages",
    "manage",
    "for",
    "and",
    "what",
    "where",
    "which",
  ]);
  const words = raw.split(" ").filter((word) => word && !stop.has(word));
  const asksManager = /\b(report|reports|reporting|manager|boss|above)\b/.test(
    raw,
  );
  const asksLeader =
    /\b(runs|run|leads|lead|owns|own|in charge|heads|head)\b/.test(raw) &&
    !asksManager;

  if (asksLeader) {
    const department =
      Object.keys(departmentTerms).find((name) =>
        raw.includes(normalize(name)),
      ) ||
      Object.keys(departmentTerms).find((name) =>
        departmentTerms[name].some((term) => raw.includes(normalize(term))),
      );
    if (!department)
      return "I couldn't tell which function you mean. Try “who runs data?” or “who leads security?”.";
    const members = currentCompany.employees.filter(
      (person) => departmentOf(person) === department,
    );
    if (!members.length) return `No one in ${department} at this company.`;
    const ranked = members
      .map((person) => ({ person, rank: seniority(person.title) ?? 9 }))
      .sort(
        (a, b) => a.rank - b.rank || a.person.name.localeCompare(b.person.name),
      );
    const top = ranked.filter((item) => item.rank === ranked[0].rank);
    if (top.length > 1 || top[0].rank > 4) {
      return `${department} has no single clear leader. Candidates: ${top
        .slice(0, 4)
        .map((item) => `${item.person.name} (${item.person.title})`)
        .join(", ")}.`;
    }
    const leader = top[0].person;
    return `${leader.name} leads ${department} — ${leader.title}. Based on title seniority within the function.`;
  }

  if (asksManager) {
    const target = words.filter(
      (word) => !["head", "chief", "of"].includes(word),
    );
    const people = currentCompany.employees.filter((person) => {
      const haystack = normalize(`${person.title} ${person.name}`);
      return target.length && target.every((word) => haystack.includes(word));
    });
    if (!people.length)
      return "No one matches that title or name at this company.";
    const person = people[0];
    const edge = currentInference.edges.get(person.id);
    if (person.id === currentInference.ceoId)
      return `${person.name} is the top of the inferred chart.`;
    if (!edge)
      return `${person.name} (${person.title}) — the reporting line is unresolved. The inference abstained rather than guess.`;
    const manager = model.peopleById.get(edge.managerId);
    return `${person.name} (${person.title}) reports to ${manager.name} (${manager.title}) — ${edge.confidence}% confidence.`;
  }

  return "Try asking “who runs data?” or “who does the Head of Security report to?”.";
}

function selectCompanyFromHash() {
  const match = location.hash.match(/^#\/org\/([^/?#]+)/);
  if (!match) return null;
  return (
    companies.find((company) => slugify(company.name) === match[1]) || null
  );
}

async function loadCompany(companyId) {
  const company = companyData.find((item) => item.id === companyId);
  if (!company)
    throw new Error(`Company ${companyId} was not found in the dataset.`);
  currentCompany = company;
  $("#workspace").hidden = false;
  currentInference = inferOrg(company);
  model = buildModel();
  searchValue = "";
  directoryQuery = "";
  directoryDept = "All";
  tracePath = new Set();
  tracedPersonId = null;
  peopleSearch.value = "";
  directorySearch.value = "";
  askAnswer.textContent = "";
  companySelect.value = company.id;
  companyFinder.value = company.name;
  finderStatus.textContent = `${company.industry} · ${company.employees.length} people`;
  renderAll();
}

function showCompanyDirectory() {
  currentCompany = null;
  $("#workspace").hidden = true;
  companyFinder.value = "";
  companySelect.selectedIndex = -1;
  finderStatus.textContent = `${companies.length} companies · search or pick one to explore`;
  history.replaceState(null, "", "#/org");
}

async function selectCompany(companyId, { scroll = false } = {}) {
  const company = companies.find((item) => item.id === companyId);
  if (!company) return;
  const hash = `#/org/${slugify(company.name)}`;
  if (location.hash !== hash) history.pushState(null, "", hash);
  if (currentCompany?.id !== companyId) await loadCompany(companyId);
  if (scroll)
    $("#workspace").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showTab(tab) {
  document.querySelectorAll(".tab").forEach((button) => {
    const selected = button.dataset.tab === tab;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tab;
  });
}

function populateDiscovery() {
  companySuggestions.innerHTML = companies
    .map(
      (company) =>
        `<option value="${escapeHTML(company.name)}">${escapeHTML(company.industry)} · ${company.headcount} people</option>`,
    )
    .join("");
  const picksByIndustry = new Map();
  for (const company of companies) {
    if (!picksByIndustry.has(company.industry))
      picksByIndustry.set(company.industry, company);
    if (picksByIndustry.size === 4) break;
  }
  quickStartCompanies.innerHTML = [...picksByIndustry.values()]
    .map(
      (company) =>
        `<button class="quick-pick" type="button" data-company="${escapeHTML(company.id)}"><span>${escapeHTML(company.industry)}</span><strong>${escapeHTML(company.name)}</strong></button>`,
    )
    .join("");
}

async function start() {
  try {
    const response = await fetch("data/index.json");
    if (!response.ok)
      throw new Error(`Could not load company directory (${response.status}).`);
    companies = await response.json();
    const dataResponse = await fetch("data/companies.json");
    if (!dataResponse.ok)
      throw new Error(`Could not load company data (${dataResponse.status}).`);
    companyData = await dataResponse.json();
    companySelect.innerHTML = companies
      .map(
        (company) =>
          `<option value="${escapeHTML(company.id)}">${escapeHTML(company.name)} · ${company.headcount}</option>`,
      )
      .join("");
    companySelect.disabled = false;
    populateDiscovery();
    const initial = selectCompanyFromHash();
    if (initial) await loadCompany(initial.id);
    else showCompanyDirectory();
  } catch (error) {
    companyName.textContent = "Could not load companies";
    companyDescription.textContent = `${error.message} Start a local server from the project directory (for example, python3 -m http.server).`;
    chartViewport.innerHTML = `<div class="empty-state">The org chart could not be loaded.</div>`;
  }
}

companyFinderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = normalize(companyFinder.value);
  if (!query) {
    finderStatus.textContent = "Enter a company name to explore.";
    return;
  }
  const matches = companies.filter((company) =>
    normalize(company.name).includes(query),
  );
  const exactMatch = matches.find(
    (company) => normalize(company.name) === query,
  );
  const company = exactMatch || (matches.length === 1 ? matches[0] : null);
  if (!company) {
    finderStatus.textContent = matches.length
      ? `${matches.length} matches found. Choose a company from the suggestions.`
      : "No company found. Try another name.";
    return;
  }
  await selectCompany(company.id, { scroll: true });
});

quickStartCompanies.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-company]");
  if (!button) return;
  await selectCompany(button.dataset.company, { scroll: true });
});

companySelect.addEventListener("change", () =>
  selectCompany(companySelect.value),
);

window.addEventListener("popstate", async () => {
  const company = selectCompanyFromHash();
  if (company) {
    if (company.id !== currentCompany?.id) await loadCompany(company.id);
  } else if (currentCompany) {
    showCompanyDirectory();
  }
});

document.querySelector(".tabs").addEventListener("click", (event) => {
  const button = event.target.closest(".tab");
  if (button) showTab(button.dataset.tab);
});

peopleSearch.addEventListener("input", () => {
  searchValue = peopleSearch.value.trim();
  renderChart();
});

resetView.addEventListener("click", () => {
  searchValue = "";
  peopleSearch.value = "";
  tracePath = new Set();
  askAnswer.textContent = "";
  renderChart();
});

chartViewport.addEventListener("click", (event) => {
  const card = event.target.closest("[data-person]");
  if (!card || !model) return;
  const id = card.dataset.person;
  const path = pathToCeo(id);
  const wasTraced = tracedPersonId === id;
  tracedPersonId = wasTraced ? null : id;
  if (!path.length || wasTraced) {
    tracePath = new Set();
    askAnswer.textContent = "";
  } else {
    tracePath = new Set(path);
    const names = path.map((pid) => model.peopleById.get(pid).name);
    askAnswer.textContent = `Reporting path: ${names.join(" → ")}`;
  }
  renderChart();
});

askForm.addEventListener("submit", (event) => {
  event.preventDefault();
  askAnswer.textContent = answerQuestion(askInput.value);
});

directorySearch.addEventListener("input", () => {
  directoryQuery = directorySearch.value.trim();
  renderDirectory();
});

deptChips.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  directoryDept = chip.dataset.dept;
  renderDirectory();
});

departmentGrid.addEventListener("click", (event) => {
  const card = event.target.closest(".dept-card");
  if (!card) return;
  directoryDept = card.dataset.dept;
  directoryQuery = "";
  directorySearch.value = "";
  showTab("people");
  renderDirectory();
});

start();
