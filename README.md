# Introduction

Audioloader is a web based [Music Player Deamon](http://www.musicpd.org) (MPD) client with special focus on playing music organized in folders.

[![Screenshot](https://i.postimg.cc/fyCT7vS9/Screenshot-from-2020-04-26-16-03-24.png)](https://postimg.cc/fS3NDmKz)

The software has three components: a Go backend, an Angular/Bootstrap based, responsive web user interface and and optional discovery daemon which discovers UPnP media renderers or mpd servers on the local network that can play streams from the central MPD server.

The Go application is very thin, it does almost nothing but proxying requests towards the MPD server from the web client.

The application features six ways of selecting music from MPD and other sources:

1. selecting folders from a browser
1. searching in the MPD database
1. creating a random set of folders to choose music from (useful for large music libraries)
1. selecting folders from the history
1. marking folders as favorite
1. select radio station from the [radio-browser.info](http://radio-browser.info) community radio database
1. play album from Bandcamp (optional) 

The Go application runs on the same system where you run MPD. You can configure any supported output method on MPD; a very common use case is to install the application on a Raspberry Pi (or home server), configure MPD with HTTP stream output, so that you can stream music from all of your devices.

If you configure the MPD server with a HTTP stream output, the application can load this stream to UPnP media renderers or other mpd servers discovered on your network. ⚠ Don't forget to configure the `AL_DEFAULT_STREAM` environment parameter or in the 'stream from' parameter in the settings menu of the web UI. UPnP device and mpd server discovery is performed by separate scripts.

If you have multiple outputs on your MPD server, you can toggle them from the application directly.

If you configure a Snapcast server (it is a great tool for creating a multi-room streaming system with mpd), then the application will query the clients on the Snapcast server, and you can mute or un-mute them from the application.

# Installation

1. Install Redis

```bash
sudo apt install redis-server redis-tools
```

Redis is used to cache the name of folder images and to keep track of the UPnP devices / MPD servers discovered on the network. It slightly improves performance of showing folder images, but it is not a must to install it the application can work without it — though, if you want to have UPnP discovery, it is a must to install it.

2. Download the appropriate release, and unpack it.

3. Set environment variables

```bash
AL_BANDCAMP_ENABLED: true | false
AL_CLIENT_DB  where to store client favorites/history/random folders — the user running the web application needs to have write access on this directory
AL_DEFAULT_STREAM: url of the mpd lame/vorbis stream (httpd output) configured ~ can be overriden from the web UI settings
AL_MPD_HOST: hostname of your mpd server
AL_MPD_PORT: mpd server port ~ can be overriden from the web UI settings
AL_LISTENING_PORT: where the backend should lister
AL_LIBRARY_PATH: the application will look in this folder for your music repository when it returns cover art
AL_SNAPCAST_HOST: the application well query this Snapcast server for clients
AL_LOG_LEVEL: audioloader log level
```

For simple use only variables `AL_CLIENT_DB` and `AL_LIBRARY_PATH` are required to be set.

4. Run audioloader

5. Web server

6. Bandcamp and Youtube support

You need to install `yt-dlp` for working Bandcamp / Youtube support. 

```bash
pip install yt-dlp
```

This part of the code is not supported at all, it might break anytime.

If you want to enable UPnP discovery, start the `disover.py` script as well, it requires two parameters: -m the IP address of the audioloader host and -n the local subnet. (This might be enhanced in later releases.)

Similarly, you can enable mpd discovery by starting the `discover-mpd.py` script. There is a little shell script as well (`discover-mpd-static.sh`) which updates your mpd player servers from your networks into redis without any probing -- this one is intended to be run from crontab.

## systemd control

If you want to have systemd to control the service you can install and customize the `audioloader.service` unit file in the repository.

## You've been warned

No responsibility on my side for any damage. The application is intended to be used in friendly or appropriately protected network environment.

# Upgrade

Audioloader is distributed in this Git repository. New features are developed against branches, thus you can rely on the master HEAD until further notice. I try to make release builds from time to time.

# Use

If you run the application with standalone, you just need to visit http://localhost:3400 after starting it. 

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
# get node installed with nvm
cd /projects/audioloader/angular/audioloader
yarn install
ng serve --host 0.0.0.0

```

# About
The application was created by Kristof Imre Szabo.
