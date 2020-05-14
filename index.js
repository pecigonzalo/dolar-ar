const pino = require("pino");
const logger = pino({
  prettyPrint: {
    translateTime: true,
    colorize: true,
    ignore: "pid,hostname",
  },
});
const aws = require("aws-sdk");
const env = require("dotenv").config();
const SlackWebhook = require("slack-webhook");
const axios = require("axios");

const slack = new SlackWebhook(process.env.SLACK_WEBHOOK || "abc");
const tolerance = 0.001;
const interval = process.env.INTERVAL || 60 * 1000; // 1 minute
const s3 = new aws.S3({
  endpoint: process.env.S3_ENDPOINT || "",
  s3ForcePathStyle: true,
});

const s3FileInfo = {
  Bucket: process.env.STORE_BUCKET || "",
  Key: process.env.STORE_KEY || "",
};

let currentRates = {};

// S3 Functions
const loadStoredRates = (success, error) => {
  logger.info("Loading rates from S3");
  s3.getObject(s3FileInfo, function (err, data) {
    if (err) {
      // TODO: handle this a bit better
      if (err.code === "NoSuchBucket") {
        logger.warn("Bucket not found, creating");
        let bucketParams = {
          Bucket: s3FileInfo.Bucket,
        };
        s3.createBucket(bucketParams, function (err, data) {
          if (err) {
            logger.error("Error", err);
          } else {
            logger.info("Created: ", data.Location);
            loadStoredRates();
          }
          error();
        });
      } else {
        logger.error("Error. Probably no initial rates found...", err);
        error();
      }
    } else {
      currentRates = JSON.parse(data.Body.toString());
      logger.info("Previous rates found", currentRates);
      success();
    }
  });
};

const saveRates = (callback) => {
  logger.info("Saving rates to S3", currentRates);
  s3.putObject(
    {
      Bucket: s3FileInfo.Bucket,
      Key: s3FileInfo.Key,
      Body: JSON.stringify(currentRates),
      ContentType: "application/json",
    },
    function (error, response) {
      if (error) console.error(error);
      else logger.info("Saved rates to S3");
      if (callback) callback();
    }
  );
};

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
      saveRates(success);
    });
  else
    logger.info(
      "All rates are the same. S3 not updated. No messages sent to Slack"
    );
};

const getCronistaBNRate = (url) =>
  axios({
    url: "https://www.cronista.com/MercadosOnline/json/eccheader.json",
    method: "get",
  }).then((response) => {
    const compra = +response.data.dolarbna.valorcompra;
    const venta = +response.data.dolarbna.valorventa;
    return {
      compra,
      venta,
    };
  });

const getCronistaBalanzRate = () =>
  axios({
    url: "https://www.cronista.com/_static_rankings/static_dolarbalanz.html",
    method: "get",
  }).then((response) => {
    const compra = +response.data.Cotizacion.PrecioCompra;
    const venta = +response.data.Cotizacion.PrecioVenta;
    return {
      compra,
      venta,
    };
  });

const getCronistaBlueRate = () =>
  axios({
    url:
      "https://www.cronista.com/MercadosOnline/json/getValoresCalculadora.html",
    method: "get",
  }).then((response) => {
    const blue = response.data.find((item) => item.Id === 2);
    const compra = +blue.Compra;
    const venta = +blue.Venta;
    return {
      compra,
      venta,
    };
  });

const rateMap = [
  {
    key: "bna",
    name: "BNA",
    resolver: getCronistaBNRate,
  },
  {
    key: "balanz",
    name: "Balanz",
    resolver: getCronistaBalanzRate,
  },
  {
    key: "blue",
    name: "Blue",
    resolver: getCronistaBlueRate,
  },
];

const getRates = () =>
  Promise.all(
    rateMap.map((r) =>
      r.resolver().then((rate) => ({
        ...rate,
        key: r.key,
        name: r.name,
      }))
    )
  );

const setInitialRate = () => {
  return getRates().then((rates) => {
    currentRates = mapRates(rates);
    logger.info("Inital rates", currentRates);
    return new Promise(function (success) {
      saveRates(success);
    });
  });
};

const loop = () => {
  let promise = new Promise(function (complete, failed) {
    loadStoredRates(
      () => {
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
