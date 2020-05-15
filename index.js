const SlackWebhook = require("slack-webhook");
const axios = require("axios");

const logger = require("./src/logger");
const { loadStoredRates, saveRates } = require("./src/storage");

const slack = new SlackWebhook(process.env.SLACK_WEBHOOK || "abc");
const tolerance = 0.01;
const interval = process.env.INTERVAL || 60 * 1000; // 1 minute

let currentRates = {};

const getDiff = (rate, currentRate) => {
  return rate / currentRate - 1;
};

const getIcon = (diff) => {
  return diff < 0 ? "⬇️" : diff === 0 ? "🆗" : "⬆️";
};

const sendToSlackChannel = (msg) => {
  logger.info(`Sending message to Slack: ${msg}`);
  if (process.env.NODE_ENV === "production") {
    slack.send(msg);
  } else {
    logger.info(msg);
  }
};

const mapRates = (_rates) =>
  _rates.reduce((rates, rate) => {
    const { compra, venta } = rate;
    rates[rate.key] = {
      compra,
      venta,
    };
    return rates;
  }, {});

const updateRate = (rates) => {
  logger.info("Updating rates");
  let areAnyChanges = false;
  rates.forEach((rate) => {
    const currentRate = currentRates[rate.key];
    const diffventa = getDiff(rate.venta, currentRate.venta);
    const diffcompra = getDiff(rate.compra, currentRate.compra);
    if (Math.abs(diffventa) >= tolerance || Math.abs(diffcompra) >= tolerance) {
      areAnyChanges = true;
      const msg = `*${rate.name}:* Compra: ${getIcon(diffcompra)} 1 USD = *${
        rate.compra
      } ARS* - Venta: ${getIcon(diffventa)} 1 USD = *${rate.venta} ARS*`;
      sendToSlackChannel(msg);
    }
  });
  currentRates = mapRates(rates);

  if (areAnyChanges)
    return new Promise(function (success) {
      saveRates(currentRates, success);
    });
  else
    logger.info(
      "All rates are the same. S3 not updated. No messages sent to Slack"
    );
};

const rateMap = [
  {
    key: "bna",
    name: "BNA",
    id: 1,
  },
  {
    key: "blue",
    name: "Blue",
    id: 2,
  },
  {
    key: "contado_c_liqui",
    name: "Contado c/Liqui",
    id: 5,
  },
];

const getRates = () =>
  axios({
    url:
      "https://www.cronista.com/MercadosOnline/json/getValoresCalculadora.html",
    method: "get",
  }).then((response) => {
    return rateMap.map((r) => {
      const cotizacion = response.data.find((item) => item.Id === r.id);
      const compra = +cotizacion.Compra;
      const venta = +cotizacion.Venta;
      return {
        ...r,
        compra,
        venta,
      };
    });
  });

const setInitialRate = () => {
  return getRates().then((rates) => {
    currentRates = mapRates(rates);
    logger.info("Initial rates", currentRates);
    return new Promise(function (success) {
      saveRates(currentRates, success);
    });
  });
};

const loop = () => {
  let promise = new Promise(function (complete, failed) {
    loadStoredRates(
      (loadedRates) => {
        currentRates = loadedRates;
        logger.info("Loaded initial rates");
        getRates().then(updateRate);
      },
      () => {
        logger.info("No initial rates");
        setInitialRate();
      }
    );
  });
  return promise;
};

logger.info(`Starting interval loop: ${interval}`);
loop();
setInterval(() => {
  loop();
}, interval);
