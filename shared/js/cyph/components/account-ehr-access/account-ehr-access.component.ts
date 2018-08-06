import {ChangeDetectionStrategy, Component, OnInit} from '@angular/core';
import memoize from 'lodash-es/memoize';
import {BaseProvider} from '../../base-provider';
import {
	AccountFileRecord,
	IAccountFileRecord,
	IAccountFileReference,
	IEhrApiKey
} from '../../proto';
import {AccountContactsService} from '../../services/account-contacts.service';
import {AccountFilesService} from '../../services/account-files.service';
import {AccountService} from '../../services/account.service';
import {AccountAuthService} from '../../services/crypto/account-auth.service';
import {AccountDatabaseService} from '../../services/crypto/account-database.service';
import {EHRIntegrationService} from '../../services/ehr-integration.service';
import {EnvService} from '../../services/env.service';
import {StringsService} from '../../services/strings.service';
import {trackByID} from '../../track-by/track-by-id';
import {getDateTimeString} from '../../util/time';


/**
 * Angular component for EHR access UI.
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'cyph-account-ehr-access',
	styleUrls: ['./account-ehr-access.component.scss'],
	templateUrl: './account-ehr-access.component.html'
})
export class AccountEhrAccessComponent extends BaseProvider implements OnInit {
	/** @see getDateTimeString */
	public readonly getDateTimeString: typeof getDateTimeString	= getDateTimeString;

	/** Downloads EHR API key. */
	public readonly getEhrApiKey								= memoize(async ehrApiKey =>
		this.accountFilesService.downloadFile(
			ehrApiKey,
			AccountFileRecord.RecordTypes.EhrApiKey
		).result
	);

	/** @see trackByID */
	public readonly trackByID: typeof trackByID					= trackByID;

	/** Accepts incoming EHR API key. */
	public async accept (ehrApiKey: IAccountFileRecord&IAccountFileReference) : Promise<void> {
		await this.accountFilesService.acceptIncomingFile(ehrApiKey, {
			copy: true,
			name: !ehrApiKey.wasAnonymousShare ?
				ehrApiKey.owner :
				getDateTimeString(ehrApiKey.timestamp)
		});
	}

	/** @inheritDoc */
	public ngOnInit () : void {
		this.accountService.transitionEnd();
	}

	/** Removes an EHR API key. */
	public async remove (ehrApiKey: IAccountFileRecord&IAccountFileReference) : Promise<void> {
		const {apiKey}	= await this.getEhrApiKey(ehrApiKey);

		await Promise.all([
			this.accountFilesService.remove(ehrApiKey),
			ehrApiKey.metadata ?
				this.ehrIntegrationService.deleteApiKey(apiKey, ehrApiKey.metadata) :
				undefined
		]);
	}

	/** Creates and shares new EHR API key. */
	public async share (ehrApiKey: IEhrApiKey) : Promise<void> {
		await this.accountFilesService.shareFilePrompt(async username => ({
			data: {
				apiKey: await this.ehrIntegrationService.generateApiKey(
					username,
					ehrApiKey.apiKey
				),
				isMaster: false
			},
			metadata: ehrApiKey.apiKey,
			name: username
		}));
	}

	constructor (
		/** @ignore */
		private readonly ehrIntegrationService: EHRIntegrationService,

		/** @see AccountService */
		public readonly accountService: AccountService,

		/** @see AccountAuthService */
		public readonly accountAuthService: AccountAuthService,

		/** @see AccountContactsService */
		public readonly accountContactsService: AccountContactsService,

		/** @see AccountDatabaseService */
		public readonly accountDatabaseService: AccountDatabaseService,

		/** @see AccountFilesService */
		public readonly accountFilesService: AccountFilesService,

		/** @see EnvService */
		public readonly envService: EnvService,

		/** @see StringsService */
		public readonly stringsService: StringsService
	) {
		super();
	}
}
