import {NgModule} from '@angular/core';
import {ReactiveFormsModule} from '@angular/forms';
import {MatAutocompleteModule} from '@angular/material/autocomplete';
import {MatBadgeModule} from '@angular/material/badge';
import {MatBottomSheetModule} from '@angular/material/bottom-sheet';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatCardModule} from '@angular/material/card';
import {MatChipsModule} from '@angular/material/chips';
import {MatNativeDateModule} from '@angular/material/core';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialogModule} from '@angular/material/dialog';
import {MatExpansionModule} from '@angular/material/expansion';
import {MatGridListModule} from '@angular/material/grid-list';
import {MatIconModule, MatIconRegistry} from '@angular/material/icon';
import {MatListModule} from '@angular/material/list';
import {MatMenuModule} from '@angular/material/menu';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatRadioModule} from '@angular/material/radio';
import {MatSidenavModule} from '@angular/material/sidenav';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatSliderModule} from '@angular/material/slider';
import {MatSnackBarModule} from '@angular/material/snack-bar';
import {MatSortModule} from '@angular/material/sort';
import {MatTableModule} from '@angular/material/table';
import {MatTabsModule} from '@angular/material/tabs';
import {MatToolbarModule} from '@angular/material/toolbar';
import {MatTooltipModule} from '@angular/material/tooltip';
import {DomSanitizer} from '@angular/platform-browser';
import {Router, RouterModule} from '@angular/router';
import {PickerModule} from '@ctrl/ngx-emoji-mart';
import {EmojiModule} from '@ctrl/ngx-emoji-mart/ngx-emoji';
import {ScheduleAllModule} from '@syncfusion/ej2-angular-schedule';
import {SmdFabSpeedDialModule} from 'angular-speed-dial';
import {AngularDraggableModule} from 'angular2-draggable';
import {TextMaskModule} from 'angular2-text-mask';
import {FullCalendarModule} from 'ng-fullcalendar';
import {ImageCropperModule} from 'ngx-image-cropper';
import {DialogAlertComponent} from '../components/dialog-alert';
import {DialogConfirmComponent} from '../components/dialog-confirm';
import {DialogMediaComponent} from '../components/dialog-media';
import {DynamicFormComponent} from '../components/dynamic-form';
import {SimpleEmojiPickerComponent} from '../components/simple-emoji-picker';
import {VideoComponent} from '../components/video';
import {DropZoneDirective} from '../directives/drop-zone.directive';
import {InitDirective} from '../directives/init.directive';
import {env} from '../env';
import {DialogService} from '../services/dialog.service';
import {LocalStorageService} from '../services/local-storage.service';
import {MaterialDialogService} from '../services/material-dialog.service';
import {WebLocalStorageService} from '../services/web-local-storage.service';
import {CyphSharedModule} from './cyph-shared.module';
import {CyphWrappersModule} from './cyph-wrappers.module';

/**
 * Common module with shared imports for web projects.
 */
@NgModule({
	declarations: [
		DialogAlertComponent,
		DialogConfirmComponent,
		DialogMediaComponent,
		DropZoneDirective,
		DynamicFormComponent,
		InitDirective,
		SimpleEmojiPickerComponent,
		VideoComponent
	],
	exports: [
		AngularDraggableModule,
		CyphSharedModule,
		CyphWrappersModule,
		DialogAlertComponent,
		DialogConfirmComponent,
		DialogMediaComponent,
		DropZoneDirective,
		DynamicFormComponent,
		EmojiModule,
		FullCalendarModule,
		ImageCropperModule,
		InitDirective,
		MatAutocompleteModule,
		MatBadgeModule,
		MatBottomSheetModule,
		MatButtonToggleModule,
		MatCardModule,
		MatChipsModule,
		MatDatepickerModule,
		MatDialogModule,
		MatExpansionModule,
		MatGridListModule,
		MatIconModule,
		MatListModule,
		MatMenuModule,
		MatNativeDateModule,
		MatPaginatorModule,
		MatProgressBarModule,
		MatRadioModule,
		MatSidenavModule,
		MatSliderModule,
		MatSlideToggleModule,
		MatSnackBarModule,
		MatSortModule,
		MatTableModule,
		MatTabsModule,
		MatToolbarModule,
		MatTooltipModule,
		PickerModule,
		ReactiveFormsModule,
		RouterModule,
		ScheduleAllModule,
		SimpleEmojiPickerComponent,
		SmdFabSpeedDialModule,
		TextMaskModule,
		VideoComponent
	],
	imports: [
		AngularDraggableModule,
		CyphSharedModule,
		CyphWrappersModule,
		EmojiModule,
		FullCalendarModule,
		ImageCropperModule,
		MatAutocompleteModule,
		MatBadgeModule,
		MatBottomSheetModule,
		MatCardModule,
		MatChipsModule,
		MatDatepickerModule,
		MatDialogModule,
		MatExpansionModule,
		MatGridListModule,
		MatIconModule,
		MatListModule,
		MatMenuModule,
		MatNativeDateModule,
		MatPaginatorModule,
		MatProgressBarModule,
		MatRadioModule,
		MatSidenavModule,
		MatSliderModule,
		MatSlideToggleModule,
		MatSnackBarModule,
		MatSortModule,
		MatTableModule,
		MatTabsModule,
		MatToolbarModule,
		MatTooltipModule,
		PickerModule,
		ReactiveFormsModule,
		RouterModule,
		ScheduleAllModule,
		SmdFabSpeedDialModule,
		TextMaskModule
	],
	providers: [
		{
			provide: DialogService,
			useClass: MaterialDialogService
		},
		{
			provide: LocalStorageService,
			useClass: WebLocalStorageService
		}
	]
})
export class CyphWebModule {
	constructor (
		sanitizer: DomSanitizer,
		matIconRegistry: MatIconRegistry,
		localStorageService: LocalStorageService,
		router: Router
	) {
		/* Custom Icons */

		matIconRegistry.addSvgIcon(
			'bitcoin',
			sanitizer.bypassSecurityTrustResourceUrl(
				'/assets/img/icons/cryptocurrencies/BTC.svg'
			)
		);

		matIconRegistry.addSvgIcon(
			'doctor',
			sanitizer.bypassSecurityTrustResourceUrl(
				'/assets/img/iconfinder/doctor.svg'
			)
		);

		matIconRegistry.addSvgIcon(
			'gdpr',
			sanitizer.bypassSecurityTrustResourceUrl(
				'/assets/img/iconfinder/gdpr.svg'
			)
		);

		matIconRegistry.addSvgIcon(
			'key-add-color',
			sanitizer.bypassSecurityTrustResourceUrl(
				'/assets/img/icons/key-add-color.svg'
			)
		);

		matIconRegistry.addSvgIcon(
			'key-add-light',
			sanitizer.bypassSecurityTrustResourceUrl(
				'/assets/img/icons/key-add-light.svg'
			)
		);

		matIconRegistry.addSvgIcon(
			'key-upload',
			sanitizer.bypassSecurityTrustResourceUrl(
				'/assets/img/icons/key-upload.svg'
			)
		);

		matIconRegistry.addSvgIcon(
			'key-upload-color',
			sanitizer.bypassSecurityTrustResourceUrl(
				'/assets/img/icons/key-upload-color.svg'
			)
		);

		matIconRegistry.addSvgIcon(
			'medical-forms',
			sanitizer.bypassSecurityTrustResourceUrl(
				'/assets/img/iconfinder/medical-forms.svg'
			)
		);

		matIconRegistry.addSvgIcon(
			'walkie-talkie',
			sanitizer.bypassSecurityTrustResourceUrl(
				'/assets/img/iconfinder/walkie-talkie.svg'
			)
		);

		/* For debugging */

		if (!env.debug) {
			return;
		}

		(<any> self).localStorageService = localStorageService;
		(<any> self).router = router;
	}
}
