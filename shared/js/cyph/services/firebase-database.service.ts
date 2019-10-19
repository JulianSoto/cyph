/* tslint:disable:max-file-line-count no-import-side-effect */

import {Injectable, NgZone} from '@angular/core';
import firebase from 'firebase/app';
import 'firebase/auth';
import 'firebase/database';
import 'firebase/functions';
import 'firebase/messaging';
import 'firebase/storage';
import {BehaviorSubject, Observable, Subscription} from 'rxjs';
import {filter, skip, take} from 'rxjs/operators';
import {env} from '../env';
import {IProto} from '../iproto';
import {ITimedValue} from '../itimed-value';
import {MaybePromise} from '../maybe-promise-type';
import {BinaryProto, IDatabaseItem, StringProto} from '../proto';
import {compareArrays} from '../util/compare';
import {
	getOrSetDefault,
	getOrSetDefaultObservable
} from '../util/get-or-set-default';
import {lock, lockFunction} from '../util/lock';
import {requestByteStream} from '../util/request';
import {deserialize, serialize} from '../util/serialization';
import {getTimestamp} from '../util/time';
import {uuid} from '../util/uuid';
import {
	promiseTimeout,
	resolvable,
	retryUntilSuccessful,
	sleep,
	waitForValue
} from '../util/wait';
import {PotassiumService} from './crypto/potassium.service';
import {DatabaseService} from './database.service';
import {EnvService} from './env.service';
import {LocalStorageService} from './local-storage.service';
import {NotificationService} from './notification.service';
import {WindowWatcherService} from './window-watcher.service';
import {WorkerService} from './worker.service';

/**
 * DatabaseService implementation built on Firebase.
 */
@Injectable()
export class FirebaseDatabaseService extends DatabaseService {
	/** @ignore */
	private readonly app: Promise<
		firebase.app.App & {
			auth: () => firebase.auth.Auth;
			database: (databaseURL?: string) => firebase.database.Database;
			functions: () => firebase.functions.Functions;
			messaging: () => firebase.messaging.Messaging;
			storage: (storageBucket?: string) => firebase.storage.Storage;
		}
	> = this.ngZone.runOutsideAngular(async () =>
		retryUntilSuccessful(() => {
			const app: any =
				firebase.apps[0] || firebase.initializeApp(env.firebaseConfig);

			if (app.auth === undefined) {
				throw new Error('No Firebase Auth module.');
			}
			if (app.database === undefined) {
				throw new Error('No Firebase Database module.');
			}
			if (app.functions === undefined) {
				throw new Error('No Firebase Functions module.');
			}
			if (app.messaging === undefined) {
				throw new Error('No Firebase Messaging module.');
			}
			if (app.storage === undefined) {
				throw new Error('No Firebase Storage module.');
			}

			return app;
		})
	);

	/** @ignore */
	private readonly localLocks: Map<string, {}> = new Map<string, {}>();

	/** Firebase Cloud Messaging token. */
	private readonly messaging: Promise<{
		cordova?: any;
		token?: string;
	}> = this.ngZone
		.runOutsideAngular(async () => {
			if (this.envService.isCordovaMobile) {
				const cordova = (<any> self).PushNotification.init({
					android: {
						color: 'white',
						icon: 'notification_icon',
						iconColor: '#8b62d9'
					},
					ios: {
						alert: true,
						badge: true,
						sound: true
					}
				});

				return {
					cordova,
					token: await new Promise<string>(resolve => {
						cordova.on('registration', (o: any) => {
							resolve(o.registrationId);
						});
					})
				};
			}

			if (
				this.envService.isCordovaDesktop &&
				typeof cordovaRequire === 'function'
			) {
				const {ipcRenderer} = cordovaRequire('electron');
				const {
					NOTIFICATION_RECEIVED,
					NOTIFICATION_SERVICE_STARTED,
					START_NOTIFICATION_SERVICE
				} = cordovaRequire('electron-push-receiver/src/constants');

				ipcRenderer.on(
					NOTIFICATION_RECEIVED,
					(_: any, notification: any) => {
						if (
							typeof notification === 'object' &&
							typeof notification.body === 'string' &&
							notification.body
						) {
							this.notificationService.notify(notification.body);
						}
					}
				);

				const tokenPromise = new Promise<string>(resolve => {
					const f = (_: any, token: string) => {
						resolve(token);
						ipcRenderer.off(NOTIFICATION_SERVICE_STARTED, f);
					};
					ipcRenderer.on(NOTIFICATION_SERVICE_STARTED, f);
				});

				ipcRenderer.send(
					START_NOTIFICATION_SERVICE,
					this.envService.firebaseConfig.messagingSenderId
				);

				return {token: await tokenPromise};
			}

			const app = await this.app;
			const messaging = app.messaging();
			const serviceWorkerRegistration = await this.workerService
				.serviceWorkerRegistration;

			await this.workerService.registerServiceWorkerFunction(
				'FCM',
				this.envService.firebaseConfig,
				/* tslint:disable-next-line:no-shadowed-variable */
				config => {
					importScripts(
						'/assets/node_modules/firebase/firebase-app.js'
					);
					importScripts(
						'/assets/node_modules/firebase/firebase-messaging.js'
					);

					(<any> self).firebase.initializeApp(config);
					(<any> self).messaging = (<any> self).firebase.messaging();

					(<any> self).addEventListener(
						'notificationclick',
						(e: any) => {
							const clients = (<any> self).clients;

							e.notification.close();

							e.waitUntil(
								clients
									.matchAll({
										type: 'window'
									})
									.then((clientList: any[]) => {
										const client = clientList.find(
											c => 'focus' in c
										);

										if (client) {
											return client.focus();
										}
										if (clients.openWindow) {
											return clients.openWindow('/');
										}
									})
							);
						}
					);
				}
			);

			messaging.useServiceWorker(serviceWorkerRegistration);
			await (<any> self).Notification.requestPermission();
			return {token: (await messaging.getToken()) || undefined};
		})
		.catch(() => ({}));

	/** Max number of bytes to upload to non-blob storage. */
	private readonly nonBlobStorageLimit = 8192;

	/** @ignore */
	private readonly observableCaches = {
		watch: new Map<string, Observable<ITimedValue<any>>>(),
		watchExists: new Map<string, Observable<boolean>>(),
		watchList: new Map<string, Observable<ITimedValue<any>[]>>(),
		watchListKeyPushes: new Map<
			string,
			Observable<{key: string; previousKey?: string}>
		>(),
		watchListKeys: new Map<string, Observable<string[]>>(),
		watchListPushes: new Map<
			string,
			Observable<
				ITimedValue<any> & {
					key: string;
					previousKey?: string;
					url: string;
				}
			>
		>()
	};

	/** @ignore */
	private async getDatabaseRef (
		url: string
	) : Promise<firebase.database.Reference> {
		return retryUntilSuccessful(async () =>
			/^https?:\/\//.test(url) ?
				(await this.app).database().refFromURL(url) :
				(await this.app).database().ref(this.processURL(url))
		);
	}

	/** @ignore */
	private getListKeysInternal (
		value: Map<string, any> | {[k: string]: any},
		noFilter: boolean = false
	) : string[] {
		if (!value) {
			return [];
		}

		const keys = (value instanceof Map ?
			Array.from(value.keys()) :
			Object.keys(value)
		).sort();

		const endIndex = noFilter ?
			-1 :
			keys.findIndex(
				value instanceof Map ?
					k => typeof value.get(k).hash !== 'string' :
					k => typeof value[k].hash !== 'string'
			);

		return endIndex >= 0 ? keys.slice(0, endIndex) : keys;
	}

	/** @ignore */
	private async getStorageDownloadURL (
		storageRef: firebase.storage.Reference
	) : Promise<string> {
		return this.localStorageService.getOrSetDefault(
			`FirebaseDatabaseService.getStorageDownloadURL:${storageRef.fullPath}`,
			StringProto,
			async () => promiseTimeout(storageRef.getDownloadURL(), 15000)
		);
	}

	/** @ignore */
	private async getStorageRef (
		url: string,
		hash: string
	) : Promise<firebase.storage.Reference> {
		const fullURL = `${url}/${hash}`;

		return retryUntilSuccessful(async () =>
			/^https?:\/\//.test(fullURL) ?
				(await this.app).storage().refFromURL(fullURL) :
				(await this.app).storage().ref(this.processURL(fullURL))
		);
	}

	/** @see https://github.com/firebase/firebase-js-sdk/issues/540#issuecomment-369984622 */
	private async refreshConnection () : Promise<void> {
		const app = await this.app;
		await app.database().goOffline();
		await app.database().goOnline();
	}

	/** @ignore */
	private usernameToEmail (username: string) : string {
		return `${username}@${this.namespace}`;
	}

	/** @ignore */
	private async waitForValue (
		url: string
	) : Promise<firebase.database.DataSnapshot> {
		return new Promise<firebase.database.DataSnapshot>(async resolve => {
			(await this.getDatabaseRef(url)).on('value', snapshot => {
				if (
					snapshot &&
					snapshot.exists() &&
					typeof snapshot.val().hash === 'string'
				) {
					resolve(snapshot);
				}
			});
		});
	}

	/** @inheritDoc */
	protected processURL (url: string) : string {
		return url.startsWith('.') ? url : super.processURL(url);
	}

	/** @inheritDoc */
	public async callFunction (
		name: string,
		data: Record<string, any> = {}
	) : Promise<any> {
		return (await (await this.app).functions().httpsCallable(name)({
			...data,
			namespace: this.namespace
		})).data;
	}

	/** @inheritDoc */
	public async changePassword (
		username: string,
		oldPassword: string,
		newPassword: string
	) : Promise<void> {
		return this.ngZone.runOutsideAngular(async () => {
			await this.login(username, oldPassword);

			const auth = await (await this.app).auth();

			if (
				!auth.currentUser ||
				!auth.currentUser.email ||
				auth.currentUser.email.split('@')[0].toLowerCase() !==
					username.toLowerCase()
			) {
				throw new Error('Failed to change password.');
			}

			await auth.currentUser.updatePassword(newPassword);
			await this.login(username, newPassword);
		});
	}

	/** @inheritDoc */
	public async checkDisconnected (
		urlPromise: MaybePromise<string>
	) : Promise<boolean> {
		return this.ngZone.runOutsideAngular(async () => {
			const url = await urlPromise;

			return (
				(await (await this.getDatabaseRef(url)).once('value')).val() !==
				undefined
			);
		});
	}

	/** @inheritDoc */
	public connectionStatus () : Observable<boolean> {
		return this.ngZone.runOutsideAngular(
			() =>
				new Observable<boolean>(observer => {
					let cleanup: Function;

					(async () => {
						const connectedRef = await this.getDatabaseRef(
							'.info/connected'
						);

						/* tslint:disable-next-line:no-null-keyword */
						const onValue = async (
							snapshot: firebase.database.DataSnapshot | null
						) => {
							if (!snapshot) {
								return;
							}

							this.ngZone.run(() => {
								observer.next(snapshot.val() === true);
							});
						};

						connectedRef.on('value', onValue);
						cleanup = () => {
							connectedRef.off('value', onValue);
						};
					})();

					return async () => {
						(await waitForValue(() => cleanup))();
					};
				})
		);
	}

	/** @inheritDoc */
	public downloadItem<T> (
		urlPromise: MaybePromise<string>,
		proto: IProto<T>,
		verifyHash?: string
	) : {
		alreadyCached: Promise<boolean>;
		progress: Observable<number>;
		result: Promise<ITimedValue<T>>;
	} {
		const progress = new BehaviorSubject(0);
		const alreadyCached = resolvable<boolean>();

		return {
			alreadyCached: alreadyCached.promise,
			progress,
			result: this.ngZone.runOutsideAngular(async () => {
				const url = await urlPromise;

				const {data, hash, timestamp} = await this.getMetadata(url);

				/* tslint:disable-next-line:possible-timing-attack */
				if (verifyHash !== undefined && verifyHash !== hash) {
					throw new Error(
						'FirebaseDatabaseService.downloadItem verifyHash mismatch: ' +
							`'${verifyHash}' !== '${hash}'`
					);
				}

				try {
					const localValue = await (verifyHash === undefined ?
						this.cache.value.getItem({hash, url}, proto) :
						Promise.reject()
					).catch(async err => {
						if (data === undefined) {
							throw err;
						}
						return deserialize(
							proto,
							this.potassiumService.fromBase64(data)
						);
					});

					alreadyCached.resolve(true);
					this.ngZone.run(() => {
						progress.next(100);
						progress.complete();
					});

					return {timestamp, value: localValue};
				}
				catch {}

				alreadyCached.resolve(false);
				this.ngZone.run(() => {
					progress.next(0);
				});

				const storageRef = await this.getStorageRef(url, hash);

				const req = requestByteStream({
					retries: 3,
					url: await this.getStorageDownloadURL(storageRef)
				});

				/* tslint:disable-next-line:rxjs-no-ignored-subscription */
				req.progress.subscribe(
					n => {
						this.ngZone.run(() => {
							progress.next(n);
						});
					},
					err => {
						this.ngZone.run(() => {
							progress.next(err);
						});
					}
				);

				const value = await req.result;

				this.ngZone.run(() => {
					progress.next(100);
					progress.complete();
				});
				this.cache.value.setItem({hash, url}, BinaryProto, value);
				return {timestamp, value: await deserialize(proto, value)};
			})
		};
	}

	/** @inheritDoc */
	public async getLatestKey (
		urlPromise: MaybePromise<string>
	) : Promise<string | undefined> {
		return this.ngZone.runOutsideAngular(async () => {
			const url = await urlPromise;

			try {
				const value = (await (await this.getDatabaseRef(url)).once(
					'value'
				)).val();
				const keys = await this.getListKeysInternal(value);

				return keys
					.filter(k => !isNaN(value[k].timestamp))
					.sort((a, b) => value[b].timestamp - value[a].timestamp)[0];
			}
			catch {
				return undefined;
			}
		});
	}

	/** @inheritDoc */
	public async getList<T> (
		urlPromise: MaybePromise<string>,
		proto: IProto<T>
	) : Promise<T[]> {
		return this.ngZone.runOutsideAngular(async () => {
			const url = await urlPromise;

			try {
				return await Promise.all(
					(await this.getListKeys(url)).map(async k =>
						this.getItem(`${url}/${k}`, proto)
					)
				);
			}
			catch {
				return [];
			}
		});
	}

	/** @inheritDoc */
	public async getListKeys (
		urlPromise: MaybePromise<string>,
		noFilter: boolean = false
	) : Promise<string[]> {
		return this.ngZone.runOutsideAngular(async () => {
			const url = await urlPromise;

			try {
				return this.getListKeysInternal(
					(await (await this.getDatabaseRef(url)).once(
						'value'
					)).val(),
					noFilter
				);
			}
			catch {
				return [];
			}
		});
	}

	/** @inheritDoc */
	public async getMetadata (
		urlPromise: MaybePromise<string>
	) : Promise<IDatabaseItem> {
		return this.ngZone.runOutsideAngular(async () => {
			const url = await urlPromise;

			const {data, hash, timestamp} = (await (await this.getDatabaseRef(
				url
			)).once('value')).val() || {
				data: undefined,
				hash: undefined,
				timestamp: undefined
			};

			if (typeof hash !== 'string' || typeof timestamp !== 'number') {
				throw new Error(`Item at ${url} not found.`);
			}

			const metadata = {
				hash,
				timestamp,
				...(typeof data === 'string' ? {data} : {})
			};

			await this.cache.metadata.setItem(url, metadata);

			return metadata;
		});
	}

	/** @inheritDoc */
	public async hasItem (urlPromise: MaybePromise<string>) : Promise<boolean> {
		return this.ngZone
			.runOutsideAngular(async () => {
				const url = await urlPromise;

				const metadata = await this.getMetadata(url);

				if (metadata.data !== undefined) {
					return;
				}

				this.getStorageDownloadURL(
					await this.getStorageRef(url, metadata.hash)
				);
			})
			.then(() => true)
			.catch(() => false);
	}

	/** @inheritDoc */
	public async lock<T> (
		urlPromise: MaybePromise<string>,
		f: (o: {
			reason?: string;
			stillOwner: BehaviorSubject<boolean>;
		}) => Promise<T>,
		reason?: string,
		global: boolean = true
	) : Promise<T> {
		const url = await this.lockURL(urlPromise, global);

		return this.ngZone.runOutsideAngular(async () =>
			lock(
				getOrSetDefault<string, {}>(this.localLocks, url, () => ({})),
				async () => {
					let lastReason: string | undefined;
					let onQueueUpdate: (() => Promise<void>) | undefined;

					const queue = await this.getDatabaseRef(url);
					const localLock = lockFunction();
					const id = uuid();
					let isActive = true;

					const lockData: {
						reason?: string;
						stillOwner: BehaviorSubject<boolean>;
					} = {
						stillOwner: new BehaviorSubject<boolean>(false)
					};

					const mutex = await queue.push().then();

					const getLockTimestamp = async () => {
						const o = (await mutex.once('value')).val() || {};

						if (
							typeof o.id !== 'string' ||
							!o.id ||
							typeof o.timestamp !== 'number' ||
							isNaN(o.timestamp)
						) {
							throw new Error(
								`Invalid server timestamp: {id: '${o.id}', timestamp: ${o.timestamp}}`
							);
						}

						return o.timestamp;
					};

					const contendForLock = async () =>
						retryUntilSuccessful(async () => {
							try {
								await mutex
									.set({
										timestamp:
											firebase.database.ServerValue
												.TIMESTAMP
									})
									.then();
								await mutex
									.onDisconnect()
									.remove()
									.then();
								await mutex
									.set({
										claimTimestamp:
											firebase.database.ServerValue
												.TIMESTAMP,
										id,
										timestamp:
											firebase.database.ServerValue
												.TIMESTAMP,
										...(reason ? {reason} : {})
									})
									.then();
								return getLockTimestamp();
							}
							catch (err) {
								await mutex.remove().then();
								throw err;
							}
						});

					const surrenderLock = async () => {
						if (!isActive) {
							return;
						}

						isActive = false;

						if (lockData.stillOwner.value) {
							lockData.stillOwner.next(false);
						}
						lockData.stillOwner.complete();

						if (onQueueUpdate) {
							queue.off('child_added', onQueueUpdate);
							queue.off('child_changed', onQueueUpdate);
							queue.off('child_removed', onQueueUpdate);
						}

						await retryUntilSuccessful(async () =>
							mutex.remove().then()
						);
					};

					const updateLock = async () =>
						retryUntilSuccessful(async () => {
							await mutex
								.child('timestamp')
								.set(firebase.database.ServerValue.TIMESTAMP)
								.then();
							return getLockTimestamp();
						});

					try {
						let lastUpdate = await contendForLock();

						(async () => {
							while (isActive) {
								if (
									lockData.stillOwner.value &&
									(await getTimestamp()) - lastUpdate >=
										this.lockLeaseConfig
											.expirationLowerLimit
								) {
									return;
								}

								lastUpdate = await updateLock();
								await sleep(
									this.lockLeaseConfig.updateInterval
								);
							}
						})()
							.catch(() => {})
							.then(surrenderLock);

						/* Kill lock on disconnect */
						this.connectionStatus()
							.pipe(
								filter(b => !b),
								take(1)
							)
							.toPromise()
							.then(surrenderLock);

						/* tslint:disable-next-line:promise-must-complete */
						await new Promise<void>(resolve => {
							onQueueUpdate = async () =>
								localLock(async () => {
									if (!isActive) {
										return;
									}

									const value: {
										[key: string]: {
											claimTimestamp?: number;
											id?: string;
											reason?: string;
											timestamp?: number;
										};
									} = (await queue.once('value')).val() || {};

									const timestamp = await getTimestamp();

									/* Clean up expired lock claims. TODO: Handle as Cloud Function.

									for (const expiredContenderKey of Object.keys(
										value
									).filter(k => {
										const contender = value[k];
										return (
											typeof contender.timestamp ===
												'number' &&
											!isNaN(contender.timestamp) &&
											timestamp - contender.timestamp >=
												this.lockLeaseConfig
													.expirationLimit
										);
									})) {
										queue
											.child(expiredContenderKey)
											.remove();
										delete value[expiredContenderKey];
									}
									*/

									const contenders = Object.values(value)
										.filter(
											contender =>
												typeof contender.claimTimestamp ===
													'number' &&
												!isNaN(
													contender.claimTimestamp
												) &&
												typeof contender.id ===
													'string' &&
												typeof contender.timestamp ===
													'number' &&
												!isNaN(contender.timestamp) &&
												timestamp -
													contender.timestamp <
													this.lockLeaseConfig
														.expirationLimit
										)
										.sort(
											(a, b) =>
												<number> a.claimTimestamp -
												<number> b.claimTimestamp
										);

									const o = contenders[0] || {
										claimTimestamp: NaN,
										id: '',
										reason: undefined,
										timestamp: NaN
									};

									if (o.id !== id) {
										lastReason =
											typeof o.reason === 'string' ?
												o.reason :
												undefined;
									}

									/* Claiming lock for the first time */
									if (
										o.id === id &&
										!lockData.stillOwner.value
									) {
										lockData.reason = lastReason;
										lockData.stillOwner.next(true);
										resolve();
									}
									/* Losing claim to lock */
									else if (
										o.id !== id &&
										lockData.stillOwner.value
									) {
										surrenderLock();
									}
								});

							queue.on('child_added', onQueueUpdate);
							queue.on('child_changed', onQueueUpdate);
							queue.on('child_removed', onQueueUpdate);

							onQueueUpdate();
						});

						return await f(lockData);
					}
					finally {
						await surrenderLock();
					}
				},
				reason
			)
		);
	}

	/** @inheritDoc */
	public async lockStatus (
		urlPromise: MaybePromise<string>
	) : Promise<{
		locked: boolean;
		reason: string | undefined;
	}> {
		return this.ngZone.runOutsideAngular(async () => {
			const url = await urlPromise;

			const value: {
				[key: string]: {
					id?: string;
					reason?: string;
					timestamp?: number;
				};
			} =
				(await (await this.getDatabaseRef(url)).once('value')).val() ||
				{};

			const keys = Object.keys(value).sort();
			const reason = (value[keys[0]] || {reason: undefined}).reason;

			return {
				locked: keys.length > 0,
				reason: typeof reason === 'string' ? reason : undefined
			};
		});
	}

	/** @inheritDoc */
	public async login (username: string, password: string) : Promise<void> {
		return this.ngZone.runOutsideAngular(async () => {
			const auth = await (await this.app).auth();

			if (firebase.auth) {
				await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
			}

			await auth.signInWithEmailAndPassword(
				this.usernameToEmail(username),
				password
			);
		});
	}

	/** @inheritDoc */
	public async logout () : Promise<void> {
		await this.ngZone.runOutsideAngular(async () =>
			retryUntilSuccessful(async () => (await this.app).auth().signOut())
		);
	}

	/** @inheritDoc */
	public async pushItem<T> (
		urlPromise: MaybePromise<string>,
		proto: IProto<T>,
		value:
			| T
			| ((
					key: string,
					previousKey: () => Promise<string | undefined>,
					o: {callback?: () => MaybePromise<void>}
			  ) => MaybePromise<T>)
	) : Promise<{
		hash: string;
		url: string;
	}> {
		const url = await urlPromise;

		return this.ngZone.runOutsideAngular(async () => {
			const listRef = await this.getDatabaseRef(url);

			const initialItemRef = listRef.push({
				timestamp: firebase.database.ServerValue.TIMESTAMP
			});
			const itemRefOnDisconnect = initialItemRef.onDisconnect();

			itemRefOnDisconnect.remove();

			const itemRef = await initialItemRef.then();
			const key = itemRef.key;

			if (!key) {
				throw new Error(`Failed to push item to ${url}.`);
			}

			const previousKey = async () : Promise<string | undefined> =>
				retryUntilSuccessful(async () => {
					const listValueMap: {[k: string]: any} = (await listRef
						.orderByKey()
						.endAt(key)
						.limitToLast(2)
						.once('value')).val();

					if (!(key in listValueMap)) {
						throw new Error(
							`Key ${key} not found in list at ${url}.`
						);
					}

					return Object.keys(listValueMap).find(k => k !== key);
				});

			const o: {callback?: () => Promise<void>} = {};

			if (typeof value === 'function') {
				value = await (<
					(
						key: string,
						previousKey: () => Promise<string | undefined>,
						o: {callback?: () => MaybePromise<void>}
					) => MaybePromise<T>
				> value)(key, previousKey, o);
			}

			const result = await this.setItem(`${url}/${key}`, proto, value);
			await itemRefOnDisconnect.cancel();

			if (o.callback) {
				await o.callback();
			}

			return result;
		});
	}

	/** @inheritDoc */
	public async register (username: string, password: string) : Promise<void> {
		await this.ngZone.runOutsideAngular(async () => {
			try {
				await (await this.app)
					.auth()
					.createUserWithEmailAndPassword(
						this.usernameToEmail(username),
						password
					);
			}
			catch {}

			await this.login(username, password);
		});
	}

	/** @inheritDoc */
	public async registerPushNotifications (
		urlPromise: MaybePromise<string>
	) : Promise<void> {
		const url = await urlPromise;
		const messaging = await this.messaging;

		await this.ngZone.runOutsideAngular(async () => {
			let oldMessagingToken = await this.localStorageService
				.getItem('FirebaseDatabaseService.messagingToken', StringProto)
				.catch(() => undefined);

			if (messaging.token) {
				await this.localStorageService.setItem(
					'FirebaseDatabaseService.messagingToken',
					StringProto,
					messaging.token
				);
			}
			else if (oldMessagingToken) {
				messaging.token = oldMessagingToken;
				oldMessagingToken = undefined;
			}

			if (!messaging.token) {
				return;
			}

			const ref = await this.getDatabaseRef(url);

			await Promise.all([
				ref
					.child(messaging.token)
					.set(this.envService.platform)
					.then(),
				oldMessagingToken && oldMessagingToken !== messaging.token ?
					ref
						.child(oldMessagingToken)
						.remove()
						.then() :
					undefined
			]);
		});
	}

	/** @inheritDoc */
	public async removeItem (urlPromise: MaybePromise<string>) : Promise<void> {
		await this.ngZone.runOutsideAngular(async () => {
			const url = await urlPromise;

			(await this.getDatabaseRef(url)).remove().then();
			this.cache.removeItem(url);
		});
	}

	/** @inheritDoc */
	public async setConnectTracker (
		urlPromise: MaybePromise<string>,
		onReconnect?: () => void
	) : Promise<() => void> {
		return this.ngZone.runOutsideAngular(async () => {
			const url = await urlPromise;

			const ref = await this.getDatabaseRef(url);
			const onDisconnect = ref.onDisconnect();

			await onDisconnect.remove().then();

			const sub = this.connectionStatus()
				.pipe(skip(1))
				.subscribe(isConnected => {
					if (!isConnected) {
						return;
					}
					ref.set(firebase.database.ServerValue.TIMESTAMP);
					if (onReconnect) {
						onReconnect();
					}
				});

			await ref.set(firebase.database.ServerValue.TIMESTAMP).then();

			return async () => {
				sub.unsubscribe();
				await ref.remove().then();
				await onDisconnect.cancel().then();
			};
		});
	}

	/** @inheritDoc */
	public async setDisconnectTracker (
		urlPromise: MaybePromise<string>,
		onReconnect?: () => void
	) : Promise<() => void> {
		return this.ngZone.runOutsideAngular(async () => {
			const url = await urlPromise;

			const ref = await this.getDatabaseRef(url);
			const onDisconnect = ref.onDisconnect();

			await onDisconnect
				.set(firebase.database.ServerValue.TIMESTAMP)
				.then();

			const sub = this.connectionStatus()
				.pipe(skip(1))
				.subscribe(isConnected => {
					if (!isConnected) {
						return;
					}
					ref.remove();
					if (onReconnect) {
						onReconnect();
					}
				});

			await ref.remove().then();

			return async () => {
				sub.unsubscribe();
				await ref.set(firebase.database.ServerValue.TIMESTAMP).then();
				await onDisconnect.cancel().then();
			};
		});
	}

	/** @inheritDoc */
	public async setItem<T> (
		urlPromise: MaybePromise<string>,
		proto: IProto<T>,
		value: T
	) : Promise<{
		hash: string;
		url: string;
	}> {
		return this.ngZone.runOutsideAngular(async () =>
			retryUntilSuccessful(async () => {
				const url = await urlPromise;

				const data = await serialize(proto, value);
				const hash = this.potassiumService.toHex(
					await this.potassiumService.hash.hash(data)
				);

				if (
					/* tslint:disable-next-line:possible-timing-attack */
					hash !==
					(await this.getMetadata(url).catch(() => ({
						hash: undefined
					}))).hash
				) {
					if (data.length < this.nonBlobStorageLimit) {
						await (await this.getDatabaseRef(url))
							.set({
								data: this.potassiumService.toBase64(data),
								hash,
								timestamp:
									firebase.database.ServerValue.TIMESTAMP
							})
							.then();
					}
					else {
						await (await this.getStorageRef(url, hash))
							.put(new Blob([data]))
							.then();
						await (await this.getDatabaseRef(url))
							.set({
								hash,
								timestamp:
									firebase.database.ServerValue.TIMESTAMP
							})
							.then();
					}

					/* Download content to verify that upload was successful */
					await this.downloadItem<T>(url, proto, hash).result;

					this.cache.setItem(url, data, hash);
				}

				return {hash, url};
			})
		);
	}

	/** @inheritDoc */
	public async unregister (
		username: string,
		password: string
	) : Promise<void> {
		await this.ngZone.runOutsideAngular(async () => {
			await this.login(username, password);

			const {currentUser} = await (await this.app).auth();
			if (currentUser) {
				await currentUser.delete().then();
			}
		});
	}

	/** @inheritDoc */
	public async unregisterPushNotifications (
		urlPromise: MaybePromise<string>
	) : Promise<void> {
		const url = await urlPromise;
		const messaging = await this.messaging;

		await this.ngZone.runOutsideAngular(async () => {
			if (messaging.cordova) {
				messaging.cordova.unregister();
			}

			const messagingToken = await this.localStorageService
				.getItem('FirebaseDatabaseService.messagingToken', StringProto)
				.catch(() => undefined);

			if (!messagingToken) {
				return;
			}

			await (await this.getDatabaseRef(url))
				.child(messagingToken)
				.remove()
				.then();
		});
	}

	/** @inheritDoc */
	public uploadItem<T> (
		urlPromise: MaybePromise<string>,
		proto: IProto<T>,
		value: T
	) : {
		cancel: () => void;
		progress: Observable<number>;
		result: Promise<{hash: string; url: string}>;
	} {
		const cancel = resolvable();
		const progress = new BehaviorSubject(0);

		const result = this.ngZone.runOutsideAngular(async () => {
			const setItemResult = await this.setItem(urlPromise, proto, value);

			/* TODO: Do this for real */
			this.ngZone.run(() => {
				progress.next(100);
				progress.complete();
			});

			return setItemResult;
		});

		return {cancel: cancel.resolve, progress, result};
	}

	/** @inheritDoc */
	public async waitForUnlock (
		urlPromise: MaybePromise<string>
	) : Promise<{
		reason: string | undefined;
		wasLocked: boolean;
	}> {
		return this.ngZone.runOutsideAngular(
			async () =>
				new Promise<{
					reason: string | undefined;
					wasLocked: boolean;
				}>(async resolve => {
					const url = await urlPromise;

					let reason: string | undefined;
					let wasLocked = false;

					(await await this.getDatabaseRef(url)).on(
						'value',
						async snapshot => {
							const value: {
								[key: string]: {
									claimTimestamp?: number;
									id?: string;
									reason?: string;
									timestamp?: number;
								};
							} = (snapshot && snapshot.val()) || {};

							const timestamp = await getTimestamp();

							const contenders = Object.keys(value)
								.map(k => value[k])
								.filter(
									contender =>
										typeof contender.claimTimestamp ===
											'number' &&
										!isNaN(contender.claimTimestamp) &&
										typeof contender.id === 'string' &&
										typeof contender.timestamp ===
											'number' &&
										!isNaN(contender.timestamp) &&
										timestamp - contender.timestamp <
											this.lockLeaseConfig.expirationLimit
								)
								.sort(
									(a, b) =>
										<number> a.claimTimestamp -
										<number> b.claimTimestamp
								);

							if (contenders.length > 0) {
								reason = contenders[0].reason;
								reason =
									typeof reason === 'string' ?
										reason :
										undefined;
								wasLocked = true;
								return;
							}

							resolve({reason, wasLocked});
						}
					);
				})
		);
	}

	/** @inheritDoc */
	public watch<T> (
		urlPromise: MaybePromise<string>,
		proto: IProto<T>,
		subscriptions?: Subscription[]
	) : Observable<ITimedValue<T>> {
		return getOrSetDefaultObservable(
			this.observableCaches.watch,
			urlPromise,
			() =>
				this.ngZone.runOutsideAngular(
					() =>
						new Observable<ITimedValue<T>>(observer => {
							let cleanup: Function;
							let lastValue: T | undefined;

							/* tslint:disable-next-line:no-null-keyword */
							const onValue = async (
								snapshot: firebase.database.DataSnapshot | null
							) => {
								const url = await urlPromise;

								try {
									if (!snapshot || !snapshot.exists()) {
										throw new Error('Data not found.');
									}

									const result = await (await this.downloadItem(
										url,
										proto
									)).result;

									if (
										result.value !== lastValue &&
										!(
											ArrayBuffer.isView(result.value) &&
											ArrayBuffer.isView(lastValue) &&
											this.potassiumService.compareMemory(
												result.value,
												lastValue
											)
										)
									) {
										this.ngZone.run(() => {
											observer.next(result);
										});
									}

									lastValue = result.value;
								}
								catch {
									const timestamp = await getTimestamp();
									this.ngZone.run(() => {
										observer.next({
											timestamp,
											value: proto.create()
										});
									});
								}
							};

							(async () => {
								const url = await urlPromise;

								const ref = await this.getDatabaseRef(url);
								ref.on('value', onValue);
								cleanup = () => {
									ref.off('value', onValue);
								};
							})();

							return async () => {
								(await waitForValue(() => cleanup))();
							};
						})
				),
			subscriptions
		);
	}

	/** @inheritDoc */
	public watchExists (
		urlPromise: MaybePromise<string>,
		subscriptions?: Subscription[]
	) : Observable<boolean> {
		return getOrSetDefaultObservable(
			this.observableCaches.watchExists,
			urlPromise,
			() =>
				this.ngZone.runOutsideAngular(
					() =>
						new Observable<boolean>(observer => {
							let cleanup: Function;

							/* tslint:disable-next-line:no-null-keyword */
							const onValue = (
								snapshot: firebase.database.DataSnapshot | null
							) => {
								this.ngZone.run(() => {
									observer.next(
										!!snapshot && snapshot.exists()
									);
								});
							};

							(async () => {
								const url = await urlPromise;

								const ref = await this.getDatabaseRef(url);
								ref.on('value', onValue);
								cleanup = () => {
									ref.off('value', onValue);
								};
							})();

							return async () => {
								(await waitForValue(() => cleanup))();
							};
						})
				),
			subscriptions
		);
	}

	/** @inheritDoc */
	public watchList<T> (
		urlPromise: MaybePromise<string>,
		proto: IProto<T>,
		completeOnEmpty: boolean = false,
		subscriptions?: Subscription[]
	) : Observable<ITimedValue<T>[]> {
		return getOrSetDefaultObservable(
			this.observableCaches.watchList,
			urlPromise,
			() =>
				this.ngZone.runOutsideAngular(
					() =>
						new Observable<ITimedValue<T>[]>(observer => {
							let cleanup: Function;

							(async () => {
								const url = await urlPromise;

								const data = new Map<
									string,
									{hash: string; timestamp: number; value: T}
								>();

								const listRef = await this.getDatabaseRef(url);
								let initiated = false;

								const initialValues =
									(await listRef.once('value')).val() || {};

								/* tslint:disable-next-line:no-null-keyword */
								const getValue = async (snapshot: {
									key?: string | null;
									val: () => any;
								}) => {
									if (!snapshot.key) {
										return false;
									}
									const {
										hash,
										timestamp
									} = snapshot.val() || {
										hash: undefined,
										timestamp: undefined
									};
									if (
										typeof hash !== 'string' ||
										typeof timestamp !== 'number'
									) {
										return false;
									}
									data.set(snapshot.key, {
										hash,
										timestamp,
										value: await this.getItem(
											`${url}/${snapshot.key}`,
											proto
										)
									});
									return true;
								};

								const publishList = () => {
									this.ngZone.run(() => {
										observer.next(
											this.getListKeysInternal(data).map(
												k => {
													const o = data.get(k);
													if (!o) {
														throw new Error(
															'Corrupt Map.'
														);
													}
													return {
														timestamp: o.timestamp,
														value: o.value
													};
												}
											)
										);
									});
								};

								const onChildAdded = async (
									/* tslint:disable-next-line:no-null-keyword */
									snapshot: firebase.database.DataSnapshot | null
								) : Promise<void> => {
									if (
										snapshot &&
										snapshot.key &&
										typeof (snapshot.val() || {}).hash !==
											'string'
									) {
										return onChildAdded(
											await this.waitForValue(
												`${url}/${snapshot.key}`
											)
										);
									}
									if (
										!snapshot ||
										!snapshot.key ||
										data.has(snapshot.key) ||
										!(await getValue(snapshot))
									) {
										return;
									}
									publishList();
								};

								/* tslint:disable-next-line:no-null-keyword */
								const onChildChanged = async (
									snapshot: firebase.database.DataSnapshot | null
								) => {
									if (
										!snapshot ||
										!snapshot.key ||
										!(await getValue(snapshot))
									) {
										return;
									}
									publishList();
								};

								/* tslint:disable-next-line:no-null-keyword */
								const onChildRemoved = async (
									snapshot: firebase.database.DataSnapshot | null
								) => {
									if (!snapshot || !snapshot.key) {
										return;
									}
									data.delete(snapshot.key);
									publishList();
								};

								/* tslint:disable-next-line:no-null-keyword */
								const onValue = async (
									snapshot: firebase.database.DataSnapshot | null
								) => {
									if (!initiated) {
										initiated = true;
										return;
									}
									if (!snapshot || snapshot.exists()) {
										return;
									}

									this.ngZone.run(() => {
										observer.complete();
									});
								};

								for (const key of Object.keys(initialValues)) {
									await getValue({
										key,
										val: () => initialValues[key]
									});
								}
								publishList();

								listRef.on('child_added', onChildAdded);
								listRef.on('child_changed', onChildChanged);
								listRef.on('child_removed', onChildRemoved);

								if (completeOnEmpty) {
									listRef.on('value', onValue);
								}

								cleanup = () => {
									listRef.off('child_added', onChildAdded);
									listRef.off(
										'child_changed',
										onChildChanged
									);
									listRef.off(
										'child_removed',
										onChildRemoved
									);
									listRef.off('value', onValue);
								};
							})().catch(() => {
								this.ngZone.run(() => {
									observer.next([]);
								});
								cleanup = () => {};
							});

							return async () => {
								(await waitForValue(() => cleanup))();
							};
						})
				),
			subscriptions
		);
	}

	/** @inheritDoc */
	public watchListKeyPushes (
		urlPromise: MaybePromise<string>,
		subscriptions?: Subscription[]
	) : Observable<{
		key: string;
		previousKey?: string;
	}> {
		return getOrSetDefaultObservable(
			this.observableCaches.watchListKeyPushes,
			urlPromise,
			() =>
				this.ngZone.runOutsideAngular(
					() =>
						new Observable<{
							key: string;
							previousKey?: string;
						}>(observer => {
							let cleanup: Function;

							(async () => {
								const url = await urlPromise;

								const listRef = await this.getDatabaseRef(url);

								/* tslint:disable-next-line:no-null-keyword */
								const onChildAdded = async (
									snapshot: firebase.database.DataSnapshot | null,
									previousKey?: string | null
								) =>
									this.ngZone.run(
										async () : Promise<void> => {
											if (
												snapshot &&
												snapshot.key &&
												typeof (snapshot.val() || {})
													.hash !== 'string'
											) {
												return onChildAdded(
													await this.waitForValue(
														`${url}/${snapshot.key}`
													),
													previousKey
												);
											}
											if (
												!snapshot ||
												!snapshot.exists() ||
												!snapshot.key
											) {
												return;
											}

											observer.next({
												key: snapshot.key,
												previousKey:
													previousKey || undefined
											});
										}
									);

								listRef.on('child_added', onChildAdded);
								cleanup = () => {
									listRef.off('child_added', onChildAdded);
								};
							})().catch(() => {
								cleanup = () => {};
							});

							return async () => {
								(await waitForValue(() => cleanup))();
							};
						})
				),
			subscriptions
		);
	}

	/** @inheritDoc */
	public watchListKeys (
		urlPromise: MaybePromise<string>,
		subscriptions?: Subscription[],
		noFilter: boolean = false
	) : Observable<string[]> {
		return getOrSetDefaultObservable(
			this.observableCaches.watchListKeys,
			urlPromise,
			() =>
				this.ngZone.runOutsideAngular(
					() =>
						new Observable<string[]>(observer => {
							let cleanup: Function;

							(async () => {
								const url = await urlPromise;

								const listRef = await this.getDatabaseRef(url);

								let keys: string[] | undefined;

								/* tslint:disable-next-line:no-null-keyword */
								const onValue = (
									snapshot: firebase.database.DataSnapshot | null
								) => {
									if (!snapshot) {
										keys = undefined;
										this.ngZone.run(() => {
											observer.next([]);
										});
										return;
									}

									const val = snapshot.val() || {};
									const newKeys = this.getListKeysInternal(
										val,
										noFilter
									);

									if (!noFilter) {
										for (
											let i = newKeys.length - 1;
											i >= 0;
											--i
										) {
											const o = val[newKeys[i]];
											if (
												!o ||
												typeof o.hash !== 'string'
											) {
												return;
											}
										}
									}

									if (keys && compareArrays(keys, newKeys)) {
										return;
									}

									keys = Array.from(newKeys);
									this.ngZone.run(() => {
										observer.next(newKeys);
									});
								};

								listRef.on('value', onValue);
								cleanup = () => {
									listRef.off('value', onValue);
								};
							})().catch(() => {
								this.ngZone.run(() => {
									observer.next([]);
								});
								cleanup = () => {};
							});

							return async () => {
								(await waitForValue(() => cleanup))();
							};
						})
				),
			subscriptions
		);
	}

	/** @inheritDoc */
	public watchListPushes<T> (
		urlPromise: MaybePromise<string>,
		proto: IProto<T>,
		completeOnEmpty: boolean = false,
		noCache: boolean = false,
		subscriptions?: Subscription[]
	) : Observable<
		ITimedValue<T> & {key: string; previousKey?: string; url: string}
	> {
		return getOrSetDefaultObservable(
			this.observableCaches.watchListPushes,
			urlPromise,
			() =>
				this.ngZone.runOutsideAngular(
					() =>
						new Observable<
							ITimedValue<T> & {
								key: string;
								previousKey?: string;
								url: string;
							}
						>(observer => {
							let cleanup: Function;

							(async () => {
								const url = await urlPromise;

								const listRef = await this.getDatabaseRef(url);
								let initiated = false;

								/* tslint:disable-next-line:no-null-keyword */
								const onChildAdded = async (
									snapshot: firebase.database.DataSnapshot | null,
									previousKey?: string | null
								) : Promise<void> => {
									if (
										snapshot &&
										snapshot.key &&
										typeof (snapshot.val() || {}).hash !==
											'string'
									) {
										return onChildAdded(
											await this.waitForValue(
												`${url}/${snapshot.key}`
											),
											previousKey
										);
									}
									if (
										!snapshot ||
										!snapshot.exists() ||
										!snapshot.key
									) {
										return;
									}

									const key = snapshot.key;
									const itemUrl = `${url}/${key}`;
									const {
										timestamp,
										value
									} = await (await this.downloadItem(
										itemUrl,
										proto
									)).result;

									this.ngZone.run(() => {
										observer.next({
											key,
											previousKey:
												previousKey || undefined,
											timestamp,
											url: itemUrl,
											value
										});
									});

									if (noCache) {
										this.cache.removeItem(url);
									}
								};

								/* tslint:disable-next-line:no-null-keyword */
								const onValue = async (
									snapshot: firebase.database.DataSnapshot | null
								) => {
									if (!initiated) {
										initiated = true;
										return;
									}
									if (!snapshot || snapshot.exists()) {
										return;
									}

									this.ngZone.run(() => {
										observer.complete();
									});
								};

								listRef.on('child_added', onChildAdded);

								if (completeOnEmpty) {
									listRef.on('value', onValue);
								}

								cleanup = () => {
									listRef.off('child_added', onChildAdded);
									listRef.off('value', onValue);
								};
							})().catch(() => {
								cleanup = () => {};
							});

							return async () => {
								(await waitForValue(() => cleanup))();
							};
						})
				),
			subscriptions
		);
	}

	constructor (
		envService: EnvService,
		localStorageService: LocalStorageService,
		potassiumService: PotassiumService,

		/** @ignore */
		private readonly ngZone: NgZone,

		/** @ignore */
		private readonly notificationService: NotificationService,

		/** @ignore */
		private readonly windowWatcherService: WindowWatcherService,

		/** @ignore */
		private readonly workerService: WorkerService
	) {
		super(envService, localStorageService, potassiumService);

		(async () => {
			while (!this.destroyed.value) {
				await Promise.race([
					sleep(300000),
					this.windowWatcherService.waitForVisibilityChange(true)
				]);

				await this.refreshConnection();
			}
		})();
	}
}
