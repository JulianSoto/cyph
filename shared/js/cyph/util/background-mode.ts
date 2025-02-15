const backgroundMode = (<any> self).cordova?.plugins?.backgroundMode;

/** Disables background mode (if applicable). */
export const disableBackgroundMode = () => {
	if (backgroundMode) {
		try {
			backgroundMode.disable();
		}
		catch {}
	}
};

/** Enables background mode (if applicable). */
export const enableBackgroundMode = () => {
	if (backgroundMode) {
		try {
			backgroundMode.enable();
		}
		catch {}
	}
};
