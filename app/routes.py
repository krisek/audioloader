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

import sys

bandcamp_enabled = True

try:
    import bandcamp_dl.bandcamp
    from bandcamp_dl.bandcamp import Bandcamp
    from bandcamp_dl.bandcampdownloader import BandcampDownloader
    from bandcamp_dl.__init__ import __version__
except ImportError:
    # Handle the absence of the module_name here
    bandcamp_enabled = False


youtube_enabled = True

try:
    import yt_dlp
except ImportError:
    youtube_enabled = False

log_level = getattr(logging, app.config.get('LOG_LEVEL', 'INFO').upper(), None)

logging.basicConfig(level=log_level, format='%(asctime)s %(levelname)s %(name)s %(threadName)s : %(message)s')

CORS(app)

def mpd_wrap(command, *args, **kwargs):
    try:
        mpd_client.ping()
    except Exception as e:
        app.logger.debug('have to reconnect')
        app.logger.debug(traceback.format_exc())
        mpd_client.connect(app.config.get('MPD_HOST', 'localhost'), int(request.args.get('mpd_port', '6600')))
    finally:
        return command(*args, **kwargs)


ydl_opts = {
    'format': 'bestaudio',
    'lazy_playlist': True,
}

preferred_formats = {'141': 1, '171': 2, '140': 3, '250': 4, '249': 5, '139': 6} #'251': 0, 


def process_yt_entry(info):
    urls = {}

    for format in info['formats']:
        if re.search('audio only', format['format']):
            # print(format['format_id'] + "   " + format['ext'] + "  " + format['format'])
            if format['format_id'] in preferred_formats:

                urls[preferred_formats[format['format_id']]] = format['url']
            else:
                try:
                    urls[int(format['format_id'])] = format['url']
                except:
                    pass    

    url = ""
    for key in sorted(urls):
        # print(key)
        url = urls[key]
        break
    return url

def process_yt_playable(url):
    playables = []

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(
            url , download=False)
        print(info['title'])
        art = ""
        preferred_art_formats = {'/mqdefault.': {'pref': 1}, '/hqdefault.': {'pref': 2}, '/default.': {'pref': 3}}
        for thumbnail in info['thumbnails']:
            # print(thumbnail)
            #print(thumbnail['url'])
            for art_format in preferred_art_formats:
                #print(art_format)
                if art_format in thumbnail['url']:
                    #print('match')
                    preferred_art_formats[art_format]['url'] = thumbnail['url']
            
        for art_format in preferred_art_formats:
            if 'url' in preferred_art_formats[art_format]:
                art = preferred_art_formats[art_format]['url']
                break
        
        # print(info)
        for entry in info.get('entries', []):
            playables.append(process_yt_entry(entry))
        if 'formats' in info:
            playables.append(process_yt_entry(info))

        return info['title'], art, playables


@app.route('/cover', methods=['GET', 'POST'])
def cover():

    directory = request.args.get('directory', '')
    app.logger.debug('getting cover for: ' + directory)

    response_type = request.args.get('response_type', app.config.get('COVER_REDIRECT_METHOD', 'direct'))

    cover = 'vinyl.webp'

    #here we go for redis data
    try:
        r = redis.Redis(host=app.config.get('REDIS_HOST', 'localhost'), port=6379, db=0, decode_responses=True)
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
        mpd_client.connect(app.config.get('MPD_HOST', 'localhost'), int(request.args.get('mpd_port', '6600')))

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
            r = redis.Redis(host=app.config.get('REDIS_HOST', 'localhost'), port=6379, db=0, decode_responses=True)
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
    if currentsong.get('state','stop') == 'play':
        currentsong['next_state'] = 'pause'
        currentsong['next_title'] = 'playing ➙ pause'
        currentsong['next_icon'] = 'pause_circle_outline'
    if currentsong.get('state','stop') == 'pause':
        currentsong['next_state'] = 'play'
        currentsong['next_title'] = 'paused ➙ play'
        currentsong['next_icon'] = 'play_circle_outline'


    return currentsong


@app.route('/poll_currentsong', methods=['GET', 'POST'])
def poll_currentsong():
    content = {}
    mpd_client = MPDClient()
    mpd_client.idletimeout = 30 
    mpd_client.connect(app.config.get('MPD_HOST', 'localhost'), int(request.args.get('mpd_port', '6600')))
    try:
        mpd_client.idle('playlist', 'player')
        app.logger.debug("waiting for mpd_client")

    except Exception as e:
        app.logger.debug("mpd_client wait exception {}".format(e.__class__))
    
    mpd_client.disconnect()
    mpd_client.connect(app.config.get('MPD_HOST', 'localhost'), int(request.args.get('mpd_port', '6600')))
    content = mpd_client.currentsong()
    content.update(mpd_client.status())
    content['players'] = get_active_players()
    content['default_stream'] = app.config.get('STREAM_URL', 'http://{}:8000/audio.ogg'.format(os.environ.get('hostname', 'localhost.localdomain')))
    content['bandcamp_enabled'] = bandcamp_enabled

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
                    'file': request.args.get('stream', app.config.get('STREAM_URL', 'http://{}:8000/audio.ogg'.format(os.environ.get('hostname', 'localhost.localdomain'))))
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
            d.AVTransport.SetAVTransportURI(InstanceID='0', CurrentURI=request.args.get('stream', app.config.get('STREAM_URL', 'http://{}:8000/audio.ogg'.format(os.environ.get('hostname', 'localhost.localdomain')))),CurrentURIMetaData='Audioloader')
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
        mpd_client.connect(app.config.get('MPD_HOST', 'localhost'), int(request.args.get('mpd_port', '6600')))
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
        r = redis.Redis(host=app.config.get('REDIS_HOST', 'localhost'), port=6379, db=0, decode_responses=True)
        for key in r.scan_iter("upnp:player:*:last_seen"):
            last_seen = float(r.get(key))
            #app.logger.debug("last seen vs now "+ key + "   " + str(last_seen) + '   ' + str(time.time()) + "   " +  str(time.time() - last_seen) )
            if time.time() - last_seen < 900:
                data = json.loads(r.get(key.replace('last_seen','data')))
                players.append(data)
            #if have already all players read let's do some housekeeping here
            if time.time() - last_seen > 1200:
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


@app.route('/radio_history', methods=['GET', 'POST'])
def radio_history():
    client_data = read_data(request.args.get('client_id', ''), 'radio_history')
    return jsonify(client_data)

@app.route('/bandcamp_history', methods=['GET', 'POST'])
def bandcamp_history():
    client_data = read_data(request.args.get('client_id', ''), 'bandcamp_history')
    return jsonify(client_data)

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
        mpd_client.connect(app.config.get('MPD_HOST', 'localhost'), int(request.args.get('mpd_port', '6600')))
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
        content_tree = []
        for station in content['tree']:
            if station.get('favicon', '') == '':
                station['favicon'] = 'assets/radio.png'
            content_tree.append(station)
        content['tree'] = list(filter(lambda elem: elem['name'] != '' and (elem['bitrate'] > 60 or elem['bitrate'] == 0), content['tree']))

    except Exception as e:
        app.logger.warn('exception on search_radio ' + str(e))
        app.logger.debug(traceback.format_exc())

    return jsonify(content)

# bandcamp search is not a real search, it is merely retrieves metadata to present a popup on frontend side
@app.route('/search_bandcamp', methods=['GET', 'POST'])
def search_bandcamp():
    content = {}
    content['tree'] = []
    pattern = request.args.get('pattern', 'ugar')
    if len(pattern) < 20 or not ('bandcamp.com/' in pattern or 'youtube' in pattern or 'youtu.be' in pattern):
        return jsonify(content)
   
    if 'bandcamp.com' in pattern:
        try:
            # lets get create list of urls for a bandcamp link
            app.logger.debug('searching for bandcamp album: ' + pattern)
            bandcamp = Bandcamp()
            album_list = []
            album_list.append(bandcamp.parse(pattern, True, False, True)) #art, no lyrics, debug
            content['tree'] = album_list

        except Exception as e:
            app.logger.warn('exception on search_bandcamp ' + str(e))
            app.logger.debug(traceback.format_exc())
    if 'youtube' in pattern or 'youtu.be' in pattern:
        # there is no easy way to get informtion on url so we'll be blank here
        app.logger.debug('returning youtube link: ' + pattern)
        content['tree'].append({
            'url': pattern,
            'title': pattern,
            'year': '',
            'art': 'https://i.ytimg.com/vi_webp/VbChrk8Vs64/mqdefault.webp',
            'artist': ''
        })


    return jsonify(content)

@app.route('/remove_history', methods=['GET', 'POST'])
def remove_history():
    #manage bandcamp/radio history
    playable = request.args.get('directory', request.args.get('url', ''))
    station_uuid = request.args.get('station_uuid', '')
    if station_uuid != '':
        history = 'radio_history'
    elif 'http' in playable: 
        history = 'bandcamp_history'
    else:
        history = 'history'
    
    client_id = request.args.get('client_id', 'guest')

    client_history = read_data(client_id, history)

    if 'links' not in client_history:
        client_history['links'] = {}
    elif playable in client_history['links']:
        del(client_history['links'][playable])

    if playable in client_history[history]:
        client_history[history].remove(playable)
        

    client_history_file =  os.path.normpath(app.config['CLIENT_DB'] + '/' + client_id + '.' + history + '.json')

    if client_id != '' and client_history_file.startswith(app.config['CLIENT_DB']) and re.search(r'[^A-Za-z0-9_\-\.]', client_history_file):
        #write back the file
        with open(client_history_file, 'w') as ch:
            ch.write(json.dumps(client_history, indent=4))
    return jsonify({'result': 'ok'})


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
        mpd_client.connect(app.config.get('MPD_HOST', 'localhost'), int(request.args.get('mpd_port', '6600')))
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
            playable = request.args.get('directory', request.args.get('url', ''))
            playables = []
            bandcamp_playable = False
            bandcamp_playable = True if bandcamp_enabled and 'bandcamp.com' in playable else False
            youtube_playable = False
            youtube_playable = True if youtube_enabled and ('youtube' in playable or 'youtu.be' in playable) else False


            if request.args.get('stationuud', '') != '' and playable == '':
                #do resolve radio url
                rb = pyradios.RadioBrowser()
                station = rb.station_by_uuid(request['args']['stationuuid'])
                playable = station['url']
            
            if bandcamp_playable:
                # lets get create list of urls for a bandcamp link
                bandcamp = Bandcamp()
                album_list = []
                album_list.append(bandcamp.parse(playable, True, False, True)) #art, no lyrics, debug
                for album in album_list:
                    for track in album['tracks']:
                        playables.append(track['url'])
            if youtube_playable:
                # lets get create list of urls for a bandcamp link
                (yt_title, yt_art, playables) = process_yt_playable(playable)


            try:
                if request.args.get('directory', '') != '' or len(playables) > 0:
                    mpd_client.add('signal.mp3')
            except Exception as e:
                app.logger.info('signal.mp3 was not queued, music will start immediately')
                app.logger.debug(traceback.format_exc())

            if len(playables) == 0:
                content = mpd_client.add(playable)
            else:
                for elem in playables:
                    content = mpd_client.add(elem)
            
            content = mpd_client.play()

            client_id = request.args.get('client_id', '')

            if(request.args.get('directory', '') != ''):
                #manage history
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
            if(re.search(r'^https{0,1}://', playable) 
                and request.args.get('stationuuid', '') != '' 
                    and 'bandcamp.com' not in playable
                        and 'youtube' not in playable
                            and 'youtu.be' not in playable):
                #manage radiohistory
                stationuuid = request.args['stationuuid']
                client_history = read_data(client_id, 'radio_history')
                if 'stations' not in client_history:
                    client_history['stations'] = {}

                if stationuuid in client_history['radio_history']:
                    client_history['radio_history'].remove(stationuuid)
                client_history['radio_history'].append(stationuuid)
                client_history['radio_history'] = client_history['radio_history'][-10:]

                client_history['stations'][stationuuid] = {
                    'url': playable,
                    'stationuuid': stationuuid,
                    'name': request.args.get('name', ''),
                    'favicon': request.args.get('favicon', '')
                }
                client_history_file =  os.path.normpath(app.config['CLIENT_DB'] + '/' + client_id + '.radio_history.json')

                if client_id != '' and client_history_file.startswith(app.config['CLIENT_DB']) and re.search(r'[^A-Za-z0-9_\-\.]', client_history_file):
                    #write back the file
                    with open(client_history_file, 'w') as ch:
                        ch.write(json.dumps(client_history))
            if (bandcamp_playable or youtube_playable):
                #manage bandcamp history
                client_history = read_data(client_id, 'bandcamp_history')
                if 'links' not in client_history:
                    client_history['links'] = {}

                if playable in client_history['bandcamp_history']:
                    client_history['bandcamp_history'].remove(playable)

                client_history['bandcamp_history'].append(playable)
                client_history['bandcamp_history'] = client_history['bandcamp_history'][-20:]
                if 'bandcamp.com' in playable:
                    client_history['links'][playable] = {
                        'url': playable,
                        'favicon': album_list[0].get('art', ''),
                        'title': album_list[0].get('title', ''),
                        'artist': album_list[0].get('artist', ''),
                        'date': album_list[0].get('date', '')
                    }
                else:
                    client_history['links'][playable] = {
                        'url': playable,
                        'favicon': yt_art,
                        'title': yt_title,
                    }
                client_history_file =  os.path.normpath(app.config['CLIENT_DB'] + '/' + client_id + '.bandcamp_history.json')

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
            content['bandcamp_enabled'] = bandcamp_enabled
            content['default_stream'] = app.config.get('STREAM_URL', 'http://{}:8000/audio.ogg'.format(os.environ.get('hostname', 'localhost.localdomain')))
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
