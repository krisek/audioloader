# Introduction

Audioloader is a web based [Music Player Deamon](http://www.musicpd.org) (MPD) client with special focus on playing music organized in folders.

[![Screenshot](https://i.postimg.cc/fyCT7vS9/Screenshot-from-2020-04-26-16-03-24.png)](https://postimg.cc/fS3NDmKz)

The software has three components: a Flask/Python based backend, an Angular/Bootstrap based, responsive web user interface and and optional discovery daemon which discovers UPnP media renderers on the local network.

The Flask application is very thin, it does almost nothing but proxying requests towards the MPD server from the web client.

The application features six ways of selecting music from MPD and other sources:

1. selecting folders from a browser
1. searching in the MPD database
1. creating a random set of folders to choose music from (useful for large music libraries)
1. selecting folders from the history
1. marking folders as favorite
1. select radio station from the [radio-browser.info](http://radio-browser.info) community radio database
1. play album from Bandcamp (optional) 


The Flask application runs on the same system where you run MPD. You can configure any supported output method on MPD; a very common use case is to install the application on a Raspberry Pi (or home server), configure MPD with HTTP stream output, so that you can stream music from all of your devices.

If you configure the MPD server with a HTTP stream output, the application can load this stream to UPnP media renderers discovered on your network. ⚠ Don't forget to configure the STREAM_URL parameter in config.py or in the 'stream from' parameter in the settings menu of the web UI. UPnP device discovery is performed by a separate script.

# Installation

## Install from repository

I detail here how to install the application on Debian/Ubuntu derivatives, but you can get it running wherever Python and Pip are available.

1. Install base packages

```bash
sudo apt install redis-server redis-tools git uwsgi-plugin-python3 python3 python3-pip python3-virtualenv
```

Redis is used to cache the name of folder images and to keep track of the UPnP devices discovered on the network. It slightly improves performance of showing folder images, but it is not a must to install it the application can work without it — though, if you want to have UPnP discovery, it is a must to install it.

2. Download

```bash
git clone https://github.com/krisek/audioloader.git
```

3. Prepare environment

```bash
cd audioloader
virtualenv -p python3 venv
. venv/bin/activate
pip install -r requirements.txt
cp app.ini.tpl app.ini
```

4. Configure

```bash
cp config.tpl.py config.py
```

In this file you can edit the configuration of the Flask backend.

```python
  #serve cover art directly (from MUSIC_DIR) or through a redirect (to MUSIC_WWW)
  COVER_RESPONSE_TYPE = 'direct'

  #the application will look in this folder for your music repository when it returns cover art
  MUSIC_DIR = '/media/music/mp3'

  #the application will redirect to this URI if you decide to server cover art through redirect to a web server
  MUSIC_WWW = '/music'

  #force client cache for static content
  SEND_FILE_MAX_AGE_DEFAULT = 43200

  #where to store client favorites/history/random folders — the user running the web application needs to have write access on this directory
  CLIENT_DB = '/var/lib/audioloader'

  LOG_LEVEL = 'info'

  #hostname of default kodi server to load music to
  # KODI = 'kodi.localdomain'

  #url of the mpd lame/vorbis stream (httpd output) configured ~ can be overriden from the web UI settings
  STREAM_URL = 'http://{}:8000/audio.ogg'.format(os.environ.get('hostname', 'localhost.localdomain'))

  #hostname of your mpd server
  MPD_HOST = 'localhost'
  
  #hostname of your Redis server
  REDIS_HOST = 'localhost'

```

5. Web server

The simplest and most portable way to run audioloader is Gunicorn.

```bash
pip install gunicorn
```

If Gunicorn serves directly the Flask backend, then the static cover art needs to be served as well by the Flask; you need to set a MUSIC_DIR in the config and set `COVER_RESPONSE_TYPE=direct`.

If you want to add https or extra protection to the application, you can install a web server to proxy towards Gunicorn. An example Nginx virtual host configuration is included in the repository. If you are willing to expose your music library on this web server, you can configure the application to redirect the client to download cover art — this might be less resource intensive as serving the files through the Flack app directly. Your mileage might vary - I use the default `direct` setting for `COVER_RESPONSE_TYPE` nowadays on an RPi4 and it is all good.


6. Bandcamp and Youtube support

You can enable the optional Bandcamp support by installing the bandcamp-downloader package. 

```bash
pip install bandcamp-downloader
```

Similarly, you can enable playing music from Youtube by installing the yt-dlp package.

```bash
pip install yt-dlp
```

This part of the code is not supported at all, it might break anytime.

7. Startup

```bash
gunicorn --workers 12 --max-requests 300  --bind 0.0.0.0:3400  --timeout 1800 --chdir . wsgi:application
```

If you want to enable UPnP discovery, start the `disover.py` script as well, it requires two parameters: -m the IP address of the audioloader host and -n the local subnet. (This might be enhanced in later releases.)

## You've been warned

No responsibility on my side for any damage. The application is intended to be used in friendly or appropriately protected network environment.

# Upgrade

Audioloader is distributed in this Git repository. New features are developed against branches, thus you can rely on the master HEAD until further notice. Do regular pulls against it (`git pull https://github.com/krisek/audioloader.git && pip install -r requirements.txt`), so that you get the latest bugfixes and the new features implemented.

# Use

If you run the application with standalone gunicorn, you just need to visit http://localhost:3400 after starting it. 

## Navigation bar
The first icon on the left side opens the directory view. The second opens the dash (which is the default view). The third one opens the radio stations view. The optional fourth one shows your Bandcamp history. In the middle you see the title of the currently playing song and the various media controls (if there's anything playing). On the left side you see a search bar: it needs minimum four characters to start searching.

### Settings
The gear button opens the settings dialog.

MPD port: this is where you can set what port the Flask application should use to connect to the MPD server. (Tip: if you have a family, you can set up separate MPD server for everybody — it's not complicated.)

Stream from: If you plan to stream from the MPD server, where this stream is located

Client: your id, this identifies your history / random album selection and favorites on the server, so that you can use the application from several devices

Log level: not relevant (only debug is supported for the time being)

List from # items: amount of sub-directories in a directory to represent with cover arts. If there are more sub-directories in a directory than this number then the sub-directories will be represented as a list. 

## Music selection
The directory browser speaks for itself.

The dash contains three areas the random set, the favorites and the history.

Having random directories presented is an important feature, if you have a large amount of albums, and you just want listening something but you don't have anything particular in mind. The random set presents 12 random albums from your MPD database. The set is persistent, but only one exists at the same time for a client. If you click on the refresh button a new one will be generated, and the existing set will be lost.

On the right hand side you find your listening history; the last 10 loaded directories are saved.

If you mark a folder as favorite it will be listed in the bottom of the dash. You can have as many favorites as you want.

The radio station view let's you search and load radio stations for the [radio-browser.info](http://radio-browser.info) community radio database. The last 10 started station is displayed in the radio station history.

You can paste Bandcamp album URL's in the search box on the dash and the Bandcamp view, this offers you the possibility to play albums directly from Bandcamp.

## UPnP

UPnP media renderers available on the network are monitored by the `discover.py` daemon. This application listens to the traffic in the UPnP multicast group and if a new device appears, it registers the device's capabilities. Audioloader offers rendering on devices which have been seen on the network in the last 10 minutes. (Consequently, if you turn off a device it won't immediately disappear from Audioloader.) When you turn on a UPnP device it might take some time until `discover.py` finds it, depending on how chatty the device is on UPnP. (In order not to miss anything, `discover.py` initiates full UPnP discovery regularly.)


# TODO / ISSUES

- (Better) playlist management
- At the moment the application plays in consume mode, ie. there is no rewind option

# Development

```bash
apt update
apt install -y git
cd /opt
sudo tar xvf /downloads/node-v18.17.1-linux-x64.tar.xz 
cd /usr/local/bin/
sudo ln -s /opt/node-v18.17.1-linux-x64/bin/{corepack,node,npm,npx} .
sudo npm install --global yarn
sudo npm install -g @angular/cli
sudo ln -s /opt/node-v18.17.1-linux-x64/bin/{ng,yarn,yarnpkg} .
cd /projects/audioloader/angular/audioloader
yarn install
yarn upgrade
ng update @angular/cli
ng update @angular/core
ng update @angular/material
ng update @angular/cdk
ng serve --host 0.0.0.0

```

# About
The application was created by Kristof Imre Szabo.
