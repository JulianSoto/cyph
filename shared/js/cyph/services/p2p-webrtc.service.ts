/* eslint-disable max-lines */

import {Injectable} from '@angular/core';
import hark from 'hark';
import * as msgpack from 'msgpack-lite';
import RecordRTC from 'recordrtc';
import {BehaviorSubject, Observable, Subject} from 'rxjs';
import {map, take} from 'rxjs/operators';
import SimplePeer from 'simple-peer';
import {BaseProvider} from '../base-provider';
import {env} from '../env';
import {IP2PHandlers} from '../p2p/ip2p-handlers';
import {IP2PWebRTCService} from '../service-interfaces/ip2p-webrtc.service';
import {events, ISessionMessageData, rpcEvents} from '../session';
import {Timer} from '../timer';
import {filterUndefined, filterUndefinedOperator} from '../util/filter';
import {normalizeArray} from '../util/formatting';
import {lockFunction} from '../util/lock';
import {debugLog, debugLogError} from '../util/log';
import {requestPermissions} from '../util/permissions';
import {request} from '../util/request';
import {parse} from '../util/serialization';
import {uuid} from '../util/uuid';
import {resolvable} from '../util/wait';
import {AnalyticsService} from './analytics.service';
import {SessionCapabilitiesService} from './session-capabilities.service';
import {SessionService} from './session.service';
import {StringsService} from './strings.service';

/** @inheritDoc */
@Injectable()
export class P2PWebRTCService extends BaseProvider
	implements IP2PWebRTCService {
	/** Constant values used by P2P. */
	public static readonly constants = {
		accept: 'accept',
		decline: 'decline',
		kill: 'kill',
		requestCall: 'requestCall',
		webRTC: 'webRTC'
	};

	/** Indicates whether WebRTC is supported in the current environment. */
	public static readonly isSupported: boolean =
		SimplePeer.WEBRTC_SUPPORT &&
		(env.debug || !(env.isCordovaMobile && env.isIOS));

	/** @ignore */
	private readonly _HANDLERS = resolvable<IP2PHandlers>();

	/** @ignore */
	private readonly _READY = resolvable(true);

	/** @ignore */
	private readonly _REMOTE_VIDEOS = resolvable<() => JQuery>();

	/** @ignore */
	private readonly confirmLocalVideoAccess = false;

	/** @ignore */
	private readonly disconnectInternal: Subject<void> = new Subject();

	/** @ignore */
	private readonly handlers: Promise<IP2PHandlers> = this._HANDLERS.promise;

	/** @ignore */
	private readonly harkers = new Map<MediaStream, hark.Harker>();

	/** @ignore */
	private isAccepted: boolean = false;

	/** @ignore */
	private readonly joinAndToggleLock = lockFunction();

	/** @ignore */
	private readonly lastDeviceIDs: {
		camera?: string;
		mic?: string;
		speaker?: string;
	} = {
		camera: undefined,
		mic: undefined,
		speaker: undefined
	};

	/** @ignore */
	private readonly remoteVideos: Promise<() => JQuery> = this._REMOTE_VIDEOS
		.promise;

	/** @ignore */
	private readonly resolveHandlers: (handlers: IP2PHandlers) => void = this
		._HANDLERS.resolve;

	/** @ignore */
	private readonly resolveRemoteVideos: (
		remoteVideo: () => JQuery
	) => void = this._REMOTE_VIDEOS.resolve;

	/** @ignore */
	private readonly sessionServices: Promise<SessionService[]>;

	/** @inheritDoc */
	public readonly cameraActivated = new BehaviorSubject<boolean>(false);

	/** @inheritDoc */
	public readonly disconnect: Observable<void> = this.disconnectInternal;

	/** @inheritDoc */
	public readonly incomingStreams = new BehaviorSubject<
		{
			activeVideo: boolean;
			constraints: MediaStreamConstraints;
			stream?: MediaStream;
			username?: string;
		}[]
	>([]);

	/** @inheritDoc */
	public readonly incomingStreamUsernames = this.incomingStreams.pipe(
		map(incomingStreams =>
			filterUndefined(
				incomingStreams
					.filter(o => o.stream !== undefined)
					.map(o => o.username)
			)
		)
	);

	/** @inheritDoc */
	public readonly incomingVideoStreams = this.incomingStreams.pipe(
		map(
			incomingStreams => <
					{
						activeVideo: boolean;
						constraints: MediaStreamConstraints;
						stream: MediaStream;
					}[]
				> incomingStreams.filter(o => !!o.constraints.video && !!o.stream)
		)
	);

	/** @inheritDoc */
	public readonly initialCallPending = new BehaviorSubject<boolean>(false);

	/** @inheritDoc */
	public readonly isActive = new BehaviorSubject<boolean>(false);

	/** @inheritDoc */
	public readonly loading = new BehaviorSubject<boolean>(true);

	/** @inheritDoc */
	public readonly localMediaError = new BehaviorSubject<boolean>(false);

	/** @inheritDoc */
	public readonly outgoingStream = new BehaviorSubject<{
		constraints: MediaStreamConstraints;
		stream?: MediaStream;
	}>({
		constraints: {
			audio: false,
			video: false
		}
	});

	/** @inheritDoc */
	public readonly ready: Promise<boolean> = this._READY.promise;

	/** @inheritDoc */
	public readonly recorder = (() => {
		const recordRTC = new RecordRTC.MRecordRTC();
		recordRTC.mediaType = {video: true};

		return {
			addStream: (stream: MediaStream) => {
				recordRTC.addStream(stream);
			},
			getBlob: async () =>
				new Promise<Blob>((resolve, reject) => {
					recordRTC.getBlob((recording: any) => {
						if (recording?.video instanceof Blob) {
							resolve(recording.video);
						}
						else {
							reject();
						}
					});
				}),
			pause: () => {
				recordRTC.pauseRecording();
			},
			resume: () => {
				recordRTC.resumeRecording();
			},
			start: () => {
				recordRTC.startRecording();
			},
			stop: async () =>
				new Promise<void>(resolve => {
					recordRTC.stopRecording(() => {
						resolve();
					});
				})
		};
	})();

	/** @inheritDoc */
	public readonly resolveReady: () => void = this._READY.resolve;

	/** @inheritDoc */
	public readonly videoEnabled = new BehaviorSubject<boolean>(true);

	/** @inheritDoc */
	public readonly webRTC = new BehaviorSubject<
		| undefined
		| {
				peers: {
					connected: Promise<void>;
					peer: SimplePeer.Instance | undefined;
				}[];
				timer: Timer;
		  }
	>(undefined);

	/** @ignore */
	private addHarker (
		remoteStream: MediaStream,
		incomingStreamIndex: number
	) : void {
		if (
			!this.sessionService.group ||
			this.harkers.has(remoteStream) ||
			remoteStream.getAudioTracks().length < 1
		) {
			return;
		}

		const harker = hark(remoteStream);
		this.harkers.set(remoteStream, harker);

		harker.on('speaking', () => {
			if (
				!this.incomingStreams.value[incomingStreamIndex].constraints
					.video
			) {
				return;
			}

			this.incomingStreams.next(
				this.incomingStreams.value.map((o, i) => ({
					...o,
					activeVideo: incomingStreamIndex === i
				}))
			);
		});
	}

	/** @ignore */
	private async getUserMedia () : Promise<MediaStream | undefined> {
		const {constraints} = this.outgoingStream.value;

		try {
			return await navigator.mediaDevices.getUserMedia(constraints);
		}
		catch (err) {
			debugLogError(() => ({
				webRTC: {navigatorMediaDevicesGetUserMedia: err}
			}));
		}

		try {
			return await new Promise<MediaStream>((resolve, reject) => {
				navigator.getUserMedia(constraints, resolve, reject);
			});
		}
		catch (err) {
			debugLogError(() => ({
				webRTC: {navigatorGetUserMedia: err}
			}));
		}

		return undefined;
	}

	/** @ignore */
	private async getWebRTC () : Promise<{
		peers: {
			connected: Promise<void>;
			peer: SimplePeer.Instance | undefined;
		}[];
		timer: Timer;
	}> {
		return this.webRTC.pipe(filterUndefinedOperator(), take(1)).toPromise();
	}

	/** @ignore */
	private async setOutgoingStreamConstraints (
		constraints: MediaStreamConstraints
	) : Promise<void> {
		const {cameras, mics} = await this.getDevices();

		this.outgoingStream.next({
			...this.outgoingStream.value,
			constraints: {
				...constraints,
				...(mics.length < 1 ? {audio: false} : {}),
				...(cameras.length < 1 ? {video: false} : {})
			}
		});
	}

	/** @ignore */
	private stopIncomingStream (incomingStream: {stream?: MediaStream}) : void {
		const {stream} = incomingStream;

		if (!stream) {
			return;
		}

		/* eslint-disable-next-line no-unused-expressions */
		this.harkers.get(stream)?.stop();
		this.harkers.delete(stream);

		for (const track of stream.getTracks()) {
			track.enabled = false;
			track.stop();
			stream.removeTrack(track);
		}
	}

	/** @inheritDoc */
	public async accept (
		callType?: 'audio' | 'video',
		isPassive: boolean = false
	) : Promise<void> {
		this.isAccepted = true;
		await this.setOutgoingStreamConstraints({
			audio: true,
			video: callType === 'video'
		});

		if (isPassive) {
			this.isActive.next(true);
		}
	}

	/** @inheritDoc */
	public async close (incomingP2PKill: boolean = false) : Promise<void> {
		const p2pKillPromise = Promise.all([
			incomingP2PKill ?
				Promise.resolve() :
				this.sessionService
					.send([rpcEvents.p2pKill, {}])
					.then(() => {}),
			this.recorder.stop()
		]);

		this.initialCallPending.next(false);

		this.disconnectInternal.next();

		const wasAccepted = this.isAccepted;
		const wasInitialCallPending = this.initialCallPending.value;
		this.isAccepted = false;
		this.isActive.next(false);
		this.loading.next(true);
		this.initialCallPending.next(false);

		if (this.outgoingStream.value.stream) {
			for (const track of this.outgoingStream.value.stream.getTracks()) {
				track.enabled = false;
				track.stop();
				this.outgoingStream.value.stream.removeTrack(track);
			}
		}

		if (this.webRTC.value) {
			this.webRTC.value.timer.stop();
			for (const {peer} of this.webRTC.value.peers) {
				/* eslint-disable-next-line no-unused-expressions */
				peer?.destroy();
			}
		}

		this.incomingStreams.next([]);
		this.outgoingStream.next({constraints: {audio: false, video: false}});
		this.webRTC.next(undefined);

		const handlers = await this.handlers;

		if (wasInitialCallPending) {
			await handlers.canceled();
		}
		else if (wasAccepted) {
			await handlers.connected(false);
		}

		await p2pKillPromise;
	}

	/** @inheritDoc */
	public async getDevices () : Promise<{
		cameras: {label: string; switchTo: () => Promise<void>}[];
		mics: {label: string; switchTo: () => Promise<void>}[];
		speakers: {label: string; switchTo: () => Promise<void>}[];
	}> {
		const allDevices = await (async () =>
			navigator.mediaDevices.enumerateDevices())().catch(() => []);

		const filterDevices = (
			kind: string,
			kindName: string,
			lastDeviceID: string | undefined,
			switchToFactory: (o: MediaDeviceInfo) => () => Promise<void>
		) => {
			const devices = allDevices.filter(o => o.kind === kind);

			const lastDevice = devices.find(
				o => o.deviceId === (lastDeviceID || 'default')
			);

			return (!lastDevice ?
				devices :
				[lastDevice, ...devices.filter(o => o !== lastDevice)]
			).map((o, i) => ({
				label: o.label || `${kindName} ${i + 1}`,
				switchTo: switchToFactory(o)
			}));
		};

		return {
			cameras: filterDevices(
				'videoinput',
				this.stringsService.cameraTitle,
				this.lastDeviceIDs.camera,
				(o: MediaDeviceInfo) => async () =>
					this.toggle('video', {newDeviceID: o.deviceId})
			),
			mics: filterDevices(
				'audioinput',
				this.stringsService.micTitle,
				this.lastDeviceIDs.mic,
				(o: MediaDeviceInfo) => async () =>
					this.toggle('audio', {newDeviceID: o.deviceId})
			),
			speakers: !('sinkId' in HTMLMediaElement.prototype) ?
				[] :
				filterDevices(
					'audiooutput',
					this.stringsService.speakerTitle,
					this.lastDeviceIDs.speaker,
					(o: MediaDeviceInfo) => async () => {
						const remoteVideos = (await this.remoteVideos)()
							.find('video')
							.toArray();
						if (remoteVideos.length < 1) {
							debugLogError(
								() =>
									'Remote video not found (switching speaker).'
							);
							return;
						}
						if (!('setSinkId' in remoteVideos[0])) {
							debugLogError(
								() => 'Switching speakers unsupported.'
							);
							return;
						}
						for (const remoteVideo of remoteVideos) {
							(<any> remoteVideo).setSinkId(o.deviceId);
						}
						this.lastDeviceIDs.speaker = o.deviceId;
					}
				)
		};
	}

	/** @inheritDoc */
	public init (handlers: IP2PHandlers, remoteVideos: () => JQuery) : void {
		this.resolveHandlers(handlers);
		this.resolveRemoteVideos(remoteVideos);
	}

	/** @inheritDoc */
	public async join (p2pSessionData: {
		callType: 'audio' | 'video';
		channelConfigIDs: {[a: string]: {[b: string]: number}};
		iceServers: string;
		id: string;
	}) : Promise<void> {
		if (!P2PWebRTCService.isSupported) {
			await this.close();
			await (await this.handlers).failed();
			return;
		}

		return this.joinAndToggleLock(async () => {
			if (this.webRTC.value) {
				return;
			}

			this.webRTC.next(undefined);
			this.isActive.next(true);

			const iceServers = parse<RTCIceServer[]>(p2pSessionData.iceServers)
				.map(o => {
					if ((<any> o).url !== undefined) {
						o.urls = (<any> o).url;
						delete (<any> o).url;
					}

					if (this.sessionService.apiFlags.disableP2P) {
						o.urls =
							typeof o.urls === 'string' &&
							o.urls.indexOf('stun:') !== 0 ?
								o.urls :
							o.urls instanceof Array ?
								o.urls.filter(
									(url: string) => url.indexOf('stun:') !== 0
								) :
								[];
					}

					if (
						o.urls ===
						'turn:global.turn.twilio.com:443?transport=tcp'
					) {
						o.urls =
							'turns:global.turn.twilio.com:443?transport=tcp';
					}

					return o;
				})
				.filter(o => o.urls && o.urls.length > 0)
				.concat(
					!this.sessionService.apiFlags.disableP2P ?
						{urls: 'stun:stun.l.google.com:19302'} :
						[]
				)
				.slice(0, 4);

			debugLog(() => ({p2pWebRTCJoin: {iceServers, p2pSessionData}}));

			const [handlers] = await Promise.all([
				this.handlers,
				this.accept(p2pSessionData.callType)
			]);

			this.cameraActivated.next(
				!!this.outgoingStream.value.constraints.video
			);

			if (
				(this.confirmLocalVideoAccess &&
					!(await handlers.localVideoConfirm(
						!!this.outgoingStream.value.constraints.video
					))) ||
				!(await requestPermissions(
					...[
						'RECORD_AUDIO',
						...(this.outgoingStream.value.constraints.video ?
							['CAMERA'] :
							[])
					]
				))
			) {
				debugLog(() => 'p2pWebRTCJoinCancel');
				return this.close();
			}

			const localStream = await this.getUserMedia();

			if (localStream === undefined) {
				await this.close();
				await handlers.failed();
				return;
			}

			this.lastDeviceIDs.camera = localStream
				.getVideoTracks()[0]
				?.getSettings().deviceId;
			this.lastDeviceIDs.mic = localStream
				.getAudioTracks()[0]
				?.getSettings().deviceId;

			this.recorder.addStream(localStream);

			this.outgoingStream.next({
				...this.outgoingStream.value,
				stream: localStream
			});

			const sessionServices = await this.sessionServices;

			this.incomingStreams.next(
				sessionServices.map(sessionService => ({
					activeVideo: false,
					constraints: this.outgoingStream.value.constraints,
					username: sessionService.pairwiseSessionData?.remoteUsername
				}))
			);

			const peers: {
				connected: Promise<void>;
				peer: SimplePeer.Instance | undefined;
			}[] = sessionServices.map((sessionService, i) => {
				const connected = resolvable();

				const channelParties =
					sessionService.pairwiseSessionData &&
					sessionService.pairwiseSessionData.localUsername &&
					sessionService.pairwiseSessionData.remoteUsername ?
						normalizeArray([
							sessionService.pairwiseSessionData.localUsername,
							sessionService.pairwiseSessionData.remoteUsername
						]) :
						undefined;

				const channelConfigID =
					channelParties &&
					p2pSessionData.channelConfigIDs[channelParties[0]] &&
					/* eslint-disable-next-line @typescript-eslint/tslint/config */
					typeof p2pSessionData.channelConfigIDs[channelParties[0]][
						channelParties[1]
					] === 'number' ?
						p2pSessionData.channelConfigIDs[channelParties[0]][
							channelParties[1]
						] :
						0;

				const peer = new SimplePeer({
					channelConfig: {
						id: channelConfigID,
						negotiated: true
					},
					channelName: p2pSessionData.id,
					config: !this.sessionService.apiFlags.disableP2P ?
						{iceServers} :
						{iceServers, iceTransportPolicy: 'relay'},
					initiator: sessionService.state.isAlice.value,
					sdpTransform: (sdp: any) : any =>
						/* http://www.kapejod.org/en/2014/05/28 */
						typeof sdp === 'string' ?
							sdp
								.split('\n')
								.filter(s => s.indexOf('ssrc-audio-level') < 0)
								.join('\n') :
							sdp,
					stream: localStream,
					trickle: false
				});

				peer.on('close', async () => {
					debugLog(() => ({webRTC: {close: true}}));
					peers[i].peer = undefined;
					connected.reject();

					if (!this.sessionService.group) {
						await this.close();
						return;
					}

					const newIncomingStreams = [
						...this.incomingStreams.value.slice(0, i),
						{
							...this.incomingStreams.value[i],
							activeVideo: false,
							constraints: {
								audio: false,
								video: false
							},
							stream: undefined
						},
						...this.incomingStreams.value.slice(i + 1)
					];

					if (this.incomingStreams.value[i].activeVideo) {
						const newActiveVideoStream = newIncomingStreams.find(
							o => o.constraints.video
						);

						if (newActiveVideoStream) {
							newActiveVideoStream.activeVideo = true;
						}
					}

					this.stopIncomingStream(this.incomingStreams.value[i]);
					this.incomingStreams.next(newIncomingStreams);
				});

				peer.on('connect', () => {
					debugLog(() => ({webRTC: {connect: true}}));
					connected.resolve();
				});

				peer.on('data', data => {
					try {
						const o = msgpack.decode(data);

						debugLog(() => ({webRTC: {data: o}}));

						this.incomingStreams.next([
							...this.incomingStreams.value.slice(0, i),
							{
								...this.incomingStreams.value[i],
								constraints: {
									audio: !!o.audio,
									video: !!o.video
								}
							},
							...this.incomingStreams.value.slice(i + 1)
						]);
					}
					catch (err) {
						debugLogError(() => ({
							webRTC: {dataFail: {data, err}}
						}));
					}
				});

				peer.on('error', err => {
					debugLogError(() => ({webRTC: {error: err}}));
					connected.reject();

					if (!this.sessionService.group) {
						this.localMediaError.next(true);
					}
				});

				peer.on('signal', (data: SimplePeer.SignalData) => {
					debugLog(() => ({webRTC: {outgoingSignal: data}}));

					sessionService.send([
						rpcEvents.p2p,
						{
							bytes: msgpack.encode(data)
						}
					]);
				});

				peer.on('stream', async (remoteStream: MediaStream) => {
					debugLog(() => ({
						webRTC: {
							remoteStream: {
								audio: remoteStream.getAudioTracks().length > 0,
								stream: remoteStream,
								video: remoteStream.getVideoTracks().length > 0
							}
						}
					}));

					this.stopIncomingStream(this.incomingStreams.value[i]);

					this.recorder.addStream(remoteStream);

					this.incomingStreams.next([
						...this.incomingStreams.value.slice(0, i),
						{
							...this.incomingStreams.value[i],
							activeVideo:
								!!this.incomingStreams.value[i].constraints
									.video &&
								!this.incomingStreams.value.find(
									o => o.activeVideo
								),
							stream: remoteStream
						},
						...this.incomingStreams.value.slice(i + 1)
					]);

					this.addHarker(remoteStream, i);

					if (!this.sessionService.group) {
						this.loading.next(false);
					}
				});

				peer.on(
					'track',
					async (
						remoteTrack: MediaStreamTrack,
						remoteStream: MediaStream
					) => {
						debugLog(() => ({
							webRTC: {
								track: {
									remoteStream: {
										audio:
											remoteStream.getAudioTracks()
												.length > 0,
										stream: remoteStream,
										video:
											remoteStream.getVideoTracks()
												.length > 0
									},
									remoteTrack: {
										kind: remoteTrack.kind,
										track: remoteTrack
									}
								}
							}
						}));

						this.addHarker(remoteStream, i);
					}
				);

				return {connected: connected.promise, peer};
			});

			if (this.sessionService.group) {
				this.loading.next(false);
			}

			handlers.loaded();
			handlers.connected(true);
			this.webRTC.next({
				peers,
				timer: new Timer(undefined, true, undefined, true)
			});

			this.initialCallPending.next(false);
		});
	}

	/** @inheritDoc */
	public async request (
		callType: 'audio' | 'video',
		isPassive: boolean = false,
		usernames: string[] = []
	) : Promise<void> {
		if (!P2PWebRTCService.isSupported || (isPassive && !this.isAccepted)) {
			return;
		}

		const [ok, iceServers] = await Promise.all([
			this.handlers.then(async handlers =>
				handlers.requestConfirm(callType, this.isAccepted)
			),
			request({
				retries: 5,
				url: env.baseUrl + 'iceservers'
			}).catch(() => '[]')
		]);

		if (!ok) {
			return;
		}

		usernames = normalizeArray(usernames);

		const channelConfigIDs = usernames
			.map((a, i) => usernames.slice(i + 1).map(b => [a, b]))
			.reduce((a, b) => [...a, ...b], [])
			.reduce<{[a: string]: {[b: string]: number}}>(
				(o, [a, b], i) => ({...o, [a]: {...o[a], [b]: i}}),
				{}
			);

		const p2pSessionData = {
			callType,
			channelConfigIDs,
			iceServers,
			id: uuid()
		};

		await Promise.all([
			this.sessionService.send([
				rpcEvents.p2pRequest,
				{
					bytes: msgpack.encode(p2pSessionData)
				}
			]),
			this.join(p2pSessionData)
		]);

		this.analyticsService.sendEvent({
			eventAction: 'start',
			eventCategory: 'call',
			eventLabel: p2pSessionData.callType,
			eventValue: 1,
			hitType: 'event'
		});
	}

	/** @inheritDoc */
	public async toggle (
		medium?: 'audio' | 'video',
		shouldPause?: boolean | {newDeviceID: string}
	) : Promise<void> {
		const webRTC = await this.getWebRTC();

		/* eslint-disable-next-line complexity */
		await this.joinAndToggleLock(async () => {
			let deviceIdChanged = false;

			const oldAudioTracks =
				this.outgoingStream.value.stream?.getAudioTracks() || [];
			const oldVideoTracks =
				this.outgoingStream.value.stream?.getVideoTracks() || [];
			const oldTracks = [...oldAudioTracks, ...oldVideoTracks];

			if (medium === 'audio' || medium === undefined) {
				if (
					typeof shouldPause === 'object' &&
					shouldPause.newDeviceID
				) {
					deviceIdChanged =
						deviceIdChanged ||
						this.lastDeviceIDs.mic !== shouldPause.newDeviceID;
					this.lastDeviceIDs.mic = shouldPause.newDeviceID;
				}

				const audio =
					typeof shouldPause === 'object' ||
					shouldPause === false ||
					(shouldPause === undefined &&
						!this.outgoingStream.value.constraints.audio);

				if (
					!!this.outgoingStream.value.constraints.audio !== audio ||
					(typeof this.outgoingStream.value.constraints.audio ===
						'boolean' &&
						this.lastDeviceIDs.mic) ||
					(typeof this.outgoingStream.value.constraints.audio ===
						'object' &&
						this.outgoingStream.value.constraints.audio.deviceId !==
							this.lastDeviceIDs.mic)
				) {
					for (const track of oldAudioTracks) {
						track.enabled = audio;
					}

					await this.setOutgoingStreamConstraints({
						...this.outgoingStream.value.constraints,
						audio:
							!audio || !this.lastDeviceIDs.mic ?
								audio :
								{deviceId: this.lastDeviceIDs.mic}
					});
				}
			}

			if (medium === 'video' || medium === undefined) {
				if (
					typeof shouldPause === 'object' &&
					shouldPause.newDeviceID
				) {
					deviceIdChanged =
						deviceIdChanged ||
						this.lastDeviceIDs.camera !== shouldPause.newDeviceID;
					this.lastDeviceIDs.camera = shouldPause.newDeviceID;
				}

				const video =
					typeof shouldPause === 'object' ||
					shouldPause === false ||
					(shouldPause === undefined &&
						!this.outgoingStream.value.constraints.video);

				if (
					!!this.outgoingStream.value.constraints.video !== video ||
					(typeof this.outgoingStream.value.constraints.video ===
						'boolean' &&
						this.lastDeviceIDs.camera) ||
					(typeof this.outgoingStream.value.constraints.video ===
						'object' &&
						this.outgoingStream.value.constraints.video.deviceId !==
							this.lastDeviceIDs.camera)
				) {
					for (const track of oldVideoTracks) {
						track.enabled = video;
					}

					await this.setOutgoingStreamConstraints({
						...this.outgoingStream.value.constraints,
						video:
							!video || !this.lastDeviceIDs.camera ?
								video :
								{deviceId: this.lastDeviceIDs.camera}
					});
				}
			}

			if (!deviceIdChanged) {
				return;
			}

			const stream = this.outgoingStream.value.stream;
			const newStream = await this.getUserMedia();

			if (newStream === undefined) {
				throw new Error('getUserMedia failed.');
			}

			const newAudioTracks = newStream.getAudioTracks();
			const newVideoTracks = newStream.getVideoTracks();
			const newTracks = [...newAudioTracks, ...newVideoTracks];

			if (
				!stream ||
				oldAudioTracks.length !== newAudioTracks.length ||
				oldVideoTracks.length !== newVideoTracks.length ||
				!('replaceTrack' in RTCRtpSender.prototype)
			) {
				for (const {peer} of webRTC.peers) {
					if (stream) {
						/* eslint-disable-next-line no-unused-expressions */
						peer?.removeStream(stream);
					}

					/* eslint-disable-next-line no-unused-expressions */
					peer?.addStream(newStream);
				}

				this.recorder.addStream(newStream);

				this.outgoingStream.next({
					...this.outgoingStream.value,
					stream: newStream
				});
			}
			else {
				for (const {peer} of webRTC.peers) {
					for (let i = 0; i < oldTracks.length; ++i) {
						/* eslint-disable-next-line no-unused-expressions */
						peer?.replaceTrack(oldTracks[i], newTracks[i], stream);
					}
				}

				for (let i = 0; i < oldTracks.length; ++i) {
					const oldTrack = oldTracks[i];
					const newTrack = newTracks[i];

					oldTrack.enabled = false;
					oldTrack.stop();
					stream.removeTrack(oldTrack);
					stream.addTrack(newTrack);
				}
			}
		});

		await Promise.all(
			webRTC.peers.map(async ({connected, peer}) => {
				try {
					await connected;
					await Promise.resolve(
						/* eslint-disable-next-line no-unused-expressions */
						peer?.send(
							msgpack.encode({
								audio: !!this.outgoingStream.value.constraints
									.audio,
								video: !!this.outgoingStream.value.constraints
									.video
							})
						)
					);
				}
				catch (err) {
					debugLogError(() => ({
						webRTC: {peerSendError: err}
					}));
				}
			})
		);
	}

	constructor (
		sessionCapabilitiesService: SessionCapabilitiesService,

		/** @ignore */
		private readonly analyticsService: AnalyticsService,

		/** @ignore */
		private readonly sessionService: SessionService,

		/** @ignore */
		private readonly stringsService: StringsService
	) {
		super();

		this.sessionServices = this.ready.then(
			() => this.sessionService.group || [this.sessionService]
		);

		this.sessionServices.then(sessionServices => {
			sessionCapabilitiesService.resolveP2PSupport(
				P2PWebRTCService.isSupported
			);

			this.sessionService.on(events.closeChat, () => {
				this.close();
			});

			if (!this.sessionService.group) {
				this.sessionService.on(rpcEvents.p2pKill, async () =>
					this.close(true)
				);
			}

			this.sessionService.on(
				rpcEvents.p2pRequest,
				async (newEvents: ISessionMessageData[]) => {
					const p2pSessionData =
						newEvents[0]?.bytes &&
						msgpack.decode(newEvents[0]?.bytes);

					if (
						!(
							typeof p2pSessionData === 'object' &&
							p2pSessionData &&
							(p2pSessionData.callType === 'audio' ||
								p2pSessionData.callType === 'video') &&
							typeof p2pSessionData.channelConfigIDs ===
								'object' &&
							typeof p2pSessionData.iceServers === 'string' &&
							typeof p2pSessionData.id === 'string'
						)
					) {
						return;
					}

					const ok = await (await this.handlers).acceptConfirm(
						p2pSessionData.callType,
						500000,
						this.isAccepted
					);

					if (!ok) {
						if (!this.sessionService.group) {
							await this.sessionService.send([
								rpcEvents.p2pKill,
								{}
							]);
						}

						return;
					}

					await this.join(p2pSessionData);
				}
			);

			for (let i = 0; i < sessionServices.length; ++i) {
				sessionServices[i].on(
					rpcEvents.p2p,
					async (newEvents: ISessionMessageData[]) => {
						const webRTC = await this.getWebRTC();

						for (const o of newEvents) {
							const data = o?.bytes && msgpack.decode(o.bytes);
							if (!data) {
								return;
							}

							debugLog(() => ({webRTC: {incomingSignal: data}}));

							/* eslint-disable-next-line no-unused-expressions */
							webRTC.peers[i].peer?.signal(data);
						}
					}
				);
			}
		});
	}
}
