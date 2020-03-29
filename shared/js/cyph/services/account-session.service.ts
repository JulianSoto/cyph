/* eslint-disable max-lines */

import {Injectable} from '@angular/core';
import {BehaviorSubject, Observable, of} from 'rxjs';
import {filter, take} from 'rxjs/operators';
import {IContactListItem, UserLike} from '../account';
import {AccountContactsComponent} from '../components/account-contacts';
import {MaybePromise} from '../maybe-promise-type';
import {
	IAccountMessagingGroup,
	ISessionMessage,
	SessionMessageList,
	StringProto
} from '../proto';
import {events, ISessionMessageData, rpcEvents} from '../session';
import {filterUndefined} from '../util/filter';
import {normalizeArray} from '../util/formatting';
import {getOrSetDefault} from '../util/get-or-set-default';
import {debugLog} from '../util/log';
import {request} from '../util/request';
import {uuid} from '../util/uuid';
import {resolvable} from '../util/wait';
import {AccountContactsService} from './account-contacts.service';
import {AccountSessionInitService} from './account-session-init.service';
import {AccountUserLookupService} from './account-user-lookup.service';
import {AccountService} from './account.service';
import {AnalyticsService} from './analytics.service';
import {ChannelService} from './channel.service';
import {AccountDatabaseService} from './crypto/account-database.service';
import {CastleService} from './crypto/castle.service';
import {PotassiumService} from './crypto/potassium.service';
import {DialogService} from './dialog.service';
import {EnvService} from './env.service';
import {ErrorService} from './error.service';
import {SessionInitService} from './session-init.service';
import {SessionService} from './session.service';
import {StringsService} from './strings.service';

/**
 * Account session service.
 */
@Injectable()
export class AccountSessionService extends SessionService {
	/** @ignore */
	private readonly _READY = resolvable();

	/** @ignore */
	private initiated: boolean = false;

	/** @ignore */
	private readonly resolveReady: () => void = this._READY.resolve;

	/** If true, this is an ephemeral sub-session. */
	public ephemeralSubSession: boolean = false;

	/** @inheritDoc */
	public group?: AccountSessionService[];

	/** Metadata of current group, if applicable. */
	public groupMetadata?: {
		id: string;
		usernames: string[];
	};

	/** @inheritDoc */
	public readonly ready = this._READY.promise;

	/** Remote user. */
	public readonly remoteUser = new BehaviorSubject<
		MaybePromise<UserLike | undefined>
	>(undefined);

	/** @inheritDoc */
	protected async abortSetup () : Promise<void> {
		const remoteUser = await this.remoteUser.pipe(take(1)).toPromise();

		if (remoteUser?.username) {
			await this.accountContactsService.resetCastleSession(
				remoteUser.username
			);
		}

		await super.abortSetup();
	}

	/** @inheritDoc */
	protected async channelOnClose () : Promise<void> {
		if (this.group) {
			throw new Error(
				'Master channelOnClose should not be used in a group session.'
			);
		}

		if (this.ephemeralSubSession) {
			await super.channelOnClose();
		}
	}

	/** @inheritDoc */
	protected async channelOnOpen (isAlice: boolean) : Promise<void> {
		if (this.group) {
			throw new Error(
				'Master channelOnOpen should not be used in a group session.'
			);
		}

		await super.channelOnOpen(isAlice);
	}

	/** @inheritDoc */
	protected async getSessionMessageAuthor (
		message: ISessionMessageData
	) : Promise<Observable<string> | undefined> {
		if (!message.authorID) {
			return;
		}

		const user = await this.accountUserLookupService.getUser(
			message.authorID
		);

		if (user) {
			return user.realUsername;
		}

		return;
	}

	/** @inheritDoc */
	protected async plaintextSendHandler (
		messages: ISessionMessage[]
	) : Promise<void> {
		if (this.group) {
			await Promise.all(
				this.group.map(async session =>
					session.plaintextSendHandler(messages)
				)
			);
			return;
		}

		await super.plaintextSendHandler(messages);
	}

	/** @inheritDoc */
	public close () : void {
		if (this.group) {
			for (const session of this.group) {
				session.close();
			}
			return;
		}

		if (this.ephemeralSubSession) {
			super.close();
		}
	}

	/** Normalizes username or username list. */
	public normalizeUsername (username: string) : string;
	public normalizeUsername (username: string[]) : string[];
	public normalizeUsername (username: string | string[]) : string | string[];
	public normalizeUsername (username: string | string[]) : string | string[] {
		if (username instanceof Array) {
			username = normalizeArray(username);

			if (this.accountDatabaseService.currentUser.value) {
				const {user} = this.accountDatabaseService.currentUser.value;
				username = username.filter(s => s !== user.username);
			}

			if (username.length === 1) {
				username = username[0];
			}
		}

		return username;
	}

	/** Sets the remote user we're chatting with. */
	public async setUser (
		chat:
			| {anonymousChannelID: string; passive?: boolean}
			| {group: IAccountMessagingGroup; id: string}
			| {username: string},
		sessionSubID?: string,
		ephemeralSubSession: boolean = false,
		setHeader: boolean = true
	) : Promise<void> {
		if (this.initiated) {
			throw new Error('User already set.');
		}

		debugLog(() => ({
			accountSessionInit: {
				chat,
				ephemeralSubSession,
				sessionSubID,
				setHeader
			}
		}));

		if ('anonymousChannelID' in chat) {
			if (!this.accountDatabaseService.currentUser.value) {
				throw new Error('No user signed in.');
			}

			this.accountService.autoUpdate.next(false);

			this.accountService.setHeader({
				mobile: this.stringsService.burner
			});

			this.accountSessionInitService.ephemeral = true;
			this.ephemeralSubSession = true;

			const channelID = await request({
				data: {channelID: uuid(true), proFeatures: this.proFeatures},
				method: 'POST',
				retries: 5,
				url: `${this.envService.baseUrl}channels/${chat.anonymousChannelID}`
			});

			this.remoteUser.next({
				anonymous: true,
				avatar: undefined,
				contactID: undefined,
				coverImage: undefined,
				name: undefined,
				pseudoAccount: false,
				username: undefined
			});
			this.state.sharedSecret.next(
				`${this.accountDatabaseService.currentUser.value.user.username}/${chat.anonymousChannelID}`
			);
			this.state.startingNewCyph.next(chat.passive ? undefined : true);

			this.resolveReady();
			return this.init(channelID);
		}

		if ('username' in chat) {
			chat.username = this.normalizeUsername(chat.username);
		}

		this.initiated = true;
		this.sessionSubID = sessionSubID;

		/* Group session init */

		if ('group' in chat) {
			const usernames = this.normalizeUsername(
				chat.group.usernames || []
			);

			if (setHeader) {
				const contactList = of(
					usernames.map(
						(username) : IContactListItem => ({
							unreadMessageCount: of(0),
							user: this.accountUserLookupService
								.getUser(username)
								.catch(() => undefined),
							username
						})
					)
				);

				this.accountService.setHeader(
					{
						mobile: this.stringsService.group
					},
					[
						{
							handler: async () =>
								this.dialogService.baseDialog(
									AccountContactsComponent,
									o => {
										const previousValues = {
											contactList: o.contactList,
											readOnly: o.readOnly
										};

										o.contactList = contactList;
										o.readOnly = true;

										o.ngOnChanges({
											contactList: {
												currentValue: o.contactList,
												firstChange: false,
												isFirstChange: () => false,
												previousValue:
													previousValues.contactList
											},
											readOnly: {
												currentValue: o.readOnly,
												firstChange: false,
												isFirstChange: () => false,
												previousValue:
													previousValues.readOnly
											}
										});
									},
									undefined,
									true
								),
							icon: 'group',
							label: this.stringsService.viewGroupMembers
						}
					]
				);
			}

			/* Create N pairwise sessions, one for each other group member */

			this.sessionSubID = `group-${chat.group.castleSessionID}${
				this.sessionSubID ? `-${this.sessionSubID}` : ''
			}`;

			const group = await Promise.all(
				usernames.map(async username => {
					const session = this.spawn();
					await session.setUser(
						{username},
						this.sessionSubID,
						ephemeralSubSession,
						false
					);
					return session;
				})
			);

			if (group.length < 1) {
				throw new Error('Cannot create empty group.');
			}

			this.group = group;
			this.groupMetadata = {id: chat.id, usernames};

			/*
				Handle events on individual pairwise sessions and perform equivalent behavior.
				Note: rpcEvents.typing is ignored because it's unsupported in accounts.
			*/

			const confirmations = new Map<string, Set<AccountSessionService>>();

			Promise.all(group.map(async session => session.opened)).then(() => {
				this.resolveOpened();
			});

			Promise.all(
				group.map(
					async session => session.initialMessagesProcessed.promise
				)
			).then(() => {
				this.initialMessagesProcessed.resolve();
			});

			for (const {event, all} of [
				{all: false, event: events.beginChat},
				{all: false, event: events.closeChat},
				{all: false, event: events.connect},
				{all: false, event: events.connectFailure},
				{all: false, event: events.cyphNotFound}
			]) {
				const promises = group.map(async session => session.one(event));
				const callback = async () => this.trigger(event);

				if (all) {
					Promise.all(promises).then(callback);
				}
				else {
					Promise.race(promises).then(callback);
				}
			}

			for (const session of group) {
				session.on(rpcEvents.text, async newEvents =>
					this.trigger(rpcEvents.text, newEvents)
				);

				session.on(
					rpcEvents.confirm,
					async (newEvents: ISessionMessageData[]) =>
						this.trigger(
							rpcEvents.confirm,
							filterUndefined(
								newEvents.map(o => {
									if (
										!o.textConfirmation ||
										!o.textConfirmation.id
									) {
										return;
									}

									const confirmedSessions = getOrSetDefault(
										confirmations,
										o.textConfirmation.id,
										() => new Set<AccountSessionService>()
									);

									confirmedSessions.add(session);

									if (
										confirmedSessions.size === group.length
									) {
										confirmations.delete(
											o.textConfirmation.id
										);
										return o;
									}

									return;
								})
							)
						)
				);
			}

			this.resolveReady();
			return;
		}

		/* Pairwise session init */

		(async () => {
			const {
				castleSessionID
			} = await this.accountContactsService.getCastleSessionData(
				chat.username
			);

			const sessionID = !this.sessionSubID ?
				castleSessionID :
				this.potassiumService.toHex(
					await this.potassiumService.hash.hash(
						`${castleSessionID}-${this.sessionSubID}`
					)
				);

			if (ephemeralSubSession) {
				if (!this.sessionSubID) {
					throw new Error(
						'Cannot start ephemeral sub-session without sessionSubID.'
					);
				}

				this.ephemeralSubSession = true;

				this.init(sessionID);

				return;
			}

			const castleSessionURL = `castleSessions/${castleSessionID}/session`;
			const sessionURL = `castleSessions/${sessionID}/session`;

			this.incomingMessageQueue = this.accountDatabaseService.getAsyncList(
				`${sessionURL}/incomingMessageQueue`,
				SessionMessageList,
				undefined,
				undefined,
				undefined,
				false
			);

			this.incomingMessageQueueLock = this.accountDatabaseService.lockFunction(
				`${sessionURL}/incomingMessageQueueLock${
					sessionSubID ? `/${sessionSubID}` : ''
				}`
			);

			this.init(
				castleSessionID,
				sessionID,
				await this.accountDatabaseService.getOrSetDefault(
					`${castleSessionURL}/channelUserID`,
					StringProto,
					() => uuid(true)
				)
			);
		})();

		if (
			await this.accountDatabaseService.hasItem(
				`users/${chat.username}/pseudoAccount`
			)
		) {
			const contactState = await this.accountContactsService
				.contactState(chat.username)
				.getValue();

			const name =
				contactState.name ||
				(contactState.email && `<${contactState.email}>`) ||
				this.stringsService.friend;

			this.remoteUser.next({
				anonymous: false,
				avatar: undefined,
				contactID: this.accountContactsService.getContactID(
					chat.username
				),
				coverImage: undefined,
				name: of(name),
				pseudoAccount: true,
				username: chat.username
			});

			this.remoteUsername.next(chat.username);

			if (setHeader) {
				this.accountService.setHeader({mobile: name});
			}

			this.resolveReady();
			return;
		}

		this.remoteUsername.next(chat.username);

		if (setHeader) {
			this.accountService.setHeader({mobile: `@${chat.username}`});
		}

		const userPromise = this.accountUserLookupService.getUser(
			chat.username
		);

		userPromise.then(user => {
			if (user) {
				this.subscriptions.push(
					user.realUsername.subscribe(this.remoteUsername)
				);

				if (setHeader) {
					this.accountService.setHeader(user);
				}
			}

			debugLog(() => ({accountSessionInitComplete: {user}}));
		});

		this.remoteUser.next(userPromise);
		this.resolveReady();
	}

	/** @inheritDoc */
	public spawn () : AccountSessionService {
		return new AccountSessionService(
			this.analyticsService,
			this.castleService.spawn(),
			this.channelService.spawn(),
			this.envService,
			this.errorService,
			this.potassiumService,
			this.sessionInitService.spawn(),
			this.stringsService,
			this.accountService,
			this.accountContactsService,
			this.accountDatabaseService,
			this.accountSessionInitService,
			this.accountUserLookupService,
			this.dialogService
		);
	}

	/** @inheritDoc */
	public async yt () : Promise<void> {
		if (this.sessionInitService.ephemeral) {
			return;
		}

		if (this.group) {
			await Promise.all(this.group.map(async session => session.yt()));
			return;
		}

		return new Promise<void>(resolve => {
			const id = uuid();

			const f = (newEvents: ISessionMessageData[]) => {
				for (const o of newEvents) {
					if (!(o.command && o.command.method === id)) {
						continue;
					}

					this.off(rpcEvents.pong, f);
					resolve();
					return;
				}
			};

			this.on(rpcEvents.pong, f);
			this.send([rpcEvents.ping, {command: {method: id}}]);
		});
	}

	constructor (
		analyticsService: AnalyticsService,
		castleService: CastleService,
		channelService: ChannelService,
		envService: EnvService,
		errorService: ErrorService,
		potassiumService: PotassiumService,
		sessionInitService: SessionInitService,
		stringsService: StringsService,

		/** @ignore */
		private readonly accountService: AccountService,

		/** @ignore */
		private readonly accountContactsService: AccountContactsService,

		/** @ignore */
		private readonly accountDatabaseService: AccountDatabaseService,

		/** @ignore */
		private readonly accountSessionInitService: AccountSessionInitService,

		/** @ignore */
		private readonly accountUserLookupService: AccountUserLookupService,

		/** @ignore */
		private readonly dialogService: DialogService
	) {
		super(
			analyticsService,
			castleService,
			channelService,
			envService,
			errorService,
			potassiumService,
			sessionInitService,
			stringsService
		);

		this.on(rpcEvents.ping, async (newEvents: ISessionMessageData[]) => {
			for (const o of newEvents) {
				if (!o.command || !o.command.method) {
					continue;
				}

				await this.freezePong
					.pipe(
						filter(b => !b),
						take(1)
					)
					.toPromise();

				this.send([
					rpcEvents.pong,
					{command: {method: o.command.method}}
				]);
			}
		});
	}
}
