import {ChangeDetectionStrategy, Component} from '@angular/core';
import {ModalDialogParams} from 'nativescript-angular/modal-dialog';
import {BaseProvider} from '../../js/cyph/base-provider';


/**
 * Native Angular component for image dialog.
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'cyph-dialog-image',
	styleUrls: ['../../js/cyph/components/dialog-image/dialog-image.component.scss'],
	templateUrl: '../../js/cyph/components/dialog-image/dialog-image.component.html'
})
export class DialogImageComponent extends BaseProvider {
	/** Image src. */
	public src: string;

	/** Image title. */
	public title?: string;

	constructor (params: ModalDialogParams) {
		super();

		this.src	= params.context;
	}
}
