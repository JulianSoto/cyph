import {ComponentType} from '@angular/cdk/portal';
import {Injectable} from '@angular/core';
import {SafeUrl} from '@angular/platform-browser';
import {ModalDialogService} from 'nativescript-angular/modal-dialog';
import {SnackBar} from 'nativescript-snackbar';
import {alert, confirm, prompt} from 'tns-core-modules/ui/dialogs/dialogs';
import {DialogImageComponent} from './components/dialog-image';
import {BaseProvider} from './js/cyph/base-provider';
import {IResolvable} from './js/cyph/iresolvable';
import {LockFunction} from './js/cyph/lock-function-type';
import {DialogService} from './js/cyph/services/dialog.service';
import {StringsService} from './js/cyph/services/strings.service';
import {lockFunction} from './js/cyph/util/lock';
import {sleep} from './js/cyph/util/wait';


/**
 * DialogService implementation for NativeScript.
 */
@Injectable()
export class NativeDialogService extends BaseProvider implements DialogService {
	/** @ignore */
	private readonly lock: LockFunction	= lockFunction();

	/** @ignore */
	private readonly snackbar: SnackBar	= new SnackBar();

	/**
	 * @inheritDoc
	 * @param o.markdown Currently unsupported (ignored).
	 * @param closeFunction Currently unsupported (not implemented exception).
	 */
	public async alert (
		o: {content: string; markdown?: boolean; ok?: string; title?: string},
		closeFunction?: IResolvable<() => void>
	) : Promise<void> {
		if (closeFunction) {
			throw new Error('NativeDialogService.baseDialog closeFunction is unsupported.');
		}

		return this.lock(async () => {
			return alert({
				message: o.content,
				okButtonText: o.ok !== undefined ? o.ok : this.stringsService.ok,
				title: o.title
			});
		});
	}

	/**
	 * @inheritDoc
	 * @param setInputs Currently unsupported (not implemented exception).
	 * @param closeFunction Currently unsupported (not implemented exception).
	 */
	public async baseDialog<T> (
		componentType: ComponentType<T>,
		setInputs?: (componentInstance: T) => void,
		closeFunction?: IResolvable<() => void>
	) : Promise<void> {
		if (setInputs) {
			throw new Error('NativeDialogService.baseDialog setInputs is unsupported.');
		}
		if (closeFunction) {
			throw new Error('NativeDialogService.baseDialog closeFunction is unsupported.');
		}

		return this.lock(async () => {
			await this.modalDialogService.showModal(componentType, {});
		});
	}

	/**
	 * @inheritDoc
	 * @param o.markdown Currently unsupported (ignored).
	 * @param o.timeout Currently unsupported (ignored).
	 * @param closeFunction Currently unsupported (not implemented exception).
	 */
	public async confirm (
		o: {
			cancel?: string;
			content: string;
			markdown?: boolean;
			ok?: string;
			timeout?: number;
			title?: string;
		},
		closeFunction?: IResolvable<() => void>
	) : Promise<boolean> {
		if (closeFunction) {
			throw new Error('NativeDialogService.confirm closeFunction is unsupported.');
		}

		return this.lock(async () => {
			return !!(await confirm({
				cancelButtonText: o.ok !== undefined ? o.cancel : this.stringsService.cancel,
				message: o.content,
				okButtonText: o.ok !== undefined ? o.ok : this.stringsService.ok,
				title: o.title
			}));
		});
	}

	/**
	 * @inheritDoc
	 * Currently unsupported (just returns the original image).
	 */
	public async cropImage (o: {
		aspectRatio?: number;
		src: SafeUrl|string;
		title?: string;
	}) : Promise<SafeUrl> {
		return <SafeUrl> o.src;
	}

	/** @inheritDoc */
	public async dismissToast () : Promise<void> {
		await this.snackbar.dismiss();
	}

	/**
	 * @inheritDoc
	 * @param closeFunction Currently unsupported (not implemented exception).
	 */
	public async image (
		o: {src: SafeUrl|string; title?: string},
		closeFunction?: IResolvable<() => void>
	) : Promise<void> {
		if (closeFunction) {
			throw new Error('NativeDialogService.baseDialog closeFunction is unsupported.');
		}

		if (typeof o.src !== 'string') {
			throw new Error('Unsupported src type.');
		}

		return this.lock(async () => {
			await this.modalDialogService.showModal(DialogImageComponent, {context: o});
		});
	}

	/**
	 * @inheritDoc
	 * @param o.markdown Currently unsupported (ignored).
	 * @param o.timeout Currently unsupported (ignored).
	 * @param closeFunction Currently unsupported (not implemented exception).
	 */
	public async prompt (
		o: {
			cancel?: string;
			content: string;
			markdown?: boolean;
			ok?: string;
			placeholder?: string;
			timeout?: number;
			title?: string;
		},
		closeFunction?: IResolvable<() => void>
	) : Promise<string|undefined> {
		if (closeFunction) {
			throw new Error('NativeDialogService.baseDialog closeFunction is unsupported.');
		}

		return this.lock(async () => {
			const {result, text}	= await prompt({
				cancelButtonText: o.ok !== undefined ? o.cancel : this.stringsService.cancel,
				defaultText:
					o.placeholder !== undefined ? o.placeholder : this.stringsService.response
				,
				message: o.content,
				okButtonText: o.ok !== undefined ? o.ok : this.stringsService.ok,
				title: o.title
			});

			return result ? text : undefined;
		});
	}

	/** @inheritDoc */
	public async toast (content: string, duration: number, action?: string) : Promise<boolean> {
		if (action !== undefined) {
			const args: any	= await this.snackbar.action({
				actionText: action.toUpperCase(),
				hideDelay: duration,
				snackText: content
			});

			return args.command === 'Action';
		}

		let isPending	= true;
		this.snackbar.simple(content).then(() => {
			isPending	= false;
		});

		await sleep(duration);
		if (isPending) {
			await this.snackbar.dismiss();
		}
		await sleep(500);
		return false;
	}

	constructor (
		/** @ignore */
		private readonly modalDialogService: ModalDialogService,

		/** @ignore */
		private readonly stringsService: StringsService
	) {
		super();
	}
}
