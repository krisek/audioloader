import os

class Config(object):
  SECRET_KEY = os.environ.get('SECRET_KEY') or 'you-will-never-guess'
  WTF_CSRF_CHECK_DEFAULT = os.environ.get('WTF_CSRF_CHECK_DEFAULT') or True
  WTF_CSRF_METHODS = []
  MUSIC_DIR = '/media/music/mp3'
  MUSIC_WWW = '/music'
  MPD_SOCKET = '/tmp/mpd-6600-socket'
  SEND_FILE_MAX_AGE_DEFAULT = 0
