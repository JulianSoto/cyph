/* tslint:disable:max-file-line-count */

import {IAsyncList} from '../../iasync-list';
import {IAsyncValue} from '../../iasync-value';
import {LocalAsyncList} from '../../local-async-list';
import {LocalAsyncValue} from '../../local-async-value';
import {LockFunction} from '../../lock-function-type';
import {ICastleRatchetState, ICastleRatchetUpdate} from '../../proto';
import {lockFunction} from '../../util/lock';
import {resolvable} from '../../util/wait';
import {IPotassium} from '../potassium/ipotassium';
import {HandshakeSteps} from './enums';
import {ICastleIncomingMessages} from './icastle-incoming-messages';
import {IHandshakeState} from './ihandshake-state';
import {ILocalUser} from './ilocal-user';
import {IPairwiseSession} from './ipairwise-session';
import {IRemoteUser} from './iremote-user';
import {Transport} from './transport';

/**
 * Represents a pairwise (one-to-one) Castle session with no ratcheting.
 */
export class PairwiseSessionLite implements IPairwiseSession {
	/** @ignore */
	private readonly instanceID = this.potassium.randomBytes(16);

	/** @ignore */
	private readonly key = (async () => {
		let secret = await this.handshakeState.initialSecret.getValue();

		if (this.handshakeState.isAlice) {
			if (!secret) {
				secret = this.potassium.randomBytes(
					await this.potassium.ephemeralKeyExchange.secretBytes
				);

				await this.handshakeState.initialSecret.setValue(secret);
			}

			if (
				(await this.handshakeState.currentStep.getValue()) ===
				HandshakeSteps.Start
			) {
				const [
					signingKeyPair,
					publicEncryptionKey
				] = await Promise.all([
					this.localUser.getSigningKeyPair(),
					this.remoteUser.getPublicEncryptionKey()
				]);

				await this.handshakeState.initialSecretCyphertext.setValue(
					await this.potassium.box.seal(
						signingKeyPair ?
							await this.potassium.sign.sign(
								secret,
								signingKeyPair.privateKey
							) :
							secret,
						publicEncryptionKey
					)
				);

				await this.handshakeState.currentStep.setValue(
					HandshakeSteps.Complete
				);
			}
		}
		else if (!secret) {
			const [
				encryptionKeyPair,
				publicSigningKey,
				cyphertext
			] = await Promise.all([
				this.localUser.getEncryptionKeyPair(),
				this.remoteUser.getPublicSigningKey(),
				this.handshakeState.initialSecretCyphertext.getValue()
			]);

			const maybeSignedSecret = await this.potassium.box.open(
				cyphertext,
				encryptionKeyPair
			);

			secret = publicSigningKey ?
				await this.potassium.sign.open(
					maybeSignedSecret,
					publicSigningKey
				) :
				maybeSignedSecret;

			await this.handshakeState.initialSecret.setValue(secret);
		}

		return secret;
	})();

	/** @inheritDoc */
	public readonly initialMessagesProcessed = resolvable();

	/** @inheritDoc */
	public async receive (cyphertext: Uint8Array) : Promise<void> {
		await this.transport.process(this.remoteUser.username, {
			plaintext: await this.potassium.secretBox.open(
				cyphertext,
				await this.key
			)
		});
	}

	/** @inheritDoc */
	public async send (
		plaintext: string | ArrayBufferView,
		timestamp: number
	) : Promise<void> {
		const plaintextBytes = this.potassium.fromString(plaintext);
		const timestampBytes = new Float64Array([timestamp]);

		const outgoingMessage = this.potassium.concatMemory(
			false,
			timestampBytes,
			this.instanceID,
			plaintextBytes
		);

		this.potassium.clearMemory(plaintextBytes);
		this.potassium.clearMemory(timestampBytes);

		await this.transport.process(this.remoteUser.username, {
			cyphertext: await this.potassium.secretBox.seal(
				outgoingMessage,
				await this.key
			)
		});
	}

	constructor (
		/** @ignore */
		private readonly potassium: IPotassium,

		/** @ignore */
		private readonly transport: Transport,

		/** @ignore */
		private readonly localUser: ILocalUser,

		/** @ignore */
		private readonly remoteUser: IRemoteUser,

		/** @ignore */
		private readonly handshakeState: IHandshakeState,

		/** @ignore */
		protected readonly _INCOMING_MESSAGES: IAsyncValue<
			ICastleIncomingMessages
		> = new LocalAsyncValue<ICastleIncomingMessages>({max: 0, queue: {}}),
		/** @ignore */
		protected readonly _OUTGOING_MESSAGE_QUEUE: IAsyncList<
			Uint8Array
		> = new LocalAsyncList([]),

		/** @ignore */
		protected readonly _LOCK: LockFunction = lockFunction(),

		/** @ignore */
		protected readonly _RATCHET_STATE: IAsyncValue<
			ICastleRatchetState
		> = new LocalAsyncValue<ICastleRatchetState>({
			asymmetric: {
				privateKey: new Uint8Array(0),
				publicKey: new Uint8Array(0)
			},
			incomingMessageID: 0,
			outgoingMessageID: 1,
			symmetric: {
				current: {
					incoming: new Uint8Array(0),
					outgoing: new Uint8Array(0)
				},
				next: {
					incoming: new Uint8Array(0),
					outgoing: new Uint8Array(0)
				}
			}
		}),
		/** @ignore */
		protected readonly _RATCHET_UPDATE_QUEUE: IAsyncList<
			ICastleRatchetUpdate
		> = new LocalAsyncList([])
	) {
		this.key
			.then(async () => {
				await this.transport.connect();
				this.initialMessagesProcessed.resolve();
			})
			.catch(async () => this.transport.abort());
	}
}
