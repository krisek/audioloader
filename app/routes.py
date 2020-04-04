from app import app
import requests
from requests.packages import urllib3
import re
import json
from flask import jsonify
from flask import Response
from flask import render_template
from app.forms import invoiceForm
from pprint import pprint
from flask import Flask,redirect
from flask import request
import time
import glob, os
from mpd import MPDClient
import time
import random
from pprint import pprint
from nested_lookup import nested_lookup
import datetime

from apscheduler.schedulers.background import BackgroundScheduler

mpd_client = MPDClient()

mpd_client.timeout = 600
mpd_client.idletimeout = 600
mpd_client.connect(app.config['MPD_SERVER'], app.config['MPD_PORT'])
mpd_client_idle = False


def mpd_connect():
    if not mpd_client_idle:
        try:
            mpd_client.ping()
        except:
            mpd_client.connect(app.config['MPD_SERVER'], app.config['MPD_PORT'])


scheduler = BackgroundScheduler()
scheduler.start()
scheduler.add_job(mpd_connect, 'interval', seconds=60)

@app.route('/cover', methods=['GET', 'POST'])
def cover():

    dir_content = mpd_client.listfiles( request.args.get('directory', ''))

    app.logger.debug('got dir_content ' + json.dumps(dir_content))
    request_d = request.args.__dict__

    image_pattern = re.compile("\.(jpg|jpeg|png|gif)$", re.IGNORECASE)
    cover_pattern = re.compile("front|folder|cover", re.IGNORECASE)

    cover = ''

    images = []
    for file_data in dir_content:
        if(image_pattern.search(file_data['file'])):
            images.append(file_data['file'])
    #check the images which were found
    for image in images:
        #app.logger.debug('image ' + image)
        if(cover_pattern.search(image)):
            app.logger.debug('got cover ' + image)
            cover = image
            break
        if(cover != ''):
            break

    if(cover == '' and images):
        cover = images[0]
    if(cover == ''):
        request_d['fullpath'] = '/static/vinyl.png'
        request_d['cover'] = 'vinyl.png'
    else:
        request_d['fullpath'] = app.config['MUSIC_WWW']  + request.args.get('directory', '') + '/' + cover
        #request_d['fullpath'] = request_d['fullpath'].replace('//','/')
        request_d['cover'] = cover

    return redirect(request_d['fullpath'])
    #return Response(renderfrom nested_lookup import nested_lookup_template('cover.html', data=request_d))

@app.route('/listfiles', methods=['GET', 'POST'])
@app.route('/lsinfo', methods=['GET', 'POST'])
@app.route('/ls', methods=['GET', 'POST'])
@app.route('/count', methods=['GET', 'POST'])
def mpd_proxy():
    content = {}
    app.logger.debug('got ' + request.path)
    if(request.path == '/listfiles'):
        content['tree'] = mpd_client.listfiles( request.args.get('directory', ''))
    elif(request.path == '/lsinfo'):
        content['tree'] = mpd_client.lsinfo( request.args.get('directory', ''))
    elif(request.path == '/ls'):
        listfiles = mpd_client.listfiles( request.args.get('directory', ''))
        lsinfo = mpd_client.lsinfo( request.args.get('directory', ''))
        count = mpd_client.count('base', request.args.get('directory', ''))
        music_files = nested_lookup(key='file', document = lsinfo)
        music_files = list(map(os.path.basename ,music_files))
        #app.logger.debug('music_files ' + ', '.join(music_files))
        for file_record in listfiles:
            if('file' not in file_record):
                continue
            #app.logger.debug('file_record ' + file_record['file'])
            if(file_record.get('file','') not in music_files):
                file_record['file'] = request.args.get('directory', '') + '/' + file_record['file']
                lsinfo.append(file_record)
        content['tree'] = lsinfo
        content['info'] = count
    elif(request.path == '/count'):
        content = mpd_client.count('base', request.args.get('directory', ''))
        content['playhours'] = re.sub(r'^0:', '', str(datetime.timedelta(seconds=int(content['playtime']))))
        content['name'] = request.args.get('directory', '')


    return jsonify(content)


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
  #path = path.upper
  request_d = request.args.__dict__
  return Response(render_template('index.html', data=request_d))



