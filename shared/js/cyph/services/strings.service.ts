/* eslint-disable @typescript-eslint/quotes, max-lines */

import {Injectable} from '@angular/core';
import {BaseProvider} from '../base-provider';
import {translate} from '../util/translate';
import {EnvService} from './env.service';

/**
 * User-facing strings referenced throughout the codes
 * (translated to user's language where possible).
 */
@Injectable()
export class StringsService extends BaseProvider {
	/** @ignore */
	private readonly customBuildStrings: {[k: string]: string} =
		this.envService.environment.customBuild &&
		this.envService.environment.customBuild.strings ?
			this.envService.environment.customBuild.strings :
			{};

	/** @ignore */
	private readonly internalCompany =
		this.customBuildStrings.internalCompany || `Cyph`;

	/** @ignore */
	private readonly internalFriend =
		this.customBuildStrings.internalFriend || `friend`;

	/** @ignore */
	private readonly internalLogoText =
		this.customBuildStrings.internalLogoText ||
		this.customBuildStrings.internalProduct ||
		`cyph`;

	/** @ignore */
	private readonly internalProduct =
		this.customBuildStrings.internalProduct || `Cyph`;

	/** @ignore */
	private readonly internalProductShort =
		this.customBuildStrings.internalProductShort || `Cyph`;

	/** @ignore */
	private readonly internalProductTelehealth =
		this.customBuildStrings.internalProductTelehealth ||
		this.customBuildStrings.internalProduct ||
		`Cyph Telehealth`;

	/** @ignore */
	private readonly internalSession =
		this.customBuildStrings.internalSession || `cyph`;

	/** @see StringsService */
	public readonly accept = `accept`;

	/** @see StringsService */
	public readonly access = `Access`;

	/** @see StringsService */
	public readonly addContactButtonExternal = `Coming Soon: External Contact`;

	/** @see StringsService */
	public readonly addContactButtonInternal = `${this.internalProductShort} User`;

	/** @see StringsService */
	public readonly addContactButtonInviteEmail = `Invite to ${this.internalProductShort} via Email`;

	/** @see StringsService */
	public readonly addContactTitle = `Add Contact`;

	/** @see StringsService */
	public readonly addContactTooltipExternal = `Add someone using their email address`;

	/** @see StringsService */
	public readonly addContactTooltipInternal = `Add someone using their ${this.internalProductShort} username`;

	/** @see StringsService */
	public readonly addContactTooltipInvite = `Invite to ${this.internalProductShort} via Email`;

	/** @see StringsService */
	public readonly addContactTooltipInviteLink = `Generate a ${this.internalProductShort} invite link`;

	/** @see StringsService */
	public readonly affAlt = `Non-targeted banner ad`;

	/** @see StringsService */
	public readonly affTooltip = `Opens in new tab`;

	/** @see StringsService */
	public readonly allow = `Allow`;

	/** @see StringsService */
	public readonly anonymous = `Anonymous`;

	/** @see StringsService */
	public readonly answer = `Answer`;

	/** @see StringsService */
	public readonly appointmentCalendar = `Appointment Calendar`;

	/** @see StringsService */
	public readonly appointmentDuration = `Appointment Duration`;

	/** @see StringsService */
	public readonly appointmentNotes = `Notes about this appointment:`;

	/** @see StringsService */
	public readonly audioCall = `call`;

	/** @see StringsService */
	public readonly bannerText = `Help Defend Internet Privacy: `;

	/** @see StringsService */
	public readonly bannerTextAlt = `Help Defend Internet Privacy: Donate to ${this.internalCompany}`;

	/** @see StringsService */
	public readonly bitcoinAmountLabel = `Amount (BTC)`;

	/** @see StringsService */
	public readonly bitcoinConfirmationPrompt = `Send \${1} BTC to \${2}?`;

	/** @see StringsService */
	public readonly bitcoinErrorText = `Failed to send`;

	/** @see StringsService */
	public readonly bitcoinErrorTitle = `Send Error`;

	/** @see StringsService */
	public readonly bitcoinRecipientLabel = `Recipient Address`;

	/** @see StringsService */
	public readonly bitcoinSendTitle = `Send Bitcoin`;

	/** @see StringsService */
	public readonly bitcoinShort = `BTC`;

	/** @see StringsService */
	public readonly bitcoinSuccessText = `Sent`;

	/** @see StringsService */
	public readonly bitcoinSuccessTitle = `Send Success`;

	/** @see StringsService */
	public readonly bitcoinTransactionFee = `Transaction fee: \${1} BTC`;

	/** @see StringsService */
	public readonly burner = `Burner`;

	/** @see StringsService */
	public readonly callType = `Call Type`;

	/** @see StringsService */
	public readonly camera = `camera`;

	/** @see StringsService */
	public readonly cameraDisable = `Disable Camera`;

	/** @see StringsService */
	public readonly cameraEnable = `Enable Camera`;

	/** @see StringsService */
	public readonly cameraSwitchTitle = `Choose Camera`;

	/** @see StringsService */
	public readonly cameraTitle = `Camera`;

	/** @see StringsService */
	public readonly cancel = `cancel`;

	/** @see StringsService */
	public readonly changeMasterKeyContent = `You are about to change your **master key**. This is not reversible. If you lose the new master key, **your account cannot be recovered**.\n\nYou will be required to log in again from scratch next time you open ${this.internalProduct}. Continue?`;

	/** @see StringsService */
	public readonly changeMasterKeyFailure = `Changing the master key failed. Please try again later.`;

	/** @see StringsService */
	public readonly changeMasterKeyTitle = `Change Master Key`;

	/** @see StringsService */
	public readonly changePinContent = `You are about to change your **lock screen password**. This is a simple passcode used to lock your account while you're away.\n\nYou will be required to log in again from scratch next time you open ${this.internalProduct}. Continue?`;

	/** @see StringsService */
	public readonly changePinFailure = `Changing the lock screen password failed. Please try again later.`;

	/** @see StringsService */
	public readonly changePinTitle = `Change Lock Screen Password`;

	/** @see StringsService */
	public readonly checkoutBraintreeError = `Braintree failed to initialize.`;

	/** @see StringsService */
	public readonly checkoutErrorEnd = `Please check your payment credentials and try again.`;

	/** @see StringsService */
	public readonly checkoutErrorStart = `Processing payment failed`;

	/** @see StringsService */
	public readonly checkoutErrorTitle = `Payment Failed`;

	/** @see StringsService */
	public readonly clickHere = `Click here`;

	/** @see StringsService */
	public readonly clipboardCopyFail = `Automated clipboard copy unsupported in this browser.`;

	/** @see StringsService */
	public readonly company = `${this.internalCompany}`;

	/** @see StringsService */
	public readonly composeMessage = `Compose Message`;

	/** @see StringsService */
	public readonly confirmMasterKeyFinal = `Confirm Master Key`;

	/** @see StringsService */
	public readonly confirmMasterKeyStep1 = `Next`;

	/** @see StringsService */
	public readonly connectedNotification = `Connected!`;

	/** @see StringsService */
	public readonly connecting = `Now Connecting...`;

	/** @see StringsService */
	public readonly contactCyph = `Contact ${this.internalCompany}`;

	/** @see StringsService */
	public readonly contactSupport = `Contact Support`;

	/** @see StringsService */
	public readonly continueButton = `Continue`;

	/** @see StringsService */
	public readonly continueDialogAction = `continue`;

	/** @see StringsService */
	public readonly continuePrompt = `Continue?`;

	/** @see StringsService */
	public readonly createGroupTitle = `New Group Chat`;

	/** @see StringsService */
	public readonly createGroupTooltip = `Start a chat with a group of your contacts`;

	/** @see StringsService */
	public readonly currentAppointment = `Current Appointment`;

	/** @see StringsService */
	public readonly currentAppointments = `Current Appointments`;

	/** @see StringsService */
	public readonly cypherToast1 = `Prepare to witness the amazing nuts and bolts of ${this.internalProductShort}.`;

	/** @see StringsService */
	public readonly cypherToast2 = `This cyphertext is what outsiders spying on your traffic will see (nothing of value).`;

	/** @see StringsService */
	public readonly cypherToast3 = `Thou art amazed.`;

	/** @see StringsService */
	public readonly decline = `Decline`;

	/** @see StringsService */
	public readonly deleteConfirm = `Confirm Deletion`;

	/** @see StringsService */
	public readonly deleteMessage = `Delete`;

	/** @see StringsService */
	public readonly disabled = `Disabled`;

	/** @see StringsService */
	public readonly discard = `discard`;

	/** @see StringsService */
	public readonly disconnect = `Disconnect`;

	/** @see StringsService */
	public readonly disconnectConfirm = `Are you sure that you wish to disconnect?`;

	/** @see StringsService */
	public readonly disconnectNotification = `This ${this.internalSession} has been disconnected.`;

	/** @see StringsService */
	public readonly disconnectTitle = `Disconnect`;

	/** @see StringsService */
	public readonly disconnectWarning = `After closing this ${this.internalSession}, your messages will no longer be retrievable.`;

	/** @see StringsService */
	public readonly doctor = `doctor`;

	/** @see StringsService */
	public readonly dr = `Dr.`;

	/** @see StringsService */
	public readonly email = `Email`;

	/** @see StringsService */
	public readonly emailOptional = `Email (optional)`;

	/** @see StringsService */
	public readonly emptyContactList = `You have no friends.`;

	/** @see StringsService */
	public readonly enabled = `Enabled`;

	/** @see StringsService */
	public readonly endDate = `End Date`;

	/** @see StringsService */
	public readonly endTime = `End Time`;

	/** @see StringsService */
	public readonly feedback = `Send Feedback`;

	/** @see StringsService */
	public readonly fileCall = `file transfer`;

	/** @see StringsService */
	public readonly fileTooLarge = `The file that you are trying to send exceeds the 250 MB attachment limit.`;

	/** @see StringsService */
	public readonly fileTransferInitFriend = `Your ${this.internalFriend} is sending the file:`;

	/** @see StringsService */
	public readonly fileTransferInitMe = `You are sending the file:`;

	/** @see StringsService */
	public readonly followUpAdjective = `Follow-Up`;

	/** @see StringsService */
	public readonly followUpNoun = `Follow Up`;

	/** @see StringsService */
	public readonly footerMessageAPI = `${this.internalProduct} API`;

	/** @see StringsService */
	public readonly footerMessageDefault = `Individual Use Only`;

	/** @see StringsService */
	public readonly footerMessagePro = `${this.internalProduct} Pro`;

	/** @see StringsService */
	public readonly form = `Form`;

	/** @see StringsService */
	public readonly formattingHelp = `Formatting Help`;

	/** @see StringsService */
	public readonly friend = `${this.internalFriend}`;

	/** @see StringsService */
	public readonly friendIsTyping = `${this.capitalize(
		this.internalFriend
	)} is typing...`;

	/** @see StringsService */
	public readonly futureAppointments = `Appointments`;

	/** @see StringsService */
	public readonly getMessageValueFailure = `\`[Failed to fetch the contents of this message]\``;

	/** @see StringsService */
	public readonly group = `Group`;

	/** @see StringsService */
	public readonly hasInvitedYouToA = `has invited you to a`;

	/** @see StringsService */
	public readonly help = `Help`;

	/** @see StringsService */
	public readonly here = `here`;

	/** @see StringsService */
	public readonly gdprContactForm = `I understand that this form is email-based (NOT ${this.internalProduct} encryption) and provide consent for ${this.internalCompany} to store any information submitted herein.`;

	/** @see StringsService */
	public readonly gdprContactFormShort = `Data Collection Consent`;

	/** @see StringsService */
	public readonly gdprSignupForm = `By submitting your email address and/or name to the waitlist, you consent for ${this.internalCompany} to view and store this data.`;

	/** @see StringsService */
	public readonly incoming = `Incoming`;

	/** @see StringsService */
	public readonly incomingAppointments = `Incoming Appointment Requests`;

	/** @see StringsService */
	public readonly incomingCallAudio = `Incoming Call`;

	/** @see StringsService */
	public readonly incomingCallVideo = `Incoming Video Call`;

	/** @see StringsService */
	public readonly incomingFile = `Download File`;

	/** @see StringsService */
	public readonly incomingFileSave = `This file has not been scanned for malware; you may download it _at your own risk_. Save this file?`;

	/** @see StringsService */
	public readonly incomingFileSaveError = `Failed to save the following file:`;

	/** @see StringsService */
	public readonly incomingFileSaveMediaError = `Failed to download.`;

	/** @see StringsService */
	public readonly incomingFileUploadError = `Failed to upload the following file:`;

	/** @see StringsService */
	public readonly incomingPatientInfo = `Your doctor has shared this medical data to be saved in your account to auto-fill forms on your behalf in the future. Would you like to accept it?`;

	/** @see StringsService */
	public readonly incomingPatientInfoTitle = `Saving Incoming Patient Info`;

	/** @see StringsService */
	public readonly introductoryMessage = `You may now speak.`;

	/** @see StringsService */
	public readonly invalidCredentials = `Invalid username or master key.`;

	/** @see StringsService */
	public readonly invalidInviteCode = `Invalid invite code.`;

	/** @see StringsService */
	public readonly invalidMasterKey = `Invalid master key.`;

	/** @see StringsService */
	public readonly invalidPassword = `Invalid password.`;

	/** @see StringsService */
	public readonly invalidPIN = `Invalid lock screen password.`;

	/** @see StringsService */
	public readonly inviteContactTitle = `Invite Friend`;

	/** @see StringsService */
	public readonly inviteLinkButton = `Generate Invite Link`;

	/** @see StringsService */
	public readonly inviteLinkConfirm = `This will consume one of your available invites. Continue?`;

	/** @see StringsService */
	public readonly inviteLinkText = `## \${LINK}`;

	/** @see StringsService */
	public readonly inviteLinkTitle = `Invite Link`;

	/** @see StringsService */
	public readonly linkCopied = `${this.capitalize(
		this.internalSession
	)} link copied.`;

	/** @see StringsService */
	public readonly linkEmailSubject = `${this.internalProductShort} Chat Invite`;

	/** @see StringsService */
	public readonly linkEmailSubjectTelehealth = `Your Telehealth Appointment`;

	/** @see StringsService */
	public readonly linkEmailText = `I'm inviting you to chat with me securely via ${this.internalProductShort}!\n\nI'll be waiting here: \${LINK}`;

	/** @see StringsService */
	public readonly linkEmailTextTelehealth = `Your telehealth appointment is starting now.\n\nYour doctor is waiting here: \${LINK} (click to join)`;

	/** @see StringsService */
	public readonly linkExpiresAt = `Link expires at`;

	/** @see StringsService */
	public readonly linkGet = `Start an ephemeral chat with someone who hasn't yet signed up for ${this.internalProductShort}`;

	/** @see StringsService */
	public readonly linkTooltip = `${this.capitalize(
		this.internalSession
	)} Link`;

	/** @see StringsService */
	public readonly lockScreen = `Lock Screen Password`;

	/** @see StringsService */
	public readonly lockScreenPassword = `Custom Password`;

	/** @see StringsService */
	public readonly lockScreenPasswordMismatch = `Passwords don't match`;

	/** @see StringsService */
	public readonly lockScreenPIN = `Four-Digit PIN`;

	/** @see StringsService */
	public readonly localMediaError = `Error loading webcam and/or microphone`;

	/** @see StringsService */
	public readonly logIn = `Log In`;

	/** @see StringsService */
	public readonly logInTitle = `Log in to ${this.internalProduct}`;

	/** @see StringsService */
	public readonly logo = `Logo`;

	/** @see StringsService */
	public readonly logoText = this.internalLogoText;

	/** @see StringsService */
	public readonly masterKey = `Master Key`;

	/** @see StringsService */
	public readonly masterKeyInfo = `Master Key is space- and case-sensitive`;

	/** @see StringsService */
	public readonly masterKeyMismatch = `Master Keys don't match`;

	/** @see StringsService */
	public readonly me = `me`;

	/** @see StringsService */
	public readonly message = `message`;

	/** @see StringsService */
	public readonly messageConfirmed = `Message delivery confirmed`;

	/** @see StringsService */
	public readonly messageCopied = `Message copied.`;

	/** @see StringsService */
	public readonly messages = `messages`;

	/** @see StringsService */
	public readonly messagesHeader = `Messages`;

	/** @see StringsService */
	public readonly messageTitle = `Message`;

	/** @see StringsService */
	public readonly messageUnconfirmed = `Message delivery unconfirmed`;

	/** @see StringsService */
	public readonly mic = `microphone`;

	/** @see StringsService */
	public readonly micDisable = `Disable Mic`;

	/** @see StringsService */
	public readonly micEnable = `Enable Mic`;

	/** @see StringsService */
	public readonly micSwitchTitle = `Choose Mic`;

	/** @see StringsService */
	public readonly micTitle = `Mic`;

	/** @see StringsService */
	public readonly name = `Name`;

	/** @see StringsService */
	public readonly nameOptional = `Name (optional)`;

	/** @see StringsService */
	public readonly nameOrPseudonym = `Name or Pseudonym`;

	/** @see StringsService */
	public readonly newDoc = `New Doc`;

	/** @see StringsService */
	public readonly newMessageNotification = `New message!`;

	/** @see StringsService */
	public readonly newNote = `New Note`;

	/** @see StringsService */
	public readonly newString = `new`;

	/** @see StringsService */
	public readonly newWalletErrorText = `Adding wallet failed. Please double check the input and try again.`;

	/** @see StringsService */
	public readonly newWalletErrorTitle = `New Wallet Error`;

	/** @see StringsService */
	public readonly newWalletGenerate = `Generate New Wallet`;

	/** @see StringsService */
	public readonly newWalletGenerateText = `This will generate a brand new wallet. Proceed?`;

	/** @see StringsService */
	public readonly newWalletImportAddress = `Watch Wallet Address`;

	/** @see StringsService */
	public readonly newWalletImportAddressInput = `Address`;

	/** @see StringsService */
	public readonly newWalletImportAddressText = `Add a read-only wallet to track the following public address:`;

	/** @see StringsService */
	public readonly newWalletImportKey = `Import Wallet Key`;

	/** @see StringsService */
	public readonly newWalletImportKeyInput = `WIF Key`;

	/** @see StringsService */
	public readonly newWalletImportKeyText = `Import existing wallet private key in WIF format:`;

	/** @see StringsService */
	public readonly newWalletName = `Wallet Name`;

	/** @see StringsService */
	public readonly newWalletNameInput = `Wallet Name`;

	/** @see StringsService */
	public readonly newWalletNameText = `Name of this wallet:`;

	/** @see StringsService */
	public readonly next = `Next`;

	/** @see StringsService */
	public readonly no = `no`;

	/** @see StringsService */
	public readonly noAppointments = `You have no appointments`;

	/** @see StringsService */
	public readonly noCall = `No Call`;

	/** @see StringsService */
	public readonly noIncomingAppointments = `You have no incoming appointment requests`;

	/** @see StringsService */
	public readonly notes = `Notes`;

	/** @see StringsService */
	public readonly noteSaved = `Note saved!`;

	/** @see StringsService */
	public readonly notFound = `404 page not found`;

	/** @see StringsService */
	public readonly noTransactions = `No transaction history`;

	/** @see StringsService */
	public readonly noWallets = `You have no wallets`;

	/** @see StringsService */
	public readonly ok = `ok`;

	/** @see StringsService */
	public readonly omitted = `(omitted)`;

	/** @see StringsService */
	public readonly oopsTitle = `Oops!`;

	/** @see StringsService */
	public readonly open = `Open`;

	/** @see StringsService */
	public readonly openFileFailed = `Failed to open file.`;

	/** @see StringsService */
	public readonly openMenu = `Open Menu`;

	/** @see StringsService */
	public readonly openProfile = `Open Profile`;

	/** @see StringsService */
	public readonly outgoing = `Outgoing`;

	/** @see StringsService */
	public readonly outgoingFileError = `Failed to send the following file:`;

	/** @see StringsService */
	public readonly outgoingFileRejected = `Your "${this.internalFriend}" has rejected the following file transfer:`;

	/** @see StringsService */
	public readonly outgoingFileSaved = `File transfer complete! Your ${this.internalFriend} has saved the following file:`;

	/** @see StringsService */
	public readonly p2pAccountChatNotice = `This is an ephemeral chat session available during your call. No logs will be saved.`;

	/** @see StringsService */
	public readonly p2pCanceled = `Call canceled.`;

	/** @see StringsService */
	public readonly p2pConnect = `Call has started.`;

	/** @see StringsService */
	public readonly p2pDeny = `Your "${this.internalFriend}" has rejected your call.`;

	/** @see StringsService */
	public readonly p2pDisabled = `Your or your ${this.internalFriend}'s browser may lack support for video calling. Try again with the latest Chrome or Firefox.`;

	/** @see StringsService */
	public readonly p2pDisabledGroup = `Calling in group chats is currently unsupported. Coming soon!`;

	/** @see StringsService */
	public readonly p2pDisabledLocal = `Your browser does not support voice or video calling. Try again with the latest Chrome or Firefox.`;

	/** @see StringsService */
	public readonly p2pDisabledLocalIOS = `Voice/video calling is currently unsupported on iOS.`;

	/** @see StringsService */
	public readonly p2pDisconnect = `Call has been disconnected.`;

	/** @see StringsService */
	public readonly p2pFailed = `Call failed. Please try again later.`;

	/** @see StringsService */
	public readonly p2pInit = `You are about to initiate an encrypted`;

	/** @see StringsService */
	public readonly p2pRequest = `Your ${this.internalFriend} has requested an encrypted`;

	/** @see StringsService */
	public readonly p2pRequestConfirmation = `Your request has been sent.`;

	/** @see StringsService */
	public readonly p2pTitle = `${this.internalProduct} Call`;

	/** @see StringsService */
	public readonly p2pTimeoutIncoming = `Missed call.`;

	/** @see StringsService */
	public readonly p2pTimeoutOutgoing = `Your call was missed.`;

	/** @see StringsService */
	public readonly p2pWarning = `This may involve sharing your IP address with your ${this.internalFriend}. Proceed if you trust your ${this.internalFriend}.`;

	/** @see StringsService */
	public readonly p2pWarningVPN = `This may involve sharing your IP address with your ${this.internalFriend}. Proceed if you trust your ${this.internalFriend} or hide your IP by [connecting through a VPN](https://go.nordvpn.net/SH1F4).`;

	/** @see StringsService */
	public readonly p2pWarningAudioPassive = `Starting voice call (P2P).`;

	/** @see StringsService */
	public readonly p2pWarningVideoPassive = `Starting video call (P2P).`;

	/** @see StringsService */
	public readonly passwordDefaultURL = `Unspecified`;

	/** @see StringsService */
	public readonly passwordEditAborted = `Password edit aborted.`;

	/** @see StringsService */
	public readonly passwordEditContent = `Enter a new \${KEY}:`;

	/** @see StringsService */
	public readonly passwordEditFailed = `Password edit failed.`;

	/** @see StringsService */
	public readonly passwordEditSaved = `Password edit saved.`;

	/** @see StringsService */
	public readonly passwordEditTitle = `Password Manager`;

	/** @see StringsService */
	public readonly passwordKeyPassword = `password`;

	/** @see StringsService */
	public readonly passwordKeyURL = `website name or URL`;

	/** @see StringsService */
	public readonly passwordKeyUsername = `username`;

	/** @see StringsService */
	public readonly pastAppointments = `Appointment History`;

	/** @see StringsService */
	public readonly patents = `US Patents 9,906,369 et al.`;

	/** @see StringsService */
	public readonly patient = `patient`;

	/** @see StringsService */
	public readonly patientForm = `Patient Form`;

	/** @see StringsService */
	public readonly patientForms = `Patient Forms`;

	/** @see StringsService */
	public readonly patientFormsMissing = `Patient forms not submitted.`;

	/** @see StringsService */
	public readonly pin = `PIN`;

	/** @see StringsService */
	public readonly product = `${this.internalProduct}`;

	/** @see StringsService */
	public readonly productShort = `${this.internalProductShort}`;

	/** @see StringsService */
	public readonly productTelehealth = `${this.internalProductTelehealth}`;

	/** @see StringsService */
	public readonly profile = `profile`;

	/** @see StringsService */
	public readonly profileEdit = `Edit Profile`;

	/** @see StringsService */
	public readonly profileHeader = `Profile`;

	/** @see StringsService */
	public readonly profileSave = `Save Profile`;

	/** @see StringsService */
	public readonly profileVisibility = `NOT a security feature — any information in your profile should be considered public regardless. This only controls whether the Cyph client will display it.`;

	/** @see StringsService */
	public readonly queuedMessageSaved = `Queued message saved.`;

	/** @see StringsService */
	public readonly reasonForAppointment = `Reason for Appointment`;

	/** @see StringsService */
	public readonly registerErrorInitializing = `Registration form not yet initialized`;

	/** @see StringsService */
	public readonly registerErrorInviteCode = `Invalid invite code`;

	/** @see StringsService */
	public readonly registerErrorLockScreen = `Lock screen password not set`;

	/** @see StringsService */
	public readonly registerErrorMasterKey = `Master key not set`;

	/** @see StringsService */
	public readonly registerErrorName = `Name not set`;

	/** @see StringsService */
	public readonly registerErrorUsername = `Username unavailable`;

	/** @see StringsService */
	public readonly registerTitle = `Register for ${this.internalProduct}`;

	/** @see StringsService */
	public readonly reject = `reject`;

	/** @see StringsService */
	public readonly requestAppointment = `Request Appointment`;

	/** @see StringsService */
	public readonly requestFollowUpAppointment = `Request Follow-Up Appointment`;

	/** @see StringsService */
	public readonly response = `Response`;

	/** @see StringsService */
	public readonly review = `review`;

	/** @see StringsService */
	public readonly reviews = `reviews`;

	/** @see StringsService */
	public readonly s = `'s`;

	/** @see StringsService */
	public readonly save = `save`;

	/** @see StringsService */
	public readonly saveFileFailed = `Failed to save file.`;

	/** @see StringsService */
	public readonly saveUpperCase = `Save`;

	/** @see StringsService */
	public readonly search = `Search`;

	/** @see StringsService */
	public readonly selfDestructActivated = `${this.capitalize(
		this.internalSession
	)} set to self-destruct.`;

	/** @see StringsService */
	public readonly selfDestructDeactivated = `Self-destruct deactivated.`;

	/** @see StringsService */
	public readonly send = `Send`;

	/** @see StringsService */
	public readonly session = `${this.internalSession}`;

	/** @see StringsService */
	public readonly sessionComplete = `${this.internalSession[0].toUpperCase()}${this.internalSession.slice(
		1
	)} complete.`;

	/** @see StringsService */
	public readonly share = `Share`;

	/** @see StringsService */
	public readonly shareEhrData = `You are about to request data about this patient from your organization's EHR system and share it with this patient. If accepted, it will be used to auto-fill forms on their behalf. Continue?`;

	/** @see StringsService */
	public readonly shareEhrDataFailure = `Sharing medical data failed.`;

	/** @see StringsService */
	public readonly shareEhrDataSuccess = `Medical data has been shared.`;

	/** @see StringsService */
	public readonly shareEhrDataTitle = `Share Medical Data from EHR`;

	/** @see StringsService */
	public readonly shareFile = `Share File`;

	/** @see StringsService */
	public readonly signupConfirmTitle = `${this.internalProduct} Signup`;

	/** @see StringsService */
	public readonly signupFailed = `Signup failed. Please try again later.`;

	/** @see StringsService */
	public readonly signupMessage = `Enjoying the service? Join our waitlist for ${this.internalProductShort} v2! More details are on the way, but the next version of ${this.internalProductShort} will include group messaging, user accounts, and encrypted chat history.`;

	/** @see StringsService */
	public readonly speakerSwitchTitle = `Choose Speaker`;

	/** @see StringsService */
	public readonly speakerTitle = `Speaker`;

	/** @see StringsService */
	public readonly startDate = `Start Date`;

	/** @see StringsService */
	public readonly startTime = `Start Time`;

	/** @see StringsService */
	public readonly submit = `Submit`;

	/** @see StringsService */
	public readonly submitPatientForms = `Submit Patient Forms`;

	/** @see StringsService */
	public readonly suregoahead = `sure, go ahead`;

	/** @see StringsService */
	public readonly takeScreenshot = `Take Screenshot`;

	/** @see StringsService */
	public readonly teamToContact = `${this.internalCompany} Team to Contact`;

	/** @see StringsService */
	public readonly teamValediction = `- The ${this.internalCompany} Team`;

	/** @see StringsService */
	public readonly telehealthCallAbout = `Telehealth Call About`;

	/** @see StringsService */
	public readonly telehealthSearch = `Search by Doctor, Insurance, Address, etc.`;

	/** @see StringsService */
	public readonly telehealthSessionWith = `Telehealth Session with`;

	/** @see StringsService */
	public readonly timeExtended = `Added time to countdown.`;

	/** @see StringsService */
	public readonly timeZone = `Time Zone`;

	/** @see StringsService */
	public readonly titleRequired = `Title required in order to save.`;

	/** @see StringsService */
	public readonly to = `To`;

	/** @see StringsService */
	public readonly toA = `to a`;

	/** @see StringsService */
	public readonly toJoin = `to join`;

	/** @see StringsService */
	public readonly totalSpace = `Total Space Used:`;

	/** @see StringsService */
	public readonly transactionHistory = `Transaction History`;

	/** @see StringsService */
	public readonly unknown = `Unknown`;

	/** @see StringsService */
	public readonly unlock = `Unlock`;

	/** @see StringsService */
	public readonly unlockedTitle = `${this.internalProduct} Unlocked`;

	/** @see StringsService */
	public readonly unlockPassword = `unlock password`;

	/** @see StringsService */
	public readonly unlockTitle = `Unlock ${this.internalProduct}`;

	/** @see StringsService */
	public readonly untitled = `Untitled`;

	/** @see StringsService */
	public readonly upload = `Upload`;

	/** @see StringsService */
	public readonly uploadFile = `Upload File`;

	/** @see StringsService */
	public readonly uploadTooBigFailure = `File \`\${FILE}\` exceeds our current limit of \${DESKTOPLIMIT} (on desktop) / \${MOBILELIMIT} (on mobile). Sorry for the inconvenience.`;

	/** @see StringsService */
	public readonly user = `User`;

	/** @see StringsService */
	public readonly userAvatar = `User Avatar`;

	/** @see StringsService */
	public readonly usernameCapitalizationHelp = `You may change the casing of your username. For example, @johntitor could become @JohnTitor or @JOHNTITOR.`;

	/** @see StringsService */
	public readonly users = `Users`;

	/** @see StringsService */
	public readonly video = `Video`;

	/** @see StringsService */
	public readonly videoCall = `video call`;

	/** @see StringsService */
	public readonly voice = `Voice`;

	/** @see StringsService */
	public readonly waitingRoomCheckedInDoctor = `Waiting for your patient to connect.`;

	/** @see StringsService */
	public readonly waitingRoomCheckedInGeneric = `Waiting for the other party to join.`;

	/** @see StringsService */
	public readonly waitingRoomCheckedInPatient = `You're all checked in! Waiting for your doctor to connect. `;

	/** @see StringsService */
	public readonly waitingRoomNotReadyForms = `Please ensure you've submitted all required patient forms.`;

	/** @see StringsService */
	public readonly waitingRoomNotReadyTime = `It's not time to check in for your appointment yet. You can check in up to 20 minutes before your scheduled appointment.`;

	/** @see StringsService */
	public readonly warningTitle = `Warning`;

	/** @see StringsService */
	public readonly welcomeComma = `Welcome,`;

	/** @see StringsService */
	public readonly welcomeMasterKeySetup = `IMPORTANT: Confirm Your Master Key`;

	/** @see StringsService */
	public readonly welcomeToProduct = `Welcome to ${this.internalProduct}`;

	/** @see StringsService */
	public readonly youHaveNo = `You have no`;

	/** @see StringsService */
	public readonly youInvited = `You invited`;

	/** @see StringsService */
	public readonly your = `Your`;

	/** Capitalizes a string. */
	public capitalize (s: string) : string {
		return s.length < 1 ? '' : s[0].toUpperCase() + s.slice(1);
	}

	/** Replaces placeholder values in string. */
	public setParameters (
		baseString: string,
		params: Record<string, string>
	) : string {
		return Object.entries(params).reduce(
			(s, [k, v]) => s.replace(`\${${k.toUpperCase()}}`, v),
			baseString
		);
	}

	/** @see translate */
	public translate (s: string) : string {
		return translate(s);
	}

	constructor (
		/** @ignore */
		private readonly envService: EnvService
	) {
		super();

		/* eslint-disable-next-line @typescript-eslint/no-this-alias */
		const strings: {[k: string]: any} = this;

		for (const k of Object.keys(strings)) {
			const s = strings[k];
			if (typeof s !== 'string' || k.startsWith('internal')) {
				continue;
			}

			strings[k] = translate(this.customBuildStrings[k] || s);
		}
	}
}
