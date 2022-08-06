process.title = 'ps5-checker';
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const pptr = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { range } = require('./utils');

const intervalHours = 4;
const estimatedPriceMin = 451;
const estimatedPriceMax = 651;
const hourRange = new Set([...range(6, 23), 0]);
const sites = {
  Telia: 'https://pood.telia.ee/mangukonsoolid',
  Euronics: 'https://www.euronics.ee/meelelahutus/mangukonsoolid/playstation',
  Tele2: 'https://tele2.ee/pood/mangurile',
  Elisa: 'https://www.elisa.ee/seadmed/eraklient/konsoolid',
  Miterassa:
    'https://www.miterassa.ee/sonycenter/et/e-pood/gaming/mangukonsoolid-1/',
  Arvutitark: 'https://arvutitark.ee/est/Otsing?q=ps5&cat=83',
  bigbox: 'https://bigbox.ee/playstation-5-123456820',
  HV: 'https://www.hinnavaatlus.ee/search/?query=playstation+5&minPrice=450',
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
    console.log(new Date().toLocaleTimeString('et'));
    browser = await pptr.launch();

    await Promise.all(
      Object.entries(sites).map(async ([site, url]) => {
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
              (nodes, estimatedPriceMin) =>
                nodes.map(
                  (node) => parseFloat(node.innerText) > estimatedPriceMin,
                ),
              estimatedPriceMin,
            );
            break;
          case 'Elisa':
            products = await page.$$eval(
              '.products-list__item span[data-test-id="secondary-price"]',
              (nodes, estimatedPriceMin) =>
                nodes.map(
                  (node) => parseFloat(node.innerText) > estimatedPriceMin,
                ),
              estimatedPriceMin,
            );
            break;
          case 'Miterassa':
            products = await page.$$eval(
              '.products-list li .price span',
              (nodes, estimatedPriceMin) =>
                nodes.map(
                  (node) => parseFloat(node.innerText) > estimatedPriceMin,
                ),
              estimatedPriceMin,
            );
            break;
          case 'Arvutitark':
            products = await page.$$eval(
              '.products-list li .pricecontainer .price:not([style])',
              (nodes, estimatedPriceMax) =>
                nodes.map(
                  (node) => parseFloat(node.innerText) < estimatedPriceMax,
                ),
              estimatedPriceMax,
            );
            break;
          case 'bigbox':
            products = await page.$$eval(
              '.category-item .product-price',
              (nodes, estimatedPriceMin, estimatedPriceMax) =>
                nodes.map((node) => {
                  const price = parseFloat(node.innerText);
                  return price < estimatedPriceMax && price > estimatedPriceMin;
                }),
              estimatedPriceMin,
              estimatedPriceMax,
            );
            break;
          case 'HV':
            products = await page.$$eval(
              '.products tr:not(.head)',
              (nodes, estimatedPriceMin, estimatedPriceMax) =>
                nodes.map((node) => {
                  const price = parseFloat(
                    node.querySelector('.price.price-large').innerText,
                  );
                  const name = node
                    .querySelector('a.product-name')
                    .innerText.toLowerCase();
                  return (
                    (name.includes('playstation 5') || name.includes('ps5')) &&
                    price < estimatedPriceMax &&
                    price > estimatedPriceMin
                  );
                }),
              estimatedPriceMin,
              estimatedPriceMax,
            );
            break;
        }
        const productsBool = products.includes(true);
        if (productsBool) results.push(site);
        if (process.env.DEBUG) console.log(site, productsBool);
      }),
    );

    if (results.length) {
      results = results.join(', ');
      await execPromise(`notify-send -u critical "PS5 Leitud!!!" "${results}"`);
    } else {
      results = 'pole';
    }
    console.log(results);
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
      await scraper().catch((err) => console.error(err));
      resolve();
    }, 10000); // 10s
  });
  scheduler();
})();
