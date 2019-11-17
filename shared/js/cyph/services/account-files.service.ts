/* eslint-disable max-lines */

import {ComponentType} from '@angular/cdk/portal';
import {Injectable} from '@angular/core';
import {SafeUrl} from '@angular/platform-browser';
import {Router} from '@angular/router';
import * as htmlToText from 'html-to-text';
import memoize from 'lodash-es/memoize';
import * as msgpack from 'msgpack-lite';
import {DeltaOperation} from 'quill';
import Delta from 'quill-delta';
import {QuillDeltaToHtmlConverter} from 'quill-delta-to-html';
import {BehaviorSubject, combineLatest, concat, Observable, of} from 'rxjs';
import {filter, map, mergeMap, skip, take} from 'rxjs/operators';
import {AccountFile, AccountFileShare, SecurityModels} from '../account';
import {Async} from '../async-type';
import {BaseProvider} from '../base-provider';
import {isValidEmail} from '../email-pattern';
import {StorageUnits} from '../enums/storage-units';
import {IAsyncList} from '../iasync-list';
import {IProto} from '../iproto';
import {IQuillDelta} from '../iquill-delta';
import {IQuillRange} from '../iquill-range';
import {IResolvable} from '../iresolvable';
import {
	AccountFileRecord,
	AccountFileReference,
	AccountFileReferenceContainer,
	AccountMessagingGroup,
	Appointment,
	BinaryProto,
	BlobProto,
	DataURIProto,
	EhrApiKey,
	Form,
	IAccountFileRecord,
	IAccountFileReference,
	IAccountFileReferenceContainer,
	IAccountMessagingGroup,
	IAppointment,
	IEhrApiKey,
	IForm,
	IPassword,
	IRedoxPatient,
	IWallet,
	NotificationTypes,
	NumberProto,
	Password,
	RedoxPatient,
	Wallet
} from '../proto';
import {filterUndefined} from '../util/filter';
import {flattenObservable, toBehaviorSubject} from '../util/flatten-observable';
import {convertStorageUnitsToBytes, normalizeArray} from '../util/formatting';
import {
	getOrSetDefault,
	getOrSetDefaultAsync
} from '../util/get-or-set-default';
import {debugLog} from '../util/log';
import {observableAll} from '../util/observable-all';
import {saveFile} from '../util/save-file';
import {deserialize, serialize} from '../util/serialization';
import {getTimestamp} from '../util/time';
import {uuid} from '../util/uuid';
import {awaitAsync, resolvable, sleep} from '../util/wait';
import {AccountSettingsService} from './account-settings.service';
import {ConfigService} from './config.service';
import {AccountDatabaseService} from './crypto/account-database.service';
import {PotassiumService} from './crypto/potassium.service';
import {DatabaseService} from './database.service';
import {DialogService} from './dialog.service';
import {FileService} from './file.service';
import {StringsService} from './strings.service';

/**
 * Account file service.
 */
@Injectable()
export class AccountFilesService extends BaseProvider {
	/**
	 * Resolves circular dependency needed for shareFilePrompt to work.
	 * @see AccountFileSharingComponent
	 */
	public static readonly accountFileSharingComponent = resolvable<
		ComponentType<{
			closeFunction?: IResolvable<() => void>;
			file?: AccountFileShare;
		}>
	>();

	/** @ignore */
	private readonly incomingFileCache: Map<
		Uint8Array,
		IAccountFileRecord & IAccountFileReference
	> = new Map<Uint8Array, IAccountFileRecord & IAccountFileReference>();

	/** @ignore */
	private readonly nonexistentFile: IAccountFileRecord &
		IAccountFileReference = {
		id: '',
		key: new Uint8Array(0),
		mediaType: '',
		name: '',
		owner: '',
		recordType: AccountFileRecord.RecordTypes.File,
		size: NaN,
		timestamp: 0,
		wasAnonymousShare: false
	};

	/** @ignore */
	private readonly watchAppointmentCache = new Map<
		string | IAccountFileRecord,
		Observable<IAppointment>
	>();

	/** @ignore */
	private readonly watchFile = memoize(
		(value: IAccountFileReference) =>
			!value.owner ?
				undefined :
				this.accountDatabaseService
					.watch(
						`users/${value.owner}/fileRecords/${value.id}`,
						AccountFileRecord,
						undefined,
						value.key,
						undefined,
						this.subscriptions
					)
					.pipe(
						map(o => ({
							timestamp: o.timestamp,
							value: {
								...o.value,
								name: o.value.name.slice(0, this.maxNameLength),
								owner: value.owner
							}
						}))
					),
		(value: IAccountFileReference) => value.id
	);

	/** @ignore */
	private readonly watchFileDataCache = new Map<string, Observable<any>>();

	/** @ignore */
	private readonly watchMetadataCache = new Map<
		string | IAccountFileRecord,
		Observable<IAccountFileRecord & IAccountFileReference>
	>();

	/** @ignore */
	private readonly watchNoteCache = new Map<
		string,
		Observable<IQuillDelta>
	>();

	/** @ignore */
	private readonly watchPasswordCache = new Map<
		string,
		Observable<IPassword>
	>();

	/** File type configurations. */
	public readonly config: Record<
		AccountFileRecord.RecordTypes,
		{
			blockAnonymous: boolean;
			description: string;
			incoming: () => Observable<
				{data: any; owner: string; record: IAccountFileRecord}[]
			>;
			isOfType: (file: any) => boolean;
			list: () => Observable<
				{data: any; owner: string; record: IAccountFileRecord}[]
			>;
			mediaType?: string;
			proto?: IProto<any>;
			recordType: AccountFileRecord.RecordTypes;
			route: string;
			securityModel?: SecurityModels;
			subroutable: boolean;
		}
	> = {
		[AccountFileRecord.RecordTypes.Appointment]: {
			blockAnonymous: false,
			description: 'Appointment',
			incoming: () => this.incomingFilesFiltered.appointments,
			isOfType: (file: any) => typeof file.calendarInvite === 'object',
			list: () => this.filesListFiltered.appointments,
			mediaType: 'cyph/appointment',
			proto: Appointment,
			recordType: AccountFileRecord.RecordTypes.Appointment,
			route: 'appointments',
			securityModel: undefined,
			subroutable: false
		},
		[AccountFileRecord.RecordTypes.Doc]: {
			blockAnonymous: false,
			description: 'Doc',
			incoming: () => this.incomingFilesFiltered.docs,
			isOfType: (file: any) => file instanceof Array,
			list: () => this.filesListFiltered.docs,
			mediaType: 'cyph/doc',
			proto: undefined,
			recordType: AccountFileRecord.RecordTypes.Doc,
			route: 'docs',
			securityModel: undefined,
			subroutable: true
		},
		[AccountFileRecord.RecordTypes.EhrApiKey]: {
			blockAnonymous: false,
			description: 'EHR Access',
			incoming: () => this.incomingFilesFilteredWithData.ehrApiKeys(),
			isOfType: (file: any) =>
				typeof file.apiKey === 'string' &&
				typeof file.isMaster === 'boolean',
			list: () => this.filesListFilteredWithData.ehrApiKeys(),
			mediaType: 'cyph/ehr-api-key',
			proto: EhrApiKey,
			recordType: AccountFileRecord.RecordTypes.EhrApiKey,
			route: 'ehr-access',
			securityModel: undefined,
			subroutable: false
		},
		[AccountFileRecord.RecordTypes.File]: {
			blockAnonymous: false,
			description: 'File',
			incoming: () => this.incomingFilesFiltered.files,
			isOfType: (file: any) =>
				file instanceof Blob ||
				(file.data instanceof Uint8Array &&
					typeof file.mediaType === 'string'),
			list: () => this.filesListFiltered.files,
			mediaType: undefined,
			proto: BlobProto,
			recordType: AccountFileRecord.RecordTypes.File,
			route: 'files',
			securityModel: undefined,
			subroutable: false
		},
		[AccountFileRecord.RecordTypes.Form]: {
			blockAnonymous: false,
			description: 'Form',
			incoming: () => this.incomingFilesFiltered.forms,
			isOfType: (file: any) => file.components instanceof Array,
			list: () => this.filesListFiltered.forms,
			mediaType: 'cyph/form',
			proto: Form,
			recordType: AccountFileRecord.RecordTypes.Form,
			route: 'forms',
			securityModel: SecurityModels.privateSigned,
			subroutable: true
		},
		[AccountFileRecord.RecordTypes.MessagingGroup]: {
			blockAnonymous: true,
			description: 'Messaging Group',
			incoming: () => this.incomingFilesFiltered.messagingGroups,
			isOfType: (file: any) => typeof file.castleSessionID === 'string',
			list: () => this.filesListFiltered.messagingGroups,
			mediaType: 'cyph/messaging-group',
			proto: AccountMessagingGroup,
			recordType: AccountFileRecord.RecordTypes.MessagingGroup,
			route: '',
			securityModel: undefined,
			subroutable: true
		},
		[AccountFileRecord.RecordTypes.Note]: {
			blockAnonymous: false,
			description: 'Note',
			incoming: () => this.incomingFilesFiltered.notes,
			isOfType: (file: any) =>
				typeof file.chop === 'function' || file.ops instanceof Array,
			list: () => this.filesListFiltered.notes,
			mediaType: 'cyph/note',
			proto: BinaryProto,
			recordType: AccountFileRecord.RecordTypes.Note,
			route: 'notes',
			securityModel: undefined,
			subroutable: true
		},
		[AccountFileRecord.RecordTypes.Password]: {
			blockAnonymous: true,
			description: 'Password',
			incoming: () => this.incomingFilesFiltered.passwords,
			isOfType: (file: any) => typeof file.password === 'string',
			list: () => this.filesListFiltered.passwords,
			mediaType: 'cyph/password',
			proto: Password,
			recordType: AccountFileRecord.RecordTypes.Password,
			route: 'passwords',
			securityModel: undefined,
			subroutable: false
		},
		[AccountFileRecord.RecordTypes.RedoxPatient]: {
			blockAnonymous: true,
			description: 'Patient Info',
			incoming: () => this.incomingFilesFiltered.redoxPatients,
			isOfType: (file: any) => typeof file.Demographics === 'object',
			list: () => this.filesListFiltered.redoxPatients,
			mediaType: 'cyph/redox-patient',
			proto: RedoxPatient,
			recordType: AccountFileRecord.RecordTypes.RedoxPatient,
			route: 'incoming-patient-info',
			securityModel: undefined,
			subroutable: false
		},
		[AccountFileRecord.RecordTypes.Wallet]: {
			blockAnonymous: false,
			description: 'Wallet',
			incoming: () => this.incomingFilesFiltered.wallets,
			isOfType: (file: any) => typeof file.cryptocurrency === 'number',
			list: () => this.filesListFiltered.wallets,
			mediaType: 'cyph/wallet',
			proto: Wallet,
			recordType: AccountFileRecord.RecordTypes.Wallet,
			route: 'wallets',
			securityModel: undefined,
			subroutable: true
		}
	};

	/** List of file records owned by current user, sorted by timestamp in descending order. */
	public readonly filesList: Observable<
		(IAccountFileRecord & {owner: string})[]
	> = this.accountDatabaseService
		.watchList(
			'fileReferences',
			AccountFileReference,
			undefined,
			undefined,
			undefined,
			false,
			this.subscriptions
		)
		.pipe(
			mergeMap(references =>
				observableAll(
					filterUndefined(
						references.map(({value}) => this.watchFile(value))
					)
				)
			),
			map(records =>
				records
					.filter(o => !isNaN(o.timestamp))
					.sort((a, b) => b.timestamp - a.timestamp)
					.map(o => o.value)
			)
		);

	/**
	 * Files filtered by record type.
	 * @see files
	 */
	public readonly filesListFiltered = {
		appointments: this.filterFiles(
			this.filesList,
			AccountFileRecord.RecordTypes.Appointment
		),
		docs: this.filterFiles(
			this.filesList,
			AccountFileRecord.RecordTypes.Doc
		),
		ehrApiKeys: this.filterFiles(
			this.filesList,
			AccountFileRecord.RecordTypes.EhrApiKey
		),
		files: this.filterFiles(
			this.filesList,
			AccountFileRecord.RecordTypes.File
		),
		forms: this.filterFiles(
			this.filesList,
			AccountFileRecord.RecordTypes.Form
		),
		messagingGroups: this.filterFiles(
			this.filesList,
			AccountFileRecord.RecordTypes.MessagingGroup
		),
		notes: this.filterFiles(
			this.filesList,
			AccountFileRecord.RecordTypes.Note
		),
		passwords: this.filterFiles(
			this.filesList,
			AccountFileRecord.RecordTypes.Password
		),
		redoxPatients: this.filterFiles(
			this.filesList,
			AccountFileRecord.RecordTypes.RedoxPatient
		),
		wallets: this.filterFiles(
			this.filesList,
			AccountFileRecord.RecordTypes.Wallet
		)
	};

	/**
	 * Includes downloaded data, where applicable.
	 * @see filesListFiltered
	 */
	public readonly filesListFilteredWithData = {
		appointments: this.getFiles(
			this.filesListFiltered.appointments,
			AccountFileRecord.RecordTypes.Appointment,
			this.config[AccountFileRecord.RecordTypes.Appointment]
		),
		ehrApiKeys: this.getFiles(
			this.filesListFiltered.ehrApiKeys,
			AccountFileRecord.RecordTypes.EhrApiKey,
			this.config[AccountFileRecord.RecordTypes.EhrApiKey]
		),
		files: this.getFiles(
			this.filesListFiltered.files,
			AccountFileRecord.RecordTypes.File,
			this.config[AccountFileRecord.RecordTypes.File]
		),
		forms: this.getFiles(
			this.filesListFiltered.forms,
			AccountFileRecord.RecordTypes.Form,
			this.config[AccountFileRecord.RecordTypes.Form]
		),
		messagingGroups: this.getFiles(
			this.filesListFiltered.messagingGroups,
			AccountFileRecord.RecordTypes.MessagingGroup,
			this.config[AccountFileRecord.RecordTypes.MessagingGroup]
		),
		passwords: this.getFiles(
			this.filesListFiltered.passwords,
			AccountFileRecord.RecordTypes.Password,
			this.config[AccountFileRecord.RecordTypes.Password]
		),
		redoxPatients: this.getFiles(
			this.filesListFiltered.redoxPatients,
			AccountFileRecord.RecordTypes.RedoxPatient,
			this.config[AccountFileRecord.RecordTypes.RedoxPatient]
		),
		wallets: this.getFiles(
			this.filesListFiltered.wallets,
			AccountFileRecord.RecordTypes.Wallet,
			this.config[AccountFileRecord.RecordTypes.Wallet]
		)
	};

	/** Total size of all files in list. */
	public readonly filesTotalSize = combineLatest([
		this.filesListFiltered.files,
		this.accountDatabaseService.currentUser
	]).pipe(
		map(([files, currentUser]) =>
			files.reduce(
				(n, {owner, size}) =>
					n +
					(currentUser && currentUser.user.username === owner ?
						size :
						0),
				0
			)
		)
	);

	/** Total storage limit. */
	public readonly fileStorageLimit = combineLatest([
		this.accountSettingsService.plan,
		this.accountDatabaseService
			.watch(
				'storageCap',
				NumberProto,
				SecurityModels.unprotected,
				undefined,
				undefined,
				this.subscriptions
			)
			.pipe(map(o => o.value))
	]).pipe(
		map(([plan, storageCap]) =>
			convertStorageUnitsToBytes(
				storageCap || this.configService.planConfig[plan].storageCapGB,
				StorageUnits.gb
			)
		)
	);

	/** List of file record types. */
	public readonly fileTypes: AccountFileRecord.RecordTypes[] = [
		AccountFileRecord.RecordTypes.Appointment,
		AccountFileRecord.RecordTypes.Doc,
		AccountFileRecord.RecordTypes.EhrApiKey,
		AccountFileRecord.RecordTypes.File,
		AccountFileRecord.RecordTypes.Form,
		AccountFileRecord.RecordTypes.MessagingGroup,
		AccountFileRecord.RecordTypes.Note,
		AccountFileRecord.RecordTypes.Password,
		AccountFileRecord.RecordTypes.RedoxPatient,
		AccountFileRecord.RecordTypes.Wallet
	];

	/** Incoming files. */
	public readonly incomingFiles = toBehaviorSubject<
		(IAccountFileRecord & IAccountFileReference)[]
	>(
		this.accountDatabaseService
			.watchList(
				'incomingFiles',
				BinaryProto,
				SecurityModels.unprotected,
				undefined,
				undefined,
				false,
				this.subscriptions
			)
			.pipe(
				mergeMap(async arr =>
					(await Promise.all(
						arr.map(async ({value}) =>
							getOrSetDefaultAsync(
								this.incomingFileCache,
								value,
								async () => {
									try {
										const currentUser = this
											.accountDatabaseService.currentUser
											.value;

										if (!currentUser) {
											return this.nonexistentFile;
										}

										const referenceContainer = await deserialize(
											AccountFileReferenceContainer,
											await this.potassiumService.box.open(
												value,
												currentUser.keys
													.encryptionKeyPair
											)
										);

										let record: IAccountFileRecord;
										let reference: IAccountFileReference;

										if (referenceContainer.anonymousShare) {
											record =
												referenceContainer
													.anonymousShare
													.accountFileRecord;

											record.wasAnonymousShare = true;

											if (record.replyToEmail) {
												record.replyToEmail = record.replyToEmail.trim();
												if (
													!isValidEmail(
														record.replyToEmail
													)
												) {
													record.replyToEmail = undefined;
												}
											}

											if (record.replyToName) {
												record.replyToName = record.replyToName
													.replace(/\s+/g, ' ')
													.trim();
											}

											reference = {
												id: record.id,
												key:
													referenceContainer
														.anonymousShare.key,
												owner: currentUser.user.username
											};
										}
										else if (
											referenceContainer.signedShare
										) {
											reference = await deserialize(
												AccountFileReference,
												await this.potassiumService.sign.open(
													referenceContainer
														.signedShare
														.accountFileReference,
													(await this.accountDatabaseService.getUserPublicKeys(
														referenceContainer
															.signedShare.owner
													)).signing
												)
											);

											record = await this.accountDatabaseService.getItem(
												`users/${reference.owner}/fileRecords/${reference.id}`,
												AccountFileRecord,
												undefined,
												reference.key
											);
										}
										else {
											return this.nonexistentFile;
										}

										const incomingFile = {
											id: record.id,
											key: reference.key,
											mediaType: record.mediaType,
											name: record.name,
											owner: reference.owner,
											recordType: record.recordType,
											replyToEmail: record.replyToEmail,
											replyToName: record.replyToName,
											size: record.size,
											timestamp: record.timestamp,
											wasAnonymousShare:
												record.wasAnonymousShare
										};

										if (
											await this.hasFile(incomingFile.id)
										) {
											await this.acceptIncomingFile(
												incomingFile,
												false
											);
											return this.nonexistentFile;
										}

										return incomingFile;
									}
									catch {
										return this.nonexistentFile;
									}
								}
							)
						)
					)).filter(file => file !== this.nonexistentFile)
				)
			),
		[]
	);

	/**
	 * Incoming files filtered by record type.
	 * @see files
	 */
	public readonly incomingFilesFiltered = {
		appointments: this.filterFiles(
			this.incomingFiles,
			AccountFileRecord.RecordTypes.Appointment
		),
		docs: this.filterFiles(
			this.incomingFiles,
			AccountFileRecord.RecordTypes.Doc
		),
		ehrApiKeys: this.filterFiles(
			this.incomingFiles,
			AccountFileRecord.RecordTypes.EhrApiKey
		),
		files: this.filterFiles(
			this.incomingFiles,
			AccountFileRecord.RecordTypes.File
		),
		forms: this.filterFiles(
			this.incomingFiles,
			AccountFileRecord.RecordTypes.Form
		),
		messagingGroups: this.filterFiles(
			this.incomingFiles,
			AccountFileRecord.RecordTypes.MessagingGroup
		),
		notes: this.filterFiles(
			this.incomingFiles,
			AccountFileRecord.RecordTypes.Note
		),
		passwords: this.filterFiles(
			this.incomingFiles,
			AccountFileRecord.RecordTypes.Password
		),
		redoxPatients: this.filterFiles(
			this.incomingFiles,
			AccountFileRecord.RecordTypes.RedoxPatient
		),
		wallets: this.filterFiles(
			this.incomingFiles,
			AccountFileRecord.RecordTypes.Wallet
		)
	};

	/**
	 * Includes downloaded data, where applicable.
	 * @see incomingFilesFiltered
	 */
	public readonly incomingFilesFilteredWithData = {
		appointments: this.getFiles(
			this.incomingFilesFiltered.appointments,
			AccountFileRecord.RecordTypes.Appointment,
			this.config[AccountFileRecord.RecordTypes.Appointment]
		),
		ehrApiKeys: this.getFiles(
			this.incomingFilesFiltered.ehrApiKeys,
			AccountFileRecord.RecordTypes.EhrApiKey,
			this.config[AccountFileRecord.RecordTypes.EhrApiKey]
		),
		files: this.getFiles(
			this.incomingFilesFiltered.files,
			AccountFileRecord.RecordTypes.File,
			this.config[AccountFileRecord.RecordTypes.File]
		),
		forms: this.getFiles(
			this.incomingFilesFiltered.forms,
			AccountFileRecord.RecordTypes.Form,
			this.config[AccountFileRecord.RecordTypes.Form]
		),
		messagingGroups: this.getFiles(
			this.incomingFilesFiltered.messagingGroups,
			AccountFileRecord.RecordTypes.MessagingGroup,
			this.config[AccountFileRecord.RecordTypes.MessagingGroup]
		),
		passwords: this.getFiles(
			this.incomingFilesFiltered.passwords,
			AccountFileRecord.RecordTypes.Password,
			this.config[AccountFileRecord.RecordTypes.Password]
		),
		redoxPatients: this.getFiles(
			this.incomingFilesFiltered.redoxPatients,
			AccountFileRecord.RecordTypes.RedoxPatient,
			this.config[AccountFileRecord.RecordTypes.RedoxPatient]
		),
		wallets: this.getFiles(
			this.incomingFilesFiltered.wallets,
			AccountFileRecord.RecordTypes.Wallet,
			this.config[AccountFileRecord.RecordTypes.Wallet]
		)
	};

	/** Indicates whether the first load has completed. */
	public readonly initiated = new BehaviorSubject<boolean>(false);

	/** Determines whether file should be treated as multimedia. */
	public readonly isMedia = memoize(
		async (
			id:
				| string
				| IAccountFileRecord
				| (IAccountFileRecord & IAccountFileReference)
		) => this.fileService.isMedia(await this.getFile(id))
	);

	/** Maximum number of characters in a file name. */
	public readonly maxNameLength: number = 80;

	/** Returns a snippet of a note to use as a preview. */
	public readonly noteSnippet = memoize((id: string) =>
		toBehaviorSubject<string>(
			async () => {
				const limit = 75;
				const file = await this.getFile(id);
				const content = this.deltaToString(
					this.decodeQuill(
						await this.accountDatabaseService.getItem(
							`users/${file.owner}/files/${id}`,
							BinaryProto,
							undefined,
							file.key
						)
					)
				);

				return content.length > limit ?
					`${content.substr(0, limit)}...` :
					content;
			},
			'...',
			this.subscriptions
		)
	);

	/** Indicates whether spinner should be displayed. */
	public readonly showSpinner = new BehaviorSubject<boolean>(true);

	/** Indicates whether spinner for uploads should be displayed. */
	public readonly uploadSpinner = this.showSpinner.pipe(skip(1));

	/** @ignore */
	private deltaToString (delta: IQuillDelta) : string {
		return htmlToText.fromString(
			new QuillDeltaToHtmlConverter(delta.ops || []).convert()
		);
	}

	/** @ignore */
	private downloadItem<T> (
		id:
			| string
			| IAccountFileRecord
			| (IAccountFileRecord & IAccountFileReference),
		proto: IProto<T>,
		securityModel?: SecurityModels
	) : {
		progress: Observable<number>;
		result: Promise<T>;
	} {
		this.showSpinner.next(true);

		const filePromise = this.getFile(id);

		const {progress, result} = this.accountDatabaseService.downloadItem(
			filePromise.then(file => `users/${file.owner}/files/${file.id}`),
			<any> proto === DataURIProto ?
				<any> (
					new DataURIProto(filePromise.then(file => file.mediaType))
				) :
				proto,
			securityModel,
			filePromise.then(file => file.key)
		);

		return {
			progress,
			result: result.then(async o => {
				this.showSpinner.next(false);

				return o.value instanceof Blob ? <any> new Blob([o.value], {
						type: (await filePromise).mediaType
					}) : o.value;
			})
		};
	}

	/** @ignore */
	private filterFiles (
		filesList: Observable<(IAccountFileRecord & {owner: string})[]>,
		filterRecordTypes: AccountFileRecord.RecordTypes
	) : Observable<
		(IAccountFileRecord & {
			data: undefined;
			owner: string;
			record: IAccountFileRecord;
		})[]
	> {
		return filesList.pipe(
			map(files =>
				files
					.filter(
						({owner, recordType, wasAnonymousShare}) =>
							!!owner &&
							recordType === filterRecordTypes &&
							!(
								this.config[recordType].blockAnonymous &&
								wasAnonymousShare
							)
					)
					.map(record => ({
						...record,
						data: undefined,
						record
					}))
			)
		);
	}

	/** @ignore */
	private decodeQuill (bytes: Uint8Array) : any {
		const o = bytes.length > 0 ? msgpack.decode(bytes) : undefined;

		return typeof o === 'object' ?
			{
				...('clientID' in o ? {clientID: o.clientID} : {}),
				...('index' in o ? {index: o.index} : {}),
				...('length' in o ? {length: o.length} : {}),
				...('ops' in o ? {ops: o.ops} : {})
			} :
			{};
	}

	/** @ignore */
	private encodeQuill (o: IQuillDelta | IQuillRange) : Uint8Array {
		return msgpack.encode({
			...('clientID' in o ? {clientID: o.clientID} : {}),
			...('index' in o ? {index: o.index} : {}),
			...('length' in o ? {length: o.length} : {}),
			...('ops' in o ? {ops: o.ops} : {})
		});
	}

	/** @ignore */
	private getFiles<T, TRecord extends {owner: string}> (
		filesList: Observable<(IAccountFileRecord & TRecord)[]>,
		recordType: AccountFileRecord.RecordTypes,
		_CONFIG: {proto?: IProto<T>}
	) : () => Observable<
		{
			data: T;
			owner: string;
			record: IAccountFileRecord;
		}[]
	> {
		return memoize(() =>
			toBehaviorSubject<
				{
					data: T;
					owner: string;
					record: IAccountFileRecord;
				}[]
			>(
				filesList.pipe(
					mergeMap(records =>
						observableAll(
							records.map(record =>
								this.watchFileData(record, recordType).pipe(
									map(data => ({
										data,
										owner: record.owner,
										record
									}))
								)
							)
						)
					),
					map(files => <any> files.filter(o => o.data !== undefined))
				),
				[]
			)
		);
	}

	/** @ignore */
	private watchFileData<T> (
		id: string | IAccountFileRecord,
		recordType: AccountFileRecord.RecordTypes
	) : Observable<T | undefined> {
		const {proto, securityModel} = this.config[recordType];

		return getOrSetDefault(
			this.watchFileDataCache,
			typeof id === 'string' ? id : id.id,
			() => {
				const filePromise = this.getFile(id);

				return this.accountDatabaseService
					.watch<any>(
						filePromise.then(
							file => `users/${file.owner}/files/${file.id}`
						),
						<any> proto,
						securityModel,
						filePromise.then(file => file.key),
						undefined,
						this.subscriptions
					)
					.pipe(map(o => (isNaN(o.timestamp) ? undefined : o.value)));
			}
		);
	}

	/** Accepts or rejects incoming file. */
	public async acceptIncomingFile (
		id:
			| string
			| IAccountFileRecord
			| (IAccountFileRecord & IAccountFileReference),
		options:
			| boolean
			| {copy?: boolean; name?: string; reject?: boolean} = true,
		metadata?: string,
		data?: AccountFile | string
	) : Promise<void> {
		if (typeof options === 'boolean') {
			options = {reject: !options};
		}

		const incomingFile =
			typeof id === 'object' && 'key' in id ?
				id :
			typeof id === 'object' ?
				this.incomingFiles.value.find(o => o.id === id.id) :
				this.incomingFiles.value.find(o => o.id === id);

		if (incomingFile === undefined) {
			throw new Error('Incoming file not found.');
		}

		const fileConfig = this.config[incomingFile.recordType];

		const promises: Promise<any>[] = [
			this.accountDatabaseService.removeItem(
				`incomingFiles/${incomingFile.id}`
			)
		];

		if (options.name) {
			incomingFile.name = options.name;
		}

		if (incomingFile.wasAnonymousShare) {
			options.copy = true;
		}

		if (!options.reject && !options.copy) {
			promises.push(
				this.accountDatabaseService.setItem<IAccountFileReference>(
					`fileReferences/${incomingFile.id}`,
					AccountFileReference,
					{
						id: incomingFile.id,
						key: incomingFile.key,
						metadata,
						owner: incomingFile.owner
					}
				)
			);

			if (
				incomingFile.recordType ===
				AccountFileRecord.RecordTypes.Appointment
			) {
				/*
				Temporarily commented out pending final appointments architecture

				promises.push((async () => {
					const currentUser = this.accountDatabaseService.currentUser.value;

					if (!currentUser) {
						throw new Error('User not signed in. Cannot RSVP.');
					}

					const appointment = await this.downloadAppointment(incomingFile).result;

					if (!appointment.rsvps) {
						appointment.rsvps = {};
					}

					appointment.rsvps[currentUser.user.username] = Appointment.RSVP.Yes;

					return this.accountDatabaseService.setItem(
						`users/${incomingFile.owner}/files/${incomingFile.id}`,
						Appointment,
						appointment,
						undefined,
						incomingFile.key
					);
				})());
				*/
			}
		}
		else if (!options.reject && options.copy) {
			let file =
				data ||
				(incomingFile.recordType === AccountFileRecord.RecordTypes.Doc ?
					await this.getDoc(incomingFile).asyncList.getValue() :
				fileConfig.proto ?
					await this.downloadItem<any>(
						incomingFile,
						fileConfig.proto,
						fileConfig.securityModel
					).result :
					undefined);

			if (!file) {
				throw new Error('Cannot get file for copying.');
			}

			/* TODO: Replace with a QuillProto class that calls msgpack */
			if (fileConfig.recordType === AccountFileRecord.RecordTypes.Note) {
				file = this.decodeQuill(file);
			}

			promises.push(
				this.upload(
					incomingFile.name,
					file,
					undefined,
					metadata,
					{
						email: incomingFile.replyToEmail,
						name: incomingFile.replyToName
					},
					incomingFile.wasAnonymousShare
				).result
			);
		}

		if (incomingFile.wasAnonymousShare) {
			promises.push(this.remove(incomingFile, false));
		}

		await Promise.all(promises);
	}

	/** Downloads and saves file. */
	public downloadAndSave (
		id: string
	) : {
		progress: Observable<number>;
		result: Promise<void>;
	} {
		const {progress, result} = this.downloadItem(id, BinaryProto);

		return {
			progress,
			result: (async () => {
				const file = await this.getFile(id);

				await saveFile(await result, file.name, file.mediaType);
			})()
		};
	}

	/** Downloads and returns file. */
	public downloadFile (
		id:
			| string
			| IAccountFileRecord
			| (IAccountFileRecord & IAccountFileReference),
		recordType: AccountFileRecord.RecordTypes.Appointment
	) : {
		progress: Observable<number>;
		result: Promise<IAppointment>;
	};
	public downloadFile (
		id:
			| string
			| IAccountFileRecord
			| (IAccountFileRecord & IAccountFileReference),
		recordType: AccountFileRecord.RecordTypes.Doc
	) : never;
	public downloadFile (
		id:
			| string
			| IAccountFileRecord
			| (IAccountFileRecord & IAccountFileReference),
		recordType: AccountFileRecord.RecordTypes.EhrApiKey
	) : {
		progress: Observable<number>;
		result: Promise<IEhrApiKey>;
	};
	public downloadFile (
		id:
			| string
			| IAccountFileRecord
			| (IAccountFileRecord & IAccountFileReference),
		recordType:
			| AccountFileRecord.RecordTypes.File
			| AccountFileRecord.RecordTypes.Note
	) : {
		progress: Observable<number>;
		result: Promise<Uint8Array>;
	};
	public downloadFile (
		id:
			| string
			| IAccountFileRecord
			| (IAccountFileRecord & IAccountFileReference),
		recordType: AccountFileRecord.RecordTypes.Form
	) : {
		progress: Observable<number>;
		result: Promise<IForm>;
	};
	public downloadFile (
		id:
			| string
			| IAccountFileRecord
			| (IAccountFileRecord & IAccountFileReference),
		recordType: AccountFileRecord.RecordTypes.MessagingGroup
	) : {
		progress: Observable<number>;
		result: Promise<IAccountMessagingGroup>;
	};
	public downloadFile (
		id:
			| string
			| IAccountFileRecord
			| (IAccountFileRecord & IAccountFileReference),
		recordType: AccountFileRecord.RecordTypes.RedoxPatient
	) : {
		progress: Observable<number>;
		result: Promise<IRedoxPatient>;
	};
	public downloadFile (
		id:
			| string
			| IAccountFileRecord
			| (IAccountFileRecord & IAccountFileReference),
		recordType: AccountFileRecord.RecordTypes
	) : any {
		const fileConfig = this.config[recordType];

		if (!fileConfig || !fileConfig.proto) {
			throw new Error(
				`Cannot download file ${
					typeof id === 'string' ? id : id.id
				} of type ${AccountFileRecord.RecordTypes[recordType]}`
			);
		}

		return this.downloadItem<any>(
			id,
			fileConfig.proto,
			fileConfig.securityModel
		);
	}

	/** Downloads file and returns password. */
	public downloadPassword (
		id: string | IAccountFileRecord
	) : {
		progress: Observable<number>;
		result: Promise<IPassword>;
	} {
		return this.downloadItem(id, Password);
	}

	/** Downloads file and returns as data URI. */
	public downloadURI (
		id: string | IAccountFileRecord
	) : {
		progress: Observable<number>;
		result: Promise<SafeUrl | string>;
	} {
		return this.downloadItem(id, DataURIProto);
	}

	/** Downloads file and returns wallet. */
	public downloadWallet (
		id: string | IAccountFileRecord
	) : {
		progress: Observable<number>;
		result: Promise<IWallet>;
	} {
		return this.downloadItem(id, Wallet);
	}

	/** Gets a doc in the form of an async list. */
	public getDoc (
		id: string | Async<IAccountFileRecord>
	) : {
		asyncList: IAsyncList<IQuillDelta | IQuillRange>;
		deltas: Observable<IQuillDelta>;
		selections: Observable<IQuillRange>;
	} {
		const file =
			typeof id === 'string' ?
				Promise.all([id, this.getFile(id)]) :
				awaitAsync(id).then(
					async (
						o
					) : Promise<
						[string, IAccountFileRecord & IAccountFileReference]
					> => [o.id, await this.getFile(o)]
				);

		const asyncList = this.accountDatabaseService.getAsyncList(
			file.then(([fileID, {owner}]) => `users/${owner}/docs/${fileID}`),
			BinaryProto,
			undefined,
			file.then(([_, {key}]) => key)
		);

		const docAsyncList: IAsyncList<IQuillDelta | IQuillRange> = {
			clear: async () => asyncList.clear(),
			getFlatValue: async () => docAsyncList.getValue(),
			getValue: async () =>
				(await asyncList.getValue()).map(bytes =>
					this.decodeQuill(bytes)
				),
			lock: async (f, reason) => asyncList.lock(f, reason),
			pushItem: async delta =>
				asyncList.pushItem(this.encodeQuill(delta)),
			setValue: async deltas =>
				asyncList.setValue(
					deltas.map(delta => this.encodeQuill(delta))
				),
			subscribeAndPop: f =>
				asyncList.subscribeAndPop(bytes => f(this.decodeQuill(bytes))),
			updateValue: async f =>
				asyncList.updateValue(async bytesArray =>
					(await f(
						bytesArray.map(bytes => this.decodeQuill(bytes))
					)).map(delta => this.encodeQuill(delta))
				),
			watch: memoize(() =>
				asyncList
					.watch()
					.pipe(
						map(deltas =>
							deltas.map(delta => this.decodeQuill(delta))
						)
					)
			),
			watchFlat: (_OMIT_DUPLICATES?: boolean) => docAsyncList.watch(),
			watchPushes: memoize(() =>
				asyncList.watchPushes().pipe(
					skip(1),
					map(delta => this.decodeQuill(delta))
				)
			)
		};

		const watchers = docAsyncList.getValue().then(deltas => {
			const pushes = docAsyncList.watchPushes().pipe(skip(deltas.length));

			return {
				deltas: <Observable<IQuillDelta>> concat(
					of({
						clientID: '',
						ops:
							deltas.length < 1 ?
								[] :
								deltas
									.filter(
										o =>
											o &&
											typeof (<any> o).index !== 'number'
									)
									.map<DeltaOperation[] | undefined>(
										o => (<any> o).ops
									)
									.reduce<Delta>(
										(delta, ops) =>
											ops ?
												delta.compose(new Delta(ops)) :
												delta,
										new Delta()
									).ops || []
					}),
					pushes.pipe(
						filter(
							(o: any) =>
								o &&
								typeof o.index !== 'number' &&
								o.ops !== undefined
						)
					)
				),
				selections: <Observable<IQuillRange>> (
					pushes.pipe(
						filter(
							(o: any) =>
								o &&
								typeof o.index === 'number' &&
								typeof o.length === 'number'
						)
					)
				)
			};
		});

		return {
			asyncList: docAsyncList,
			deltas: flattenObservable<IQuillDelta>(
				watchers.then(o => o.deltas),
				this.subscriptions
			),
			selections: flattenObservable<IQuillRange>(
				watchers.then(o => o.selections),
				this.subscriptions
			)
		};
	}

	/**
	 * Returns EHR API key.
	 * TODO: Support cases where user has multiple EHR API keys to choose from.
	 */
	public async getEhrApiKey () : Promise<IEhrApiKey> {
		const ehrApiKeys = await this.filesListFiltered.ehrApiKeys
			.pipe(take(1))
			.toPromise();

		if (ehrApiKeys.length < 1) {
			throw new Error('No EHR API keys.');
		}
		if (ehrApiKeys.length > 1) {
			throw new Error('More than one EHR API key.');
		}

		return this.downloadFile(
			ehrApiKeys[0],
			AccountFileRecord.RecordTypes.EhrApiKey
		).result;
	}

	/** Gets the specified file record. */
	public async getFile (
		id:
			| string
			| IAccountFileRecord
			| (IAccountFileRecord & IAccountFileReference),
		recordType?: AccountFileRecord.RecordTypes
	) : Promise<IAccountFileRecord & IAccountFileReference> {
		if (typeof id !== 'string') {
			const maybeFileReference: any = id;
			if (
				maybeFileReference.owner !== undefined &&
				maybeFileReference.key !== undefined
			) {
				return maybeFileReference;
			}
			id = id.id;
		}

		await this.accountDatabaseService.getCurrentUser();

		const reference = await this.accountDatabaseService.getItem(
			`fileReferences/${id}`,
			AccountFileReference
		);

		const record = await this.accountDatabaseService.getItem(
			`users/${reference.owner}/fileRecords/${reference.id}`,
			AccountFileRecord,
			undefined,
			reference.key
		);

		if (recordType !== undefined && record.recordType !== recordType) {
			throw new Error('Specified file does not exist.');
		}

		return {...record, ...reference};
	}

	/** Gets file size. */
	public async getFileSize (
		file: AccountFile,
		{recordType}: {recordType: AccountFileRecord.RecordTypes}
	) : Promise<number> {
		const fileConfig = this.config[recordType];

		return fileConfig.recordType === AccountFileRecord.RecordTypes.Doc ?
			file instanceof Array ?
				file
					.map(o => this.encodeQuill(o).length)
					.reduce((a, b) => a + b, 0) :
				0 :
		fileConfig.recordType === AccountFileRecord.RecordTypes.File ?
			file instanceof Blob ?
				file.size :
			'mediaType' in file ?
				file.data.length :
				NaN :
		fileConfig.recordType === AccountFileRecord.RecordTypes.Note ?
			this.encodeQuill(<IQuillDelta> file).length :
		fileConfig.proto ?
			(await serialize<any>(fileConfig.proto, file)).length :
			NaN;
	}

	/** Gets file type. */
	public getFileType (
		file: AccountFile | IAccountFileRecord
	) : AccountFileRecord.RecordTypes {
		if ('recordType' in file) {
			return file.recordType;
		}

		for (const recordType of this.fileTypes) {
			if (this.config[recordType].isOfType(file)) {
				return recordType;
			}
		}

		throw new Error('Cannot detect record type.');
	}

	/** Gets the Material icon name for the file default thumbnail. */
	public getThumbnail (mediaType: string) : string {
		switch (mediaType) {
			case 'cyph/appointment':
				return 'event';

			case 'cyph/doc':
				return 'subject';

			case 'cyph/ehr-api-key':
				return 'vpn_key';

			case 'cyph/form':
				return 'web';

			case 'cyph/messaging-group':
				return 'group';

			case 'cyph/note':
				return 'short_text';

			case 'cyph/password':
				return 'vpn_key';

			case 'cyph/redox-patient':
				return 'person';

			case 'cyph/wallet':
				return 'account_balance_wallet';
		}

		const typeCategory = mediaType.split('/')[0];

		switch (typeCategory) {
			case 'audio':
				return 'audiotrack';

			case 'image':
				return 'photo';

			case 'video':
				return 'movie';

			default:
				return 'insert_drive_file';
		}
	}

	/** Indicates whether this user has a file with the specified id. */
	public async hasFile (id: string) : Promise<boolean> {
		return this.accountDatabaseService.hasItem(`fileReferences/${id}`);
	}

	/** Initiates group messaging session. */
	public async initMessagingGroup (
		usernames: string[],
		mailUIDefault?: boolean,
		title?: string,
		description?: string
	) : Promise<{
		group: IAccountMessagingGroup;
		id: string;
	}> {
		const group = {
			castleSessionID: uuid(true),
			description,
			mailUIDefault,
			title,
			usernames: [
				...usernames,
				...(this.accountDatabaseService.currentUser.value ?
					[
						this.accountDatabaseService.currentUser.value.user
							.username
					] :
					[])
			]
		};

		return {group, id: await this.upload('', group, usernames).result};
	}

	/** Opens a file. */
	public async openFile (id: string) : Promise<void> {
		this.showSpinner.next(true);

		if (!(await this.openMedia(id))) {
			await this.downloadAndSave(id).result;
		}
	}

	/**
	 * Opens a multimedia file.
	 * @returns Whether or not file is multimedia.
	 */
	public async openMedia (id: string) : Promise<boolean> {
		this.showSpinner.next(true);

		const file = await this.getFile(id);
		const isMedia = await this.isMedia(file);

		if (isMedia) {
			this.dialogService.media({
				mediaType: file.mediaType,
				src: await this.downloadURI(id).result,
				title: file.name
			});
		}

		return isMedia;
	}

	/** Removes a file. */
	public async remove (
		id: string | Async<IAccountFileRecord>,
		confirmAndRedirect: boolean = true
	) : Promise<void> {
		if (typeof id !== 'string') {
			id = await awaitAsync(id);
		}

		const file = await this.getFile(id);

		if (typeof id !== 'string') {
			id = id.id;
		}

		if (confirmAndRedirect) {
			if (
				await this.dialogService.confirm({
					content: `${this.stringsService.deleteMessage} ${file.name}?`,
					title: this.stringsService.deleteConfirm
				})
			) {
				this.router.navigate([this.config[file.recordType].route]);
				await sleep();
			}
			else {
				return;
			}
		}

		const promises = [
			this.accountDatabaseService.removeItem(`fileReferences/${id}`)
		];

		if (
			this.accountDatabaseService.currentUser.value &&
			file.owner ===
				this.accountDatabaseService.currentUser.value.user.username
		) {
			promises.push(
				...[
					this.accountDatabaseService.removeItem(
						`users/${file.owner}/docs/${id}`
					),
					this.accountDatabaseService.removeItem(
						`users/${file.owner}/files/${id}`
					),
					this.accountDatabaseService.removeItem(
						`users/${file.owner}/fileRecords/${id}`
					)
				]
			);
		}

		await Promise.all(promises);
	}

	/** Shares file with another user. */
	public async shareFile (
		id: string | AccountFileReferenceContainer.IAnonymousShare,
		username: string
	) : Promise<void> {
		if (
			this.accountDatabaseService.currentUser.value &&
			this.accountDatabaseService.currentUser.value.user.username ===
				username
		) {
			return;
		}

		let accountFileReferenceContainer: IAccountFileReferenceContainer;

		const constID = id;

		const fileType =
			typeof constID !== 'string' ?
				constID.accountFileRecord.recordType :
				this.accountDatabaseService
					.getItem(`fileReferences/${constID}`, AccountFileReference)
					.then(async o =>
						this.accountDatabaseService.getItem(
							`users/${o.owner}/fileRecords/${constID}`,
							AccountFileRecord,
							undefined,
							o.key
						)
					)
					.then(o => o.recordType);

		/* Anonymous */
		if (typeof id !== 'string') {
			accountFileReferenceContainer = {anonymousShare: id};
			id = id.accountFileRecord.id;
		}
		/* Non-anonymous/signed */
		else if (this.accountDatabaseService.currentUser.value) {
			const data = await this.accountDatabaseService.getItem(
				`fileReferences/${id}`,
				BinaryProto
			);

			accountFileReferenceContainer = {
				signedShare: {
					accountFileReference: await this.potassiumService.sign.sign(
						data,
						this.accountDatabaseService.currentUser.value.keys
							.signingKeyPair.privateKey
					),
					owner: this.accountDatabaseService.currentUser.value.user
						.username
				}
			};
		}
		/* Invalid attempt to perform signed share */
		else {
			throw new Error('Invalid AccountFilesService.shareFile input.');
		}

		try {
			await this.databaseService.setItem(
				`users/${username}/incomingFiles/${id}`,
				BinaryProto,
				await this.potassiumService.box.seal(
					await serialize(
						AccountFileReferenceContainer,
						accountFileReferenceContainer
					),
					(await this.accountDatabaseService.getUserPublicKeys(
						username
					)).encryption
				),
				false
			);
		}
		catch {
			/* setItem will fail with permission denied when
				trying to share the same file more than once. */
			return;
		}

		await this.accountDatabaseService.notify(
			username,
			NotificationTypes.File,
			{fileType: await fileType, id}
		);
	}

	/** Creates a dialog to share a file with another user. */
	public async shareFilePrompt (file: AccountFileShare) : Promise<void> {
		const closeFunction = resolvable<() => void>();

		await this.dialogService.baseDialog(
			await AccountFilesService.accountFileSharingComponent.promise,
			o => {
				o.closeFunction = closeFunction;
				o.file = file;
			},
			closeFunction
		);
	}

	/** Overwrites an existing appointment. */
	public async updateAppointment (
		id: string,
		content: IAppointment,
		name?: string,
		onlyIfOwner: boolean = false
	) : Promise<void> {
		const file = await this.getFile(
			id,
			AccountFileRecord.RecordTypes.Appointment
		);

		if (
			onlyIfOwner &&
			(!this.accountDatabaseService.currentUser.value ||
				file.owner !==
					this.accountDatabaseService.currentUser.value.user.username)
		) {
			return;
		}

		file.timestamp = await getTimestamp();

		if (name) {
			file.name = name;
		}

		await Promise.all([
			this.accountDatabaseService.setItem(
				`users/${file.owner}/files/${id}`,
				Appointment,
				content,
				undefined,
				file.key
			),
			this.accountDatabaseService.setItem<IAccountFileRecord>(
				`users/${file.owner}/fileRecords/${id}`,
				AccountFileRecord,
				file,
				undefined,
				file.key
			)
		]);
	}

	/** Overwrites an existing doc. */
	public async updateDoc (
		id: string,
		delta: IQuillDelta | IQuillRange
	) : Promise<void> {
		const file = await this.getFile(id);

		await this.accountDatabaseService.pushItem(
			`users/${file.owner}/docs/${id}`,
			BinaryProto,
			this.encodeQuill(delta),
			undefined,
			file.key
		);
	}

	/** Updates file record with new metadata. */
	public async updateMetadata (
		id: string,
		metadata: {
			mediaType?: string;
			name?: string;
			size?: number;
		}
	) : Promise<void> {
		const original = await this.getFile(id);

		await this.accountDatabaseService.setItem<IAccountFileRecord>(
			`users/${original.owner}/fileRecords/${id}`,
			AccountFileRecord,
			{
				id,
				mediaType:
					metadata.mediaType === undefined ?
						original.mediaType :
						metadata.mediaType,
				name:
					metadata.name === undefined ? original.name : metadata.name,
				recordType: original.recordType,
				size:
					metadata.size === undefined ? original.size : metadata.size,
				timestamp: await getTimestamp()
			},
			undefined,
			original.key
		);
	}

	/** Overwrites an existing note. */
	public async updateNote (
		id: string,
		content: IQuillDelta,
		name?: string
	) : Promise<void> {
		const bytes = this.encodeQuill(content);

		const file = await this.getFile(id, AccountFileRecord.RecordTypes.Note);
		file.size = bytes.length;
		file.timestamp = await getTimestamp();

		if (name) {
			file.name = name;
		}

		debugLog(() => ({
			updateNote: {
				content,
				file,
				id
			}
		}));

		await Promise.all([
			this.accountDatabaseService.setItem(
				`users/${file.owner}/files/${id}`,
				BinaryProto,
				bytes,
				undefined,
				file.key
			),
			this.accountDatabaseService.setItem<IAccountFileRecord>(
				`users/${file.owner}/fileRecords/${id}`,
				AccountFileRecord,
				file,
				undefined,
				file.key
			)
		]);
	}

	/** Overwrites an existing password. */
	public async updatePassword (
		id: string,
		password: IPassword,
		name?: string
	) : Promise<void> {
		const bytes = await serialize(Password, password);

		const file = await this.getFile(
			id,
			AccountFileRecord.RecordTypes.Password
		);
		file.name = name || password.url || file.name || '';
		file.size = bytes.length;
		file.timestamp = await getTimestamp();

		await Promise.all([
			this.accountDatabaseService.setItem(
				`users/${file.owner}/files/${id}`,
				BinaryProto,
				bytes,
				undefined,
				file.key
			),
			this.accountDatabaseService.setItem<IAccountFileRecord>(
				`users/${file.owner}/fileRecords/${id}`,
				AccountFileRecord,
				file,
				undefined,
				file.key
			)
		]);
	}

	/**
	 * Uploads new file.
	 * @param data If string, will convert into a note.
	 * @param shareWithUser Username(s) of another user or users to share this file with.
	 */
	public upload (
		name: string,
		data: AccountFile | string,
		shareWithUser?: string | string[],
		metadata?: string,
		replyTo?: {email?: string; name?: string},
		wasAnonymousShare: boolean = false
	) : {
		progress: Observable<number>;
		result: Promise<string>;
	} {
		let anonymous = false;
		let username: string;

		const shareWithUsers = !shareWithUser ?
			[] :
			normalizeArray(
				typeof shareWithUser === 'string' ?
					[shareWithUser] :
					shareWithUser
			).filter(
				u =>
					!this.accountDatabaseService.currentUser.value ||
					u !==
						this.accountDatabaseService.currentUser.value.user
							.username
			);

		if (this.accountDatabaseService.currentUser.value) {
			username = this.accountDatabaseService.currentUser.value.user
				.username;
		}
		else if (shareWithUsers.length > 0) {
			anonymous = true;
			username = shareWithUsers[0];
		}
		else {
			throw new Error('Invalid AccountFilesService.upload input.');
		}

		this.showSpinner.next(true);

		const id = uuid();
		const key = (async () =>
			this.potassiumService.randomBytes(
				await this.potassiumService.secretBox.keyBytes
			))();
		const url = `users/${username}/files/${id}`;

		const file =
			typeof data === 'string' ?
				<IQuillDelta> new Delta().insert(data) :
				data;

		const fileConfig = this.config[this.getFileType(file)];

		const {progress, result} =
			fileConfig.recordType === AccountFileRecord.RecordTypes.Doc ?
				(() => {
					const doc = file instanceof Array ? file : [];
					const docProgress = new BehaviorSubject(0);

					return {
						progress: docProgress,
						result: (async () => {
							for (let i = 0; i < doc.length; ++i) {
								docProgress.next(
									Math.round((i / doc.length) * 100)
								);

								await this.accountDatabaseService.pushItem(
									`users/${username}/docs/${id}`,
									BinaryProto,
									this.encodeQuill(doc[i]),
									undefined,
									key
								);
							}

							docProgress.next(100);
							return {hash: '', url: ''};
						})()
					};
				})() :
			fileConfig.recordType === AccountFileRecord.RecordTypes.File ?
				file instanceof Blob ?
					this.accountDatabaseService.uploadItem(
						url,
						BlobProto,
						file,
						undefined,
						key
					) :
					this.accountDatabaseService.uploadItem(
						url,
						BinaryProto,
						'mediaType' in file ? file.data : new Uint8Array(0),
						undefined,
						key
					) :
			fileConfig.recordType === AccountFileRecord.RecordTypes.Note ?
				this.accountDatabaseService.uploadItem(
					url,
					BinaryProto,
					this.encodeQuill(<IQuillDelta> file),
					undefined,
					key
				) :
				this.accountDatabaseService.uploadItem(
					url,
					<any> fileConfig.proto,
					file,
					fileConfig.securityModel,
					key
				);

		return {
			progress,
			result: result.then(async () => {
				const accountFileRecord = {
					id,
					mediaType:
						fileConfig.mediaType ||
						(file instanceof Blob ? file.type : undefined) ||
						('mediaType' in file ? file.mediaType : undefined) ||
						'application/octet-stream',
					name,
					recordType: fileConfig.recordType,
					replyToEmail: replyTo && replyTo.email,
					replyToName: replyTo && replyTo.name,
					size: await this.getFileSize(file, fileConfig),
					timestamp: await getTimestamp(),
					wasAnonymousShare
				};

				if (anonymous) {
					await this.shareFile(
						{accountFileRecord, key: await key},
						username
					);
				}
				else {
					await this.accountDatabaseService.setItem(
						`fileRecords/${id}`,
						AccountFileRecord,
						accountFileRecord,
						undefined,
						key
					);

					await this.accountDatabaseService.setItem<
						IAccountFileReference
					>(`fileReferences/${id}`, AccountFileReference, {
						id,
						key: await key,
						metadata,
						owner: username
					});

					await Promise.all(
						shareWithUsers.map(async u => this.shareFile(id, u))
					);
				}

				this.showSpinner.next(false);

				return id;
			})
		};
	}

	/** Watches appointment. */
	public watchAppointment (
		id: string | IAccountFileRecord
	) : Observable<IAppointment> {
		return getOrSetDefault(
			this.watchAppointmentCache,
			typeof id === 'string' ? id : id.id,
			() => {
				const filePromise = this.getFile(id);

				return this.accountDatabaseService
					.watch(
						filePromise.then(
							file => `users/${file.owner}/files/${file.id}`
						),
						Appointment,
						undefined,
						filePromise.then(file => file.key),
						undefined,
						this.subscriptions
					)
					.pipe(map(o => o.value));
			}
		);
	}

	/** Watches file record. */
	public watchMetadata (
		id: string | IAccountFileRecord
	) : Observable<IAccountFileRecord & IAccountFileReference> {
		return getOrSetDefault(
			this.watchMetadataCache,
			typeof id === 'string' ? id : id.id,
			() => {
				const filePromise = this.getFile(id);

				return this.accountDatabaseService
					.watch(
						filePromise.then(
							file => `users/${file.owner}/fileRecords/${file.id}`
						),
						AccountFileRecord,
						undefined,
						filePromise.then(file => file.key),
						undefined,
						this.subscriptions
					)
					.pipe(
						mergeMap(async o => ({
							...o.value,
							...(await filePromise),
							name: o.value.name.slice(0, this.maxNameLength)
						}))
					);
			}
		);
	}

	/** Watches note. */
	public watchNote (
		id: string | IAccountFileRecord
	) : Observable<IQuillDelta> {
		return getOrSetDefault(
			this.watchNoteCache,
			typeof id === 'string' ? id : id.id,
			() => {
				const filePromise = this.getFile(id);

				return this.accountDatabaseService
					.watch(
						filePromise.then(
							file => `users/${file.owner}/files/${file.id}`
						),
						BinaryProto,
						undefined,
						filePromise.then(file => file.key),
						undefined,
						this.subscriptions
					)
					.pipe(
						map(o => {
							const decoded = this.decodeQuill(o.value);
							if (!decoded.ops) {
								decoded.ops = [];
							}
							return decoded;
						})
					);
			}
		);
	}

	/** Watches password. */
	public watchPassword (
		id: string | IAccountFileRecord
	) : Observable<IPassword> {
		return getOrSetDefault(
			this.watchPasswordCache,
			typeof id === 'string' ? id : id.id,
			() => {
				const filePromise = this.getFile(id);

				return this.accountDatabaseService
					.watch(
						filePromise.then(
							file => `users/${file.owner}/files/${file.id}`
						),
						Password,
						undefined,
						filePromise.then(file => file.key),
						undefined,
						this.subscriptions
					)
					.pipe(map(o => o.value));
			}
		);
	}

	constructor (
		/** @ignore */
		private readonly router: Router,

		/** @ignore */
		private readonly accountDatabaseService: AccountDatabaseService,

		/** @ignore */
		private readonly accountSettingsService: AccountSettingsService,

		/** @ignore */
		private readonly configService: ConfigService,

		/** @ignore */
		private readonly databaseService: DatabaseService,

		/** @ignore */
		private readonly dialogService: DialogService,

		/** @ignore */
		private readonly fileService: FileService,

		/** @ignore */
		private readonly potassiumService: PotassiumService,

		/** @ignore */
		private readonly stringsService: StringsService
	) {
		super();

		(async () => {
			if (
				(await this.accountDatabaseService.getListKeys(
					'fileReferences'
				)).length === 0
			) {
				this.initiated.next(true);
				this.showSpinner.next(false);
			}
			else {
				this.filesList
					.pipe(
						filter(arr => arr.length > 0),
						take(1)
					)
					.toPromise()
					.then(() => {
						this.initiated.next(true);
						this.showSpinner.next(false);
					});
			}
		})();
	}
}
