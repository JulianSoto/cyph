/* tslint:disable:no-import-side-effect no-reference */

/// <reference path="../typings/index.d.ts" />

import '../standalone/global';
import '../standalone/node-polyfills';

import 'hammerjs';
import '../standalone/init';
import '../standalone/test-environment-setup';
import '../standalone/translations';

import {HttpClient} from '@angular/common/http';
import {NgModule, NgZone} from '@angular/core';
import {DomSanitizer} from '@angular/platform-browser';
import {Router, RouterModule, UrlSerializer} from '@angular/router';
import {CyphAppModule} from '../cyph/modules/cyph-app.module';
import {CyphCommonModule} from '../cyph/modules/cyph-common.module';
import {CyphWebModule} from '../cyph/modules/cyph-web.module';
import {PotassiumService} from '../cyph/services/crypto/potassium.service';
import {ThreadedPotassiumService} from '../cyph/services/crypto/threaded-potassium.service';
import {DatabaseService} from '../cyph/services/database.service';
import {DialogService} from '../cyph/services/dialog.service';
import {FaviconService} from '../cyph/services/favicon.service';
import {FileService} from '../cyph/services/file.service';
import {LocalStorageService} from '../cyph/services/local-storage.service';
import {resolveStaticServices} from '../cyph/util/static-services';
import {appRoutes} from './app-routes';
import {AppService} from './app.service';
import {AppComponent} from './components/app';
import {EphemeralChatRootComponent} from './components/ephemeral-chat-root';
import {LockdownComponent} from './components/lockdown';
import {TrialSignupComponent} from './components/trial-signup';
import {CustomUrlSerializer} from './custom-url-serializer';


/**
 * Angular module for Cyph web UI.
 */
@NgModule({
	bootstrap: [AppComponent],
	declarations: [
		AppComponent,
		EphemeralChatRootComponent,
		LockdownComponent,
		TrialSignupComponent
	],
	entryComponents: [
		AppComponent,
		EphemeralChatRootComponent,
		LockdownComponent,
		TrialSignupComponent
	],
	imports: [
		RouterModule.forRoot([], {onSameUrlNavigation: 'reload', useHash: true}),
		CyphAppModule,
		CyphCommonModule,
		CyphWebModule
	],
	providers: [
		AppService,
		FaviconService,
		{
			provide: PotassiumService,
			useClass: ThreadedPotassiumService
		},
		{
			provide: UrlSerializer,
			useClass: CustomUrlSerializer
		}
	]
})
export class AppModule {
	constructor (
		domSanitizer: DomSanitizer,
		httpClient: HttpClient,
		ngZone: NgZone,
		router: Router,
		databaseService: DatabaseService,
		dialogService: DialogService,
		fileService: FileService,
		localStorageService: LocalStorageService
	) {
		router.resetConfig(appRoutes);

		if (typeof testEnvironmentSetup === 'function') {
			testEnvironmentSetup(databaseService, localStorageService);
		}

		resolveStaticServices({dialogService, domSanitizer, fileService, httpClient, ngZone});
	}
}
