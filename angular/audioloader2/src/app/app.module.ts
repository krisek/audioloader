import { BrowserModule } from '@angular/platform-browser';
import { NgModule, APP_INITIALIZER } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { NgbdModalContent } from './app.component';
import { NgbdModalSettings } from './app.component';

import { HttpClientModule }    from '@angular/common/http';
import {CommonModule} from '@angular/common';
import { AppConfigService } from './app-config-service.service';
import {NgbModule} from '@ng-bootstrap/ng-bootstrap';

const appInitializerFn = (appConfig: AppConfigService) => {
    return () => {
        return appConfig.loadAppConfig();
    }
};

@NgModule({
  declarations: [
    AppComponent, NgbdModalContent, NgbdModalSettings
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    CommonModule,
    AppRoutingModule,
    NgbModule
  ],
  providers: [
    AppConfigService,
        {
            provide: APP_INITIALIZER,
            useFactory: appInitializerFn,
            multi: true,
            deps: [AppConfigService]
        }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
