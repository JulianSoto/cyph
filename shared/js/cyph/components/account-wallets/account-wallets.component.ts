import {ChangeDetectionStrategy, Component, OnInit} from '@angular/core';
import {BehaviorSubject} from 'rxjs';
import {BaseProvider} from '../../base-provider';
import {NewWalletOptions} from '../../cryptocurrency';
import {
	getFormValue,
	input,
	newForm,
	newFormComponent,
	newFormContainer,
	numberInput,
	slideToggle,
	text
} from '../../forms';
import {
	Cryptocurrencies,
	Currencies,
	IAccountFileRecord,
	IWallet
} from '../../proto';
import {AccountContactsService} from '../../services/account-contacts.service';
import {AccountFilesService} from '../../services/account-files.service';
import {AccountService} from '../../services/account.service';
import {AccountAuthService} from '../../services/crypto/account-auth.service';
import {AccountDatabaseService} from '../../services/crypto/account-database.service';
import {CryptocurrencyService} from '../../services/cryptocurrency.service';
import {DialogService} from '../../services/dialog.service';
import {EnvService} from '../../services/env.service';
import {QRService} from '../../services/qr.service';
import {StringsService} from '../../services/strings.service';
import {trackByID} from '../../track-by/track-by-id';
import {numberToString} from '../../util/formatting';
import {debugLogError} from '../../util/log';
import {getDateTimeString} from '../../util/time';

/**
 * Angular component for wallets UI.
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'cyph-account-wallets',
	styleUrls: ['./account-wallets.component.scss'],
	templateUrl: './account-wallets.component.html'
})
export class AccountWalletsComponent extends BaseProvider implements OnInit {
	/** @see Cryptocurrencies */
	public readonly cryptocurrencies = Cryptocurrencies;

	/** @see Currencies */
	public readonly currencies = Currencies;

	/** Current draft of edited wallet. */
	public readonly draft = new BehaviorSubject<{
		id?: string;
		name?: string;
	}>({});

	/** Edit mode. */
	public editMode = new BehaviorSubject<boolean>(false);

	/** @see getDateTimeString */
	public readonly getDateTimeString = getDateTimeString;

	/** Indicates whether speed dial is open. */
	public readonly isSpeedDialOpen = new BehaviorSubject<boolean>(false);

	/** @see NewWalletOptions */
	public readonly newWalletOptions = NewWalletOptions;

	/** @see numberToString */
	public readonly numberToString = numberToString;

	/** @see trackByID */
	public readonly trackByID = trackByID;

	/** Transaction list columns. */
	public readonly transactionListColumns: string[] = [
		'amount',
		'senders',
		'wasSentByMe',
		'recipients',
		'timestamp'
	];

	/** Generates and uploads a new wallet. */
	/* eslint-disable-next-line complexity */
	public async generate (
		newWalletOptions: NewWalletOptions = NewWalletOptions.generate,
		cryptocurrency: Cryptocurrencies = Cryptocurrencies.BTC
	) : Promise<void> {
		const subtitle =
			newWalletOptions === NewWalletOptions.generate ?
				this.stringsService.newWalletGenerateText :
			newWalletOptions === NewWalletOptions.importAddress ?
				this.stringsService.newWalletImportAddressText :
			newWalletOptions === NewWalletOptions.importKey ?
				this.stringsService.newWalletImportKeyText :
				undefined;

		const title =
			newWalletOptions === NewWalletOptions.generate ?
				this.stringsService.newWalletGenerate :
			newWalletOptions === NewWalletOptions.importAddress ?
				this.stringsService.newWalletImportAddress :
			newWalletOptions === NewWalletOptions.importKey ?
				this.stringsService.newWalletImportKey :
				undefined;

		if (!subtitle || !title) {
			return;
		}

		const generateForm = await this.dialogService.prompt({
			content: '',
			form: newForm([
				newFormComponent([
					newFormContainer([
						text({
							label: subtitle
						})
					])
				]),
				newFormComponent([
					newFormContainer([
						input({
							label: this.stringsService.newWalletNameInput,
							required: true,
							value: this.stringsService.newWalletNameDefaultValue
						})
					]),
					...(newWalletOptions === NewWalletOptions.importAddress ?
						[
							newFormContainer([input({
									label: this.stringsService
										.newWalletImportAddressInput,
									required: true
								})])
						] :
					newWalletOptions === NewWalletOptions.importKey ?
						[
							newFormContainer([input({
									label: this.stringsService
										.newWalletImportKeyInput,
									required: true
								}), slideToggle({
									label: this.stringsService
										.newWalletUncompressed,
									noGrow: true,
									tooltip: this.stringsService
										.newWalletUncompressedTooltip
								})])
						] :
						[])
				])
			]),
			title
		});

		const name = getFormValue(generateForm, 'string', 1, 0, 0);

		const address =
			newWalletOptions === NewWalletOptions.importAddress ?
				getFormValue(generateForm, 'string', 1, 1, 0) :
				undefined;

		const key =
			newWalletOptions === NewWalletOptions.importKey ?
				getFormValue(generateForm, 'string', 1, 1, 0) :
				undefined;

		const uncompressedPublicKey =
			newWalletOptions === NewWalletOptions.importKey ?
				getFormValue(generateForm, 'boolean', 1, 1, 1) :
				undefined;

		if (!name) {
			return;
		}

		switch (newWalletOptions) {
			case NewWalletOptions.importAddress:
				if (!address) {
					return;
				}
				break;

			case NewWalletOptions.importKey:
				if (!(typeof key === 'string' && key.length > 0)) {
					return;
				}
		}

		try {
			await this.accountFilesService.upload(
				name,
				await this.cryptocurrencyService.generateWallet({
					address,
					cryptocurrency,
					key,
					uncompressedPublicKey
				})
			).result;
		}
		catch (err) {
			debugLogError(() => ({walletUploadFailure: {err}}));

			await this.dialogService.alert({
				content: this.stringsService.newWalletErrorText,
				title: this.stringsService.newWalletErrorTitle
			});
		}
	}

	/** @inheritDoc */
	public ngOnInit () : void {
		this.accountService.transitionEnd();
	}

	/** Saves draft edits. */
	public async saveEdits () : Promise<void> {
		if (
			this.editMode.value &&
			this.draft.value &&
			this.draft.value.id &&
			this.draft.value.name
		) {
			await this.accountFilesService.updateMetadata(this.draft.value.id, {
				name: this.draft.value.name
			});
		}

		this.setEditMode(false);
	}

	/** Sends money. */
	public async send (
		wallet: IWallet,
		recipient?: string,
		amount?: number
	) : Promise<void> {
		if (recipient === undefined || amount === undefined || isNaN(amount)) {
			this.accountFilesService.showSpinner.next(true);

			let balance: number;
			try {
				balance = await this.cryptocurrencyService.getBalance(wallet);
			}
			finally {
				this.accountFilesService.showSpinner.next(false);
			}

			const step = 0.00000001;

			const max = Math.min(
				20999999.9769,
				Math.max(
					balance - this.cryptocurrencyService.transactionFee,
					this.cryptocurrencyService.minimumTransactionAmount
				)
			);

			const min = Math.min(
				max,
				this.cryptocurrencyService.minimumTransactionAmount
			);

			const sendForm = await this.dialogService.prompt({
				content: '',
				form: newForm([
					newFormComponent([
						newFormContainer([
							text({
								label: this.stringsService.setParameters(
									this.stringsService.bitcoinTransactionFee,
									{
										1: this.cryptocurrencyService.transactionFee.toString()
									}
								)
							})
						])
					]),
					newFormComponent([
						newFormContainer([
							input({
								label: this.stringsService
									.bitcoinRecipientLabel,
								value: recipient
							})
						])
					]),
					newFormComponent([
						newFormContainer([
							numberInput({
								label: this.stringsService.bitcoinAmountLabel,
								max,
								min,
								step,
								value: typeof amount === 'number' ? amount : min
							})
						])
					])
				]),
				title: this.stringsService.bitcoinSendTitle
			});

			recipient = getFormValue(sendForm, 'string', 1, 0, 0);
			amount = getFormValue(sendForm, 'number', 2, 0, 0);
		}

		if (recipient === undefined || amount === undefined || isNaN(amount)) {
			return;
		}

		if (
			!(await this.dialogService.confirm({
				content: this.stringsService.setParameters(
					this.stringsService.bitcoinConfirmationPrompt,
					{
						1: amount.toFixed(8),
						2: recipient
					}
				),
				title: this.stringsService.bitcoinSendTitle
			}))
		) {
			return;
		}

		this.accountFilesService.showSpinner.next(true);

		try {
			await this.cryptocurrencyService.send(wallet, recipient, amount);

			return this.dialogService.alert({
				content: `${
					this.stringsService.bitcoinSuccessText
				} ${amount.toFixed(8)} ${this.stringsService.bitcoinShort}.`,
				title: this.stringsService.bitcoinSuccessTitle
			});
		}
		catch (err) {
			return this.dialogService.alert({
				content: `${
					this.stringsService.bitcoinErrorText
				} ${amount.toFixed(8)} ${this.stringsService.bitcoinShort}${
					err instanceof Error ? `: ${err.message}` : '.'
				}`,
				title: this.stringsService.bitcoinErrorTitle
			});
		}
		finally {
			this.accountFilesService.showSpinner.next(false);
		}
	}

	/** Sets edit mode. */
	public setEditMode (editMode: boolean | IAccountFileRecord) : void {
		if (typeof editMode === 'object') {
			this.draft.next({id: editMode.id, name: editMode.name});
			this.editMode.next(true);
		}
		else {
			this.draft.next({});
			this.editMode.next(editMode);
		}
	}

	/** Updates draft. */
	public updateDraft (draft: {id?: string; name?: string}) : void {
		this.draft.next({...this.draft.value, ...draft});
	}

	constructor (
		/** @ignore */
		private readonly dialogService: DialogService,

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

		/** @see CryptocurrencyService */
		public readonly cryptocurrencyService: CryptocurrencyService,

		/** @see EnvService */
		public readonly envService: EnvService,

		/** @see QRService */
		public readonly qrService: QRService,

		/** @see StringsService */
		public readonly stringsService: StringsService
	) {
		super();
	}
}
