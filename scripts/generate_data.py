#!/usr/bin/env python3
"""Generate a reproducible synthetic company and org-chart dataset."""

import argparse
import json
import random
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


INDUSTRIES = [
    "Software",
    "Financial Services",
    "Healthcare",
    "Retail",
    "Manufacturing",
    "Telecommunications",
    "Logistics",
    "Media",
    "Energy",
    "Professional Services",
]
LOCATIONS = [
    "New York, US",
    "London, UK",
    "Toronto, CA",
    "Sydney, AU",
    "Berlin, DE",
    "Singapore, SG",
    "Austin, US",
    "Dublin, IE",
    "Bengaluru, IN",
    "Amsterdam, NL",
]
DEPARTMENTS = {
    "Engineering": {
        "heads": [
            "VP of Engineering",
            "Chief Technology Officer",
            "Head of Engineering",
        ],
        "manager": [
            "Engineering Manager",
            "Software Engineering Manager",
            "Platform Team Lead",
        ],
        "ic": [
            "Software Engineer",
            "Platform Engineer",
            "QA Engineer",
            "DevOps Engineer",
        ],
    },
    "Data": {
        "heads": ["VP of Data", "Chief Data Officer", "Head of Data & Analytics"],
        "manager": ["Data Engineering Manager", "Analytics Manager", "Data Team Lead"],
        "ic": ["Data Analyst", "Data Scientist", "Analytics Engineer", "Data Engineer"],
    },
    "Product": {
        "heads": ["VP of Product", "Chief Product Officer", "Head of Product"],
        "manager": [
            "Product Operations Manager",
            "Product Design Manager",
            "Product Team Lead",
        ],
        "ic": [
            "Product Designer",
            "Product Analyst",
            "Product Specialist",
            "UX Researcher",
        ],
    },
    "Sales": {
        "heads": ["VP of Sales", "Chief Revenue Officer", "Head of Sales"],
        "manager": ["Sales Manager", "Enterprise Sales Manager", "Sales Team Lead"],
        "ic": [
            "Account Executive",
            "Sales Development Representative",
            "Enterprise Account Executive",
        ],
    },
    "Marketing": {
        "heads": ["VP of Marketing", "Chief Marketing Officer", "Head of Marketing"],
        "manager": [
            "Growth Marketing Manager",
            "Marketing Operations Manager",
            "Marketing Team Lead",
        ],
        "ic": [
            "Growth Marketer",
            "Content Strategist",
            "Marketing Specialist",
            "Brand Designer",
        ],
    },
    "Finance": {
        "heads": ["Chief Financial Officer", "VP of Finance", "Head of Finance"],
        "manager": ["Finance Manager", "Accounting Manager", "FP&A Team Lead"],
        "ic": ["Financial Analyst", "Accountant", "FP&A Analyst", "Payroll Specialist"],
    },
    "People": {
        "heads": ["Chief Human Resources Officer", "VP of People", "Head of People"],
        "manager": [
            "People Operations Manager",
            "Talent Acquisition Manager",
            "People Team Lead",
        ],
        "ic": [
            "Recruiter",
            "HR Generalist",
            "People Operations Specialist",
            "Talent Partner",
        ],
    },
    "Customer Success": {
        "heads": [
            "VP of Customer Success",
            "Chief Customer Officer",
            "Head of Customer Success",
        ],
        "manager": [
            "Customer Success Team Manager",
            "Support Manager",
            "Customer Success Team Lead",
        ],
        "ic": [
            "Customer Success Associate",
            "Customer Support Specialist",
            "Implementation Specialist",
        ],
    },
    "Operations": {
        "heads": ["Chief Operating Officer", "VP of Operations", "Head of Operations"],
        "manager": [
            "Business Operations Manager",
            "Operations Manager",
            "Operations Team Lead",
        ],
        "ic": [
            "Operations Analyst",
            "Operations Specialist",
            "Business Operations Associate",
        ],
    },
    "Security": {
        "heads": [
            "Chief Information Security Officer",
            "VP of Security",
            "Head of Security",
        ],
        "manager": [
            "Security Engineering Manager",
            "Security Operations Manager",
            "Security Team Lead",
        ],
        "ic": [
            "Security Analyst",
            "Security Engineer",
            "GRC Analyst",
            "Incident Response Analyst",
        ],
    },
    "Legal": {
        "heads": ["General Counsel", "VP of Legal", "Head of Legal"],
        "manager": [
            "Legal Operations Manager",
            "Compliance Manager",
            "Legal Team Lead",
        ],
        "ic": [
            "Legal Counsel",
            "Paralegal",
            "Compliance Analyst",
            "Contracts Specialist",
        ],
    },
}
DEPARTMENT_ALIASES = {
    "Engineering": ["Engineering", "eng", "Eng.", "Technology"],
    "Data": ["Data", "Analytics", "Data & Analytics"],
    "Product": ["Product", "Prod"],
    "Sales": ["Sales", "Commercial"],
    "Marketing": ["Marketing", "Mktg"],
    "Finance": ["Finance", "Fin.", "Accounting"],
    "People": ["People", "HR", "Human Resources"],
    "Customer Success": ["Customer Success", "CS", "Client Services"],
    "Operations": ["Operations", "Ops"],
    "Security": ["Security", "InfoSec", "Information Security"],
    "Legal": ["Legal", "Compliance"],
}
TEAMS = {
    "Engineering": ["Platform", "Core Product", "Infrastructure", "Quality"],
    "Data": ["Analytics", "Data Platform", "Business Intelligence", "Applied Science"],
    "Product": ["Core Product", "Design", "Research", "Product Operations"],
    "Sales": ["Enterprise", "Mid-Market", "North America", "EMEA"],
    "Marketing": ["Growth", "Content", "Brand", "Demand Generation"],
    "Finance": ["Accounting", "FP&A", "Payroll", "Revenue Operations"],
    "People": ["Talent", "People Operations", "Learning", "HR Business Partners"],
    "Customer Success": ["Enterprise", "Onboarding", "Support", "Customer Education"],
    "Operations": [
        "Business Operations",
        "Supply Chain",
        "Workplace",
        "Service Delivery",
    ],
    "Security": [
        "Security Operations",
        "Application Security",
        "Governance",
        "Infrastructure Security",
    ],
    "Legal": ["Commercial", "Compliance", "Privacy", "Contracts"],
}
FIRST_NAMES = [
    "Avery",
    "Jordan",
    "Morgan",
    "Taylor",
    "Riley",
    "Casey",
    "Jamie",
    "Quinn",
    "Alex",
    "Cameron",
    "Drew",
    "Elliot",
    "Harper",
    "Kai",
    "Logan",
    "Parker",
    "Reese",
    "Robin",
    "Sam",
    "Skyler",
    "Devon",
    "Rowan",
    "Sage",
    "Emerson",
    "Noah",
    "Maya",
    "Priya",
    "Mateo",
    "Amara",
    "Luca",
    "Zara",
    "Theo",
]
LAST_NAMES = [
    "Chen",
    "Patel",
    "Morgan",
    "Kim",
    "Garcia",
    "Nguyen",
    "Singh",
    "Brown",
    "Taylor",
    "Wilson",
    "Khan",
    "Lopez",
    "Martin",
    "Shah",
    "Andersson",
    "Rossi",
    "Johnson",
    "Müller",
    "Ali",
    "Davis",
    "Okafor",
    "Silva",
    "Cohen",
    "Wong",
]


def compact_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def distribute(total, count, rng, minimum=5):
    values = [minimum] * count
    for _ in range(total - minimum * count):
        values[rng.randrange(count)] += 1
    rng.shuffle(values)
    return values


def noisy_department(department, rng):
    value = rng.choice(DEPARTMENT_ALIASES[department])
    return value.upper() if rng.random() < 0.08 else value


def build_dataset(company_count, seed):
    rng = random.Random(seed)
    companies = []
    truth = {}
    departments = list(DEPARTMENTS)

    for company_number in range(company_count):
        company_id = f"co-{company_number + 1:04d}"
        name = f"{rng.choice(['Northstar', 'Brightline', 'Juniper', 'Orbit', 'Pioneer', 'Cobalt', 'Redwood', 'Summit', 'Harbor', 'Lattice'])} {rng.choice(['Labs', 'Systems', 'Group', 'Works', 'Technologies', 'Collective'])} {company_number + 1:03d}"
        employee_target = rng.randint(100, 160)
        department_count = rng.randint(6, 9)
        selected_departments = rng.sample(departments, department_count)
        allocations = distribute(employee_target - 1, department_count, rng)
        company_employees = []
        company_truth = {}
        used_names = set()

        def person_name():
            for _ in range(100):
                result = f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"
                if result not in used_names:
                    used_names.add(result)
                    return result
            return f"Colleague {len(used_names) + 1}"

        def add_employee(employee_id, title, department, team, manager_id):
            department_value = ""
            if department in DEPARTMENT_ALIASES and rng.random() > 0.22:
                department_value = noisy_department(department, rng)
            employee = {
                "id": employee_id,
                "name": person_name(),
                "title": title if rng.random() > 0.012 else "",
                "department": department_value,
                "team": team if rng.random() > 0.16 else "",
                "location": rng.choice(LOCATIONS) if rng.random() > 0.14 else "",
            }
            company_employees.append(employee)
            company_truth[employee_id] = manager_id

        ceo_id = f"{company_id}-p000"
        ceo_title = rng.choice(
            ["Chief Executive Officer", "CEO", "Founder & CEO", "Co-Founder and CEO"]
        )
        add_employee(ceo_id, ceo_title, "Executive", "Executive", None)
        next_person = 1

        for department, total_in_department in zip(selected_departments, allocations):
            head_id = f"{company_id}-p{next_person:03d}"
            next_person += 1
            head_title = rng.choice(DEPARTMENTS[department]["heads"])
            add_employee(
                head_id, head_title, department, "Department Leadership", ceo_id
            )

            staff_count = total_in_department - 1
            team_count = max(1, (staff_count + 9) // 10)
            team_sizes = distribute(staff_count, team_count, rng, minimum=1)
            team_names = TEAMS[department]

            for team_number, member_count in enumerate(team_sizes):
                team = team_names[team_number % len(team_names)]
                manager_id = f"{company_id}-p{next_person:03d}"
                next_person += 1
                manager_title = rng.choice(DEPARTMENTS[department]["manager"])
                add_employee(manager_id, manager_title, department, team, head_id)

                for _ in range(member_count - 1):
                    employee_id = f"{company_id}-p{next_person:03d}"
                    next_person += 1
                    title = rng.choice(DEPARTMENTS[department]["ic"])
                    if rng.random() < 0.28:
                        title = "Senior " + title
                    elif rng.random() < 0.08:
                        title = "Staff " + title
                    add_employee(employee_id, title, department, team, manager_id)

        rng.shuffle(company_employees)
        companies.append(
            {
                "id": company_id,
                "name": name,
                "industry": rng.choice(INDUSTRIES),
                "headcount": len(company_employees),
                "employees": company_employees,
            }
        )
        truth[company_id] = company_truth

    return companies, truth


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--companies",
        type=int,
        default=500,
        help="number of companies to generate (minimum 500)",
    )
    parser.add_argument("--seed", type=int, default=20261102)
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "public" / "data")
    args = parser.parse_args()
    if args.companies < 500:
        parser.error("--companies must be at least 500")

    companies, truth = build_dataset(args.companies, args.seed)
    compact_json(args.output / "companies.json", companies)
    compact_json(
        args.output / "index.json",
        [
            {key: company[key] for key in ("id", "name", "industry", "headcount")}
            for company in companies
        ],
    )
    compact_json(PROJECT_ROOT / "data" / "ground_truth.json", truth)
    print(
        f"Generated {len(companies)} companies and {sum(c['headcount'] for c in companies):,} employees in {args.output}"
    )


if __name__ == "__main__":
    main()
