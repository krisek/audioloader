import { Component,Input, Output, EventEmitter, OnInit } from '@angular/core';
import { HttpClient }  from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { AppConfigService } from './app-config-service.service';
import { SettingsComponent } from './settings/settings.component';
import { PopupComponent } from './popup/popup.component';
import { PopupLoadComponent } from './popup_load/popup_load.component';

import { ToastComponent } from './toast/toast.component';
import { AlbumcellComponent } from './albumcell/albumcell.component';
import { NgbModal, NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { trigger, state, style, animate, transition } from '@angular/animations';
import { ToastService } from './toast-service.service';
import { interval } from 'rxjs';

import { HostListener } from '@angular/core';
import { EventListenerFocusTrapInertStrategy } from '@angular/cdk/a11y';

import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ActivatedRoute, Router } from '@angular/router';


@Component({
  selector: 'app-root',
  animations: [
    trigger('loadingTrigger', [
      state('normal', style({
        //backgroundColor: 'yellow'
      })),
      state('loading', style({
        color: '#c0c0c0',
        background: '#555555',
        backgroundColor: '#555555'

      })),
      transition('normal => loading', [
        animate('1s')
      ]),
      transition('loading => normal', [
        animate('1s')
      ]),
    ]),



  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  //title = 'audioloader2';


  loading = {
    'kodiload': false,
    'kodistop': false,
    'play': false,
    'pause': false,
    'stop': false,
    'prev': false,
    'next': false,
    'currentsong': false
  }



  last_directory = '.';

  dir = '';
  encoded = '';
  title = '';
  short = '';
  favourite = false;
  path = [];
  tree_dir = {};
  tree_file = {};
  dirs = false;
  showlist = false;
  dircount = 0;
  list_dir = [];
  list_dir_dash = {
    history: [],
    randomset: [],
    favourites: []
  }

  streamplayers = false;
  list_dir_alpha = {};
  list_alpha = [];
  lookfor = "";
  servicesBasePath = "";

  isMenuOpen = false;

  settings = {
    'mpd_port': '6600',
    'client_id': 'guest',
    'list_from': 60
  }

  currentsong = {'title': 'not playing', 'active': false, 'title_short': 'not playing', 'album': '', 'track': '', 'artist': '', 'players': [], 'default_stream': '', 'outputs': [], 'snapcast_clients': []};

  dash = false;
  active_area = "browser";

  pollCounter = interval(1000);

  lastPolled = 0;

  pollWaitState = false;

  pollMinDelta = 20000
  lastPolledStarted = -1 * this.pollMinDelta;

  radio = false;
  bandcamp = false;
  dirbrowser = false;

  stations = [];
  radio_history = {};
  bandcamp_history = {};

  bandcamp_enabled = true;

  searchTerm$ = new Subject<string>();

  currentDir: string = '';


    @HostListener('window:focus', ['$event'])
    onFocus(event: FocusEvent): void {
      if(Date.now() - this.lastPolled > 30000){
        this.pollCurrentsong();
      }
      this.pollCounter = interval(1000);
    }

    @HostListener('window:blur', ['$event'])
    onBlur(event: FocusEvent): void {
        if(this.settings['log'] == 'debug') console.log('blur event');
        this.pollCounter = interval(5000);
    }


  constructor(private environment: AppConfigService, private http: HttpClient, private modalService: NgbModal, private http2: HttpClient, public toastService: ToastService, private route: ActivatedRoute, private router: Router) {
    this.servicesBasePath = environment.config.servicesBasePath;
    }

  ngOnInit(){
    console.log("init");

    if(typeof(localStorage.last_directory) != "undefined"){
      this.last_directory = localStorage.last_directory;
    }

    if(typeof(localStorage.mpd_port) != "undefined" && localStorage.mpd_port != "" ){
      this.settings['mpd_port'] = localStorage['mpd_port'];
    }

    if(typeof(localStorage.client_id) != "undefined" && localStorage.client_id != "" ){
      this.settings['client_id'] = localStorage['client_id'];
    }

    if(typeof(localStorage.list_from) != "undefined" && localStorage.list_from != "" ){
      this.settings['list_from'] = parseInt(localStorage['list_from']);
    }

    this.settings['stream'] = localStorage['stream'];
    this.settings['log'] = localStorage['log'];




    if(typeof(this.settings['client_id']) == 'undefined' || this.settings['client_id'] == ""){
      this.settings['client_id'] = 'guest';
    }




    this.dir = this.last_directory;
    //this.showDir(this.last_directory);
    this.showDash();

    this.updateCurrentSong();
    this.pollCurrentsong()

    this.pollCounter.subscribe(n => {
      if(typeof(this.currentsong['elapsed']) != 'undefined' && this.currentsong['state'] == 'play'){
        this.currentsong['elapsed']++;
      }
      var delta = Date.now() - this.lastPolled;
      if(delta > 60000){
        console.log('polled too long time ago ' + this.lastPolled + ' vs. ' + Date.now() + '  d:' + delta );
        this.pollCurrentsong();
        }
      else{
        if(this.settings['log'] == 'debug') console.log('poll seems to be ok');
      }
      });

      this.searchTerm$.pipe(
        debounceTime(300), // Wait 300ms after typing stops
        distinctUntilChanged(), // Ignore if value didn't change
        switchMap(lookfor => this.performSearch(lookfor)) // Switch to new search
      ).subscribe();
      
      this.route.fragment.subscribe(fragment => {
        if (fragment) {
          this.currentDir = decodeURIComponent(fragment);
          this.showDir(this.currentDir);
        }
      });

    };

  delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
  };

  async pollCurrentsong(){

    if(this.pollWaitState && Date.now() - this.lastPolled <= 60000){
      if(this.settings['log'] == 'debug') console.log('someone is trying to open a 2nd poll -- no fun');
      return -1;
    }

    this.lastPolled = Date.now();
    var delta = this.lastPolled - this.lastPolledStarted;
    if(delta < this.pollMinDelta){
      if(this.settings['log'] == 'debug') console.log('we cannot poll this often ' + this.lastPolled  + ' vs. '+ this.lastPolledStarted  + ' (d: '+delta+'), delay');
      await this.delay(this.pollMinDelta - delta);
    }
    else{
      if(this.settings['log'] == 'debug') console.log('poll can be started now ' + this.lastPolled  + ' vs. '+ this.lastPolledStarted + ' (d: '+delta+')');

    }

    this.lastPolledStarted = Date.now();
    this.pollWaitState = true;
    this.http2.get<any>(this.servicesBasePath + '/poll_currentsong?mpd_port=' + this.settings['mpd_port']).subscribe(data => {
      //console.log(data);
      this.currentsong = data;
      this.bandcamp_enabled = data['bandcamp_enabled'];
      this.currentsong['title_short'] = this.currentsong['display_title']; //this.truncate(this.currentsong['display_title'], 28);
      this.lastPolled = Date.now();
      if(this.settings['log'] == 'debug') console.log(this.currentsong);
      this.pollWaitState = false;
      if(this.currentsong.players.length > 1) this.streamplayers = true; else this.streamplayers = false;
      if((typeof(localStorage.stream) == "undefined" || localStorage.stream == '') && typeof(this.currentsong['default_stream']) != "undefined" && ( typeof(this.currentsong['stream_updated']) == "undefined" || localStorage.stream_updated == false ) ){
        localStorage.stream = this.currentsong['default_stream'];
      }
      this.pollCurrentsong();
    },
    async error => {
      console.log('error polling currentsong, waiting a bit');
      this.lastPolled = Date.now();
      await this.delay(5000);
      if(this.settings['log'] == 'debug') console.log("going to poll again");
      this.pollWaitState = false;
      this.pollCurrentsong();
    });


  };

  updateCurrentSong(feedback = false){

    if(feedback) this.loading['currentsong'] = true;

    this.http.get<any>(this.servicesBasePath + '/currentsong?mpd_port=' + this.settings['mpd_port']).subscribe(data => {
      //console.log(data);

      this.currentsong = data;
      this.bandcamp_enabled = data['bandcamp_enabled'];
      this.loading['currentsong'] = false;
      if(this.currentsong.players.length > 1) this.streamplayers = true; else this.streamplayers = false;
      this.currentsong['title_short'] = this.currentsong['display_title'];//this.truncate(this.currentsong['display_title'], 28);
      console.log(this.currentsong);
    })

  };

  showSuccess(text) {
    this.toastService.show(text, { classname: 'bg-success text-light', delay: 2000 });
  }

  showDanger(text) {
    this.toastService.show(text, { classname: 'bg-danger text-light', delay: 5000 });
  }

  displayTree(data){
    console.log('displayTree called');

    var ls = data;
    this.tree_dir = {};
    this.tree_file = {};
    this.dirs = false;

    this.showlist = false;
    this.dircount = 0;
    this.list_dir = new Array();
    this.list_dir_alpha = {};
    this.list_alpha = [];


    for(var i in ls.tree) {
      if('directory' in ls.tree[i]){
        this.dirs = true;
        var album = ls.tree[i].directory;
        this.dircount++;

        this.tree_dir[album] = ls.tree[i].count;
        this.tree_dir[album]['name'] = album;

        this.tree_dir[album]['encoded'] = encodeURIComponent(album);
        this.tree_dir[album]['title'] = this.baseName(album);
        this.tree_dir[album]['short'] = this.truncate(this.tree_dir[album]['title']);
        var favourite = false;
        if(this.list_dir_dash['favourites'].findIndex(obj => obj.name == album) !== -1) favourite = true;

        this.tree_dir[album]['favourite'] = favourite

        this.list_dir.push(album);
        var alpha = this.tree_dir[album]['title'].substring(0, 1);
          if(! (alpha in this.list_dir_alpha)){
            this.list_dir_alpha[alpha] = [];
          }
        this.list_dir_alpha[alpha].push(album)
        this.list_dir_alpha[alpha].sort(this.compareNC);
        this.list_alpha.push(alpha);
        this.list_alpha = Array.from(new Set(this.list_alpha))
        this.list_alpha.sort(this.compareNC);
        this.list_dir.sort(this.compareNC);
        this.list_dir = Array.from(new Set(this.list_dir))


      }
      if('file' in ls.tree[i]){
         if( ! ('title' in ls.tree[i])){
          ls.tree[i]['title'] = this.baseName(ls.tree[i]['file']);
         }


        this.tree_file[ls.tree[i]['file']] = ls.tree[i];

      }
    }

    if(this.dircount > this.settings['list_from']){
      this.showlist = true;
    }
    console.log(this.tree_dir);
    console.log('tree_file');
    console.log(this.tree_file);
    //console.log(this.list_dir);




  };

  updateSpec(spec){

    this.http.get<any>(this.servicesBasePath + '/'+ spec +'?mpd_port=' + this.settings['mpd_port'] + '&client_id=' + this.settings['client_id']).subscribe(data => {
        console.log('got ' + spec);
        console.log(data);
        this.list_dir_dash[spec] = [];
        for(var i in data.tree){
          if('directory' in data.tree[i]){

            var album = data.tree[i].directory;
            var album_title = this.baseName(album);
            var favourite = false;
            if(this.list_dir_dash['favourites'].findIndex(obj => obj.name == album) !== -1 || spec == 'favourites') favourite = true;
            this.list_dir_dash[spec].push({
                    'name': album,
                    'encoded': encodeURIComponent(album),
                    'title': album_title,
                    'short': this.truncate(album_title),
                    'playhours': data.tree[i].count.playhours,
                    'playtime': data.tree[i].count.playtime,
                    'favourite': favourite
                    }
            );
          }
        }
      })


  }

  updateRadioHistory(){
    //this.radio_history = {}
    this.http.get<any>(this.servicesBasePath + '/radio_history?mpd_port=' + this.settings['mpd_port'] + '&client_id=' + this.settings['client_id']).subscribe(data => {
        console.log('got radio history');
        console.log(data);
        this.radio_history = data;
        }
      )


  }


  updateBandcampHistory(){
    //this.radio_history = {}
    this.http.get<any>(this.servicesBasePath + '/bandcamp_history?mpd_port=' + this.settings['mpd_port'] + '&client_id=' + this.settings['client_id']).subscribe(data => {
        console.log('got bandcamp history');
        console.log(data);
        this.bandcamp_history = data;
        }
      )


  }

  newSet(){
    this.showSuccess('requesting new set');
    this.http.get<any>(this.servicesBasePath + '/generate_randomset?mpd_port=' + this.settings['mpd_port'] + '&client_id=' + this.settings['client_id']).subscribe(data => {
      this.updateSpec('randomset');
      this.showSuccess('new set generated');
    });

  }



  showDash(){
    this.dash = true;
    this.radio = false;
    this.bandcamp = true;
    this.dirbrowser = false;
    console.log('show Dash called');


    var specs = ['favourites', 'history', 'randomset'];
    for(var i = 0; i < specs.length; i++){
      console.log(specs[i]);
      var spec = specs[i];
      this.updateSpec(spec);
    }
    if(this.bandcamp_enabled){
      this.updateBandcampHistory();
    }
    
  };

  showRadio(){
    this.radio = true;
    this.bandcamp = false;
    this.dash = false;
    this.dirbrowser = false;
    this.updateRadioHistory();

  };

  showBandcamp(){
    this.bandcamp = true;
    this.radio = false;
    this.dash = false;
    this.dirbrowser = false;
    this.updateBandcampHistory();

  };


  showDir(dir){
    console.log("showDir: " + dir);
    this.dash = false;
    this.bandcamp = false;
    this.radio = false;
    this.dirbrowser = true;
    this.tree_dir = {};
    this.tree_file = {};
    this.list_dir = new Array();
    this.list_dir_alpha = {};
    this.list_alpha = [];

    this.http.get<any>(this.servicesBasePath + '/ls?mpd_port=' + this.settings['mpd_port'] + '&directory=' + encodeURIComponent(dir)).subscribe(data => {
      //console.log(data);
      this.displayTree(data);
    })

    this.updateDir(dir);

  };


  navigateTo(dir: string) {
    this.currentDir = dir;
    this.router.navigate([], { fragment: encodeURIComponent(dir) });
    this.showDir(dir);
  }

  copyToClipboard(dir: string) {
    const url = `${window.location.origin}/#${encodeURIComponent(dir)}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Copied to clipboard! ' + dir);
    });
  }

  performSearch(lookfor: string): Observable<any> {
    console.log("Searching for:", lookfor);
  
    if ((this.dash || this.dirbrowser) && !lookfor.match(/bandcamp.com\//)) {
      this.dash = false;
      this.bandcamp = false;
      this.active_area = "browser";
  
      return this.http.get<any>(`${this.servicesBasePath}/search?mpd_port=${this.settings['mpd_port']}&pattern=${encodeURIComponent(lookfor)}`)
        .pipe(
          tap(data => {
            console.log(data);
            this.dirbrowser = true;
            this.displayTree(data);
          })
        );
  
    } else if (this.radio) {
      return this.http.get<any>(`${this.servicesBasePath}/search_radio?mpd_port=${this.settings['mpd_port']}&pattern=${encodeURIComponent(lookfor)}`)
        .pipe(
          tap(data => {
            console.log(data);
            this.stations = data.tree;
          })
        );
  
    } else if (this.bandcamp || lookfor.match(/bandcamp.com\//)) {
      return this.http.get<any>(`${this.servicesBasePath}/search_bandcamp?mpd_port=${this.settings['mpd_port']}&pattern=${encodeURIComponent(lookfor)}`)
        .pipe(
          tap(data => {
            console.log(data);
            this.openRadioModal(data['tree'][0]['title'], data['tree'][0]['artist'], data['tree'][0]['url'], data['tree'][0]['art']);
          })
        );
    }
  
    // Default: Return an empty observable if no condition matches
    return of(null);
  }
  
  
  searchItem(lookfor: string) {
    if (lookfor.length < 3) return;
    this.searchTerm$.next(lookfor);
  }

  searchItem_old(lookfor){
    if(lookfor.length < 3) return;
    console.log("searchItem " + lookfor);

    if((this.dash || this.dirbrowser) && !lookfor.match(/bandcamp.com\//)){
      this.dash = false;
      this.bandcamp = false;
      this.active_area = "browser";
      this.http.get<any>(this.servicesBasePath + '/search?mpd_port=' + this.settings['mpd_port'] + '&pattern=' + encodeURIComponent(lookfor)).subscribe(data => {
        console.log(data);
        this.dirbrowser = true;
        this.displayTree(data);
      })
      this.last_directory = '.';
      if(typeof(localStorage.last_directory) != "undefined"){
        this.last_directory = localStorage.last_directory;
      }
      this.updateDir(this.last_directory);

    }
    else if(this.radio){
      this.http.get<any>(this.servicesBasePath + '/search_radio?mpd_port=' + this.settings['mpd_port'] + '&pattern=' + encodeURIComponent(lookfor)).subscribe(data => {
        console.log(data);
        this.stations = data.tree;
      })
    }
    else if(this.bandcamp || lookfor.match(/bandcamp.com\//)){
      this.http.get<any>(this.servicesBasePath + '/search_bandcamp?mpd_port=' + this.settings['mpd_port'] + '&pattern=' + encodeURIComponent(lookfor)).subscribe(data => {
        console.log(data);
        this.openRadioModal(data['tree'][0]['title'], data['tree'][0]['artist'], data['tree'][0]['url'], data['tree'][0]['art'])
      })
    }

  }



  addDir(addObject){
    console.log("addDir");
    console.log(addObject);
    var playparams;

    if('url' in addObject && addObject['url'] != ''){
      playparams = 'url=' + addObject['url'] + '&name=' + addObject['dir'] + '&stationuuid=' + addObject['stationuuid'] + '&favicon=' + addObject['favicon'];
    }
    else{
      playparams = 'directory=' + encodeURIComponent(addObject['dir']);
    }



    this.http.get<any>(this.servicesBasePath + '/addplay?mpd_port=' + this.settings['mpd_port'] + '&'+ playparams + '&client_id=' + this.settings['client_id']  ).subscribe(data => {
      console.log("enqueued dir ");

      if('url' in addObject && addObject['url'] != '' ){
        this.showSuccess('loaded ' + this.truncate(addObject['url'], 10))
      }
      else{
        this.showSuccess('loaded ' + this.truncate(this.baseName(addObject['dir']), 10));
      }

      if(this.dash){
        this.showDash();
      }      
      else if(this.radio){
         this.showRadio();
      }
      else if(this.bandcamp){
          this.showBandcamp();
        }

      
      this.updateCurrentSong();
      for(let i = 0; i < addObject['load'].length; i++){
        this.openStream(addObject['load'][i]);
      }
    })
  };

  removeHistory(addObject){
    console.log("removeHistory");
    console.log(addObject);
    var playparams;

    if('url' in addObject && addObject['url'] != ''){
      if(addObject['stationuuid']){
        console.log('radio url to remove from history');
        playparams = 'url=' + encodeURIComponent(addObject['url']) + '&stationuuid=' + addObject['stationuuid'] ;
      }
      else{
        console.log('bandcamp url to remove from history');
        playparams = 'url=' + encodeURIComponent(addObject['url']);
      }
    }
    else{
      playparams = 'directory=' + encodeURIComponent(addObject['dir']);
    }

    this.http.get<any>(this.servicesBasePath + '/remove_history?client_id=' + this.settings['client_id'] + '&' +  playparams  ).subscribe(data => {
      console.log("history remove triggered");
      if('url' in addObject && addObject['url'] != ''){
        if(addObject['stationuuid']){
          this.showRadio();
        }
        else{
          this.showBandcamp();
        }
      }
      else{
        this.showSuccess('delete from history ' + this.truncate(this.baseName(addObject['dir']), 10))
        this.showDash();
      }
    })
  };


  sendCommand(command){
    console.log("sendCommand: " + command);
    this.loading[command] = true;
    //we need to enable polling again (user might send command quickly)
    this.lastPolledStarted = -1 * this.pollMinDelta;
    this.http.get<any>(this.servicesBasePath + '/' + command + '?mpd_port=' + this.settings['mpd_port']).subscribe(data => {
      console.log("returned " + command);
      this.loading[command] = false;
      })
    this.updateCurrentSong();


  };

  toggleFavourite(album) {
    console.log('toggleFavourite: ' + album);
    var action = 'add_favourite';
    if(this.list_dir_dash['favourites'].find(obj => obj.name == album)){
      action = 'remove_favourite';
    }
    console.log('toggleFavourite: ' + action);
    this.http.get<any>(this.servicesBasePath + '/' + action + '?mpd_port=' + this.settings['mpd_port'] + '&directory=' + encodeURIComponent(album) + '&client_id=' + this.settings['client_id']  ).subscribe(data => {
      console.log("favourite toggle returned");



      var index = this.list_dir_dash['favourites'].findIndex(obj => obj.name == album);
      if (index !== -1){
        this.list_dir_dash['favourites'].splice(index, 1);
      }
      else{
        var album_title = this.baseName(album);
        this.list_dir_dash['favourites'].push({
                'name': album,
                'encoded': encodeURIComponent(album),
                'title': album_title,
                'short': this.truncate(album_title),
                //'playhours': data.tree[i].count.playhours,
                //'playtime': data.tree[i].count.playtime,
                'favourite': true
                }
        );
      }



      console.log('new favourites');
      console.log(this.list_dir_dash['favourites']);

      if(album in this.tree_dir) this.tree_dir[album]['favourite'] = ! this.tree_dir[album]['favourite'];


      var specs = ['history', 'randomset'];
      for(var i = 0; i < specs.length; i++){
        var index = this.list_dir_dash[specs[i]].findIndex(obj => obj.name == album);
        if (index !== -1) this.list_dir_dash[specs[i]][index]['favourite'] = ! this.list_dir_dash[specs[i]][index]['favourite'];
      }
    })

  };


  updateDir(dir) {
    this.dir = dir;
    this.encoded = encodeURIComponent(dir);
    this.title = this.baseName(dir);
    this.short = this.truncate(dir);
    this.favourite = false
    if(this.list_dir_dash['favourites'].findIndex(obj => obj.name == this.dir) !== -1) this.favourite = true;


    this.path = [];
    var pathcrawl = dir;
    while(pathcrawl.length > 0){
      this.path.push({'name': this.baseName(pathcrawl), 'dir': pathcrawl});
      if(pathcrawl == this.dirName(pathcrawl))break;

      pathcrawl = this.dirName(pathcrawl);

    }
    if(dir != '.') this.path.push({'name': '.', 'dir': '.'});

    this.path = this.path.reverse();

    localStorage.setItem('last_directory', dir);

    };

  processAlbumCellAction(event){
    switch(event['action']){
      case 'showDir':
        this.dash = false;
        this.active_area = "browser";
        this.showDir(event['dir']);
        break;
      case  'openModal':
        this.openModal(event['dir']);
        break;
      case  'toggleFavourite':
        this.toggleFavourite(event['dir']);
        break;
      case 'coverPress':
        this.coverPressArea(event['dir'], event['playtime']);
        break;
      }


  }

  openRadioModal(name, stationuuid, url, favicon){
    const modalRef = this.modalService.open(PopupComponent);
    modalRef.componentInstance.name = name;
    modalRef.componentInstance.action = 'Play';
    modalRef.componentInstance.encoded = encodeURIComponent(name);
    modalRef.componentInstance.servicesBasePath = this.servicesBasePath;
    modalRef.componentInstance.players = this.currentsong.players;
    modalRef.componentInstance.stationuuid = stationuuid;
    modalRef.componentInstance.url = url;
    modalRef.componentInstance.favicon = favicon;
    modalRef.componentInstance.messageEvent.subscribe((receivedEntry) => {
      console.log("openRadioModal returned");
      console.log(receivedEntry);
      this.addDir(receivedEntry);
    })

  }


  openModal(dir) {
    const modalRef = this.modalService.open(PopupComponent);
    modalRef.componentInstance.name = dir;
    modalRef.componentInstance.action = 'Play';
    modalRef.componentInstance.encoded = encodeURIComponent(dir);
    modalRef.componentInstance.servicesBasePath = this.servicesBasePath;
    modalRef.componentInstance.players = this.currentsong.players;
    modalRef.componentInstance.stationuuid = "";
    modalRef.componentInstance.url = "";
    modalRef.componentInstance.favicon = "";
    modalRef.componentInstance.messageEvent.subscribe((receivedEntry) => {
      console.log("openModal returned: " + receivedEntry['dir'] + " " + receivedEntry['load'].join(','));
      this.addDir(receivedEntry);
    })

  }

  openPopupLoad() {
    const modalRef = this.modalService.open(PopupLoadComponent);
    modalRef.componentInstance.action = 'Turn on/off stream on other mpd/upnp renderers';
    modalRef.componentInstance.players = this.currentsong.players;
    modalRef.componentInstance.messageEvent.subscribe((receivedEntry) => {
      console.log("openPopupLoad returned: " +  receivedEntry['players']);
      for(let i = 0; i < receivedEntry['players'].length; i++){
        if (receivedEntry['players'][i]['load'] == true){
          this.openStream(i);
        }
        if (receivedEntry['players'][i]['load'] == false){
          this.stopStream(i);
        }
      }
      
    })    

  }

  openHistoryRemoveModal(name, stationuuid, url, favicon) {
    const modalRef = this.modalService.open(PopupComponent);
    modalRef.componentInstance.name = name;
    modalRef.componentInstance.action = 'Remove from history';
    modalRef.componentInstance.encoded = encodeURIComponent(name);
    modalRef.componentInstance.servicesBasePath = this.servicesBasePath;
    modalRef.componentInstance.players = this.currentsong.players;
    modalRef.componentInstance.stationuuid = stationuuid;
    modalRef.componentInstance.url = url;
    modalRef.componentInstance.favicon = favicon;
    modalRef.componentInstance.messageEvent.subscribe((receivedEntry) => {
      console.log("openModal returned: " + receivedEntry['url'] + " " + receivedEntry['load'].join(','));
      this.removeHistory(receivedEntry);
    })

  }


 openSettings() {
    console.log("openSettings");
    const modalRefSettings = this.modalService.open(SettingsComponent);

    modalRefSettings.componentInstance.messageEvent.subscribe((receivedEntry) => {
      console.log("openModal returned: " + receivedEntry);
      this.settings[receivedEntry] = localStorage[receivedEntry];
    })

  }

  openStream(player_index){
    console.log("openStream " +this.currentsong.players[player_index]['name']);
    this.loading['kodiload'] = true;
    //http://localhost:5000/kodi?server=192.168.1.51&action=Player.Open&stream=http://192.168.1.185:18080/audio.mp3"
    var target = 'kodi';
    if(this.currentsong.players[player_index]['model_name'] != 'Kodi'){
      target = 'upnp';
    }

    this.http.get<any>(this.servicesBasePath + '/'+ target +'?mpd_port=' + this.settings['mpd_port'] + '&action=Player.Open&server=' + this.currentsong.players[player_index]['location'] + "&stream=" + localStorage['stream']  ).subscribe(data => {
      this.loading['kodiload'] = false;
      console.log("stream opened ");
      this.showSuccess('loaded to ' + this.currentsong.players[player_index]['name']);
    },
    async error => {
      console.log('error open stream');
      this.showDanger('error loading to kodi');
    })

  }

  stopStream(player_index){
    console.log("stopStream" +this.currentsong.players[player_index]['name']);
    this.loading['kodistop'] = true;

    var target = 'kodi';
    if(this.currentsong.players[player_index]['model_name'] != 'Kodi'){
      target = 'upnp';
    }

    this.http.get<any>(this.servicesBasePath + '/'+target+'?mpd_port=' + this.settings['mpd_port'] + '&action=Player.Stop&server=' + this.currentsong.players[player_index]['location'] + "&stream=" + localStorage['stream']).subscribe(data => {
      this.loading['kodistop'] = false;
      console.log("stream stopped");
      this.showSuccess('unloaded from '  + this.currentsong.players[player_index]['name']);
    })

  }

  toggleMpdOutput(output){
    console.log("Output to be toggled " + output)

    this.http.get<any>(this.servicesBasePath + '/toggleoutput'+'?mpd_port=' + this.settings['mpd_port'] + '&output=' + output.outputid).subscribe(data => {
      console.log("output toggled "   + output.outputname);
      if(output.outputenabled == 0){
        this.showSuccess(output.outputname + ' output turned on');
      }
      else{
        this.showSuccess(output.outputname + ' output turned off');
      }
      
      
      this.updateCurrentSong()
    })
  }

  toggleSnapcastClient(client){
    console.log("Client to be toggled " + client)
    var muted = "true"
    if(client.muted){
      muted = "false"
    }

    this.http.get<any>(this.servicesBasePath + '/togglesnapcastclient'+'?mpd_port=' + this.settings['mpd_port'] + '&id=' + client.id + '&muted=' + muted).subscribe(data => {
      console.log("client toggled "   + client.name);
      if(client.muted){
        this.showSuccess(client.name + ' client unmuted');
      }
      else{
        this.showSuccess(client.name + ' client muted');
      }
      
      
      this.updateCurrentSong()
    })
  }



  coverPressArea(dir, playtime){
    if(playtime<7200){
      this.openModal(dir);
    }
    else{
      this.showDir(dir);
    }
  }



  coverPress(dir){
    if(this.tree_dir[dir]['playtime']<7200){
      this.openModal(dir);
    }
    else{
      this.showDir(dir);
    }
  }

 dirName(path) {
    return path.replace(/\\/g,'/').replace(/\/[^\/]*$/, '');;
};

 baseName(path) {
    return path.replace(/\\/g,'/').replace( /.*\//, '' );
};

 compareNC(a, b) {
    var strA = a.toUpperCase();
    var strB = b.toUpperCase();

    return strA.localeCompare(strB);
};


  truncate(str, length?, ending?) {
    if(typeof(str) == "undefined" || str == null){
      return "";
    }

    if (length == null) {
      length = 35;
    }
    if (ending == null) {
      ending = '…';
    }
    if (str.length > length) {
      return str.substring(0, length - ending.length) + ending;
    } else {
      return str;
    }
  };


}
