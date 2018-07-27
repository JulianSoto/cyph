#!/bin/bash


cd $(cd "$(dirname "$0")" ; pwd)/..
dir="$DIR"


if [ "${CIRCLECI}" ] && [ "${CIRCLE_PROJECT_USERNAME}" != cyph ] && ( \
	[ "${CIRCLE_BRANCH}" == master ] || \
	[ "${CIRCLE_BRANCH}" == beta ] || \
	[ "${CIRCLE_BRANCH}" == prod ]
) ; then
	pass 'Skipping build'
fi


if [ "${1}" != '--angular-only' ] ; then
	cd backend
	go build
	checkfail
	cd ..

	output="$(./commands/buildunbundledassets.sh 2>&1)"
	checkfail "${output}"

	./commands/lint.sh
	checkfail
else
	./commands/protobuf.sh
fi

projects='cyph.com cyph.ws'

log 'Starting Angular AOT build'
for d in ${projects} ; do
	cd "${d}"
	../commands/ngprojectinit.sh
	cd ..
done
./commands/ngassets.sh
for d in ${projects} ; do
	cd "${d}"
	ng build --aot true
	checkfail
	cd ..
done

pass
