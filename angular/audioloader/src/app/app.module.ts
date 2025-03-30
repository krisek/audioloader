import { BrowserModule } from '@angular/platform-browser';
import { NgModule, APP_INITIALIZER } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';


import { HttpClientModule }    from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { AppConfigService } from './app-config-service.service';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { SettingsComponent } from './settings/settings.component';
import { PopupComponent } from './popup/popup.component';
import { PopupLoadComponent } from './popup_load/popup_load.component';

import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';

import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { ToastService } from './toast-service.service';
import { ToastComponent } from './toast/toast.component';
import { AlbumcellComponent } from './albumcell/albumcell.component';

import { ReplacePipe } from './replace.pipe';


const appInitializerFn = (appConfig: AppConfigService) => {
    return () => {
        return appConfig.loadAppConfig();
    }
};

@NgModule({
    declarations: [
        AppComponent, SettingsComponent, PopupComponent, PopupLoadComponent, ToastComponent, AlbumcellComponent, ReplacePipe
    ],
    imports: [
        BrowserModule,
        HttpClientModule,
        CommonModule,
        AppRoutingModule,
        NgbModule,
        BrowserAnimationsModule,
        MatIconModule,
        MatSlideToggleModule,
        MatButtonToggleModule,
    ],
    providers: [
        AppConfigService,
        {
            provide: APP_INITIALIZER,
            useFactory: appInitializerFn,
            multi: true,
            deps: [AppConfigService, ToastService]
        }
    ],
    bootstrap: [AppComponent]
})
export class AppModule { }
