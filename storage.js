const aws = require("aws-sdk");
const s3 = new aws.S3({
  endpoint: process.env.S3_ENDPOINT || "",
  s3ForcePathStyle: true,
});
const fs = require("fs");

const logger = require('./logger');

const s3FileInfo = {
  Bucket: process.env.STORE_BUCKET || "",
  Key: process.env.STORE_KEY || "",
};

// S3 Functions
const loadStoredRates = (success, error) => {
  if (process.env.NODE_ENV !== "production") {
    return loadStoredRatesLocal(success, error)
  }

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
      const loadedRates = JSON.parse(data.Body.toString());
      logger.info("Previous rates found", loadedRates);
      success(loadedRates);
    }
  });
};

const loadStoredRatesLocal = (success, error) => {
  logger.info("Loading rates from file");
  fs.readFile(s3FileInfo.Key, function(err, data) {
    if(err) return error(err);
    logger.info("Read from file", JSON.parse(data.toString()));
    const loadedRates = JSON.parse(data.toString());
      logger.info("Previous rates found", loadedRates);
      success(loadedRates);
  })
}

const saveRates = (currentRates, callback) => {
  if (process.env.NODE_ENV !== "production") {
    return saveRatesLocal(currentRates, callback)
  }

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

const saveRatesLocal = (currentRates, callback) => {
  logger.info("Saving rates to file", currentRates);
  fs.writeFile(s3FileInfo.Key, JSON.stringify(currentRates), function (err) {
    if (err) return console.error(err);
    if (callback) callback();
  });
}

module.exports = {
  loadStoredRates,
  saveRates
}
