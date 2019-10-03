import {Injectable} from '@angular/core';
import html2canvas from 'html2canvas';
import {BaseProvider} from '../base-provider';
import {saveFile} from '../util/save-file';
import {geISODateString, getTimeString} from '../util/time';
import {FileService} from './file.service';

/**
 * Angular service for taking screenshots.
 */
@Injectable()
export class ScreenshotService extends BaseProvider {
	/** Gets screenshot. */
	public async getScreenshot () : Promise<Uint8Array> {
		return this.fileService.canvasToBytes(await html2canvas(document.body));
	}

	/** Gets screenshot. */
	public async saveScreenshot () : Promise<void> {
		await saveFile(
			await this.getScreenshot(),
			`Screenshot ${geISODateString()} at ${getTimeString(
				undefined,
				true
			).replace(/:/g, '.')}.png`,
			'image/png'
		);
	}

	constructor (
		/** @ignore */
		private readonly fileService: FileService
	) {
		super();
	}
}
