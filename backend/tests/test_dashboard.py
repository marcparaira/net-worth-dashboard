import tempfile
import unittest
from datetime import date
from pathlib import Path

from fastapi.routing import APIRoute
from pydantic import ValidationError

from backend.app import app, health
from backend.config import APP_VERSION, SAMPLE_DATA_DIR
from backend.dashboard import build_dashboard
from backend.ledger import process_records
from backend.models import Record
from backend.rebalancing import RebalancingConfig, build_rebalancing, load_config
from backend.records import load_records
from backend.timeseries import monthly_summary, subtract_months


def record(day: str, cash: float = 1000, flat: float = 100000, mortgage: float = 60000, **fields: object) -> Record:
    return Record.model_validate(
        {
            'date': day,
            'assets': {
                'liquid': [{'id': 'cash', 'name': 'Bank', 'value': cash, 'category': 'Efectiu i bons CT'}],
                'non_liquid': [
                    {
                        'id': 'flat',
                        'name': 'Flat',
                        'value': flat,
                        'category': 'Immobles',
                        'mortgage': {'id': 'loan', 'name': 'Loan', 'value': mortgage},
                    }
                ],
            },
            **fields,
        }
    )


class RecordTests(unittest.TestCase):
    def test_mortgage_counts_once_and_property_equity_is_excluded_from_disposable_value(self):
        liabilities = {
            'non_liquid': [{'id': 'loan', 'name': 'Loan', 'value': 60000}, {'id': 'card', 'name': 'Card', 'value': 500}]
        }
        snapshots, holdings = process_records([record('2026-01-31', liabilities=liabilities)])
        totals = snapshots[0].totals
        self.assertEqual(totals.liabilities, 60500)
        self.assertEqual(totals.net_worth, 40500)
        self.assertEqual(totals.disposable_net_value, 500)
        self.assertEqual({h.id: h.equity_value for h in holdings}, {'cash': 1000, 'flat': 40000, 'card': -500})

    def test_months_without_a_record_are_interpolated(self):
        snapshots, _ = process_records(
            [record('2026-01-15', cash=500), record('2026-01-31', cash=1000), record('2026-04-30', cash=4000)]
        )
        self.assertEqual([m.liquid_assets for m in monthly_summary(snapshots)], [1000, 2000, 3000, 4000])

    def test_month_offsets_clamp_to_month_end(self):
        self.assertEqual(subtract_months(date(2026, 3, 31), 1), date(2026, 2, 28))
        self.assertEqual(subtract_months(date(2026, 1, 15), 3), date(2025, 10, 15))
        self.assertEqual(subtract_months(date(2028, 2, 29), 12), date(2027, 2, 28))

    def test_unknown_fields_are_rejected(self):
        with self.assertRaises(ValidationError):
            _ = record('2026-01-31', cashflows=[])


SAMPLE_RECORDS = [record('2025-01-31', cash=1000), record('2025-12-31', cash=2200), record('2026-01-31', cash=4000)]


class DashboardTests(unittest.TestCase):
    def test_summary_and_changes(self):
        dashboard = build_dashboard(SAMPLE_RECORDS)
        summary = dashboard['summary']
        self.assertEqual(dashboard['meta']['latest_date'], '2026-01-31')
        self.assertEqual(summary['net_worth'], 44000)
        self.assertEqual(summary['disposable_net_value'], 4000)
        self.assertEqual(summary['one_year_change'], 3000)
        self.assertEqual(summary['liquid_share_of_assets'], 3.85)  # 4,000 of 104,000
        self.assertEqual(summary['liquid_share_of_disposable'], 100)
        self.assertEqual(summary['overall_monthly_rate'], 250)  # 3,000 over 12 months
        # 3 months back (2025-10-31) falls back to the latest earlier record, 2025-01-31.
        self.assertEqual([p['change'] for p in dashboard['net_worth_changes']], [1800, 3000, 3000])

    def test_allocation_uses_equity_and_rate_basis_is_selectable(self):
        dashboard = build_dashboard(SAMPLE_RECORDS, rate_basis='overall')
        self.assertEqual(dashboard['meta']['historical_growth_basis'], 'overall')
        self.assertEqual(dashboard['summary']['monthly_disposable_increase'], 250)
        self.assertEqual(
            [(a['id'], a['value'], a['gross_value'], a['share']) for a in dashboard['allocation']],
            [('flat', 40000, 100000, 90.91), ('cash', 4000, 4000, 9.09)],
        )

    def test_load_records_from_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            _ = (Path(tmp) / 'empty.yaml').write_text('', encoding='utf-8')
            _ = (Path(tmp) / 'one.yaml').write_text("date: '2026-01-31'\n", encoding='utf-8')
            self.assertEqual([r.date for r in load_records(Path(tmp))], [date(2026, 1, 31)])


def rebalancing_record() -> Record:
    return Record.model_validate(
        {
            'date': '2026-01-31',
            'assets': {
                'liquid': [
                    {'id': 'bank', 'value': 40000, 'category': 'Efectiu i bons CT'},
                    {'id': 'broker', 'value': 20000, 'category': 'Efectiu i bons CT'},
                ],
                'non_liquid': [
                    {
                        'id': 'flat',
                        'value': 100000,
                        'category': 'Immobles',
                        'mortgage': {'id': 'loan', 'name': 'Loan', 'value': 70000},
                    },
                    {'id': 'etf', 'value': 10000, 'category': 'Accions'},
                    {'id': 'car', 'value': 5000, 'category': 'Vehicles'},
                    {'id': 'gold', 'value': 1000, 'category': 'Altres'},
                ],
            },
        }
    )


def rebalancing_config(
    emergency: float = 6000, goal: float = 0, fill_order: list[str] | None = None
) -> RebalancingConfig:
    return RebalancingConfig.model_validate(
        {
            'fill_order': fill_order or [],
            'excluded_categories': ['Vehicles'],
            'reserves': [
                {'name': 'Emergency', 'amount': emergency, 'categories': ['Efectiu i bons CT']},
                {'name': 'Goal', 'amount': goal, 'categories': ['Efectiu i bons CT']},
            ],
            'buckets': [
                {'name': 'Property', 'weight': 1, 'holding_ids': ['flat']},
                {'name': 'House', 'weight': 1, 'categories': ['Efectiu i bons CT']},
                {
                    'name': 'Invest',
                    'weight': 1,
                    'children': [
                        {'name': 'Index', 'weight': 80, 'categories': ['Accions']},
                        {'name': 'Bonds', 'weight': 20, 'categories': ['Efectiu i bons CT']},
                    ],
                },
            ],
        }
    )


class RebalancingTests(unittest.TestCase):
    def test_emergency_fund_then_weighted_split(self):
        result = build_rebalancing([rebalancing_record()], rebalancing_config())
        emergency = result['reserves'][0]
        self.assertEqual((emergency['current'], emergency['gap']), (6000, 0))
        # Drawn from cash holdings in proportion to their size.
        self.assertEqual({h['id']: h['amount'] for h in emergency['holdings']}, {'bank': 4000, 'broker': 2000})
        # Pool: 54,000 cash + 30,000 flat equity + 10,000 etf + 1,000 gold; car excluded.
        self.assertEqual(result['pool'], 95000)
        prop, house, invest = result['buckets']
        index, bonds = invest['children']
        self.assertEqual(
            [prop['target'], house['target'], index['target'], bonds['target']], [31666.67, 31666.67, 25333.33, 6333.33]
        )
        self.assertEqual((index['share'], index['share_of_parent']), (26.67, 80))
        # Cash (54,000) is shared by House and Bonds in proportion to their targets (5:1).
        self.assertEqual((house['current'], bonds['current']), (45000, 9000))
        self.assertEqual((prop['current'], index['current']), (30000, 10000))
        self.assertEqual(invest['current'], 19000)
        self.assertEqual([h['id'] for h in result['excluded']], ['car'])
        self.assertEqual(
            result['unassigned'], [{'id': 'gold', 'name': 'Unnamed', 'category': 'Altres', 'amount': 1000}]
        )

    def test_short_emergency_fund_takes_all_cash(self):
        result = build_rebalancing([rebalancing_record()], rebalancing_config(emergency=100000))
        self.assertEqual((result['reserves'][0]['current'], result['reserves'][0]['gap']), (60000, 40000))
        self.assertEqual(result['buckets'][1]['current'], 0)

    def test_reserves_fill_in_order_before_the_pool(self):
        # 60,000 cash: 6,000 emergency, then 50,000 goal, leaving 4,000 cash for the pool.
        result = build_rebalancing([rebalancing_record()], rebalancing_config(goal=50000))
        self.assertEqual(
            [(r['name'], r['current'], r['gap']) for r in result['reserves']],
            [('Emergency', 6000, 0), ('Goal', 50000, 0)],
        )
        self.assertEqual(result['pool'], 45000)  # 4,000 cash + 30,000 flat + 10,000 etf + 1,000 gold
        self.assertEqual(result['buckets'][0]['holdings'][0]['amount'], 30000)  # flat never feeds reserves

    def test_prioritised_bucket_fills_before_a_later_reserve(self):
        config = rebalancing_config(goal=50000, fill_order=['Emergency', 'Bonds', 'Goal'])
        result = build_rebalancing([rebalancing_record()], config)
        # Pool = 101,000 - 6,000 - 50,000 = 45,000, so Bonds (1/3 * 20%) targets 3,000 and is filled
        # before Goal; Goal still reaches 50,000 and the last 1,000 of cash goes to House.
        self.assertEqual(result['pool'], 45000)
        self.assertEqual(result['fill_order'], ['Emergency', 'Bonds', 'Goal'])
        self.assertEqual([r['current'] for r in result['reserves']], [6000, 50000])
        _, house, invest = result['buckets']
        self.assertEqual((invest['children'][1]['current'], invest['children'][1]['gap']), (3000, 0))
        self.assertEqual(house['current'], 1000)

    def test_prioritised_bucket_target_depends_on_what_the_reserve_leaves(self):
        config = rebalancing_config(goal=90000, fill_order=['Emergency', 'Bonds', 'Goal'])
        result = build_rebalancing([rebalancing_record()], config)
        # Bonds B = (41,000 non-cash + B) / 15, so B = 2,928.57 and Goal gets the other 51,071.43.
        bonds = result['buckets'][2]['children'][1]
        self.assertEqual((bonds['target'], bonds['current']), (2928.57, 2928.57))
        self.assertEqual(result['reserves'][1]['current'], 51071.43)
        self.assertEqual(result['pool'], 43928.57)

    def test_fill_order_names_must_exist(self):
        with self.assertRaises(ValidationError):
            _ = rebalancing_config(fill_order=['Nope'])

    def test_bucket_needs_children_or_sources(self):
        with self.assertRaises(ValidationError):
            _ = RebalancingConfig.model_validate({'buckets': [{'name': 'Empty', 'weight': 1}]})
        with self.assertRaises(ValidationError):
            _ = RebalancingConfig.model_validate(
                {
                    'buckets': [
                        {'name': 'A', 'weight': 1, 'holding_ids': ['x']},
                        {'name': 'B', 'weight': 1, 'holding_ids': ['x']},
                    ]
                }
            )


SAMPLE_RECORDS_DIR = SAMPLE_DATA_DIR / 'records'


class SampleDataTests(unittest.TestCase):
    """The committed sample dataset loads and drives every endpoint."""

    def test_sample_records_produce_the_dashboard(self):
        records = load_records(SAMPLE_RECORDS_DIR)
        self.assertEqual(len(records), len(list(SAMPLE_RECORDS_DIR.glob('*.y*ml'))))
        dashboard = build_dashboard(records)
        self.assertEqual(dashboard['meta']['latest_date'], max(r.date for r in records).isoformat())
        self.assertEqual(len(dashboard['history']), len(records))
        self.assertIsNotNone(dashboard['summary']['one_year_change'])
        self.assertNotIn('cashflows', dashboard)

    def test_sample_config_produces_the_rebalancing(self):
        records = load_records(SAMPLE_RECORDS_DIR)
        result = build_rebalancing(records, load_config(SAMPLE_DATA_DIR / 'rebalancing.json'))
        self.assertEqual(result['latest_date'], build_dashboard(records)['meta']['latest_date'])
        self.assertAlmostEqual(
            sum(b['gap'] for b in result['buckets']), -sum(h['amount'] for h in result['unassigned']), places=0
        )

    def test_api_routes(self):
        paths = {route.path for route in app.routes if isinstance(route, APIRoute)}
        self.assertEqual(
            paths,
            {
                '/api/dashboard',
                '/api/rebalancing',
                '/api/health',
                '/api/categories',
                '/api/holdings',
                '/api/holdings/{holding_id}',
                '/api/liabilities',
                '/api/liabilities/{liability_id}',
                '/api/snapshots',
                '/api/snapshots/{snapshot_id}',
            },
        )

    def test_health_reports_the_version(self):
        self.assertEqual(health(), {'status': 'ok', 'version': APP_VERSION})
        self.assertEqual(app.version, APP_VERSION)


if __name__ == '__main__':
    _ = unittest.main()
