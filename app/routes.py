from app import app
import requests
from requests.packages import urllib3
import re
import json
#from app.forms import invoiceForm
from pprint import pprint
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
from random import choices

import traceback

from flask import send_file

import redis

import upnpclient

import pyradios

log_level = getattr(logging, app.config.get('LOG_LEVEL', 'INFO').upper(), None)

logging.basicConfig(level=log_level, format='%(asctime)s %(levelname)s %(name)s %(threadName)s : %(message)s')

CORS(app)

def mpd_wrap(command, *args, **kwargs):
    try:
        mpd_client.ping()
    except Exception as e:
        app.logger.debug('have to reconnect')
        app.logger.debug(traceback.format_exc())
        mpd_client.connect('localhost', int(request.args.get('mpd_port', '6600')))
    finally:
        return command(*args, **kwargs)


@app.route('/cover', methods=['GET', 'POST'])
def cover():

    directory = request.args.get('directory', '')
    app.logger.debug('getting cover for: ' + directory)

    response_type = request.args.get('response_type', app.config.get('COVER_REDIRECT_METHOD', 'direct'))

    cover = 'vinyl.webp'

    #here we go for redis data
    try:
        r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
        cover = r.get('audioloader:cover:' + directory)
        if cover:
            app.logger.debug('got cover from redis: ' + cover)
        else:
            cover = 'vinyl.webp'
    except Exception as e:
        app.logger.debug('getting cover from redis nok' + str(e))
        app.logger.debug(traceback.format_exc())
    finally:
        del(r)

    #here we crawl from directories
    if cover == 'vinyl.webp' or cover == None or cover == '':
        mpd_client = MPDClient()
        mpd_client.timeout = 600
        mpd_client.idletimeout = 600
        mpd_client.connect('localhost', int(request.args.get('mpd_port', '6600')))

        dir_content = mpd_client.listfiles( directory )

        app.logger.debug('got dir_content ' + json.dumps(dir_content))

        image_pattern = re.compile("\.(jpg|jpeg|png|gif)$", re.IGNORECASE)
        cover_pattern = re.compile("folder|cover|front", re.IGNORECASE)



        images = []
        for file_data in dir_content:
            if(image_pattern.search(file_data.get('file',''))):
                images.append(file_data.get('file',''))
        app.logger.debug('found images ' + ', '.join(images))
        #check the images which were found
        for image in images:
            app.logger.debug('image ' + image)
            if(cover_pattern.search(image)):
                app.logger.debug('got cover ' + image)
                cover = image
                break
            if(cover != 'vinyl.webp'):
                break

        if(cover == 'vinyl.webp' and len(images) > 0):
            app.logger.debug('no pattern match; setting the first image as cover')
            cover = images[0]

        mpd_client.disconnect()
        app.logger.debug('got cover from mpd: ' + cover)
        #set key in redis
        try:
            r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
            r.set('audioloader:cover:' + directory, cover)
        except Exception as e:
            app.logger.warn('setting cover in redis nok ' + str(e))
            app.logger.debug(traceback.format_exc())
        finally:
            del r

    app.logger.debug('got cover: ' + cover)

    if response_type == 'redirect':
        if(cover == 'vinyl.webp'):
            fullpath = '/static/assets/vinyl.webp'
        else:
            fullpath = app.config['MUSIC_WWW']  + '/' + request.args.get('directory', '') + '/' + cover
            #request_d['fullpath'] = request_d['fullpath'].replace('//','/')
        return redirect(fullpath)
    else:
        if(cover == 'vinyl.webp'):
            cover_path = './static/assets/vinyl.webp'
        else:
            cover_path = app.config['MUSIC_DIR'] + '/' + request.args.get('directory', '') + '/' + cover
        try:
            return send_file(cover_path)
        except Exception as e:
            app.logger.warn('coulnot send cover ' + str(e) + ' ' + cover_path)
            app.logger.debug(traceback.format_exc())
            return send_file('./static/assets/vinyl.webp')



def process_currentsong(currentsong):
    for state in ['play', 'pause', 'stop']:
        currentsong[state] = False
        if currentsong.get('state', 'stop') == state:
            currentsong[state] = True

    if 'title' not in currentsong and 'file' in currentsong:
        currentsong['title'] = currentsong['file']
        currentsong['display_title'] = currentsong['file']
        currentsong['display_title_top'] = ''
    else:
        title_elements = [currentsong.get('track',None), currentsong.get('title',None)]
        album_elements = [currentsong.get('artist',None), currentsong.get('album',None) ]
        title_elements = list(filter(None, title_elements))
        album_elements = list(filter(None, album_elements))
        currentsong['display_title'] = ' - '.join(title_elements)
        currentsong['display_title_top'] = ' - '.join(album_elements)



    currentsong['active'] = False
    if currentsong.get('state','stop') in ['play', 'pause']:
        currentsong['active'] = True
    if not currentsong['active']:
        currentsong['title'] = 'not playing'
        currentsong['display_title'] = 'not playing'
    if currentsong['state'] == 'play':
        currentsong['next_state'] = 'pause'
        currentsong['next_title'] = 'playing ➙ pause'
        currentsong['next_icon'] = 'pause_circle_outline'
    if currentsong['state'] == 'pause':
        currentsong['next_state'] = 'play'
        currentsong['next_title'] = 'paused ➙ play'
        currentsong['next_icon'] = 'play_circle_outline'


    return currentsong


@app.route('/poll_currentsong', methods=['GET', 'POST'])
def poll_currentsong():
    content = {}
    mpd_client = MPDClient()

    mpd_client.timeout = 40000
    mpd_client.idletimeout = 40000
    mpd_client.connect('localhost', int(request.args.get('mpd_port', '6600')))
    mpd_client.send_idle()
    app.logger.debug("waiting for mpd_client")
    select([mpd_client], [], [], 30)[0]
    mpd_client.noidle()
    content = mpd_client.currentsong()
    content.update(mpd_client.status())
    mpd_client.disconnect()
    content['players'] = get_active_players()

    return jsonify(process_currentsong(content))

@app.route('/kodi', methods=['GET', 'POST'])
def kodi():
    server = request.args.get('server', app.config.get('KODI', 'localhost'))
    if server == "" or server == "undefined":
        server = app.config.get('KODI', 'localhost')

    server = server.replace('http://','')
    m = re.search('^([^\/\:]*)',  server)
    if m:
        server = m.group(1)

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

@app.route('/upnp', methods=['GET', 'POST'])
def upnp():
    server = request.args.get('server')
    if server == "" or server == "undefined":
        return jsonify({'result': 'no server given'})
    try:
        d = upnpclient.Device(server)
        if request.args.get('action', 'Player.Stop') == 'Player.Open':
            d.AVTransport.SetAVTransportURI(InstanceID='0', CurrentURI=request.args.get('stream', 'http://localhost:18080'),CurrentURIMetaData='Audioloader')
            d.AVTransport.Play(InstanceID='0', Speed='1')
        else:
            d.AVTransport.Stop(InstanceID='0')

    except Exception as e:
        app.logger.warn('couldnot run upnp commands')
        app.logger.debug(traceback.format_exc())
        return jsonify({'result': 'load failed'})

    return jsonify({'result': 'loaded'})


@app.route('/generate_randomset', methods=['GET', 'POST'])
def generate_randomset():
    client_id = request.args.get('client_id', '')

    client_data = {
        'randomset': []
    }
    try:
        mpd_client = MPDClient()

        mpd_client.timeout = 600
        mpd_client.idletimeout = 600
        mpd_client.connect('localhost', int(request.args.get('mpd_port', '6600')))
        albums = mpd_client.list('album')
        filter = request.args.get('set_filter', app.config.get('SET_FILTER', ''))
        i = 0
        artists = {}
        while len(client_data['randomset']) < 12 :
            randomset = choices(albums, k=12)
            i = i + 1
            if i == 20:
                break

            for album in randomset:
                try:
                    album_data = mpd_client.search('album', album['album'])
                    artist = album_data[0]['artist']
                    if artist not in artists:
                        if filter == '':
                            client_data['randomset'].append(os.path.dirname(album_data[0]['file']))
                            artists[artist] = True
                        else:
                            if not re.search(app.config['SET_FILTER'], album_data[0]['file']):
                                client_data['randomset'].append(os.path.dirname(album_data[0]['file']))
                                artists[artist] = True

                except Exception as e:
                    app.logger.debug("failed to add album to randomset " + album['album'] + " error:" + str(e))

            #eliminate duplicate albums -- why choices don't work propery...
            client_data['randomset'] = list(set(client_data['randomset']))[0:12]

        mpd_client.disconnect()
        client_data_file =  os.path.normpath(app.config['CLIENT_DB'] + '/' + client_id + '.randomset.json')



        if client_id != '' and client_data_file.startswith(app.config['CLIENT_DB']) and re.search(r'[^A-Za-z0-9_\-\.]', client_data_file):
        #write back the file
            with open(client_data_file, 'w') as ch:
                ch.write(json.dumps(client_data))
    except Exception as e:
        app.logger.debug("failed to generate randomset " + str(e))
        app.logger.debug(traceback.format_exc())
        return jsonify({'result': 'nok'})
    return jsonify({'result': 'ok'})

def read_data(client_id, data='history'):
    client_data = {}
    client_data[data] = []
    client_data_file =  os.path.normpath(app.config['CLIENT_DB'] + '/' + client_id + '.' + data +'.json')
    app.logger.debug('client_data_file ' + client_data_file)
    if client_id != '' and client_data_file.startswith(app.config['CLIENT_DB']) and re.search(r'[^A-Za-z0-9_\-\.]', client_data_file):
        #read history
        ch_raw = "{}"
        try:
            with open(client_data_file) as f:
                ch_raw = ''.join(f.readlines())
            client_data = json.loads(ch_raw)
            # Do something with the file
        except IOError:
            app.logger.warn(data + " for " + client_id + "not readable")
            app.logger.debug(traceback.format_exc())
    return client_data

@app.route('/remove_favourite', methods=['GET', 'POST'])
@app.route('/add_favourite', methods=['GET', 'POST'])
def favourites():
    try:
        directory = request.args.get('directory', '.');
        #manage history
        client_id = request.args.get('client_id', 'guest')
        client_favourites = read_data(client_id, 'favourites')

        #first try to find dir in client_favourites
        if directory in client_favourites['favourites']:
            client_favourites['favourites'].remove(directory)

        if request.path[1:] == 'add_favourite':
            client_favourites['favourites'].append(directory)
        #client_favourites['favourites'] = client_favourites['favourites'][-10:]

        client_favourites_file =  os.path.normpath(app.config['CLIENT_DB'] + '/' + client_id + '.favourites.json')

        if client_id != '' and client_favourites_file.startswith(app.config['CLIENT_DB']) and re.search(r'[^A-Za-z0-9_\-\.]', client_favourites_file):
            #write back the file
            with open(client_favourites_file, 'w') as ch:
                ch.write(json.dumps(client_favourites))
    except Exception as e:
        app.logger.debug("failed to save favourite " + str(e))
        app.logger.debug(traceback.format_exc())
        return jsonify({'result': 'nok'})
    return jsonify({'result': 'ok'})


def get_active_players():
    players = []

    try:
        r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
        for key in r.scan_iter("upnp:player:*:last_seen"):
            last_seen = float(r.get(key))
            #app.logger.debug("last seen vs now "+ key + "   " + str(last_seen) + '   ' + str(time.time()) + "   " +  str(time.time() - last_seen) )
            if time.time() - last_seen < 600:
                data = json.loads(r.get(key.replace('last_seen','data')))
                players.append(data)
            #if have already all players read let's do some housekeeping here
            if time.time() - last_seen > 1800:
                r.delete(key.replace('last_seen','data'))
                r.delete(key)
    except Exception as e:
        app.logger.debug('getting cover from redis nok' + str(e))
        app.logger.debug(traceback.format_exc())
    finally:
        del(r)

    if len(players) == 0 and 'KODI' in app.config:
        players.append({
            'ip': app.config['KODI'],
            'model_name': 'Kodi',
            'name': 'Kodi player'
        })

    return players



@app.route('/active_players', methods=['GET', 'POST'])
def active_players():
    players = get_active_players()
    return jsonify(players)

@app.route('/history', methods=['GET', 'POST'])
@app.route('/randomset', methods=['GET', 'POST'])
@app.route('/favourites', methods=['GET', 'POST'])
def data():
    client_data_tree = {
        'tree': [],
        'info': {}
    }
    data = request.path[1:];
    try:
        mpd_client = MPDClient()

        mpd_client.timeout = 600
        mpd_client.idletimeout = 600
        mpd_client.connect('localhost', int(request.args.get('mpd_port', '6600')))
        app.logger.debug('got ' + request.path)


        client_data = read_data(request.args.get('client_id', ''), data)


        #first try to find dir in client_history
        for directory in client_data[data]:
            count = {}
            tree_data = {}
            if directory != '/' and not re.search(r'^http:', directory):
                try:
                    count = mpd_client.count('base', directory)
                    count['playhours'] = re.sub(r'^0:', '', str(datetime.timedelta(seconds=int(count['playtime']))))
                except Exception as e:
                    app.logger.warn('couldnot get count for  '+ directory + "  " + str(e))
                    app.logger.debug(traceback.format_exc())
                tree_data = {
                    'directory': directory,
                    'count': count
                    }

            elif re.search(r'^http:', directory):
                #TODO... find a way to map the stream to the name of the radio... Redis
                tree_data = {
                    'directory': directory,
                    'count': None,
                    'stream': directory
                    }


            client_data_tree['tree'].append(tree_data)
        mpd_client.disconnect()
        client_data_tree['tree'] = list(reversed(client_data_tree['tree']))
    except Exception as e:
        app.logger.warn('exception on data_read ' + str(e))
        app.logger.debug(traceback.format_exc())
    return jsonify(client_data_tree)

@app.route('/search_radio', methods=['GET', 'POST'])
def search_radio():
    content = {}
    content['tree'] = []
    pattern = request.args.get('pattern', 'ugar')
    if len(pattern) < 3:
        return jsonify(content)

    try:
        rb = pyradios.RadioBrowser()
        app.logger.debug('searching for radio: ' + pattern)
        content['tree'] = rb.search(name=pattern, name_exact=False)

        content['tree'] = list(filter(lambda elem: elem['name'] != '' and (elem['bitrate'] > 60 or elem['bitrate'] == 0), content['tree']))

    except Exception as e:
        app.logger.warn('exception on search_radio ' + str(e))
        app.logger.debug(traceback.format_exc())

    return jsonify(content)



@app.route('/listfiles', methods=['GET', 'POST'])
@app.route('/lsinfo', methods=['GET', 'POST'])
@app.route('/ls', methods=['GET', 'POST'])
@app.route('/search', methods=['GET', 'POST'])
@app.route('/addplay', methods=['GET', 'POST'])
@app.route('/play', methods=['GET', 'POST'])
@app.route('/pause', methods=['GET', 'POST'])
@app.route('/playpause', methods=['GET', 'POST'])
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
        mpd_client.connect('localhost', int(request.args.get('mpd_port', '6600')))
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
            #if no directory present let's take radio_uuid and then url
            playable = request.args.get('directory', request.args.get('url'))
            #if 'stationuuid' in request['args'] and playable == request.args.get('radio_uuid'):
                #do resolve radio url
            #    playable = 'signal.mp3'

            try:
                if('directory' in request['args']):
                    mpd_client.add('signal.mp3')
            except Exception as e:
                app.logger.info('signal.mp3 was not queued, music will start immediately')
                app.logger.debug(traceback.format_exc())



            content = mpd_client.add(playable)
            content = mpd_client.play()

            if('directory' in request['args']):
                #manage history
                client_id = request.args.get('client_id', '')
                client_history = read_data(client_id)

                #first try to find dir in client_history
                if playable in client_history['history']:
                    client_history['history'].remove(playable)
                client_history['history'].append(playable)
                client_history['history'] = client_history['history'][-10:]

                client_history_file =  os.path.normpath(app.config['CLIENT_DB'] + '/' + client_id + '.history.json')

                if client_id != '' and client_history_file.startswith(app.config['CLIENT_DB']) and re.search(r'[^A-Za-z0-9_\-\.]', client_history_file):
                    #write back the file
                    with open(client_history_file, 'w') as ch:
                        ch.write(json.dumps(client_history))


        elif(request.path == '/play'):
            content = mpd_client.play()
        elif(request.path == '/pause'):
            content = mpd_client.pause()
        elif(request.path == '/playpause'):
            status = mpd_client.status()
            if(status.get('state','pause') == 'pause'):
                content = mpd_client.play()
            else:
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
            content['players'] = get_active_players()
            content = process_currentsong(content)
        mpd_client.disconnect()

    except Exception as e:
        app.logger.warn('exception on mpd_proxy ' + str(e))
        app.logger.debug(traceback.format_exc())

    return jsonify(content)


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
  #path = path.upper
  request_d = request.args.__dict__
  return Response(render_template('index.html', data=request_d))
