# Org Chart Inference

A static org-chart explorer and evaluation project. The browser app infers reporting lines from title seniority, function, and team overlap. It assigns a confidence score to each proposed edge and abstains when the available evidence is ambiguous.

The explorer includes a searchable company directory, sector-based quick picks, and an org-atlas landing illustration to make discovery feel more like browsing a map than filling out a form.

The app opens at `#/org`, a company directory with search and quick picks. Choosing a company opens its shareable profile at `#/org/<company-id>`, with a header, stats, and four views:

- **Org chart**: the inferred tree. Click any person to trace their reporting path to the CEO. Includes an "Ask the org" bar (for example, "who runs data?" or "who does the Head of Security report to?").
- **Leadership**: C-suite, VP, and head-level people with their inferred manager and direct-report counts.
- **Departments**: one card per function, with headcount, share of the company, the most senior lead, and team count. Clicking a card opens the directory filtered to that function.
- **People directory**: a filterable table of everyone, with function, team, and inferred manager and confidence.

## Project layout

```text
public/                  Static app deployed to GitHub Pages
  data/                  Company directory and employee rosters
scripts/                 Dataset generator, inference, evaluation, and tests
data/ground_truth.json   Synthetic manager labels for evaluation only
```

Ground-truth labels are kept outside `public/`; the deployed static site does not publish them.

## Run locally

From the project root:

```sh
python3 -m http.server 8000 --directory public
```

Open [http://localhost:8000](http://localhost:8000). The app has no runtime package dependencies.

## Dataset

The checked-in dataset contains 500 synthetic companies, each with 100–160 employees, across a varied set of industries and functions. Names are generated, not sourced from real people. Titles and fields include abbreviations, inconsistent department labels, missing values, and title variants. The generator seed is committed for reproducibility.

Regenerate the roster, directory, and matching hidden labels:

```sh
python3 scripts/generate_data.py
```

Use `--seed` to create a different reproducible sample or `--output` to choose another output directory for the hosted company data. The generator rejects fewer than 500 companies.

## Inference and measurement

`scripts/infer.py` and the browser implementation in `public/app.js` share the inference rules: normalize title and department, classify function and seniority, and consider more-senior people in the same function. A shared team can disambiguate managers; a tie or missing evidence results in abstention. Confidence is an evidence heuristic, not a probability.

Run evaluation against the synthetic labels:

```sh
python3 scripts/evaluate.py
python3 -m unittest discover -s scripts -v
```

Evaluation reports direct-edge precision, recall, and coverage across the full dataset at several confidence thresholds. On the checked-in seed (65,490 people and 64,990 known manager edges), the baseline produced 48,195 edges at 87.79% precision and 65.11% recall. Unresolved executives are linked to the single CEO at confidence 0.6, and other unresolved people are linked to the single director or manager in their department at confidence 0.6 when exactly one exists. Both are below the 0.8 threshold. At the 0.8 confidence threshold, it produced 32,459 edges at 100% precision and 49.94% recall. These results measure recovery of the synthetic generator's labels, not performance on real company data.

## Deployment

**Live site:** [https://org-chart-woad.vercel.app/#/org](https://org-chart-woad.vercel.app/#/org)

The site is hosted on Vercel. `vercel.json` serves `public/` as a static site with no build step.

The URL for the live site is [https://org-chart-woad.vercel.app/#/org](https://org-chart-woad.vercel.app/#/org).