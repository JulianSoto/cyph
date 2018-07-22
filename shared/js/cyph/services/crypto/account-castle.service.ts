import {Injectable} from '@angular/core';
import {take} from 'rxjs/operators';
import {
	HandshakeSteps,
	PairwiseSession,
	RegisteredLocalUser,
	RegisteredRemoteUser,
	Transport
} from '../../crypto/castle';
import {
	BinaryProto,
	CastleIncomingMessagesProto,
	CastleRatchetState,
	MaybeBinaryProto,
	Uint32Proto
} from '../../proto';
import {filterUndefinedOperator} from '../../util/filter';
import {getOrSetDefaultAsync} from '../../util/get-or-set-default';
import {debugLog} from '../../util/log';
import {AccountContactsService} from '../account-contacts.service';
import {AccountSessionService} from '../account-session.service';
import {AccountDatabaseService} from './account-database.service';
import {CastleService} from './castle.service';
import {PotassiumService} from './potassium.service';


/**
 * Castle instance between two registered users.
 */
@Injectable()
export class AccountCastleService extends CastleService {
	/** @ignore */
	private readonly pairwiseSessions: Map<string, PairwiseSession>	=
		new Map<string, PairwiseSession>()
	;

	/** @inheritDoc */
	public async init (
		potassiumService: PotassiumService,
		accountSessionService: AccountSessionService
	) : Promise<void> {
		const transport	= new Transport(accountSessionService);

		accountSessionService.remoteUser.pipe(
			filterUndefinedOperator(),
			take(1)
		).subscribe(user => {
			debugLog(() => ({startingAccountCastleSession: {user}}));

			this.pairwiseSessionLock(async () => {
				const castleSessionID	= await this.accountContactsService.
					getCastleSessionID(user.username).
					catch(() => undefined)
				;

				if (!castleSessionID) {
					debugLog(() => ({startingAccountCastleSessionFailed: {user}}));
					return;
				}

				this.pairwiseSession.next(await getOrSetDefaultAsync(
					this.pairwiseSessions,
					accountSessionService.ephemeralSubSession ? undefined : user.username,
					async () => {
						debugLog(() => ({startingAccountCastleSessionNow: {
							castleSessionID,
							user
						}}));

						const sessionURL		= `castleSessions/${castleSessionID}/session`;

						const localUser			= new RegisteredLocalUser(
							this.accountDatabaseService
						);

						const remoteUser		= new RegisteredRemoteUser(
							this.accountDatabaseService,
							user.realUsername
						);

						if (accountSessionService.ephemeralSubSession) {
							return new PairwiseSession(
								potassiumService,
								transport,
								localUser,
								remoteUser,
								await accountSessionService.handshakeState()
							);
						}

						const handshakeState	= await accountSessionService.handshakeState(
							this.accountDatabaseService.getAsyncValue<HandshakeSteps>(
								`${sessionURL}/handshake/currentStep`,
								Uint32Proto,
								undefined,
								undefined,
								undefined,
								undefined,
								true
							),
							this.accountDatabaseService.getAsyncValue(
								`${sessionURL}/handshake/initialSecret`,
								MaybeBinaryProto,
								undefined,
								undefined,
								undefined,
								undefined,
								true
							)
						);

						return new PairwiseSession(
							potassiumService,
							transport,
							localUser,
							remoteUser,
							handshakeState,
							this.accountDatabaseService.getAsyncList(
								`${sessionURL}/decryptedMessageQueue`,
								BinaryProto,
								undefined,
								undefined,
								undefined,
								false,
								true
							),
							this.accountDatabaseService.getAsyncList(
								`${sessionURL}/encryptedMessageQueue`,
								BinaryProto,
								undefined,
								undefined,
								undefined,
								false,
								true
							),
							this.accountDatabaseService.getAsyncValue(
								`${sessionURL}/incomingMessageID`,
								Uint32Proto,
								undefined,
								undefined,
								undefined,
								undefined,
								true
							),
							this.accountDatabaseService.getAsyncValue(
								`${sessionURL}/incomingMessages`,
								CastleIncomingMessagesProto,
								undefined,
								undefined,
								undefined,
								undefined,
								true
							),
							this.accountDatabaseService.getAsyncValue(
								`${sessionURL}/incomingMessagesMax`,
								Uint32Proto,
								undefined,
								undefined,
								undefined,
								undefined,
								true
							),
							this.accountDatabaseService.getAsyncValue(
								`${sessionURL}/outgoingMessageID`,
								Uint32Proto,
								undefined,
								undefined,
								undefined,
								undefined,
								true
							),
							this.accountDatabaseService.getAsyncList(
								`${sessionURL}/outgoingMessageQueue`,
								BinaryProto,
								undefined,
								undefined,
								undefined,
								false,
								true
							),
							this.accountDatabaseService.lockFunction(`${sessionURL}/lock`),
							this.accountDatabaseService.getAsyncValue(
								`${sessionURL}/ratchetState`,
								CastleRatchetState,
								undefined,
								undefined,
								undefined,
								undefined,
								true
							)
						);
					}
				));
			});
		});
	}

	/** @inheritDoc */
	public spawn () : AccountCastleService {
		return new AccountCastleService(
			this.accountContactsService,
			this.accountDatabaseService
		);
	}

	constructor (
		/** @ignore */
		private readonly accountContactsService: AccountContactsService,

		/** @ignore */
		private readonly accountDatabaseService: AccountDatabaseService
	) {
		super();
	}
}
