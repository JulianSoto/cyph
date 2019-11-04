import {ComponentType} from '@angular/cdk/portal';
import {ChangeDetectorRef, Injectable, Optional} from '@angular/core';
import {MatBottomSheet} from '@angular/material/bottom-sheet';
import {MatDialog} from '@angular/material/dialog';
import {MatSnackBar} from '@angular/material/snack-bar';
import {SafeUrl} from '@angular/platform-browser';
import {map} from 'rxjs/operators';
import {Async} from '../async-type';
import {BaseProvider} from '../base-provider';
import {DialogAlertComponent} from '../components/dialog-alert';
import {DialogConfirmComponent} from '../components/dialog-confirm';
import {DialogMediaComponent} from '../components/dialog-media';
import {IResolvable} from '../iresolvable';
import {LockFunction} from '../lock-function-type';
import {MaybePromise} from '../maybe-promise-type';
import {IForm} from '../proto/types';
import {asyncToObservable} from '../util/flatten-observable';
import {lockFunction} from '../util/lock';
import {resolvable, sleep} from '../util/wait';
import {DialogService} from './dialog.service';
import {StringsService} from './strings.service';

/**
 * DialogService implementation built on Angular Material.
 */
@Injectable()
export class MaterialDialogService extends BaseProvider
	implements DialogService {
	/** @ignore */
	private readonly lock: LockFunction = lockFunction();

	/** @ignore */
	private async confirmHelper (
		o: {
			bottomSheet?: boolean;
			cancel?: string;
			cancelFAB?: string;
			content?: string;
			fabAvatar?: Async<SafeUrl | string>;
			form?: IForm;
			multipleChoiceOptions?: {
				text?: string;
				title: string;
				value: any;
			}[];
			ok?: string;
			okFAB?: string;
			markdown?: boolean;
			placeholder?: string;
			preFill?: string;
			timeout?: number;
			title?: string;
		},
		closeFunction?: IResolvable<() => void>,
		prompt: boolean = false
	) : Promise<{
		ok: boolean;
		promptResponse: string | IForm | any | undefined;
	}> {
		return this.lock(async () => {
			const matDialogRef = o.bottomSheet ?
				this.matBottomSheet.open(DialogConfirmComponent) :
				this.matDialog.open(DialogConfirmComponent);

			const afterClosed =
				'close' in matDialogRef ?
					() => matDialogRef.afterClosed() :
					() => matDialogRef.afterDismissed();

			const beforeClosed =
				'close' in matDialogRef ?
					() => matDialogRef.beforeClosed() :
					() => matDialogRef.backdropClick();

			const close =
				'close' in matDialogRef ?
					(closeOK?: boolean) => {
						matDialogRef.close(closeOK);
					} :
					(closeOK?: boolean) => {
						matDialogRef.dismiss(closeOK);
					};

			const instance =
				'componentInstance' in matDialogRef ?
					matDialogRef.componentInstance :
					matDialogRef.instance;

			instance.bottomSheet = o.bottomSheet || false;

			instance.content = o.content;

			instance.cancel =
				o.cancel !== undefined ? o.cancel : this.stringsService.cancel;

			instance.cancelFAB = o.cancelFAB;

			instance.fabAvatar =
				o.fabAvatar === undefined ?
					o.fabAvatar :
					asyncToObservable(o.fabAvatar);

			instance.form = o.form;

			instance.markdown = !!o.markdown;

			instance.multipleChoiceOptions = o.multipleChoiceOptions;

			instance.ok = o.ok !== undefined ? o.ok : this.stringsService.ok;

			instance.okFAB = o.okFAB;

			instance.prompt = prompt ? o.preFill || '' : undefined;

			instance.promptPlaceholder = o.placeholder;

			instance.title = o.title !== undefined ? o.title : '';

			if (closeFunction) {
				closeFunction.resolve(close);
			}

			const ok = afterClosed().toPromise<boolean | undefined>();

			const promptResponse = beforeClosed()
				.toPromise()
				.then(
					() =>
						instance.multipleChoiceSelection ||
						instance.form ||
						instance.prompt
				);

			let hasReturned = false;
			if (o.timeout !== undefined && !isNaN(o.timeout)) {
				(async () => {
					await sleep(o.timeout);
					if (!hasReturned) {
						close(false);
					}
				})();
			}

			try {
				return {
					ok: !!(await ok),
					promptResponse: await promptResponse
				};
			}
			finally {
				hasReturned = true;
			}
		});
	}

	/** @inheritDoc */
	public async alert (
		o: {content: string; markdown?: boolean; ok?: string; title?: string},
		closeFunction?: IResolvable<() => void>
	) : Promise<void> {
		return this.lock(async () => {
			const matDialogRef = this.matDialog.open(DialogAlertComponent);

			matDialogRef.componentInstance.content = o.content;

			matDialogRef.componentInstance.markdown = !!o.markdown;

			matDialogRef.componentInstance.ok =
				o.ok !== undefined ? o.ok : this.stringsService.ok;

			matDialogRef.componentInstance.title =
				o.title !== undefined ? o.title : '';

			if (closeFunction) {
				closeFunction.resolve(() => {
					matDialogRef.close();
				});
			}

			await matDialogRef.afterClosed().toPromise();
		});
	}

	/** @inheritDoc */
	public async baseDialog<T> (
		componentType: ComponentType<T>,
		setInputs?: (componentInstance: T) => MaybePromise<void>,
		closeFunction?: IResolvable<() => void>,
		bottomSheet: boolean = false
	) : Promise<void> {
		return this.lock(async () => {
			const matDialogRef = bottomSheet ?
				this.matBottomSheet.open(componentType) :
				this.matDialog.open(componentType);

			const afterClosed =
				'close' in matDialogRef ?
					() => matDialogRef.afterClosed() :
					() => matDialogRef.afterDismissed();

			const close =
				'close' in matDialogRef ?
					(closeOK?: boolean) => {
						matDialogRef.close(closeOK);
					} :
					(closeOK?: boolean) => {
						matDialogRef.dismiss(closeOK);
					};

			const instance: T & {changeDetectorRef?: ChangeDetectorRef} =
				'componentInstance' in matDialogRef ?
					matDialogRef.componentInstance :
					matDialogRef.instance;

			if (closeFunction) {
				closeFunction.resolve(() => {
					close();
				});
			}

			if (setInputs) {
				await setInputs(instance);
				await matDialogRef.afterOpened();

				if (instance.changeDetectorRef) {
					instance.changeDetectorRef.markForCheck();
				}
			}

			await afterClosed().toPromise();
		});
	}

	/** @inheritDoc */
	public async confirm (
		o: {
			bottomSheet?: boolean;
			cancel?: string;
			cancelFAB?: string;
			content: string;
			fabAvatar?: Async<SafeUrl | string>;
			markdown?: boolean;
			ok?: string;
			okFAB?: string;
			timeout?: number;
			title: string;
		},
		closeFunction?: IResolvable<() => void>
	) : Promise<boolean> {
		return (await this.confirmHelper(o, closeFunction)).ok;
	}

	/** @inheritDoc */
	public async cropImage (o: {
		aspectRatio?: number;
		src: SafeUrl | string;
		title?: string;
	}) : Promise<SafeUrl | undefined> {
		return this.lock(async () => {
			const matDialogRef = this.matDialog.open(DialogMediaComponent, {
				hasBackdrop: false,
				panelClass: 'visibility-hidden'
			});
			const cropResult = resolvable<SafeUrl | undefined>();

			matDialogRef.componentInstance.cropAspectRatio = o.aspectRatio;
			matDialogRef.componentInstance.cropResult = cropResult;
			matDialogRef.componentInstance.src = o.src;
			matDialogRef.componentInstance.title = o.title;

			return Promise.race([
				cropResult.promise,
				matDialogRef.afterClosed().toPromise()
			]);
		});
	}

	/** @inheritDoc */
	/* eslint-disable-next-line @typescript-eslint/require-await */
	public async dismissToast () : Promise<void> {
		this.matSnackbar.dismiss();
	}

	/** @inheritDoc */
	public async media (
		o: {mediaType?: string; src: SafeUrl | string; title?: string},
		closeFunction?: IResolvable<() => void>
	) : Promise<void> {
		return this.lock(async () => {
			const matDialogRef = this.matDialog.open(DialogMediaComponent, {
				hasBackdrop: false,
				panelClass: 'visibility-hidden'
			});

			matDialogRef.componentInstance.src = o.src;
			matDialogRef.componentInstance.title = o.title;

			if (o.mediaType) {
				matDialogRef.componentInstance.mediaType = o.mediaType;
			}

			if (closeFunction) {
				closeFunction.resolve(() => {
					matDialogRef.close();
				});
			}

			await matDialogRef.afterClosed().toPromise();
		});
	}

	/** @inheritDoc */
	/* eslint-disable-next-line @typescript-eslint/require-await */
	public async prompt (
		o: {
			bottomSheet?: boolean;
			cancel?: string;
			content: string;
			form: IForm;
			ok?: string;
			placeholder?: string;
			preFill?: string;
			timeout?: number;
			title: string;
		},
		closeFunction?: IResolvable<() => void>
	) : Promise<IForm | undefined>;
	/** @inheritDoc */
	/* eslint-disable-next-line @typescript-eslint/require-await */
	public async prompt (
		o: {
			bottomSheet?: boolean;
			multipleChoiceOptions: {
				text?: string;
				title: string;
				value: any;
			}[];
			timeout?: number;
			title: string;
		},
		closeFunction?: IResolvable<() => void>
	) : Promise<any | undefined>;
	/** @inheritDoc */
	/* eslint-disable-next-line @typescript-eslint/require-await */
	public async prompt (
		o: {
			bottomSheet?: boolean;
			cancel?: string;
			content: string;
			ok?: string;
			placeholder?: string;
			preFill?: string;
			timeout?: number;
			title: string;
		},
		closeFunction?: IResolvable<() => void>
	) : Promise<string | undefined>;
	/** @inheritDoc */
	public async prompt (
		o: {
			bottomSheet?: boolean;
			cancel?: string;
			content?: string;
			form?: IForm;
			multipleChoiceOptions?: {
				text?: string;
				title: string;
				value: any;
			}[];
			ok?: string;
			placeholder?: string;
			preFill?: string;
			timeout?: number;
			title: string;
		},
		closeFunction?: IResolvable<() => void>
	) : Promise<string | IForm | any | undefined> {
		const {ok, promptResponse} = await this.confirmHelper(
			o,
			closeFunction,
			true
		);
		return ok ? promptResponse : undefined;
	}

	/** @inheritDoc */
	public async toast (
		content: string,
		duration: number,
		action?: string
	) : Promise<boolean> {
		const snackbar = this.matSnackbar.open(
			content,
			action === undefined ? undefined : action.toUpperCase(),
			{duration}
		);

		const wasManuallyDismissed =
			(await snackbar
				.onAction()
				.pipe(map(() => true))
				.toPromise()) || false;

		if (wasManuallyDismissed) {
			return true;
		}

		await sleep(500);
		return false;
	}

	constructor (
		/** @ignore */
		@Optional() private readonly matBottomSheet: MatBottomSheet,

		/** @ignore */
		@Optional() private readonly matDialog: MatDialog,

		/** @ignore */
		@Optional() private readonly matSnackbar: MatSnackBar,

		/** @ignore */
		private readonly stringsService: StringsService
	) {
		super();
	}
}
