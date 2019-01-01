import {Injectable} from '@angular/core';
import {Router} from '@angular/router';
import {BaseProvider} from '../base-provider';
import {env} from '../env';
import {IResolvable} from '../iresolvable';
import {ISessionService} from '../service-interfaces/isession.service';
import {resolvable} from '../util/wait';
import {SessionInitService} from './session-init.service';


/**
 * SessionInitService implementation that gets ID from URL.
 */
@Injectable()
export class UrlSessionInitService extends BaseProvider implements SessionInitService {
	/** @inheritDoc */
	public readonly callType?: 'audio'|'video';

	/** @inheritDoc */
	public readonly ephemeral: boolean	= true;

	/** @inheritDoc */
	public readonly id: string;

	/** @inheritDoc */
	public readonly sessionService: IResolvable<ISessionService>	= resolvable();

	/** @inheritDoc */
	public spawn () : UrlSessionInitService {
		return new UrlSessionInitService(this.router);
	}

	constructor (
		/** @ignore */
		private readonly router: Router
	) {
		super();

		const urlSegmentPaths	=
			this.router.routerState.snapshot.root.firstChild ?
				this.router.routerState.snapshot.root.firstChild.url.
					slice(burnerRoot === '' ? 0 : 1).
					map(o => o.path)
				:
				[]
		;

		this.callType	=
			urlSegmentPaths[0] === 'audio' ?
				'audio' :
				urlSegmentPaths[0] === 'video' ?
					'video' :
					undefined
		;

		this.id	= urlSegmentPaths.slice(this.callType ? 1 : 0).join('/');

		if (!this.callType) {
			this.callType	= env.callType;
		}
	}
}
