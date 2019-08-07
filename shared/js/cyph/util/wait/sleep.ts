/** Sleep for the specifed amount of time. */
export const sleep = async (ms: number = 250): Promise<void> => {
	/* tslint:disable-next-line:ban */
	return new Promise<void>(resolve => {
		setTimeout(() => {
			resolve();
		}, ms);
	});
};
