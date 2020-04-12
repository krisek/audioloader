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

# Start with a basic flask app webpage.
#from flask_socketio import SocketIO, emit
from flask import Flask, render_template, url_for, copy_current_request_context, jsonify, Response, request, redirect
import threading
from threading import Thread, Event

from flask_cors import CORS

from select import select

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s %(levelname)s %(name)s %(threadName)s : %(message)s')

CORS(app)


#turn the flask app into a socketio app
#socketio = SocketIO(app, async_mode='gevent', logger=True, engineio_logger=True)

#random number Generator Thread
thread = Thread()
thread_stop_event = Event()

#def mpd_status_check():
#    mpd_client_status = MPDClient()
#    mpd_client_status.connect(app.config['MPD_SERVER'], app.config['MPD_PORT'])
#    while not thread_stop_event.isSet():
#        mpd_client_status.send_idle()

#        canRead = select([mpd_client_status], [], [], 120)[0]

#        mpd_client_status.noidle()


#        currentsong = mpd_client_status.currentsong()
        #app.logger.debug('got currentsong ' + json.dumps(currentsong))
#        socketio.emit('songinfo', currentsong , namespace='/mpd')



#thread = socketio.start_background_task(mpd_status_check)

mpd_client = MPDClient()

mpd_client.timeout = 600
mpd_client.idletimeout = 600
mpd_client.connect(app.config['MPD_SERVER'], app.config['MPD_PORT'])
mpd_client_idle = False
mpd_status = {}

mpd_client_status_poll = MPDClient()
mpd_client_status_poll.connect(app.config['MPD_SERVER'], app.config['MPD_PORT'])


def mpd_connect():
    try:
        mpd_client.ping()
    except:
        mpd_client.connect(app.config['MPD_SERVER'], app.config['MPD_PORT'])


#def save_status(event):
#    if not event.exception:
#        job = scheduler.get_job(event.job_id)
#        app.logger.debug('task return ' + json.dumps(event.retval))
#        mpd_status = event.retval
#    else:
#        mpd_client.connect(app.config['MPD_SERVER'], app.config['MPD_PORT'])


#scheduler = BackgroundScheduler()
#scheduler.add_listener(save_status, EVENT_JOB_EXECUTED | EVENT_JOB_ERROR)
#scheduler.add_job(mpd_connect, 'interval', seconds=60)
#scheduler.start()

@app.route('/cover', methods=['GET', 'POST'])
def cover():
    mpd_connect()
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
        request_d['fullpath'] = '/static/vinyl.png'
        request_d['cover'] = 'vinyl.png'
    else:
        request_d['fullpath'] = app.config['MUSIC_WWW']  + request.args.get('directory', '') + '/' + cover
        #request_d['fullpath'] = request_d['fullpath'].replace('//','/')
        request_d['cover'] = cover

    return redirect(request_d['fullpath'])
    #return Response(renderfrom nested_lookup import nested_lookup_template('cover.html', data=request_d))


def process_currentsong(currentsong):
    for state in ['play', 'pause', 'stop']:
        currentsong[state] = False
        if currentsong['state'] == state:
            currentsong[state] = True
    if 'title' not in currentsong and 'file' in currentsong:
        currentsong['title'] = currentsong['file']
    currentsong['active'] = False
    if currentsong['state'] in ['play', 'pause']:
        currentsong['active'] = True
    if not currentsong['active']:
        currentsong['title'] = 'not playing'
    return currentsong


@app.route('/poll_currentsong', methods=['GET', 'POST'])
def poll_currentsong():

    try:
        mpd_client_status_poll.ping()
    except:
        mpd_client_status_poll.connect(app.config['MPD_SERVER'], app.config['MPD_PORT'])


    mpd_client_status_poll.send_idle()
    app.logger.debug("waiting for mpd_client_status_poll")
    select([mpd_client_status_poll], [], [], 10)[0]
    mpd_client_status_poll.noidle()
    content = mpd_client_status_poll.currentsong()
    content.update(mpd_client_status_poll.status())
    return jsonify(process_currentsong(content))



@app.route('/listfiles', methods=['GET', 'POST'])
@app.route('/lsinfo', methods=['GET', 'POST'])
@app.route('/ls', methods=['GET', 'POST'])
@app.route('/count', methods=['GET', 'POST'])
@app.route('/search', methods=['GET', 'POST'])
@app.route('/addplay', methods=['GET', 'POST'])
@app.route('/play', methods=['GET', 'POST'])
@app.route('/pause', methods=['GET', 'POST'])
@app.route('/next', methods=['GET', 'POST'])
@app.route('/prev', methods=['GET', 'POST'])
@app.route('/stop', methods=['GET', 'POST'])
@app.route('/status', methods=['GET', 'POST'])
@app.route('/currentsong', methods=['GET', 'POST'])

def mpd_proxy():

    if(request.path != '/count'):
        mpd_connect()


    content = {}
    app.logger.debug('got ' + request.path)
    if(request.path == '/listfiles'):
        content['tree'] = mpd_client.listfiles( request.args.get('directory', '.'))
    elif(request.path == '/lsinfo'):
        content['tree'] = mpd_client.lsinfo( request.args.get('directory', '.'))
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
    return jsonify(content)


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
  #path = path.upper
  request_d = request.args.__dict__
  return Response(render_template('index.html', data=request_d))


