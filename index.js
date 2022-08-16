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

        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(15000); // 15s

        try {
          let selector;
          switch (site) {
            case 'Telia':
              selector = '.product-card__title-name';
              await page.waitForSelector(selector);
              products = await page.$$eval(selector, (nodes) =>
                nodes.map((node) =>
                  node.innerText.toLowerCase().includes('playstation'),
                ),
              );
              break;
            case 'Euronics':
              selector = '.product-card__list article';
              await Promise.race([
                page.waitForSelector('body > div:not([class])'),
                page.waitForSelector(selector),
              ]);
              products = await page.$$eval(selector, (nodes) =>
                nodes.map((node) =>
                  node
                    .getAttribute('data-product-name')
                    .toLowerCase()
                    .includes('playstation'),
                ),
              );
              break;
            case 'Tele2':
              selector = '.catalog-item div[data-test="fullPrice"]';
              await page.waitForSelector(selector);
              products = await page.$$eval(
                selector,
                (nodes, estimatedPriceMin) =>
                  nodes.map(
                    (node) => parseFloat(node.innerText) > estimatedPriceMin,
                  ),
                estimatedPriceMin,
              );
              break;
            case 'Elisa':
              selector =
                '.products-list__item span[data-test-id="secondary-price"]';
              await page.waitForSelector(selector);
              products = await page.$$eval(
                selector,
                (nodes, estimatedPriceMin) =>
                  nodes.map(
                    (node) => parseFloat(node.innerText) > estimatedPriceMin,
                  ),
                estimatedPriceMin,
              );
              break;
            case 'Miterassa':
              selector = '.products-list li .price span';
              await page.waitForSelector(selector);
              products = await page.$$eval(
                selector,
                (nodes, estimatedPriceMin) =>
                  nodes.map(
                    (node) => parseFloat(node.innerText) > estimatedPriceMin,
                  ),
                estimatedPriceMin,
              );
              break;
            case 'Arvutitark':
              selector =
                '.products-list li .pricecontainer .price:not([style])';
              await page.waitForSelector(selector);
              products = await page.$$eval(
                selector,
                (nodes, estimatedPriceMin, estimatedPriceMax) =>
                  nodes.map((node) => {
                    const price = parseFloat(node.innerText);
                    return (
                      price > estimatedPriceMin && price < estimatedPriceMax
                    );
                  }),
                estimatedPriceMin,
                estimatedPriceMax,
              );
              break;
            case 'bigbox':
              selector = '.category-item .product-price';
              await page.waitForSelector(selector);
              products = await page.$$eval(
                selector,
                (nodes, estimatedPriceMin, estimatedPriceMax) =>
                  nodes.map((node) => {
                    const price = parseFloat(node.innerText);
                    return (
                      price < estimatedPriceMax && price > estimatedPriceMin
                    );
                  }),
                estimatedPriceMin,
                estimatedPriceMax,
              );
              break;
            case 'HV':
              selector = '.products tr:not(.head)';
              await page.waitForSelector(selector);
              products = await page.$$eval(
                selector,
                (nodes, estimatedPriceMin, estimatedPriceMax) =>
                  nodes.map((node) => {
                    const price = parseFloat(
                      node.querySelector('.price.price-large').innerText,
                    );
                    const name = node
                      .querySelector('a.product-name')
                      .innerText.toLowerCase();
                    return (
                      (name.includes('playstation 5') ||
                        name.includes('ps5')) &&
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

          // debug
          if (process.env.DEBUG) console.log(site, productsBool);
        } catch (err) {
          console.error(site, err);
          await page.screenshot({
            path: `${__dirname}/pildid/${site}_${Date.now()}.png`,
          });
        }
      }),
    );

    if (results.length) {
      results = `leitud: ${results.join(', ')}`;
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
function checkTime() {
  let intervalLast = lastTime + intervalHours * 60 * 60 * 1000;

  const nowDate = new Date();
  const now = nowDate.getTime();
  if (
    hourRange.has(nowDate.getHours()) &&
    (now >= intervalLast || lastTime === undefined)
  ) {
    lastTime = now;
    return true;
  } else {
    return false;
  }
}

function scheduler() {
  console.log('starting interval...');
  setInterval(() => {
    if (checkTime(new Date().getHours(), lastTime)) scraper();
  }, 15 * 60 * 1000); // 15min
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
