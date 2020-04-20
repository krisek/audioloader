

from mpd import MPDClient
import json
from time import sleep
import traceback
import random

mpd_client = MPDClient()
mpd_client.connect('localhost', 6600)
mpd_client.timeout = 30
# do this periodically, e.g. in event loop


def mpd_wrap(command, *args, **kwargs):
    try:
        print('go for sleep')
        mpd_client.ping()
    except Exception as e:
        print('had to reconnect')
        print(traceback.format_exc())
        mpd_client.connect('localhost', 6600)
    finally:
        return command(*args, **kwargs)


while True:
  print(json.dumps(mpd_wrap(mpd_client.count,'base', 'ns')))
  value = random.randint(10, 120)
  print('sleeping {}'.format(value))
  sleep(value)
