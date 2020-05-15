const pino = require("pino");
const logger = pino({
  prettyPrint: {
    translateTime: true,
    colorize: true,
    ignore: "pid,hostname",
  },
});

module.exports = logger
