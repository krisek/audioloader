[uwsgi]
module = wsgi
chdir = /var/www/audioloader
http = 127.0.0.1:3400
http = [::1]:3400
chmod-socket = 660
vacuum = true
plugins-dir = /usr/lib/uwsgi/plugins
plugin = python3
mount = /=application:app
master = true
processes = 8
die-on-term = true
uid = www-data
touch-reload = /var/www/audioloader/.reload
#update logger as wished; systemd loggin takes too much resources on a Pi
#you can experiment with disable_logging=True as well
#plugin = systemd_logger
#logger = systemd
logger = file:/dev/null

workers = 64          # maximum number of workers

cheaper-algo = spare
cheaper = 8           # tries to keep 8 idle workers
cheaper-initial = 8   # starts with minimal workers
cheaper-step = 4      # spawn at most 4 workers at once
cheaper-idle = 60     # cheap one worker per minute while idle
