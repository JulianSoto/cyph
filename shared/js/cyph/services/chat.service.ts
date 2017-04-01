import {Injectable} from '@angular/core';
import {IChatData, IChatMessage, States} from '../chat';
import {events, rpcEvents, users} from '../session/enums';
import {Message} from '../session/message';
import {Timer} from '../timer';
import {util} from '../util';
import {AnalyticsService} from './analytics.service';
import {DialogService} from './dialog.service';
import {NotificationService} from './notification.service';
import {ScrollService} from './scroll.service';
import {SessionService} from './session.service';
import {StringsService} from './strings.service';


/**
 * Manages a chat.
 */
@Injectable()
export class ChatService {
	/** @ignore */
	private static readonly approximateKeyExchangeTime: number			= 15000;

	/** @ignore */
	private static readonly queuedMessageSelfDestructTimeout: number	= 15000;


	/** @ignore */
	private messageChangeLock: {}	= {};

	/** @see IChatData */
	public chat: IChatData	= {
		currentMessage: '',
		isConnected: false,
		isDisconnected: false,
		isFriendTyping: false,
		isMessageChanged: false,
		keyExchangeProgress: 0,
		messages: [],
		queuedMessageSelfDestruct: false,
		state: States.none
	};

	/** This kills the chat. */
	private close () : void {
		if (this.chat.state === States.aborted) {
			return;
		}

		this.setFriendTyping(false);
		this.scrollService.scrollDown();

		if (!this.chat.isConnected) {
			this.abortSetup();
		}
		else if (!this.chat.isDisconnected) {
			this.chat.isDisconnected	= true;
			this.addMessage(
				this.stringsService.disconnectNotification,
				users.app
			);
			this.sessionService.close();
		}
	}

	/** Aborts the process of chat initialisation and authentication. */
	public abortSetup () : void {
		this.chat.state	= States.aborted;
		this.sessionService.trigger(events.abort);
		this.sessionService.close();
	}

	/**
	 * Adds a message to the chat.
	 * @param text
	 * @param author
	 * @param timestamp If not set, will use Util.timestamp().
	 * @param shouldNotify If true, a notification will be sent.
	 * @param selfDestructTimeout
	 */
	public async addMessage (
		text: string,
		author: string,
		timestamp: number = util.timestamp(),
		shouldNotify: boolean = author !== users.me,
		selfDestructTimeout?: number
	) : Promise<void> {
		if (this.chat.state === States.aborted || this.chat.isDisconnected || !text) {
			return;
		}

		while (author !== users.app && !this.chat.isConnected) {
			await util.sleep(500);
		}

		if (this.notificationService && shouldNotify) {
			if (author === users.app) {
				this.notificationService.notify(text);
			}
			else {
				this.notificationService.notify(this.stringsService.newMessageNotification);
			}
		}

		const message: IChatMessage	= {
			author,
			text,
			timestamp,
			timeString: util.getTimeString(timestamp),
			unread:
				author !== users.app &&
				author !== users.me
		};

		this.chat.messages.push(message);
		this.chat.messages.sort((a, b) => a.timestamp - b.timestamp);

		if (author === users.me) {
			this.scrollService.scrollDown();
		}

		if (
			selfDestructTimeout !== undefined &&
			!isNaN(selfDestructTimeout) &&
			selfDestructTimeout > 0
		) {
			message.selfDestructTimer	= new Timer(selfDestructTimeout);
			await message.selfDestructTimer.start();
			await util.sleep(10000);
			message.text	= undefined;
		}
	}

	/** Begins chat. */
	public async begin () : Promise<void> {
		if (this.chat.state === States.aborted) {
			return;
		}

		/* Workaround for Safari bug that breaks initiating a new chat */
		this.sessionService.send(...[]);

		if (this.notificationService) {
			this.notificationService.notify(this.stringsService.connectedNotification);
		}

		this.chat.state	= States.chatBeginMessage;

		await util.sleep(3000);

		if (<States> this.chat.state === States.aborted) {
			return;
		}

		this.sessionService.trigger(events.beginChatComplete);

		this.chat.state	= States.chat;

		this.addMessage(
			this.stringsService.introductoryMessage,
			users.app,
			util.timestamp() - 30000,
			false
		);

		this.chat.isConnected	= true;

		if (this.chat.queuedMessage) {
			this.send(
				this.chat.queuedMessage,
				this.chat.queuedMessageSelfDestruct ?
					ChatService.queuedMessageSelfDestructTimeout :
					undefined
			);
		}
	}

	/** After confirmation dialog, this kills the chat. */
	public async disconnectButton () : Promise<void> {
		if (await this.dialogService.confirm({
			cancel: this.stringsService.cancel,
			content: this.stringsService.disconnectConfirm,
			ok: this.stringsService.continueDialogAction,
			title: this.stringsService.disconnectTitle
		})) {
			this.close();
		}
	}

	/** Displays help information. */
	public helpButton () : void {
		this.dialogService.baseDialog({
			template: `<md-dialog class='full'><cyph-help></cyph-help></md-dialog>`
		});

		this.analyticsService.sendEvent({
			eventAction: 'show',
			eventCategory: 'help',
			eventValue: 1,
			hitType: 'event'
		});
	}

	/**
	 * Checks for change to current message, and sends appropriate
	 * typing indicator signals through session.
	 */
	public async messageChange () : Promise<void> {
		return util.lock(this.messageChangeLock, async () => {
			for (let i = 0 ; i < 2 ; ++i) {
				const isMessageChanged: boolean	=
					this.chat.currentMessage !== '' &&
					this.chat.currentMessage !== this.chat.previousMessage
				;

				this.chat.previousMessage	= this.chat.currentMessage;

				if (this.chat.isMessageChanged !== isMessageChanged) {
					this.chat.isMessageChanged	= isMessageChanged;
					this.sessionService.send(
						new Message(
							rpcEvents.typing,
							{isTyping: this.chat.isMessageChanged}
						)
					);

					await util.sleep(1000);
				}
			}
		});
	}

	/**
	 * Sends a message.
	 * @param message
	 * @param selfDestructTimeout
	 */
	public send (message?: string, selfDestructTimeout?: number) : void {
		if (!message) {
			message						= this.chat.currentMessage;
			this.chat.currentMessage	= '';
			this.messageChange();
		}

		if (message) {
			this.sessionService.send(new Message(rpcEvents.text, {
				selfDestructTimeout,
				text: message
			}));
		}
	}

	/**
	 * Sets this.isFriendTyping to isFriendTyping.
	 * @param isFriendTyping
	 */
	public setFriendTyping (isFriendTyping: boolean) : void {
		this.chat.isFriendTyping	= isFriendTyping;
	}

	/**
	 * Sets queued message to be sent after handshake.
	 * @param messageText
	 * @param selfDestruct
	 */
	public setQueuedMessage (messageText?: string, selfDestruct?: boolean) : void {
		if (typeof messageText === 'string') {
			this.chat.queuedMessage	= messageText;
			this.dialogService.toast({
				content: this.stringsService.queuedMessageSaved,
				delay: 2500
			});
		}

		if (typeof selfDestruct === 'boolean') {
			this.chat.queuedMessageSelfDestruct	= selfDestruct;
		}
	}

	constructor (
		/** @ignore */
		private readonly analyticsService: AnalyticsService,

		/** @ignore */
		protected readonly dialogService: DialogService,

		/** @ignore */
		protected readonly notificationService: NotificationService,

		/** @ignore */
		protected readonly scrollService: ScrollService,

		/** @ignore */
		protected readonly sessionService: SessionService,

		/** @ignore */
		protected readonly stringsService: StringsService
	) {
		this.sessionService.one(events.beginChat).then(() => {
			this.begin();
		});

		this.sessionService.one(events.closeChat).then(() => {
			this.close();
		});

		this.sessionService.connected.then(async () => {
			this.chat.state	= States.keyExchange;

			const interval		= 250;
			const increment		= interval / ChatService.approximateKeyExchangeTime;

			while (this.chat.keyExchangeProgress <= 100) {
				await util.sleep(interval);
				this.chat.keyExchangeProgress += increment * 100;
			}

			this.chat.keyExchangeProgress	= 100;
		});

		this.sessionService.one(events.connectFailure).then(() => {
			this.abortSetup();
		});

		this.sessionService.on(rpcEvents.text, (o: {
			author: string;
			selfDestructTimeout?: number;
			text?: string;
			timestamp: number;
		}) => {
			if (typeof o.text !== 'string') {
				return;
			}

			this.addMessage(
				o.text,
				o.author,
				o.timestamp,
				undefined,
				o.selfDestructTimeout
			);
		});

		this.sessionService.on(rpcEvents.typing, (o: {isTyping: boolean}) => {
			this.setFriendTyping(o.isTyping);
		});
	}
}
