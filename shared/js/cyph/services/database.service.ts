/* eslint-disable @typescript-eslint/require-await, max-lines */

import {Injectable} from '@angular/core';
import memoize from 'lodash-es/memoize';
import {BehaviorSubject, Observable, Subscription} from 'rxjs';
import {map, mergeMap, take} from 'rxjs/operators';
import {potassiumUtil} from '../crypto/potassium/potassium-util';
import {IAsyncList} from '../iasync-list';
import {IAsyncMap} from '../iasync-map';
import {IAsyncValue} from '../iasync-value';
import {IProto} from '../iproto';
import {ITimedValue} from '../itimed-value';
import {LockFunction} from '../lock-function-type';
import {MaybePromise} from '../maybe-promise-type';
import {BinaryProto, DatabaseItem, IDatabaseItem} from '../proto';
import {DataManagerService} from '../service-interfaces/data-manager.service';
import {flattenArrays} from '../util/arrays';
import {
	getOrSetDefault,
	getOrSetDefaultAsync
} from '../util/get-or-set-default';
import {lockFunction} from '../util/lock';
import {debugLog} from '../util/log';
import {getTimestamp} from '../util/time';
import {PotassiumService} from './crypto/potassium.service';
import {EnvService} from './env.service';
import {LocalStorageService} from './local-storage.service';

/**
 * Provides online database and storage functionality.
 */
@Injectable()
export class DatabaseService extends DataManagerService {
	/** Cache manager. */
	protected readonly cache = {
		metadata: {
			_getKey: (url: string) => `DatabaseService/metadata/${url}`,
			getItem: async (url: string) =>
				this.localStorageService.getItem(
					this.cache.metadata._getKey(url),
					DatabaseItem
				),
			getOrSetDefault: async (
				url: string,
				defaultValue: () => MaybePromise<IDatabaseItem>
			) =>
				this.localStorageService.getOrSetDefault(
					this.cache.metadata._getKey(url),
					DatabaseItem,
					defaultValue
				),
			hasItem: async (url: string) =>
				this.localStorageService.hasItem(
					this.cache.metadata._getKey(url)
				),
			removeItem: async (url: string) =>
				this.localStorageService.removeItem(
					this.cache.metadata._getKey(url)
				),
			setItem: async (url: string, value: IDatabaseItem) =>
				this.localStorageService.setItem(
					this.cache.metadata._getKey(url),
					DatabaseItem,
					value
				)
		},
		removeItem: async (url: string) => {
			await this.cache.value.removeItem(url).catch(() => {});
			await this.cache.metadata.removeItem(url).catch(() => {});
		},
		setItem: async (
			url: string,
			data: Uint8Array,
			hash: string,
			timestamp?: number
		) => {
			await Promise.all([
				(async () => {
					if (timestamp === undefined) {
						timestamp = await getTimestamp();
					}
					return this.cache.metadata.setItem(url, {hash, timestamp});
				})(),
				this.cache.value.setItem({hash, url}, BinaryProto, data)
			]);
		},
		value: {
			_getKeys: async <T>(
				url: string | {hash: string; url: string},
				all: boolean,
				callback: (key: string) => Promise<T>
			) => {
				const keys =
					typeof url === 'string' ?
						[
							`DatabaseService/value-url/${url}`,
							this.cache.metadata
								.getItem(url)
								.then(
									o => `DatabaseService/value-hash/${o.hash}`
								)
								.catch(() => undefined)
						] :
						[
							`DatabaseService/value-hash/${url.hash}`,
							`DatabaseService/value-url/${url.url}`
						];

				if (!all) {
					let lastErr: any;
					for (const keyPromise of keys) {
						const key = await keyPromise;
						if (key === undefined) {
							continue;
						}

						try {
							return await callback(key);
						}
						catch (err) {
							lastErr = err;
						}
					}
					throw lastErr;
				}

				const promises = [];
				for (const keyPromise of keys) {
					const key = await keyPromise;
					if (key === undefined) {
						continue;
					}

					promises.push(callback(key));
				}
				return (await promises)[0];
			},
			getItem: async <T>(
				url: string | {hash: string; url: string},
				proto: IProto<T>
			) =>
				this.cache.value._getKeys(url, false, async key =>
					this.localStorageService.getItem(key, proto)
				),
			getOrSetDefault: async <T>(
				url: string | {hash: string; url: string},
				proto: IProto<T>,
				defaultValue: () => MaybePromise<T>
			) => {
				try {
					return await this.cache.value.getItem(url, proto);
				}
				catch {
					const value = await defaultValue();
					this.cache.value.setItem(url, proto, value).catch(() => {});
					return value;
				}
			},
			hasItem: async (url: string | {hash: string; url: string}) =>
				this.cache.value._getKeys(url, false, async key =>
					this.localStorageService.hasItem(key)
				),
			removeItem: async (url: string | {hash: string; url: string}) =>
				this.cache.value._getKeys(url, true, async key =>
					this.localStorageService.removeItem(key)
				),
			setItem: async <T>(
				url: string | {hash: string; url: string},
				proto: IProto<T>,
				value: T
			) =>
				this.cache.value._getKeys(url, true, async key =>
					this.localStorageService.setItem(key, proto, value)
				)
		}
	};

	/** Configuration of DatabaseService.lock leasing algorithm. */
	protected readonly lockLeaseConfig = {
		expirationLimit: 180000,
		expirationLowerLimit: 120000,
		updateInterval: 30000
	};

	/** Namespace for database usage. */
	public readonly namespace: string =
		this.envService.environment.customBuild !== undefined ?
			this.envService.environment.customBuild.namespace :
			'cyph.ws';

	/** Salt used for miscellaneous server-stored password hashes. */
	public readonly salt: string =
		this.namespace + 'Eaf60vuVWm67dNISjm6qdTGqgEhIW4Oes+BTsiuNjvs=';

	/** Gets lock URL. */
	protected async lockURL (
		urlPromise: MaybePromise<string>,
		global: boolean
	) : Promise<string> {
		return !global ?
			urlPromise :
			`locks/${this.potassiumService.toHex(
				await this.potassiumService.hash.hash(await urlPromise)
			)}`;
	}

	/** Adds namespace to URL. */
	protected processURL (url: string) : string {
		return `${this.namespace.replace(/\./g, '_')}/${url.replace(
			/^\//,
			''
		)}`;
	}

	/** Calls a function. */
	public async callFunction (
		_NAME: string,
		_DATA?: Record<string, any>
	) : Promise<any> {
		throw new Error(
			'Must provide an implementation of DatabaseService.callFunction.'
		);
	}

	/** Changes password. */
	public async changePassword (
		_USERNAME: string,
		_OLD_PASSWORD: string,
		_NEW_PASSWORD: string
	) : Promise<void> {
		throw new Error(
			'Must provide an implementation of DatabaseService.changePassword.'
		);
	}

	/**
	 * Checks whether a disconnect is registered at the specified URL.
	 * @returns True if disconnected.
	 * @see setDisconnectTracker
	 */
	public async checkDisconnected (
		_URL: MaybePromise<string>
	) : Promise<boolean> {
		throw new Error(
			'Must provide an implementation of DatabaseService.checkDisconnected.'
		);
	}

	/** Tracks whether this client is connected to the database. */
	public connectionStatus () : Observable<boolean> {
		throw new Error(
			'Must provide an implementation of DatabaseService.connectionStatus.'
		);
	}

	/** Downloads value and gives progress. */
	public downloadItem<T> (
		_URL: MaybePromise<string>,
		_PROTO: IProto<T>
	) : {
		alreadyCached: Promise<boolean>;
		progress: Observable<number>;
		result: Promise<ITimedValue<T>>;
	} {
		throw new Error(
			'Must provide an implementation of DatabaseService.downloadItem.'
		);
	}

	/** Gets an IAsyncList wrapper for a list. */
	public getAsyncList<T> (
		url: string,
		proto: IProto<T>,
		lockFactory: (url: string) => LockFunction = k => this.lockFunction(k),
		subscriptions?: Subscription[]
	) : IAsyncList<T> {
		const lock = lockFactory(url);
		const localLock = lockFunction();

		/* See https://github.com/Microsoft/tslint-microsoft-contrib/issues/381 */
		/* eslint-disable-next-line @typescript-eslint/tslint/config */
		const asyncList: IAsyncList<T> = {
			clear: async () => this.removeItem(url),
			getFlatValue: async () =>
				(await asyncList.getValue()).reduce<any>(
					(a, b) => a.concat(b),
					[]
				),
			getValue: async () =>
				localLock(async () => this.getList(url, proto)),
			lock,
			pushItem: async value =>
				localLock(async () => {
					await this.pushItem(url, proto, value);
				}),
			setValue: async value =>
				localLock(async () => this.setList(url, proto, value)),
			subscribeAndPop: f => this.subscribeAndPop(url, proto, f),
			updateValue: async f =>
				asyncList.lock(async () =>
					asyncList.setValue(await f(await asyncList.getValue()))
				),
			watch: memoize(() =>
				this.watchList(url, proto, undefined, subscriptions).pipe(
					map<ITimedValue<T>[], T[]>(arr => arr.map(o => o.value))
				)
			),
			watchFlat: memoize((omitDuplicates?: boolean) =>
				asyncList
					.watch()
					.pipe<any>(map(arr => flattenArrays(arr, omitDuplicates)))
			),
			watchPushes: memoize(() =>
				this.watchListPushes(
					url,
					proto,
					undefined,
					undefined,
					subscriptions
				).pipe(map<ITimedValue<T>, T>(o => o.value))
			)
		};

		return asyncList;
	}

	/**
	 * Gets an IAsyncMap wrapper for a map.
	 * @param staticValues If true, values will be assumed to never change once set.
	 */
	public getAsyncMap<T> (
		url: string,
		proto: IProto<T>,
		lockFactory: (url: string) => LockFunction = k => this.lockFunction(k),
		staticValues: boolean = false,
		subscriptions?: Subscription[]
	) : IAsyncMap<string, T> {
		const lock = lockFactory(url);
		const localLock = lockFunction();
		const itemLocks = new Map<string, LockFunction>();
		const itemCache = staticValues ? new Map<string, T>() : undefined;

		const lockItem = (key: string) =>
			getOrSetDefault(itemLocks, key, () => lockFactory(`${url}/${key}`));

		const getItemInternal = async (key: string) => {
			const f = async () => this.getItem(`${url}/${key}`, proto);

			if (!staticValues) {
				return f();
			}

			return getOrSetDefaultAsync(itemCache, key, async () =>
				this.cache.value.getOrSetDefault(`${url}/${key}`, proto, f)
			);
		};

		const getItem = staticValues ?
			getItemInternal :
			async (key: string) =>
				lockItem(key)(async () => getItemInternal(key));

		const getValueHelper = async (keys: string[]) =>
			new Map<string, T>(
				await Promise.all(
					keys.map(
						async (key) : Promise<[string, T]> => [
							key,
							await getItem(key)
						]
					)
				)
			);

		const removeItemInternal = async (key: string) => {
			if (itemCache) {
				itemCache.delete(key);
			}

			await Promise.all([
				this.removeItem(`${url}/${key}`),
				staticValues ?
					this.cache.removeItem(`${url}/${key}`) :
					undefined
			]);
		};

		const setItemInternal = async (key: string, value: T) => {
			if (itemCache) {
				itemCache.set(key, value);
			}

			await Promise.all<any>([
				this.setItem(`${url}/${key}`, proto, value)
			]);
		};

		const watchKeys = memoize(() => this.watchListKeys(url, subscriptions));

		/* See https://github.com/Microsoft/tslint-microsoft-contrib/issues/381 */
		/* eslint-disable-next-line @typescript-eslint/tslint/config */
		const asyncMap: IAsyncMap<string, T> = {
			clear: async () => this.removeItem(url),
			getItem,
			getKeys: async () => this.getListKeys(url),
			getValue: async () =>
				localLock(async () => getValueHelper(await asyncMap.getKeys())),
			hasItem: async key =>
				lockItem(key)(async () => this.hasItem(`${url}/${key}`)),
			lock,
			removeItem: async key =>
				lockItem(key)(async () => removeItemInternal(key)),
			setItem: async (key, value) =>
				lockItem(key)(async () => setItemInternal(key, value)),
			setValue: async mapValue =>
				localLock(async () => {
					await asyncMap.clear();
					await Promise.all(
						Array.from(
							mapValue.entries()
						).map(async ([key, value]) =>
							asyncMap.setItem(key, value)
						)
					);
				}),
			size: async () => (await asyncMap.getKeys()).length,
			updateItem: async (key, f) =>
				lockItem(key)(async () => {
					const value = await getItemInternal(key).catch(
						() => undefined
					);
					let newValue: T | undefined;
					try {
						newValue = await f(value);
					}
					catch {
						return;
					}
					if (newValue === undefined) {
						await removeItemInternal(key);
					}
					else {
						await setItemInternal(key, newValue);
					}
				}),
			updateValue: async f =>
				asyncMap.lock(async () =>
					asyncMap.setValue(await f(await asyncMap.getValue()))
				),
			watch: memoize(() => watchKeys().pipe(mergeMap(getValueHelper))),
			watchKeys,
			watchSize: memoize(() => watchKeys().pipe(map(keys => keys.length)))
		};

		return asyncMap;
	}

	/**
	 * Gets an IAsyncValue wrapper for an item.
	 * @param blockGetValue If true, getValue will block until a value is set.
	 * Otherwise, when a value has not been set, a default value will be returned.
	 */
	public getAsyncValue<T> (
		url: string,
		proto: IProto<T>,
		lockFactory: (k: string) => LockFunction = k => this.lockFunction(k),
		blockGetValue: boolean = false,
		subscriptions?: Subscription[]
	) : IAsyncValue<T> {
		const lock = lockFactory(url);
		const localLock = lockFunction();

		let currentHash: string | undefined;
		let currentValue = proto.create();

		localLock(async () => {
			try {
				const {hash} = await this.cache.metadata.getItem(url);
				currentValue = await this.cache.value.getItem(
					{hash, url},
					proto
				);
				currentHash = hash;
			}
			catch {}
		});

		/* See https://github.com/Microsoft/tslint-microsoft-contrib/issues/381 */
		/* eslint-disable-next-line @typescript-eslint/tslint/config */
		const asyncValue: IAsyncValue<T> = {
			getValue: async () =>
				localLock(
					async () : Promise<T> => {
						const {hash} = await this.getMetadata(url);

						/* eslint-disable-next-line @typescript-eslint/tslint/config */
						if (currentHash === hash) {
							return currentValue;
						}

						if (ArrayBuffer.isView(currentValue)) {
							potassiumUtil.clearMemory(currentValue);
						}

						const value = await this.getItem(url, proto);

						/* eslint-disable-next-line @typescript-eslint/tslint/config */
						if (hash !== (await this.getMetadata(url)).hash) {
							return asyncValue.getValue();
						}

						currentHash = hash;
						currentValue = value;

						return currentValue;
					}
				).catch(async () =>
					blockGetValue ?
						asyncValue
							.watch()
							.pipe(take(2))
							.toPromise() :
						proto.create()
				),
			lock,
			setValue: async value =>
				localLock(async () => {
					const oldValue = currentValue;

					currentHash = (await this.setItem(url, proto, value)).hash;
					currentValue = value;

					if (ArrayBuffer.isView(oldValue)) {
						potassiumUtil.clearMemory(oldValue);
					}
				}),
			updateValue: async f =>
				asyncValue.lock(async () => {
					const value = await asyncValue.getValue();
					let newValue: T;
					try {
						newValue = await f(value);
					}
					catch {
						return;
					}
					await asyncValue.setValue(newValue);
				}),
			watch: memoize(() =>
				this.watch(url, proto, subscriptions).pipe(
					map<ITimedValue<T>, T>(o => o.value)
				)
			)
		};

		return asyncValue;
	}

	/** @inheritDoc */
	public async getItem<T> (url: string, proto: IProto<T>) : Promise<T> {
		return (await (await this.downloadItem(url, proto)).result).value;
	}

	/** Gets most recently added key of a list/map. */
	public async getLatestKey (
		_URL: MaybePromise<string>
	) : Promise<string | undefined> {
		throw new Error(
			'Must provide an implementation of DatabaseService.getLatestKey.'
		);
	}

	/** Gets a list of values. */
	public async getList<T> (
		_URL: MaybePromise<string>,
		_PROTO: IProto<T>
	) : Promise<T[]> {
		throw new Error(
			'Must provide an implementation of DatabaseService.getList.'
		);
	}

	/** Gets the keys of a list. */
	public async getListKeys (
		_URL: MaybePromise<string>,
		_NO_FILTER?: boolean
	) : Promise<string[]> {
		throw new Error(
			'Must provide an implementation of DatabaseService.getListKeys.'
		);
	}

	/** Gets the latest metadata known by the database. */
	public async getMetadata (
		_URL: MaybePromise<string>
	) : Promise<{
		data?: string;
		hash: string;
		timestamp: number;
	}> {
		throw new Error(
			'Must provide an implementation of DatabaseService.getMetadata.'
		);
	}

	/** Checks whether item value is already locally cached. */
	public async isCached (url: MaybePromise<string>) : Promise<boolean> {
		return this.cache.value.hasItem(await url);
	}

	/** Executes a Promise within a mutual-exclusion lock in FIFO order. */
	public async lock<T> (
		_URL: MaybePromise<string>,
		_F: (o: {
			reason?: string;
			stillOwner: BehaviorSubject<boolean>;
		}) => Promise<T>,
		_REASON?: string,
		_GLOBAL?: boolean
	) : Promise<T> {
		throw new Error(
			'Must provide an implementation of DatabaseService.lock.'
		);
	}

	/** Creates and returns a lock function that uses DatabaseService.lock. */
	public lockFunction (url: string, global?: boolean) : LockFunction {
		return async <T>(
			f: (o: {
				reason?: string;
				stillOwner: BehaviorSubject<boolean>;
			}) => Promise<T>,
			reason?: string
		) => this.lock(url, f, reason, global);
	}

	/** Checks whether a lock is currently claimed and what the specified reason is. */
	public async lockStatus (
		_URL: MaybePromise<string>
	) : Promise<{
		locked: boolean;
		reason: string | undefined;
	}> {
		throw new Error(
			'Must provide an implementation of DatabaseService.lockStatus.'
		);
	}

	/** Logs in. */
	public async login (_USERNAME: string, _PASSWORD: string) : Promise<void> {
		throw new Error(
			'Must provide an implementation of DatabaseService.login.'
		);
	}

	/** Logs out. */
	public async logout () : Promise<void> {
		throw new Error(
			'Must provide an implementation of DatabaseService.logout.'
		);
	}

	/**
	 * Pushes an item to a list.
	 * @returns Item database hash and URL.
	 */
	public async pushItem<T> (
		_URL: MaybePromise<string>,
		_PROTO: IProto<T>,
		_VALUE:
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
		throw new Error(
			'Must provide an implementation of DatabaseService.pushItem.'
		);
	}

	/** Registers. */
	public async register (
		_USERNAME: string,
		_PASSWORD: string
	) : Promise<void> {
		throw new Error(
			'Must provide an implementation of DatabaseService.register.'
		);
	}

	/** Registers a token with the database server for push notifications. */
	public async registerPushNotifications (
		_URL: MaybePromise<string>
	) : Promise<void> {
		throw new Error(
			'Must provide an implementation of DatabaseService.registerPushNotifications.'
		);
	}

	/** Tracks connects at the specfied URL. */
	public async setConnectTracker (
		_URL: MaybePromise<string>,
		_ON_RECONNECT?: () => void
	) : Promise<() => void> {
		throw new Error(
			'Must provide an implementation of DatabaseService.setConnectTracker.'
		);
	}

	/** Tracks disconnects at the specfied URL. */
	public async setDisconnectTracker (
		_URL: MaybePromise<string>,
		_ON_RECONNECT?: () => void
	) : Promise<() => void> {
		throw new Error(
			'Must provide an implementation of DatabaseService.setDisconnectTracker.'
		);
	}

	/**
	 * Sets an item's value.
	 * @returns Item database hash and URL.
	 */
	public async setItem<T> (
		url: MaybePromise<string>,
		proto: IProto<T>,
		value: T,
		confirmSuccess?: boolean
	) : Promise<{
		hash: string;
		url: string;
	}> {
		return this.uploadItem(url, proto, value, confirmSuccess).result;
	}

	/** Sets a list's value. */
	public async setList<T> (
		url: string,
		proto: IProto<T>,
		value: T[]
	) : Promise<void> {
		await this.removeItem(url);
		for (const v of value) {
			await this.pushItem(url, proto, v);
		}
	}

	/**
	 * Subscribes to pushed values and deletes them.
	 * @param f Subscribing function; throws exception to abort deletion.
	 */
	public subscribeAndPop<T> (
		url: string,
		proto: IProto<T>,
		f: (value: T) => MaybePromise<void>,
		subscriptions?: Subscription[]
	) : Subscription {
		const lock = lockFunction();

		return this.watchListKeyPushes(url, subscriptions).subscribe(
			async ({key}) => {
				const fullURL = Promise.resolve(url).then(s => `${s}/${key}`);

				const promise = fullURL
					.then(async s => this.getItem(s, proto))
					.then(f);

				await lock(async () => {
					try {
						await promise;
						await this.removeItem(await fullURL);
					}
					catch (err) {
						debugLog(() => ({databaseSubscribeAndPopError: err}));
					}
				});
			}
		);
	}

	/** Deletes account and logs out. */
	public async unregister (
		_USERNAME: string,
		_PASSWORD: string
	) : Promise<void> {
		throw new Error(
			'Must provide an implementation of DatabaseService.unregister.'
		);
	}

	/** Unegisters a push notification token from the database server. */
	public async unregisterPushNotifications (
		_URL: MaybePromise<string>
	) : Promise<void> {
		throw new Error(
			'Must provide an implementation of DatabaseService.unregisterPushNotifications.'
		);
	}

	/** Uploads value and gives progress. */
	public uploadItem<T> (
		_URL: MaybePromise<string>,
		_PROTO: IProto<T>,
		_VALUE: T,
		_CONFIRM_SUCCESS?: boolean
	) : {
		cancel: () => void;
		progress: Observable<number>;
		result: Promise<{hash: string; url: string}>;
	} {
		throw new Error(
			'Must provide an implementation of DatabaseService.uploadItem.'
		);
	}

	/** Waits for lock to be released. */
	public async waitForUnlock (
		_URL: MaybePromise<string>
	) : Promise<{
		reason: string | undefined;
		wasLocked: boolean;
	}> {
		throw new Error(
			'Must provide an implementation of DatabaseService.waitForUnlock.'
		);
	}

	/** Subscribes to a value. */
	public watch<T> (
		_URL: MaybePromise<string>,
		_PROTO: IProto<T>,
		_SUBSCRIPTIONS?: Subscription[]
	) : Observable<ITimedValue<T>> {
		throw new Error(
			'Must provide an implementation of DatabaseService.watch.'
		);
	}

	/** Subscribes to whether or not a value exists. */
	public watchExists (
		_URL: MaybePromise<string>,
		_SUBSCRIPTIONS?: Subscription[]
	) : Observable<boolean> {
		throw new Error(
			'Must provide an implementation of DatabaseService.watchExists.'
		);
	}

	/** Subscribes to a list of values. */
	public watchList<T> (
		_URL: MaybePromise<string>,
		_PROTO: IProto<T>,
		_COMPLETE_ON_EMPTY: boolean = false,
		_SUBSCRIPTIONS?: Subscription[]
	) : Observable<ITimedValue<T>[]> {
		throw new Error(
			'Must provide an implementation of DatabaseService.watchList.'
		);
	}

	/** Subscribes to new keys of a list. */
	public watchListKeyPushes (
		_URL: MaybePromise<string>,
		_SUBSCRIPTIONS?: Subscription[]
	) : Observable<{
		key: string;
		previousKey?: string;
	}> {
		throw new Error(
			'Must provide an implementation of DatabaseService.watchListKeyPushes.'
		);
	}

	/** Subscribes to the keys of a list. */
	public watchListKeys (
		_URL: MaybePromise<string>,
		_SUBSCRIPTIONS?: Subscription[],
		_NO_FILTER?: boolean
	) : Observable<string[]> {
		throw new Error(
			'Must provide an implementation of DatabaseService.watchListKeys.'
		);
	}

	/** Subscribes to new values pushed onto a list. */
	public watchListPushes<T> (
		_URL: MaybePromise<string>,
		_PROTO: IProto<T>,
		_COMPLETE_ON_EMPTY: boolean = false,
		_NO_CACHE: boolean = false,
		_SUBSCRIPTIONS?: Subscription[]
	) : Observable<
		ITimedValue<T> & {key: string; previousKey?: string; url: string}
	> {
		throw new Error(
			'Must provide an implementation of DatabaseService.watchListPushes.'
		);
	}

	constructor (
		/** @see EnvService */
		protected readonly envService: EnvService,

		/** @see LocalStorageService */
		protected readonly localStorageService: LocalStorageService,

		/** @ignore */
		protected readonly potassiumService: PotassiumService
	) {
		super();
	}
}
