# Introduction

Audioloader is a web based [Music Player Deamon](http://www.musicpd.org) (MPD) client with special focus on playing music organized in folders.

[![Screenshot](https://i.postimg.cc/fyCT7vS9/Screenshot-from-2020-04-26-16-03-24.png)](https://postimg.cc/fS3NDmKz)

The software has three components: a Flask/Python based backend, an Angular/Bootstrap based, responsive web user interface and and optional disovery daemon which discovers UPnP media renderers on the local network.

The Flask application is very thin, it does almost nothing but proxying requests towards the MPD server from the web client.

The application features five ways of selecting music from MPD:

1. selecting folders from a browser
1. searching in the MPD database
1. creating a random set of folders to choose music from (useful for large music libraries)
1. selecting folders from the history
1. marking folders as favorite
1. select radio station from the [radio-browser.info](http://radio-browser.info) community radio database


The Flask application runs on the same system where you run MPD. You can configure any supported output method on MPD; a very common use case is to install the application on a Raspberry Pi (or home server), configure MPD with HTTP stream output, so that you can stream music from all of your devices.

If you configure the MPD server with a HTTP stream output, the application can load this stream to a Kodi server or the UPnP media renderers discovered, so that you can listen music on your Kodi or UPnP connected sound system. Don't forget to configure the STREAM_URL parameter in config.py or in the 'stream from' parameter in the8 settings menu of the web UI.

# Installation

## Install from repository

I detail here how to install the application on Debian/Ubuntu derivatives, but you can get it running wherever Python and Pip are available.

NOTE: the Angular assets are pre-built and part of the repository, you just need to deploy and configure Flask

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
  #serve cover art directly or through a redirect
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
  KODI = 'kodi.localdomain'

  #url of the mpd lame/vorbis stream (httpd output) configured ~ can be overriden from the web UI settings
  STREAM_URL = 'http://{}:8000/audio.ogg'.format(os.environ.get('hostname', 'localhost.localdomain'))

  #hostname of your mpd server
  MPD_HOST = 'localhost'
  
  #hostname of your Redis server
  REDIS_HOST = 'localhost'

```

5. Web server

uWSGI can run the application directly without any web server needed. This is a viable method if you don't want to expose the application to external networks and you don't have many clients. If uWSGI serves directly the Flask backend, static cover art needs to be served by the backend; you need to set a MUSIC_DIR in the config, which tells the server where to look for cover art. (MPD can give you only a file list, but doesn't serve files: the Flask app figures out the cover art filename from the file list given by MPD, and cover file needs to be read from the filesystem.)

If you want to add https or extra protection to the application, you can install a web server to proxy towards uWSGI. An example Nginx virtual host configuration is included in the repository. If you are willing to expose your music library on this web server, you can configure the application to redirect the client to download cover art — this might be less resource intensive as serving the files through the Flack app directly. (Your mileage might vary.)

By default you don't have to configure anything else but the directory for your music library and the application will serve cover arts directly.

6. Startup

Two scripts are included in the repository.

`start-u.sh` starts the uwsgi server directly.

`start-uwsgi.sh` starts the uwsgi server as per the app.ini file included in the repository. This script can be used in systemd units as well. An example systemd unit file is in the repository. (Don't forget to adopt, User, Group and ExecStart.)

If you want to enable UPnP discovery, start the `disover.py` script as well, it requires two parameters: -m the IP address of the audioloader host and -n the local subnet. (This might be enhanced in later releases.) An example systemd unit file is included as well.

## Install from container (experimental)

I use `podman` on my Rpi, but `docker` should work the same.

1. Download and configure `config.py`

```bash
curl https://raw.githubusercontent.com/krisek/audioloader/master/config.tpl.py -o config.py
```

Edit `config.py` as you need. Don't forget: the container won't see `mpd` and `Redis` on `localhost`, you will need to set the real IP/resolvable hostname of the respective service there. `MUSIC_DIR` is important this is where you will need to map your actual directory containing your music collection on the system.

2. Run the container

```bash
export MUSIC_DIR_SERVER=<directory containing your music collection>
export MUSIC_DIR_AUDIOLOADER=/media/music/mp3 # or the directory you set in config.tpl
export RELEASE=v0.0.1 # or the one you want to run
mkdir user_data
podman run -v $MUSIC_DIR_SERVER:$MUSIC_DIR_AUDIOLOADER -v ./config.py:/var/lib/audioloader/config.py  -v ./user_data:/var/lib/mpf:Z -p 3400:3400/tcp --name audioloader docker.io/krisek11/audioloader:$RELEASE
```

Podman note: I had to do an 
```bash
echo `whoami`:2000000:65535 | sudo tee /etc/subgid 
echo `whoami`:2000000:65535 | sudo tee /etc/subuid
``` 
on my Raspbian to get the container running as rootless user.

In order to get `user_data` writable by the container you either give world write permissions to it (`chmod 777 user_data`) or you need to figure out to which host UID podman maps the container's al(1000) UID.

```bash
USER_DATA=user_data
chmod 777 $USER_DATA # temporarly give word permissions to user_data
podman exec -it audioloader touch /var/lib/mpf/test # change a file in the container
REAL_UID=$(stat -c '%u' $USER_DATA/test) # check the uid of the created file on the host
chmod 755 $USER_DATA # remove world permissions from user_data
sudo setfacl -m u:$REAL_UID:rw  $USER_DATA/* # provide permissions to mapped user
sudo setfacl -m u:$REAL_UID:rxw $USER_DATA
setfacl -m d:u:$REAL_UID:rwx $USER_DATA
rm -f $USER_DATA/test
# cross fingers $REAL_UID won't be changed by podman
```

3. Web server

See (5.) in manual installation.

4. Startup

TBD

## You've been warned

No responsibility on my side for any damage. The application is intended to be used in friendly or appropriately protected network environment.

# Upgrade

Audioloader is distributed in this Git repository. New features are developed against branches, thus you can rely on the master HEAD until further notice. Do regular pulls against it (`git pull https://github.com/krisek/audioloader.git && pip install -r requirements.txt`), so that you get the latest bugfixes and the new features implemented.

# Use

If you run the application with standalone uWSGI, you just need to visit http://localhost:5000 after starting it.

## Navigation bar
The first icon on the left side opens the directory view. The second opens the dash (which is the default view). The third one opens the radio stations view. In the middle you see the title of the currently playing song and the various media controls (if there's anything playing). On the left side you see a search bar: it needs minimum four characters to start searching.

### Settings
The gear button opens the settings dialog.

MPD port: this is where you can set what port the Flask application should use to connect to the MPD server. (Tip: if you have a family, you can set up separate MPD server for everybody — it's not complicated.)

Stream from: If you plan to use Kodi to consume the stream from the MPD server, where this stream is located

Client: your id, this identifies your history / random album selection and favorites on the server, so that you can use the application from several devices

Kodi hostname: where is your Kodi server accessible on the network. The application uses JSONRPC calls, you might need to enable it on Kodi

Log level: not relevant (only debug is supported for the time being)

Most of the settings work out of the box, though it makes sense to set a client id, and obviously for Kodi related settings there is no default, this is something you need to figure out yourself.

## Music selection
The directory browser speaks for itself.

The dash contains three areas the random set, the favorites and the history.

Having random directories presented is an important feature, if you have a large amount of albums, and you just want listening something but you don't have anything particular in mind. The random set presents 12 random albums from your MPD database. The set is persistent, but only one exists at the same time for a client. If you click on the refresh button a new one will be generated, and the existing set will be lost.

On the right hand side you find your listening history; the last 10 loaded directories are saved.

If you mark a folder as favorite it will be listed in the bottom of the dash. You can have as many favorites as you want.

The radio station view let's you search and load radio stations for the [radio-browser.info](http://radio-browser.info) community radio database. The last 10 started station is displayed in the radio station history.

## UPnP

UPnP media renderers available on the network are monitored by the `discover.py` daemon. This application listens to the traffic in the UPnP multicast group and if a new device appears, it registers the device's capabilities. Audioloader offers rendering on devices which have been seen on the network in the last 10 minutes. (Consequently, if you turn off a device it won't immediately disappear from Audioloader.) When you turn on a UPnP device it might take some time until `discover.py` finds it, depending on how chatty the device is on UPnP. (In order not to miss anything, `discover.py` initiates full UPnP discovery regularly.)

### Kodi & UPnP

If UPnP discovery is enabled you need to turn on UPnP on Kodi as well, otherwise the interface won't offer playing music on Kodi.

# TODO / ISSUES

- (Better) playlist management
- At the moment the application plays in consume mode, ie. there is no rewind option

# Development

```bash
corepack enable
cd angular
sudo npm install --global yarn
# ng new --skip-install audioloader
ng config cli.packageManager yarn
yarn init -2
yarn
cd audioloader
ng serve  --host 0.0.0.0
```

# About
The application was created by Kristof Imre Szabo.
