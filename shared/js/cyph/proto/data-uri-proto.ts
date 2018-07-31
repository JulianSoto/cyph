import {SecurityContext} from '@angular/core';
import {SafeUrl} from '@angular/platform-browser';
import {potassiumUtil} from '../crypto/potassium/potassium-util';
import {staticDomSanitizer} from '../util/static-services';


/** Base64 data URI encoder/decoder. (Doesn't actually use Protocol Buffers.) */
export class DataURIProto {
	/** @ignore */
	private static readonly prefix: string	= 'data:image/png;base64,';

	/** @ignore */
	private static readonly prefixBytes: Uint8Array	= potassiumUtil.fromString(
		DataURIProto.prefix
	);

	/** Replaces prefix with DataURIProto.prefix. */
	public static async normalize (data: SafeUrl|string) : Promise<string> {
		return (
			DataURIProto.prefix +
			(await DataURIProto.safeUrlToString(data)).split(';base64,')[1]
		);
	}

	/** Converts possible-SafeUrl to string. */
	public static async safeUrlToString (
		data: SafeUrl|string,
		mediaType?: string
	) : Promise<string> {
		if (typeof data === 'string') {
			return data;
		}

		if (!data) {
			throw new Error('Undefined input.');
		}

		const sanitized	= (await staticDomSanitizer).sanitize(
			SecurityContext.URL,
			data
		);

		if (typeof sanitized !== 'string') {
			throw new Error('Input failed DomSanitizer validation.');
		}

		return mediaType ?
			`data:${mediaType};base64,${sanitized.split(';base64,')[1]}` :
			sanitized
		;
	}

	/** @see IProto.create */
	public static create () : SafeUrl {
		return {};
	}

	/** @see IProto.decode */
	public static async decode (bytes: Uint8Array) : Promise<SafeUrl> {
		if (bytes.length < 1) {
			return {};
		}

		return (await staticDomSanitizer).bypassSecurityTrustUrl(
			DataURIProto.prefix + potassiumUtil.toBase64(bytes)
		);
	}

	/** @see IProto.encode */
	public static async encode (data: SafeUrl|string) : Promise<Uint8Array> {
		try {
			data	= await DataURIProto.safeUrlToString(data);
		}
		catch {}

		if (typeof data !== 'string') {
			return new Uint8Array(0);
		}

		return potassiumUtil.fromBase64(data.slice(DataURIProto.prefix.length));
	}

	/** @see IProto.verify */
	public static async verify (data: SafeUrl|string) : Promise<string|undefined> {
		try {
			data	= await DataURIProto.safeUrlToString(data);
		}
		catch {}

		if (
			typeof data === 'string' &&
			data.length >= DataURIProto.prefix.length &&
			potassiumUtil.compareMemory(
				potassiumUtil.fromString(data.slice(0, DataURIProto.prefix.length)),
				DataURIProto.prefixBytes
			)
		) {
			return;
		}

		return 'Not a data URI.';
	}
}
