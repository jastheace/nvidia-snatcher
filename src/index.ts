import {Stores} from './store/model';
import {adBlocker} from './adblocker';
import {config} from './config';
import {fetchLinks} from './store/fetch-links';
import {getSleepTime} from './util';
import {logger} from './logger';
import puppeteer from 'puppeteer-extra';
import resourceBlock from 'puppeteer-extra-plugin-block-resources';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import {tryLookupAndLoop} from './store';

puppeteer.use(stealthPlugin());
if (config.browser.lowBandwidth) {
	puppeteer.use(resourceBlock({
		blockedTypes: new Set(['image', 'font'])
	}));
} else {
	puppeteer.use(adBlocker);
}

/**
 * Starts the bot.
 */
async function main() {
	if (Stores.length === 0) {
		logger.error('✖ no stores selected', Stores);
		return;
	}

	const args: string[] = [];

	// Skip Chromium Linux Sandbox
	// https://github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md#setting-up-chrome-linux-sandbox
	if (config.browser.isTrusted) {
		args.push('--no-sandbox');
		args.push('--disable-setuid-sandbox');
	}

	// Add the address of the proxy server if defined
	if (config.proxy.address) {
		args.push(`--proxy-server=http://${config.proxy.address}:${config.proxy.port}`);
	}

	// Check for deprecated configuration values
	if (process.env.MAX_PRICE) {
		logger.warn('ℹ MAX_PRICE is deprecated, please use MAX_PRICE_$[series]');
	}

	const browser = await puppeteer.launch({
		args,
		defaultViewport: {
			height: config.page.height,
			width: config.page.width
		},
		headless: config.browser.isHeadless
	});

	const promises = [];
	for (const store of Stores) {
		logger.debug('store links', {meta: {links: store.links}});
		if (store.setupAction !== undefined) {
			store.setupAction(browser);
		}

		if (store.linksBuilder) {
			promises.push(fetchLinks(store, browser));
		}

		setTimeout(tryLookupAndLoop, getSleepTime(), browser, store);
	}

	await Promise.all(promises);
}

/**
 * Will continually run until user interferes.
 */
try {
	void main();
} catch (error) {
	logger.error('✖ something bad happened, resetting nvidia-snatcher', error);
	void main();
}
