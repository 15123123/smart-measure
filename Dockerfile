FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

ENV PORT=8080
ENV CLOUD_ENV=prod-2g2msnzi7f0f35d7
ENV TCB_ENV=prod-2g2msnzi7f0f35d7

EXPOSE 8080

CMD ["node", "app.js"]
