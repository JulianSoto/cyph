/* tslint:disable:cyclomatic-complexity */

import {BehaviorSubject} from 'rxjs';
import {map} from 'rxjs/operators';
import {environment} from '../environments';
import {config} from './config';
import {EnvDeploy, envDeploy} from './env-deploy';
import {IEnvironment} from './proto';
import {WindowWatcherService} from './services/window-watcher.service';
import {toBehaviorSubject} from './util/flatten-observable';
import {toInt} from './util/formatting';

/**
 * Dynamic values calculated at run-time.
 */
export class Env extends EnvDeploy {
	/** @ignore */
	private static readonly language: string =
		navigatorData.language ||
		(<any> navigatorData).userLanguage ||
		(<any> navigatorData).browserLanguage ||
		(<any> navigatorData).systemLanguage ||
		config.defaultLanguage;

	/** @ignore */
	private static readonly UA: string = navigatorData.userAgent.toLowerCase();

	/** @ignore */
	private readonly useBaseUrl: boolean =
		!!environment.customBuild || environment.local;

	/** @inheritDoc */
	public readonly appUrl: string =
		environment.local || this.isOnion ?
			envDeploy.appUrl :
		!environment.customBuild || environment.customBuild.config.burnerOnly ?
			envDeploy.newCyphBaseUrl :
			`https://${environment.customBuild.id}/`;

	/** If applicable, default call type. */
	public readonly callType?: 'audio' | 'video' =
		environment.customBuild &&
		environment.customBuild.config.callTypeVideo ?
			'video' :
		environment.customBuild &&
			environment.customBuild.config.callTypeAudio ?
			'audio' :
			undefined;

	/** Google Chrome version, if applicable. */
	public readonly chromeVersion: number = toInt(
		(Env.UA.match(/chrome\/(\d+)/) || [])[1]
	);

	/** Indicates whether this is a co-branded (or white label) instance of Cyph. */
	public readonly coBranded: boolean =
		environment.customBuild !== undefined &&
		environment.customBuild.favicon !== undefined;

	/** Base URL for a new audio cyph link ("https://cyph.app/#burner/audio/" or equivalent). */
	public readonly cyphAudioBaseUrl: string;

	/** @inheritDoc */
	public readonly cyphAudioUrl: string;

	/** @inheritDoc */
	public readonly cyphImUrl: string;

	/** Base URL for a new io cyph link ("https://cyph.app/#burner/io/" or equivalent). */
	public readonly cyphIoBaseUrl: string;

	/** @inheritDoc */
	public readonly cyphIoUrl: string;

	/** @inheritDoc */
	public readonly cyphMeUrl: string =
		!environment.local && this.appUrl === envDeploy.appUrl ?
			envDeploy.cyphMeUrl :
			`${this.appUrl}profile/`;

	/** Base URL for a new video cyph link ("https://cyph.app/#burner/video/" or equivalent). */
	public readonly cyphVideoBaseUrl: string;

	/** @inheritDoc */
	public readonly cyphVideoUrl: string;

	/** Debug mode (true by default in local env). */
	public readonly debug: boolean =
		(typeof environment.debug === 'boolean' ?
			environment.debug :
			environment.local) ||
		(typeof (<any> localStorage) === 'object' &&
			/* tslint:disable-next-line:no-unbound-method */
			typeof (<any> localStorage).getItem === 'function' &&
			/* tslint:disable-next-line:ban */
			localStorage.getItem('debug') === 'true');

	/** Indicates whether debug logging is enabled (true by default when debug is true). */
	public readonly debugLog: boolean = this.debug;

	/** @see IEnvironment */
	public readonly environment: IEnvironment = environment;

	/** Firebase-related config. */
	public readonly firebaseConfig = {
		apiKey: environment.firebase.apiKey,
		authDomain: `${environment.firebase.project}.firebaseapp.com`,
		databaseURL: `wss://${environment.firebase.project}.firebaseio.com`,
		messagingSenderId: environment.firebase.messagingSenderId,
		projectId: environment.firebase.project,
		storageBucket: `${environment.firebase.project}.appspot.com`
	};

	/** Complete (lowercase) language code, e.g. "en-us". */
	public readonly fullLanguage: string = Env.language.toLowerCase();

	/** Indicates whether this is Android. */
	public readonly isAndroid: boolean =
		/android/.test(Env.UA) ||
		((<any> self).device && (<any> self).device.platform === 'Android');

	/** Indicates whether this is Chrome. */
	public readonly isChrome: boolean =
		/chrome/.test(Env.UA) && !/edge/.test(Env.UA);

	/** Indicates whether this is Cordova. */
	public readonly isCordova: boolean = (<any> self).cordova !== undefined;

	/** Indicates whether this is Cordova on a desktop OS. */
	public readonly isCordovaDesktop: boolean;

	/** Indicates whether this is Cordova on a mobile OS. */
	public readonly isCordovaMobile: boolean;

	/** Indicates whether this is Edge. */
	public readonly isEdge: boolean = /edge\/\d+/.test(Env.UA);

	/** @see CustomBuildConfig.browserExtension */
	public readonly isExtension: boolean =
		environment.customBuild !== undefined &&
		environment.customBuild.config.browserExtension === true;

	/** Indicates whether this is mobile Firefox. */
	public readonly isFFMobile: boolean =
		/fennec/.test(Env.UA) ||
		(/firefox/.test(Env.UA) &&
			(this.isAndroid || /mobile/.test(Env.UA) || /tablet/.test(Env.UA)));

	/** Indicates whether this is Firefox. */
	public readonly isFirefox: boolean = /firefox/.test(Env.UA);

	/** Indicates whether this is the Cyph corporate website (cyph.com). */
	public readonly isHomeSite: boolean =
		this.homeUrl.split('/')[2].replace('www.', '') === this.host;

	/** Indicates whether this is iOS. */
	public readonly isIOS: boolean =
		/ipad|iphone|ipod/.test(Env.UA) ||
		((<any> self).device && (<any> self).device.platform === 'iOS');

	/** @see IEnvironment.local */
	public readonly isLocalEnv: boolean = environment.local;

	/** Indicates whether this is macOS / OS X. */
	public readonly isMacOS: boolean = /mac os x/.test(Env.UA);

	/** Indicates whether this is the main thread. */
	public readonly isMainThread: boolean =
		typeof (<any> self).importScripts !== 'function';

	/** Indicates whether this is a mobile screen size (equivalent to Flex Layout lt-md). */
	public readonly isMobile: BehaviorSubject<boolean>;

	/** Indicates whether this is a mobile operating system. */
	public readonly isMobileOS: boolean =
		this.isAndroid || this.isIOS || this.isFFMobile;

	/** Indicates whether this is Node.js/io.js. */
	public readonly isNode: boolean =
		typeof (<any> self).process === 'object' &&
		typeof (<any> self).require === 'function';

	/** Indicates whether this is a version of Firefox before 57 ("Quantum"). */
	public readonly isOldFirefox: boolean =
		this.isFirefox &&
		!(toInt((Env.UA.match(/firefox\/(\d+)/) || [])[1]) >= 57);

	/** Indicates whether this is Safari. */
	public readonly isSafari: boolean =
		navigatorData.vendor === 'Apple Computer, Inc.';

	/** @see CustomBuildConfig.telehealth */
	public readonly isTelehealth: boolean =
		environment.customBuild !== undefined &&
		(environment.customBuild.config.telehealth === true ||
			environment.customBuild.config.telehealthFull === true);

	/** @see CustomBuildConfig.telehealthFull */
	public readonly isTelehealthFull: boolean =
		environment.customBuild !== undefined &&
		environment.customBuild.config.telehealthFull === true;

	/** Indicates whether this is a WebKit/Blink browser. */
	public readonly isWebKit: boolean =
		!(this.isEdge || this.isFirefox) &&
		(this.isChrome ||
			this.isSafari ||
			!!(
				this.isWeb &&
				document.documentElement &&
				'WebkitAppearance' in document.documentElement.style
			));

	/** Normalized language code, used for translations. */
	public readonly language: string = (() => {
		const language = this.fullLanguage.split('-')[0];

		/* Consistency in special cases */
		return language === 'nb' ?
			'no' :
		this.fullLanguage === 'zh-tw' ?
			'zh-cht' :
		language === 'zh' ?
			'zh-chs' :
			language;
	})();

	/** @inheritDoc */
	public readonly newCyphBaseUrl: string =
		environment.local || !environment.customBuild ?
			envDeploy.newCyphBaseUrl :
			`https://${environment.customBuild.id}/${
				environment.customBuild.config.burnerOnly ? '' : '#burner/'
			}`;

	/** Platform name ("android", "electron", "ios", "unknown", "web"). */
	public readonly platform: string =
		!this.isCordova && this.isWeb ?
			'web' :
		this.isAndroid ?
			'android' :
		this.isIOS ?
			'ios' :
		!this.isMobileOS ?
			'electron' :
			'unknown';

	/** @see CustomBuildConfig.pro */
	public readonly pro = new BehaviorSubject<boolean>(
		environment.customBuild !== undefined &&
			environment.customBuild.config.pro === true
	);

	/** Complete (original case) language code, e.g. "en-US". */
	public readonly realLanguage: string = Env.language;

	/** Indicates whether this is Safari 10.0 or older. */
	public readonly safariVersion?: number = this.isSafari ?
		parseFloat((Env.UA.match(/version\/(\d+\.\d+)/) || [])[1] || '0') :
		undefined;

	/** Indicates whether minimal affiliate advertising should be displayed. */
	public readonly showAds: boolean = !environment.customBuild;

	/** Indicates whether Granim gradient canvases should be displayed. */
	public readonly showGranim: boolean =
		!this.isExtension &&
		!this.isOldFirefox &&
		!this.isMobile &&
		!(
			environment.customBuild &&
			environment.customBuild.config.backgroundColor
		);

	/** Base URI for sending an SMS. */
	public readonly smsUriBase: string = `sms:${this.isIOS ? '&' : '?'}body=`;

	/** If true, telehealth theme is enabled. */
	public readonly telehealthTheme: boolean =
		this.isTelehealth ||
		(environment.customBuild !== undefined &&
			environment.customBuild.config.telehealthTheme === true);

	/** Current user agent (lowercase). */
	public readonly userAgent: string = Env.UA;

	/** Indicates whether this is a full white label instance of Cyph. */
	public readonly whiteLabel: boolean =
		environment.customBuild !== undefined &&
		environment.customBuild.config.whiteLabel === true;

	constructor () {
		super();

		this.isCordovaDesktop = this.isCordova && !this.isMobileOS;
		this.isCordovaMobile = this.isCordova && this.isMobileOS;

		const newCyphBaseUrl =
			this.newCyphBaseUrl +
			(this.newCyphBaseUrl.indexOf('#') > -1 ? '' : '#');

		this.cyphAudioBaseUrl = `${newCyphBaseUrl}audio/`;
		this.cyphIoBaseUrl = `${newCyphBaseUrl}io/`;
		this.cyphVideoBaseUrl = `${newCyphBaseUrl}video/`;

		this.cyphAudioUrl = this.useBaseUrl ?
			this.cyphAudioBaseUrl :
			envDeploy.cyphAudioUrl;
		this.cyphImUrl = this.useBaseUrl ?
			this.newCyphBaseUrl :
			envDeploy.cyphImUrl;
		this.cyphIoUrl = this.useBaseUrl ?
			this.cyphIoBaseUrl :
			envDeploy.cyphIoUrl;
		this.cyphVideoUrl = this.useBaseUrl ?
			this.cyphVideoBaseUrl :
			envDeploy.cyphVideoUrl;

		if (this.isExtension || !this.isWeb) {
			this.isMobile = new BehaviorSubject<boolean>(true);
			return;
		}

		const detectIfMobile = (width: number) =>
			width <= config.responsiveMaxWidths.sm;
		const windowWatcherService = new WindowWatcherService(this);

		this.isMobile = toBehaviorSubject(
			windowWatcherService.width.pipe(map(detectIfMobile)),
			detectIfMobile(windowWatcherService.width.value)
		);
	}
}

/** @see Env */
export const env = new Env();
