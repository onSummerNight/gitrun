"""One-time interactive Garmin sign-in. Password and MFA are never saved."""
import argparse
import getpass
import logging
import os
import re
import subprocess
import sys
from cryptography.fernet import Fernet
from garminconnect import Garmin
from garmin_sync import KEY_FILE, OUTPUT, atomic_write, fetch_history, save_session
import json


def setup():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', help='Existing GitHub owner/repository; save the encryption key as an Actions secret.')
    args = parser.parse_args()
    if args.repo and not re.fullmatch(r'[\w.-]+/[\w.-]+', args.repo):
        parser.error('--repo must be an owner/repository name.')
    logging.disable(logging.CRITICAL)
    os.umask(0o077)
    print('Connect Garmin once. Enter credentials here, never in a chat or a source file.')
    print('The sign-in goes directly to Garmin. Only an encrypted session is kept for scheduled sync.\n')
    email = input('Garmin email: ').strip()
    password = getpass.getpass('Garmin password (hidden): ')
    client = Garmin(email, password, prompt_mfa=lambda: getpass.getpass('Garmin verification code (hidden): '))
    client.login()
    del password
    key = KEY_FILE.read_bytes().strip() if KEY_FILE.exists() else Fernet.generate_key()
    KEY_FILE.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    atomic_write(KEY_FILE, key, private=True)
    save_session(client, key)
    try:
        payload = fetch_history(client)
        atomic_write(OUTPUT, (json.dumps(payload, indent=2, allow_nan=False) + '\n').encode())
    finally:
        save_session(client, key)
    print(f"\nConnected. Loaded {len(payload['activities'])} runs. Refresh the local dashboard to see them.")
    if args.repo:
        result = subprocess.run(['gh', 'secret', 'set', 'GARMIN_SESSION_KEY', '--repo', args.repo], input=key, capture_output=True)
        if result.returncode:
            print('The Garmin connection is saved locally, but GitHub secret setup failed. '
                  'Sign in with gh auth login, then follow README.md to save the key.', file=sys.stderr)
            return 1
        print(f'Encrypted-session key saved in GitHub Actions secrets for {args.repo}.')
    else:
        print('Next: save .garmin-session/session.key as the GARMIN_SESSION_KEY repository secret. See README.md.')
    print('Commit .sync/garmin.enc and dist/data/activities.json. The key and password must stay out of Git.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(setup())
    except (KeyboardInterrupt, EOFError):
        print('\nSetup cancelled. No password was saved.')
        sys.exit(1)
    except Exception as error:
        print(f'Setup failed ({type(error).__name__}). Check your sign-in and network, then try again. '
              'Account details are omitted from this error.', file=sys.stderr)
        sys.exit(1)
