#!/usr/bin/env python3
"""Evaluate inferred reporting lines against the synthetic hidden ground truth."""

import json
from pathlib import Path

from infer import infer_all


PROJECT_ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DATA = PROJECT_ROOT / "public" / "data"
LABELS = PROJECT_ROOT / "data" / "ground_truth.json"


def evaluate(companies, truth, threshold=0.0):
    predictions = infer_all(companies)
    expected = set()
    predicted = set()
    correct = set()
    for company in companies:
        company_id = company["id"]
        managers = truth[company_id]
        for person_id, manager_id in managers.items():
            if manager_id is not None:
                expected.add((company_id, person_id, manager_id))
        for person_id, result in predictions[company_id]["edges"].items():
            if result["confidence"] < threshold:
                continue
            edge = (company_id, person_id, result["manager_id"])
            predicted.add(edge)
            if managers.get(person_id) == result["manager_id"]:
                correct.add(edge)

    return {
        "companies": len(companies),
        "employees": sum(company["headcount"] for company in companies),
        "true_edges": len(expected),
        "predicted_edges": len(predicted),
        "correct_edges": len(correct),
        "precision": round(len(correct) / len(predicted), 4) if predicted else 0,
        "recall": round(len(correct) / len(expected), 4) if expected else 0,
        "coverage": round(len(predicted) / len(expected), 4) if expected else 0,
        "confidence_threshold": threshold,
    }


def main():
    companies_path = PUBLIC_DATA / "companies.json"
    truth_path = LABELS
    companies = json.loads(companies_path.read_text(encoding="utf-8"))
    truth = json.loads(truth_path.read_text(encoding="utf-8"))
    for threshold in (0.0, 0.7, 0.8):
        print(json.dumps(evaluate(companies, truth, threshold), indent=2))


if __name__ == "__main__":
    main()
