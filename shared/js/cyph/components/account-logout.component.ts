import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {AccountService} from '../services/account.service';
import {AccountAuthService} from '../services/crypto/account-auth.service';
import {EnvService} from '../services/env.service';
import {StringsService} from '../services/strings.service';
import {sleep} from '../util/wait';


/**
 * Angular component for account logout UI.
 */
@Component({
	selector: 'cyph-account-logout',
	styleUrls: ['../../../css/components/account-logout.scss'],
	templateUrl: '../../../templates/account-logout.html'
})
export class AccountLogoutComponent implements OnInit {
	/** @inheritDoc */
	public async ngOnInit () : Promise<void> {
		this.accountService.transitionEnd();

		await this.accountAuthService.logout();
		await sleep(500);
		await this.router.navigate([accountRoot, 'login']);

		/* Get rid of any data still sitting in memory */
		if (this.envService.isWeb) {
			location.reload();
		}
		else {
			/* TODO: HANDLE NATIVE */
		}
	}

	constructor (
		/** @ignore */
		private readonly router: Router,

		/** @ignore */
		private readonly envService: EnvService,

		/** @see AccountService */
		public readonly accountService: AccountService,

		/** @see AccountAuthService */
		public readonly accountAuthService: AccountAuthService,

		/** @see StringsService */
		public readonly stringsService: StringsService
	) {}
}
