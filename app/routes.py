from app import app
import requests
from requests.packages import urllib3
import re
import json
from flask import Response
from flask import render_template
from app.forms import invoiceForm
from pprint import pprint
from flask import Flask,redirect
from flask import request
import time
import glob, os
from mpd import MPDClient
from flask_apscheduler import APScheduler
import time

from pprint import pprint



mpd_client = MPDClient()

mpd_client.timeout = 600
mpd_client.idletimeout = 600
mpd_client.connect(app.config['MPD_SERVER'], app.config['MPD_PORT'])
mpd_client_idle = False
scheduler = APScheduler()
scheduler.init_app(app)
scheduler.start()

app.apscheduler.add_job(func=mpd_keepalive, trigger='interval', seconds=60, id='mpd_reconnect')

def mpd_keepalive(task_id):
    if not mpd_client_idle:
        try:
            mpd_client.ping
        except:
            mpd_client.connect(app.config['MPD_SERVER'], app.config['MPD_PORT'])


@app.route('/cover', methods=['GET', 'POST'])
def cover():
    request_d = dict()
    request_d['fullpath'] = app.config['MUSIC_DIR'] + '/' + request.args.get('directory', '')

    albumdir = request_d['fullpath']
    images =  glob.glob(albumdir + '/*.jpg') + glob.glob(albumdir + '/*.jpeg') + glob.glob(albumdir + '/*.gif') + glob.glob(albumdir + '/*.png')
    cover_patterns = []
    cover_patterns.append(re.compile("/folder", re.IGNORECASE))
    cover_patterns.append(re.compile("/cover", re.IGNORECASE))
    cover_patterns.append(re.compile("front", re.IGNORECASE))

    cover = ''
    #check the images which were found
    for image in images:
        #app.logger.debug('image ' + image)
        for cp in cover_patterns:
            if(cp.search(image)):
                #app.logger.debug('got cover ' + image)
                cover = image
                break
        if(cover != ''):
            break
    if(cover == '' and images):
        cover = images[0]

    request_d['cover'] = cover

    return Response(render_template('cover.html', data=request_d))

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
  #path = path.upper
  request_d = request.args.__dict__
  return Response(render_template('index.html', data=request_d))



