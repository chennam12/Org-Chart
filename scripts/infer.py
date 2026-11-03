"""Conservative title- and team-based reporting-line inference."""

import re
import unicodedata


EXECUTIVE_FALLBACK_CONFIDENCE = 0.6

DEPARTMENT_TERMS = {
    "Engineering": (
        "engineering",
        "engineer",
        "technology",
        "tech",
        "devops",
        "software",
        "platform",
        "quality assurance",
        "qa",
    ),
    "Data": ("data", "analytics", "scientist", "business intelligence", "bi"),
    "Product": ("product", "design", "ux", "user experience", "research"),
    "Sales": (
        "sales",
        "revenue",
        "account executive",
        "account manager",
        "commercial",
        "business development",
    ),
    "Marketing": ("marketing", "growth", "content", "brand", "demand generation"),
    "Finance": ("finance", "financial", "accounting", "accountant", "fp&a", "payroll"),
    "People": ("people", "human resources", "hr ", "recruit", "talent acquisition"),
    "Customer Success": (
        "customer success",
        "customer support",
        "customer service",
        "client services",
        "implementation",
    ),
    "Operations": ("operations", "operational", "supply chain", "workplace"),
    "Security": (
        "security",
        "infosec",
        "information security",
        "incident response",
        "grc",
    ),
    "Legal": ("legal", "counsel", "paralegal", "compliance", "contracts", "privacy"),
}
DEPARTMENT_ALIASES = {
    "engineering": "Engineering",
    "eng": "Engineering",
    "technology": "Engineering",
    "tech": "Engineering",
    "data": "Data",
    "analytics": "Data",
    "data analytics": "Data",
    "data & analytics": "Data",
    "product": "Product",
    "prod": "Product",
    "sales": "Sales",
    "commercial": "Sales",
    "marketing": "Marketing",
    "mktg": "Marketing",
    "finance": "Finance",
    "fin": "Finance",
    "accounting": "Finance",
    "people": "People",
    "hr": "People",
    "human resources": "People",
    "customer success": "Customer Success",
    "cs": "Customer Success",
    "client services": "Customer Success",
    "operations": "Operations",
    "ops": "Operations",
    "security": "Security",
    "infosec": "Security",
    "information security": "Security",
    "legal": "Legal",
    "compliance": "Legal",
}


def normalize(value):
    value = (
        unicodedata.normalize("NFKD", value or "")
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def classify_department(employee):
    explicit = normalize(employee.get("department", ""))
    if explicit in DEPARTMENT_ALIASES:
        return DEPARTMENT_ALIASES[explicit], True

    title = f" {normalize(employee.get('title', ''))} "
    matches = []
    for department, terms in DEPARTMENT_TERMS.items():
        if any(f" {normalize(term)} " in title for term in terms):
            matches.append(department)
    return (matches[0], False) if len(matches) == 1 else (None, False)


def seniority(title):
    title = normalize(title)
    if not title:
        return None
    if re.search(
        r"\b(ceo|chief executive officer|founder ceo|founder and ceo|co founder and ceo)\b",
        title,
    ):
        return 0
    if re.search(r"\b(chief|president|svp|evp|vp|vice president|head)\b", title):
        return 1
    if re.search(r"\bdirector\b", title):
        return 2
    if re.search(r"\b(manager)\b", title) and not re.search(
        r"\b(product manager|project manager|account manager|customer success manager)\b",
        title,
    ):
        return 3
    if re.search(r"\b(team lead|lead)\b", title):
        return 4
    if re.search(r"\b(staff|principal|senior)\b", title):
        return 6
    return 6


def infer_company(company):
    employees = company["employees"]
    profiles = {}
    for employee in employees:
        department, explicit_department = classify_department(employee)
        profiles[employee["id"]] = {
            "department": department,
            "explicit_department": explicit_department,
            "team": normalize(employee.get("team", "")),
            "rank": seniority(employee.get("title", "")),
        }

    ceos = [e for e in employees if profiles[e["id"]]["rank"] == 0]
    predictions = {}
    for employee in employees:
        person_id = employee["id"]
        person = profiles[person_id]
        if person["rank"] is None or person["rank"] == 0:
            continue
        if not person["department"]:
            if person["rank"] == 1 and len(ceos) == 1:
                predictions[person_id] = {
                    "manager_id": ceos[0]["id"],
                    "confidence": EXECUTIVE_FALLBACK_CONFIDENCE,
                }
            continue

        candidates = []
        for candidate in employees:
            if candidate["id"] == person_id:
                continue
            manager = profiles[candidate["id"]]
            if manager["rank"] is None or manager["rank"] >= person["rank"]:
                continue
            if manager["department"] != person["department"]:
                continue
            if person["team"] and manager["team"] and person["team"] != manager["team"]:
                continue
            candidates.append((manager["rank"], candidate, manager))

        if person["rank"] >= 5:
            manager_candidates = [item for item in candidates if item[0] in (2, 3, 4)]
            if person["team"]:
                manager_candidates = [
                    item
                    for item in manager_candidates
                    if item[2]["team"] == person["team"]
                ]
                if not manager_candidates:
                    continue
            elif len(manager_candidates) != 1:
                continue
            candidates = manager_candidates

        if not candidates:
            if person["rank"] == 1 and len(ceos) == 1:
                predictions[person_id] = {
                    "manager_id": ceos[0]["id"],
                    "confidence": EXECUTIVE_FALLBACK_CONFIDENCE,
                }
            continue
        closest_rank = max(rank for rank, _, _ in candidates)
        closest = [
            candidate for rank, candidate, manager in candidates if rank == closest_rank
        ]
        if len(closest) != 1:
            continue

        manager = closest[0]
        manager_profile = profiles[manager["id"]]
        team_match = bool(
            person["team"]
            and manager_profile["team"]
            and person["team"] == manager_profile["team"]
        )
        explicit_match = (
            person["explicit_department"] and manager_profile["explicit_department"]
        )
        unique_team_candidate = (
            sum(
                1
                for candidate in employees
                if profiles[candidate["id"]]["rank"] == closest_rank
                and profiles[candidate["id"]]["department"] == person["department"]
                and (
                    not person["team"]
                    or not profiles[candidate["id"]]["team"]
                    or profiles[candidate["id"]]["team"] == person["team"]
                )
            )
            == 1
        )
        confidence = (
            0.57
            + (0.18 if team_match else 0)
            + (0.1 if explicit_match else 0)
            + (0.1 if unique_team_candidate else 0)
        )
        confidence = min(confidence, 0.95)
        predictions[person_id] = {
            "manager_id": manager["id"],
            "confidence": round(confidence, 2),
        }

    return {"ceo_id": ceos[0]["id"] if len(ceos) == 1 else None, "edges": predictions}


def infer_all(companies):
    return {company["id"]: infer_company(company) for company in companies}
