/* tslint:disable:max-file-line-count */

import {Injectable} from '@angular/core';
import {BehaviorSubject, Observable, of} from 'rxjs';
import {take} from 'rxjs/operators';
import {BaseProvider} from '../base-provider';
import {HandshakeSteps, IHandshakeState} from '../crypto/castle';
import {eventManager} from '../event-manager';
import {IAsyncList} from '../iasync-list';
import {IAsyncValue} from '../iasync-value';
import {LocalAsyncList} from '../local-async-list';
import {LocalAsyncValue} from '../local-async-value';
import {LockFunction} from '../lock-function-type';
import {MaybePromise} from '../maybe-promise-type';
import {
	BinaryProto,
	ISessionMessage,
	ISessionMessageData as ISessionMessageDataInternal,
	ISessionMessageList,
	SessionMessageList
} from '../proto';
import {ISessionService} from '../service-interfaces/isession.service';
import {
	CastleEvents,
	events,
	ISessionMessageAdditionalData,
	ISessionMessageData,
	ProFeatures,
	rpcEvents
} from '../session';
import {filterUndefined} from '../util/filter';
import {normalize} from '../util/formatting';
import {getOrSetDefault} from '../util/get-or-set-default';
import {lockFunction} from '../util/lock';
import {debugLog} from '../util/log';
import {deserialize, serialize} from '../util/serialization';
import {getTimestamp} from '../util/time';
import {uuid} from '../util/uuid';
import {resolvable} from '../util/wait';
import {AnalyticsService} from './analytics.service';
import {ChannelService} from './channel.service';
import {CastleService} from './crypto/castle.service';
import {PotassiumService} from './crypto/potassium.service';
import {EnvService} from './env.service';
import {ErrorService} from './error.service';
import {SessionInitService} from './session-init.service';
import {StringsService} from './strings.service';


/**
 * Manages a session.
 */
@Injectable()
export abstract class SessionService extends BaseProvider implements ISessionService {
	/** @ignore */
	private readonly _OPENED					= resolvable(true);

	/** @ignore */
	private readonly _SYMMETRIC_KEY				= resolvable<Uint8Array>();

	/** @ignore */
	private readonly correctSubSession			= (message: ISessionMessage) : boolean =>
		(message.data.sessionSubID || undefined) === this.sessionSubID
	/* tslint:disable-next-line:semicolon */
	;

	/** @ignore */
	private readonly openEvents: Set<string>	= new Set();

	/** @ignore */
	protected readonly eventID: string									= uuid();

	/** @ignore */
	protected incomingMessageQueue: IAsyncList<ISessionMessageList>		= new LocalAsyncList();

	/** @ignore */
	protected incomingMessageQueueLock: LockFunction					= lockFunction();

	/** @ignore */
	protected lastIncomingMessageTimestamps: Map<string, number>		= new Map();

	/** @ignore */
	protected readonly receivedMessages: Set<string>					= new Set<string>();

	/** @ignore */
	protected readonly resolveOpened: () => void						= this._OPENED.resolve;

	/** @ignore */
	protected resolveSymmetricKey?: (symmetricKey: Uint8Array) => void	=
		this._SYMMETRIC_KEY.resolve
	;

	/**
	 * Session key for misc stuff like locking.
	 * TODO: Either change how AccountSessionService.setUser works or make this an observable.
	 */
	protected readonly symmetricKey: Promise<Uint8Array>				=
		this._SYMMETRIC_KEY.promise
	;

	/** @inheritDoc */
	public readonly apiFlags								= {
		disableP2P: !!(
			this.envService.environment.customBuild &&
			this.envService.environment.customBuild.config.disableP2P
		),
		modestBranding: false
	};

	/** @inheritDoc */
	public readonly appUsername: Observable<string>			= of('');

	/** @inheritDoc */
	public readonly closed: Promise<void>					= this.one<void>(events.closeChat);

	/** @inheritDoc */
	public readonly connected: Promise<void>				= this.one<void>(events.connect);

	/** @inheritDoc */
	public readonly cyphNotFound: Promise<void>				= this.one<void>(events.cyphNotFound);

	/** @inheritDoc */
	public readonly freezePong: BehaviorSubject<boolean>	= new BehaviorSubject(false);

	/** @inheritDoc */
	public readonly localUsername: Observable<string>		= new BehaviorSubject<string>(
		this.stringsService.me
	);

	/** @ignore */
	public readonly opened: Promise<boolean>				= this._OPENED.promise;

	/** @inheritDoc */
	public readonly ready: Promise<void>					= Promise.resolve();

	/** @inheritDoc */
	public readonly remoteUsername: BehaviorSubject<string>	= new BehaviorSubject<string>(
		this.stringsService.friend
	);

	/** @see ISessionMessageData.sessionSubID */
	public sessionSubID?: string;

	/** @inheritDoc */
	public readonly state									= {
		cyphID: new BehaviorSubject(''),
		isAlice: new BehaviorSubject(false),
		isAlive: new BehaviorSubject(true),
		sharedSecret: new BehaviorSubject(''),
		startingNewCyph: new BehaviorSubject<boolean|undefined>(false),
		wasInitiatedByAPI: new BehaviorSubject(false)
	};

	/** Sends messages through Castle. */
	protected async castleSendMessages (messages: ISessionMessage[]) : Promise<void> {
		if (messages.length < 1) {
			return;
		}

		await this.castleService.send(
			await serialize(SessionMessageList, {messages}),
			messages[0].data.timestamp
		);
	}

	/** @see IChannelHandlers.onClose */
	protected async channelOnClose () : Promise<void> {
		this.destroy();
	}

	/** @see IChannelHandlers.onConnect */
	protected async channelOnConnect () : Promise<void> {
		await this.trigger(events.connect);
	}

	/** @see IChannelHandlers.onMessage */
	protected async channelOnMessage (message: Uint8Array) : Promise<void> {
		if (this.state.isAlive.value) {
			await this.castleService.receive(message);
		}
	}

	/** @see IChannelHandlers.onOpen */
	protected async channelOnOpen (isAlice: boolean) : Promise<void> {
		this.state.isAlice.next(isAlice);
		this.resolveOpened();
	}

	/** @ignore */
	protected async cyphertextReceiveHandler (messages: ISessionMessage[]) : Promise<void> {
		debugLog(() => ({cyphertextReceiveHandler: {messages}}));

		const messageGroups				= new Map<string, ISessionMessageDataInternal[]>();

		const otherSubSessionMessages	=
			messages.filter(message => !this.correctSubSession(message))
		;

		if (otherSubSessionMessages.length > 0) {
			await this.incomingMessageQueue.pushItem({messages: otherSubSessionMessages});
		}

		await Promise.all(messages.filter(this.correctSubSession).map(async message => {
			if (!message.data.id || this.receivedMessages.has(message.data.id)) {
				return;
			}

			message.data	= await this.processMessageData(message.data);

			this.receivedMessages.add(message.data.id);

			if (message.event && message.event in rpcEvents) {
				getOrSetDefault(messageGroups, message.event, () => []).push(message.data);
			}
		}));

		await Promise.all(Array.from(messageGroups.entries()).map(async ([event, data]) =>
			this.trigger(event, data)
		));
	}

	/** @ignore */
	protected async cyphertextSendHandler (message: Uint8Array) : Promise<void> {
		await this.channelService.send(message);

		this.analyticsService.sendEvent({
			eventAction: 'sent',
			eventCategory: 'message',
			eventValue: 1,
			hitType: 'event'
		});
	}

	/** @ignore */
	protected async getSessionMessageAuthor (
		_MESSAGE: ISessionMessageDataInternal
	) : Promise<Observable<string>|void> {}

	/** @ignore */
	protected async newMessages (
		messages: [
			string,
			ISessionMessageAdditionalData|(
				(timestamp: number) => MaybePromise<ISessionMessageAdditionalData>
			)
		][]
	) : Promise<(ISessionMessage&{data: ISessionMessageData})[]> {
		return Promise.all(messages.map(async message => {
			const timestamp		= await getTimestamp();
			const event			= message[0];
			let additionalData	= message[1];

			if (typeof additionalData === 'function') {
				additionalData	= await additionalData(timestamp);
			}

			return {
				data: {
					author: this.localUsername,
					bytes: additionalData.bytes,
					capabilities: additionalData.capabilities,
					chatState: additionalData.chatState,
					command: additionalData.command,
					id: additionalData.id || uuid(),
					sessionSubID: this.sessionSubID,
					text: additionalData.text,
					textConfirmation: additionalData.textConfirmation,
					timestamp
				},
				event
			};
		}));
	}

	/** @ignore */
	protected async plaintextSendHandler (messages: ISessionMessage[]) : Promise<void> {
		await this.castleSendMessages(messages);
	}

	/** @inheritDoc */
	public async castleHandler (
		event: CastleEvents,
		data?: Uint8Array|{
			author: Observable<string>;
			instanceID: string;
			plaintext: Uint8Array;
			timestamp: number;
		}
	) : Promise<void> {
		switch (event) {
			case CastleEvents.abort:
				this.state.sharedSecret.next('');
				this.errorService.log('CYPH AUTHENTICATION FAILURE');
				this.trigger(events.connectFailure);
				break;

			case CastleEvents.connect:
				this.state.sharedSecret.next('');
				this.trigger(events.beginChat);

				if (!this.resolveSymmetricKey) {
					return;
				}

				if (this.state.isAlice.value) {
					const potassiumService	= this.potassiumService;
					const symmetricKey		= potassiumService.randomBytes(
						await potassiumService.secretBox.keyBytes
					);
					this.resolveSymmetricKey(symmetricKey);
					this.send([rpcEvents.symmetricKey, {bytes: symmetricKey}]);
				}
				else {
					this.resolveSymmetricKey(
						(
							(await this.one<ISessionMessageData[]>(rpcEvents.symmetricKey))[0] ||
							{bytes: undefined}
						).bytes ||
						new Uint8Array(0)
					);
				}

				break;

			case CastleEvents.receive:
				if (!data || data instanceof Uint8Array) {
					break;
				}

				const castleInstanceID	= data.instanceID;
				const castleTimestamp	= data.timestamp;

				const messages	=
					(
						await (async () =>
							(
								await deserialize(SessionMessageList, data.plaintext)
							).messages
						)().catch(() => undefined)
					) ||
					[]
				;

				const authorID	= normalize(await data.author.pipe(take(1)).toPromise());

				await this.cyphertextReceiveHandler(filterUndefined(messages.map(message => {
					/* Discard messages without valid timestamps */
					if (
						isNaN(message.data.timestamp) ||
						message.data.timestamp > castleTimestamp ||
						message.data.timestamp < (
							this.lastIncomingMessageTimestamps.get(castleInstanceID) || 0
						)
					) {
						return;
					}

					this.lastIncomingMessageTimestamps.set(
						castleInstanceID,
						message.data.timestamp
					);

					(<any> message.data).author			= data.author;
					message.data.authorID				= authorID;

					return message;
				})));

				break;

			case CastleEvents.send:
				if (!data || !(data instanceof Uint8Array)) {
					break;
				}

				await this.cyphertextSendHandler(data);
		}
	}

	/** @inheritDoc */
	public close () : void {
		this.channelService.close();
	}

	/** @inheritDoc */
	public async destroy () : Promise<void> {
		if (!this.state.isAlive.value) {
			return;
		}

		this.state.isAlive.next(false);
		this.trigger(events.closeChat);

		for (const event of Array.from(this.openEvents)) {
			this.off(event);
		}

		this.channelService.destroy();
	}

	/** @inheritDoc */
	public async handshakeState (
		currentStep: IAsyncValue<HandshakeSteps> =
			new LocalAsyncValue(HandshakeSteps.Start)
		,
		initialSecret: IAsyncValue<Uint8Array|undefined> =
			new LocalAsyncValue<Uint8Array|undefined>(undefined)
	) : Promise<IHandshakeState> {
		await this.opened;

		/* First person to join ephemeral session is "Bob" as optimization for Castle handshake */
		const isAlice	=
			this.sessionInitService.ephemeral ?
				!this.state.isAlice.value :
				this.state.isAlice.value
		;

		return {
			currentStep,
			initialSecret,
			initialSecretCyphertext: await this.channelService.getAsyncValue(
				'handshake/initialSecretCyphertext',
				BinaryProto,
				true,
				this.subscriptions
			),
			isAlice,
			localPublicKey: await this.channelService.getAsyncValue(
				`handshake/${isAlice ? 'alice' : 'bob'}PublicKey`,
				BinaryProto,
				true,
				this.subscriptions
			),
			remotePublicKey: await this.channelService.getAsyncValue(
				`handshake/${isAlice ? 'bob' : 'alice'}PublicKey`,
				BinaryProto,
				true,
				this.subscriptions
			)
		};
	}

	/** @inheritDoc */
	public async init (channelID?: string, userID?: string) : Promise<void> {
		this.incomingMessageQueueLock(async o => {
			const sub	= this.incomingMessageQueue.subscribeAndPop(async ({messages}) => {
				if (!messages || messages.length < 1) {
					return;
				}
				else if (!this.correctSubSession(messages[0])) {
					throw new Error('Different sub-session.');
				}
				else {
					await this.cyphertextReceiveHandler(messages);
				}
			});

			await Promise.race([this.closed, o.stillOwner.toPromise()]);
			sub.unsubscribe();
		});

		await Promise.all([
			this.castleService.init(this.potassiumService, this),
			this.channelService.init(channelID, userID, {
				onClose: async () => this.channelOnClose(),
				onConnect: async () => this.channelOnConnect(),
				onMessage: async (message: Uint8Array) => this.channelOnMessage(message),
				onOpen: async (isAlice: boolean) => this.channelOnOpen(isAlice)
			})
		]);
	}

	/** @inheritDoc */
	public async lock<T> (
		f: (o: {reason?: string; stillOwner: BehaviorSubject<boolean>}) => Promise<T>,
		reason?: string
	) : Promise<T> {
		return this.channelService.lock(
			async o => {
				if (o.reason) {
					o.reason	= this.potassiumService.toString(
						await this.potassiumService.secretBox.open(
							this.potassiumService.fromBase64(o.reason),
							await this.symmetricKey
						)
					);
				}

				return f(o);
			},
			!reason ? undefined : this.potassiumService.toBase64(
				await this.potassiumService.secretBox.seal(
					this.potassiumService.fromString(reason),
					await this.symmetricKey
				)
			)
		);
	}

	/** @inheritDoc */
	public off<T> (event: string, handler?: (data: T) => void) : void {
		eventManager.off<T>(event + this.eventID, handler);
	}

	/** @inheritDoc */
	public on<T> (event: string, handler: (data: T) => void) : void {
		this.openEvents.add(event);
		eventManager.on<T>(event + this.eventID, handler);
	}

	/** @inheritDoc */
	public async one<T> (event: string) : Promise<T> {
		this.openEvents.add(event);
		return eventManager.one<T>(event + this.eventID);
	}

	/** @inheritDoc */
	public async processMessageData (
		data: ISessionMessageDataInternal
	) : Promise<ISessionMessageData> {
		const author	= await this.getSessionMessageAuthor(data);
		if (author) {
			(<any> data).author	= author;
		}
		return <any> data;
	}

	/** @inheritDoc */
	public get proFeatures () : ProFeatures {
		return new ProFeatures();
	}

	/** @inheritDoc */
	public async send (
		...messages: [
			string,
			ISessionMessageAdditionalData|(
				(timestamp: number) => MaybePromise<ISessionMessageAdditionalData>
			)
		][]
	) : Promise<{
		confirmPromise: Promise<void>;
		newMessages: (ISessionMessage&{data: ISessionMessageData})[];
	}> {
		const newMessages	= await this.newMessages(messages);

		return {
			confirmPromise: this.plaintextSendHandler(newMessages),
			newMessages
		};
	}

	/** @inheritDoc */
	public spawn () : SessionService {
		throw new Error('Must provide an implementation of SessionService.spawn.');
	}

	/** @inheritDoc */
	public async trigger (event: string, data?: any) : Promise<void> {
		await eventManager.trigger(event + this.eventID, data);
	}

	/** @inheritDoc */
	public async yt () : Promise<void> {}

	constructor (
		/** @ignore */
		protected readonly analyticsService: AnalyticsService,

		/** @ignore */
		protected readonly castleService: CastleService,

		/** @ignore */
		protected readonly channelService: ChannelService,

		/** @ignore */
		protected readonly envService: EnvService,

		/** @ignore */
		protected readonly errorService: ErrorService,

		/** @ignore */
		protected readonly potassiumService: PotassiumService,

		/** @ignore */
		protected readonly sessionInitService: SessionInitService,

		/** @ignore */
		protected readonly stringsService: StringsService
	) {
		super();

		this.sessionInitService.sessionService.resolve(this);
	}
}
