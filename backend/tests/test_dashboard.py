from datetime import date
import unittest

from fastapi.routing import APIRoute
from pydantic import ValidationError

from backend.app import app, calculate_payload, load_records, monthly_summary, process_records, subtract_months
from backend.models import Record


def record(day: str, cash: float = 1000, flat: float = 100000, mortgage: float = 60000, **fields: object) -> Record:
    return Record.model_validate({
        'date': day,
        'assets': {
            'liquid': [{'id': 'cash', 'name': 'Bank', 'value': cash, 'category': 'Efectiu'}],
            'non_liquid': [{'id': 'flat', 'name': 'Flat', 'value': flat, 'category': 'Immobles',
                            'mortgage': {'id': 'loan', 'name': 'Loan', 'value': mortgage}}],
        },
        **fields,
    })


class RecordTests(unittest.TestCase):
    def test_mortgage_counts_once_and_property_equity_is_excluded_from_disposable_value(self):
        liabilities = {'non_liquid': [{'id': 'loan', 'name': 'Loan', 'value': 60000},
                                      {'id': 'card', 'name': 'Card', 'value': 500}]}
        snapshots, holdings = process_records([record('2026-01-31', liabilities=liabilities)])
        totals = snapshots[0].totals
        self.assertEqual(totals.liabilities, 60500)
        self.assertEqual(totals.net_worth, 40500)
        self.assertEqual(totals.disposable_net_value, 500)
        self.assertEqual({h.id: h.equity_value for h in holdings}, {'cash': 1000, 'flat': 40000, 'card': -500})

    def test_months_without_a_record_are_interpolated(self):
        snapshots, _ = process_records([record('2026-01-15', cash=500), record('2026-01-31', cash=1000),
                                        record('2026-04-30', cash=4000)])
        self.assertEqual([m.liquid_assets for m in monthly_summary(snapshots)], [1000, 2000, 3000, 4000])

    def test_month_offsets_clamp_to_month_end(self):
        self.assertEqual(subtract_months(date(2026, 3, 31), 1), date(2026, 2, 28))
        self.assertEqual(subtract_months(date(2026, 1, 15), 3), date(2025, 10, 15))
        self.assertEqual(subtract_months(date(2028, 2, 29), 12), date(2027, 2, 28))

    def test_unknown_fields_are_rejected(self):
        with self.assertRaises(ValidationError):
            _ = record('2026-01-31', cashflows=[])


class IntegrationTests(unittest.TestCase):
    def test_saved_records_produce_the_dashboard(self):
        self.assertEqual(len(load_records()), 22)
        dashboard = calculate_payload()
        self.assertEqual(dashboard['meta']['latest_date'], '2026-09-30')
        self.assertEqual(dashboard['summary']['net_worth'], 222526)
        self.assertNotIn('cashflows', dashboard)

    def test_api_routes(self):
        paths = {route.path for route in app.routes if isinstance(route, APIRoute)}
        self.assertEqual(paths, {'/api/dashboard', '/api/health'})


if __name__ == '__main__':
    _ = unittest.main()
