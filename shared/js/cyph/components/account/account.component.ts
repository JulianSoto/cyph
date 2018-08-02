import {AfterViewInit, ChangeDetectionStrategy, Component, OnInit} from '@angular/core';
import {ActivatedRoute, UrlSegment} from '@angular/router';
import {combineLatest, Observable, of} from 'rxjs';
import {map, mergeMap} from 'rxjs/operators';
import {UserPresence} from '../../account'
import {initGranim} from '../../granim';
import {AccountEnvService} from '../../services/account-env.service';
import {AccountService} from '../../services/account.service';
import {AccountAuthService} from '../../services/crypto/account-auth.service';
import {AccountDatabaseService} from '../../services/crypto/account-database.service';
import {EnvService} from '../../services/env.service';
import {StringsService} from '../../services/strings.service';
import {resolvable} from '../../util/wait';


/**
 * Angular component for the Cyph account screen.
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	providers: [
		{
			provide: EnvService,
			useClass: AccountEnvService
		}
	],
	selector: 'cyph-account',
	styleUrls: ['./account.component.scss'],
	templateUrl: './account.component.html'
})
export class AccountComponent implements AfterViewInit, OnInit {
	/** @ignore */
	private readonly _VIEW_INITIATED									= resolvable();

	/** @ignore */
	private readonly activatedRouteChildURL: Observable<UrlSegment[]>	=
		this.accountService.routeChanges.pipe(mergeMap(() =>
			this.activatedRoute.firstChild && this.activatedRoute.firstChild.firstChild ?
				this.activatedRoute.firstChild.firstChild.url :
				of([])
		))
	;

	/** @ignore */
	private readonly activatedRouteURL: Observable<UrlSegment[]>		=
		this.accountService.routeChanges.pipe(mergeMap(() =>
			this.activatedRoute.firstChild ?
				this.activatedRoute.firstChild.url :
				of([])
		))
	;

	/** @ignore */
	private readonly route: Observable<string>							=
		this.activatedRouteURL.pipe(map(activatedRouteURL =>
			activatedRouteURL.length > 0 ?
				activatedRouteURL[0].path :
				''
		))
	;

	/** @ignore */
	private readonly resolveViewInitiated: () => void	= this._VIEW_INITIATED.resolve;

	/** Resolves after view init. */
	public readonly viewInitiated: Promise<void>		= this._VIEW_INITIATED.promise;

	/** Indicates whether section should take up 100% height. */
	public readonly fullHeight: Observable<boolean>		= combineLatest(
		this.activatedRouteURL,
		this.route
	).pipe(map(([activatedRouteURL, route]) =>
		(
			[
				'',
				'audio',
				'contacts',
				'logout',
				'messages',
				'patients',
				'profile',
				'staff',
				'video'
			].indexOf(route) > -1
		) || (
			activatedRouteURL.length > 1 &&
			[
				'appointments'
			].indexOf(route) > -1
		)
	));

	/** Indicates whether section should take up 100% width. */
	public readonly fullWidth: Observable<boolean>		= combineLatest(
		this.activatedRouteURL,
		this.route
	).pipe(map(([activatedRouteURL, route]) =>
		this.envService.isMobile || (
			[
				'audio',
				'messages',
				'profile',
				'video',
				'wallets'
			].indexOf(route) > -1
		) || (
			activatedRouteURL.length > 1 &&
			[
				'appointments',
				'notes'
			].indexOf(route) > -1
		)
	));

	/** Indicates whether menu should be displayed. */
	public readonly menuVisible: Observable<boolean>		= combineLatest(
		this.accountDatabaseService.currentUser,
		this.activatedRouteChildURL,
		this.route
	).pipe(map(([currentUser, activatedRouteChildURL, route]) => {
		if (
			route === 'appointments' &&
			activatedRouteChildURL.length > 0 &&
			activatedRouteChildURL[0].path !== 'end'
		) {
			return false;
		}

		return currentUser !== undefined && [
			'',
			'404',
			'audio',
			'appointments',
			'chat-transition',
			'compose',
			'contacts',
			'docs',
			'doctors',
			'ehr-access',
			'files',
			'forms',
			'incoming-patient-info',
			'messages',
			'new-patient',
			'notes',
			'notifications',
			'patients',
			'profile',
			'request-appointment',
			'request-followup',
			'settings',
			'staff',
			'video',
			'wallets'
		].indexOf(route) > -1;
	}));

	/** Indicates whether sidebar should be displayed. */
	public readonly sidebarVisible: Observable<boolean>		= combineLatest(
		this.accountDatabaseService.currentUser,
		this.route
	).pipe(map(([currentUser, route]) =>
		!this.envService.isMobile &&
		!this.envService.isTelehealth &&
		currentUser !== undefined &&
		[
			'chat-transition',
			'messages',
			'notifications'
		].indexOf(route) > -1
	));

	/** @inheritDoc */
	public async ngAfterViewInit () : Promise<void> {
		this.resolveViewInitiated();
	}

	/** @inheritDoc */
	public async ngOnInit () : Promise<void> {
		if (!this.envService.isWeb) {
			/* TODO: HANDLE NATIVE */
			return;
		}

		if (!this.envService.coBranded && !this.envService.isExtension) {
			await initGranim({
				direction: 'radial',
				element: '.cyph-gradient',
				isPausedWhenNotInView: true,
				name: 'basic-gradient',
				opacity: [1, 0.5, 0],
				states: {
					'default-state': {
						gradients: !this.envService.isTelehealth ?
							[
								['#f5f5f6', '#cccccc'],
								['#cccccc', '#f5f5f6']
							] :
							[
								['#eeecf1', '#b7bccb'],
								['#b7bccb', '#eeecf1']
							]
						,
						loop: false,
						transitionSpeed: 5000
					}
				}
			});
		}
	}

	/** @see UserPresence */
	public readonly userPresence: typeof UserPresence		= UserPresence;

	constructor (
		/** @ignore */
		private readonly activatedRoute: ActivatedRoute,

		/** @see AccountService */
		public readonly accountService: AccountService,

		/** @see AccountAuthService */
		public readonly accountAuthService: AccountAuthService,

		/** @see AccountDatabaseService */
		public readonly accountDatabaseService: AccountDatabaseService,

		/** @see EnvService */
		public readonly envService: EnvService,

		/** @see StringsService */
		public readonly stringsService: StringsService
	) {
		/* tslint:disable-next-line:strict-type-predicates */
		if (typeof document === 'object' && typeof document.body === 'object') {
			document.body.classList.toggle('primary-account-theme', accountPrimaryTheme);
		}
	}
}
