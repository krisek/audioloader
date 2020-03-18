import os

class Config(object):
  SECRET_KEY = os.environ.get('SECRET_KEY') or 'you-will-never-guess'
  WTF_CSRF_CHECK_DEFAULT = os.environ.get('WTF_CSRF_CHECK_DEFAULT') or True
  WTF_CSRF_METHODS = []
  MPD_SERVER = 'localhost'
  MPD_PORT = 6600
  MPD_USER = ''
  MPD_PASSWORD = ''
