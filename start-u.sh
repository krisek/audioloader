#!/bin/sh

#start Audioloader Flask application

./venv/bin/uwsgi --socket 0.0.0.0:5000 --protocol=http -w wsgi:application --enable-threads --py-autoreload 1 --processes 5 --plugins-dir /usr/lib/uwsgi/plugins --plugin python3 --workers 64 --cheaper-algo spare --cheaper  8 --cheaper-initial 8 --cheaper-step 4
