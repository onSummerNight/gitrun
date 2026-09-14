import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from garmin_sync import normalize_activity, fetch_history, save_session
from cryptography.fernet import Fernet, InvalidToken


class SyncTests(unittest.TestCase):
    def activity(self, **extra):
        return {'activityId': 123, 'startTimeLocal': '2026-07-01 06:20:00',
                'activityName': 'Morning run', 'activityType': {'typeKey': 'running'},
                'distance': 10250, 'movingDuration': 3600, 'duration': 3700,
                'averageHR': 145, 'calories': 640, 'startLatitude': -6.2,
                'ownerId': 9876, 'access_token': 'do-not-publish', **extra}

    def test_units_privacy_and_missing_values(self):
        result = normalize_activity(self.activity(), '2026-09-14')
        self.assertEqual(result['distanceKm'], 10.25)
        self.assertEqual(result['movingSeconds'], 3600)
        self.assertIsNone(result['cadence'])
        self.assertEqual(result['calories'], 640)
        self.assertNotIn('startLatitude', result)
        self.assertNotIn('ownerId', result)
        self.assertNotIn('access_token', result)

    def test_zero_duration_preserved_and_fallback_only_for_missing(self):
        self.assertEqual(normalize_activity(self.activity(movingDuration=0), '2026-09-14')['movingSeconds'], 0)
        self.assertEqual(normalize_activity(self.activity(movingDuration=None), '2026-09-14')['movingSeconds'], 3700)

    def test_dates_types_and_validation(self):
        self.assertIsNone(normalize_activity(self.activity(startTimeLocal='2026-06-30 12:00:00'), '2026-09-14'))
        self.assertIsNone(normalize_activity(self.activity(startTimeLocal='2027-01-01 12:00:00'), '2026-09-14'))
        self.assertIsNone(normalize_activity(self.activity(activityType={'typeKey': 'cycling'}), '2026-09-14'))
        self.assertEqual(normalize_activity(self.activity(activityType={'typeKey': 'trail_running'}), '2026-09-14')['type'], 'trail')
        with self.assertRaises(ValueError):
            normalize_activity(self.activity(distance=None), '2026-09-14')

    def test_full_history_replaces_deleted_records_and_deduplicates(self):
        client = Mock()
        client.get_activities_by_date.return_value = [self.activity(), self.activity()]
        self.assertEqual(len(fetch_history(client, '2027-01-01')['activities']), 1)
        client.get_activities_by_date.assert_called_with('2026-07-01', '2027-01-01', 'running')
        client.get_activities_by_date.return_value = []
        self.assertEqual(fetch_history(client, '2027-01-01')['activities'], [])

    def test_encrypted_session_roundtrip_wrong_key_and_rotation(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'garmin.enc'
            key = Fernet.generate_key()
            client = Mock()
            client.client.dumps.return_value = json.dumps({'di_refresh_token': 'fixture-secret'})
            save_session(client, key, path)
            encrypted = path.read_bytes()
            self.assertNotIn(b'fixture-secret', encrypted)
            self.assertIn(b'fixture-secret', Fernet(key).decrypt(encrypted))
            with self.assertRaises(InvalidToken):
                Fernet(Fernet.generate_key()).decrypt(encrypted)
            client.client.dumps.return_value = json.dumps({'di_refresh_token': 'rotated-secret'})
            save_session(client, key, path)
            self.assertIn(b'rotated-secret', Fernet(key).decrypt(path.read_bytes()))
            client.client.dumps.return_value = json.dumps({'di_refresh_token': None})
            save_session(client, key, path)
            self.assertIn(b'rotated-secret', Fernet(key).decrypt(path.read_bytes()))


if __name__ == '__main__':
    unittest.main()
