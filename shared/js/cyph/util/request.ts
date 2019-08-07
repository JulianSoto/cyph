import {
	HttpErrorResponse,
	HttpEventType,
	HttpHeaders,
	HttpRequest,
	HttpResponse
} from '@angular/common/http';
import {BehaviorSubject, Observable} from 'rxjs';
import {MaybePromise} from '../maybe-promise-type';
import {parse, stringify, toQueryString} from './serialization';
import {staticHttpClient} from './static-services';
import {sleep} from './wait';

/** Performs HTTP request. */
const baseRequest = <R, T>(
	o: {
		contentType?: string;
		data?: any;
		discardErrors?: boolean;
		headers?: Record<string, string | string[]>;
		method?: string;
		retries?: number;
		timeout?: number;
		url: string;
	},
	responseType: 'arraybuffer' | 'blob' | 'json' | 'text',
	getResponseData: (res: HttpResponse<T>) => MaybePromise<R>
) : {
	progress: Observable<number>;
	result: Promise<R>;
} => {
	const progress = new BehaviorSubject(0);

	return {
		progress,
		/* tslint:disable-next-line:cyclomatic-complexity */
		result: (async () => {
			const httpClient = await staticHttpClient;

			const headers = o.headers || {};
			const method = o.method || 'GET';
			const retries = o.retries === undefined ? 0 : o.retries;
			let contentType = o.contentType || '';
			let data = o.data;
			let url = o.url;

			if (!contentType) {
				if (url.slice(-5) === '.json') {
					contentType = 'application/json';
				}
				else if (responseType === 'json' || responseType === 'text') {
					contentType = 'application/x-www-form-urlencoded';
				}
			}

			if (data && method === 'GET') {
				url +=
					'?' +
					(typeof data === 'object' ?
						toQueryString(data) :
						<string> data.toString());

				data = undefined;
			}
			else if (typeof data === 'object') {
				data =
					contentType === 'application/json' ?
						stringify(data) :
						toQueryString(data);
			}

			let response: R | undefined;
			let error: Error | undefined;
			let statusOk = false;

			for (let i = 0; !statusOk && i <= retries; ++i) {
				try {
					progress.next(0);

					const req = httpClient.request<T>(
						new HttpRequest(method, url, data, {
							headers: new HttpHeaders({
								...(contentType ?
									{'Content-Type': contentType} :
									{}),
								...headers
							}),
							responseType
						})
					);

					const res = await Promise.race([
						new Promise<HttpResponse<T>>((resolve, reject) => {
							let last: HttpResponse<T>;

							/* tslint:disable-next-line:rxjs-no-ignored-subscription */
							req.subscribe(
								e => {
									if (
										e.type ===
										HttpEventType.DownloadProgress
									) {
										progress.next(
											(e.loaded / (e.total || e.loaded)) *
												100
										);
									}
									else if (
										e.type === HttpEventType.Response
									) {
										last = e;
									}
								},
								reject,
								() => {
									if (last) {
										resolve(last);
									}
									else {
										reject();
									}
								}
							);
						}),
						...(!o.timeout ?
							[] :
							[
								sleep(o.timeout).then(async () =>
									Promise.reject('Request timeout.')
								)
							])
					]);

					statusOk = res.ok;
					response = await getResponseData(res);
				}
				catch (err) {
					error = err;
					statusOk = false;
				}
			}

			if (!statusOk || response === undefined) {
				const err =
					(error instanceof HttpErrorResponse && error.error ?
						new Error(error.error) :
						undefined) ||
					error ||
					response ||
					new Error('Request failed.');

				progress.error(err);
				throw err;
			}

			progress.next(100);
			progress.complete();
			return response;
		})()
	};
};

/** Performs HTTP request. */
export const request = async (o: {
	contentType?: string;
	data?: any;
	headers?: Record<string, string | string[]>;
	method?: string;
	retries?: number;
	timeout?: number;
	url: string;
}) : Promise<string> => {
	return (await baseRequest<string, string>(o, 'text', res =>
		(res.body || '').trim()
	)).result;
};

/** Performs HTTP request. */
export const requestByteStream = (o: {
	contentType?: string;
	data?: any;
	headers?: Record<string, string | string[]>;
	method?: string;
	retries?: number;
	timeout?: number;
	url: string;
}) : {
	progress: Observable<number>;
	result: Promise<Uint8Array>;
} => {
	return baseRequest<Uint8Array, ArrayBuffer>(o, 'arraybuffer', res =>
		res.body ? new Uint8Array(res.body) : new Uint8Array(0)
	);
};

/** Performs HTTP request. */
export const requestBytes = async (o: {
	contentType?: string;
	data?: any;
	headers?: Record<string, string | string[]>;
	method?: string;
	retries?: number;
	timeout?: number;
	url: string;
}) : Promise<Uint8Array> => {
	return requestByteStream(o).result;
};

/** Performs HTTP request. */
export const requestMaybeJSON = async (o: {
	contentType?: string;
	data?: any;
	headers?: Record<string, string | string[]>;
	method?: string;
	retries?: number;
	timeout?: number;
	url: string;
}) : Promise<any> => {
	const response = await request(o);

	try {
		return parse(response);
	}
	catch (_) {
		return response;
	}
};

/** Performs HTTP request. */
export const requestJSON = async (o: {
	contentType?: string;
	data?: any;
	headers?: Record<string, string | string[]>;
	method?: string;
	retries?: number;
	timeout?: number;
	url: string;
}) : Promise<any> => {
	return (await baseRequest<any, any>(o, 'json', res => res.body)).result;
};
