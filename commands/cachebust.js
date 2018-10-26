#!/usr/bin/env node


const fs			= require('fs');
const glob			= require('glob');
const superSphincs	= require('supersphincs');


(async () => {


const files				= glob.sync('**', {nodir: true});
const filesToCacheBust	= files.filter(path => !path.endsWith('index.html'));
const filesToModify		= files.filter(path => path.endsWith('.html') || path.endsWith('.js'));

const fileContents		= {};
const cacheBustedFiles	= {};


for (let file of filesToModify) {
	await new Promise((resolve, reject) => fs.readFile(file, (err, data) => {
		try {
			fileContents[file]	= data.toString();
			resolve();
		}
		catch (_) {
			reject(err);
		}
	}));

	let content	= fileContents[file];

	for (let subresource of filesToCacheBust) {
		if (content.indexOf(subresource) < 0) {
			continue;
		}

		cacheBustedFiles[subresource]	= true;

		const hash	= (await superSphincs.hash(fs.readFileSync(subresource))).hex;
		content		= content.replace(
			new RegExp(subresource + '(?!\.map)', 'g'),
			(s, i) => `${s}${content.slice(i - 2, i).match(/[a-zA-Z0-9_\-]/) ? '' : `?${hash}`}`
		);
	}

	if (content !== fileContents[file]) {
		fileContents[file]	= content;
		fs.writeFileSync(file, content);
	}
}


})().catch(err => {
	console.error(err);
	process.exit(1);
});
