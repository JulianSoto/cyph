package main

import (
	"regexp"
	"time"
)

type none struct{}

// BetaSignup : Data of user in waitlist
type BetaSignup struct {
	Comment         string
	Country         string
	Email           string
	Invited         bool
	Language        string
	Name            string
	PrefineryID     int
	Referer         string
	Time            int64
	UsernameRequest string
}

// BurnerChannel : Burner channel
type BurnerChannel struct {
	ChannelID string
	ID        string
	Timestamp int64
}

// Customer : Customer with API key
type Customer struct {
	APIKey          string
	AppStoreReceipt string `datastore:",noindex"`
	BraintreeID     string
	Company         string
	Email           string
	LastSession     int64
	Name            string
	Namespace       string
	SessionCount    int64
	SignupURL       string
	Timestamp       int64
}

// CustomerEmail : Mapping of email address to API key
type CustomerEmail struct {
	APIKey string
	Email  string
}

// IPFSGatewayData : Data on an IPFS gateway
type IPFSGatewayData struct {
	ContinentCode string
	URL           string
}

// IPFSGatewayUptimeCheckData : Data on whether a gateway is working
type IPFSGatewayUptimeCheckData struct {
	Result    bool
	Timestamp int64
}

// IPFSGatewayUptimeData : Data used to check whether a gateway is working
type IPFSGatewayUptimeData struct {
	IntegrityHash string
	IPFSHash      string
}

// PackageData : Data for an application package
type PackageData struct {
	Package   interface{}
	Timestamp int64
	Uptime    IPFSGatewayUptimeData
}

// Plan : Braintree plan
type Plan struct {
	AccountsPlan      string
	GiftPack          bool
	Price             int64
	ProFeatures       map[string]bool
	SessionCountLimit int64
}

// PreAuthorizedCyph : Representation of an approved usage of the API
type PreAuthorizedCyph struct {
	ID          string
	ProFeatures []byte
	Timestamp   int64
}

// RedoxAuth : Current Redox auth data
type RedoxAuth struct {
	AccessToken  string
	Expires      int64
	RefreshToken string
	RedoxAPIKey  string
}

// RedoxCredentials : Redox credentials
type RedoxCredentials struct {
	APIKey       string
	MasterAPIKey string
	RedoxAPIKey  string
	RedoxSecret  string
	Username     string
}

// RedoxRequestLog : Log of a Redox request
type RedoxRequestLog struct {
	RedoxCommand string
	Response     string
	Timestamp    int64
	Username     string
}

var empty = struct{}{}

var config = struct {
	AllowedCyphIDs                *regexp.Regexp
	AllowedCyphIDLength           int
	AllowedHeaders                string
	AllowedMethods                string
	AllowedHosts                  map[string]none
	AnalID                        string
	APIKeyByteLength              int
	BitPayToken                   string
	BurnerChannelExpiration       int64
	CacheControlHeader            string
	CloudFunctionRoutes           []string
	ContinentFirebaseRegions      map[string]string
	Continents                    map[string]none
	DefaultContinent              string
	DefaultContinentCode          string
	DefaultContinentCodeBackup    string
	DefaultFirebaseRegion         string
	DefaultLanguageCode           string
	DefaultPackage                string
	DummyAnalID                   string
	DummyCity                     string
	DummyContinent                string
	DummyContinentCode            string
	DummyCountry                  string
	DummyCountryCode              string
	DummyPostalCode               string
	DummyOrg                      string
	EmailAddress                  string
	FirebaseProjects              []string
	FirebaseRegions               []string
	HPKPHeader                    string
	HSTSHeader                    string
	IPFSGatewayUptimeCheckTimeout time.Duration
	IPFSGatewayUptimeCheckTTL     int64
	MaxChannelDescriptorLength    int
	MaxSignupValueLength          int
	NewCyphTimeout                int64
	PartnerConversionURL          string
	PartnerDiscountRate           int64
	PlanAppleIDs                  map[string]string
	Plans                         map[string]Plan
	RootURL                       string
}{
	AllowedCyphIDs: regexp.MustCompile("[A-Za-z0-9_-]+$"),

	AllowedCyphIDLength: 7,

	AllowedHeaders: "Access-Control-Request-Method,Authorization,X-Forwarded-For",

	AllowedMethods: "GET,HEAD,POST,PUT,DELETE,OPTIONS",

	AllowedHosts: map[string]none{
		"cyph.com":                     empty,
		"www.cyph.com":                 empty,
		"cyph.ws":                      empty,
		"www.cyph.ws":                  empty,
		"cyph.app":                     empty,
		"www.cyph.app":                 empty,
		"cyph.im":                      empty,
		"www.cyph.im":                  empty,
		"cyph.me":                      empty,
		"www.cyph.me":                  empty,
		"cyph.video":                   empty,
		"www.cyph.video":               empty,
		"cyph.audio":                   empty,
		"www.cyph.audio":               empty,
		"api.cyph.com":                 empty,
		"cyphdbyhiddenbhs.onion":       empty,
		"www.cyphdbyhiddenbhs.onion":   empty,
		"im.cyphdbyhiddenbhs.onion":    empty,
		"me.cyphdbyhiddenbhs.onion":    empty,
		"video.cyphdbyhiddenbhs.onion": empty,
		"audio.cyphdbyhiddenbhs.onion": empty,
		"api.cyphdbyhiddenbhs.onion":   empty,
		"prod-dot-default-dot-cyphme.appspot.com":       empty,
		"staging-dot-cyph-com-dot-cyphme.appspot.com":   empty,
		"staging-dot-cyph-ws-dot-cyphme.appspot.com":    empty,
		"staging-dot-cyph-app-dot-cyphme.appspot.com":   empty,
		"staging-dot-cyph-im-dot-cyphme.appspot.com":    empty,
		"staging-dot-cyph-me-dot-cyphme.appspot.com":    empty,
		"staging-dot-cyph-video-dot-cyphme.appspot.com": empty,
		"staging-dot-cyph-audio-dot-cyphme.appspot.com": empty,
		"staging-dot-cyphme.appspot.com":                empty,
		"localhost:43000":                               empty,
		"localhost:8080":                                empty,
	},

	AnalID: "UA-56220601-1",

	APIKeyByteLength: 16,

	BitPayToken: "CsLk78BjUj81tBENkNpZxoPFGJWWss5qsga86xDKFWBR",

	BurnerChannelExpiration: 172800000,

	CacheControlHeader: "no-cache",

	CloudFunctionRoutes: []string{
		"acceptPseudoRelationship",
		"appointmentInvite",
		"burnerInvite",
		"checkInviteCode",
		"downgradeAccount",
		"generateInvite",
		"getBraintreeSubscriptionID",
		"getCastleSessionID",
		"getReactions",
		"getUserToken",
		"openUserToken",
		"register",
		"rejectPseudoRelationship",
		"requestPseudoRelationship",
		"resetCastleSessionID",
		"sendAppLink",
		"sendInvite",
		"setContact",
		"usernameBlacklisted",
		"userNotify",
	},

	ContinentFirebaseRegions: map[string]string{
		"af": "europe-west1",
		/* "an": "us-central1", */
		"as": "asia-northeast1",
		"eu": "europe-west1",
		"na": "us-central1",
		"oc": "australia-southeast1",
		"sa": "southamerica-east1",
	},

	Continents: map[string]none{
		"af": empty,
		/* "an": empty, */
		"as": empty,
		"eu": empty,
		"na": empty,
		"oc": empty,
		"sa": empty,
	},

	DefaultContinent: "Europe",

	DefaultContinentCode: "eu",

	DefaultContinentCodeBackup: "na",

	DefaultFirebaseRegion: "us-central1",

	DefaultLanguageCode: "en",

	DefaultPackage: "cyph.app",

	DummyAnalID: "1027213",

	DummyCity: "McLean",

	DummyContinent: "North America",

	DummyContinentCode: "na",

	DummyCountry: "United States",

	DummyCountryCode: "us",

	DummyPostalCode: "22103",

	DummyOrg: "Legion of Doom",

	EmailAddress: "Cyph <hello@cyph.com>",

	FirebaseProjects: []string{
		"cyphme",
		"cyph-test-beta",
		"cyph-test-e2e",
		"cyph-test-local",
		"cyph-test-master",
		"cyph-test-staging",
		"cyph-test",
		"cyph-test2",
	},

	FirebaseRegions: []string{
		"asia-northeast1",
		"australia-southeast1",
		"europe-west1",
		"southamerica-east1",
		"us-central1",
	},

	HPKPHeader: "max-age=5184000; pin-sha256=\"unPe8YYMLOhkaAWcjfFF1q571QqcrI5NUfP+0eBT/po=\"; pin-sha256=\"Hw4WoLZDs5AprzDc7tUWz8FDbWw/luIQq+FL03zozsw=\"; preload",

	HSTSHeader: "max-age=31536000; includeSubdomains; preload",

	IPFSGatewayUptimeCheckTimeout: time.Millisecond * time.Duration(1500),

	IPFSGatewayUptimeCheckTTL: int64(600),

	MaxChannelDescriptorLength: 150,

	/* Max length of a valid email address, but also happened
	to seem like a sane limit for the other values */
	MaxSignupValueLength: 256,

	/* Reasonable threshold beyond which Alice is unlikely to
	still be waiting for Bob */
	NewCyphTimeout: 2629800000,

	PartnerConversionURL: "https://partner-api.cyph.com",

	PartnerDiscountRate: 20,

	PlanAppleIDs: map[string]string{
		"MonthlyPlatinum": "8-4",
	},

	Plans: map[string]Plan{
		"0-0": Plan{
			ProFeatures: map[string]bool{
				"disableP2P":     true,
				"modestBranding": true,
				"nativeCrypto":   true,
				"telehealth":     true,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"3-3": Plan{
			AccountsPlan: "MonthlyTelehealth",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     true,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"3-4": Plan{
			AccountsPlan: "AnnualTelehealth",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     true,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"3-5": Plan{
			AccountsPlan: "MonthlyTelehealth",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     true,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"3-6": Plan{
			AccountsPlan: "AnnualTelehealth",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     true,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"3-7": Plan{
			AccountsPlan: "MonthlyTelehealth",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     true,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"3-8": Plan{
			AccountsPlan: "AnnualTelehealth",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     true,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"3-9": Plan{
			AccountsPlan: "MonthlyTelehealth",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     true,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"3-10": Plan{
			AccountsPlan: "AnnualTelehealth",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     true,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"4-1": Plan{
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"4-2": Plan{
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"4-3": Plan{
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"4-4": Plan{
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"5-1": Plan{
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": true,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"5-2": Plan{
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": true,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"8-0": Plan{
			AccountsPlan: "MonthlyPremium",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"8-1": Plan{
			AccountsPlan: "AnnualPremium",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"8-2": Plan{
			AccountsPlan: "MonthlyTelehealth",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     true,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"8-3": Plan{
			AccountsPlan: "AnnualTelehealth",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     true,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"8-4": Plan{
			AccountsPlan: "MonthlyPlatinum",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"8-5": Plan{
			AccountsPlan: "AnnualPlatinum",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"8-6": Plan{
			AccountsPlan: "MonthlySupporter",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"8-7": Plan{
			AccountsPlan: "AnnualSupporter",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"8-8": Plan{
			AccountsPlan: "MonthlyBusiness",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"8-9": Plan{
			AccountsPlan: "AnnualBusiness",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"10-1": Plan{
			AccountsPlan: "LifetimePlatinum",
			Price:        10000,
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"11-1": Plan{
			AccountsPlan: "MonthlyBusiness",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"11-2": Plan{
			AccountsPlan: "AnnualBusiness",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"11-3": Plan{
			AccountsPlan: "MonthlyBusiness",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"11-4": Plan{
			AccountsPlan: "AnnualBusiness",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"11-5": Plan{
			AccountsPlan: "MonthlyBusiness",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"11-6": Plan{
			AccountsPlan: "AnnualBusiness",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"11-7": Plan{
			AccountsPlan: "MonthlyBusiness",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"11-8": Plan{
			AccountsPlan: "AnnualBusiness",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"12-0": Plan{
			AccountsPlan: "AnnualSupporter",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"12-1": Plan{
			AccountsPlan: "MonthlyPlatinum",
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"13-1": Plan{
			AccountsPlan: "[{\"plan\": \"AnnualSupporter\", \"quantity\": 10, \"trialMonths\": 18}]",
			GiftPack:     true,
			Price:        1500,
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"13-2": Plan{
			AccountsPlan: "[{\"plan\": \"AnnualPremium\", \"quantity\": 5, \"trialMonths\": 30}]",
			GiftPack:     true,
			Price:        4500,
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"13-3": Plan{
			AccountsPlan: "[{\"plan\": \"AnnualPlatinum\", \"quantity\": 2, \"trialMonths\": 42}]",
			GiftPack:     true,
			Price:        15000,
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
		"13-4": Plan{
			AccountsPlan: "[{\"plan\": \"AnnualSupporter\", \"quantity\": 10, \"trialMonths\": 18}, {\"plan\": \"AnnualPremium\", \"quantity\": 5, \"trialMonths\": 30}, {\"plan\": \"AnnualPlatinum\", \"quantity\": 2, \"trialMonths\": 42}]",
			GiftPack:     true,
			Price:        17500,
			ProFeatures: map[string]bool{
				"disableP2P":     false,
				"modestBranding": false,
				"nativeCrypto":   false,
				"telehealth":     false,
				"video":          true,
				"voice":          true,
			},
			SessionCountLimit: -1,
		},
	},

	RootURL: "http://localhost:42000",
}
