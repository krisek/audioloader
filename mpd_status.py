
from mpd import MPDClient
from select import select
from time import sleep


mpd_client = MPDClient()
mpd_client.connect('localhost', 6600)

mpd_client.send_idle()

# do this periodically, e.g. in event loop



while True:
  canRead = select([mpd_client], [], [], 10)[0]

  if canRead:
      changes = mpd_client.fetch_idle()
      print(changes) # handle changes
      if 'player' in changes:
        print(mpd_client.currentsong())
      mpd_client.send_idle() # continue idling

