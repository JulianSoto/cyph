#!/bin/bash


cd $(cd "$(dirname "$0")" ; pwd)/..
dir="$PWD"
originalArgs="${*}"


cacheBustedProjects='cyph.com cyph.ws'
compiledProjects='cyph.com cyph.ws'
webSignedProject='cyph.ws'
prodOnlyProjects='nakedredirect test websign'
shortlinkProjects='im io video audio'
site=''
noSimple=''
simple=''
simpleProdBuild=''
simpleWebSignBuild=''
pack=''
environment=''
firebaseBackup=''
customBuild=''
saveBuildArtifacts=''
debug=''
debugProdBuild=''
test=true
websign=true

if [ "${1}" == '--firebase-backup' ] ; then
	firebaseBackup=true
	shift
fi

if [ "${1}" == '--prod' ] ; then
	test=''
	shift
elif [ "${1}" == '--debug-prod' ] ; then
	test=''
	debug=true
	shift
elif [ "${1}" == '--debug-prod-prod-build' ] ; then
	test=''
	debug=true
	debugProdBuild=true
	shift
elif [ "${1}" == '--simple' ] ; then
	simple=true
	shift
elif [ "${1}" == '--simple-custom-build' ] ; then
	shift
	simple=true
	customBuild="${1}"
	shift
elif [ "${1}" == '--simple-prod-build' ] ; then
	simple=true
	simpleProdBuild=true
	shift
elif [ "${1}" == '--simple-websign-build' ] ; then
	simpleWebSignBuild=true
	shift
elif [ "${1}" == '--simple-websign-prod-build' ] ; then
	simpleProdBuild=true
	simpleWebSignBuild=true
	shift
elif [ "${1}" == '--no-simple' ] ; then
	noSimple=true
	shift
fi

if [ "${1}" == '--save-build-artifacts' ] ; then
	saveBuildArtifacts=true
	shift
fi

if [ "${1}" == '--pack' ] ; then
	pack=true
	shift
fi

if [ "${1}" == '--site' ] ; then
	shift
	site="${1}"
	shift
fi

if [ "${site}" ] ; then
	for var in cacheBustedProjects compiledProjects ; do
		for d in $(eval "echo \$$var") ; do
			if [ "${d}" != "${site}" ] ; then
				eval "$var='$(eval "echo \$$var" | sed "s|$d||")'"
			fi
		done
	done

	if [ "${site}" != "${webSignedProject}" ] ; then
		websign=''
	fi
fi

if [ "${simple}" ] ; then
	websign=''
else
	cacheBustedProjects="$(echo "${cacheBustedProjects}" | sed "s|${webSignedProject}||")"
fi

if [ "${simpleWebSignBuild}" ] ; then
	simple=true
	prodOnlyProjects="$(echo "${prodOnlyProjects}" | sed 's| websign||')"
fi

if \
	( [ "${websign}" ] || [ "${simpleProdBuild}" ] ) && \
	( [ ! "${site}" ] || [ "${site}" == "${webSignedProject}" ] )
then
	pack=true
fi

if [ "${websign}" ] || [ "${site}" == 'firebase' ] ; then
	./commands/keycache.sh
fi

if [ "${compiledProjects}" ] && [ ! "${test}" ] && [ ! "${debug}" ] ; then
	./commands/lint.sh || fail
fi

log 'Initial setup'

# Branch config setup
eval "$(./commands/getgitdata.sh)"

staging=''
if [ "${branch}" == 'prod' ] ; then
	branch='staging'

	if [ "${test}" ] && [ ! "${simple}" ] ; then
		staging=true
	fi
elif [ ! "${test}" ] ; then
	fail 'Cannot do prod deploy from test branch'
fi
version="${branch}"
if [ "${test}" ] && [ "${username}" != cyph ] ; then
	version="${username}-${version}"
fi
if [ "${simple}" ] ; then
	version="simple-${version}"
fi
if [ ! "${test}" ] ; then
	version=prod
fi
if [ "${debug}" ] ; then
	if [ "${test}" ] ; then
		version="debug-${version}"
	else
		version=debug
	fi
fi

processEnvironmentName () {
	if [ "${simple}" ] && [ ! "${simpleProdBuild}" ] ; then
		echo "local$(echo "${1}" | perl -pe 's/^([a-z])/\u$1/')"
	else
		echo "${1}"
	fi
}

if [ "${firebaseBackup}" ] ; then
	if [ ! "${test}" ] ; then
		fail 'Cannot use backup Firebase environment in prod'
	fi

	environment="$(processEnvironmentName backup)"
elif [ ! "${test}" ] ; then
	if [ "${debug}" ] ; then
		environment="$(processEnvironmentName debugProd)"
	else
		environment="$(processEnvironmentName prod)"
	fi
elif \
	[ "${branch}" == 'staging' ] || \
	[ "${branch}" == 'beta' ] || \
	[ "${branch}" == 'master' ] \
; then
	environment="$(processEnvironmentName "${branch}")"
else
	environment="$(processEnvironmentName dev)"
fi

if [ "${customBuild}" ] ; then
	./commands/custombuildtoenvironment.js "${customBuild}" "${environment}" "${version}"
	checkfail
	environment='tmp'
	version="$(echo "${version}" | sed 's|^simple-||')-$(echo "${customBuild}" | tr '.' '-')"
fi


if [ ! "${simple}" ] ; then
	rm shared/assets/frozen 2> /dev/null
fi

./commands/copyworkspace.sh ~/.build
cd ~/.build

mkdir geoisp.tmp
cd geoisp.tmp
wget "https://download.maxmind.com/app/geoip_download?edition_id=GeoIP2-ISP&suffix=tar.gz&license_key=$(
	cat ~/.cyph/maxmind.key
)" -O geoisp.tar.gz
tar xzf geoisp.tar.gz
mv */*.mmdb GeoIP2-ISP.mmdb
if [ ! -f GeoIP2-ISP.mmdb ] ; then
	fail 'GeoIP2-ISP.mmdb missing'
fi
mv GeoIP2-ISP.mmdb ../backend/
cd ..
rm -rf geoisp.tmp

# Secret credentials
cat ~/.cyph/backend.vars >> backend/app.yaml
cat ~/.cyph/test.vars >> test/test.yaml
cp ~/.cyph/GeoIP2-Country.mmdb backend/
if [ "${branch}" == 'staging' ] ; then
	echo '  PROD: true' >> backend/app.yaml
	cat ~/.cyph/backend.vars.prod >> backend/app.yaml
else
	cat ~/.cyph/backend.vars.sandbox >> backend/app.yaml
fi

projectname () {
	if [ "${simple}" ] || [ "${1}" == 'cyph.com' ] ; then
		echo "${version}-dot-$(echo "${1}" | tr '.' '-')-dot-cyphme.appspot.com"
	elif [ "${test}" ] || [ "${debug}" ] ; then
		echo "${version}.${1}"
	else
		echo "${1}"
	fi
}

package="$(projectname cyph.ws)"


if [ -d test ] ; then
	sed -i "s|setOnerror()|$(cat test/setonerror.js | tr '\n' ' ')|g" test/test.js
fi

if [ ! "${simple}" ] || [ "${simpleProdBuild}" ] ; then
	cd websign
	node -e "
		fs.writeFileSync(
			'websign.yaml',
			fs.readFileSync('websign.yaml').toString().
				replace(/\n/g, '☁').
				replace(/([^☁]+SUBRESOURCE.*?☁☁)/, yaml =>
					fs.readFileSync('appcache.appcache').toString().
						split('CACHE:')[1].
						split('NETWORK:')[0].
						replace(/\n\//g, '\n').
						split('\n').
						filter(s => s.trim() && s !== 'unsupportedbrowser').
						map(subresource => yaml.replace(/SUBRESOURCE/g, subresource)).
						join('')
				).
				replace(/☁/g, '\n')
		)
	"
	cd ..

	defaultHeadersString='# default_headers'
	defaultHeaders="$(cat shared/headers)"
	ls */*.yaml | xargs -I% sed -ri "s/  ${defaultHeadersString}(.*)/\
		headers=\"\$(cat shared\/headers)\" ; \
		for header in \1 ; do \
			headers=\"\$(echo \"\$headers\" | grep -v \$header:)\" ; \
		done ; \
		echo \"\$headers\" \
	/ge" %
	ls */*.yaml | xargs -I% sed -i 's|###| |g' %

	defaultCSPString='DEFAULT_CSP'
	fullCSP="$(cat shared/csp | tr -d '\n')"
	webSignCSP="$(cat websign/csp | tr -d '\n')"
	cyphComCSP="$(cat shared/csp | tr -d '\n' | sed 's|frame-src|frame-src https://*.facebook.com https://*.braintreegateway.com|g' | sed 's|connect-src|connect-src blob:|g')"
	ls cyph.com/*.yaml | xargs -I% sed -i "s|${defaultCSPString}|\"${cyphComCSP}\"|g" %
	ls */*.yaml | xargs -I% sed -i "s|${defaultCSPString}|\"${webSignCSP}\"|g" %
	sed -i "s|${defaultCSPString}|${fullCSP}|g" shared/js/cyph/env-deploy.ts

	# Expand connect-src and frame-src on wpstatic pages to support social media widgets and stuff

	wpstaticCSPSources="$(cat cyph.com/wpstaticcsp | perl -pe 's/^(.*)$/https:\/\/\1 https:\/\/*.\1/g' | tr '\n' ' ')"

	cat cyph.com/cyph-com.yaml |
		tr '\n' '☁' |
		perl -pe 's/(\/PATH.*?connect-src )(.*?frame-src )(.*?connect-src )(.*?frame-src )(.*?connect-src )(.*?frame-src )/\1☼\2☼\3☼\4☼\5☼\6☼/g' |
		sed "s|☼|${wpstaticCSPSources}|g" |
		perl -pe 's/(\/PATH\/\(\.\*\?\/amp\)\[\/\]\?.*?connect-src )/\1https:\/\/google-analytics.com /g' |
		perl -pe 's/(\/PATH\/\(\.\*\?\/amp\)\[\/\]\?.*?connect-src )/\1https:\/\/*.google-analytics.com /g' |
		perl -pe 's/(\/PATH\/\(\.\*\?\/amp\)\[\/\]\?.*?font-src )/\1https:\/\/fonts.googleapis.com /g' |
		perl -pe 's/(\/PATH\/\(\.\*\?\/amp\)\[\/\]\?.*?font-src )/\1https:\/\/fonts.gstatic.com /g' |
		perl -pe 's/(\/PATH\/\(\.\*\?\/amp\)\[\/\]\?.*?style-src )/\1https:\/\/cdn.ampproject.org /g' |
		perl -pe 's/(\/PATH\/\(\.\*\?\/amp\)\[\/\]\?.*?style-src )/\1https:\/\/fonts.googleapis.com /g' |
		perl -pe 's/(\/PATH\/\(\.\*\?\/amp\)\[\/\]\?.*?script-src )/\1https:\/\/cdn.ampproject.org /g' |
		tr '☁' '\n' |
		sed "s|Cache-Control: private, max-age=31536000|Cache-Control: public, max-age=31536000|g" \
	> cyph.com/new.yaml
	mv cyph.com/new.yaml cyph.com/cyph-com.yaml
fi

defaultHost='${locationData.protocol}//${locationData.hostname}:'
simpleWebSignPackageName=''
homeURL=''

if [ "${test}" ] ; then
	newCyphURL="https://${version}.cyph.ws"

	if [ "${simple}" ] ; then
		newCyphURL="https://${version}-dot-cyph-ws-dot-cyphme.appspot.com"
	fi
	if [ "${simpleWebSignBuild}" ] ; then
		simpleWebSignPackageName="$(echo "${newCyphURL}" | perl -pe 's/^.*?:\/\///')"
		newCyphURL="https://${version}-dot-websign-dot-cyphme.appspot.com"
	fi

	if [ "${simpleProdBuild}" ] ; then
		sed -i 's|useBaseUrl: boolean\s*= .*;|useBaseUrl: boolean = true;|g' shared/js/cyph/env-deploy.ts
	fi

	sed -i "s|staging|${version}|g" backend/config.go
	sed -i "s|http://localhost:42000|https://${version}-dot-cyphme.appspot.com|g" backend/config.go
	ls */*.yaml shared/js/cyph/env-deploy.ts | xargs -I% sed -i "s|api.cyph.com|${version}-dot-cyphme.appspot.com|g" %
	ls */*.yaml shared/js/cyph/env-deploy.ts | xargs -I% sed -i "s|www.cyph.com|${version}-dot-cyph-com-dot-cyphme.appspot.com|g" %
	sed -i "s|${defaultHost}42000|https://${version}-dot-cyphme.appspot.com|g" shared/js/cyph/env-deploy.ts
	sed -i "s|${defaultHost}42001|https://${version}-dot-cyph-com-dot-cyphme.appspot.com|g" shared/js/cyph/env-deploy.ts
	sed -i "s|${defaultHost}42002|${newCyphURL}|g" shared/js/cyph/env-deploy.ts
	sed -i "s|CYPH-IM|https://${version}-dot-cyph-im-dot-cyphme.appspot.com|g" shared/js/cyph/env-deploy.ts
	sed -i "s|CYPH-IO|https://${version}-dot-cyph-io-dot-cyphme.appspot.com|g" shared/js/cyph/env-deploy.ts
	sed -i "s|CYPH-ME|https://${version}-dot-cyph-me-dot-cyphme.appspot.com|g" shared/js/cyph/env-deploy.ts
	sed -i "s|CYPH-VIDEO|https://${version}-dot-cyph-video-dot-cyphme.appspot.com|g" shared/js/cyph/env-deploy.ts
	sed -i "s|CYPH-AUDIO|https://${version}-dot-cyph-audio-dot-cyphme.appspot.com|g" shared/js/cyph/env-deploy.ts

	homeURL="https://${version}-dot-cyph-com-dot-cyphme.appspot.com"

	# Disable caching in test environments
	if [ ! "${staging}" ] ; then
		ls */*.yaml | xargs -I% sed -i 's|max-age=31536000|max-age=0|g' %
	fi

	# if [ "${simple}" ] ; then
	# 	for yaml in `ls */cyph*.yaml` ; do
	# 		cat $yaml | perl -pe 's/(- url: .*)/\1\n  login: admin/g' > $yaml.new
	# 		mv $yaml.new $yaml
	# 	done
	# fi
else
	echo > shared/js/standalone/test-environment-setup.ts

	if [ "${debug}" ] ; then
		homeURL='https://debug-dot-cyph-com-dot-cyphme.appspot.com'

		sed -i "s|${defaultHost}42002|https://debug.cyph.ws|g" shared/js/cyph/env-deploy.ts
		sed -i "s|CYPH-IM|https://debug.cyph.ws|g" shared/js/cyph/env-deploy.ts
		sed -i "s|CYPH-IO|https://debug.cyph.ws/#io|g" shared/js/cyph/env-deploy.ts
		sed -i "s|CYPH-ME|https://debug.cyph.ws/#account|g" shared/js/cyph/env-deploy.ts
		sed -i "s|CYPH-VIDEO|https://debug.cyph.ws/#video|g" shared/js/cyph/env-deploy.ts
		sed -i "s|CYPH-AUDIO|https://debug.cyph.ws/#audio|g" shared/js/cyph/env-deploy.ts
	else
		homeURL='https://www.cyph.com'

		sed -i "s|${defaultHost}42002|https://cyph.ws|g" shared/js/cyph/env-deploy.ts
		sed -i "s|CYPH-IM|https://cyph.im|g" shared/js/cyph/env-deploy.ts
		sed -i "s|CYPH-IO|https://cyph.io|g" shared/js/cyph/env-deploy.ts
		sed -i "s|CYPH-ME|https://cyph.me|g" shared/js/cyph/env-deploy.ts
		sed -i "s|CYPH-VIDEO|https://cyph.video|g" shared/js/cyph/env-deploy.ts
		sed -i "s|CYPH-AUDIO|https://cyph.audio|g" shared/js/cyph/env-deploy.ts
	fi

	sed -i "s|http://localhost:42000|https://api.cyph.com|g" backend/config.go
	sed -i "s|${defaultHost}42000|https://api.cyph.com|g" shared/js/cyph/env-deploy.ts
	sed -i "s|${defaultHost}42001|${homeURL}|g" shared/js/cyph/env-deploy.ts
fi

if [ ! "${simple}" ] ; then
	sed -i "s|${defaultHost}43000/root/||g" shared/js/cyph/env-deploy.ts
fi

if [ -d nakedredirect ] ; then
	cp backend/config.go nakedredirect/
fi


# wpstatic + cache busting
waitingForWpstatic=''
if [ "${cacheBustedProjects}" ] ; then
	waitingForWpstatic=true
	bash -c "
		touch .wpstatic.output

		if [ '${websign}' ] ; then
			while [ ! -f .build.done ] ; do sleep 1 ; done
		fi

		if [ ! '${simple}' ] && ( [ ! '${site}' ] || [ '${site}' == cyph.com ] ) ; then
			rm -rf wpstatic 2> /dev/null
			mkdir -p wpstatic/blog
			cp cyph.com/cyph-com.yaml wpstatic/
			cd wpstatic/blog
			../../commands/wpstatic.sh '${homeURL}' >> ../../.wpstatic.output 2>&1
			cd ../..
		fi

		while [ ! -f .build.done ] ; do sleep 1 ; done
		rm .build.done
		if [ -d wpstatic ] ; then
			mv wpstatic/* cyph.com/
			rmdir wpstatic
		fi

		# Cache bust
		log 'Cache bust' >> .wpstatic.output 2>&1
		for d in ${cacheBustedProjects} ; do
			if [ ! -d \"\${d}\" ] ; then
				continue
			fi
			cd \"\${d}\"
			../commands/cachebust.js >> ../.wpstatic.output 2>&1
			cd ..
		done

		touch .wpstatic.done
	" &
fi


# WebSign project
if [ ! "${site}" ] || ( [ "${site}" == websign ] || [ "${site}" == "${webSignedProject}" ] ) ; then
	cd websign

	if [ ! "${simple}" ] ; then
		rm js/keys.test.js
		websignHashWhitelist="$(cat hashwhitelist.json)"
	else
		mv js/keys.test.js js/keys.js

		sed -i "s|location\.host\s*= .*;||g" js/main.js
		sed -i "s|location\.host|'${simpleWebSignPackageName}'|g" js/main.js
		sed -i "s|cdnUrlBase +|cdnUrlBase + 'websign/test/' +|" js/main.js
		sed -i "s|localStorage\.webSignWWWPinned|true|g" js/main.js
		sed -i "s|true\s*= true;||g" js/main.js

		websignHashWhitelist="{\"$(../commands/websign/bootstraphash.sh)\": true}"
	fi

	cp -rf ../shared/favicon.ico ../shared/assets/img ./
	../commands/websign/pack.js index.html index.html
	cd ..
fi


if [ "${customBuild}" ] ; then
	mv cyph.com cyph.com.src
fi

# Compile + translate + minify
if [ "${compiledProjects}" ] ; then
	./commands/buildunbundledassets.sh $(
		if [ "${simple}" ] || ( [ "${debug}" ] && [ ! "${debugProdBuild}" ] ) ; then
			if [ "${simpleProdBuild}" ] ; then
				echo '--prod-test --service-worker'
			else
				echo '--test'
			fi
		fi
	) || fail

	./commands/ngassets.sh

	rm -rf "${dir}/shared/assets"
	cp -a shared/assets "${dir}/shared/"
	touch shared/assets/frozen
fi
for d in $compiledProjects ; do
	if [ ! -d "${d}" ] ; then
		log "Skip $(projectname "${d}")"
		continue
	fi

	log "Build $(projectname "${d}")"

	cd "${d}"

	if [ "${websign}" ] && [ "${d}" == "${webSignedProject}" ] ; then
		# Merge in base64'd images, fonts, video, and audio
		../commands/websign/subresourceinline.js ../pkg/cyph.ws-subresources
	fi

	node -e 'console.log(`
		/* tslint:disable */

		(<any> self).translations = ${JSON.stringify(
			require("../commands/translations").translations
		)};
	`.trim())' > src/js/standalone/translations.ts

	if \
		( [ "${debug}" ] && [ ! "${debugProdBuild}" ] ) || \
		( [ "${simple}" ] && [ ! "${simpleProdBuild}" ] ) \
	; then
		ng build --source-map false --configuration "${environment}" || fail
	else
		../commands/prodbuild.sh --configuration "${environment}" || fail

		if [ "${simple}" ] && [ ! "${simpleWebSignBuild}" ] ; then
			ls dist/*.js | xargs -I% uglifyjs % -bo %
		fi
	fi

	if [ "${d}" == 'cyph.com' ] ; then node -e '
		const $	= require("cheerio").load(fs.readFileSync("dist/index.html").toString());

		$(`link[href="/assets/css/loading.css"]`).replaceWith(`<style>${
			fs.readFileSync("dist/assets/css/loading.css").toString()
		}</style>`);

		$("script").each((_, elem) => $(elem).attr("defer", ""));

		/*
		$(`link[rel="stylesheet"]`).each((_, elem) => {
			const $elem			= $(elem);
			const $stylesheet	= $("<stylesheet></stylesheet>");
			$stylesheet.attr("src", $elem.attr("href"));
			$elem.replaceWith($stylesheet);
		});
		*/

		fs.writeFileSync("dist/index.html", $.html().trim());
	' ; fi

	mv *.html *.yaml sitemap.xml dist/ 2> /dev/null
	findmnt -t overlay -o TARGET -lun | grep "^${PWD}" | xargs sudo umount

	cd ..

	mv "${d}" "${d}.src"
	mv "${d}.src/dist" "${d}"
done
touch .build.done


# WebSign packaging
if [ "${pack}" ] ; then
	log "Pack ${package}"

	cd "${webSignedProject}"

	# Merge imported libraries into threads
	find . -type f -name '*.js' | xargs -I% ../commands/websign/threadpack.js % || fail

	../commands/websign/pack.js --sri --minify index.html ../pkg/cyph.ws

	cd ..
fi
if [ "${websign}" ] ; then
	log "WebSign ${package}"

	./commands/updaterepos.js
	cp -rf ~/.cyph/repos/cdn ./

	customBuilds=''

	if [ "${username}" == 'cyph' ] && [ "${branch}" == 'staging' ] && [ ! "${debug}" ] ; then
		./commands/websign/custombuilds.js pkg/cyph.ws pkg "${version}"
		checkfail
		customBuilds="$(cat pkg/custombuilds.list)"
		rm pkg/custombuilds.list
	fi

	packages="${package} ${customBuilds}"

	if [ "${test}" ] || [ "${debug}" ] ; then
		mv pkg/cyph.ws "pkg/${package}"
	fi

	for p in ${packages} ; do
		rm -rf cdn/${p}
	done

	notify 'Starting signing process'

	./commands/websign/codesign.js \
		$(if [ "${simple}" ] ; then echo '--test' ; fi) \
		"${websignHashWhitelist}" \
		$(
			for p in ${packages} ; do
				echo -n "pkg/${p}=cdn/${p} "
			done
		) \
	|| fail

	log 'Compressing resources for deployment to CDN'

	if [ -d pkg/cyph.ws-subresources ] ; then
		find pkg/cyph.ws-subresources -type f -not -name '*.srihash' -print0 | xargs -0 -P4 -I% bash -c ' \
			zopfli -i1000 %; \
			brotli -Zk %; \
		'
	fi

	if [ -d pkg/cyph.ws-subresources ] ; then
		cp -a pkg/cyph.ws-subresources/* cdn/${package}/

		for customBuild in ${customBuilds} ; do
			cd cdn/${customBuild}
			for subresource in $(ls ../../pkg/cyph.ws-subresources | grep -vP '\.(css|js)$') ; do
				ln -s ../${package}/${subresource} ${subresource}
				chmod 700 ${subresource}
				git add ${subresource}
			done
			git commit -S -m "${customBuild}" . &> /dev/null
			cd ../..
		done
	fi

	cd cdn

	for p in ${packages} ; do
		if [ "${simple}" ] ; then
			mkdir -p websign/test
			rm -rf websign/test/${p} 2> /dev/null
			mv ${p} websign/test/
			cd websign/test
		fi

		plink=$(echo ${p} | sed 's/\.ws$//')
		if (echo ${p} | grep -P '\.ws$' > /dev/null) && ! [ -L ${plink} ] ; then
			ln -s ${p} ${plink}
			chmod 700 ${plink}
			git add ${plink}
			git commit -S -m ${plink} ${plink} &> /dev/null
		fi

		cp ${p}/current ${p}/pkg.srihash

		find ${p} -type f -not \( -name '*.srihash' -or -name '*.gz' -or -name '*.br' \) -exec bash -c ' \
			if [ ! -f {}.gz ] ; then \
				zopfli -i1000 {}; \
				brotli -Zk {}; \
			fi; \
			chmod 700 {}.gz {}.br; \
			git add {}.gz {}.br; \
			git commit -S -m "$(cat {}.srihash 2> /dev/null || date +%s)" {}.gz {}.br > /dev/null 2>&1; \
		' \;

		if [ "${simple}" ] ; then
			cd ../..
		fi
	done

	git push
	cd ..

	# Publish internal prod branch to public repo
	if [ ! "${test}" ] && [ ! "${debug}" ] ; then
		git remote add public git@github.com:cyph/cyph.git 2> /dev/null
		git push public HEAD:master
	fi
fi

# WebSign redirects
if [ ! "${simple}" ] ; then
	for suffix in ${shortlinkProjects} ; do
		d="cyph.${suffix}"
		project="cyph-${suffix}"

		# Special case for cyph.im to directly redirect to cyph.ws instead of cyph.ws/#im
		if [ "${suffix}" == 'im' ] ; then suffix='' ; fi

		mkdir "${d}"
		cat cyph.ws/cyph-ws.yaml | sed "s|cyph-ws|${project}|g" > "${d}/${project}.yaml"
		./commands/websign/createredirect.sh "${suffix}" "${d}" "${package}" "${test}"
	done
fi


# Firebase deployment
if ( [ ! "${site}" ] || [ "${site}" == 'firebase' ] ) && [ ! "${simple}" ] && [ ! "${debug}" ] ; then
	if [ ! "${test}" ] ; then
		firebaseProjects='cyphme'
	else
		firebaseProjects='cyph-test cyph-test2 cyph-test-e2e cyph-test-local'
		if [ "${environment}" != 'dev' ] ; then
			firebaseProjects="${firebaseProjects} cyph-test-${branch}"
		fi

		# Workaround for https://stackoverflow.com/q/50513374/459881
		cat firebase/functions/index.js |
			tr '\n' '☁' |
			perl -pe 's/exports\.itemRemoved\s.*?exports\./exports\./g' |
			tr '☁' '\n' \
		> firebase/functions/index.new.js
		mv firebase/functions/index.new.js firebase/functions/index.js
	fi

	./commands/buildunbundledassets.sh
	./commands/updaterepos.js

	cd firebase

	sed -i "s|DOMAIN|namespace$(
		{ echo cyph.ws; ls ~/.cyph/repos/custom-builds; } |
			sed 's/[^\.]//g' |
			sort |
			tail -n1 |
			sed "s|\.|.replace('_', '.')|g"
	)|g" database.rules.json
	
	sed -i "s|DOMAIN|namespace.split('_').join('.')|g" storage.rules

	cd functions

	node -e 'fs.writeFileSync("namespaces.js", `module.exports = ${JSON.stringify(
		require("glob").sync(`${os.homedir()}/.cyph/repos/custom-builds/*/config.json`).
			map(path => ({
				domain: path.split("/").slice(-2)[0],
				...JSON.parse(fs.readFileSync(path).toString())
			})).
			filter(o => !o.usePrimaryNamespace).
			reduce(
				(namespaces, {accountsOnly, domain}) => {
					namespaces[domain]	= {
						accountsURL: `https://${domain}/#${accountsOnly ? "" : "account/"}`,
						domain
					};
					namespaces[domain.replace(/\./g, "_")]	= namespaces[domain];
					return namespaces;
				},
				{
					"cyph.ws": {accountsURL: "https://cyph.me/#", domain: "cyph.me"},
					"cyph_ws": {accountsURL: "https://cyph.me/#", domain: "cyph.me"}
				}
			)
	)};`)'

	npm install
	cp ../../modules/database-service.js ~/.cyph/email-credentials.js ./
	html-minifier --collapse-whitespace --minify-css --remove-comments email.html -o email.html

	# Temporary workaround for Cloud Functions using an outdated Node.js LTS
	for f in *.js ; do mv "${f}" "$(echo "${f}" | sed 's|\.js$|.ts|')" ; done
	for f in *.ts ; do tsc "${f}" &> /dev/null ; done
	rm *.ts

	cp -rf ../../shared/assets/js ./
	cd ..

	for firebaseProject in ${firebaseProjects} ; do
		firebase use --add "${firebaseProject}"
		firebase functions:config:set project.id="${firebaseProject}"
		gsutil cors set storage.cors.json "gs://${firebaseProject}.appspot.com"
		firebase deploy
	done

	rm -rf functions/node_modules functions/package-lock.json
	cd ..
fi

if [ "${debug}" ] ; then
	rm -rf ${prodOnlyProjects} backend
elif [ "${test}" ] ; then
	rm -rf ${prodOnlyProjects}
fi

if [ "${waitingForWpstatic}" ] ; then
	while true ; do
		cat .wpstatic.output
		echo -n > .wpstatic.output
		if [ -f .wpstatic.done ] ; then
			break
		fi
		sleep 1
	done
	rm .wpstatic.done .wpstatic.output
fi

if [ "${simpleWebSignBuild}" ] ; then
	rm -rf "${webSignedProject}" 2> /dev/null
fi

gcloudDeploy () {
	gcloud app deploy --quiet --no-promote --project cyphme --version "${version}" "${@}"
}

if [ "${site}" != 'firebase' ] ; then
	mv test .test 2> /dev/null

	gcloudDeploy $(
		if [ "${site}" ] ; then
			ls ${site}/*.yaml 2> /dev/null

			if [ "${websign}" ] && [ -d websign ] ; then
				ls websign/*.yaml
			fi
		else
			ls */*.yaml | grep -v '\.src/'
		fi
		if [ ! "${test}" ] && [ ! "${debug}" ] ; then
			echo dispatch.yaml
		fi
	)

	mv .test test 2> /dev/null
	# if [ -d test ] && ( [ ! "${site}" ] || [ "${site}" == 'test' ] ) ; then
	# 	gcloud app services delete --quiet --project cyphme test
	# 	gcloudDeploy test/*.yaml
	# fi
fi

cd "${dir}"

if [ "${saveBuildArtifacts}" ] ; then rm -rf .build 2> /dev/null ; fi

if [ ! "${noSimple}" ] && [ "${test}" ] && [ ! "${simple}" ] && [ "${site}" != 'firebase' ] ; then
	mv ~/.build ~/.build.original
	./commands/deploy.sh --simple $originalArgs
elif [ "${saveBuildArtifacts}" ] && [ -d ~/.build.original ] ; then
	mv ~/.build  ~/.build.original/simplebuild
	cp -rf ~/.build.original .build
elif [ "${saveBuildArtifacts}" ] ; then
	cp -rf ~/.build ./
fi
