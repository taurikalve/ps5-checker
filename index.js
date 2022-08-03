process.title = 'ps5-checker';
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const pptr = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { range } = require('./utils');

const hourRange = new Set([...range(6, 23), 0]);
const intervalHours = 4;
const estimatedPrice = 450;
const estimatedPriceMax = 650;
const sites = {
  Telia: 'https://pood.telia.ee/mangukonsoolid',
  Euronics: 'https://www.euronics.ee/meelelahutus/mangukonsoolid/playstation',
  Tele2: 'https://tele2.ee/pood/mangurile',
  Elisa: 'https://www.elisa.ee/seadmed/eraklient/konsoolid',
  Miterassa:
    'https://www.miterassa.ee/sonycenter/et/e-pood/gaming/mangukonsoolid-1/',
  Arvutitark: 'https://arvutitark.ee/est/Otsing?q=ps5&cat=83',
};
const logFile = 'log';

pptr.use(StealthPlugin());
async function scraper() {
  let browser,
    // page,
    results = [];

  // make sure browser is cleaned up on interruption
  process.on('SIGINT', async () => {
    await browser?.close();
    process.exit();
  });

  try {
    browser = await pptr.launch();

    await Promise.all(
      Object.entries(sites).map(async ([site, url]) => {
        console.log(site, 'started');
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 965 });

        await page.goto(url, { waitUntil: 'networkidle2' });
        await page.waitForTimeout(10000); // 10s

        switch (site) {
          case 'Telia':
            products = await page.$$eval('.product-card__title-name', (nodes) =>
              nodes.map((node) =>
                node.innerText.toLowerCase().includes('playstation'),
              ),
            );
            break;
          case 'Euronics':
            products = await page.$$eval(
              '.product-card__list article',
              (nodes) =>
                nodes.map((node) =>
                  node
                    .getAttribute('data-product-name')
                    .toLowerCase()
                    .includes('playstation'),
                ),
            );
            break;
          case 'Tele2':
            products = await page.$$eval(
              '.catalog-item div[data-test="fullPrice"]',
              (nodes, estimatedPrice) =>
                nodes.map(
                  (node) => parseFloat(node.innerText) > estimatedPrice,
                ),
              estimatedPrice,
            );
            break;
          case 'Elisa':
            products = await page.$$eval(
              '.products-list__item span[data-test-id="secondary-price"]',
              (nodes, estimatedPrice) =>
                nodes.map(
                  (node) => parseFloat(node.innerText) > estimatedPrice,
                ),
              estimatedPrice,
            );
            break;
          case 'Miterassa':
            products = await page.$$eval(
              '.products-list li .price span',
              (nodes, estimatedPrice) =>
                nodes.map(
                  (node) => parseFloat(node.innerText) > estimatedPrice,
                ),
              estimatedPrice,
            );
            break;
          case 'Arvutitark':
            products = await page.$$eval(
              '.products-list li .pricecontainer .price:not([style])',
              (nodes) =>
                nodes.map(
                  (node, estimatedPriceMax) =>
                    parseFloat(node.innerText) < estimatedPriceMax,
                ),
              estimatedPriceMax,
            );
            break;
        }
        const productsBool = products.includes(true);
        if (productsBool) results.push(site);
        console.log(site, productsBool);
      }),
    );

    if (results.length) {
      results = results.join(', ');
      await execPromise(`notify-send -u critical "PS5 Leitud!!!" "${results}"`);
    } else {
      results = 'pole';
    }
    await execPromise(`echo "$(date) - ${results}" >> ${__dirname}/${logFile}`);
  } catch (err) {
    console.error(err);
  } finally {
    await browser?.close();
  }
}

let lastTime;
function checkTime(h) {
  let intervalLast = lastTime + intervalHours;

  if (intervalLast >= 24) {
    intervalLast = intervalLast - 24;
  }
  if (hourRange.has(h) && (h >= intervalLast || lastTime === undefined)) {
    lastTime = h;
    return true;
  } else {
    return false;
  }
}

function scheduler() {
  setInterval(() => {
    if (checkTime(new Date().getHours())) scraper();
  }, 60 * 60 * 1000); // 1h
}

// init
(async function () {
  await new Promise((resolve) => {
    setTimeout(async () => {
      await scraper();
      resolve();
    }, 10000); // 10s
  });
  scheduler();
})();
