import {SafeUrl} from '@angular/platform-browser';
import memoize from 'lodash-es/memoize';
import {BehaviorSubject, Observable} from 'rxjs';
import {map, mergeMap} from 'rxjs/operators';
import {IAsyncMap} from '../iasync-map';
import {IAsyncValue} from '../iasync-value';
import {LockFunction} from '../lock-function-type';
import {MaybePromise} from '../maybe-promise-type';
import {
	AccountContactState,
	AccountUserTypes,
	IAccountUserPresence,
	IAccountUserProfile,
	IAccountUserProfileExtra,
	IReview
} from '../proto';
import {toBehaviorSubject} from '../util/flatten-observable';
import {lockFunction, lockTryOnce} from '../util/lock';
import {staticDomSanitizer} from '../util/static-services';
import {UserPresence} from './enums';
import {reviewMax} from './review-max';


/**
 * Represents a user profile.
 */
export class User {
	/** @ignore */
	private static readonly defaultAvatar: Promise<SafeUrl>		=
		staticDomSanitizer.then(domSanitizer =>
			domSanitizer.bypassSecurityTrustUrl('/assets/img/favicon/favicon-256x256.png')
		)
	;

	/** @ignore */
	private static readonly defaultCoverImage: Promise<SafeUrl>	=
		staticDomSanitizer.then(domSanitizer =>
			domSanitizer.bypassSecurityTrustUrl('/assets/img/coverimage.png')
		)
	;

	/** @ignore */
	private static readonly fetchLock: LockFunction				= lockFunction();


	/** @ignore */
	private readonly fetchLock: {}	= {};

	/** Image URI for avatar / profile picture. */
	public readonly avatar: Observable<SafeUrl>					= toBehaviorSubject(
		this.avatarInternal,
		User.defaultAvatar
	).pipe(
		mergeMap(async avatar => avatar || User.defaultAvatar)
	);

	/** @see IAccountContactState.state */
	public readonly contactState: Observable<AccountContactState.States>	= toBehaviorSubject(
		this.accountContactState.watch().pipe(map(({state}) => state)),
		AccountContactState.States.None
	);

	/** Image URI for cover image. */
	public readonly coverImage: Observable<SafeUrl>				= toBehaviorSubject(
		this.coverImageInternal,
		User.defaultCoverImage
	).pipe(
		mergeMap(async coverImage => coverImage || User.defaultCoverImage)
	);

	/** @see IAccountUserProfile.description */
	public readonly description: Observable<string>	= toBehaviorSubject(
		this.accountUserProfile.watch().pipe(map(({description}) => description)),
		''
	);

	/** @see IAccountUserProfile.externalUsernames */
	public readonly externalUsernames: Observable<{[k: string]: string}|undefined>	=
		toBehaviorSubject(
			this.accountUserProfile.watch().pipe(
				map(({externalUsernames}) => externalUsernames || {})
			),
			{}
		)
	;

	/** @see IAccountUserProfileExtra */
	public readonly extra: () => Observable<IAccountUserProfileExtra|undefined>	=
		memoize(() => toBehaviorSubject(
			this.accountUserProfileExtra.watch(),
			undefined
		))
	;

	/** @see IAccountUserProfile.hasPremium */
	public readonly hasPremium: Observable<boolean|undefined>	= toBehaviorSubject(
		this.accountUserProfile.watch().pipe(map(({hasPremium}) => hasPremium)),
		undefined
	);

	/** @see IAccountUserProfile.name */
	public readonly name: Observable<string>	= toBehaviorSubject(
		this.accountUserProfile.watch().pipe(map(({name}) => name)),
		''
	);

	/** Average rating. */
	public readonly rating: () => Observable<number|undefined>	= memoize(() => toBehaviorSubject(
		this.reviews.watch().pipe(map(reviews =>
			reviews.size < 1 ?
				undefined :
				(
					Array.from(reviews.values()).
						map(review => Math.min(review.rating, reviewMax)).
						reduce((a, b) => a + b, 0)
				) / reviews.size
		)),
		undefined
	));

	/** Indicates whether user data is ready to be consumed. */
	public readonly ready	= new BehaviorSubject<boolean>(false);

	/** @see IAccountUserProfile.realUsername */
	public readonly realUsername: Observable<string>	= toBehaviorSubject(
		this.accountUserProfile.watch().pipe(map(({realUsername}) =>
			realUsername.toLowerCase() === this.username ? realUsername : this.username
		)),
		''
	);

	/** @see IAccountUserProfile.status */
	public readonly status: Observable<UserPresence>	= toBehaviorSubject(
		this.accountUserPresence.watch().pipe(map(({status}) => status)),
		UserPresence.Offline
	);

	/** Unread incoming message count from this user. */
	public readonly unreadMessageCount: Observable<number>	= toBehaviorSubject<number>(
		async () => (await this.unreadMessages).watchSize(),
		0
	);

	/** @see IAccountUserProfile.userType */
	public readonly userType: Observable<AccountUserTypes|undefined>	= toBehaviorSubject(
		this.accountUserProfile.watch().pipe(map(({userType}) => userType)),
		undefined
	);

	/** Fetches user data and sets ready to true when complete. */
	public async fetch () : Promise<void> {
		if (this.ready.value) {
			return;
		}

		await lockTryOnce(this.fetchLock, async () => {
			await User.fetchLock(async () => this.accountUserProfile.getValue());
			this.ready.next(true);
		});
	}

	constructor (
		/** Username (all lowercase). */
		public readonly username: string,

		/** Contact ID. */
		public readonly contactID: Promise<string>,

		/** @ignore */
		private readonly avatarInternal: Observable<SafeUrl|string|undefined>,

		/** @ignore */
		private readonly coverImageInternal: Observable<SafeUrl|string|undefined>,

		/** @see IAccountContactState */
		public readonly accountContactState: IAsyncValue<AccountContactState>,

		/** @see IAccountUserPresence */
		public readonly accountUserPresence: IAsyncValue<IAccountUserPresence>,

		/** @see IAccountUserProfile */
		public readonly accountUserProfile: IAsyncValue<IAccountUserProfile>,

		/** @see IAccountUserProfileExtra */
		public readonly accountUserProfileExtra: IAsyncValue<IAccountUserProfileExtra>,

		/** If applicable, usernames of members of this organization. */
		public readonly organizationMembers: IAsyncValue<{[username: string]: boolean}>,

		/** @see IReview */
		public readonly reviews: IAsyncMap<string, IReview>,

		/** Unread incoming messages from this user. */
		private readonly unreadMessages: MaybePromise<IAsyncMap<string, never>>,

		/** Indicates whether we should immediately start fetching this user's data. */
		preFetch: boolean = false
	) {
		if (preFetch) {
			this.fetch();
		}
	}
}
