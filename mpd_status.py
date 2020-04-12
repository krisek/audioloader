
from mpd import MPDClient
from select import select
from time import sleep


mpd_client = MPDClient()
mpd_client.connect('localhost', 6600)
mpd_client.timeout = 30
# do this periodically, e.g. in event loop



while True:
  print('send idle')

  mpd_client.send_idle()
  print('select')

  canRead = select([mpd_client], [], [], 5)[0]
  print('select returned')

  mpd_client.noidle()
  print('currentsong')

  print(mpd_client.currentsong())
