/* tslint:disable:max-file-line-count */

import {Injectable} from '@angular/core';


/**
 * URLs and copy for affiliate programs
 */
@Injectable()
export class AffiliateService {
	/** @see AffiliateService */
	public readonly accept: string						= `accept`;

	public readonly nordVPN			= {
		copy: {
			recommended: "Get Cyph's recommended VPN service - NordVPN."
		},
		links: {
			threeyear: 'https://go.nordvpn.net/SH1F8',
		}
	};

	constructor () {}
}
