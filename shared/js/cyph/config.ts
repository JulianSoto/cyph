import * as angular from 'angular';
import {ISessionService} from './service-interfaces/isession-service';


/**
 * Static/constant configuration values.
 */
export class Config {
	/** URL for Cyph Tor site. */
	public readonly onionRoot: string			= 'cyphdbyhiddenbhs.onion';

	/** Indicates the original language of any content to be translated. */
	public readonly defaultLanguage: string		= 'en';

	/** Length of server ID for a cyph. */
	public readonly cyphIdLength: number		= 7;

	/** Number of milliseconds before new cyph wait screen will abort. */
	public readonly cyphCountdown: number		= 600000;

	/** Length of random IDs in cyph links. */
	public readonly secretLength: number		= 25;

	/** Length of channel IDs. */
	public readonly longSecretLength: number	= 52;

	/**
	 * Characters used by Util.generateGuid (includes all alphanumeric
	 * characters except 'l' and 'I' for readability reasons).
	 */
	public readonly guidAddressSpace: string[]	= [
		'0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j',
		'k', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u',
		'v', 'w', 'x', 'y', 'z', 'A', 'B', 'C', 'D', 'E',
		'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P',
		'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'
	];

	/** Configuration of available API flags. */
	public readonly apiFlags	= [
		{
			analEvent: 'telehealth',
			character: '@',
			set: (sessionService: ISessionService) => {
				sessionService.apiFlags.telehealth		= true;
			}
		},
		{
			analEvent: 'modest-branding',
			character: '&',
			set: (sessionService: ISessionService) => {
				sessionService.apiFlags.modestBranding	= true;
			}
		},
		{
			analEvent: 'force-turn',
			character: '$',
			set: (sessionService: ISessionService) => {
				sessionService.apiFlags.forceTURN 		= true;
			}
		},
		{
			analEvent: 'native-crypto',
			character: '%',
			set: (sessionService: ISessionService) => {
				sessionService.apiFlags.nativeCrypto	= true;
			}
		}
	];

	/** Angular-related config. */
	public readonly angularConfig	= {
		config: [
			'$compileProvider',
			'$mdThemingProvider',
			(
				$compileProvider: angular.ICompileProvider,
				$mdThemingProvider: angular.material.IThemingProvider
			) => {
				$compileProvider.
					aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|sms):/).
					debugInfoEnabled(false)
				;

				$mdThemingProvider.definePalette(
					'cyph',
					$mdThemingProvider.extendPalette(
						'deep-purple',
						{
							400: '8b62d9'
						}
					)
				);

				$mdThemingProvider.theme('default').
					primaryPalette('cyph').
					accentPalette('cyph')
				;
			}
		],
		rootController: 'CyphController',
		rootModule: 'Cyph'
	};

	/** Braintree-related config. */
	public readonly braintreeConfig	= {
		endpoint: 'braintree'
	};

	/** Pricing-related config. */
	public readonly pricingConfig	= {
		categories: {
			accounting: {
				id: 5,
				items: {
					generic: {id: 0}
				}
			},
			donation: {
				id: 0,
				items: {
					generic: {id: 0}
				}
			},
			enterprise: {
				id: 2,
				items: {
					basics: {id: 1},
					beta: {id: 0},
					works: {id: 2}
				}
			},
			individual: {
				id: 1,
				items: {
					pro: {id: 0}
				}
			},
			legal: {
				id: 4,
				items: {
					generic: {id: 0}
				}
			},
			telehealth: {
				id: 3,
				items: {
					small: {id: 1},
					solo: {id: 0}
				}
			}
		}
	};

	/** File-transfer-related config (used by Files.Files). */
	public readonly filesConfig	= {
		approvalLimit: 512000,
		chunkSize: 67108864,
		maxImageWidth: 1920,
		maxSize: 268435456
	};

	/** WebSign-related config. */
	public readonly webSignConfig	= {
		serviceWorker: 'serviceworker.js',
		workerHelper: 'js/workerhelper.js'
	};

	/** User-facing email addresses to include in places like contact forms. */
	public readonly cyphEmailAddresses: string[]	= [
		'hello',
		'help',
		'feedback',
		'bugs',
		'b2b',
		'telehealth',
		'privacy'
	];

	/** Max unsigned 48-bit integer + 1, used by Util.random. */
	public readonly maxSafeUint: number	= 281474976710656;

	constructor () {}
}

/** @see Config */
export const config	= new Config();
