import {ComponentType} from '@angular/cdk/portal';
import {Injectable} from '@angular/core';
import {SafeUrl} from '@angular/platform-browser';
import {IResolvable} from '../iresolvable';


/**
 * Provides modal/dialog functionality.
 */
@Injectable()
export class DialogService {
	/** Displays alert. */
	public async alert (
		_O: {content: string; markdown?: boolean; ok?: string; title?: string},
		_CLOSE_FUNCTION?: IResolvable<() => void>
	) : Promise<void> {
		throw new Error('Must provide an implementation of DialogService.alert.');
	}

	/** Generic modal implementation that takes a template / content. */
	public async baseDialog<T> (
		_COMPONENT_TYPE: ComponentType<T>,
		_SET_INPUTS?: (componentInstance: T) => void,
		_CLOSE_FUNCTION?: IResolvable<() => void>
	) : Promise<void> {
		throw new Error('Must provide an implementation of DialogService.baseDialog.');
	}

	/** Displays interactive confirmation prompt. */
	public async confirm (
		_O: {
			cancel?: string;
			content: string;
			markdown?: boolean;
			ok?: string;
			timeout?: number;
			title: string;
		},
		_CLOSE_FUNCTION?: IResolvable<() => void>
	) : Promise<boolean> {
		throw new Error('Must provide an implementation of DialogService.confirm.');
	}

	/** Allows a user to crop an image and returns the result. */
	public async cropImage (_O: {
		aspectRatio?: number;
		src: SafeUrl|string;
		title?: string;
	}) : Promise<SafeUrl|undefined> {
		throw new Error('Must provide an implementation of DialogService.cropImage.');
	}

	/** If applicable, dismisses active toast. */
	public async dismissToast () : Promise<void> {
		throw new Error('Must provide an implementation of DialogService.dismissToast.');
	}

	/** Displays image. */
	public async image (
		_O: {src: SafeUrl|string; title?: string},
		_CLOSE_FUNCTION?: IResolvable<() => void>
	) : Promise<void> {
		throw new Error('Must provide an implementation of DialogService.image.');
	}

	/** Prompts for input. */
	public async prompt (
		_O: {
			cancel?: string;
			content: string;
			ok?: string;
			placeholder?: string;
			timeout?: number;
			title: string;
		},
		_CLOSE_FUNCTION?: IResolvable<() => void>
	) : Promise<string|undefined> {
		throw new Error('Must provide an implementation of DialogService.prompt.');
	}

	/**
	 * Displays toast notification.
	 * @returns Whether it was manually dismissed.
	 */
	public async toast (_CONTENT: string, _DURATION: number, _ACTION?: string) : Promise<boolean> {
		throw new Error('Must provide an implementation of DialogService.toast.');
	}

		/** Displays video. */
		public async video (
			_O: {src: SafeUrl|string; title?: string},
			_CLOSE_FUNCTION?: IResolvable<() => void>
		) : Promise<void> {
			throw new Error('Must provide an implementation of DialogService.video.');
		}

	constructor () {}
}
