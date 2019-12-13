import {Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';
import {map} from 'rxjs/operators';
import {BaseProvider} from '../base-provider';
import {IP2PHandlers} from '../p2p/ip2p-handlers';
import {IAppointment} from '../proto';
import {filterUndefinedOperator} from '../util/filter';
import {prettyPrint} from '../util/serialization';
import {sleep} from '../util/wait';
import {ChatService} from './chat.service';
import {DialogService} from './dialog.service';
import {EnvService} from './env.service';
import {LocalStorageService} from './local-storage.service';
import {P2PWebRTCService} from './p2p-webrtc.service';
import {SessionCapabilitiesService} from './session-capabilities.service';
import {SessionInitService} from './session-init.service';
import {StringsService} from './strings.service';

/**
 * Manages P2P sessions.
 */
@Injectable()
export class P2PService extends BaseProvider {
	/** @see IP2PHandlers */
	public readonly handlers: IP2PHandlers = {
		acceptConfirm: async (callType, timeout, isAccepted = false) => {
			if (isAccepted) {
				return true;
			}

			return this.p2pWarningPersist(async () =>
				this.dialogService.confirm({
					cancel: this.stringsService.decline,
					content: `${this.stringsService.p2pRequest} ${<string> (
						((<any> this.stringsService)[callType + 'Call'] || '')
					)}. ${this.p2pWarning} ${
						this.stringsService.continuePrompt
					}`,
					markdown: true,
					ok: this.stringsService.continueDialogAction,
					timeout,
					title: this.stringsService.p2pTitle
				})
			);
		},
		audioDefaultEnabled: () => !this.chatService.walkieTalkieMode.value,
		canceled: async () => {
			await this.dialogService.toast(
				this.stringsService.p2pCanceled,
				3000
			);
		},
		connected: async isConnected => {
			if (!this.sessionInitService.ephemeral) {
				return;
			}

			await this.chatService.addMessage({
				shouldNotify: false,
				value: isConnected ?
					this.stringsService.p2pConnect :
					this.stringsService.p2pDisconnect
			});
		},
		failed: async () => {
			await this.dialogService.toast(this.stringsService.p2pFailed, 3000);
		},
		loaded: async () => {
			if (!this.sessionInitService.ephemeral) {
				this.chatService.initProgressFinish();
				await sleep(1000);
			}
		},
		localVideoConfirm: async video => {
			return this.dialogService.confirm({
				content: `${this.stringsService.allow} ${
					video ? this.stringsService.camera : this.stringsService.mic
				} ${this.stringsService.allow}?`,
				title: this.stringsService.p2pTitle
			});
		},
		requestConfirm: async (callType, isAccepted = false) => {
			if (isAccepted) {
				return true;
			}

			return this.p2pWarningPersist(async () =>
				this.dialogService.confirm({
					content: `${this.stringsService.p2pInit} ${<string> (
						((<any> this.stringsService)[callType + 'Call'] || '')
					)}. ${this.p2pWarning} ${
						this.stringsService.continuePrompt
					}`,
					markdown: true,
					ok: this.stringsService.continueDialogAction,
					title: this.stringsService.p2pTitle
				})
			);
		},
		requestConfirmation: async () => {
			await this.chatService.addMessage({
				shouldNotify: false,
				value: this.sessionInitService.ephemeral ?
					this.stringsService.p2pRequestConfirmation :
					this.stringsService.p2pAccountChatNotice
			});
		},
		requestRejection: async () => {
			await this.dialogService.toast(this.stringsService.p2pDeny, 3000);
		}
	};

	/** I/O switcher UI logic. */
	public readonly ioSwitcher = {
		close: () => {
			this.ioSwitcher.isOpen.next(false);
		},
		devices: new BehaviorSubject<{
			cameras: {label: string; switchTo: () => Promise<void>}[];
			mics: {label: string; switchTo: () => Promise<void>}[];
			speakers: {label: string; switchTo: () => Promise<void>}[];
		}>({
			cameras: [],
			mics: [],
			speakers: []
		}),
		isOpen: new BehaviorSubject<boolean>(false),
		open: async () => {
			this.ioSwitcher.devices.next(
				await this.p2pWebRTCService.getDevices()
			);
			this.ioSwitcher.isOpen.next(true);
		},
		switch: async (
			kind: 'cameras' | 'mics' | 'speakers',
			title: string
		) => {
			try {
				const devices = this.ioSwitcher.devices.value[kind];

				const device = await this.dialogService.prompt({
					bottomSheet: true,
					multipleChoiceOptions: devices.map((o, i) => ({
						title: (i === 0 ? '* ' : '') + o.label,
						value: o
					})),
					title
				});

				if (device) {
					await device.switchTo();
				}
			}
			finally {
				this.ioSwitcher.close();
			}
		}
	};

	/** @see P2PWebRTCService.isActive */
	public readonly isActive = this.p2pWebRTCService.isActive;

	/** Is active or has initial call type. */
	public readonly isActiveOrInitialCall = this.isActive.pipe(
		map(
			isActive =>
				isActive || this.sessionInitService.callType !== undefined
		)
	);

	/** Indicates whether P2P is possible (i.e. both clients support WebRTC). */
	public readonly isEnabled = new BehaviorSubject<boolean>(false);

	/** Indicates whether sidebar is open. */
	public readonly isSidebarOpen = new BehaviorSubject<boolean>(false);

	/** Countup timer for call duration. */
	public readonly timer = this.p2pWebRTCService.webRTC.pipe(
		filterUndefinedOperator(),
		map(o => o.timer)
	);

	/** @ignore */
	private get p2pWarning () : string {
		return this.envService.showAds ?
			this.stringsService.p2pWarningVPN :
			this.stringsService.p2pWarning;
	}

	/** Handles remembering user's answer to P2P warning, if applicable. */
	protected async p2pWarningPersist (
		f: () => Promise<boolean>
	) : Promise<boolean> {
		return f();
	}

	/** @see P2PWebRTCService.request */
	protected async request (callType: 'audio' | 'video') : Promise<void> {
		await this.p2pWebRTCService.request(callType);
	}

	/** Close active P2P session. */
	public async closeButton () : Promise<void> {
		if (
			!this.sessionInitService.ephemeral ||
			this.sessionInitService.callType === undefined
		) {
			await this.p2pWebRTCService.close();
			return;
		}

		await this.chatService.disconnectButton(async () =>
			this.p2pWebRTCService.close()
		);
	}

	/** Creates alert about P2P being unsupported. */
	public async disabledAlert () : Promise<void> {
		await this.dialogService.alert({
			content: this.stringsService.p2pDisabled,
			title: this.stringsService.p2pTitle
		});
	}

	/** Initializes service. */
	public async init (
		localVideo: () => JQuery,
		remoteVideo: () => JQuery,
		disabled: boolean = false
	) : Promise<void> {
		this.p2pWebRTCService.init(
			this.chatService,
			this.handlers,
			localVideo,
			remoteVideo
		);

		if (disabled) {
			return;
		}

		this.isEnabled.next(
			P2PWebRTCService.isSupported &&
				(await this.sessionCapabilitiesService.capabilities.p2p)
		);

		this.ioSwitcher.devices.next(await this.p2pWebRTCService.getDevices());
		this.subscriptions.push(
			this.ioSwitcher.devices.subscribe(({cameras}) => {
				this.p2pWebRTCService.videoEnabled.next(cameras.length > 0);
			})
		);
	}

	/** Opens notes. */
	public async openNotes (appointment: IAppointment) : Promise<void> {
		const newNotes = await this.dialogService.prompt({
			bottomSheet: true,
			content:
				(appointment.forms && appointment.forms.length > 0 ?
					`${prettyPrint(appointment.forms)}\n\n\n` :
					'') + this.stringsService.appointmentNotes,
			preFill: appointment.notes,
			title: this.stringsService.notes
		});

		if (newNotes !== undefined) {
			appointment.notes = newNotes;
		}
	}

	/** Toggle window of sidebar containing chat UI. */
	public toggleSidebar () : void {
		this.isSidebarOpen.next(!this.isSidebarOpen.value);
	}

	/**
	 * Attempt to toggle outgoing video stream,
	 * requesting new P2P session if necessary.
	 */
	public async videoCallButton () : Promise<void> {
		if (!this.isEnabled.value) {
			return this.disabledAlert();
		}

		if (!this.p2pWebRTCService.cameraActivated.value) {
			const camera = (await this.p2pWebRTCService.getDevices())
				.cameras[0];
			if (!camera) {
				this.p2pWebRTCService.videoEnabled.next(false);
				return;
			}
			this.p2pWebRTCService.cameraActivated.next(true);
			await camera.switchTo();
			return;
		}

		if (!this.isActive.value) {
			await this.request('video');
		}
		else if (this.p2pWebRTCService.videoEnabled.value) {
			await this.p2pWebRTCService.toggle('video');
		}
	}

	/**
	 * Attempt to toggle outgoing audio stream,
	 * requesting new P2P session if necessary.
	 */
	public async voiceCallButton () : Promise<void> {
		if (!this.isEnabled.value) {
			return this.disabledAlert();
		}

		if (!this.isActive.value) {
			await this.request('audio');
		}
		else {
			await this.p2pWebRTCService.toggle('audio');
		}
	}

	constructor (
		/** @ignore */
		protected readonly chatService: ChatService,

		/** @ignore */
		protected readonly dialogService: DialogService,

		/** @ignore */
		protected readonly envService: EnvService,

		/** @ignore */
		protected readonly localStorageService: LocalStorageService,

		/** @ignore */
		protected readonly p2pWebRTCService: P2PWebRTCService,

		/** @ignore */
		protected readonly sessionCapabilitiesService: SessionCapabilitiesService,

		/** @ignore */
		protected readonly sessionInitService: SessionInitService,

		/** @ignore */
		protected readonly stringsService: StringsService
	) {
		super();

		this.chatService.p2pService.resolve(this);
	}
}
