import {IFile} from '../ifile';
import {IQuillDelta} from '../iquill-delta';
import {
	IAccountMessagingGroup,
	IAppointment,
	IEhrApiKey,
	IForm,
	IRedoxPatient,
	IWallet
} from '../proto/types';

/** Any type of account "file". */
export type AccountFile =
	| IAccountMessagingGroup
	| IAppointment
	| IEhrApiKey
	| IFile
	| IForm
	| IQuillDelta
	| IQuillDelta[]
	| IRedoxPatient
	| IWallet
	| File;
