import os

class Config(object):
  SECRET_KEY = os.environ.get('SECRET_KEY') or 'you-will-never-guess'
  WTF_CSRF_CHECK_DEFAULT = os.environ.get('WTF_CSRF_CHECK_DEFAULT') or True
  WTF_CSRF_METHODS = []
  #serve cover art directly or through a redirect
  COVER_RESPONSE_TYPE = 'direct'
  #the application will look in this folder for your music repository when it returns cover art (can be omitted if COVER_RESPONSE_TYPE = redirect)
  MUSIC_DIR = '/media/music/mp3'
  #the application will redirect to this URI if you decide to server cover art through redirect to a web server (can be omitted if COVER_RESPONSE_TYPE = direct)
  MUSIC_WWW = '/music'
  #force client cache for static conent
  SEND_FILE_MAX_AGE_DEFAULT = 43200
  #where to store client favourites/history/random folders -- the user running the web application needs to have write access on this directory
  CLIENT_DB = '/var/lib/audioloader'
  LOG_LEVEL = 'info'
  #hostname of default kodi server to load music to
  KODI = 'kodi.localdomain'
