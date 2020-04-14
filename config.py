import os

class Config(object):
  SECRET_KEY = os.environ.get('SECRET_KEY') or 'you-will-never-guess'
  WTF_CSRF_CHECK_DEFAULT = os.environ.get('WTF_CSRF_CHECK_DEFAULT') or True
  WTF_CSRF_METHODS = []
  MUSIC_DIR = '/media/music/mp3'
  MUSIC_WWW = 'http://192.168.1.185:19000/'
  MPD_SOCKET = '/tmp/mpd-6600-socket'
  MPD_SERVER = 'localhost'
  MPD_PORT = 6600
  MPD_USER = ''
  MPD_PASSWORD = ''
  SEND_FILE_MAX_AGE_DEFAULT = 0
