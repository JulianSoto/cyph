#!/usr/bin/env node


const firebase						= require('firebase-admin');
const fs							= require('fs');
const os							= require('os');
const databaseService				= require('../modules/database-service');
const {BooleanProto, StringProto}	= require('../modules/proto');
const {readableID, toInt}			= require('../modules/util');


const addInviteCode	= async (projectId, countByUser, namespace) => {


if (typeof projectId !== 'string' || projectId.indexOf('cyph') !== 0) {
	throw new Error('Invalid Firebase project ID.');
}
if (typeof namespace !== 'string' || !namespace) {
	namespace	= 'cyph.ws';
}


const configDir		= `${os.homedir()}/.cyph`;
const keyFilename	= `${configDir}/firebase-credentials/${projectId}.json`;


const {
	auth,
	database,
	getItem,
	removeItem,
	setItem,
	storage
}	= databaseService({
	firebase: {
		credential: firebase.credential.cert(JSON.parse(fs.readFileSync(keyFilename).toString())),
		databaseURL: `https://${projectId}.firebaseio.com`
	},
	project: {id: projectId},
	storage: {keyFilename, projectId}
});


const inviteCodes	= Object.keys(countByUser).map(username => ({
	codes: new Array(countByUser[username]).fill('').map(() => readableID(15)),
	username
}));

await Promise.all(inviteCodes.map(async ({codes, username}) =>
	Promise.all(codes.map(async code =>
		Promise.all([
			database.ref(`${namespace.replace(/\./g, '_')}/inviteCodes/${code}`).set(username),
			setItem(namespace, `users/${username}/inviteCodes/${code}`, BooleanProto, true)
		])
	))
));

return inviteCodes.reduce(
	(o, {codes, username}) => {
		o[username]	= codes;
		return o;
	},
	{}
);


};


if (require.main === module) {
	(async () => {
		const projectId			= process.argv[2];
		const username			= process.argv[3];
		const count				= toInt(process.argv[4]);
		const namespace			= process.argv[5];
		const countByUser		= {};
		countByUser[username]	= isNaN(count) ? 1 : count;

		console.log(JSON.stringify(await addInviteCode(projectId, countByUser, namespace)));
		process.exit(0);
	})().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
else {
	module.exports	= {addInviteCode};
}
