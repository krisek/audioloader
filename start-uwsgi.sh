#!/bin/bash

cd "$(dirname "$0")"
pwd
. venv/bin/activate
uwsgi --ini app.ini
#since it seems to scale better with TCP on Raspberry this is not needed
#setfacl -m u:www-data:rw  audioloader.sock
