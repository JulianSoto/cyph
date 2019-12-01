/* eslint-disable max-lines */

import {Inject, Injectable, Optional} from '@angular/core';
import memoize from 'lodash-es/memoize';
import * as msgpack from 'msgpack-lite';
import {BehaviorSubject, combineLatest, interval, Observable} from 'rxjs';
import {filter, map, mergeMap, take, takeWhile} from 'rxjs/operators';
import {UserLike} from '../account/user-like-type';
import {BaseProvider} from '../base-provider';
import {
	ChatMessage,
	IChatData,
	IChatMessageInput,
	IChatMessageLiveValue,
	States
} from '../chat';
import {HelpComponent} from '../components/help';
import {EncryptedAsyncMap} from '../crypto/encrypted-async-map';
import {IAsyncSet} from '../iasync-set';
import {IProto} from '../iproto';
import {IResolvable} from '../iresolvable';
import {LocalAsyncList} from '../local-async-list';
import {LocalAsyncMap} from '../local-async-map';
import {LocalAsyncSet} from '../local-async-set';
import {LocalAsyncValue} from '../local-async-value';
import {LockFunction} from '../lock-function-type';
import {MaybePromise} from '../maybe-promise-type';
import {
	BinaryProto,
	ChatMessage as ChatMessageProto,
	ChatMessageLiveValueSerialized,
	ChatMessageValue,
	ChatPendingMessage,
	IChatLastConfirmedMessage,
	IChatMessage,
	IChatMessageLiveValueSerialized,
	IChatMessagePredecessor,
	IChatMessageValue,
	IChatPendingMessage,
	ISessionMessageDataList
} from '../proto';
import {
	events,
	ISessionMessageAdditionalData,
	ISessionMessageData,
	rpcEvents
} from '../session';
import {Timer} from '../timer';
import {filterUndefined, filterUndefinedOperator} from '../util/filter';
import {toBehaviorSubject} from '../util/flatten-observable';
import {normalize} from '../util/formatting';
import {getOrSetDefault} from '../util/get-or-set-default';
import {lock, lockFunction} from '../util/lock';
import {debugLog, debugLogTime} from '../util/log';
import {getTimestamp} from '../util/time';
import {uuid} from '../util/uuid';
import {resolvable, retryUntilSuccessful, sleep} from '../util/wait';
import {AnalyticsService} from './analytics.service';
import {ChannelService} from './channel.service';
import {CastleService} from './crypto/castle.service';
import {PotassiumService} from './crypto/potassium.service';
import {DatabaseService} from './database.service';
import {DialogService} from './dialog.service';
import {EnvService} from './env.service';
import {LocalStorageService} from './local-storage.service';
import {NotificationService} from './notification.service';
import {P2PWebRTCService} from './p2p-webrtc.service';
import {ScrollService} from './scroll.service';
import {SessionCapabilitiesService} from './session-capabilities.service';
import {SessionInitService} from './session-init.service';
import {SessionService} from './session.service';
import {StringsService} from './strings.service';

/**
 * Manages a chat.
 */
@Injectable()
export class ChatService extends BaseProvider {
	/** @ignore */
	private static readonly approximateKeyExchangeTime: number = 9000;

	/** @ignore */
	private static readonly p2pPassiveConnectTime: number = 5000;

	/** @ignore */
	private readonly fullyLoadedMessages = new Map<string, IResolvable<void>>();

	/** @ignore */
	private readonly getMessageLocks = new Map<string, {}>();

	/** @ignore */
	private readonly getMessageValues = memoize(
		(messageValuesURL: string) =>
			new EncryptedAsyncMap<IChatMessageValue>(
				this.potassiumService,
				messageValuesURL,
				ChatMessageValue,
				this.databaseService.getAsyncMap(
					messageValuesURL,
					BinaryProto,
					undefined,
					undefined,
					this.subscriptions
				)
			)
	);

	/** @ignore */
	private lastConfirmedMessageID?: string;

	/** @ignore */
	private readonly messageChangeLock: LockFunction = lockFunction();

	/** @ignore */
	private readonly messageConfirmLock: LockFunction = lockFunction();

	/** @ignore */
	private readonly messageInputQueues = {
		addMessage: <IChatMessageInput[]> [],
		addTextMessage: <ISessionMessageData[]> []
	};

	/** @ignore */
	private readonly messageSendInnerLock: LockFunction = lockFunction();

	/** @ignore */
	private readonly messageSendLock: LockFunction = lockFunction();

	/** IDs of fetched messages. */
	protected readonly fetchedMessageIDs = new LocalAsyncSet<string>();

	/** Local version of messageValues (ephemeral chat optimization). */
	protected readonly messageValuesLocal: EncryptedAsyncMap<
		IChatMessageValue
	> = new EncryptedAsyncMap<IChatMessageValue>(
		this.potassiumService,
		this.messageValuesURL,
		ChatMessageValue
	);

	/** Batch messages together that were sent within this interval. */
	protected readonly outgoingMessageBatchDelay: number = 1250;

	/** Queue of messages to be sent. */
	protected readonly outgoingMessageQueue: {
		messageData: [
			Promise<IChatMessage>,
			string,
			Promise<IChatMessagePredecessor[] | undefined>,
			Promise<Uint8Array>,
			boolean | undefined,
			number | undefined,
			IChatMessageValue
		];
		resolve: () => void;
	}[] = [];

	/** @see IChatData */
	public readonly chatSubject = new BehaviorSubject(
		this.getDefaultChatData()
	);

	/** Indicates whether the chat is self-destructing. */
	public readonly chatSelfDestruct = new BehaviorSubject<boolean>(false);

	/** Indicates whether the chat is self-destructed. */
	public readonly chatSelfDestructed = new BehaviorSubject<boolean>(false);

	/** Indicates whether the chat self-destruction effect should be running. */
	public readonly chatSelfDestructEffect = new BehaviorSubject<boolean>(
		false
	);

	/** Time in seconds until chat self-destructs. */
	public readonly chatSelfDestructTimeout = new BehaviorSubject<number>(5);

	/** Timer for chat self-destruction. */
	public readonly chatSelfDestructTimer = new BehaviorSubject<
		Timer | undefined
	>(undefined);

	/** Indicates whether delivery receipts are enabled. */
	public readonly deliveryReceipts = this.sessionInitService.ephemeral;

	/** Indicates whether the chat is ready to be displayed. */
	public readonly initiated = new BehaviorSubject<boolean>(false);

	/** Number of "pages" into the message list, starting from the bottom. */
	public readonly messageBottomOffset = new BehaviorSubject<number>(1);

	/** List of messages. */
	public readonly messages = toBehaviorSubject(
		this.chatSubject.pipe(
			mergeMap(chat =>
				chat.messageList.watchFlat(true).pipe(
					mergeMap(async messageIDs => {
						const [messages, now] = await Promise.all([
							Promise.all(
								messageIDs.map(async id =>
									chat.messages.getItem(id).catch(() => ({
										authorType: ChatMessage.AuthorTypes.App,
										hash: new Uint8Array(1),
										id,
										key: new Uint8Array(1),
										predecessors: [],
										timestamp: NaN
									}))
								)
							),
							getTimestamp()
						]);

						for (let i = 0; i < messages.length; ++i) {
							const message = messages[i];

							if (!isNaN(message.timestamp)) {
								continue;
							}

							for (let j = i - 1; j >= 0; --j) {
								if (isNaN(messages[j].timestamp)) {
									continue;
								}

								message.timestamp =
									messages[j].timestamp + 0.001;
								break;
							}

							if (isNaN(message.timestamp)) {
								for (let j = i + 1; j < messages.length; ++j) {
									if (isNaN(messages[j].timestamp)) {
										continue;
									}

									message.timestamp =
										messages[j].timestamp - 0.001;
								}
							}

							if (isNaN(message.timestamp)) {
								message.timestamp = now;
							}

							messages[i] = new ChatMessage(
								message,
								this.sessionService.appUsername
							);
						}

						return messages;
					})
				)
			)
		),
		undefined,
		this.subscriptions
	);

	/** @see P2PService */
	public readonly p2pService = resolvable<{
		isActive: BehaviorSubject<boolean>;
		isSidebarOpen: BehaviorSubject<boolean>;
	}>();

	/** Remote User object where applicable. */
	public readonly remoteUser = new BehaviorSubject<UserLike | undefined>(
		undefined
	);

	/** Sub-resolvables of uiReady. */
	public readonly resolvers = {
		chatConnected: resolvable(),
		currentMessageSynced: resolvable(),
		messageListLoaded: resolvable(),
		outgoingMessagesSynced: resolvable()
	};

	/** Indicates whether an infinite scroll transition is in progress. */
	public readonly scrollTransition = new BehaviorSubject<boolean>(false);

	/** Resolves when UI is ready to be displayed. */
	public readonly uiReady: Promise<true> = Promise.all([
		this.resolvers.chatConnected.promise,
		this.resolvers.currentMessageSynced.promise,
		this.resolvers.messageListLoaded.promise,
		this.resolvers.outgoingMessagesSynced.promise,
		this.sessionService.initialMessagesProcessed.promise,
		this.castleService ?
			this.castleService.initialMessagesProcessed() :
			undefined,
		this.channelService ?
			this.channelService.initialMessagesProcessed.promise :
			undefined
	]).then<true>(() => true);

	/** Indicates whether "walkie talkie" mode is enabled for calls. */
	public readonly walkieTalkieMode = new BehaviorSubject<boolean>(false);

	/** @ignore */
	private async addTextMessage (
		...textMessageInputs: ISessionMessageData[]
	) : Promise<void> {
		this.messageInputQueues.addTextMessage.push(...textMessageInputs);
		await sleep(this.outgoingMessageBatchDelay);
		textMessageInputs = this.messageInputQueues.addTextMessage.splice(
			0,
			this.messageInputQueues.addTextMessage.length
		);

		if (textMessageInputs.length < 1) {
			return;
		}

		const messageInputs = filterUndefined(
			await Promise.all(
				textMessageInputs.map(async o => {
					if (!o.text) {
						return;
					}

					if (o.author !== this.sessionService.localUsername) {
						const unobservedPredecessors =
							o.text.predecessors &&
							o.text.predecessors.length > 0 ?
								(await Promise.all(
									o.text.predecessors.map(
										async predecessor => ({
											hasValidHash: await this.messageHasValidHash(
												predecessor.id,
												predecessor.hash
											),
											predecessor
										})
									)
								))
									.filter(
										unobservedPredecessor =>
											!unobservedPredecessor.hasValidHash
									)
									.map(
										unobservedPredecessor =>
											unobservedPredecessor.predecessor
									) :
								undefined;

						if (
							unobservedPredecessors &&
							unobservedPredecessors.length > 0
						) {
							return this.chat.futureMessages.updateItem(
								unobservedPredecessors[0].id,
								async futureMessages => ({
									messages:
										futureMessages &&
										futureMessages.messages ?
											futureMessages.messages.concat(o) :
											[o]
								})
							);
						}

						if (this.deliveryReceipts) {
							this.lastConfirmedMessageID = o.id;

							this.messageConfirmLock(async () => {
								if (this.lastConfirmedMessageID !== o.id) {
									return;
								}

								await this.sessionService.send([
									rpcEvents.confirm,
									{textConfirmation: {id: o.id}}
								]);

								await sleep(this.outgoingMessageBatchDelay);
							});
						}
					}

					const selfDestructChat = !!(
						o.text.selfDestructChat &&
						(o.text.selfDestructTimeout !== undefined &&
							!isNaN(o.text.selfDestructTimeout) &&
							o.text.selfDestructTimeout > 0) &&
						(await (async () => {
							const messageIDs = await this.chat.messageList.getFlatValue();

							return (
								messageIDs.length === 0 ||
								(messageIDs.length === 1 &&
									(await this.chat.messages.getItem(
										messageIDs[0]
									)).authorType ===
										ChatMessage.AuthorTypes.App)
							);
						})())
					);

					if (selfDestructChat && o.text.selfDestructTimeout) {
						this.chatSelfDestruct.next(true);

						this.chat.messageList
							.watchFlat(true)
							.pipe(map(messageIDs => messageIDs.length === 0))
							/* eslint-disable-next-line @typescript-eslint/tslint/config */
							.subscribe(this.chatSelfDestructed);

						this.chatSelfDestructTimer.next(
							new Timer(o.text.selfDestructTimeout)
						);
					}

					return {
						author: o.author,
						hash: o.text.hash,
						id: o.id,
						key: o.text.key,
						predecessors: o.text.predecessors,
						selfDestructChat,
						selfDestructTimeout: selfDestructChat ?
							undefined :
							o.text.selfDestructTimeout,
						timestamp: o.timestamp
					};
				})
			)
		);

		if (messageInputs.length < 1) {
			return;
		}

		await this.addMessage(...messageInputs);

		await Promise.all(
			messageInputs.map(async o => {
				if (o.author !== this.sessionService.localUsername) {
					await this.chat.futureMessages.updateItem(
						o.id,
						async futureMessages => {
							if (futureMessages && futureMessages.messages) {
								await Promise.all(
									futureMessages.messages.map(
										async futureMessage =>
											this.addTextMessage(
												await this.sessionService.processMessageData(
													futureMessage
												)
											)
									)
								);
							}

							return undefined;
						}
					);
				}

				if (!(o.selfDestructChat && this.chatSelfDestructTimer.value)) {
					return;
				}

				await this.chatSelfDestructTimer.value.start();
				this.chatSelfDestructEffect.next(true);
				await sleep(500);

				await Promise.all([
					this.chat.messages.clear(),
					this.chat.messageList.clear(),
					sleep(1000)
				]);

				this.chatSelfDestructEffect.next(false);

				if (o.author !== this.sessionService.localUsername) {
					await this.close();
				}
			})
		);
	}

	/** This kills the chat. */
	private async close () : Promise<void> {
		/* eslint-disable-next-line @typescript-eslint/tslint/config */
		this.ngOnDestroy();

		if (!this.sessionInitService.ephemeral) {
			this.sessionService.close();
			return;
		}

		if (this.chat.state === States.aborted) {
			return;
		}

		this.dialogService.dismissToast();
		this.chat.isFriendTyping.next(false);
		this.scrollService.scrollDown();

		if (!this.chat.isConnected) {
			await this.abortSetup();
		}
		else if (!this.chat.isDisconnected) {
			this.chat.isDisconnected = true;
			this.updateChat();

			if (!this.chatSelfDestruct.value) {
				this.addMessage({
					value: this.stringsService.disconnectNotification
				});
			}

			this.sessionService.close();
		}
	}

	/** @ignore */
	private async messageHasValidHash (
		message: IChatMessage | string | undefined,
		expectedHash?: Uint8Array
	) : Promise<boolean> {
		if (typeof message === 'string') {
			message = await this.chat.messages
				.getItem(message)
				.catch(() => undefined);
		}

		if (message && message.id && message.hash && message.hash.length > 0) {
			await this.getMessageValue(message);

			return (
				message.value !== undefined &&
				(expectedHash === undefined ||
					this.potassiumService.compareMemory(
						message.hash,
						expectedHash
					))
			);
		}

		return false;
	}

	/** @ignore */
	private messageValueHasher (
		message: IChatMessage
	) : {
		proto: IProto<IChatMessage>;
		transform: (value: IChatMessageValue) => IChatMessage;
	} {
		return {
			proto: ChatMessageProto,
			transform: value => ({
				...message,
				authorID:
					message.authorID &&
					this.remoteUser.value &&
					!this.remoteUser.value.anonymous ?
						message.authorID :
						'',
				authorType: ChatMessage.AuthorTypes.App,
				hash: undefined,
				key: undefined,
				selfDestructTimeout: message.selfDestructTimeout || 0,
				sessionSubID: message.sessionSubID || '',
				value
			})
		};
	}

	/** @ignore */
	private get messageValuesURL () : string {
		return `messageValues${
			this.sessionInitService.ephemeral ? 'Ephemeral' : ''
		}`;
	}

	/** @ignore */
	private async processOutgoingMessages () : Promise<void> {
		await this.messageSendLock(async () => {
			if (this.outgoingMessageQueue.length < 1) {
				return;
			}

			const outgoingMessages = this.outgoingMessageQueue.splice(
				0,
				this.outgoingMessageQueue.length
			);

			debugLogTime(() => 'Chat Message Send: session send');

			const {
				confirmPromise,
				newMessages
			} = await this.sessionService.send(
				...outgoingMessages.map(({messageData}) : [
					string,
					(
						timestamp: number
					) => Promise<ISessionMessageAdditionalData>
				] => [
					rpcEvents.text,
					async timestamp => {
						const [
							chatMessage,
							id,
							predecessors,
							key,
							selfDestructChat,
							selfDestructTimeout,
							value
						] = await Promise.all(messageData);

						debugLogTime(
							() => 'Chat Message Send: hashing message'
						);

						const hash = await this.messageValues.getItemHash(
							id,
							key,
							this.messageValueHasher({
								...chatMessage,
								authorType: ChatMessage.AuthorTypes.App,
								predecessors,
								timestamp
							}),
							value
						);

						debugLogTime(() => 'Chat Message Send: hashed message');

						return {
							id,
							text: {
								hash,
								key,
								predecessors,
								selfDestructChat,
								selfDestructTimeout
							}
						};
					}
				])
			);

			debugLogTime(() => 'Chat Message Send: acquiring lock');

			this.messageSendInnerLock(async () => {
				debugLogTime(() => 'Chat Message Send: lock acquired');

				return confirmPromise.then(async () => {
					debugLogTime(
						() => 'Chat Message Send: confirmPromise resolved'
					);

					await this.addTextMessage(
						...newMessages.map(({data}) => data)
					);

					debugLogTime(() => 'Chat Message Send: done');

					for (const outgoingMessage of outgoingMessages) {
						outgoingMessage.resolve();
					}
				});
			});

			await sleep(this.outgoingMessageBatchDelay);
		});
	}

	/** Gets author ID for including in message list item. */
	protected async getAuthorID (
		author: Observable<string>
	) : Promise<string | undefined> {
		return author === this.sessionService.remoteUsername ?
			author
				.pipe(take(1))
				.toPromise()
				.then(normalize)
				.catch(() => undefined) :
			undefined;
	}

	/** Gets default chat data. */
	protected getDefaultChatData () : IChatData {
		return {
			currentMessage: {},
			futureMessages: new LocalAsyncMap<
				string,
				ISessionMessageDataList
			>(),
			initProgress: new BehaviorSubject(0),
			isConnected: false,
			isDisconnected: false,
			isFriendTyping: new BehaviorSubject<boolean>(false),
			isMessageChanged: false,
			lastConfirmedMessage: new LocalAsyncValue({id: '', index: 0}),
			lastUnreadMessage: Promise.resolve(undefined),
			messageList: new LocalAsyncList<string[]>(),
			messages: new LocalAsyncMap<string, IChatMessage>(),
			pendingMessages: new LocalAsyncList<
				IChatMessage & {pending: true}
			>(),
			receiveTextLock: lockFunction(),
			state: States.none,
			unconfirmedMessages: new BehaviorSubject<
				{[id: string]: boolean | undefined} | undefined
			>(undefined)
		};
	}

	/** Gets async set for scrollService.unreadMessages. */
	protected getScrollServiceUnreadMessages () : MaybePromise<
		IAsyncSet<string>
	> {
		return new LocalAsyncSet<string>();
	}

	/** Global map of message IDs to values. */
	protected get messageValues () : EncryptedAsyncMap<IChatMessageValue> {
		return this.getMessageValues(this.messageValuesURL);
	}

	/** Aborts the process of chat initialisation and authentication. */
	public async abortSetup () : Promise<void> {
		this.chat.state = States.aborted;
		this.updateChat();
		this.sessionService.trigger(events.abort);
		this.sessionService.close();
		await this.dialogService.dismissToast();
	}

	/** Adds a message to the chat. */
	public async addMessage (
		...messageInputs: IChatMessageInput[]
	) : Promise<void> {
		this.messageInputQueues.addMessage.push(...messageInputs);
		await sleep(this.outgoingMessageBatchDelay);
		messageInputs = this.messageInputQueues.addMessage.splice(
			0,
			this.messageInputQueues.addMessage.length
		);

		if (messageInputs.length < 1) {
			return;
		}

		debugLogTime(() => 'Chat Message Add: start');

		const newMessages = filterUndefined(
			await Promise.all(
				messageInputs.map(
					/* eslint-disable-next-line complexity */
					async ({
						author,
						hash,
						id,
						key,
						predecessors,
						selfDestructTimeout,
						shouldNotify,
						timestamp,
						value
					}) => {
						if (author === undefined) {
							author = this.sessionService.appUsername;
						}
						if (id === undefined) {
							id = uuid(true);
						}
						if (shouldNotify === undefined) {
							shouldNotify =
								author !== this.sessionService.localUsername;
						}
						if (timestamp === undefined) {
							timestamp = await getTimestamp();
						}

						const messageValues =
							this.sessionInitService.ephemeral &&
							author === this.sessionService.appUsername ?
								this.messageValuesLocal :
								this.messageValues;

						if (typeof value === 'string') {
							value = {text: value};
						}

						if (
							(value !== undefined &&
								!(
									value.calendarInvite ||
									value.form ||
									(value.quill && value.quill.length > 0) ||
									value.text
								)) ||
							this.chat.state === States.aborted ||
							(author !== this.sessionService.appUsername &&
								this.chat.isDisconnected)
						) {
							return;
						}

						while (
							author !== this.sessionService.appUsername &&
							!this.chat.isConnected
						) {
							await sleep(500);
						}

						if (shouldNotify) {
							if (author !== this.sessionService.appUsername) {
								if (this.sessionInitService.ephemeral) {
									this.notificationService.notify(
										this.stringsService
											.newMessageNotification
									);
								}
							}
							else if (value && value.text) {
								this.notificationService.notify(value.text);
							}
						}

						debugLogTime(
							() => 'Chat Message Add: getting author ID'
						);

						const authorID = await this.getAuthorID(author);

						debugLogTime(() => 'Chat Message Add: got author ID');

						const chatMessage: IChatMessage = {
							authorID,
							authorType:
								author === this.sessionService.appUsername ?
									ChatMessage.AuthorTypes.App :
								author === this.sessionService.localUsername ?
									ChatMessage.AuthorTypes.Local :
									ChatMessage.AuthorTypes.Remote,
							id,
							predecessors,
							selfDestructTimeout,
							sessionSubID: this.sessionService.sessionSubID,
							timestamp
						};

						if (value) {
							debugLogTime(
								() =>
									'Chat Message Add: setting global message value'
							);

							const o = await messageValues.setItem(
								id,
								value,
								this.messageValueHasher(chatMessage)
							);

							debugLogTime(
								() =>
									'Chat Message Add: set global message value'
							);

							hash = await o.getHash();
							key = o.encryptionKey;

							debugLogTime(() => 'Chat Message Add: hashed');
						}

						chatMessage.hash = hash;
						chatMessage.key = key;

						if (
							this.sessionInitService.ephemeral &&
							author === this.sessionService.remoteUsername
						) {
							const p2pService = await this.p2pService.promise;

							await this.scrollService.trackItem(
								id,
								p2pService.isActive.value &&
									!p2pService.isSidebarOpen.value
							);
						}

						return {
							chatMessage,
							setPromise: this.chat.messages
								.setItem(id, chatMessage)
								.then(async () =>
									this.getMessageValue(chatMessage)
								)
						};
					}
				)
			)
		);

		if (newMessages.length < 1) {
			return;
		}

		debugLogTime(() => 'Chat Message Add: pushing message IDs');

		const pendingMessageRoot = this.chat.pendingMessageRoot;

		await Promise.all([
			Promise.all(newMessages.map(async o => o.setPromise)),
			this.chat.messageList
				.pushItem(newMessages.map(({chatMessage}) => chatMessage.id))
				.then(async () =>
					Promise.all([
						...(!pendingMessageRoot ?
							[] :
							messageInputs.map(async ({author, id}) => {
								if (
									author !==
										this.sessionService.localUsername ||
									!pendingMessageRoot
								) {
									return;
								}

								await this.localStorageService.removeItem(
									`${pendingMessageRoot}/${id}`
								);
							}))
					])
				)
		]);

		debugLogTime(() => 'Chat Message Add: pushed message IDs');

		await Promise.all(
			newMessages.map(async ({chatMessage}) => {
				if (
					!(
						chatMessage.hash &&
						chatMessage.key &&
						chatMessage.selfDestructTimeout !== undefined &&
						!isNaN(chatMessage.selfDestructTimeout) &&
						chatMessage.selfDestructTimeout > 0
					)
				) {
					return;
				}

				await sleep(chatMessage.selfDestructTimeout + 10000);

				this.potassiumService.clearMemory(chatMessage.hash);
				this.potassiumService.clearMemory(chatMessage.key);

				chatMessage.hash = undefined;
				chatMessage.key = undefined;

				await this.chat.messages.setItem(chatMessage.id, chatMessage);
			})
		);

		debugLogTime(() => 'Chat Message Add: done');
	}

	/** Begins chat. */
	public async begin () : Promise<void> {
		if (this.chat.state === States.aborted) {
			return;
		}

		/* Workaround for Safari bug that breaks initiating a new chat */
		this.sessionService.send([rpcEvents.ping, {}]);

		if (this.chat.queuedMessage) {
			this.send(
				undefined,
				{text: this.chat.queuedMessage},
				this.chatSelfDestruct.value ?
					this.chatSelfDestructTimeout.value * 1000 :
					undefined,
				this.chatSelfDestruct.value
			);
		}

		if (this.sessionInitService.ephemeral) {
			this.notificationService.notify(
				this.stringsService.connectedNotification
			);

			this.initProgressFinish();
			this.chat.state = States.chatBeginMessage;
			this.updateChat();

			await sleep(3000);

			if (<States> this.chat.state === States.aborted) {
				return;
			}

			this.sessionService.trigger(events.beginChatComplete);

			this.chat.state = States.chat;
			this.updateChat();

			if (this.envService.pro.value) {
				for (let i = 0; i < 15; ++i) {
					if (this.chatSelfDestruct.value) {
						break;
					}

					await sleep(100);
				}
			}

			if (!this.chatSelfDestruct.value) {
				this.addMessage({
					shouldNotify: false,
					timestamp: (await getTimestamp()) - 30000,
					value: this.stringsService.introductoryMessage
				});
			}

			this.initiated.next(true);
			this.resolvers.chatConnected.resolve();
		}

		this.chat.isConnected = true;
		this.updateChat();
	}

	/** @see ChatService.chatSubject */
	public get chat () : IChatData {
		return this.chatSubject.value;
	}

	/** After confirmation dialog, this kills the chat. */
	public async disconnectButton (
		beforeClose?: () => MaybePromise<void>
	) : Promise<void> {
		if (
			!(await this.dialogService.confirm({
				cancel: this.stringsService.cancel,
				content: this.stringsService.disconnectConfirm,
				ok: this.stringsService.continueDialogAction,
				title: this.stringsService.disconnectTitle
			}))
		) {
			return;
		}

		if (beforeClose) {
			await beforeClose();
		}

		await this.close();
	}

	/** Gets message value if not already set. */
	public async getMessageValue (
		message: IChatMessage,
		tryInitFromLocalStorage: boolean = false
	) : Promise<IChatMessage> {
		if (message.value !== undefined) {
			return message;
		}

		return lock(
			getOrSetDefault(this.getMessageLocks, message.id, () => ({})),
			async () =>
				retryUntilSuccessful(
					/* eslint-disable-next-line @typescript-eslint/tslint/config */
					async () => {
						const localStorageKey = `chatService.getMessageValue/${message.id}`;

						if (
							message instanceof ChatMessage &&
							message.value?.failure
						) {
							message.value = undefined;
						}

						if (!this.sessionInitService.ephemeral) {
							message.value = await this.localStorageService
								.getItem(localStorageKey, ChatMessageValue)
								.catch(() => undefined);
						}

						const localStorageSuccess = message.value !== undefined;

						if (tryInitFromLocalStorage && !localStorageSuccess) {
							return message;
						}

						const referencesValue =
							message.hash &&
							message.hash.length > 0 &&
							(message.key && message.key.length > 0);

						for (const messageValues of [
							this.messageValuesLocal,
							this.messageValues
						]) {
							if (
								!(
									referencesValue &&
									message.value === undefined &&
									message.hash !== undefined &&
									message.key !== undefined
								)
							) {
								continue;
							}

							const getMessageValue = async () => {
								if (
									message.hash === undefined ||
									message.key === undefined
								) {
									throw new Error(
										'Message hash or key missing.'
									);
								}

								return messageValues.getItem(
									message.id,
									message.key,
									message.hash,
									this.messageValueHasher(message)
								);
							};

							message.value = await (messageValues ===
							this.messageValues ?
								retryUntilSuccessful(getMessageValue, 10, 500) :
								getMessageValue()
							).catch(() => undefined);
						}

						if (message.value !== undefined) {
							await this.fetchedMessageIDs.addItem(message.id);

							if (
								!localStorageSuccess &&
								!this.sessionInitService.ephemeral
							) {
								await this.localStorageService.setItem(
									localStorageKey,
									ChatMessageValue,
									message.value
								);
							}
						}

						if (message instanceof ChatMessage) {
							if (
								referencesValue &&
								message.value === undefined
							) {
								message.value = {
									failure: true,
									text: this.stringsService
										.getMessageValueFailure
								};
							}

							message.valueWatcher.next(message.value);
						}

						return message;
					},
					3,
					1000
				)
		);
	}

	/** Displays help information. */
	public helpButton () : void {
		this.dialogService.baseDialog(HelpComponent);

		this.analyticsService.sendEvent({
			eventAction: 'show',
			eventCategory: 'help',
			eventValue: 1,
			hitType: 'event'
		});
	}

	/** Sets incrementing chat.initProgress to 100. */
	public initProgressFinish () : void {
		this.chat.initProgress.next(100);
	}

	/** Starts incrementing chat.initProgress up to 100. */
	public initProgressStart (
		totalTime: number = ChatService.approximateKeyExchangeTime,
		timeInterval: number = 250
	) : void {
		const increment = timeInterval / totalTime;

		this.subscriptions.push(
			interval(timeInterval)
				.pipe(
					takeWhile(() => this.chat.initProgress.value < 125),
					map(() => this.chat.initProgress.value + increment * 100)
				)
				.subscribe(this.chat.initProgress)
		);
	}

	/** Marks a message as fully loaded / displayed in the UI. */
	public markMessageLoadComplete (id: string) : void {
		getOrSetDefault(this.fullyLoadedMessages, id, resolvable).resolve();
	}

	/**
	 * Handler for message change.
	 *
	 * In accounts, syncs current message to local storage.
	 *
	 * In ephemeral chat, checks for change to current message and
	 * sends appropriate typing indicator signals through session.
	 */
	public async messageChange (isText: boolean = false) : Promise<void> {
		return this.messageChangeLock(async () => {
			if (this.chat.pendingMessageRoot) {
				await this.localStorageService.setItem<
					IChatMessageLiveValueSerialized
				>(
					`${this.chat.pendingMessageRoot}-live`,
					ChatMessageLiveValueSerialized,
					{
						...this.chat.currentMessage,
						quill: this.chat.currentMessage.quill ?
							msgpack.encode({
								ops: this.chat.currentMessage.quill.ops
							}) :
							undefined
					}
				);
			}

			if (!this.sessionInitService.ephemeral || !isText) {
				return;
			}

			this.chat.previousMessage = this.chat.currentMessage.text;

			await sleep(this.outgoingMessageBatchDelay);

			const isMessageChanged =
				this.chat.currentMessage.text !== '' &&
				this.chat.currentMessage.text !== this.chat.previousMessage;

			if (this.chat.isMessageChanged === isMessageChanged) {
				return;
			}

			this.chat.isMessageChanged = isMessageChanged;

			this.sessionService.send([
				rpcEvents.typing,
				{chatState: {isTyping: this.chat.isMessageChanged}}
			]);
		});
	}

	/** Sends a message. */
	/* eslint-disable-next-line complexity */
	public async send (
		messageType: ChatMessageValue.Types = ChatMessageValue.Types.Text,
		message?: IChatMessageLiveValue,
		selfDestructTimeout?: number,
		selfDestructChat: boolean = false,
		keepCurrentMessage?: boolean,
		oldLocalStorageKey?: string
	) : Promise<string | undefined> {
		debugLogTime(() => 'Chat Message Send: start');

		if (keepCurrentMessage === undefined) {
			keepCurrentMessage = message !== undefined;
		}

		const id = uuid(true);

		const value: IChatMessageValue = {};
		const currentMessage = keepCurrentMessage ?
			{} :
			this.chat.currentMessage;

		let emptyValue = false;

		switch (messageType) {
			case ChatMessageValue.Types.CalendarInvite:
				value.calendarInvite =
					(message && message.calendarInvite) ||
					this.chat.currentMessage.calendarInvite;
				currentMessage.calendarInvite = undefined;

				if (!value.calendarInvite) {
					emptyValue = true;
				}

				break;

			case ChatMessageValue.Types.FileTransfer:
				value.fileTransfer =
					(message && message.fileTransfer) ||
					this.chat.currentMessage.fileTransfer;
				currentMessage.fileTransfer = undefined;

				if (!value.fileTransfer) {
					emptyValue = true;
				}

				break;

			case ChatMessageValue.Types.Form:
				value.form =
					(message && message.form) || this.chat.currentMessage.form;
				currentMessage.form = undefined;

				if (!value.form) {
					emptyValue = true;
				}

				break;

			case ChatMessageValue.Types.Quill:
				value.quill =
					message && message.quill ?
						msgpack.encode({ops: message.quill.ops}) :
					this.chat.currentMessage.quill ?
						msgpack.encode({
							ops: this.chat.currentMessage.quill.ops
						}) :
						undefined;
				currentMessage.quill = undefined;

				if (!value.quill) {
					emptyValue = true;
				}

				break;

			case ChatMessageValue.Types.Text:
				value.text =
					(message && message.text) || this.chat.currentMessage.text;
				currentMessage.text = '';
				this.messageChange();

				if (!value.text) {
					emptyValue = true;
				}

				break;

			default:
				throw new Error('Invalid ChatMessageValue.Types value.');
		}

		if (!keepCurrentMessage) {
			this.messageChange();
		}

		const removeOldStorageItem = async () =>
			oldLocalStorageKey ?
				this.localStorageService
					.removeItem(oldLocalStorageKey)
					.then(() => undefined) :
				undefined;

		if (emptyValue) {
			return removeOldStorageItem();
		}

		if (!oldLocalStorageKey) {
			await this.resolvers.outgoingMessagesSynced.promise;
		}

		const localStoragePromise = !this.chat.pendingMessageRoot ?
			Promise.resolve() :
			this.localStorageService
				.setItem<IChatPendingMessage>(
					`${this.chat.pendingMessageRoot}/${id}`,
					ChatPendingMessage,
					{
						message: value,
						messageType,
						selfDestructChat,
						selfDestructTimeout
					}
				)
				.then(removeOldStorageItem);

		const predecessorsPromise = (async () : Promise<
			IChatMessagePredecessor[] | undefined
		> => {
			/* Redundant for 1:1 chats since Castle already enforces message order */
			if (!this.sessionService.group) {
				return [];
			}

			let lastLocal: IChatMessagePredecessor | undefined;
			let lastRemote: IChatMessagePredecessor | undefined;

			const messages =
				this.messages.value ||
				(await this.messages
					.pipe(filterUndefinedOperator(), take(1))
					.toPromise());

			for (let i = messages.length - 1; i >= 0; --i) {
				const o = messages[i];

				const isLocal =
					!lastLocal &&
					o.authorType === ChatMessage.AuthorTypes.Local;
				const isRemote =
					!lastRemote &&
					o.authorType === ChatMessage.AuthorTypes.Remote;

				if (
					!(
						(isLocal || isRemote) &&
						o.id &&
						(o.hash && o.hash.length > 0) &&
						(await this.messageHasValidHash(o))
					)
				) {
					continue;
				}

				if (isLocal) {
					lastLocal = {hash: o.hash, id: o.id};
				}
				else if (isRemote) {
					lastRemote = {hash: o.hash, id: o.id};
				}
			}

			return [
				...(lastLocal ? [lastLocal] : []),
				...(lastRemote ? [lastRemote] : [])
			];
		})();

		const uploadPromise = (async () =>
			(await this.messageValues.setItem(id, value)).encryptionKey)();

		const chatMessagePromise = Promise.all([
			this.getAuthorID(this.sessionService.localUsername),
			getTimestamp(),
			localStoragePromise
		]).then(
			async ([authorID, timestamp]) : Promise<IChatMessage> => ({
				authorID,
				authorType: ChatMessage.AuthorTypes.Local,
				id,
				selfDestructTimeout: selfDestructChat ?
					undefined :
					selfDestructTimeout,
				sessionSubID: this.sessionService.sessionSubID,
				timestamp
			})
		);

		chatMessagePromise.then(async chatMessage => {
			await this.chat.pendingMessages.pushItem({
				...chatMessage,
				pending: true,
				value
			});

			await this.scrollService.scrollDown(false, 250);
		});

		const resolver = resolvable();

		this.outgoingMessageQueue.push({
			messageData: [
				chatMessagePromise,
				id,
				predecessorsPromise,
				uploadPromise,
				selfDestructChat,
				selfDestructTimeout,
				value
			],
			resolve: resolver.resolve
		});

		this.processOutgoingMessages();

		await resolver.promise;
		return id;
	}

	/** Sets queued message to be sent after handshake. */
	public setQueuedMessage (messageText: string) : void {
		this.chat.queuedMessage = messageText;
		this.updateChat();
		this.dialogService.toast(this.stringsService.queuedMessageSaved, 2500);
	}

	/** Pushes update to chat subject. */
	public updateChat () : void {
		this.chatSubject.next({...this.chat});
	}

	constructor (
		/** @ignore */
		protected readonly analyticsService: AnalyticsService,

		/** @ignore */
		@Inject(CastleService)
		@Optional()
		protected readonly castleService: CastleService | undefined,

		/** @ignore */
		@Inject(ChannelService)
		@Optional()
		protected readonly channelService: ChannelService | undefined,

		/** @ignore */
		protected readonly databaseService: DatabaseService,

		/** @ignore */
		protected readonly dialogService: DialogService,

		/** @ignore */
		protected readonly envService: EnvService,

		/** @ignore */
		protected readonly localStorageService: LocalStorageService,

		/** @ignore */
		protected readonly notificationService: NotificationService,

		/** @ignore */
		protected readonly p2pWebRTCService: P2PWebRTCService,

		/** @ignore */
		protected readonly potassiumService: PotassiumService,

		/** @ignore */
		protected readonly scrollService: ScrollService,

		/** @ignore */
		protected readonly sessionService: SessionService,

		/** @ignore */
		protected readonly sessionCapabilitiesService: SessionCapabilitiesService,

		/** @ignore */
		protected readonly sessionInitService: SessionInitService,

		/** @ignore */
		protected readonly stringsService: StringsService
	) {
		super();

		if (this.envService.debugLog) {
			this.resolvers.chatConnected.promise.then(() => {
				debugLog(() => 'ChatService.resolvers.chatConnected resolved');
			});
			this.resolvers.currentMessageSynced.promise.then(() => {
				debugLog(
					() => 'ChatService.resolvers.currentMessageSynced resolved'
				);
			});
			this.resolvers.messageListLoaded.promise.then(() => {
				debugLog(
					() => 'ChatService.resolvers.messageListLoaded resolved'
				);
			});
			this.resolvers.outgoingMessagesSynced.promise.then(() => {
				debugLog(
					() =>
						'ChatService.resolvers.outgoingMessagesSynced resolved'
				);
			});
			this.sessionService.initialMessagesProcessed.promise.then(() => {
				debugLog(
					() =>
						'ChatService.sessionService.initialMessagesProcessed resolved'
				);
			});
			(this.castleService ?
				this.castleService.initialMessagesProcessed() :
				Promise.resolve()
			).then(() => {
				debugLog(
					() =>
						'ChatService.castleService.initialMessagesProcessed resolved'
				);
			});
			(this.channelService ?
				this.channelService.initialMessagesProcessed.promise :
				Promise.resolve()
			).then(() => {
				debugLog(
					() =>
						'ChatService.channelService.initialMessagesProcessed resolved'
				);
			});
			this.uiReady.then(() => {
				debugLog(() => 'ChatService.uiReady resolved');
			});
		}

		this.sessionService.ready.then(() => {
			const beginChat = this.sessionService.one(events.beginChat);
			const callType = this.sessionInitService.callType;
			const pendingMessageRoot = this.chat.pendingMessageRoot;

			if (callType !== undefined) {
				this.p2pWebRTCService.initialCallPending.next(true);
			}

			this.scrollService.resolveUnreadItems(
				this.getScrollServiceUnreadMessages()
			);

			this.subscriptions.push(
				combineLatest([
					this.chat.lastConfirmedMessage.watch(),
					this.chat.messageList
						.watchFlat(true)
						.pipe(
							mergeMap(async messageIDs =>
								filterUndefined(
									await Promise.all(
										messageIDs.map(async id =>
											this.chat.messages
												.getItem(id)
												.catch(() => undefined)
										)
									)
								).filter(
									o =>
										o.authorType ===
										ChatMessage.AuthorTypes.Local
								)
							)
						)
				])
					.pipe(
						map(([lastConfirmedMessage, outgoingMessages]) => {
							const unconfirmedMessages: {
								[id: string]: boolean;
							} = {};

							for (
								let i = outgoingMessages.length - 1;
								i >= 0;
								--i
							) {
								const {id} = outgoingMessages[i];

								if (id === lastConfirmedMessage.id) {
									break;
								}

								unconfirmedMessages[id] = true;
							}

							return unconfirmedMessages;
						})
					)
					.subscribe(this.chat.unconfirmedMessages)
			);

			if (pendingMessageRoot) {
				Promise.all([
					this.localStorageService
						.getItem(
							`${this.chat.pendingMessageRoot}-live`,
							ChatMessageLiveValueSerialized
						)
						.then(messageLiveValue => {
							this.chat.currentMessage.calendarInvite =
								this.chat.currentMessage.calendarInvite ||
								messageLiveValue.calendarInvite;

							this.chat.currentMessage.fileTransfer =
								this.chat.currentMessage.fileTransfer ||
								messageLiveValue.fileTransfer;

							this.chat.currentMessage.form =
								this.chat.currentMessage.form ||
								messageLiveValue.form;

							this.chat.currentMessage.quill =
								this.chat.currentMessage.quill ||
								(messageLiveValue.quill &&
									messageLiveValue.quill.length > 0) ?
									{
										ops:
											messageLiveValue.quill instanceof
											Uint8Array ?
												msgpack.decode(
													messageLiveValue.quill
												) :
												[]
									} :
									undefined;

							this.chat.currentMessage.text =
								this.chat.currentMessage.text ||
								messageLiveValue.text;

							this.updateChat();
						})
						.catch(() => {})
						.then(() => {
							this.resolvers.currentMessageSynced.resolve();
						}),
					this.localStorageService
						.lock(pendingMessageRoot, async () => {
							const pendingMessages = await this.localStorageService.getValues(
								pendingMessageRoot,
								ChatPendingMessage,
								true
							);

							await Promise.all(
								pendingMessages.map(
									async ([key, pendingMessage]) =>
										this.send(
											pendingMessage.messageType,
											{
												...pendingMessage.message,
												quill:
													pendingMessage.message
														.quill &&
													pendingMessage.message.quill
														.length > 0 ?
														{
															ops: msgpack.decode(
																pendingMessage
																	.message
																	.quill
															)
														} :
														undefined
											},
											pendingMessage.selfDestructTimeout,
											pendingMessage.selfDestructChat,
											true,
											key
										)
								)
							);
						})
						.catch(() => {})
						.then(() => {
							this.resolvers.outgoingMessagesSynced.resolve();
						})
				]);
			}
			else {
				this.resolvers.currentMessageSynced.resolve();
				this.resolvers.outgoingMessagesSynced.resolve();
			}

			this.chat.messageList.getFlatValue().then(async messageIDs => {
				const lastMessageID = messageIDs.slice(-1)[0];
				if (lastMessageID) {
					await getOrSetDefault(
						this.fullyLoadedMessages,
						lastMessageID,
						resolvable
					).promise;
				}
				this.resolvers.messageListLoaded.resolve();
			});

			beginChat.then(() => {
				this.begin();
			});

			this.sessionService.closed.then(async () => this.close());

			this.sessionService.connected.then(async () => {
				this.sessionCapabilitiesService.resolveWalkieTalkieMode(
					this.walkieTalkieMode.value
				);

				debugLog(async () => ({
					chat: {
						futureMessages: await this.chat.futureMessages.getValue(),
						lastConfirmedMessage: await this.chat.lastConfirmedMessage.getValue(),
						lastUnreadMessage: await this.chat.lastUnreadMessage,
						messageList: await this.chat.messageList.getValue(),
						messages: await this.chat.messages.getValue(),
						unconfirmedMessages: this.chat.unconfirmedMessages.value
					}
				}));

				if (callType !== undefined) {
					this.sessionService.yt().then(async () => {
						await this.sessionService.freezePong
							.pipe(
								filter(b => !b),
								take(1)
							)
							.toPromise();

						if (!this.sessionInitService.ephemeral) {
							this.p2pWebRTCService.loading.next(true);
							this.initProgressStart(42000);
						}

						const canceled = await this.dialogService.toast(
							callType === 'video' ?
								this.stringsService.p2pWarningVideoPassive :
								this.stringsService.p2pWarningAudioPassive,
							ChatService.p2pPassiveConnectTime,
							this.stringsService.cancel
						);

						if (!canceled) {
							this.p2pWebRTCService.accept(callType, true);
						}
						else if (this.sessionInitService.ephemeral) {
							await this.close();
							return;
						}

						this.p2pWebRTCService.resolveReady();

						if (this.sessionInitService.ephemeral) {
							await beginChat;
						}

						if (canceled) {
							await this.p2pWebRTCService.close();
						}
						else {
							await this.p2pWebRTCService.request(callType, true);
						}
					});
				}
				else {
					this.p2pWebRTCService.resolveReady();
				}

				if (!this.sessionInitService.ephemeral) {
					return;
				}

				this.chat.state = States.keyExchange;
				this.updateChat();
				this.initProgressStart();
			});

			this.sessionService
				.one(events.connectFailure)
				.then(async () => this.abortSetup());

			if (this.deliveryReceipts) {
				this.sessionService.on(
					rpcEvents.confirm,
					async (newEvents: ISessionMessageData[]) => {
						for (const o of newEvents) {
							if (!o.textConfirmation || !o.textConfirmation.id) {
								continue;
							}

							const id = o.textConfirmation.id;

							const getNewLastConfirmedMesssage = (
								messageIDs: string[]
							) : IChatLastConfirmedMessage | undefined => {
								for (
									let i = messageIDs.length - 1;
									i >= 0;
									--i
								) {
									if (messageIDs[i] === id) {
										return {id, index: i};
									}
								}

								return;
							};

							let newLastConfirmedMessage = getNewLastConfirmedMesssage(
								await this.chat.messageList.getFlatValue()
							);

							if (!newLastConfirmedMessage) {
								const pendingMessageIDs = (await this.chat.pendingMessages.getFlatValue()).map(
									m => m.id
								);

								if (
									getNewLastConfirmedMesssage(
										pendingMessageIDs
									) === undefined
								) {
									continue;
								}

								newLastConfirmedMessage = await this.chat.messageList
									.watchFlat()
									.pipe(
										map(getNewLastConfirmedMesssage),
										filterUndefinedOperator(),
										take(1)
									)
									.toPromise();
							}

							this.chat.lastConfirmedMessage.updateValue(
								async lastConfirmedMessage => {
									if (
										!newLastConfirmedMessage ||
										lastConfirmedMessage.id ===
											newLastConfirmedMessage.id ||
										lastConfirmedMessage.index >
											newLastConfirmedMessage.index
									) {
										throw newLastConfirmedMessage;
									}

									return newLastConfirmedMessage;
								}
							);
						}
					}
				);
			}

			this.sessionService.on(
				rpcEvents.typing,
				(newEvents: ISessionMessageData[]) => {
					for (const o of newEvents) {
						if (o.chatState) {
							this.chat.isFriendTyping.next(o.chatState.isTyping);
						}
					}
				}
			);

			(async () => {
				while (this.sessionService.state.isAlive.value) {
					await this.chat.receiveTextLock(async lockData => {
						const f = async (newEvents: ISessionMessageData[]) => {
							await this.addTextMessage(...newEvents);

							const lastEvent = newEvents.slice(-1)[0];
							if (!lastEvent?.initial) {
								return;
							}

							await getOrSetDefault(
								this.fullyLoadedMessages,
								lastEvent.id,
								resolvable
							).promise;
						};

						this.sessionService.on(rpcEvents.text, f);
						await Promise.race([
							this.sessionService.closed,
							lockData.stillOwner.toPromise()
						]);
						this.sessionService.off(rpcEvents.text, f);
					});
				}
			})();
		});

		this.sessionCapabilitiesService.capabilities.walkieTalkieMode.then(
			walkieTalkieMode => {
				this.walkieTalkieMode.next(walkieTalkieMode);
			}
		);

		/* For automated tests */

		if (!this.envService.isWeb) {
			return;
		}

		(<any> self).sendMessage = async (
			message?: string,
			selfDestructTimeout?: number
		) => this.send(undefined, {text: message}, selfDestructTimeout);

		/* For debugging */

		if (!this.envService.debug) {
			return;
		}

		(<any> self).bypassAbortion = () => {
			this.chat.state = States.chat;
			this.updateChat();
		};
	}
}
