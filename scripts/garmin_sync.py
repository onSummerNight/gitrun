"""Read Garmin running summaries, publish an allowlist, and encrypt rotated tokens."""
from __future__ import annotations

import json
import logging
import math
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from cryptography.fernet import Fernet
from garminconnect import Garmin

ROOT = Path(__file__).resolve().parent.parent
START = '2026-07-01'
SESSION = ROOT / '.sync' / 'garmin.enc'
KEY_FILE = ROOT / '.garmin-session' / 'session.key'
OUTPUT = ROOT / 'dist' / 'data' / 'activities.json'
RUN_TYPES = {'running', 'trail_running', 'treadmill_running', 'track_running',
             'indoor_running', 'virtual_run', 'ultra_run', 'ultra_running', 'street_running'}


def numeric(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        value = float(value)
        return value if math.isfinite(value) and value >= 0 else None
    except (ValueError, TypeError):
        return None


def normalize_activity(raw, today):
    """Garmin list response: metres, seconds, kcal, full steps/min cadence."""
    kind = (raw.get('activityType') or {}).get('typeKey', '')
    if kind not in RUN_TYPES:
        return None
    local_date = str(raw.get('startTimeLocal', ''))[:10]
    date.fromisoformat(local_date)  # Abort a malformed response, don't silently lose history.
    if not START <= local_date <= today:
        return None
    distance = numeric(raw.get('distance'))
    moving = numeric(raw.get('movingDuration'))
    if moving is None:
        moving = numeric(raw.get('duration'))
    if distance is None or moving is None or raw.get('activityId') is None:
        raise ValueError('A running activity has no valid ID, distance, or duration.')
    result = {
        'id': str(raw['activityId']),
        'date': local_date,
        'title': str(raw.get('activityName') or 'Run')[:200],
        'type': 'trail' if kind == 'trail_running' else 'treadmill' if kind in {'treadmill_running', 'indoor_running'} else 'road',
        'distanceKm': round(distance / 1000, 5),
        'movingSeconds': round(moving, 3),
    }
    fields = {
        'elapsedSeconds': 'elapsedDuration', 'elevationM': 'elevationGain',
        'descentM': 'elevationLoss', 'calories': 'calories',
        'averageHR': 'averageHR', 'maxHR': 'maxHR',
        'cadence': 'averageRunningCadenceInStepsPerMinute',
        'maxCadence': 'maxRunningCadenceInStepsPerMinute', 'steps': 'steps',
        'aerobicEffect': 'aerobicTrainingEffect', 'anaerobicEffect': 'anaerobicTrainingEffect',
        'averagePower': 'avgPower', 'maxPower': 'maxPower',
    }
    for target, source in fields.items():
        result[target] = numeric(raw.get(source))
    speed = numeric(raw.get('maxSpeed'))
    result['bestPaceSeconds'] = round(1000 / speed, 3) if speed else None
    # No profile, account IDs, exact start time, coordinates, route, or device ID.
    return result


def atomic_write(path, content, private=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    descriptor = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600 if private else 0o644)
    with os.fdopen(descriptor, 'wb') as handle:
        handle.write(content)
    temp.replace(path)


def encryption_key():
    key = os.environ.get('GARMIN_SESSION_KEY')
    if key:
        return key.strip().encode()
    if KEY_FILE.exists():
        return KEY_FILE.read_bytes().strip()
    raise RuntimeError('Garmin is not connected. Run scripts/garmin_setup.py once.')


def save_session(client, key, path=SESSION):
    serialized = client.client.dumps().encode()
    # Do not replace a working session with an empty one after a failed login.
    if not json.loads(serialized).get('di_refresh_token'):
        return
    atomic_write(path, Fernet(key).encrypt(serialized))


def fetch_history(client, today=None):
    today = today or datetime.now(ZoneInfo('Asia/Jakarta')).date().isoformat()
    if today < START:
        return {'version': 1, 'source': 'Garmin Connect', 'updatedAt': datetime.now(timezone.utc).isoformat(), 'activities': []}
    # Full pagination from the fixed start also reflects edits and deleted activities.
    raw = client.get_activities_by_date(START, today, 'running')
    if not isinstance(raw, list):
        raise ValueError('Garmin returned an unexpected activity response.')
    records = {}
    for item in raw:
        activity = normalize_activity(item, today)
        if activity:
            records[activity['id']] = activity
    activities = sorted(records.values(), key=lambda a: (a['date'], int(a['id'])), reverse=True)
    return {'version': 1, 'source': 'Garmin Connect', 'updatedAt': datetime.now(timezone.utc).isoformat(), 'activities': activities}


def sync():
    logging.disable(logging.CRITICAL)  # Never expose response bodies or tokens in Actions logs.
    key = encryption_key()
    session = Fernet(key).decrypt(SESSION.read_bytes()).decode()
    client = Garmin()
    try:
        client.login(session)
        payload = fetch_history(client)
        atomic_write(OUTPUT, (json.dumps(payload, indent=2, allow_nan=False) + '\n').encode())
        print(f"Synced {len(payload['activities'])} runs since {START}. GPS routes excluded.")
    finally:
        # Refresh tokens can rotate during login or a request, including a failed fetch.
        save_session(client, key)


if __name__ == '__main__':
    try:
        sync()
    except Exception as error:
        print(f'Garmin sync failed ({type(error).__name__}). Previous website data was preserved. '
              'Check connectivity or run garmin_setup.py to reconnect. No credentials are logged.', file=sys.stderr)
        sys.exit(1)
