#!/bin/bash


dir="$PWD"
cd $(cd "$(dirname "$0")" ; pwd)/..


customBuild=''
firebaseBackup=''
noLockDown=''
e2e=''
localSeleniumServer=''
site=''
prod=''
prodBuild=''
environment='local'
if [ "${1}" == '--environment' ] ; then
	shift
	environment="${1}"
	shift
fi
if [ "${1}" == '--e2e' ] ; then
	e2e=true
	shift
fi
if [ "${1}" == '--firebase-backup' ] ; then
	firebaseBackup=true
	shift
fi
if [ "${1}" == '--no-lock-down' ] ; then
	noLockDown='--no-lock-down'
	shift
fi
if [ "${1}" == '--prod' ] ; then
	prod=true
	shift
fi
if [ "${1}" == '--prod-build' ] ; then
	prodBuild=true
	shift
fi
if [ "${1}" == '--local-selenium-server' ] ; then
	localSeleniumServer=true
	shift
fi
if [ "${1}" == '--custom-build' ] ; then
	shift
	customBuild="${1}"
	shift
fi
if [ "${1}" == 'cyph.ws' ] || [ "${1}" == 'cyph.com' ] ; then
	site="${1}"
	shift
fi
args="${@}"

if [ "${e2e}" ] && [ ! "${site}" ] ; then
	fail 'Must specify a site when serving with --e2e'
fi

if [ "${firebaseBackup}" ] ; then
	environment='localBackup'
elif [ "${e2e}" ] ; then
	environment='e2e'
elif [ "${prod}" ] ; then
	environment='prod'
fi

if [ "${localSeleniumServer}" ] ; then
	log 'On the host OS, run `java -jar selenium-server-standalone-$VERSION.jar -role hub`'
fi

if [ "${customBuild}" ] ; then
	./commands/custombuildtoenvironment.js "${customBuild}" "${environment}" '' "${noLockDown}"
	checkfail
	environment='tmp'
fi


ngserve () {
	ngserveInternal () {
		if [ "${e2e}" ] ; then
			ng e2e \
				$(if [ "${localSeleniumServer}" ] ; then
					echo '--protractor-config protractor.local-selenium-server.js'
				fi) \
				"${@}"
		else
			ng serve \
				--configuration "${environment}" \
				--live-reload false \
				--source-map false \
				--public-host "localhost:${port}" \
				$(if [ "${prodBuild}" ] ; then echo '--watch false' ; fi) \
				"${@}"
		fi
	}

	project="${1}"
	shift
	port="${1}"
	shift

	cd "${project}"
	../commands/ngprojectinit.sh
	echo -e '\n\n\n'
	ngserveInternal \
		--host '0.0.0.0' \
		--port "${port}" \
		$(if [ "${prodBuild}" ] ; then
			../commands/prodbuild.sh --no-build |
				grep -vP '(build-optimizer|extract-css|extract-licenses|named-chunks|output-hashing)'
		fi) \
		$(if [ -f /windows ] ; then echo '--poll 1000' ; fi) \
		${args} \
		"${@}"
}


# node /node_modules/.bin/firebase-server -p 44000 &

cp -f backend/app.yaml backend/.build.yaml

# Braintree, Prefinery, and Twilio unsupported in CircleCI for now, until needed
if [ ! "${CIRCLECI}" ] ; then
	cat ~/.cyph/backend.vars >> backend/.build.yaml
	if [ "${prod}" ] ; then
		echo '  PROD: true' >> backend/.build.yaml
		cat ~/.cyph/backend.vars.prod >> backend/.build.yaml
	else
		cat ~/.cyph/backend.vars.sandbox >> backend/.build.yaml
	fi
fi

mkdir -p /tmp/cyph0/search_indexes
dev_appserver.py \
	--skip_sdk_update_check \
	--port 42000 \
	--admin_port 6000 \
	--host 0.0.0.0 \
	--storage_path /tmp/cyph0 \
	--support_datastore_emulator=True \
	backend/.build.yaml \
&

./commands/buildunbundledassets.sh \
	$(if [ ! "${CIRCLECI}" ] && [ ! "${prodBuild}" ] ; then echo -n '--test' ; fi)

./commands/ngassets.sh

log 'Starting ng serve'

for arr in 'cyph.ws 42002' 'cyph.com 42001' ; do
	read -ra arr <<< "${arr}"

	if [ ! "${site}" ] || [ "${site}" == "${arr[0]}" ] ; then
		if [ "${e2e}" ] ; then
			ngserve "${arr[0]}" "${arr[1]}"
			exit $?
		else
			ngserve "${arr[0]}" "${arr[1]}" &
			sleep 60
		fi
	fi
done

sleep Infinity
