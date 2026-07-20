import os
import sys
import types
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

import auth_app
import fastapi_backend


class FinancialPlannerRegressionTests(unittest.TestCase):
    def test_future_value_matches_projection_final_balance(self):
        cases = [
            (1000, 2, 12, 12, 100),
            (25000, 10, 4, 7.5, 500),
            (1000, 3, 1, 0, 100),
        ]

        for pv, years, freq, rate, pmt in cases:
            with self.subTest(pv=pv, years=years, freq=freq, rate=rate, pmt=pmt):
                future_value = fastapi_backend.calculate_future_value(pv, years, freq, rate, pmt)[0]
                final_projection = fastapi_backend.generate_projection(pv, years, freq, rate, pmt)[-1].total_balance
                self.assertAlmostEqual(future_value, final_projection, places=6)

    def test_required_contribution_reaches_target_future_value(self):
        target_fv = 50000
        required_pmt = fastapi_backend.calculate_required_contribution(
            pv=10000,
            years=5,
            freq=12,
            rate=8,
            target_fv=target_fv,
        )[0]

        calculated_fv = fastapi_backend.calculate_future_value(
            pv=10000,
            years=5,
            freq=12,
            rate=8,
            pmt=required_pmt,
        )[0]

        self.assertAlmostEqual(calculated_fv, target_fv, places=2)

    def test_required_yield_rejects_targets_above_supported_maximum(self):
        with self.assertRaises(HTTPException) as raised:
            fastapi_backend.calculate_required_yield(
                pv=0,
                years=1,
                freq=1,
                target_fv=1_000_000,
                pmt=0,
            )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("above the supported 100% maximum", raised.exception.detail)


class CronRegressionTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(fastapi_backend.app)
        self.old_secret = os.environ.get("CRON_SECRET_KEY")
        os.environ["CRON_SECRET_KEY"] = "test-secret"

    def tearDown(self):
        if self.old_secret is None:
            os.environ.pop("CRON_SECRET_KEY", None)
        else:
            os.environ["CRON_SECRET_KEY"] = self.old_secret

    def test_cron_rejects_get_and_missing_header_secret(self):
        self.assertEqual(self.client.get("/cron/daily_update").status_code, 405)
        self.assertEqual(self.client.post("/cron/daily_update").status_code, 401)

    def test_cron_routes_daily_update_to_worker(self):
        run_price_update_job = Mock()
        fake_scheduler = types.SimpleNamespace(run_price_update_job=run_price_update_job)

        with patch.dict(sys.modules, {"auto_price_scheduler": fake_scheduler}):
            response = self.client.post(
                "/cron/daily_update",
                headers={"X-Cron-Key": "test-secret"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["action"], "daily_update")
        run_price_update_job.assert_called_once_with()

    def test_cron_does_not_silently_route_unimplemented_split_actions(self):
        response = self.client.post(
            "/cron/update_prices",
            headers={"X-Cron-Key": "test-secret"},
        )

        self.assertEqual(response.status_code, 501)
        self.assertIn("not implemented as a separate job", response.json()["detail"])


class SessionPersistenceRegressionTests(unittest.TestCase):
    def test_create_session_token_raises_when_session_insert_fails(self):
        fake_conn = Mock()
        fake_cursor = Mock()
        fake_conn.cursor.return_value = fake_cursor

        with patch.object(auth_app, "get_conn", return_value=fake_conn), patch.object(
            auth_app,
            "is_postgres",
            return_value=True,
        ), patch.object(
            auth_app,
            "db_execute",
            side_effect=[None, RuntimeError("insert failed")],
        ):
            with self.assertRaises(RuntimeError):
                auth_app.create_session_token(user_id=123)

        fake_conn.commit.assert_not_called()
        fake_conn.close.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()