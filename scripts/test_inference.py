import json
import unittest
from pathlib import Path

from evaluate import evaluate
from infer import infer_all


PROJECT_ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DATA = PROJECT_ROOT / "public" / "data"
LABELS = PROJECT_ROOT / "data" / "ground_truth.json"


class DatasetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.companies = json.loads(
            (PUBLIC_DATA / "companies.json").read_text(encoding="utf-8")
        )
        cls.truth = json.loads(LABELS.read_text(encoding="utf-8"))

    def test_dataset_meets_size_and_shape_requirements(self):
        self.assertGreaterEqual(len(self.companies), 500)
        self.assertTrue(all(company["headcount"] >= 100 for company in self.companies))
        self.assertTrue(
            all(
                len(company["employees"]) == company["headcount"]
                for company in self.companies
            )
        )

    def test_truth_has_one_root_and_an_edge_for_every_other_person(self):
        for company in self.companies:
            manager_ids = self.truth[company["id"]]
            self.assertEqual(len(manager_ids), company["headcount"])
            roots = [
                person_id
                for person_id, manager_id in manager_ids.items()
                if manager_id is None
            ]
            self.assertEqual(len(roots), 1)

    def test_inference_edges_only_reference_people_in_the_same_company(self):
        predictions = infer_all(self.companies)
        for company in self.companies:
            members = {person["id"] for person in company["employees"]}
            result = predictions[company["id"]]
            self.assertTrue(result["ceo_id"] is None or result["ceo_id"] in members)
            for person_id, edge in result["edges"].items():
                self.assertIn(person_id, members)
                self.assertIn(edge["manager_id"], members)
                self.assertNotEqual(person_id, edge["manager_id"])
                self.assertGreaterEqual(edge["confidence"], 0)
                self.assertLessEqual(edge["confidence"], 1)

    def test_metrics_are_well_formed(self):
        metrics = evaluate(self.companies, self.truth, threshold=0.8)
        self.assertEqual(metrics["companies"], len(self.companies))
        self.assertGreater(metrics["predicted_edges"], 0)
        self.assertEqual(metrics["precision"], 1.0)
        self.assertGreater(metrics["recall"], 0)


if __name__ == "__main__":
    unittest.main()
