#!/bin/bash


cd $(cd "$(dirname "$0")" ; pwd)/..
dir="$PWD"


./commands/keycache.sh

mkdir -p ~/lib/js ~/tmplib/js
cd ~/tmplib/js


read -r -d '' modules <<- EOM
	@agm/core
	@angular/animations
	@angular/cdk
	@angular/cdk-experimental
	@angular/cli
	@angular/common
	@angular/compiler
	@angular/compiler-cli
	@angular/core
	@angular/elements
	@angular/flex-layout
	@angular/forms
	@angular/http
	@angular/material
	@angular/platform-browser
	@angular/platform-browser-dynamic
	@angular/platform-server
	@angular/platform-webworker
	@angular/platform-webworker-dynamic
	@angular/router
	@angular/service-worker
	@angular/tsc-wrapped
	@angular-devkit/architect
	@angular-devkit/architect-cli
	@angular-devkit/build-ng-packagr
	@angular-devkit/core
	@angular-devkit/build-angular
	@angular-devkit/build-optimizer
	@angular-devkit/build-webpack
	@angular-devkit/schematics
	@angular-devkit/schematics-cli
	@asymmetrik/ngx-leaflet
	@compodoc/compodoc
	@covalent/core
	@covalent/dynamic-forms
	@covalent/highlight
	@covalent/http
	@covalent/markdown
	@firebase/app
	@firebase/app-types
	@firebase/auth
	@firebase/auth-types
	@firebase/database
	@firebase/database-types
	@firebase/firestore
	@firebase/firestore-types
	@firebase/functions
	@firebase/functions-types
	@firebase/messaging
	@firebase/messaging-types
	@firebase/storage
	@firebase/storage-types
	@google-cloud/storage
	@ngrx/core
	@ngrx/effects
	@ngrx/router-store
	@ngrx/store
	@ngrx/store-devtools
	@ngtools/webpack
	@ngxs/devtools-plugin
	@ngxs/logger-plugin
	@ngxs/storage-plugin
	@ngxs/store
	@opentok/client
	@types/braintree-web
	@types/dompurify
	@types/dropzone
	@types/file-saver
	@types/fullcalendar@3.5.2
	@types/html-to-text
	@types/jasmine
	@types/jquery
	@types/jspdf
	@types/lodash-es
	@types/long
	@types/markdown-it
	@types/msgpack-lite
	@types/node
	@types/pdfjs-dist
	@types/pdfkit
	@types/quill
	@types/stacktrace-js
	@yaga/leaflet-ng2
	angular-infinite-list
	angular-material-clock-time-picker
	angular-speed-dial
	angular-ssr
	angular2-cool-infinite-grid
	angular2-template-loader
	angular2-text-mask
	angular2-virtual-scroll
	animate.css@https://github.com/daneden/animate.css
	animated-scroll-to
	awesome-typescript-loader
	babel-core
	babel-loader
	babel-preset-env
	babel-preset-es2015
	bourbon@4.2.7
	braintree-web
	braintree-web-drop-in
	check-tslint-all
	cheerio
	clean-css-cli
	clipboard-polyfill
	codelyzer
	comlinkjs
	copy-webpack-plugin
	core-js
	crypto-browserify
	css-loader
	d3
	datauri
	dompurify
	dope-qr
	dragula
	dropzone
	extract-text-webpack-plugin
	fast-crc32c
	faye-websocket
	fg-loadcss
	file-loader
	file-saver
	firebase
	firebase-admin
	firebase-functions
	firebase-server
	firebase-tools
	fullcalendar@3.6.1
	glob
	google-closure-compiler
	granim
	gulp
	hammerjs
	highlight.js
	html-loader
	html-minifier
	html-to-text
	html-webpack-plugin
	htmlencode
	htmllint
	image-type
	interact.js
	jasmine-core@2
	jasmine-spec-reporter
	jquery
	jquery.appear@https://github.com/morr/jquery.appear
	jspdf
	karma
	karma-chrome-launcher
	karma-cli
	karma-coverage-istanbul-reporter
	karma-jasmine
	karma-jasmine-html-reporter@0
	konami-code.js
	lazy
	leaflet
	libsodium@https://github.com/jedisct1/libsodium.js
	libsodium-sumo@https://github.com/jedisct1/libsodium.js
	libsodium-wrappers@https://github.com/jedisct1/libsodium.js
	libsodium-wrappers-sumo@https://github.com/jedisct1/libsodium.js
	localforage
	lodash-es
	long
	lunr
	lz4
	markdown-it
	markdown-it-emoji
	markdown-it-sup
	math-expression-evaluator
	mceliece
	microlight-string
	mkdirp
	moment
	msgpack-lite
	mustache
	nativescript
	nativescript-angular
	nativescript-css-loader
	nativescript-dev-typescript
	nativescript-dev-webpack
	nativescript-theme-core
	ng-fullcalendar
	ng-packagr
	ng2-fittext
	ng2-pdf-viewer
	ng2-truncate
	ngx-image-cropper
	ngx-infinite-scroll
	node-fetch
	node-sass
	notify-cli
	ntru
	od-virtualscroll
	opentok
	parchment
	pdfjs-dist
	pdfkit
	prepack
	prepack-webpack-plugin
	primeng
	protobufjs
	protractor
	puppeteer
	quill
	quill-delta
	quill-delta-to-html
	raw-loader
	read
	readable-stream
	reflect-metadata
	request
	resize-observer-polyfill
	resolve-url-loader
	retire
	rlwe
	rsvp
	rxjs
	rxjs-tslint
	rxjs-tslint-rules
	sass-loader
	script-ext-html-webpack-plugin
	sidh
	simple-peer
	simplebtc
	simplewebrtc
	sodiumutil
	sphincs
	stacktrace-js
	style-loader
	stylelint
	stylelint-scss
	supersphincs
	tab-indent
	text-mask-addons
	textillate
	tns-android
	tns-core-modules
	tns-core-modules-widgets
	tns-ios
	tns-platform-declarations
	to-markdown
	ts-loader
	ts-node
	tslint
	tslint-eslint-rules
	tslint-immutable
	tslint-microsoft-contrib
	tsutils
	typedoc
	typescript@2.9
	u2f-api-polyfill
	uglify-es
	uglifyjs-webpack-plugin
	unsemantic
	url-loader
	web-animations-js
	webpack
	webpack-cli
	webpack-closure-compiler
	webpack-dev-server
	webpack-sources
	webrtc-adapter
	webrtcsupport
	whatwg-fetch
	wowjs
	xkcd-passphrase
	zombie
	zone.js
	$(cat ${dir}/native/plugins.list)
EOM


# Temporary workaround for flat dependencies pending https://github.com/yarnpkg/yarn/issues/1658
#
# cd ..
# yarn add semver
# cd -
#
# echo {} > package.json
#
# script -fc "
# 	while true ; do
# 		answer=\"\$(node -e '
# 			const semver			= require(\"semver\");
# 
# 			const modules			= \`${modules}\`;
# 
# 			const getPinnedVersion	= package =>
# 				(modules.match(new RegExp(
# 					\`(^|\\\\s+)\${package}@((\\\\d|\\\\.)+)(\n|\$)\`
# 				)) || [])[2]
# 			;
#
# 			console.log(
# 				(
# 					fs.readFileSync(\"yarn.out\").
# 						toString().
# 						split(\"Unable to find a suitable version\").
# 						slice(1)
# 				).map(section => (
# 					section.match(/\"[^\\n]+\" which resolved to \"[^\\n]+\"/g) || []
# 				).
# 					map((s, i) => {
# 						const split			= s.split(\"\\\"\");
# 						const version		= split[3];
# 						const pinnedVersion	= getPinnedVersion(split[1].split(\"@\")[0]);
#
# 						return {
# 							index: i + 1,
# 							isPinned: !!pinnedVersion && semver.satisfies(version, pinnedVersion),
# 							version
# 						};
# 					}).
# 					reduce(
# 						(a, b) =>
# 							a.isPinned && !b.isPinned ?
# 								a :
# 							b.isPinned && !a.isPinned ?
# 								b :
# 							semver.gt(a.version, b.version) ?
# 								a :
# 								b
# 						,
# 						{index: \"1\", version: \"0.0.0\"}
# 					).index
# 				).reduce(
# 					(a, b) => a ? \`\${a}\\n\${b}\` : b,
# 					\"\"
# 				)
# 			);
# 		')\"
#
# 		if [ \"\${answer}\" ] ; then
# 			echo > yarn.out
# 			echo \"\${answer}\"
# 		fi
#
# 		if [ \"\$(cat yarn.out | grep -P 'Done in \d+' 2> /dev/null)\" ] ; then
# 			break
# 		fi
# 	done | bash -c '
# 		yarn add \
# 			--flat \
# 			--ignore-engines \
# 			--ignore-platform \
# 			--ignore-scripts \
# 			--non-interactive \
# 			$(echo "${modules}" | tr '\n' ' ') \
# 		|| \
# 			touch yarn.failure
# 	'
# " yarn.out
#
# if [ -f yarn.failure ] ; then
# 	fail
# fi

yarn add \
	--ignore-engines \
	--ignore-platform \
	--ignore-scripts \
	--non-interactive \
	$(echo "${modules}" | tr '\n' ' ') \
|| \
	fail

rm -rf ../node_modules ../package.json ../yarn.lock yarn.failure yarn.out 2> /dev/null


cp yarn.lock package.json ~/lib/js/

cat node_modules/tslint/package.json | grep -v tslint-test-config-non-relative > package.json.new
mv package.json.new node_modules/tslint/package.json


cd "${dir}"
rm -rf shared/lib
mv ~/lib shared/
rm -rf ~/tmplib

./commands/getlibs.sh
./commands/commit.sh --gc "${@}" updatelibs
