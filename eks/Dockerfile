FROM node:current-slim

WORKDIR /usr/analytics/dist
COPY . .
RUN npm install

CMD [ "node", "index.js" ]