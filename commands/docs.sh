#!/bin/bash


cd $(cd "$(dirname "$0")" ; pwd)/..
dir="$PWD"


./commands/copyworkspace.sh ~/docs
cd ~/docs/cyph.app

rm -rf src/js/cyph.com src/js/native "${dir}/docs"

compodoc \
	-n 'Cyph Docs' \
	-p src/tsconfig.app.json \
	--disablePrivate \
	--disableProtected \
	--disableInternal

mv documentation "${dir}/docs"
