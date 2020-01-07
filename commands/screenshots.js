#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer');

const credentials = {
	password: fs
		.readFileSync(`${os.homedir()}/.cyph/screenshotmasterkey`)
		.toString()
		.trim(),
	username: 'WizardOfLoneliness',
	usernameAlt: 'bonedaddy'
};

const resolutions = [
	{name: 'mac', viewport: {height: 1800, isMobile: false, width: 2880}},
	{name: 'desktop', viewport: {height: 1642, isMobile: false, width: 2878}},
	{
		name: 'desktop-alt',
		viewport: {height: 1600, isMobile: false, width: 2560}
	},
	{name: 'ios129', viewport: {height: 2732, isMobile: false, width: 2048}},
	{name: 'ios65', viewport: {height: 2688, isMobile: true, width: 1242}},
	{name: 'ios55', viewport: {height: 2208, isMobile: true, width: 1242}},
	{
		name: 'mobile',
		viewport: {height: 1100 * 2, isMobile: true, width: 550 * 2}
	},
	{
		name: 'mobile-alt',
		viewport: {height: 788 * 2, isMobile: true, width: 380 * 2}
	}
];

const screenshotDir = '/cyph/screenshots';
const screenshotEnv = 'https://staging.cyph.app';

const click = async (page, selector) => {
	await page.waitForSelector(selector);
	await page.evaluate(selector => {
		document.querySelector(selector).click();
	}, selector);
};

const setViewport = async (page, viewport) => {
	const deviceScaleFactor = viewport.width > 1000 ? 2 : 1;

	if (viewport.isMobile) {
		await page.setUserAgent(
			'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.88 Mobile Safari/537.36'
		);
	}

	await page.setViewport({
		...viewport,
		deviceScaleFactor,
		hasTouch: viewport.isMobile,
		height: viewport.height / deviceScaleFactor,
		width: viewport.width / deviceScaleFactor
	});
};

const logIn = async (username, isMobile) => {
	const browser = await puppeteer.launch({
		args: ['--enable-font-antialiasing', '--font-render-hinting=none'],
		headless: true
	});

	const page = await browser.newPage();

	page.setDefaultTimeout(0);
	page.setDefaultNavigationTimeout(0);

	await setViewport(
		page,
		resolutions.find(o => o.viewport.isMobile === isMobile).viewport
	);
	await page.goto(screenshotEnv);

	await page.waitForSelector('[name="cyphUsername"]');
	await page.type('[name="cyphUsername"]', username);
	await click(page, 'button[routerlink="login"]');
	await page.waitForSelector('[name="masterKey"]');
	await page.type('[name="masterKey"]', credentials.password);
	await click(page, 'button[type="submit"]');

	if (!isMobile) {
		await page.waitForSelector('img[alt="Profile Picture"]');
	}

	await page.waitForSelector(
		'cyph-account-contact:nth-of-type(2) img[alt="User Avatar"]'
	);

	return {browser, page};
};

const openChat = async page => {
	await click(page, 'cyph-account-contact:nth-of-type(2) mat-card');
	await page.waitForSelector(
		'[data-message-id="987ed37d79b66977b32af77459677bc2b43e8ff7cda055af7a46a2638a6212b8c646446b70d38c96972c4f0218d87fdcce2a8460a306340ae40028f45d9fe2bc8af2fe0c"] cyph-markdown'
	);
	await click(page, '.spoiler-message');
	await page.waitForSelector('img.media-message');
};

const toggleMobileMenu = async (page, isMobile) => {
	if (!isMobile) {
		return;
	}

	await click(page, '.header button[aria-label="Menu"]');
};

const takeScreenshot = async (page, isMobile, screenshotName) => {
	for (const {name, viewport} of resolutions.filter(
		o => o.viewport.isMobile === isMobile
	)) {
		await setViewport(page, viewport);
		await page.screenshot({
			path: `${screenshotDir}/${name}/${screenshotName}.png`
		});
	}
};

const generateScreenshots = async () => {
	if (fs.existsSync(screenshotDir)) {
		throw new Error(`${screenshotDir} already exists.`);
	}

	fs.mkdirSync(screenshotDir);
	for (const {name} of resolutions) {
		fs.mkdirSync(`${screenshotDir}/${name}`);
	}

	for (const isMobile of [false, true]) {
		const {browser, page} = await logIn(credentials.username, isMobile);

		await page.waitForSelector(
			'cyph-account-contact:nth-of-type(4) img[alt="User Avatar"]'
		);
		await takeScreenshot(page, isMobile, 'profile');

		if (isMobile) {
			await toggleMobileMenu(page, isMobile);
			await takeScreenshot(page, isMobile, 'menu');
			await toggleMobileMenu(page, isMobile);
		}

		await openChat(page);
		await takeScreenshot(page, isMobile, 'chat');

		for (const {name, route} of [
			{name: 'anonymous-inbox', route: 'inbox'},
			{name: 'files', route: 'files'},
			{name: 'notes', route: 'notes'}
		]) {
			await toggleMobileMenu(page, isMobile);
			await click(page, `[routerlink="/${route}"]`);
			await takeScreenshot(page, isMobile, name);

			await click(page, 'mat-row:first-of-type, mat-card:first-of-type');
			await page.waitForSelector(
				'[mattooltip="Back"], [mattooltip="Close"]'
			);
			await new Promise(resolve => setTimeout(resolve, 5000));
			await takeScreenshot(page, isMobile, `${name}-open`);
			await click(page, '[mattooltip="Back"], [mattooltip="Close"]');
		}

		await browser.close();

		const {browser: browserAlt, page: pageAlt} = await logIn(
			credentials.usernameAlt,
			isMobile
		);

		await openChat(pageAlt);
		await takeScreenshot(pageAlt, isMobile, 'chat-alt');

		await browserAlt.close();
	}
};

if (require.main === module) {
	(async () => {
		console.log(await generateScreenshots());
		process.exit(0);
	})().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
else {
	module.exports = {generateScreenshots};
}
