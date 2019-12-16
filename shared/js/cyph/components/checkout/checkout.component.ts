/* eslint-disable max-lines */

import {
	AfterViewInit,
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	ElementRef,
	EventEmitter,
	Input,
	OnInit,
	Output
} from '@angular/core';
import * as bitPay from 'bitpay.js';
import * as braintreeDropIn from 'braintree-web-drop-in';
import memoize from 'lodash-es/memoize';
import {BehaviorSubject} from 'rxjs';
import {BaseProvider} from '../../base-provider';
import {SubscriptionTypes} from '../../checkout';
import {AffiliateService} from '../../services/affiliate.service';
import {ConfigService} from '../../services/config.service';
import {EnvService} from '../../services/env.service';
import {StringsService} from '../../services/strings.service';
import {trackBySelf} from '../../track-by/track-by-self';
import {trackByValue} from '../../track-by/track-by-value';
import {request, requestJSON} from '../../util/request';
import {uuid} from '../../util/uuid';
import {sleep} from '../../util/wait';
import {openWindow} from '../../util/window';
import {bitPayLogo} from './bit-pay-logo';

/**
 * Angular component for Braintree payment checkout UI.
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'cyph-checkout',
	styleUrls: ['./checkout.component.scss'],
	templateUrl: './checkout.component.html'
})
export class CheckoutComponent extends BaseProvider
	implements AfterViewInit, OnInit {
	/** @ignore */
	private readonly authorization = request({
		retries: 5,
		url: this.envService.baseUrl + 'braintree'
	});

	/** BitPay invoice ID. */
	private bitPayInvoiceID?: Promise<string>;

	/* Braintree instance. */
	private braintreeInstance: any;

	/** Address. */
	@Input() public address: {
		countryCode?: string;
		postalCode?: string;
		streetAddress?: string;
	} = {};

	/** Indicates whether affiliate offer is accepted. */
	public affiliate: boolean = false;

	/** Amount in dollars. */
	@Input() public amount: number = 0;

	/** Item category ID number. */
	@Input() public category?: number;

	/** Company. */
	@Input() public company?: string;

	/** Indicates whether checkout is complete. */
	public readonly complete = new BehaviorSubject<boolean>(false);

	/** Indicates whether confirmation message should be shown. */
	public readonly confirmationMessage = new BehaviorSubject<
		{welcomeLetter?: string} | undefined
	>(undefined);

	/** Checkout confirmation event; emits API key if applicable. */
	@Output() public readonly confirmed = new EventEmitter<{
		apiKey?: string;
		namespace?: string;
	}>();

	/** ID of Braintree container element. */
	public readonly containerID: string = `id-${uuid()}`;

	/** Email address. */
	@Input() public email?: string;

	/** Error message. */
	public readonly errorMessage = new BehaviorSubject<string | undefined>(
		undefined
	);

	/** Discount for each user after the first one. */
	@Input() public extraUserDiscount: number = 0;

	/** Formats item name. */
	public readonly formatItemName = memoize((itemName?: string) =>
		typeof itemName === 'string' ?
			itemName.replace(/([A-Z])/g, ' $1').toUpperCase() :
			undefined
	);

	/** Item ID number. */
	@Input() public item?: number;

	/** Item name. */
	@Input() public itemName?: string;

	/** Name. */
	@Input() public name: {
		firstName?: string;
		lastName?: string;
	} = {};

	/** Namespace to use for generating API key. */
	@Input() public namespace?: string;

	/** If true, will never stop spinning. */
	@Input() public noSpinnerEnd: boolean = false;

	/** Selected payment option. */
	public readonly paymentOption = new BehaviorSubject<string | undefined>(
		undefined
	);

	/** Indicates whether payment is pending. */
	public readonly pending = new BehaviorSubject<boolean>(false);

	/** Indicates whether pricing is per-user. */
	@Input() public perUser: boolean = false;

	/** @see SubscriptionTypes */
	@Input() public subscriptionType?: SubscriptionTypes;

	/** @see SubscriptionTypes */
	public readonly subscriptionTypes = SubscriptionTypes;

	/** Indicates whether checkout is complete. */
	public readonly success = new BehaviorSubject<boolean>(false);

	/** @see trackBySelf */
	public readonly trackBySelf = trackBySelf;

	/** @see trackByValue */
	public readonly trackByValue = trackByValue;

	/** User count options. */
	public readonly userOptions: number[] = new Array(99)
		.fill(0)
		.map((_, i) => i + 2);

	/** Number of users for per-user pricing. */
	public readonly users = new BehaviorSubject<number>(1);

	/** Creates BitPay invoice. */
	private async createBitPayInvoice (
		amount: number = this.amount
	) : Promise<string> {
		const o = await requestJSON({
			contentType: 'application/json',
			data: {
				buyer: {
					email: 'bitpay-checkout@cyph.com',
					notify: true
				},
				currency: 'USD',
				price: amount,
				token: this.configService.bitPayToken
			},
			headers: {'x-accept-version': '2.0.0'},
			method: 'POST',
			url: 'https://bitpay.com/invoices'
		}).catch(() => undefined);

		const id = o?.data?.id;

		if (typeof id !== 'string' || id.length < 1) {
			throw new Error('Creating BitPay invoice failed.');
		}

		return id;
	}

	/** Gets BitPay invoice. */
	private async getBitPayInvoice (id: string) : Promise<any> {
		return (
			(await requestJSON({
				url: `https://bitpay.com/invoices/${id}?token=${this.configService.bitPayToken}`
			}))?.data || {}
		);
	}

	/** @inheritDoc */
	public ngOnInit () : void {
		/* Workaround for Angular Elements leaving inputs as strings */

		/* eslint-disable-next-line @typescript-eslint/tslint/config */
		if (typeof this.amount === 'string' && this.amount) {
			this.amount = parseFloat(this.amount);
		}
		/* eslint-disable-next-line @typescript-eslint/tslint/config */
		if (typeof this.category === 'string' && this.category) {
			this.category = parseFloat(this.category);
		}
		if (
			/* eslint-disable-next-line @typescript-eslint/tslint/config */
			typeof this.extraUserDiscount === 'string' &&
			this.extraUserDiscount
		) {
			this.extraUserDiscount = parseFloat(this.extraUserDiscount);
		}
		/* eslint-disable-next-line @typescript-eslint/tslint/config */
		if (typeof this.item === 'string' && this.item) {
			this.item = parseFloat(this.item);
		}
		/* eslint-disable-next-line @typescript-eslint/tslint/config */
		if (typeof this.noSpinnerEnd === 'string') {
			this.noSpinnerEnd = <any> this.noSpinnerEnd === 'true';
		}
		/* eslint-disable-next-line @typescript-eslint/tslint/config */
		if (typeof this.perUser === 'string') {
			this.perUser = <any> this.perUser === 'true';
		}
		if (
			/* eslint-disable-next-line @typescript-eslint/tslint/config */
			typeof this.subscriptionType === 'string' &&
			this.subscriptionType
		) {
			this.subscriptionType = parseFloat(this.subscriptionType);
			if (isNaN(this.subscriptionType)) {
				this.subscriptionType = undefined;
			}
		}

		(async () => {
			if (!this.address.countryCode) {
				this.address.countryCode = (await this.envService
					.countries)[0]?.value;
			}

			while (!this.destroyed.value) {
				this.changeDetectorRef.detectChanges();
				await sleep();
			}
		})();
	}

	/** @inheritDoc */
	public async ngAfterViewInit () : Promise<void> {
		if (!this.elementRef.nativeElement || !this.envService.isWeb) {
			/* TODO: HANDLE NATIVE */
			return;
		}

		await sleep(0);

		this.complete.next(false);

		const amountString = this.amount.toFixed(2);

		if (this.subscriptionType === undefined) {
			this.bitPayInvoiceID = this.createBitPayInvoice();
		}

		braintreeDropIn.create(
			{
				applePay: {
					displayName: 'Cyph',
					paymentRequest: {
						amount: amountString,
						label: 'Cyph'
					}
				},
				authorization: await this.authorization,
				/*
				googlePay: {
					googlePayVersion: 2,
					merchantId: 'TODO: Get this',
					transactionInfo: {
						currencyCode: 'USD',
						totalPrice: amountString,
						totalPriceStatus: 'FINAL'
					}
				},
				*/
				paypal: {
					buttonStyle: {
						color: 'blue',
						shape: 'pill',
						size: 'responsive'
					},
					flow: 'vault'
				},
				paypalCredit: {
					flow: 'vault'
				},
				selector: `#${this.containerID}`
				/*
				venmo: {
					allowNewBrowserTab: false
				}
				*/
			},
			(err: any, instance: any) => {
				if (err) {
					throw err;
				}

				this.braintreeInstance = instance;

				this.braintreeInstance.on('paymentOptionSelected', (o: any) => {
					const paymentOption = o?.paymentOption;
					if (typeof paymentOption === 'string') {
						this.paymentOption.next(paymentOption);
					}
				});

				if (!(this.elementRef.nativeElement instanceof HTMLElement)) {
					return;
				}

				/* eslint-disable-next-line no-unused-expressions */
				this.elementRef.nativeElement
					.querySelector('.braintree-toggle')
					?.addEventListener('click', () => {
						this.paymentOption.next(undefined);
					});

				if (!this.bitPayInvoiceID) {
					return;
				}

				const lastOption = this.elementRef.nativeElement.querySelector(
					'.braintree-option:last-of-type'
				);

				if (!(lastOption instanceof HTMLElement)) {
					return;
				}

				const bitPayOption = lastOption.cloneNode(true);
				const optionsParent = lastOption.parentElement;

				if (
					!(bitPayOption instanceof HTMLElement) ||
					!(optionsParent instanceof HTMLElement)
				) {
					return;
				}

				const otherOptionClass = Array.from(
					bitPayOption.classList
				).find(s => s.startsWith('braintree-option_'));
				if (otherOptionClass) {
					bitPayOption.classList.remove(otherOptionClass);
				}

				const originalLogo = lastOption.querySelector(
					'.braintree-option__logo'
				);
				const logo = bitPayOption.querySelector(
					'.braintree-option__logo'
				);
				if (
					logo instanceof HTMLElement &&
					originalLogo instanceof HTMLElement
				) {
					const logoHeight = originalLogo.clientHeight;
					const logoWidth = originalLogo.clientWidth;

					while (logo.firstElementChild) {
						logo.removeChild(logo.firstElementChild);
					}

					logo.style.height = `${logoHeight}px`;
					logo.style.maxHeight = `${logoHeight}px`;
					logo.style.minHeight = `${logoHeight}px`;

					logo.style.width = `${logoWidth}px`;
					logo.style.maxWidth = `${logoWidth}px`;
					logo.style.minWidth = `${logoWidth}px`;

					const img = document.createElement('img');
					img.src = bitPayLogo;
					img.height = logoHeight;
					img.width = logoHeight;
					img.style.margin = 'auto';
					img.style.transform = 'scale(1.5)';
					logo.appendChild(img);
				}

				const label = bitPayOption.querySelector(
					'.braintree-option__label'
				);
				if (label instanceof HTMLElement) {
					label.textContent = 'BitPay';
					label.setAttribute(
						'aria-label',
						this.stringsService.bitPayAriaLabel
					);
				}

				bitPayOption.addEventListener('click', async () => {
					if (!this.bitPayInvoiceID) {
						this.bitPayInvoiceID = this.createBitPayInvoice();
					}

					bitPay.showInvoice(await this.bitPayInvoiceID);
				});

				bitPay.onModalWillLeave(async () => {
					const invoice = this.bitPayInvoiceID ?
						await this.getBitPayInvoice(
							await this.bitPayInvoiceID
						) :
						undefined;

					if (
						!(
							invoice?.status === 'complete' ||
							invoice?.status === 'confirmed' ||
							invoice?.status === 'paid'
						)
					) {
						this.bitPayInvoiceID = this.createBitPayInvoice();
						return;
					}

					this.submit(true);
				});

				optionsParent.appendChild(bitPayOption);

				/* eslint-disable-next-line no-unused-expressions */
				this.bitPayInvoiceID?.catch(bitPayError => {
					optionsParent.removeChild(bitPayOption);
					throw bitPayError;
				});
			}
		);
	}

	/** Submits payment. */
	public async submit (useBitPay: boolean = false) : Promise<void> {
		try {
			this.errorMessage.next(undefined);
			this.pending.next(true);

			const paymentMethod = useBitPay ?
				undefined :
				await new Promise<any>((resolve, reject) => {
					this.braintreeInstance.requestPaymentMethod(
						(err: any, data: any) => {
							if (data && !err) {
								resolve(data);
							}  else {
								reject(err);
							}
						}
					);
				}).catch(err => {
					throw err ||
						new Error(this.stringsService.checkoutBraintreeError);
				});

			const bitPayInvoiceID = !useBitPay ?
				undefined :
				await this.bitPayInvoiceID;

			const creditCard = paymentMethod?.type === 'CreditCard';

			let welcomeLetter: string | undefined = await request({
				data: {
					amount: Math.floor(
						this.amount *
							100 *
							(this.perUser ? this.users.value : 1) -
							this.extraUserDiscount *
								100 *
								(this.perUser ? this.users.value - 1 : 0)
					),
					bitPayInvoiceID,
					creditCard,
					nonce: paymentMethod?.nonce,
					subscription: this.subscriptionType !== undefined,
					url: location.toString(),
					...this.name,
					...(creditCard ? this.address : {}),
					...(this.category !== undefined ?
						{category: this.category} :
						{}),
					...(this.company !== undefined ?
						{company: this.company} :
						{}),
					...(this.email !== undefined ? {email: this.email} : {}),
					...(this.item !== undefined ? {item: this.item} : {}),
					...(this.namespace !== undefined ?
						{namespace: this.namespace} :
						{})
				},
				method: 'POST',
				url: this.envService.baseUrl + 'braintree'
			});

			const apiKey = welcomeLetter.startsWith('$APIKEY: ') ?
				welcomeLetter.split('$APIKEY: ')[1] :
				undefined;

			if (typeof apiKey === 'string') {
				welcomeLetter = undefined;
			}
			else {
				welcomeLetter = welcomeLetter.replace(/^Hello.*?,/, '').trim();
			}

			if (this.affiliate) {
				openWindow(this.affiliateService.checkout.href);
			}

			this.confirmed.emit({
				apiKey: apiKey || undefined,
				namespace: this.namespace
			});
			this.confirmationMessage.next(apiKey ? undefined : {welcomeLetter});

			if (!this.noSpinnerEnd) {
				this.complete.next(true);
				this.pending.next(false);
				this.success.next(true);
			}
		}
		catch (err) {
			this.complete.next(true);
			this.pending.next(false);
			this.success.next(false);

			if (!err) {
				return;
			}

			this.errorMessage.next(
				`${this.stringsService.checkoutErrorStart}: "${(
					err.message || err.toString()
				)
					.replace(/\s+/g, ' ')
					.trim()
					.replace(/\.$/, '')}".`
			);
		}
	}

	constructor (
		/** @ignore */
		private readonly changeDetectorRef: ChangeDetectorRef,

		/** @ignore */
		private readonly elementRef: ElementRef,

		/** @ignore */
		private readonly configService: ConfigService,

		/** @see AffiliateService */
		public readonly affiliateService: AffiliateService,

		/** @see EnvService */
		public readonly envService: EnvService,

		/** @see StringsService */
		public readonly stringsService: StringsService
	) {
		super();
	}
}
