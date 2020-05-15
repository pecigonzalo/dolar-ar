FROM node:14-alpine

ENV NODE_ENV production
ENV BACKEND s3

WORKDIR /usr/src/app

COPY ["package.json", "yarn.lock", "./"]

RUN yarn install --production

COPY src/ ./src
COPY index.js ./

CMD yarn start
