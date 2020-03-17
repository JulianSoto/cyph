import {CyphPlans, CyphPlanTypes} from '../proto';

interface IPlanTypeConfig {
	enableGroup: boolean;
	enablePasswords: boolean;
	enableWallets: boolean;
	initialInvites?: number;
	innerCircleLimit?: number;
	planType: CyphPlanTypes;
	rank: number;
	storageCapGB: number;
	telehealth: boolean;
	unlimitedCalling: boolean;
	usernameMinLength: number;
}

const planTypeConfig: Record<CyphPlanTypes, IPlanTypeConfig> = {
	[CyphPlanTypes.FoundersAndFriends]: {
		enableGroup: true,
		enablePasswords: true,
		enableWallets: true,
		planType: CyphPlanTypes.FoundersAndFriends,
		rank: 4,
		storageCapGB: 1024,
		telehealth: false,
		unlimitedCalling: true,
		usernameMinLength: 1
	},
	[CyphPlanTypes.Free]: {
		enableGroup: false,
		enablePasswords: false,
		enableWallets: false,
		initialInvites: 2,
		innerCircleLimit: 5,
		planType: CyphPlanTypes.Free,
		rank: 0,
		storageCapGB: 0.5,
		telehealth: false,
		unlimitedCalling: false,
		usernameMinLength: 5
	},
	[CyphPlanTypes.Platinum]: {
		enableGroup: true,
		enablePasswords: true,
		enableWallets: true,
		planType: CyphPlanTypes.Platinum,
		rank: 3,
		storageCapGB: 1024,
		telehealth: false,
		unlimitedCalling: true,
		usernameMinLength: 1
	},
	[CyphPlanTypes.Premium]: {
		enableGroup: true,
		enablePasswords: false,
		enableWallets: false,
		planType: CyphPlanTypes.Premium,
		rank: 2,
		storageCapGB: 100,
		telehealth: false,
		unlimitedCalling: true,
		usernameMinLength: 5
	},
	[CyphPlanTypes.Supporter]: {
		enableGroup: true,
		enablePasswords: false,
		enableWallets: false,
		innerCircleLimit: 15,
		planType: CyphPlanTypes.Supporter,
		rank: 1,
		storageCapGB: 5,
		telehealth: false,
		unlimitedCalling: false,
		usernameMinLength: 5
	},
	[CyphPlanTypes.Telehealth]: {
		enableGroup: true,
		enablePasswords: false,
		enableWallets: false,
		planType: CyphPlanTypes.Telehealth,
		rank: 2,
		storageCapGB: 100,
		telehealth: true,
		unlimitedCalling: true,
		usernameMinLength: 5
	}
};

/** Configuration options for Cyph plans. */
export const planConfig: Record<
	CyphPlans,
	IPlanTypeConfig & {
		checkoutPath?: string;
		lifetime: boolean;
	}
> = {
	[CyphPlans.AnnualPlatinum]: {
		...planTypeConfig[CyphPlanTypes.Platinum],
		checkoutPath: 'accounts/annual-platinum',
		lifetime: false
	},
	[CyphPlans.AnnualPremium]: {
		...planTypeConfig[CyphPlanTypes.Premium],
		checkoutPath: 'accounts/annual-premium',
		lifetime: false
	},
	[CyphPlans.AnnualSupporter]: {
		...planTypeConfig[CyphPlanTypes.Supporter],
		checkoutPath: 'accounts/annual-supporter',
		lifetime: false
	},
	[CyphPlans.AnnualTelehealth]: {
		...planTypeConfig[CyphPlanTypes.Telehealth],
		checkoutPath: 'accounts/annual-telehealth',
		lifetime: false
	},
	[CyphPlans.FoundersAndFriends]: {
		...planTypeConfig[CyphPlanTypes.FoundersAndFriends],
		lifetime: true
	},
	[CyphPlans.Free]: {
		...planTypeConfig[CyphPlanTypes.Free],
		lifetime: false
	},
	[CyphPlans.LifetimePlatinum]: {
		...planTypeConfig[CyphPlanTypes.Platinum],
		lifetime: true
	},
	[CyphPlans.MonthlyPlatinum]: {
		...planTypeConfig[CyphPlanTypes.Platinum],
		checkoutPath: 'accounts/monthly-platinum',
		lifetime: false
	},
	[CyphPlans.MonthlyPremium]: {
		...planTypeConfig[CyphPlanTypes.Premium],
		checkoutPath: 'accounts/monthly-premium',
		lifetime: false
	},
	[CyphPlans.MonthlySupporter]: {
		...planTypeConfig[CyphPlanTypes.Supporter],
		checkoutPath: 'accounts/monthly-supporter',
		lifetime: false
	},
	[CyphPlans.MonthlyTelehealth]: {
		...planTypeConfig[CyphPlanTypes.Telehealth],
		checkoutPath: 'accounts/monthly-telehealth',
		lifetime: false
	}
};
