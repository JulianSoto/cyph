/* tslint:disable:no-async-without-await */

import {BaseProvider} from '../base-provider';
import {IProto} from '../iproto';
import {MaybePromise} from '../maybe-promise-type';
import {BinaryProto} from '../proto';

/**
 * Base class for any service that manages data.
 */
export class DataManagerService extends BaseProvider {
	/** Gets an item's value. */
	public async getItem<T> (_URL: string, _PROTO: IProto<T>) : Promise<T> {
		throw new Error('Must provide an implementation of getItem.');
	}

	/** Gets a value and sets a default value if none had previously been set. */
	public async getOrSetDefault<T> (
		url: string,
		proto: IProto<T>,
		defaultValue: () => MaybePromise<T>
	) : Promise<T> {
		try {
			return await this.getItem(url, proto);
		}
		catch {
			const value = await defaultValue();
			this.setItem(url, proto, value).catch(() => {});
			return value;
		}
	}

	/** Checks whether an item exists. */
	public async hasItem (url: string) : Promise<boolean> {
		try {
			await this.getItem(url, BinaryProto);
			return true;
		}
		catch {
			return false;
		}
	}

	/** Deletes an item. */
	public async removeItem (_URL: string) : Promise<void> {
		throw new Error('Must provide an implementation of removeItem.');
	}

	/**
	 * Sets an item's value.
	 * @returns Item url.
	 */
	public async setItem<T> (
		_URL: string,
		_PROTO: IProto<T>,
		_VALUE: T
	) : Promise<{url: string}> {
		throw new Error('Must provide an implementation of setItem.');
	}

	constructor () {
		super();
	}
}
