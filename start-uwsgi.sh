#!/bin/bash

cd "$(dirname "$0")"
pwd
. venv/bin/activate
uwsgi --ini app.ini
setfacl -m u:www-data:rw  audioloader.sock
