import {Injectable} from '@angular/core';
import {
	ActivatedRouteSnapshot,
	CanActivate,
	CanActivateChild,
	Router
} from '@angular/router';
import {BaseProvider} from '../base-provider';
import {flattenArray} from '../util/reducers';
import {AccountAuthService} from './crypto/account-auth.service';
import {AccountDatabaseService} from './crypto/account-database.service';
import {EnvService} from './env.service';
import {StringsService} from './strings.service';

/** Auth guard for accounts routing. */
@Injectable()
export class AccountAuthGuardService extends BaseProvider
	implements CanActivate, CanActivateChild {
	/** @ignore */
	private readonly anonymouslyAccessibleRoutes: string[] = [
		'404',
		'compose',
		'logout',
		'post',
		'profile',
		'reject',
		'request-appointment',
		'upload-ehr-credentials'
	];

	/** @ignore */
	private readonly forcedAnonymouslyAccessibleRoutes: string[] = ['register'];

	/** @ignore */
	private readonly pseudoAccountRoutes: string[] = ['accept'];

	/** @ignore */
	private getFullRoutePath (route: ActivatedRouteSnapshot) : string[] {
		return route.url
			.map(o => o.path)
			.concat(
				flattenArray(
					route.children.map(child => this.getFullRoutePath(child))
				)
			);
	}

	/** @inheritDoc */
	public async canActivate (
		route: ActivatedRouteSnapshot
	) : Promise<boolean> {
		if (
			beforeUnloadMessage &&
			this.envService.isWeb &&
			!confirm(
				`${beforeUnloadMessage} ${this.stringsService.continuePrompt}`
			)
		) {
			return false;
		}

		if (
			this.accountDatabaseService.currentUser.value !== undefined ||
			(route.url.length > 0 &&
				(this.forcedAnonymouslyAccessibleRoutes.indexOf(
					route.url[0].path
				) > -1 ||
					(this.anonymouslyAccessibleRoutes.indexOf(
						route.url[0].path
					) > -1 &&
						!(await this.accountAuthService.hasSavedCredentials()))))
		) {
			return true;
		}

		if (
			route.url.length > 0 &&
			this.pseudoAccountRoutes.indexOf(route.url[0].path) > -1
		) {
			this.accountAuthService.pseudoAccountLogin.next(true);
		}

		this.router.navigate([
			'login',
			...(route.url.length > 0 ? this.getFullRoutePath(route) : [])
		]);

		return false;
	}

	/** @inheritDoc */
	public async canActivateChild (
		route: ActivatedRouteSnapshot
	) : Promise<boolean> {
		return this.canActivate(route);
	}

	constructor (
		/** @ignore */
		private readonly router: Router,

		/** @ignore */
		private readonly accountAuthService: AccountAuthService,

		/** @ignore */
		private readonly accountDatabaseService: AccountDatabaseService,

		/** @ignore */
		private readonly envService: EnvService,

		/** @ignore */
		private readonly stringsService: StringsService
	) {
		super();
	}
}
