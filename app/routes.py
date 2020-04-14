from app import app
import requests
from requests.packages import urllib3
import re
import json
#from app.forms import invoiceForm
from pprint import pprint
import time
import glob, os
from mpd import MPDClient
import random
from random import random
from pprint import pprint
from nested_lookup import nested_lookup
import time
import datetime
from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_EXECUTED
from apscheduler.schedulers.background import BackgroundScheduler
import logging

from flask import Flask, render_template, url_for, copy_current_request_context, jsonify, Response, request, redirect
import threading
from threading import Thread, Event

from flask_cors import CORS

from select import select

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s %(levelname)s %(name)s %(threadName)s : %(message)s')

CORS(app)

def mpd_connect():
    mpd_client.connect(app.config['MPD_SOCKET'])
    return True

@app.route('/cover', methods=['GET', 'POST'])
def cover():
    mpd_client = MPDClient()
    mpd_client.timeout = 600
    mpd_client.idletimeout = 600
    mpd_client.connect(app.config['MPD_SOCKET'])

    dir_content = mpd_client.listfiles( request.args.get('directory', ''))

    app.logger.debug('got dir_content ' + json.dumps(dir_content))
    request_d = request.args.__dict__

    image_pattern = re.compile("\.(jpg|jpeg|png|gif)$", re.IGNORECASE)
    cover_pattern = re.compile("front|folder|cover", re.IGNORECASE)

    cover = ''

    images = []
    for file_data in dir_content:
        if(image_pattern.search(file_data.get('file',''))):
            images.append(file_data.get('file',''))
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
        request_d['fullpath'] = '/static/assets/vinyl.png'
        request_d['cover'] = 'vinyl.png'
    else:
        request_d['fullpath'] = app.config['MUSIC_WWW']  + request.args.get('directory', '') + '/' + cover
        #request_d['fullpath'] = request_d['fullpath'].replace('//','/')
        request_d['cover'] = cover
    mpd_client.disconnect()

    return redirect(request_d['fullpath'])



def process_currentsong(currentsong):
    for state in ['play', 'pause', 'stop']:
        currentsong[state] = False
        if currentsong.get('state', 'stop') == state:
            currentsong[state] = True
    if 'title' not in currentsong and 'file' in currentsong:
        currentsong['title'] = currentsong['file']
    currentsong['active'] = False
    if currentsong.get('state','stop') in ['play', 'pause']:
        currentsong['active'] = True
    if not currentsong['active']:
        currentsong['title'] = 'not playing'
    return currentsong


@app.route('/poll_currentsong', methods=['GET', 'POST'])
def poll_currentsong():
    content = {}
    mpd_client = MPDClient()

    mpd_client.timeout = 20000
    mpd_client.idletimeout = 20000
    mpd_client.connect(app.config['MPD_SOCKET'])
    mpd_client.send_idle()
    app.logger.debug("waiting for mpd_client")
    select([mpd_client], [], [], 10)[0]
    mpd_client.noidle()
    content = mpd_client.currentsong()
    content.update(mpd_client.status())
    mpd_client.disconnect()


    return jsonify(process_currentsong(content))

@app.route('/kodi', methods=['GET', 'POST'])
def kodi():
    server = request.args.get('server', 'localhost')
    url = 'http://{}:8080/jsonrpc'.format(server)
    app.logger.debug("kodi called {} {}".format(url, json.dumps(request.args)))
    proxies = {}
    kodi_data = {
            'jsonrpc': '2.0',
            'id': '1',
            'method': request.args.get('action', 'Player.Open'),
            'params': {}

            }
    if request.args.get('action', 'Player.Stop') == 'Player.Open':
        kodi_data['params'] = {
                'item': {
                    'file': request.args.get('stream', 'http://localhost:18080')
                }
            }

    else:
        kodi_data['params'] = {
                'playerid': 0
            }


    app.logger.debug("kodi calling {}".format(jsonify(kodi_data)))
    r = requests.post(url, headers={'Content-type': 'application/json'}, verify=False, proxies=proxies, json=kodi_data)
    app.logger.debug("subscribe request returned {} {}".format(r.status_code, r.text))
    return r.text




@app.route('/listfiles', methods=['GET', 'POST'])
@app.route('/lsinfo', methods=['GET', 'POST'])
@app.route('/ls', methods=['GET', 'POST'])
@app.route('/search', methods=['GET', 'POST'])
@app.route('/addplay', methods=['GET', 'POST'])
@app.route('/play', methods=['GET', 'POST'])
@app.route('/pause', methods=['GET', 'POST'])
@app.route('/next', methods=['GET', 'POST'])
@app.route('/prev', methods=['GET', 'POST'])
@app.route('/stop', methods=['GET', 'POST'])
@app.route('/status', methods=['GET', 'POST'])
@app.route('/currentsong', methods=['GET', 'POST'])
@app.route('/count', methods=['GET', 'POST'])


def mpd_proxy():
    content = {}
    try:
        mpd_client = MPDClient()

        mpd_client.timeout = 600
        mpd_client.idletimeout = 600
        mpd_client.connect(app.config['MPD_SOCKET'])
        app.logger.debug('got ' + request.path)
        if(request.path == '/listfiles'):
            content['tree'] = mpd_client.listfiles( request.args.get('directory', '.'))
        elif(request.path == '/lsinfo'):
            content['tree'] = mpd_client.lsinfo( request.args.get('directory', '.'))
        elif(request.path == '/count'):
            content = mpd_client.count('base', request.args.get('directory', '.'))
            content['playhours'] = re.sub(r'^0:', '', str(datetime.timedelta(seconds=int(content['playtime']))))
            content['name'] = request.args.get('directory', '')
        elif(request.path == '/search'):
            content['tree'] = []
            search_result = mpd_client.search('Any', request.args.get('pattern', 'ugar'))
            result_directories = {}
            for elem in search_result:
                result_directories[os.path.dirname(elem['file'])] = 1
            for directory in result_directories:
                content['tree'].append({'directory': directory})
            for i, name in enumerate(content['tree'], start=0):
                if 'directory' in name:
                    sub_dir = name['directory']
                    sub_dir_count = mpd_client.count('base', sub_dir)
                    sub_dir_count['playhours'] = re.sub(r'^0:', '', str(datetime.timedelta(seconds=int(sub_dir_count['playtime']))))
                    name['count'] = sub_dir_count

        elif(request.path == '/ls'):
            directory = request.args.get('directory', '.');

            listfiles = mpd_client.listfiles( directory )
            if(directory == '.'):
                directory = '/'

            lsinfo = mpd_client.lsinfo( directory)
            if directory != '/':
                count = mpd_client.count('base', directory)
            else:
                count = {}
            music_files = nested_lookup(key='file', document = lsinfo)
            music_files = list(map(os.path.basename ,music_files))

            for file_record in listfiles:
                if('file' not in file_record):
                    continue
                #app.logger.debug('file_record ' + file_record['file'])
                if(file_record.get('file','') not in music_files):
                    file_record['file'] = directory + '/' + file_record['file']
                    lsinfo.append(file_record)
            content['tree'] = lsinfo
            content['info'] = count

            for i, name in enumerate(content['tree'], start=0):
                if 'directory' in name:
                    sub_dir = name['directory']
                    sub_dir_count = mpd_client.count('base', sub_dir)
                    sub_dir_count['playhours'] = re.sub(r'^0:', '', str(datetime.timedelta(seconds=int(sub_dir_count.get('playtime',0)))))
                    name['count'] = sub_dir_count



        elif(request.path == '/count'):
            content = mpd_client.count('base', request.args.get('directory', '.'))
            content['playhours'] = re.sub(r'^0:', '', str(datetime.timedelta(seconds=int(content['playtime']))))
            content['name'] = request.args.get('directory', '')
        elif(request.path == '/addplay'):
            mpd_client.consume(1)
            mpd_client.add('signal.mp3')
            content = mpd_client.add(request.args.get('directory', '.'))
            content = mpd_client.play()
        elif(request.path == '/play'):
            content = mpd_client.play()
        elif(request.path == '/pause'):
            content = mpd_client.pause()
        elif(request.path == '/next'):
            content = mpd_client.next()
        elif(request.path == '/prev'):
            content = mpd_client.previous()
        elif(request.path == '/stop'):
            content = mpd_client.clear()
        elif(request.path == '/playpause'):
           app.logger.debug('todo')
        elif(request.path == '/status'):
            content = mpd_client.status()
        elif(request.path == '/currentsong'):
            content = mpd_client.currentsong()
            content.update(mpd_client.status())
            content = process_currentsong(content)
        mpd_client.disconnect()

    except Exception as e:
        app.logger.debug('exception on mod_proxy ' + str(e))

    return jsonify(content)


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
  #path = path.upper
  request_d = request.args.__dict__
  return Response(render_template('index.html', data=request_d))


