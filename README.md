# Introduction

Audioloader is a web based [Music Player Deamon](http://www.musicpd.org) (MPD) client with special focus on playing music organized in folders.

[![Screenshot](https://i.postimg.cc/fyCT7vS9/Screenshot-from-2020-04-26-16-03-24.png)](https://postimg.cc/fS3NDmKz)

The software has two components: a Flask/Python based backend and an Angular/Bootstrap based, responsive web user interface.

The Flask application is very thin, it does almost nothing but proxying requests towards the MPD server from the web client.

The application feaures five ways of selecting music from MPD:

1. selecting folders from a browser
1. searching in the MPD database
1. creating a random set of folders to choose music from (useful for large music libraries)
1. selecting folders from the history
1. marking folders as favourite


The Flask application runs on the same system where you run MPD. You can configure any supported output method on MPD; a very common use case is to install the application on a Raspberry Pi (or home server), configure MPD with HTTP stream output, so that you can stream music from all of your devices.

If you configure the MPD server with a HTTP stream output, the application can load this stream to a Kodi server, so that you can listen music on your Kodi connected sound system.

# Installation

I detail here how to install the application on Debian/Ubuntu derivatives, but you can get it running wherever Python and Pip are available.

1. Install base packages

```bash
sudo apt install redis-server redis-tools git uwsgi-plugin-python3 python3 python3-pip python3-virtualenv python-virtualenv
```

Redis is used to cache the name of folder images. It slightly improves performace, but nothing serious happens if you don't install it.

2. Download

```bash
git clone https://github.com/krisek/audioloader.git
```

3. Prepare environment

```bash
cd audioloader
virtualenv -p python3 venv
. venv/bin/activate
cd venv
git clone https://github.com/Mic92/python-mpd2.git
cd python-mpd2
python setup.py install
cd ../../
pip install -r requirements.txt
cp app.ini.tpl app.ini
```

4. Configure

```bash
cp config.tpl.py config.py`
```

In this file you can edit the configuration of the Flask backend.

```
  #serve cover art directly or through a redirect
  COVER_RESPONSE_TYPE = 'direct'

  #the application will look in this folder for your music repository when it returns cover art
  MUSIC_DIR = '/media/music/mp3'

  #the application will redirect to this URI if you decide to server cover art through redirect to a web server
  MUSIC_WWW = '/music'

  #force client cache for static conent
  SEND_FILE_MAX_AGE_DEFAULT = 43200

  #where to store client favourites/history/random folders -- the user running the web application needs to have write access on this directory
  CLIENT_DB = '/var/lib/audioloader'

  LOG_LEVEL = 'info'

  #hostname of default kodi server to load music to
  KODI = 'kodi.localdomain'
```

5. Web server

uWSGI can run the application directly without any web server needed. This is a viable method if you don't want to expose the application to external networks and you don't have many clients. If uWSGI serves directly the Flask backe-end, static cover art needs to be served by the back-end; you need to set a MUSIC_DIR in the config, which tells the server where to look for cover art. (MPD can give you only a file list, but doesn't serve files: the Flask app figures out the cover art filename from the file list given by MPD, and cover file needs to be read from the filesystem.)

If you want to add https or extra protection to the application, you can install a web server to proxy towards uWSGI. An example Nginx virtual host configuration is included in the repository. If you are willing to expose your music library on this web server, you can configure the application to redirect the client to download cover art -- this might be less resource intensive as serving the files thorugh the Flack app directly. (Your mileage might vary.)

By default you don't have to configure anything else but the directory for your music library and the application will serve cover arts directly.

6. Startup

Two scripts are included in the repository.

`start-u.sh` starts the uwsgi server directly.

`start-uwsgi.sh` starts the uwsgi server as per the app.ini file included in the repository. This script can be used in systemd units as well. An example systemd unit file is in the repository. (Don't forget to adopt, User, Group and ExecStart.)

7. You've been warned

No responsililty on my side for any damage. The application is intended to be used in friendly or appropriately protected network environment.


# Use

If you run the application with standalon uWSGI, you just need to visit http://localhost:5000 after starting it.


## Navigation bar
The first icon on the left side opens the directory view. The second opens the dash (which is the default view). In the middle you see the title of the currently playing song and the various media controls (if there's anything playing). On the left side you see a search bar: it needs minimum four characters to start searching.

### Settings
The gear button opens the settings dialog.

MPD port: this is where you can set what port the Flask application should use to connect to the MPD server. (Tip: if you have a family, you can set up separate MPD server for everybody -- it's not complicated.)

Stream from: If you plan to use Kodi to consume the stream from the MPD server, where this stream is located

Client: your id, this identifies your history / random album selection and favourites on the server, so that you can use the application from several devices

Kodi hostname: where is your Kodi server accessible on the network. The application uses JSONRPC calls, you might need to enable it on Kodi

Log level: not relevant (only debug is supported for the time being)

Most of the settings work out of the box, though it makes sense to set a client id, and obvoiusly for Kodi related settings there is no default, this is something you need to figure out yourself.

## Music selection
The directory browser speaks for itself.

The dash contains three areas the random set, the favourites and the history.

Having random directories presented is an important feature, if you have a large amount of albums, and you just want listening something but you don't have anything particular in mind. The random set presents 12 random albums from your MPD database. The set is persistent, but only one exists at the same time for a client. If you click on the refresh button a new one will be generated, and the exisiting set will be lost.

On the right hand side you find your listening history; the last 10 loaded directores are saved.

If you mark a folder as favourite it will be listed in the bottom of the dash. You can have as many favourites as you want.


# TODO / ISSUES

- (Better) playlist management
- At the moment the application plays in consume mode, ie. there no rewind option


# About
The application was created by Kristof Imre Szabo.
