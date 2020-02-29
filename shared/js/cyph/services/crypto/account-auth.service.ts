/* eslint-disable max-lines */

import {Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';
import {BaseProvider} from '../../base-provider';
import {IProto} from '../../iproto';
import {
	AccountContactState,
	AccountLoginData,
	AccountUserProfile,
	AccountUserProfileExtra,
	AccountUserTypes,
	AGSEPKICSR,
	BinaryProto,
	BooleanProto,
	IAccountContactState,
	IAccountLoginData,
	IAccountUserProfile,
	IAccountUserProfileExtra,
	IAGSEPKICSR,
	IKeyPair,
	KeyPair,
	NumberProto,
	StringProto
} from '../../proto';
import {normalize} from '../../util/formatting';
import {debugLog} from '../../util/log';
import {deserialize, serialize} from '../../util/serialization';
import {getTimestamp} from '../../util/time';
import {uuid} from '../../util/uuid';
import {sleep} from '../../util/wait';
import {closeWindow} from '../../util/window';
import {AccountUserLookupService} from '../account-user-lookup.service';
import {AnalyticsService} from '../analytics.service';
import {ConfigService} from '../config.service';
import {DatabaseService} from '../database.service';
import {EnvService} from '../env.service';
import {ErrorService} from '../error.service';
import {FingerprintService} from '../fingerprint.service';
import {LocalStorageService} from '../local-storage.service';
import {AccountDatabaseService} from './account-database.service';
import {PotassiumService} from './potassium.service';

/**
 * Account authentication service.
 */
@Injectable()
export class AccountAuthService extends BaseProvider {
	/** @ignore */
	private connectTrackerCleanup?: () => void;

	/** If true, the login prompt will be used to create a pseudo-account. */
	public readonly pseudoAccountLogin = new BehaviorSubject<boolean>(false);

	/** @ignore */
	private async getItem<T> (
		url: string,
		proto: IProto<T>,
		key: Uint8Array
	) : Promise<T> {
		return deserialize(
			proto,
			await this.potassiumService.secretBox.open(
				await this.databaseService.getItem(url, BinaryProto),
				key,
				`${
					this.databaseService.namespace
				}:${await this.accountDatabaseService.normalizeURL(url)}`
			)
		);
	}

	/** @ignore */
	private async passwordHash (
		username: string,
		password?: string
	) : Promise<Uint8Array> {
		if (password === undefined) {
			return new Uint8Array(0);
		}

		username = normalize(username);

		return (await this.potassiumService.passwordHash.hash(
			password,
			username + '9BdfYbI5PggWwtnaAXbDRIsTHgMjLx/8hbHvgbQb+qs='
		)).hash;
	}

	/** @ignore */
	private async setItem<T> (
		url: string,
		proto: IProto<T>,
		data: T,
		key: Uint8Array,
		isPublic: boolean = false,
		compressed: boolean = false,
		skipSetItem: boolean = false
	) : Promise<Uint8Array> {
		url = await this.accountDatabaseService.normalizeURL(url);

		const accountFormattedData = {
			url: `${this.databaseService.namespace}:${url}`,
			value: await serialize(proto, data)
		};

		const bytes = isPublic ?
			await this.potassiumService.sign.sign(
				accountFormattedData.value,
				key,
				accountFormattedData.url,
				compressed
			) :
			await this.potassiumService.secretBox.seal(
				accountFormattedData.value,
				key,
				accountFormattedData.url
			);

		if (!skipSetItem) {
			await this.databaseService.setItem(url, BinaryProto, bytes);
		}

		return bytes;
	}

	/** Changes master key. */
	public async changeMasterKey (
		masterKey: string,
		saveCredentials: boolean = false,
		changeDatabasePassword: boolean = true
	) : Promise<void> {
		const currentUser = await this.accountDatabaseService.getCurrentUser();

		if (!currentUser.user.username || masterKey.length === 0) {
			return;
		}

		const url = `users/${currentUser.user.username}/loginData`;
		const symmetricKey = await this.passwordHash(
			currentUser.user.username,
			masterKey
		);

		const newLoginData = !changeDatabasePassword ?
			currentUser.loginData :
			{
				...currentUser.loginData,
				oldSecondaryPassword: currentUser.loginData.secondaryPassword,
				secondaryPassword: this.potassiumService.toBase64(
					this.potassiumService.randomBytes(64)
				)
			};

		await Promise.all<{}>([
			this.setItem(url, AccountLoginData, newLoginData, symmetricKey),
			!saveCredentials ?
				this.removeSavedCredentials() :
				(async () => {
					const pinHash = await this.localStorageService
						.getItem('pinHash', BinaryProto, undefined, true)
						.catch(() => undefined);

					return this.localStorageService.setItem(
						'masterKey',
						BinaryProto,
						/* Locally encrypt master key with PIN */
						pinHash !== undefined ?
							await this.potassiumService.secretBox.seal(
								symmetricKey,
								pinHash
							) :
							symmetricKey,
						undefined,
						undefined,
						true
					);
				})()
		]);

		if (!changeDatabasePassword) {
			return;
		}

		try {
			try {
				await this.databaseService.changePassword(
					currentUser.user.username,
					currentUser.loginData.secondaryPassword,
					newLoginData.secondaryPassword
				);
			}
			catch (err) {
				if (currentUser.loginData.oldSecondaryPassword) {
					await this.databaseService.changePassword(
						currentUser.user.username,
						currentUser.loginData.oldSecondaryPassword,
						newLoginData.secondaryPassword
					);

					newLoginData.oldSecondaryPassword =
						currentUser.loginData.oldSecondaryPassword;

					await this.setItem(
						url,
						AccountLoginData,
						newLoginData,
						symmetricKey
					);
				}
				else {
					throw err;
				}
			}

			currentUser.loginData = newLoginData;
		}
		catch (err) {
			try {
				await this.setItem(
					url,
					AccountLoginData,
					currentUser.loginData,
					symmetricKey
				);
			}
			catch {
				throw err;
			}
		}
	}

	/** Changes lock screen password. */
	public async changePIN (pin: {
		isCustom: boolean;
		value: string;
	}) : Promise<void> {
		const currentUser = await this.accountDatabaseService.getCurrentUser();

		if (!currentUser.user.username || !pin.value) {
			return;
		}

		await Promise.all([
			this.setItem(
				`users/${currentUser.user.username}/pin/hash`,
				BinaryProto,
				await this.passwordHash(currentUser.user.username, pin.value),
				currentUser.keys.symmetricKey
			),
			this.setItem(
				`users/${currentUser.user.username}/pin/isCustom`,
				BooleanProto,
				pin.isCustom,
				currentUser.keys.symmetricKey
			),
			this.removeSavedCredentials()
		]);
	}

	/** Tries to get saved PIN hash. */
	public async getSavedPIN () : Promise<Uint8Array | undefined> {
		const removePIN = async () =>
			Promise.all([
				this.localStorageService.removeItem('pinDuration'),
				this.localStorageService.removeItem('pinHash'),
				this.localStorageService.removeItem('pinTimestamp')
			]);

		try {
			const pinHash = await this.localStorageService.getItem(
				'pinHash',
				BinaryProto,
				undefined,
				true
			);
			if (pinHash.length === 0) {
				return pinHash;
			}

			if (await this.fingerprintService.supported) {
				if (await this.fingerprintService.authenticate()) {
					return this.savePIN(pinHash);
				}

				await removePIN();
				return;
			}

			const [
				masterKeyUnconfirmed,
				pinDuration,
				pinTimestamp,
				timestamp
			] = await Promise.all([
				this.localStorageService.hasItem('unconfirmedMasterKey', true),
				this.localStorageService.getItem(
					'pinDuration',
					NumberProto,
					undefined,
					true
				),
				this.localStorageService.getItem(
					'pinTimestamp',
					NumberProto,
					undefined,
					true
				),
				getTimestamp()
			]);

			if (
				masterKeyUnconfirmed ||
				timestamp > pinDuration + pinTimestamp
			) {
				await removePIN();
			}
			else {
				return this.savePIN(pinHash);
			}
		}
		catch {}

		return;
	}

	/** Indicates whether credentials are saved locally. */
	public async hasSavedCredentials () : Promise<boolean> {
		return (
			(await Promise.all(
				['masterKey', 'pinIsCustom', 'username'].map(async k =>
					this.localStorageService.hasItem(k, true)
				)
			)).filter(b => !b).length < 1
		);
	}

	/** Removes PIN from local storage. */
	public async lock (reload: boolean = true) : Promise<void> {
		await this.localStorageService.removeItem('pinHash');

		if (!reload) {
			return;
		}

		if ((<any> self).androidBackbuttonReady) {
			(<any> self).plugins.appMinimize.minimize();
		}

		closeWindow();
	}

	/**
	 * Logs in.
	 * @returns Whether login was successful.
	 */
	/* eslint-disable-next-line complexity */
	public async login (
		username: string,
		masterKey: string | Uint8Array,
		pin?: string | Uint8Array
	) : Promise<boolean> {
		await this.logout(false);

		if (!username || masterKey.length === 0) {
			return false;
		}

		let errorLogMessage: string | undefined;

		const setErrorMessageLog = (s: string) => {
			errorLogMessage = s;
			debugLog(() => ({accountAuthLoginMessage: s}));
		};

		try {
			username = normalize(username);

			if (
				this.envService.isCordova &&
				this.configService.betaTestUsers.has(username) &&
				/* eslint-disable-next-line @typescript-eslint/tslint/config */
				localStorage.getItem('betaTestUser') !== 'true'
			) {
				try {
					/* eslint-disable-next-line @typescript-eslint/tslint/config */
					localStorage.setItem('betaTestUser', 'true');
					/* eslint-disable-next-line @typescript-eslint/tslint/config */
					localStorage.removeItem('webSignPackageTimestamp');
				}
				catch {}
			}

			if (typeof masterKey === 'string') {
				setErrorMessageLog('password-hashing masterKey');

				masterKey = await this.passwordHash(username, masterKey);
			}
			else if (pin !== undefined && pin.length > 0) {
				setErrorMessageLog('decrypting masterKey with PIN');

				masterKey = await this.potassiumService.secretBox.open(
					masterKey,
					typeof pin !== 'string' ?
						pin :
						await this.passwordHash(username, pin)
				);
			}

			setErrorMessageLog('getting loginData');

			const loginDataPromise = this.getItem(
				`users/${username}/loginData`,
				AccountLoginData,
				masterKey
			);

			const userPromise = this.accountUserLookupService.getUser(username);

			const agseConfirmedPromise = this.accountUserLookupService.exists(
				username,
				true
			);

			const loginData = await loginDataPromise;

			setErrorMessageLog('getting user data');

			const getUserData = async () =>
				Promise.all([
					agseConfirmedPromise,
					(async () => {
						/* Temporary workaround for migrating users to latest Potassium.Box */

						const kp = await this.getItem<IKeyPair>(
							`users/${username}/encryptionKeyPair`,
							KeyPair,
							loginData.symmetricKey
						);

						if (
							kp.publicKey.length ===
							(await this.potassiumService.box.publicKeyBytes)
						) {
							return kp;
						}

						debugLog(
							() => 'Regenerating encryption key pair',
							() => ({oldEncryptionKeyPair: kp})
						);

						const newEncryptionKeyPair = await this.potassiumService.box.keyPair();

						await Promise.all([
							this.setItem(
								`users/${username}/encryptionKeyPair`,
								KeyPair,
								newEncryptionKeyPair,
								loginData.symmetricKey
							),
							this.setItem(
								`users/${username}/publicEncryptionKey`,
								BinaryProto,
								newEncryptionKeyPair.publicKey,
								(await this.getItem(
									`users/${username}/signingKeyPair`,
									KeyPair,
									loginData.symmetricKey
								)).privateKey,
								true,
								true
							)
						]);

						debugLog(
							() => 'Regenerated encryption key pair',
							() => ({newEncryptionKeyPair})
						);

						return newEncryptionKeyPair;
					})(),
					this.localStorageService
						.hasItem('unconfirmedMasterKey', true)
						.then(b => !b),
					this.getItem(
						`users/${username}/pin/hash`,
						BinaryProto,
						loginData.symmetricKey
					),
					this.databaseService.hasItem(
						`users/${username}/pseudoAccount`
					),
					(async () => {
						const kp = await this.getItem(
							`users/${username}/signingKeyPair`,
							KeyPair,
							loginData.symmetricKey
						);

						if (
							(await agseConfirmedPromise) &&
							!this.potassiumService.compareMemory(
								kp.publicKey,
								(await this.accountDatabaseService.getUserPublicKeys(
									username
								)).signing
							)
						) {
							throw new Error('Invalid certificate.');
						}

						return kp;
					})(),
					userPromise
				]);

			/* Test to see if we can fetch user data before initiating fresh log-in */
			const [
				agseConfirmed,
				encryptionKeyPair,
				masterKeyConfirmed,
				pinHash,
				pseudoAccount,
				signingKeyPair,
				user
			] = await getUserData().catch(async () => {
				setErrorMessageLog('database service login');

				try {
					await this.databaseService.login(
						username,
						loginData.secondaryPassword
					);
				}
				catch (err) {
					if (loginData.oldSecondaryPassword) {
						await this.databaseService.login(
							username,
							loginData.oldSecondaryPassword
						);
					}
					else {
						throw err;
					}
				}

				return getUserData();
			});

			if (!user) {
				throw new Error('User does not exist.');
			}

			this.accountDatabaseService.currentUser.next({
				agseConfirmed,
				keys: {
					encryptionKeyPair,
					signingKeyPair,
					symmetricKey: loginData.symmetricKey
				},
				loginData,
				masterKeyConfirmed,
				pseudoAccount,
				user
			});

			/*
			Disable statuses for now:

			setErrorMessageLog('tracking presence');

			this.connectTrackerCleanup = await this.databaseService.setConnectTracker(
				`users/${username}/clientConnections/${uuid()}`,
				async () => {
					try {
						user.accountUserPresence.setValue(
							await this.accountDatabaseService.getItem(
								'lastPresence',
								AccountUserPresence
							)
						);
					}
					catch {}
				}
			);

			try {
				if (
					(await user.accountUserPresence.getValue()).status ===
					AccountUserPresence.Statuses.Offline
				) {
					await user.accountUserPresence.setValue(
						await this.accountDatabaseService.getItem(
							'lastPresence',
							AccountUserPresence
						)
					);
				}
			}
			catch {}

			this.subscriptions.push(
				this.databaseService
					.watch(
						`users/${username}/presence`,
						AccountUserPresence,
						this.subscriptions
					)
					.pipe(skip(1))
					.subscribe(({timestamp, value}) => {
						if (isNaN(timestamp)) {
							return;
						}

						this.accountDatabaseService.setItem(
							'lastPresence',
							AccountUserPresence,
							value
						);
					})
			);
			*/

			this.databaseService
				.registerPushNotifications(`users/${username}/messagingTokens`)
				.catch(() => {});

			setErrorMessageLog('saving credentials');

			await Promise.all([
				(async () =>
					this.localStorageService.setItem(
						'masterKey',
						BinaryProto,
						/* Locally encrypt master key with PIN */
						pinHash.length > 0 ?
							await this.potassiumService.secretBox.seal(
								masterKey,
								pinHash
							) :
							masterKey,
						undefined,
						undefined,
						true
					))(),
				(async () =>
					this.localStorageService.setItem(
						'username',
						StringProto,
						username,
						undefined,
						undefined,
						true
					))()
			]);

			Promise.all([
				(async () =>
					this.localStorageService.setItem(
						'pinIsCustom',
						BinaryProto,
						await this.accountDatabaseService.getItem(
							'pin/isCustom',
							BinaryProto
						),
						undefined,
						undefined,
						true
					))(),
				(async () =>
					this.localStorageService.setItem(
						'username',
						StringProto,
						(await user.accountUserProfile.getValue()).realUsername,
						undefined,
						undefined,
						true
					))(),
				this.savePIN(pinHash)
			])
				.then(() => {
					debugLog(() => 'credentials fully saved');
				})
				.catch(() => {});
		}
		catch (err) {
			this.errorService.log(
				`CYPH LOGIN FAILURE: ${errorLogMessage}`,
				err,
				undefined,
				true
			);
			return false;
		}

		this.analyticsService.sendEvent({
			eventAction: 'success',
			eventCategory: 'login',
			eventValue: 1,
			hitType: 'event'
		});

		return true;
	}

	/** Logs out. */
	public async logout (
		clearSavedCredentials: boolean = true
	) : Promise<boolean> {
		const currentUser = this.accountDatabaseService.currentUser.value;

		if (!currentUser) {
			return false;
		}

		/* eslint-disable-next-line @typescript-eslint/tslint/config */
		this.ngOnDestroy();

		if (this.connectTrackerCleanup) {
			this.connectTrackerCleanup();
			this.connectTrackerCleanup = undefined;
		}

		await Promise.race([
			this.databaseService.unregisterPushNotifications(
				`users/${currentUser.user.username}/messagingTokens`
			),
			sleep(1000)
		]).catch(() => {});

		this.potassiumService.clearMemory(currentUser.keys.symmetricKey);
		this.potassiumService.clearMemory(
			currentUser.keys.encryptionKeyPair.privateKey
		);
		this.potassiumService.clearMemory(
			currentUser.keys.signingKeyPair.privateKey
		);
		this.potassiumService.clearMemory(
			currentUser.keys.encryptionKeyPair.publicKey
		);
		this.potassiumService.clearMemory(
			currentUser.keys.signingKeyPair.publicKey
		);

		if (clearSavedCredentials) {
			await Promise.all([
				Promise.race([this.databaseService.logout(), sleep(1000)]),
				this.removeSavedCredentials()
			]).catch(() => {});
		}

		this.accountDatabaseService.currentUser.next(undefined);
		return true;
	}

	/** Registers. */
	public async register (
		realUsername: string | {pseudoAccount: true},
		masterKey?: string,
		pin: {isCustom: boolean; value?: string} = {isCustom: true},
		name: string = '',
		email?: string,
		inviteCode?: string
	) : Promise<boolean> {
		let pseudoAccount = false;
		if (typeof realUsername !== 'string') {
			pseudoAccount = true;
			realUsername = uuid(true);
		}

		if (
			!realUsername ||
			(!pseudoAccount &&
				(masterKey === undefined || masterKey.length === 0)) ||
			(!pseudoAccount && !inviteCode)
		) {
			return false;
		}

		const username = normalize(realUsername);

		const loginData: IAccountLoginData = {
			secondaryPassword: this.potassiumService.toBase64(
				this.potassiumService.randomBytes(64)
			),
			symmetricKey: this.potassiumService.randomBytes(
				await this.potassiumService.secretBox.keyBytes
			)
		};

		try {
			const [
				encryptionKeyPair,
				signingKeyPair,
				masterKeyHash
			] = await Promise.all([
				this.potassiumService.box.keyPair(),
				this.potassiumService.sign.keyPair(),
				typeof masterKey === 'string' ?
					this.passwordHash(username, masterKey) :
					this.potassiumService.secretBox.keyBytes.then(keyBytes =>
						this.potassiumService.randomBytes(keyBytes)
					)
			]);

			const [
				registerLoginData,
				registerPublicProfile,
				registerPublicProfileExtra,
				registerEncryptionKeyPair,
				registerSigningKeyPair,
				registerCertificateRequest,
				registerPinHash,
				registerPinIsCustom,
				registerPublicEncryptionKey
			] = await Promise.all([
				this.setItem(
					`users/${username}/loginData`,
					AccountLoginData,
					loginData,
					masterKeyHash,
					undefined,
					undefined,
					true
				),
				this.setItem<IAccountUserProfile>(
					`users/${username}/publicProfile`,
					AccountUserProfile,
					{
						description: '',
						externalUsernames: {},
						name,
						realUsername,
						userType:
							this.envService.isTelehealth &&
							!this.envService.isTelehealthFull ?
								AccountUserTypes.TelehealthDoctor :
								AccountUserTypes.Standard
					},
					signingKeyPair.privateKey,
					true,
					true,
					true
				),
				this.setItem<IAccountUserProfileExtra>(
					`users/${username}/publicProfileExtra`,
					AccountUserProfileExtra,
					{},
					signingKeyPair.privateKey,
					true,
					true,
					true
				),
				/*
				Disable statuses for now:

				this.setItem(
					`users/${username}/lastPresence`,
					AccountUserPresence,
					{status: AccountUserPresence.Statuses.Online},
					loginData.symmetricKey,
					undefined,
					undefined,
					true
				),
				*/
				this.setItem(
					`users/${username}/encryptionKeyPair`,
					KeyPair,
					encryptionKeyPair,
					loginData.symmetricKey,
					undefined,
					undefined,
					true
				),
				this.setItem(
					`users/${username}/signingKeyPair`,
					KeyPair,
					signingKeyPair,
					loginData.symmetricKey,
					undefined,
					undefined,
					true
				),
				pseudoAccount ?
					new Uint8Array(0) :
					this.setItem<IAGSEPKICSR>(
						`users/${username}/certificateRequest`,
						AGSEPKICSR,
						{
							publicSigningKey: signingKeyPair.publicKey,
							username
						},
						signingKeyPair.privateKey,
						true,
						undefined,
						true
					),
				this.passwordHash(username, pin.value).then(async pinHash =>
					this.setItem(
						`users/${username}/pin/hash`,
						BinaryProto,
						pinHash,
						loginData.symmetricKey,
						undefined,
						undefined,
						true
					)
				),
				this.setItem(
					`users/${username}/pin/isCustom`,
					BooleanProto,
					pin.isCustom,
					loginData.symmetricKey,
					undefined,
					undefined,
					true
				),
				this.setItem(
					`users/${username}/publicEncryptionKey`,
					BinaryProto,
					encryptionKeyPair.publicKey,
					signingKeyPair.privateKey,
					true,
					true,
					true
				)
			]);

			await Promise.all([
				this.localStorageService.setItem(
					'masterKey',
					BinaryProto,
					masterKeyHash,
					undefined,
					undefined,
					true
				),
				this.localStorageService.setItem(
					'username',
					StringProto,
					username,
					undefined,
					undefined,
					true
				)
			]);

			await this.databaseService.register(
				username,
				loginData.secondaryPassword,
				{
					certificateRequest: registerCertificateRequest,
					email,
					encryptionKeyPair: registerEncryptionKeyPair,
					inviteCode,
					loginData: registerLoginData,
					pinHash: registerPinHash,
					pinIsCustom: registerPinIsCustom,
					pseudoAccount,
					publicEncryptionKey: registerPublicEncryptionKey,
					publicProfile: registerPublicProfile,
					publicProfileExtra: registerPublicProfileExtra,
					signingKeyPair: registerSigningKeyPair
				}
			);

			if (inviteCode) {
				const inviterUsername = await this.databaseService
					.getItem(
						`users/${username}/inviterUsernamePlaintext`,
						StringProto
					)
					.catch(() => '');

				await Promise.all<{}>([
					this.setItem(
						`users/${username}/inviterUsername`,
						StringProto,
						inviterUsername,
						loginData.symmetricKey
					),
					inviterUsername && inviterUsername !== username ?
						this.databaseService.setItem<IAccountContactState>(
							`users/${username}/contacts/${inviterUsername}`,
							AccountContactState,
							{
								state:
									AccountContactState.States.OutgoingRequest
							}
						) :
						Promise.resolve()
				]);
			}

			return this.login(username, masterKeyHash);
		}
		catch {
			return false;
		}
	}

	/** Removes locally saved login credentials. */
	public async removeSavedCredentials () : Promise<void> {
		try {
			/* eslint-disable-next-line @typescript-eslint/tslint/config */
			localStorage.removeItem('betaTestUser');
			/* eslint-disable-next-line @typescript-eslint/tslint/config */
			localStorage.removeItem('webSignPackageTimestamp');
		}
		catch {}

		await this.localStorageService.clear();
	}

	/**
	 * Saves PIN locally for specified duration (minutes, default of 60).
	 * @returns PIN hash.
	 */
	public async savePIN (
		pin: string | Uint8Array,
		duration?: number
	) : Promise<Uint8Array> {
		const pinHash =
			typeof pin !== 'string' ?
				pin :
				await this.passwordHash(
					await this.localStorageService.getItem(
						'username',
						StringProto,
						undefined,
						true
					),
					pin
				);

		await Promise.all<{}>([
			pin.length === 0 ?
				Promise.resolve() :
				this.localStorageService.setItem(
					'pinDuration',
					NumberProto,
					duration !== undefined ?
						duration * 60000 :
						await this.localStorageService
							.getItem(
								'pinDuration',
								NumberProto,
								undefined,
								true
							)
							.catch(() => 3600000),
					undefined,
					undefined,
					true
				),
			this.localStorageService.setItem(
				'pinHash',
				BinaryProto,
				pinHash,
				undefined,
				undefined,
				true
			),
			pin.length === 0 ?
				Promise.resolve() :
				this.localStorageService.setItem(
					'pinTimestamp',
					NumberProto,
					await getTimestamp(),
					undefined,
					undefined,
					true
				)
		]);

		return pinHash;
	}

	constructor (
		/** @ignore */
		private readonly accountDatabaseService: AccountDatabaseService,

		/** @ignore */
		private readonly accountUserLookupService: AccountUserLookupService,

		/** @ignore */
		private readonly analyticsService: AnalyticsService,

		/** @ignore */
		private readonly configService: ConfigService,

		/** @ignore */
		private readonly databaseService: DatabaseService,

		/** @ignore */
		private readonly envService: EnvService,

		/** @ignore */
		private readonly errorService: ErrorService,

		/** @ignore */
		private readonly fingerprintService: FingerprintService,

		/** @ignore */
		private readonly localStorageService: LocalStorageService,

		/** @ignore */
		private readonly potassiumService: PotassiumService
	) {
		super();
	}
}
